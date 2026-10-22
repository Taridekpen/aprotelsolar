import { DAY_START_HOUR, DAY_WINDOW_HOURS, NIGHT_START_HOUR } from './assumptions.js';
import type { ApplianceInput } from './schema.js';

export type PreparedAppliance = ApplianceInput & {
  dutyCycle: number;
  critical: boolean;
  simultaneous: boolean;
  dayHours: number;
  nightHours: number;
  scheduleSource: 'customer' | 'evening_first_assumption';
};

export type HourlyLoad = {
  hour: number;
  energyWh: number;
  runningW: number;
  criticalEnergyWh: number;
  noncriticalEnergyWh: number;
  surgeW: number;
};

const DAY_HOURS = Array.from({ length: DAY_WINDOW_HOURS }, (_, index) => (DAY_START_HOUR + index) % 24);
const NIGHT_HOURS = Array.from({ length: 24 - DAY_WINDOW_HOURS }, (_, index) => (NIGHT_START_HOUR + index) % 24);

export function prepareAppliance(appliance: ApplianceInput): PreparedAppliance {
  const dutyCycle = appliance.dutyCycle ?? 1;
  const critical = appliance.critical ?? false;
  const simultaneous = appliance.simultaneous ?? true;
  if (appliance.dayHours != null && appliance.nightHours != null) {
    return { ...appliance, dutyCycle, critical, simultaneous, dayHours: appliance.dayHours, nightHours: appliance.nightHours, scheduleSource: 'customer' };
  }
  const placed = place(appliance.hoursPerDay, [...NIGHT_HOURS, ...DAY_HOURS]);
  let dayHours = 0;
  let nightHours = 0;
  for (const [hour, fraction] of placed) {
    if (DAY_HOURS.includes(hour)) dayHours += fraction;
    else nightHours += fraction;
  }
  return { ...appliance, dutyCycle, critical, simultaneous, dayHours, nightHours, scheduleSource: 'evening_first_assumption' };
}

export function buildDay(appliances: PreparedAppliance[]): HourlyLoad[] {
  const hours = Array.from({ length: 24 }, () => ({
    energyWh: 0,
    criticalEnergyWh: 0,
    noncriticalEnergyWh: 0,
    simultaneousW: 0,
    simultaneousSurgeLift: 0,
    exclusivePeakW: 0,
    exclusiveSurgeW: 0,
  }));

  for (const appliance of appliances) {
    const fractions = new Map<number, number>();
    for (const [hour, fraction] of place(appliance.dayHours, DAY_HOURS)) fractions.set(hour, fraction);
    for (const [hour, fraction] of place(appliance.nightHours, NIGHT_HOURS)) fractions.set(hour, (fractions.get(hour) ?? 0) + fraction);
    const running = appliance.wattage * appliance.quantity;
    const surge = (appliance.surgeWatts ?? appliance.wattage) * appliance.quantity;
    for (const [hour, fraction] of fractions) {
      if (fraction <= 0) continue;
      const slot = hours[hour]!;
      const energy = running * appliance.dutyCycle * fraction;
      slot.energyWh += energy;
      if (appliance.critical) slot.criticalEnergyWh += energy;
      else slot.noncriticalEnergyWh += energy;
      if (appliance.simultaneous) {
        slot.simultaneousW += running;
        slot.simultaneousSurgeLift = Math.max(slot.simultaneousSurgeLift, surge - running);
      } else {
        slot.exclusivePeakW = Math.max(slot.exclusivePeakW, running);
        slot.exclusiveSurgeW = Math.max(slot.exclusiveSurgeW, surge);
      }
    }
  }

  return hours.map((slot, hour) => {
    const simultaneousSurge = slot.simultaneousW + slot.simultaneousSurgeLift;
    return {
      hour,
      energyWh: slot.energyWh,
      runningW: Math.max(slot.simultaneousW, slot.exclusivePeakW),
      criticalEnergyWh: slot.criticalEnergyWh,
      noncriticalEnergyWh: slot.noncriticalEnergyWh,
      surgeW: Math.max(simultaneousSurge, slot.exclusiveSurgeW),
    };
  });
}

export function energyInWindow(day: HourlyLoad[], startHour: number, durationHours: number, criticalOnly: boolean) {
  let remaining = durationHours;
  let hour = ((startHour % 24) + 24) % 24;
  let energy = 0;
  const guard = 80;
  let steps = 0;
  while (remaining > 0 && steps < guard) {
    const take = Math.min(1, remaining);
    const slot = day[hour]!;
    const portion = criticalOnly ? slot.criticalEnergyWh : slot.energyWh;
    energy += portion * take;
    remaining -= take;
    hour = (hour + 1) % 24;
    steps += 1;
  }
  return energy;
}

function place(hours: number, window: number[]) {
  const placed = new Map<number, number>();
  let remaining = hours;
  for (const hour of window) {
    if (remaining <= 0) break;
    const fraction = Math.min(1, remaining);
    placed.set(hour, fraction);
    remaining -= fraction;
  }
  return placed;
}
