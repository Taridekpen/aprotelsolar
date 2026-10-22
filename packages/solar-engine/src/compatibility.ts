import { DESIGN_MAX_CELL_C, DESIGN_MIN_CELL_C, ISC_CURRENT_FACTOR, NOMINAL_VOLTAGE_TOLERANCE } from './assumptions.js';

export function adjustedVoltage(stcVoltage: number, coefficientPctPerC: number, cellTemperatureC: number) {
  return stcVoltage * (1 + (coefficientPctPerC / 100) * (cellTemperatureC - 25));
}

export type StringPlan = {
  ok: true;
  series: number;
  parallel: number;
  panelCount: number;
  vocCold: number;
  vmpHot: number;
};

export type StringRejection = { ok: false; reason: string };

export function planString(input: {
  requiredArrayW: number;
  ratedWattageW: number;
  voc: number;
  vmp: number;
  isc: number;
  tempCoeffVocPctPerC: number;
  mpptMinV: number;
  mpptMaxV: number;
  maxPvVoltage: number;
  maxPvInputCurrentA: number;
}): StringPlan | StringRejection {
  const vocCold = adjustedVoltage(input.voc, input.tempCoeffVocPctPerC, DESIGN_MIN_CELL_C);
  const vmpHot = adjustedVoltage(input.vmp, input.tempCoeffVocPctPerC, DESIGN_MAX_CELL_C);
  const vmpStc = input.vmp;
  if (vocCold <= 0 || vmpHot <= 0) return { ok: false, reason: 'Panel voltage coefficients do not produce a usable string voltage.' };
  const minSeries = Math.ceil(input.mpptMinV / vmpHot);
  const maxSeriesVoc = Math.floor(input.maxPvVoltage / vocCold);
  const maxSeriesVmp = Math.floor(input.mpptMaxV / vmpStc);
  const maxSeries = Math.min(maxSeriesVoc, maxSeriesVmp);
  if (minSeries < 1 || maxSeries < minSeries) {
    return { ok: false, reason: 'No series count keeps the cold open-circuit voltage inside the inverter limit and the hot operating voltage inside the MPPT window.' };
  }
  const parallelMax = Math.floor(input.maxPvInputCurrentA / (input.isc * ISC_CURRENT_FACTOR));
  if (parallelMax < 1) return { ok: false, reason: 'One string exceeds the inverter PV input current after the 1.25 current factor.' };
  const energyPanels = Math.max(1, Math.ceil(input.requiredArrayW / input.ratedWattageW));
  let best: StringPlan | null = null;
  for (let series = minSeries; series <= maxSeries; series += 1) {
    const parallel = Math.max(1, Math.ceil(energyPanels / series));
    if (parallel > parallelMax) continue;
    const panelCount = series * parallel;
    if (!best || panelCount < best.panelCount) {
      best = { ok: true, series, parallel, panelCount, vocCold, vmpHot };
    }
  }
  return best ?? { ok: false, reason: 'The panel count required for the load cannot be arranged within the inverter current limit.' };
}

export function voltagesMatch(batteryNominalV: number, series: number, inverterBatteryV: number) {
  const bank = batteryNominalV * series;
  return Math.abs(bank - inverterBatteryV) / inverterBatteryV <= NOMINAL_VOLTAGE_TOLERANCE;
}

export function configurationAllows(supported: string[], kind: 'series' | 'parallel') {
  return supported.some((entry) => entry.toLowerCase().includes(kind));
}
