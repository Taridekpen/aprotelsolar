/** Documented planning factors. These are assumptions, not measured site performance. */

export const TEMPERATURE_FACTOR = 0.9;
export const SOILING_FACTOR = 0.95;
export const WIRING_FACTOR = 0.98;
export const DEFAULT_INVERTER_EFFICIENCY = 0.9;
export const MISMATCH_AND_SHADING_FACTOR = 0.97;
export const BATTERY_CHARGE_EFFICIENCY = 0.95;
export const BATTERY_DISCHARGE_EFFICIENCY = 0.95;
export const RESERVE_FRACTION = 0.1;
export const END_OF_LIFE_CAPACITY_FRACTION = 0.9;
export const DEFAULT_INVERTER_SAFETY_MARGIN = 0.25;
export const DEFAULT_POWER_FACTOR = 0.8;
export const DEFAULT_BACKUP_HOURS = 8;
export const DESIGN_MIN_CELL_C = 15;
export const DESIGN_MAX_CELL_C = 65;
export const ISC_CURRENT_FACTOR = 1.25;
export const NOMINAL_VOLTAGE_TOLERANCE = 0.1;
export const DAY_START_HOUR = 7;
export const DAY_WINDOW_HOURS = 11;
export const NIGHT_START_HOUR = 18;

export const SPF_DIRECT =
  TEMPERATURE_FACTOR * SOILING_FACTOR * WIRING_FACTOR * DEFAULT_INVERTER_EFFICIENCY * MISMATCH_AND_SHADING_FACTOR;

export const BATTERY_ROUND_TRIP = BATTERY_CHARGE_EFFICIENCY * BATTERY_DISCHARGE_EFFICIENCY;

export const SPF_STORED = SPF_DIRECT * BATTERY_ROUND_TRIP;

export const DEFAULT_DOD_BY_CHEMISTRY: Record<string, number> = {
  lithium_iron_phosphate: 0.8,
  lithium_ion: 0.8,
  lead_acid: 0.5,
  gel: 0.5,
  agm: 0.5,
  other: 0.5,
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
