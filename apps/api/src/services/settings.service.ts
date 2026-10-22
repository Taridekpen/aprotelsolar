import { formatKoboAsNaira, SENSITIVE_SETTING_KEYS, type Permission } from '@aprotel/shared';
import { SettingsModel } from '../models/settings.model.js';
import { AppError } from '../utils/errors.js';
import { recordAudit } from './audit.service.js';

const DEFAULTS = {
  _id: 'platform',
  company: {
    legalName: 'Aprotel Services Nig. Ltd.',
    displayName: 'Aprotel Solar',
    email: 'contact@aprotelsolar.com',
    phone: '09122948902',
    website: 'https://aprotelsolar.com',
  },
  contact: {
    whatsapp: '09122948902',
    phones: ['09122948902', '09074444655', '09040474900', '09044407395', '08071471720', '09155448006'],
    emails: ['contact@aprotelsolar.com'],
  },
};

export interface PlatformSettingsShape {
  company: { legalName: string; displayName: string; email: string; phone: string; website: string };
  currency: string;
  delivery: { defaultFeeKobo: number; feesByState: Array<{ state: string; feeKobo: number }> };
  installation: { baseFeeKobo: number; perPanelKobo: number; perKwpKobo: number };
  tax: { enabled: boolean; name: string; ratePercent: number; inclusive: boolean };
  payment: { enabled: boolean };
  quotation: { validityDays: number };
  calculator: {
    safetyMarginPercent: number;
    defaultPeakSunHours: number;
    systemLossPercent: number;
    defaultDodPercent: number;
    notes: string;
  };
  engineering: { defaultSystemVoltage: number; assumptionsNote: string };
  inventory: { reservationTtlMinutes: number; defaultLowStockThreshold: number; allowBackorder: boolean };
  contact: { whatsapp?: string; phones: string[]; emails: string[] };
  updatedAt?: Date;
}

export async function ensureDefaultSettings() {
  const existing = await SettingsModel.findById('platform');
  if (existing) return existing;
  return SettingsModel.create(DEFAULTS);
}

export async function getSettings(): Promise<PlatformSettingsShape> {
  const settings = await ensureDefaultSettings();
  return settings.toObject() as PlatformSettingsShape;
}

export function presentSettings(settings: PlatformSettingsShape) {
  return {
    company: settings.company,
    currency: settings.currency,
    delivery: {
      defaultFee: formatKoboAsNaira(settings.delivery.defaultFeeKobo),
      feesByState: settings.delivery.feesByState.map((fee) => ({
        state: fee.state,
        fee: formatKoboAsNaira(fee.feeKobo),
      })),
    },
    installation: {
      baseFee: formatKoboAsNaira(settings.installation.baseFeeKobo),
      perPanel: formatKoboAsNaira(settings.installation.perPanelKobo),
      perKwp: formatKoboAsNaira(settings.installation.perKwpKobo),
    },
    tax: settings.tax,
    payment: { enabled: settings.payment.enabled },
    quotation: settings.quotation,
    calculator: settings.calculator,
    engineering: settings.engineering,
    inventory: settings.inventory,
    contact: settings.contact,
    updatedAt: settings.updatedAt,
  };
}

export async function updateSettings(
  patch: Record<string, unknown>,
  actor: { id: string; permissions: Permission[]; ipAddress?: string; userAgent?: string },
) {
  const keys = Object.keys(patch);
  const sensitive = new Set<string>(SENSITIVE_SETTING_KEYS);
  const touchesSensitive = keys.some((key) => sensitive.has(key));
  const touchesOperational = keys.some((key) => !sensitive.has(key));
  if (touchesSensitive && !actor.permissions.includes('settings:update_sensitive')) {
    throw new AppError('FORBIDDEN', 'Sensitive platform settings require a super administrator', 403);
  }
  if (touchesOperational && !actor.permissions.includes('settings:update') && !actor.permissions.includes('settings:update_sensitive')) {
    throw new AppError('FORBIDDEN', 'You do not have permission to update these settings', 403);
  }

  const $set: Record<string, unknown> = {};
  if (patch.company) $set.company = patch.company;
  if (patch.currency) $set.currency = patch.currency;
  if (isRecord(patch.delivery)) {
    $set.delivery = {
      defaultFeeKobo: patch.delivery.defaultFee,
      feesByState: asArray(patch.delivery.feesByState).map((fee) => ({
        state: fee.state,
        feeKobo: fee.fee,
      })),
    };
  }
  if (isRecord(patch.installation)) {
    $set.installation = {
      baseFeeKobo: patch.installation.baseFee,
      perPanelKobo: patch.installation.perPanel,
      perKwpKobo: patch.installation.perKwp,
    };
  }
  if (patch.tax) $set.tax = patch.tax;
  if (isRecord(patch.payment)) $set.payment = { enabled: patch.payment.enabled };
  if (patch.quotation) $set.quotation = patch.quotation;
  if (patch.calculator) $set.calculator = patch.calculator;
  if (patch.engineering) $set.engineering = patch.engineering;
  if (patch.inventory) $set.inventory = patch.inventory;
  if (patch.contact) $set.contact = patch.contact;

  const updated = await SettingsModel.findByIdAndUpdate('platform', { $set }, { new: true });
  if (!updated) throw new AppError('NOT_FOUND', 'Platform settings were not found', 404);
  const settings = updated.toObject() as PlatformSettingsShape;
  await recordAudit({
    actorId: actor.id,
    action: 'settings.update',
    resourceType: 'settings',
    resourceId: 'platform',
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { fields: keys },
  });
  return settings;
}

export function deliveryFeeKobo(settings: PlatformSettingsShape, state: string): number {
  const match = settings.delivery.feesByState.find((fee) => fee.state.toLowerCase() === state.toLowerCase());
  return match?.feeKobo ?? settings.delivery.defaultFeeKobo;
}

export function calculateTax(settings: PlatformSettingsShape, taxableKobo: number): number {
  if (!settings.tax.enabled || settings.tax.inclusive || taxableKobo <= 0) return 0;
  return Math.round((taxableKobo * settings.tax.ratePercent) / 100);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}

function asArray(value: unknown): Array<Record<string, any>> {
  return Array.isArray(value) ? value : [];
}
