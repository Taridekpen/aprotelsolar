import {
  BATTERY_DISCHARGE_EFFICIENCY,
  DEFAULT_BACKUP_HOURS,
  DEFAULT_DOD_BY_CHEMISTRY,
  DEFAULT_INVERTER_EFFICIENCY,
  DEFAULT_INVERTER_SAFETY_MARGIN,
  DEFAULT_POWER_FACTOR,
  END_OF_LIFE_CAPACITY_FRACTION,
  RESERVE_FRACTION,
  SPF_DIRECT,
  clamp,
} from './assumptions.js';
import { nominalBatteryWh } from './battery.js';
import { inverterRequirement } from './inverter.js';
import { summariseLoad } from './load.js';
import { performanceFactors, requiredArrayW } from './pv.js';
import { requirementRuntime, solarRuntime } from './runtime.js';
import type { ApplianceInput, CalculateInput, RecommendInput } from './schema.js';
import { buildDay, energyInWindow, prepareAppliance, type PreparedAppliance } from './schedule.js';
import { buildCandidates, labelConfigurations, type BuiltSystem } from './selection.js';
import { solarResourceFor } from './solar-resource.js';
import type { CatalogueItem, EngineOptions, SolarDesign, SystemConfiguration } from './types.js';

type Mode = SolarDesign['mode'];

export function buildDesign(input: CalculateInput | RecommendInput, catalogue: CatalogueItem[] = [], options: EngineOptions = {}): SolarDesign {
  const preferences = 'preferences' in input ? input.preferences : undefined;
  const mode = resolveMode(input);
  const safety = clamp(options.safetyMarginFraction ?? DEFAULT_INVERTER_SAFETY_MARGIN, 0.1, 0.5);
  const powerFactor = clamp(preferences?.powerFactor ?? DEFAULT_POWER_FACTOR, 0.5, 1);
  const backupHours = Math.min(72, preferences?.backupHours ?? (input.autonomyDays ? input.autonomyDays * 24 : DEFAULT_BACKUP_HOURS));
  const autonomyDays = input.autonomyDays ?? backupHours / 24;
  const resource = solarResourceFor(input.location?.state, input.location?.peakSunHours, options.fallbackPeakSunHours ?? 4);
  const sizingSun = mode === 'independence' ? resource.worstMonthPeakSunHours : resource.annualPeakSunHours;
  const genericDod = clamp(options.genericDod ?? DEFAULT_DOD_BY_CHEMISTRY.lithium_iron_phosphate ?? 0.8, 0.4, 0.9);
  const gridTied = mode === 'independence' ? false : preferences?.gridTied !== false;

  const full = size(input.appliances, {
    mode,
    backupHours,
    autonomyDays,
    sizingSun,
    resource,
    safety,
    powerFactor,
    genericDod,
    gridTied,
    catalogue,
    criticalOnly: input.appliances.some((appliance) => appliance.critical),
  });

  let recommendations = full.configurations;
  let unmet: SolarDesign['unmet'] = null;
  const budget = preferences?.budgetNaira;
  if (budget) {
    const affordable = recommendations.filter((configuration) => configuration.equipmentCostNaira <= budget);
    if (affordable.length) {
      recommendations = affordable;
    } else {
      const reduced = reduceForBudget(input.appliances, budget, {
        mode,
        backupHours,
        autonomyDays,
        sizingSun,
        resource,
        safety,
        powerFactor,
        genericDod,
        gridTied,
        catalogue,
      });
      if (reduced.configurations.length) {
        recommendations = reduced.configurations.map((configuration) => ({ ...configuration, id: 'budget_reduced' as const, label: 'Within budget after removing noncritical loads' }));
      } else {
        recommendations = [];
        unmet = {
          message: full.configurations.length
            ? `The lowest technically valid equipment total is ₦${Math.round(full.configurations[0]!.equipmentCostNaira).toLocaleString('en-NG')}, which is above the stated budget. No smaller compatible set was published.`
            : 'No verified, in-stock, electrically compatible equipment set is published for this load.',
          equipmentCostNaira: full.configurations[0]?.equipmentCostNaira ?? null,
        };
      }
    }
  } else if (!recommendations.length) {
    unmet = {
      message: 'No verified in-stock inverter, battery, and solar panel combination satisfies the electrical checks. The wattage and energy figures are still calculated. Missing equipment is not invented.',
      equipmentCostNaira: null,
    };
  }

  const selected = recommendations.find((configuration) => configuration.id === 'balanced') ?? recommendations[0] ?? null;
  const alternatives = recommendations.filter((configuration) => configuration !== selected);
  const factors = performanceFactors();
  const narrative = narrativeFor(full.designBase, selected, mode);
  return {
    ...full.designBase,
    recommendations,
    selected,
    alternatives,
    unmet,
    cost: costFor(selected),
    pv: { ...full.designBase.pv, performanceFactorDirect: factors.direct, performanceFactorStored: factors.stored },
    narrative,
  };
}

type SizeContext = {
  mode: Mode;
  backupHours: number;
  autonomyDays: number;
  sizingSun: number;
  resource: ReturnType<typeof solarResourceFor>;
  safety: number;
  powerFactor: number;
  genericDod: number;
  gridTied: boolean;
  catalogue: CatalogueItem[];
  criticalOnly?: boolean;
};

function size(appliances: ApplianceInput[], context: SizeContext) {
  const prepared = appliances.map(prepareAppliance);
  const day = buildDay(prepared);
  const criticalOnly = context.criticalOnly ?? prepared.some((appliance) => appliance.critical);
  const windowEnergy = energyInWindow(day, 18, Math.min(context.backupHours, 24), criticalOnly);
  const dailyCovered = day.reduce((sum, slot) => sum + (criticalOnly ? slot.criticalEnergyWh : slot.energyWh), 0);
  const windowDelivered = context.backupHours > 24 ? windowEnergy * (context.backupHours / 24) : windowEnergy;
  const delivered = context.mode === 'independence' ? Math.max(dailyCovered * context.autonomyDays, windowDelivered) : windowDelivered;
  const load = summariseLoad(prepared, day, delivered, context.backupHours);
  const coveredDay = day.filter((slot) => slot.hour >= 7 && slot.hour <= 17).reduce((sum, slot) => sum + (criticalOnly ? slot.criticalEnergyWh : slot.energyWh), 0);
  const coveredNight = (criticalOnly ? load.criticalEnergyWh : load.dailyEnergyWh) - coveredDay;
  const batteryNominal = nominalBatteryWh(delivered, context.genericDod);
  const inverter = inverterRequirement(load.peakSimultaneousW, load.surgeDemandW, context.powerFactor, context.safety);
  const arrayW = requiredArrayW(coveredDay, Math.max(0, coveredNight), context.sizingSun);
  const factors = performanceFactors();
  const usableEstimate = delivered * (1 + RESERVE_FRACTION);
  const runtime = [
    ...requirementRuntime(usableEstimate, load.averageBackupW, context.backupHours, load.dailyEnergyWh),
    solarRuntime(arrayW, context.resource.annualPeakSunHours, context.resource.worstMonthPeakSunHours, factors.direct, coveredDay),
  ];
  const configurations = labelConfigurations(
    buildCandidates(context.catalogue, {
      dayWh: coveredDay,
      nightWh: Math.max(0, coveredNight),
      deliveredWh: delivered,
      peakW: load.peakSimultaneousW,
      surgeW: load.surgeDemandW,
      requiredContinuousW: inverter.requiredContinuousW,
      requiredSurgeW: inverter.requiredSurgeW,
      requiredVa: inverter.requiredVa,
      backupHours: context.backupHours,
      dailyWh: load.dailyEnergyWh,
      peakSunHours: context.sizingSun,
      worstSunHours: context.resource.worstMonthPeakSunHours,
      annualSunHours: context.resource.annualPeakSunHours,
      directFactor: factors.direct,
      gridTied: context.gridTied,
      mode: context.mode,
    }),
    {
      dayWh: coveredDay,
      nightWh: Math.max(0, coveredNight),
      deliveredWh: delivered,
      peakW: load.peakSimultaneousW,
      surgeW: load.surgeDemandW,
      requiredContinuousW: inverter.requiredContinuousW,
      requiredSurgeW: inverter.requiredSurgeW,
      requiredVa: inverter.requiredVa,
      backupHours: context.backupHours,
      dailyWh: load.dailyEnergyWh,
      peakSunHours: context.sizingSun,
      worstSunHours: context.resource.worstMonthPeakSunHours,
      annualSunHours: context.resource.annualPeakSunHours,
      directFactor: factors.direct,
      gridTied: context.gridTied,
      mode: context.mode,
    },
    'full_load',
    [],
  );
  const assumptions = assumptionList(prepared, context, criticalOnly);
  const warnings = warningList(prepared, context);
  const designBase: Omit<SolarDesign, 'recommendations' | 'selected' | 'alternatives' | 'unmet' | 'cost' | 'narrative'> = {
    mode: context.mode,
    load,
    battery: {
      deliveredEnergyWh: delivered,
      nominalEnergyWh: batteryNominal,
      depthOfDischarge: context.genericDod,
      inverterEfficiency: DEFAULT_INVERTER_EFFICIENCY,
      dischargeEfficiency: BATTERY_DISCHARGE_EFFICIENCY,
      reserveFraction: RESERVE_FRACTION,
      endOfLifeFraction: END_OF_LIFE_CAPACITY_FRACTION,
      backupHours: context.backupHours,
      autonomyDays: context.autonomyDays,
    },
    inverter,
    pv: {
      requiredArrayW: arrayW,
      annualPeakSunHours: context.resource.annualPeakSunHours,
      sizingPeakSunHours: context.sizingSun,
      worstMonthPeakSunHours: context.resource.worstMonthPeakSunHours,
      solarResource: context.resource.source,
      performanceFactorDirect: SPF_DIRECT,
      performanceFactorStored: factors.stored,
    },
    runtime,
    assumptions,
    warnings,
    engineeringApprovalRequired: true,
  };
  return { designBase, configurations, prepared };
}

function reduceForBudget(appliances: ApplianceInput[], budget: number, context: Omit<SizeContext, 'criticalOnly' | 'catalogue'> & { catalogue: CatalogueItem[] }) {
  const noncritical = [...appliances].filter((appliance) => !appliance.critical).sort((a, b) => b.wattage * b.quantity * b.hoursPerDay - a.wattage * a.quantity * a.hoursPerDay);
  let remaining = [...appliances];
  const omitted: string[] = [];
  for (const appliance of noncritical) {
    remaining = remaining.filter((item) => item !== appliance);
    omitted.push(appliance.name);
    if (!remaining.length) break;
    const sized = size(remaining, { ...context, criticalOnly: remaining.some((item) => item.critical) });
    const affordable = sized.configurations.filter((configuration) => configuration.equipmentCostNaira <= budget);
    if (affordable.length) {
      return { configurations: affordable.map((configuration) => ({ ...configuration, covers: 'reduced_load' as const, omittedAppliances: [...omitted] })) };
    }
  }
  return { configurations: [] as SystemConfiguration[] };
}

function resolveMode(input: CalculateInput | RecommendInput): Mode {
  const preferences = 'preferences' in input ? input.preferences : undefined;
  if (preferences?.mode) return preferences.mode;
  if (preferences?.gridTied === false) return 'independence';
  if (preferences?.budgetNaira && !preferences.backupHours && input.autonomyDays == null) return 'budget';
  return 'runtime';
}

function costFor(selected: SystemConfiguration | null): SolarDesign['cost'] {
  return {
    equipmentNaira: selected?.equipmentCostNaira ?? null,
    accessoriesNaira: null,
    installationNaira: null,
    deliveryNaira: null,
    taxNaira: null,
    totalNaira: selected?.equipmentCostNaira ?? null,
    provisional: true,
    note: 'This is the published equipment total only. Accessories, installation, delivery, and tax are omitted until a quotation prices them. It is not an approved installation price.',
  };
}

function assumptionList(appliances: PreparedAppliance[], context: SizeContext, criticalOnly: boolean) {
  return [
    { id: 'schedule', text: appliances.some((appliance) => appliance.scheduleSource === 'evening_first_assumption') ? 'Where daytime and nighttime hours were not both supplied, operating hours are placed from 18:00 forward. That is a conservative backup assumption, not the customer’s actual timetable.' : 'Daytime hours are placed from 07:00 and nighttime hours from 18:00.' },
    { id: 'duty', text: 'Energy uses watts × quantity × hours × duty cycle. Peak power uses the running watts whenever the appliance is scheduled on. A duty cycle does not reduce the nameplate peak.' },
    { id: 'surge', text: 'Only one appliance is assumed to start at a time. Appliances marked as not simultaneous are kept out of the coincident running load.' },
    { id: 'battery', text: `Nominal battery energy = delivered backup energy × ${1 + RESERVE_FRACTION} / (depth of discharge × inverter efficiency × battery discharge efficiency × ${END_OF_LIFE_CAPACITY_FRACTION} end-of-life fraction). The reserve and the aging allowance are applied once each.` },
    { id: 'critical', text: criticalOnly ? 'Battery energy uses appliances marked critical. Other appliances are reported and are not covered by that battery figure.' : 'No appliance was marked critical, so the backup figure includes every entered appliance.' },
    { id: 'pv', text: `Array watts = daytime watt-hours / (direct performance factor × sun hours) + nighttime watt-hours / (stored performance factor × sun hours). The direct factor multiplies temperature ${0.9}, soiling ${0.95}, wiring ${0.98}, inverter efficiency, and a mismatch allowance ${0.97}. Stored energy also multiplies battery charge and discharge efficiency.` },
    { id: 'sun', text: context.resource.source === 'customer_supplied' ? 'Peak sun hours were supplied with the request and are not a site survey.' : context.resource.source.startsWith('indicative') ? `Peak sun hours are an indicative annual average for ${context.resource.source.split(':')[1]}. The worst-month figure is a planning derate, not a measured month.` : 'No matching state was supplied, so a conservative fallback sun-hour value is used.' },
    { id: 'voltage', text: 'Open-circuit voltage is adjusted to a 15°C cell temperature and operating voltage to 65°C, using the panel Voc temperature coefficient for Vmp as well. Nigeria’s design low is not a freezing-climate value.' },
    { id: 'approval', text: 'The result is a planning estimate. Wiring, protection, earthing, and installation approval remain with a qualified person. It does not promise uninterrupted power.' },
  ];
}

function warningList(appliances: PreparedAppliance[], context: SizeContext) {
  const warnings = [
    { id: 'nameplate', message: 'Default appliance watts are estimates. Nameplate ratings will change the result.' },
    { id: 'not_a_guarantee', message: 'Runtime and generation figures are scenario estimates under the stated losses. They are not a guarantee of electricity.' },
    { id: 'safety', message: 'This design does not specify breakers, cable sizes, earthing, or isolators. Those must be engineered for the installation.' },
  ];
  if (appliances.some((appliance) => appliance.scheduleSource === 'evening_first_assumption')) {
    warnings.push({ id: 'schedule_assumed', message: 'At least one appliance has no daytime and nighttime split, so its hours were placed from 18:00.' });
  }
  if (!context.resource.source.startsWith('indicative') && context.resource.source !== 'customer_supplied') {
    warnings.push({ id: 'sun_fallback', message: 'The installation state did not match the planning table, so a fallback sun-hour value was used.' });
  }
  if (context.mode !== 'independence') {
    warnings.push({ id: 'worst_month', message: `Worst-month sun is about ${context.resource.worstMonthPeakSunHours} hours. A hybrid system sized on the annual average will cover less of the load in that month.` });
  }
  return warnings;
}

function narrativeFor(design: Omit<SolarDesign, 'recommendations' | 'selected' | 'alternatives' | 'unmet' | 'cost' | 'narrative'>, selected: SystemConfiguration | null, mode: Mode) {
  const lines = [
    `The entered appliances total ${design.load.connectedLoadW.toLocaleString('en-NG')} W connected and about ${design.load.dailyEnergyKwh.toFixed(2)} kWh per day. The modeled coincident load is ${Math.round(design.load.peakSimultaneousW).toLocaleString('en-NG')} W, with a one-at-a-time startup demand of ${Math.round(design.load.surgeDemandW).toLocaleString('en-NG')} W.`,
    `The ${mode.replace('_', ' ')} case asks for about ${(design.battery.nominalEnergyWh / 1000).toFixed(2)} kWh of nominal battery storage and ${Math.round(design.inverter.requiredContinuousW).toLocaleString('en-NG')} W of continuous inverter capacity (${Math.round(design.inverter.requiredVa).toLocaleString('en-NG')} VA at power factor ${design.inverter.powerFactor}).`,
    `The array estimate is ${Math.round(design.pv.requiredArrayW).toLocaleString('en-NG')} W using ${design.pv.sizingPeakSunHours} peak sun hours.`,
  ];
  if (selected) {
    lines.push(`The published equipment set “${selected.label}” provides about ${(selected.batteryUsableWh / 1000).toFixed(2)} kWh of usable battery energy under the stated losses, for an estimated ${selected.runtime[0]?.estimatedHours?.toFixed(1) ?? 'unspecified'} hours at the modeled backup load.`);
  } else {
    lines.push('No published product combination passed the compatibility and stock checks.');
  }
  return lines;
}

export type { BuiltSystem };
