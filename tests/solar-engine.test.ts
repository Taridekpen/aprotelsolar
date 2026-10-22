import { describe, expect, it } from 'vitest';
import {
  APPLIANCE_CATALOGUE,
  adjustedVoltage,
  applianceSchema,
  calculateEnergyRequirements,
  nominalBatteryWh,
  planString,
  recommendSystem,
  requiredArrayW,
  solarResourceFor,
  type CatalogueItem,
} from '@aprotel/solar-engine';

const fridge = {
  name: 'Refrigerator',
  wattage: 150,
  quantity: 1,
  hoursPerDay: 8,
  dayHours: 2,
  nightHours: 6,
  critical: true,
  surgeWatts: 600,
};

describe('solar calculation engine', () => {
  it('rejects inconsistent schedules and negative quantities', () => {
    expect(applianceSchema.safeParse({ name: 'Lamp', wattage: 10, quantity: 1, hoursPerDay: 8, dayHours: 2, nightHours: 2 }).success).toBe(false);
    expect(applianceSchema.safeParse({ name: 'Lamp', wattage: 10, quantity: -1, hoursPerDay: 2 }).success).toBe(false);
    expect(applianceSchema.safeParse({ name: 'Lamp', wattage: 10, quantity: 1, hoursPerDay: 0 }).success).toBe(false);
    expect(applianceSchema.safeParse({ name: 'Pump', wattage: 500, quantity: 1, hoursPerDay: 2, surgeWatts: 100 }).success).toBe(false);
  });

  it('calculates a single appliance with an explicit day and night split', () => {
    const result = calculateEnergyRequirements({
      appliances: [fridge],
      location: { state: 'Bayelsa' },
      autonomyDays: 0.5,
    });
    const delivered = 900;
    const nominal = nominalBatteryWh(delivered, 0.8);
    expect(result.status).toBe('requirements_only');
    expect(result.design.selected).toBeNull();
    expect(result.design.load.connectedLoadW).toBe(150);
    expect(result.design.load.dailyEnergyWh).toBe(1200);
    expect(result.design.load.daytimeEnergyWh).toBe(300);
    expect(result.design.load.nighttimeEnergyWh).toBe(900);
    expect(result.design.load.criticalEnergyWh).toBe(1200);
    expect(result.design.load.peakSimultaneousW).toBe(150);
    expect(result.design.load.surgeDemandW).toBe(600);
    expect(result.design.battery.deliveredEnergyWh).toBe(delivered);
    expect(result.design.battery.nominalEnergyWh).toBeCloseTo(nominal, 6);
    expect(result.design.inverter.requiredContinuousW).toBeCloseTo(187.5, 6);
    expect(result.design.inverter.requiredVa).toBeCloseTo(234.375, 6);
    expect(result.design.pv.sizingPeakSunHours).toBe(4);
    expect(result.design.pv.requiredArrayW).toBeCloseTo(requiredArrayW(300, 900, 4), 6);
    expect(result.design.engineeringApprovalRequired).toBe(true);
    expect(result.design.narrative.join(' ')).not.toMatch(/guarantee/i);
  });

  it('applies duty cycle to energy and keeps the nameplate in the peak', () => {
    const result = calculateEnergyRequirements({
      appliances: [{ ...fridge, dutyCycle: 0.35 }],
      location: { state: 'Bayelsa' },
    });
    expect(result.design.load.dailyEnergyWh).toBeCloseTo(150 * 0.35 * 8, 6);
    expect(result.design.load.peakSimultaneousW).toBe(150);
  });

  it('adds overlapping appliances and keeps a non-simultaneous load out of the coincident peak', () => {
    const result = calculateEnergyRequirements({
      appliances: [
        fridge,
        { name: 'Television', wattage: 80, quantity: 2, hoursPerDay: 4, dayHours: 4, nightHours: 0 },
        { name: 'Pump', wattage: 100, quantity: 1, hoursPerDay: 1, dayHours: 1, nightHours: 0, simultaneous: false, surgeWatts: 400 },
      ],
      location: { state: 'Kano' },
    });
    expect(result.design.load.connectedLoadW).toBe(150 + 160 + 100);
    expect(result.design.load.peakSimultaneousW).toBe(150 + 160);
    expect(result.design.load.surgeDemandW).toBe(310 + (600 - 150));
    expect(result.design.pv.annualPeakSunHours).toBe(solarResourceFor('Kano', undefined, 4).annualPeakSunHours);
    expect(result.design.pv.annualPeakSunHours).not.toBe(result.design.pv.worstMonthPeakSunHours);
  });

  it('places unspecified hours from the evening and does not use one sun value for every state', () => {
    const bayelsa = calculateEnergyRequirements({ appliances: [{ name: 'Fan', wattage: 70, quantity: 1, hoursPerDay: 8 }], location: { state: 'Bayelsa' } });
    const kano = calculateEnergyRequirements({ appliances: [{ name: 'Fan', wattage: 70, quantity: 1, hoursPerDay: 8 }], location: { state: 'Kano' } });
    expect(bayelsa.design.load.nighttimeEnergyWh).toBe(560);
    expect(bayelsa.design.load.daytimeEnergyWh).toBe(0);
    expect(kano.design.pv.annualPeakSunHours).toBeGreaterThan(bayelsa.design.pv.annualPeakSunHours);
  });

  it('sizes off-grid storage across the requested autonomy and uses the worst month', () => {
    const result = calculateEnergyRequirements({
      appliances: [{ name: 'Light', wattage: 12, quantity: 1, hoursPerDay: 10, dayHours: 2, nightHours: 8, critical: true }],
      location: { state: 'Lagos' },
      autonomyDays: 2,
    },);
    const recommend = recommendSystem({
      appliances: [{ name: 'Light', wattage: 12, quantity: 1, hoursPerDay: 10, dayHours: 2, nightHours: 8, critical: true }],
      location: { state: 'Lagos' },
      autonomyDays: 2,
      preferences: { mode: 'independence', gridTied: false },
    });
    expect(recommend.design.mode).toBe('independence');
    expect(recommend.design.pv.sizingPeakSunHours).toBe(recommend.design.pv.worstMonthPeakSunHours);
    expect(recommend.design.battery.deliveredEnergyWh).toBeCloseTo(result.design.load.dailyEnergyWh * 2, 6);
  });

  it('adjusts open-circuit voltage for temperature and rejects an impossible string', () => {
    const vocCold = adjustedVoltage(49.5, -0.28, 15);
    expect(vocCold).toBeGreaterThan(49.5);
    const rejected = planString({
      requiredArrayW: 500,
      ratedWattageW: 550,
      voc: 80,
      vmp: 70,
      isc: 10,
      tempCoeffVocPctPerC: -0.3,
      mpptMinV: 200,
      mpptMaxV: 220,
      maxPvVoltage: 150,
      maxPvInputCurrentA: 12,
    });
    expect(rejected.ok).toBe(false);
  });

  it('does not treat kVA as kW and does not recommend unverified or out-of-stock equipment', () => {
    const lowVa = recommendSystem(
      { appliances: [{ name: 'Cooker', wattage: 1500, quantity: 1, hoursPerDay: 2, dayHours: 2, nightHours: 0 }], location: { state: 'Bayelsa' }, preferences: { backupHours: 4 } },
      [panel(), inverter({ vaRating: 2000 }), battery()],
    );
    expect(lowVa.design.inverter.requiredVa).toBeGreaterThan(2000);
    expect(lowVa.design.selected).toBeNull();

    const enoughVa = recommendSystem(
      { appliances: [{ name: 'Cooker', wattage: 1500, quantity: 1, hoursPerDay: 2, dayHours: 2, nightHours: 0 }], location: { state: 'Bayelsa' }, preferences: { backupHours: 4 } },
      [panel(), inverter({ vaRating: 4000 }), battery()],
    );
    expect(enoughVa.design.selected).not.toBeNull();

    const unverified = recommendSystem(
      { appliances: [fridge], location: { state: 'Bayelsa' }, preferences: { backupHours: 8 } },
      [panel({ specificationsVerified: false }), inverter(), battery()],
    );
    expect(unverified.status).toBe('requirements_only');
    expect(unverified.design.selected).toBeNull();

    const noStock = recommendSystem(
      { appliances: [fridge], location: { state: 'Bayelsa' }, preferences: { backupHours: 8 } },
      [panel({ inventoryQuantity: 0 }), inverter(), battery()],
    );
    expect(noStock.design.selected).toBeNull();
  });

  it('recommends a compatible published set and refuses a budget that cannot buy it', () => {
    const catalogue = [panel(), inverter(), battery()];
    const designed = recommendSystem(
      { appliances: [fridge], location: { state: 'Bayelsa' }, preferences: { backupHours: 8, mode: 'runtime' } },
      catalogue,
    );
    expect(designed.status).toBe('designed');
    expect(designed.design.selected?.products.map((item) => item.role).sort()).toEqual(['battery', 'inverter', 'solar_panel']);
    expect(designed.design.selected?.seriesCount).toBeGreaterThanOrEqual(1);
    expect(designed.design.cost.provisional).toBe(true);
    expect(designed.design.cost.installationNaira).toBeNull();
    const repeated = recommendSystem(
      { appliances: [fridge], location: { state: 'Bayelsa' }, preferences: { backupHours: 8, mode: 'runtime' } },
      catalogue,
    );
    expect(repeated.design.selected?.equipmentCostNaira).toBe(designed.design.selected?.equipmentCostNaira);

    const budget = recommendSystem(
      { appliances: [fridge], location: { state: 'Bayelsa' }, preferences: { budgetNaira: 1000, backupHours: 8, mode: 'budget' } },
      catalogue,
    );
    expect(budget.design.selected).toBeNull();
    expect(budget.design.unmet?.message).toMatch(/budget/i);
  });

  it('keeps a missing price out of the recommendation', () => {
    const result = recommendSystem(
      { appliances: [fridge], location: { state: 'Bayelsa' }, preferences: { backupHours: 8 } },
      [panel({ sellingPriceNaira: 0 }), inverter(), battery()],
    );
    expect(result.design.selected).toBeNull();
  });

  it('documents that catalogue wattages are estimates', () => {
    const refrigerator = APPLIANCE_CATALOGUE.find((item) => item.name === 'Refrigerator');
    expect(refrigerator?.wattage).toBe(150);
    expect(refrigerator?.dutyCycle).toBe(0.35);
    expect(refrigerator?.usage.toLowerCase()).toContain('estimate');
  });
});

function panel(overrides: Partial<CatalogueItem> = {}): CatalogueItem {
  return {
    id: 'panel-1',
    slug: 'panel-550',
    name: '550W panel',
    sku: 'PNL-550',
    brand: 'Aprotel',
    profile: 'solar_panel',
    sellingPriceNaira: 185000,
    inventoryQuantity: 12,
    warranty: '12 years',
    specificationsVerified: true,
    specifications: {
      type: 'solar_panel',
      ratedWattageW: 550,
      voc: 49.5,
      vmp: 41.2,
      isc: 14,
      imp: 13.3,
      tempCoeffVocPctPerC: -0.28,
      tempCoeffPmaxPctPerC: -0.35,
      tempCoeffIscPctPerC: 0.05,
    },
    ...overrides,
  };
}

function inverter(specOverrides: Record<string, unknown> = {}, overrides: Partial<CatalogueItem> = {}): CatalogueItem {
  return {
    id: 'inverter-1',
    slug: 'inverter-3k',
    name: '3 kW hybrid inverter',
    sku: 'INV-3000',
    brand: 'Aprotel',
    profile: 'inverter',
    sellingPriceNaira: 450000,
    inventoryQuantity: 2,
    warranty: '2 years',
    specificationsVerified: true,
    specifications: {
      type: 'inverter',
      ratedContinuousPowerW: 3000,
      vaRating: 3750,
      surgeRatingW: 6000,
      surgeDurationSeconds: 5,
      batteryVoltage: 24,
      efficiencyPercent: 93,
      mpptMinV: 60,
      mpptMaxV: 450,
      maxPvVoltage: 500,
      maxPvInputCurrentA: 18,
      supportedBatteryTypes: ['lithium_iron_phosphate'],
      gridCompatibility: 'hybrid',
      ...specOverrides,
    },
    ...overrides,
  };
}

function battery(overrides: Partial<CatalogueItem> = {}): CatalogueItem {
  return {
    id: 'battery-1',
    slug: 'battery-256',
    name: '2.56 kWh lithium battery',
    sku: 'BAT-256',
    brand: 'Aprotel',
    profile: 'battery',
    sellingPriceNaira: 700000,
    inventoryQuantity: 4,
    warranty: '5 years',
    specificationsVerified: true,
    specifications: {
      type: 'battery',
      chemistry: 'lithium_iron_phosphate',
      nominalVoltage: 25.6,
      ampHours: 100,
      nominalKwh: 2.56,
      usableDodPercent: 80,
      continuousDischargeCurrentA: 100,
      maxChargeCurrentA: 50,
      bmsCompatibility: ['internal'],
      supportedConfigurations: ['parallel'],
    },
    ...overrides,
  };
}
