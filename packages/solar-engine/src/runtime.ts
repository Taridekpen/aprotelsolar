import type { RuntimeScenario } from './types.js';

export function requirementRuntime(usableWh: number, averageBackupW: number, backupHours: number, dailyWh: number): RuntimeScenario[] {
  const blackout = averageBackupW > 0 ? usableWh / averageBackupW : null;
  const dailyAverageW = dailyWh / 24;
  const fullDay = dailyAverageW > 0 ? usableWh / dailyAverageW : null;
  return [
    {
      id: 'battery_only_blackout',
      title: 'Battery-only blackout',
      estimatedHours: blackout,
      lowHours: blackout,
      highHours: blackout,
      detail: `At the average load during the ${backupHours}-hour backup window, after inverter and battery losses and the end-of-life allowance. This is not a guaranteed outage duration.`,
    },
    {
      id: 'extended_blackout',
      title: 'Extended blackout, no solar input',
      estimatedHours: fullDay,
      lowHours: fullDay,
      highHours: fullDay,
      detail: 'Clock hours if the whole day’s average load continues and no solar or grid power arrives. A higher evening load will shorten this.',
    },
  ];
}

export function solarRuntime(arrayW: number, annualSunHours: number, worstSunHours: number, directFactor: number, daytimeWh: number): RuntimeScenario {
  const annualWh = arrayW * annualSunHours * directFactor;
  const worstWh = arrayW * worstSunHours * directFactor;
  const dayCovered = daytimeWh > 0 ? Math.min(11, (11 * annualWh) / daytimeWh) : 11;
  const dayCoveredLow = daytimeWh > 0 ? Math.min(11, (11 * worstWh) / daytimeWh) : 11;
  return {
    id: 'daytime_solar',
    title: 'Daytime solar contribution',
    estimatedHours: dayCovered,
    lowHours: dayCoveredLow,
    highHours: dayCovered,
    detail: 'Hours of the 07:00–18:00 window in which the array’s estimated AC output can cover the modeled daytime load. The low figure uses the worst-month sun assumption.',
  };
}
