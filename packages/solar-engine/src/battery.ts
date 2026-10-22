import {
  BATTERY_DISCHARGE_EFFICIENCY,
  DEFAULT_INVERTER_EFFICIENCY,
  END_OF_LIFE_CAPACITY_FRACTION,
  RESERVE_FRACTION,
} from './assumptions.js';

export function nominalBatteryWh(deliveredEnergyWh: number, depthOfDischarge: number, inverterEfficiency = DEFAULT_INVERTER_EFFICIENCY) {
  const usablePath = depthOfDischarge * inverterEfficiency * BATTERY_DISCHARGE_EFFICIENCY * END_OF_LIFE_CAPACITY_FRACTION;
  return (deliveredEnergyWh * (1 + RESERVE_FRACTION)) / usablePath;
}

export function usableBatteryWh(nominalWh: number, depthOfDischarge: number, inverterEfficiency: number) {
  return nominalWh * depthOfDischarge * BATTERY_DISCHARGE_EFFICIENCY * inverterEfficiency * END_OF_LIFE_CAPACITY_FRACTION;
}
