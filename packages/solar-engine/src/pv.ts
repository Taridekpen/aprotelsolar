import { BATTERY_ROUND_TRIP, DEFAULT_INVERTER_EFFICIENCY, SPF_DIRECT } from './assumptions.js';

export function performanceFactors(inverterEfficiency = DEFAULT_INVERTER_EFFICIENCY) {
  const direct = (SPF_DIRECT / DEFAULT_INVERTER_EFFICIENCY) * inverterEfficiency;
  return { direct, stored: direct * BATTERY_ROUND_TRIP };
}

export function requiredArrayW(daytimeWh: number, nighttimeWh: number, peakSunHours: number, inverterEfficiency = DEFAULT_INVERTER_EFFICIENCY) {
  const factors = performanceFactors(inverterEfficiency);
  if (peakSunHours <= 0) return 0;
  return daytimeWh / (factors.direct * peakSunHours) + nighttimeWh / (factors.stored * peakSunHours);
}
