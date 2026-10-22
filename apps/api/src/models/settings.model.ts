import { Schema, model, type InferSchemaType } from 'mongoose';

const settingsSchema = new Schema(
  {
    _id: { type: String, default: 'platform' },
    company: {
      legalName: { type: String, required: true },
      displayName: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String, required: true },
      website: { type: String, required: true },
    },
    currency: { type: String, default: 'NGN' },
    delivery: {
      defaultFeeKobo: { type: Number, default: 0 },
      feesByState: {
        type: [{ state: String, feeKobo: Number }],
        default: [],
      },
    },
    installation: {
      baseFeeKobo: { type: Number, default: 0 },
      perPanelKobo: { type: Number, default: 0 },
      perKwpKobo: { type: Number, default: 0 },
    },
    tax: {
      enabled: { type: Boolean, default: false },
      name: { type: String, default: 'VAT' },
      ratePercent: { type: Number, default: 7.5 },
      inclusive: { type: Boolean, default: false },
    },
    payment: {
      enabled: { type: Boolean, default: false },
    },
    quotation: {
      validityDays: { type: Number, default: 14 },
    },
    calculator: {
      safetyMarginPercent: { type: Number, default: 20 },
      defaultPeakSunHours: { type: Number, default: 4.5 },
      systemLossPercent: { type: Number, default: 15 },
      defaultDodPercent: { type: Number, default: 80 },
      notes: {
        type: String,
        default: 'Assumptions are stored for the Phase 4 sizing engine and are not a performance guarantee.',
      },
    },
    engineering: {
      defaultSystemVoltage: { type: Number, default: 48 },
      assumptionsNote: {
        type: String,
        default: 'Runtime and yield figures must always state the load and operating assumptions used.',
      },
    },
    inventory: {
      reservationTtlMinutes: { type: Number, default: 30 },
      defaultLowStockThreshold: { type: Number, default: 2 },
      allowBackorder: { type: Boolean, default: false },
    },
    contact: {
      whatsapp: { type: String, default: '' },
      phones: { type: [String], default: [] },
      emails: { type: [String], default: [] },
    },
  },
  { timestamps: true, collection: 'platform_settings', minimize: false },
);

export type PlatformSettings = InferSchemaType<typeof settingsSchema>;
export const SettingsModel = model('PlatformSettings', settingsSchema);
