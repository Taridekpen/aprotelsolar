import { apiUrl } from './api';

export function naira(value: string | number | null | undefined) {
  if (value == null || value === '') return '—';
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) return String(value);
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(amount);
}

export function labelOf(value: string) {
  return value.replaceAll('_', ' ');
}

export function mediaUrl(id: string, variant: 'thumbnail' | 'medium' | 'original' = 'medium') {
  return apiUrl(variant === 'original' ? `/api/v1/media/${id}` : `/api/v1/media/${id}?variant=${variant}`);
}

export function mapsLink(parts: Array<string | undefined>) {
  const query = parts.filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export const STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta',
  'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi',
  'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto',
  'Taraba', 'Yobe', 'Zamfara',
];

const SPEC_LABELS: Record<string, string> = {
  ratedWattageW: 'Rated power (W)',
  voc: 'Open-circuit voltage (V)',
  vmp: 'Maximum power voltage (V)',
  isc: 'Short-circuit current (A)',
  imp: 'Maximum power current (A)',
  tempCoeffPmaxPctPerC: 'Temperature coefficient of Pmax (%/°C)',
  tempCoeffVocPctPerC: 'Temperature coefficient of Voc (%/°C)',
  tempCoeffIscPctPerC: 'Temperature coefficient of Isc (%/°C)',
  lengthMm: 'Length (mm)',
  widthMm: 'Width (mm)',
  depthMm: 'Depth (mm)',
  weightKg: 'Weight (kg)',
  cellType: 'Cell type',
  chemistry: 'Chemistry',
  nominalVoltage: 'Nominal voltage (V)',
  ampHours: 'Capacity (Ah)',
  nominalKwh: 'Nominal energy (kWh)',
  usableDodPercent: 'Usable depth of discharge (%)',
  continuousDischargeCurrentA: 'Continuous discharge (A)',
  maxChargeCurrentA: 'Maximum charge current (A)',
  bmsCompatibility: 'BMS compatibility',
  supportedConfigurations: 'Supported configurations',
  ratedPowerW: 'Rated power (W)',
  surgePowerW: 'Surge power (W)',
  mpptVoltageMin: 'MPPT minimum voltage (V)',
  mpptVoltageMax: 'MPPT maximum voltage (V)',
  maxPvInputV: 'Maximum PV input (V)',
  maxPvInputW: 'Maximum PV input (W)',
  batteryVoltage: 'Battery voltage (V)',
  gridCompatibility: 'Grid compatibility',
  supportedBatteryTypes: 'Supported battery types',
};

export function specificationRows(specifications: Record<string, unknown> | null | undefined) {
  if (!specifications) return [];
  const rows: Array<{ key: string; label: string; value: string }> = [];
  for (const [key, raw] of Object.entries(specifications)) {
    if (key === 'type' || key === 'attributes' || raw == null || raw === '') continue;
    if (Array.isArray(raw)) {
      if (raw.length === 0) continue;
      if (typeof raw[0] === 'object') continue;
      rows.push({ key, label: SPEC_LABELS[key] ?? labelOf(key), value: raw.map(String).join(', ') });
      continue;
    }
    if (typeof raw === 'object') continue;
    rows.push({ key, label: SPEC_LABELS[key] ?? labelOf(key), value: String(raw) });
  }
  const attributes = specifications.attributes;
  if (Array.isArray(attributes)) {
    for (const attribute of attributes) {
      if (!attribute || typeof attribute !== 'object') continue;
      const row = attribute as { key?: string; value?: string; unit?: string };
      if (!row.key || !row.value) continue;
      rows.push({ key: row.key, label: row.key, value: row.unit ? `${row.value} ${row.unit}` : row.value });
    }
  }
  return rows;
}
