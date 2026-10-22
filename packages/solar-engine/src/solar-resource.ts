/**
 * Indicative annual-average peak sun hours for planning in Nigeria.
 * These are not a site measurement and not a Global Solar Atlas extract.
 * Southern figures are kept toward the cloudy end of commonly published ranges.
 * Worst-month factors are planning derates: 0.75 south, 0.80 middle belt, 0.85 north.
 */
const SOUTH = { hours: 0, worst: 0.75 };
const MIDDLE = { hours: 0, worst: 0.8 };
const NORTH = { hours: 0, worst: 0.85 };

type Region = { hours: number; worst: number };

const STATES: Record<string, Region> = {
  abia: { hours: 4.3, worst: SOUTH.worst },
  akwaibom: { hours: 4.1, worst: SOUTH.worst },
  anambra: { hours: 4.4, worst: SOUTH.worst },
  bayelsa: { hours: 4.0, worst: SOUTH.worst },
  crossriver: { hours: 4.2, worst: SOUTH.worst },
  delta: { hours: 4.2, worst: SOUTH.worst },
  ebonyi: { hours: 4.6, worst: SOUTH.worst },
  edo: { hours: 4.3, worst: SOUTH.worst },
  ekiti: { hours: 4.5, worst: SOUTH.worst },
  enugu: { hours: 4.5, worst: SOUTH.worst },
  imo: { hours: 4.3, worst: SOUTH.worst },
  lagos: { hours: 4.2, worst: SOUTH.worst },
  ogun: { hours: 4.3, worst: SOUTH.worst },
  ondo: { hours: 4.3, worst: SOUTH.worst },
  osun: { hours: 4.4, worst: SOUTH.worst },
  oyo: { hours: 4.5, worst: SOUTH.worst },
  rivers: { hours: 4.1, worst: SOUTH.worst },
  benue: { hours: 4.9, worst: MIDDLE.worst },
  fct: { hours: 5.0, worst: MIDDLE.worst },
  abuja: { hours: 5.0, worst: MIDDLE.worst },
  kogi: { hours: 4.8, worst: MIDDLE.worst },
  kwara: { hours: 4.8, worst: MIDDLE.worst },
  nasarawa: { hours: 5.0, worst: MIDDLE.worst },
  niger: { hours: 5.1, worst: MIDDLE.worst },
  plateau: { hours: 5.2, worst: MIDDLE.worst },
  taraba: { hours: 5.0, worst: MIDDLE.worst },
  adamawa: { hours: 5.2, worst: NORTH.worst },
  bauchi: { hours: 5.4, worst: NORTH.worst },
  borno: { hours: 5.7, worst: NORTH.worst },
  gombe: { hours: 5.3, worst: NORTH.worst },
  jigawa: { hours: 5.7, worst: NORTH.worst },
  kaduna: { hours: 5.3, worst: NORTH.worst },
  kano: { hours: 5.6, worst: NORTH.worst },
  katsina: { hours: 5.8, worst: NORTH.worst },
  kebbi: { hours: 5.6, worst: NORTH.worst },
  sokoto: { hours: 5.9, worst: NORTH.worst },
  yobe: { hours: 5.8, worst: NORTH.worst },
  zamfara: { hours: 5.7, worst: NORTH.worst },
};

export type SolarResource = {
  annualPeakSunHours: number;
  worstMonthPeakSunHours: number;
  source: string;
};

export function solarResourceFor(state: string | undefined, suppliedHours: number | undefined, fallbackHours: number): SolarResource {
  if (suppliedHours != null && suppliedHours >= 1 && suppliedHours <= 12) {
    return {
      annualPeakSunHours: suppliedHours,
      worstMonthPeakSunHours: roundWorst(suppliedHours),
      source: 'customer_supplied',
    };
  }
  const key = (state ?? '').toLowerCase().replace(/[^a-z]/g, '');
  const region = STATES[key];
  if (region) {
    return {
      annualPeakSunHours: region.hours,
      worstMonthPeakSunHours: roundWorst(region.hours * region.worst),
      source: `indicative_annual_average:${key}`,
    };
  }
  const fallback = Math.min(6, Math.max(3, fallbackHours));
  return {
    annualPeakSunHours: fallback,
    worstMonthPeakSunHours: roundWorst(fallback * 0.75),
    source: 'fallback_no_matching_state',
  };
}

function roundWorst(value: number) {
  return Math.round(value * 100) / 100;
}
