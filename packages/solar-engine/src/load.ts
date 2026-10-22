import type { HourlyLoad, PreparedAppliance } from './schedule.js';

export function summariseLoad(appliances: PreparedAppliance[], day: HourlyLoad[], backupEnergyWh: number, backupHours: number) {
  const connectedLoadW = appliances.reduce((sum, appliance) => sum + appliance.wattage * appliance.quantity, 0);
  const dailyEnergyWh = day.reduce((sum, slot) => sum + slot.energyWh, 0);
  const daytimeEnergyWh = day.filter((slot) => slot.hour >= 7 && slot.hour <= 17).reduce((sum, slot) => sum + slot.energyWh, 0);
  const nighttimeEnergyWh = dailyEnergyWh - daytimeEnergyWh;
  const criticalEnergyWh = day.reduce((sum, slot) => sum + slot.criticalEnergyWh, 0);
  const noncriticalEnergyWh = day.reduce((sum, slot) => sum + slot.noncriticalEnergyWh, 0);
  const peakSimultaneousW = day.reduce((max, slot) => Math.max(max, slot.runningW), 0);
  const surgeDemandW = day.reduce((max, slot) => Math.max(max, slot.surgeW), 0);
  return {
    connectedLoadW,
    dailyEnergyWh,
    dailyEnergyKwh: dailyEnergyWh / 1000,
    daytimeEnergyWh,
    nighttimeEnergyWh,
    criticalEnergyWh,
    noncriticalEnergyWh,
    peakSimultaneousW,
    surgeDemandW,
    averageBackupW: backupHours > 0 ? backupEnergyWh / backupHours : 0,
  };
}
