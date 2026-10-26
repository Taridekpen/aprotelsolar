import { DEFAULT_DOD_BY_CHEMISTRY } from './assumptions.js';
import { usableBatteryWh } from './battery.js';
import { configurationAllows, planString, voltagesMatch } from './compatibility.js';
import { nominalBatteryWh } from './battery.js';
import { requiredArrayW } from './pv.js';
import type { CatalogueItem, RecommendedProduct, SystemConfiguration } from './types.js';
import { solarRuntime, requirementRuntime } from './runtime.js';

type Need = {
  dayWh: number;
  nightWh: number;
  deliveredWh: number;
  peakW: number;
  surgeW: number;
  requiredContinuousW: number;
  requiredSurgeW: number;
  requiredVa: number;
  backupHours: number;
  dailyWh: number;
  peakSunHours: number;
  worstSunHours: number;
  annualSunHours: number;
  directFactor: number;
  gridTied: boolean;
  mode: 'budget' | 'runtime' | 'independence';
};

type Inverter = {
  item: CatalogueItem;
  continuousW: number;
  va: number | null;
  surgeW: number | null;
  batteryVoltage: number;
  efficiency: number;
  mpptMin: number | null;
  mpptMax: number | null;
  maxPvV: number | null;
  maxPvA: number | null;
  batteryTypes: string[];
  grid: string;
};

type Battery = {
  item: CatalogueItem;
  chemistry: string;
  voltage: number;
  nominalWh: number;
  dod: number;
  dischargeA: number;
  supported: string[];
};

type Panel = {
  item: CatalogueItem;
  ratedW: number;
  voc: number;
  vmp: number;
  isc: number;
  imp: number;
  tempCoeffVoc: number;
};

export type BuiltSystem = {
  products: RecommendedProduct[];
  inverterContinuousW: number;
  batteryNominalWh: number;
  batteryUsableWh: number;
  pvArrayW: number;
  panelCount: number;
  seriesCount: number | null;
  parallelCount: number | null;
  equipmentCostNaira: number;
  reasons: string[];
  warnings: string[];
  headroom: number;
};

export function buildCandidates(catalogue: CatalogueItem[], need: Need): BuiltSystem[] {
  const inverters = catalogue.map(readInverter).filter((item): item is Inverter => item != null);
  const batteries = catalogue.map(readBattery).filter((item): item is Battery => item != null);
  const panels = catalogue.map(readPanel).filter((item): item is Panel => item != null);
  const systems: BuiltSystem[] = [];

  for (const inverter of inverters) {
    if (!gridAccepts(inverter.grid, need)) continue;
    if (inverter.continuousW + 0.5 < need.requiredContinuousW) continue;
    if (inverter.va != null && inverter.va + 0.5 < need.requiredVa) continue;
    const surgeWarning = inverter.surgeW == null;
    if (inverter.surgeW != null && inverter.surgeW + 0.5 < need.requiredSurgeW) continue;
    const electrical = inverter.mpptMin != null && inverter.mpptMax != null && inverter.maxPvV != null && inverter.maxPvA != null;
    if (!electrical) continue;

    for (const battery of batteries) {
      if (!inverter.batteryTypes.map((entry) => entry.toLowerCase()).includes(battery.chemistry.toLowerCase())) continue;
      const arrangements = batteryArrangements(battery, inverter, need);
      for (const arrangement of arrangements) {
        const arrayW = requiredArrayW(need.dayWh, need.nightWh, need.peakSunHours, inverter.efficiency);
        for (const panel of panels) {
          const available = stock(panel.item);
          const plan = planString({
            requiredArrayW: arrayW,
            ratedWattageW: panel.ratedW,
            voc: panel.voc,
            vmp: panel.vmp,
            isc: panel.isc,
            tempCoeffVocPctPerC: panel.tempCoeffVoc,
            mpptMinV: inverter.mpptMin!,
            mpptMaxV: inverter.mpptMax!,
            maxPvVoltage: inverter.maxPvV!,
            maxPvInputCurrentA: inverter.maxPvA!,
          });
          if (!plan.ok || plan.panelCount > available) continue;
          const products = [
            productLine(inverter.item, 'inverter', 1, `Continuous rating ${inverter.continuousW} W covers the ${Math.round(need.requiredContinuousW)} W requirement. ${inverter.va == null ? 'No VA rating is published.' : `The ${inverter.va} VA rating covers ${Math.round(need.requiredVa)} VA at the stated power factor.`}`),
            productLine(battery.item, 'battery', arrangement.quantity, `The bank provides about ${(arrangement.nominalWh / 1000).toFixed(2)} kWh nominal. Usable energy under the stated depth of discharge, losses, and aging allowance is about ${(arrangement.usableWh / 1000).toFixed(2)} kWh.`),
            productLine(panel.item, 'solar_panel', plan.panelCount, `${plan.panelCount} modules in ${plan.series} series by ${plan.parallel} parallel stay inside the cold open-circuit voltage and MPPT window. Wattage alone was not used to accept the string.`),
          ];
          const warnings = [...arrangement.warnings];
          if (surgeWarning) warnings.push('The inverter has no published surge rating, so startup current was not confirmed.');
          warnings.push('String voltage is a planning check. Protection devices, cable sizing, and earthing must be designed by a qualified installer.');
          systems.push({
            products,
            inverterContinuousW: inverter.continuousW,
            batteryNominalWh: arrangement.nominalWh,
            batteryUsableWh: arrangement.usableWh,
            pvArrayW: plan.panelCount * panel.ratedW,
            panelCount: plan.panelCount,
            seriesCount: plan.series,
            parallelCount: plan.parallel,
            equipmentCostNaira: products.reduce((sum, line) => sum + line.lineTotalNaira, 0),
            reasons: products.map((line) => line.reason),
            warnings,
            headroom: inverter.continuousW / Math.max(need.requiredContinuousW, 1) - 1,
          });
        }
      }
    }
  }
  return dedupe(systems);
}

export function labelConfigurations(systems: BuiltSystem[], need: Need, covers: SystemConfiguration['covers'], omitted: string[]): SystemConfiguration[] {
  if (!systems.length) return [];
  const byCost = [...systems].sort((a, b) => a.equipmentCostNaira - b.equipmentCostNaira || a.batteryNominalWh - b.batteryNominalWh);
  const lower = byCost[0]!;
  const roomy = byCost.find((system) => system.headroom >= 0.15 && system.batteryUsableWh >= need.deliveredWh * 1.15);
  const higher = [...systems].sort((a, b) => b.batteryNominalWh - a.batteryNominalWh || b.pvArrayW - a.pvArrayW)[0]!;
  const chosen: Array<[SystemConfiguration['id'], string, BuiltSystem]> = [['lower_cost', 'Lower-cost valid system', lower]];
  if (roomy && signature(roomy) !== signature(lower)) chosen.push(['balanced', 'Balanced reserve', roomy]);
  if (signature(higher) !== signature(lower) && (!roomy || signature(higher) !== signature(roomy))) chosen.push(['higher_capacity', 'Higher stored energy', higher]);
  return chosen.map(([id, label, system]) => toConfiguration(id, label, system, need, covers, omitted));
}

function toConfiguration(id: SystemConfiguration['id'], label: string, system: BuiltSystem, need: Need, covers: SystemConfiguration['covers'], omitted: string[]): SystemConfiguration {
  const blackout = requirementRuntime(system.batteryUsableWh, need.deliveredWh / Math.max(need.backupHours, 0.5), need.backupHours, need.dailyWh);
  const solar = solarRuntime(system.pvArrayW, need.annualSunHours, need.worstSunHours, need.directFactor, need.dayWh);
  return {
    id,
    label,
    covers,
    omittedAppliances: omitted,
    products: system.products,
    inverterContinuousW: system.inverterContinuousW,
    batteryNominalWh: system.batteryNominalWh,
    batteryUsableWh: system.batteryUsableWh,
    pvArrayW: system.pvArrayW,
    panelCount: system.panelCount,
    seriesCount: system.seriesCount,
    parallelCount: system.parallelCount,
    equipmentCostNaira: system.equipmentCostNaira,
    runtime: [...blackout, solar],
    reasons: system.reasons,
    warnings: system.warnings,
  };
}

function batteryArrangements(battery: Battery, inverter: Inverter, need: Need) {
  const seriesChoices = configurationAllows(battery.supported, 'series') ? [1, 2, 3, 4] : [1];
  const parallelChoices = configurationAllows(battery.supported, 'parallel') ? [1, 2, 3, 4, 5, 6, 7, 8] : [1];
  const available = stock(battery.item);
  const fits: Array<{ quantity: number; nominalWh: number; usableWh: number; warnings: string[] }> = [];
  for (const series of seriesChoices) {
    if (!voltagesMatch(battery.voltage, series, inverter.batteryVoltage)) continue;
    for (const parallel of parallelChoices) {
      const quantity = series * parallel;
      if (quantity > available) continue;
      const nominalWh = battery.nominalWh * quantity;
      const usable = usableBatteryWh(nominalWh, battery.dod, inverter.efficiency);
      const required = nominalBatteryWh(need.deliveredWh, battery.dod, inverter.efficiency);
      if (nominalWh + 1 < required) continue;
      const bankV = battery.voltage * series;
      const amps = need.requiredContinuousW / (bankV * inverter.efficiency);
      if (amps > battery.dischargeA * parallel) continue;
      const warnings: string[] = [];
      if (series > 1 || parallel > 1) warnings.push('Series or parallel use is included only because the product record allows that arrangement. Matching capacity alone is not treated as permission to combine batteries.');
      fits.push({ quantity, nominalWh, usableWh: usable, warnings });
    }
  }
  fits.sort((a, b) => a.quantity - b.quantity || a.nominalWh - b.nominalWh);
  if (!fits.length) return [];
  const larger = fits.find((fit) => fit.quantity > fits[0]!.quantity);
  return larger ? [fits[0]!, larger] : [fits[0]!];
}

function gridAccepts(grid: string, need: Need) {
  const value = grid.toLowerCase();
  if (need.mode === 'independence' || need.gridTied === false) return value === 'off_grid' || value === 'hybrid';
  return value === 'hybrid' || value === 'grid_tie' || value === 'off_grid';
}

function readInverter(item: CatalogueItem): Inverter | null {
  if (!usable(item) || item.profile !== 'inverter') return null;
  const continuousW = numberAt(item.specifications, 'ratedContinuousPowerW');
  const batteryVoltage = numberAt(item.specifications, 'batteryVoltage');
  const efficiency = numberAt(item.specifications, 'efficiencyPercent');
  const grid = stringAt(item.specifications, 'gridCompatibility');
  const batteryTypes = listAt(item.specifications, 'supportedBatteryTypes');
  if (continuousW == null || batteryVoltage == null || efficiency == null || !grid || !batteryTypes.length) return null;
  return {
    item,
    continuousW,
    va: numberAt(item.specifications, 'vaRating'),
    surgeW: numberAt(item.specifications, 'surgeRatingW'),
    batteryVoltage,
    efficiency: efficiency / 100,
    mpptMin: numberAt(item.specifications, 'mpptMinV'),
    mpptMax: numberAt(item.specifications, 'mpptMaxV'),
    maxPvV: numberAt(item.specifications, 'maxPvVoltage'),
    maxPvA: numberAt(item.specifications, 'maxPvInputCurrentA'),
    batteryTypes,
    grid,
  };
}

function readBattery(item: CatalogueItem): Battery | null {
  if (!usable(item) || item.profile !== 'battery') return null;
  const chemistry = stringAt(item.specifications, 'chemistry');
  const voltage = numberAt(item.specifications, 'nominalVoltage');
  const kwh = numberAt(item.specifications, 'nominalKwh');
  const ampHours = numberAt(item.specifications, 'ampHours');
  const dod = numberAt(item.specifications, 'usableDodPercent');
  const dischargeA = numberAt(item.specifications, 'continuousDischargeCurrentA');
  if (!chemistry || voltage == null || dod == null || dischargeA == null) return null;
  const nominalWh = kwh != null ? kwh * 1000 : ampHours != null ? voltage * ampHours : null;
  if (nominalWh == null) return null;
  const fallback = DEFAULT_DOD_BY_CHEMISTRY[chemistry] ?? 0.5;
  return {
    item,
    chemistry,
    voltage,
    nominalWh,
    dod: Math.min(dod / 100, fallback + 0.05),
    dischargeA,
    supported: listAt(item.specifications, 'supportedConfigurations'),
  };
}

function readPanel(item: CatalogueItem): Panel | null {
  if (!usable(item) || item.profile !== 'solar_panel') return null;
  const ratedW = numberAt(item.specifications, 'ratedWattageW');
  const voc = numberAt(item.specifications, 'voc');
  const vmp = numberAt(item.specifications, 'vmp');
  const isc = numberAt(item.specifications, 'isc');
  const imp = numberAt(item.specifications, 'imp');
  const tempCoeffVoc = numberAt(item.specifications, 'tempCoeffVocPctPerC');
  if (ratedW == null || voc == null || vmp == null || isc == null || imp == null || tempCoeffVoc == null) return null;
  return { item, ratedW, voc, vmp, isc, imp, tempCoeffVoc };
}

const UNTRACKED_QUANTITY = 99;

function usable(item: CatalogueItem) {
  return item.sellingPriceNaira > 0;
}

function stock(item: CatalogueItem) {
  const branchStock = item.branches?.length ? item.branches.reduce((sum, branch) => sum + Math.max(0, branch.available), 0) : item.inventoryQuantity;
  const recorded = item.branches?.length ? Math.min(item.inventoryQuantity, branchStock) : item.inventoryQuantity;
  return recorded > 0 ? recorded : UNTRACKED_QUANTITY;
}

function productLine(item: CatalogueItem, role: RecommendedProduct['role'], quantity: number, reason: string): RecommendedProduct {
  return {
    role,
    id: item.id,
    slug: item.slug,
    name: item.name,
    sku: item.sku,
    brand: item.brand,
    quantity,
    unitPriceNaira: item.sellingPriceNaira,
    lineTotalNaira: item.sellingPriceNaira * quantity,
    warranty: item.warranty,
    imageId: item.imageId ?? null,
    reason,
  };
}

function signature(system: BuiltSystem) {
  return system.products.map((line) => `${line.id}:${line.quantity}`).join('|');
}

function dedupe(systems: BuiltSystem[]) {
  const seen = new Set<string>();
  return systems.filter((system) => {
    const key = signature(system);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function numberAt(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringAt(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function listAt(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : [];
}
