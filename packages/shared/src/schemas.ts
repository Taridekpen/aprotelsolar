import { z } from 'zod';
import {
  ACCOUNT_STATUSES,
  BATTERY_CHEMISTRIES,
  BRANCH_STATUSES,
  CONTENT_PAGES,
  CONTENT_TYPES,
  ENGINEERING_APPROVALS,
  ENQUIRY_STATUSES,
  ENQUIRY_TYPES,
  FULFILMENT_STATUSES,
  GRID_COMPATIBILITY,
  PACKAGE_AVAILABILITY,
  PRODUCT_AVAILABILITY,
  PUBLICATION_STATUSES,
  QUOTATION_STATUSES,
  SERVICE_AVAILABILITY,
  SPECIFICATION_PROFILES,
} from './constants.js';
import { parseNairaToKobo } from './money.js';
import { PERMISSIONS, ROLES } from './permissions.js';

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Expected an identifier');

export const emailSchema = z
  .string()
  .trim()
  .email('Enter a valid email address')
  .max(254)
  .transform((value) => value.toLowerCase());

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9\s()-]{6,20}$/, 'Enter a valid phone number');

export const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(180)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must use lowercase letters, numbers, and hyphens');

export const moneySchema = z.union([z.number(), z.string()]).transform((value, context) => {
  try {
    return parseNairaToKobo(value);
  } catch {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Amount must be a non-negative NGN value with at most 2 decimal places',
    });
    return z.NEVER;
  }
});

const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  'changeme',
  'changeme123',
  'admin123',
  'administrator',
  'aprotel',
  'aprotel123',
  'aprotelsolar',
  'qwerty12345',
  'letmein123',
]);

export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine((value) => /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value), {
    message: 'Password must include upper and lower case letters, a number, and a symbol',
  })
  .refine((value) => !COMMON_PASSWORDS.has(value.toLowerCase()), {
    message: 'Choose a password that is not a common default',
  });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().trim().max(40).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
  q: z.string().trim().max(100).optional(),
});

const attributeSchema = z.object({
  key: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(200),
  unit: z.string().trim().max(40).optional(),
});

export const solarPanelSpecSchema = z.object({
  type: z.literal('solar_panel'),
  ratedWattageW: z.number().positive().optional(),
  voc: z.number().positive().optional(),
  vmp: z.number().positive().optional(),
  isc: z.number().positive().optional(),
  imp: z.number().positive().optional(),
  tempCoeffPmaxPctPerC: z.number().optional(),
  tempCoeffVocPctPerC: z.number().optional(),
  tempCoeffIscPctPerC: z.number().optional(),
  lengthMm: z.number().positive().optional(),
  widthMm: z.number().positive().optional(),
  depthMm: z.number().positive().optional(),
  weightKg: z.number().positive().optional(),
  cellType: z.string().trim().max(80).optional(),
});

export const verifiedSolarPanelSpecSchema = solarPanelSpecSchema.required({
  ratedWattageW: true,
  voc: true,
  vmp: true,
  isc: true,
  imp: true,
  tempCoeffPmaxPctPerC: true,
  tempCoeffVocPctPerC: true,
  tempCoeffIscPctPerC: true,
  lengthMm: true,
  widthMm: true,
  depthMm: true,
});

export const batterySpecSchema = z.object({
  type: z.literal('battery'),
  chemistry: z.enum(BATTERY_CHEMISTRIES).optional(),
  nominalVoltage: z.number().positive().optional(),
  ampHours: z.number().positive().optional(),
  nominalKwh: z.number().positive().optional(),
  usableDodPercent: z.number().min(1).max(100).optional(),
  continuousDischargeCurrentA: z.number().positive().optional(),
  maxChargeCurrentA: z.number().positive().optional(),
  bmsCompatibility: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  supportedConfigurations: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
});

export const verifiedBatterySpecSchema = batterySpecSchema.required({
  chemistry: true,
  nominalVoltage: true,
  ampHours: true,
  nominalKwh: true,
  usableDodPercent: true,
  continuousDischargeCurrentA: true,
  maxChargeCurrentA: true,
  bmsCompatibility: true,
  supportedConfigurations: true,
});

export const inverterSpecSchema = z.object({
  type: z.literal('inverter'),
  ratedContinuousPowerW: z.number().positive().optional(),
  vaRating: z.number().positive().optional(),
  surgeRatingW: z.number().positive().optional(),
  surgeDurationSeconds: z.number().positive().optional(),
  batteryVoltage: z.number().positive().optional(),
  efficiencyPercent: z.number().min(1).max(100).optional(),
  mpptMinV: z.number().positive().optional(),
  mpptMaxV: z.number().positive().optional(),
  maxPvVoltage: z.number().positive().optional(),
  maxPvInputCurrentA: z.number().positive().optional(),
  supportedBatteryTypes: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  gridCompatibility: z.enum(GRID_COMPATIBILITY).optional(),
});

export const verifiedInverterSpecSchema = inverterSpecSchema.required({
  ratedContinuousPowerW: true,
  efficiencyPercent: true,
  supportedBatteryTypes: true,
  gridCompatibility: true,
});

export const genericSpecSchema = z.object({
  type: z.literal('generic'),
  attributes: z.array(attributeSchema).max(40).optional(),
});

export const verifiedGenericSpecSchema = genericSpecSchema.extend({
  attributes: z.array(attributeSchema).min(1).max(40),
});

export const draftSpecificationSchema = z.discriminatedUnion('type', [
  solarPanelSpecSchema,
  batterySpecSchema,
  inverterSpecSchema,
  genericSpecSchema,
]);

export const verifiedSpecificationSchema = z.discriminatedUnion('type', [
  verifiedSolarPanelSpecSchema,
  verifiedBatterySpecSchema,
  verifiedInverterSpecSchema,
  verifiedGenericSpecSchema,
]);

export const runtimeAssumptionsSchema = z
  .object({
    loadWatts: z.number().positive(),
    estimatedRuntimeHours: z.number().positive().nullable(),
    operatingNotes: z.string().trim().min(10).max(2000),
  })
  .superRefine((value, context) => {
    if (value.estimatedRuntimeHours != null && value.operatingNotes.trim().length < 10) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['operatingNotes'],
        message: 'Runtime estimates require the load and operating assumptions',
      });
    }
  });

export const categoryWriteSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugSchema.optional(),
  description: z.string().trim().max(5000).optional().default(''),
  imageId: objectIdSchema.nullable().optional(),
  parentId: objectIdSchema.nullable().optional(),
  specificationProfile: z.enum(SPECIFICATION_PROFILES),
  displayOrder: z.number().int().min(0).max(10000).optional(),
  publicationStatus: z.enum(PUBLICATION_STATUSES).optional(),
});

export const categoryUpdateSchema = categoryWriteSchema.partial();

export const reorderSchema = z.object({
  ids: z.array(objectIdSchema).min(1).max(500),
});

export const productWriteSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: slugSchema.optional(),
  sku: z.string().trim().min(1).max(64),
  brand: z.string().trim().min(1).max(80),
  categoryId: objectIdSchema,
  subcategoryId: objectIdSchema.nullable().optional(),
  description: z.string().trim().min(1).max(20000),
  shortDescription: z.string().trim().min(1).max(300),
  sellingPrice: moneySchema,
  compareAtPrice: moneySchema.nullable().optional(),
  costPrice: moneySchema.optional(),
  imageIds: z.array(objectIdSchema).max(12).optional(),
  specifications: draftSpecificationSchema,
  specificationsVerified: z.boolean().optional(),
  warranty: z.string().trim().max(2000).optional().default(''),
  installationRequirements: z.string().trim().max(5000).optional().default(''),
  availability: z.enum(PRODUCT_AVAILABILITY).optional(),
  featured: z.boolean().optional(),
  publicationStatus: z.enum(PUBLICATION_STATUSES).optional(),
});

export const productUpdateSchema = productWriteSchema.partial();

export const productListQuerySchema = paginationSchema.extend({
  category: objectIdSchema.optional(),
  brand: z.string().trim().max(80).optional(),
  availability: z.enum(PRODUCT_AVAILABILITY).optional(),
  featured: z.enum(['true', 'false']).optional(),
  minPrice: moneySchema.optional(),
  maxPrice: moneySchema.optional(),
  status: z.enum(PUBLICATION_STATUSES).optional(),
  specificationProfile: z.enum(SPECIFICATION_PROFILES).optional(),
});

export const serviceWriteSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: slugSchema.optional(),
  description: z.string().trim().min(1).max(20000),
  imageIds: z.array(objectIdSchema).max(12).optional(),
  features: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
  startingPrice: moneySchema.nullable().optional(),
  availability: z.enum(SERVICE_AVAILABILITY).optional(),
  relatedProductIds: z.array(objectIdSchema).max(30).optional(),
  displayOrder: z.number().int().min(0).max(10000).optional(),
  publicationStatus: z.enum(PUBLICATION_STATUSES).optional(),
});

export const serviceUpdateSchema = serviceWriteSchema.partial();

export const packageItemSchema = z.object({
  productId: objectIdSchema,
  quantity: z.number().int().positive().max(1000),
});

export const packageWriteSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: slugSchema.optional(),
  description: z.string().trim().min(1).max(20000),
  imageIds: z.array(objectIdSchema).max(12).optional(),
  items: z.array(packageItemSchema).min(1).max(50),
  estimatedCapacityKw: z.number().positive(),
  inverterSummary: z.string().trim().min(1).max(500),
  batteryCapacityKwh: z.number().nonnegative(),
  solarPanelCapacityKw: z.number().positive(),
  runtimeAssumptions: runtimeAssumptionsSchema,
  price: moneySchema,
  installationCharge: moneySchema,
  warranty: z.string().trim().max(2000).optional().default(''),
  availability: z.enum(PACKAGE_AVAILABILITY).optional(),
  publicationStatus: z.enum(PUBLICATION_STATUSES).optional(),
});

export const packageUpdateSchema = packageWriteSchema.partial();

export const branchWriteSchema = z.object({
  name: z.string().trim().min(2).max(160),
  code: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .regex(/^[A-Z0-9-]+$/, 'Branch code must use uppercase letters, numbers, and hyphens'),
  addressLine1: z.string().trim().min(3).max(200),
  addressLine2: z.string().trim().max(200).optional().default(''),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  country: z.string().trim().min(2).max(80).optional().default('Nigeria'),
  postalCode: z.string().trim().max(20).optional().default(''),
  phone: phoneSchema,
  email: emailSchema.optional(),
  isCentral: z.boolean().optional(),
  status: z.enum(BRANCH_STATUSES).optional(),
  displayOrder: z.number().int().min(0).max(10000).optional(),
});

export const branchUpdateSchema = branchWriteSchema.partial();

export const stockReceiptSchema = z.object({
  productId: objectIdSchema,
  branchId: objectIdSchema,
  quantity: z.number().int().positive().max(100000),
  note: z.string().trim().max(500).optional(),
});

export const stockAdjustmentSchema = z.object({
  productId: objectIdSchema,
  branchId: objectIdSchema,
  delta: z.number().int().min(-100000).max(100000).refine((value) => value !== 0, 'Adjustment cannot be zero'),
  note: z.string().trim().min(3).max(500),
});

export const stockTransferSchema = z.object({
  productId: objectIdSchema,
  fromBranchId: objectIdSchema,
  toBranchId: objectIdSchema,
  quantity: z.number().int().positive().max(100000),
  note: z.string().trim().max(500).optional(),
});

export const stockThresholdSchema = z.object({
  productId: objectIdSchema,
  branchId: objectIdSchema,
  lowStockThreshold: z.number().int().min(0).max(100000),
});

export const enquiryCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  phone: phoneSchema,
  location: z.string().trim().min(2).max(160),
  enquiryType: z.enum(ENQUIRY_TYPES),
  message: z.string().trim().min(10).max(5000),
  productIds: z.array(objectIdSchema).max(20).optional(),
  solarCalculation: z.record(z.unknown()).optional(),
  recommendationSnapshot: z.record(z.unknown()).optional(),
});

export const enquiryUpdateSchema = z.object({
  status: z.enum(ENQUIRY_STATUSES).optional(),
  assignedTo: objectIdSchema.nullable().optional(),
  note: z.string().trim().min(1).max(5000).optional(),
});

const customerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  phone: phoneSchema,
  location: z.string().trim().min(2).max(160).optional(),
});

const deliverySchema = z.object({
  recipientName: z.string().trim().min(2).max(120),
  phone: phoneSchema,
  addressLine1: z.string().trim().min(3).max(200),
  addressLine2: z.string().trim().max(200).optional().default(''),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  country: z.string().trim().min(2).max(80).optional().default('Nigeria'),
  notes: z.string().trim().max(500).optional().default(''),
});

export const quotationCreateSchema = z.object({
  customer: customerSchema,
  state: z.string().trim().min(2).max(80),
  includeInstallation: z.boolean().optional().default(false),
  applianceSnapshot: z.object({
    appliances: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(80),
          wattage: z.number().positive().max(100000),
          quantity: z.number().int().positive().max(1000),
          hoursPerDay: z.number().positive().max(24),
        }),
      )
      .max(100)
      .optional(),
    notes: z.string().trim().max(2000).optional(),
  }),
  items: z.array(packageItemSchema).max(50).optional(),
  packageIds: z.array(z.object({ packageId: objectIdSchema, quantity: z.number().int().positive().max(20) })).max(10).optional(),
});

export const quotationUpdateSchema = z.object({
  status: z.enum(QUOTATION_STATUSES).optional(),
  engineeringApproval: z.enum(ENGINEERING_APPROVALS).optional(),
  note: z.string().trim().min(1).max(5000).optional(),
});

export const quotationCommercialSchema = z
  .object({
    lines: z
      .array(
        z.object({
          productId: objectIdSchema,
          unitPrice: moneySchema,
        }),
      )
      .max(50)
      .optional(),
    installationCost: moneySchema.optional(),
    reason: z.string().trim().min(5).max(500),
  })
  .superRefine((value, context) => {
    if ((value.lines?.length ?? 0) === 0 && value.installationCost == null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Change a line price or the installation charge',
        path: ['lines'],
      });
    }
  });

export const orderCreateSchema = z
  .object({
    customer: z.object({
      name: z.string().trim().min(2).max(120),
      email: emailSchema,
      phone: phoneSchema,
    }),
    delivery: deliverySchema,
    branchId: objectIdSchema.optional(),
    includeInstallation: z.boolean().optional().default(false),
    items: z.array(packageItemSchema).max(50).optional(),
    packages: z
      .array(z.object({ packageId: objectIdSchema, quantity: z.number().int().positive().max(20) }))
      .max(10)
      .optional(),
  })
  .superRefine((value, context) => {
    if ((value.items?.length ?? 0) + (value.packages?.length ?? 0) < 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Add at least one product or solar package',
        path: ['items'],
      });
    }
  });

export const orderLookupSchema = z.object({
  orderNumber: z.string().trim().min(4).max(40),
  email: emailSchema,
});

export const orderCancelSchema = orderLookupSchema.extend({
  phone: phoneSchema,
});

export const orderFulfilmentSchema = z.object({
  fulfilmentStatus: z.enum(FULFILMENT_STATUSES),
  branchId: objectIdSchema.optional(),
});

export const paymentInitializeSchema = z.object({
  orderNumber: z.string().trim().min(4).max(40),
  email: emailSchema,
});

export const devPaymentSchema = z.object({
  reference: z.string().trim().min(4).max(80),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(20).max(500),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

export const administratorCreateSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(ROLES),
  permissionOverrides: z.array(z.enum(PERMISSIONS)).nullable().optional(),
});

export const administratorUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(ACCOUNT_STATUSES).optional(),
  permissionOverrides: z.array(z.enum(PERMISSIONS)).nullable().optional(),
});

const linkSchema = z.object({
  label: z.string().trim().min(1).max(80),
  href: z.string().trim().min(1).max(300),
});

export const contentBodySchemas = {
  homepage_hero: z.object({
    headline: z.string().trim().min(2).max(200),
    subheadline: z.string().trim().max(500).optional().default(''),
    primaryCtaLabel: z.string().trim().max(40).optional().default(''),
    primaryCtaHref: z.string().trim().max(300).optional().default(''),
    secondaryCtaLabel: z.string().trim().max(40).optional().default(''),
    secondaryCtaHref: z.string().trim().max(300).optional().default(''),
  }),
  promotional_banner: z.object({
    message: z.string().trim().min(2).max(300),
    href: z.string().trim().max(300).optional().default(''),
    startsAt: z.string().datetime().nullable().optional(),
    endsAt: z.string().datetime().nullable().optional(),
  }),
  about: z.object({
    heading: z.string().trim().min(2).max(160),
    body: z.string().trim().min(1).max(20000),
  }),
  contact_info: z.object({
    heading: z.string().trim().min(2).max(160),
    body: z.string().trim().max(5000).optional().default(''),
  }),
  company_location: z.object({
    name: z.string().trim().min(2).max(160),
    address: z.string().trim().min(3).max(300),
    phone: phoneSchema,
    email: emailSchema.optional(),
  }),
  testimonial: z.object({
    quote: z.string().trim().min(2).max(1000),
    author: z.string().trim().min(2).max(120),
    role: z.string().trim().max(120).optional().default(''),
    location: z.string().trim().max(120).optional().default(''),
  }),
  faq: z.object({
    question: z.string().trim().min(5).max(300),
    answer: z.string().trim().min(2).max(5000),
  }),
  completed_installation: z.object({
    title: z.string().trim().min(2).max(160),
    location: z.string().trim().min(2).max(160),
    summary: z.string().trim().min(2).max(5000),
    completedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  project_gallery: z.object({
    title: z.string().trim().min(2).max(160),
    caption: z.string().trim().max(500).optional().default(''),
  }),
  featured_section: z.object({
    heading: z.string().trim().min(2).max(160),
    body: z.string().trim().min(1).max(10000),
  }),
  featured_catalog: z.object({
    heading: z.string().trim().min(2).max(160),
    productIds: z.array(objectIdSchema).max(12),
    serviceIds: z.array(objectIdSchema).max(12),
  }),
  company_statistics: z.object({
    items: z
      .array(
        z.object({
          label: z.string().trim().min(2).max(80),
          value: z.string().trim().min(1).max(40),
        }),
      )
      .min(1)
      .max(12),
  }),
  navigation: z.object({
    items: z.array(linkSchema).max(20),
  }),
  footer: z.object({
    blurb: z.string().trim().max(1000).optional().default(''),
    links: z.array(linkSchema).max(30),
  }),
  seo_metadata: z.object({
    page: z.string().trim().min(1).max(80),
    title: z.string().trim().min(2).max(160),
    description: z.string().trim().max(320).optional().default(''),
  }),
} as const;

export const contentWriteSchema = z
  .object({
    type: z.enum(CONTENT_TYPES),
    slug: slugSchema.optional(),
    title: z.string().trim().min(2).max(180),
    summary: z.string().trim().max(500).optional().default(''),
    body: z.unknown(),
    imageIds: z.array(objectIdSchema).max(20).optional(),
    displayOrder: z.number().int().min(0).max(10000).optional(),
    publicationStatus: z.enum(PUBLICATION_STATUSES).optional(),
    seo: z
      .object({
        title: z.string().trim().max(160).optional().default(''),
        description: z.string().trim().max(320).optional().default(''),
      })
      .optional(),
  })
  .superRefine((value, context) => {
    const parsed = contentBodySchemas[value.type].safeParse(value.body);
    if (!parsed.success) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['body'],
        message: 'Content body does not match this content type',
      });
    }
  });

export const contentUpdateSchema = z
  .object({
    slug: slugSchema.optional(),
    title: z.string().trim().min(2).max(180).optional(),
    summary: z.string().trim().max(500).optional(),
    body: z.unknown().optional(),
    imageIds: z.array(objectIdSchema).max(20).optional(),
    displayOrder: z.number().int().min(0).max(10000).optional(),
    publicationStatus: z.enum(PUBLICATION_STATUSES).optional(),
    seo: z
      .object({
        title: z.string().trim().max(160).optional(),
        description: z.string().trim().max(320).optional(),
      })
      .optional(),
  });

export const contentPageSchema = z.enum(Object.keys(CONTENT_PAGES) as [keyof typeof CONTENT_PAGES, ...(keyof typeof CONTENT_PAGES)[]]);

export const mediaUpdateSchema = z.object({
  altText: z.string().trim().min(1).max(200).optional(),
});

const settingsCompanySchema = z.object({
  legalName: z.string().trim().min(2).max(180),
  displayName: z.string().trim().min(2).max(180),
  email: emailSchema,
  phone: phoneSchema,
  website: z.string().trim().url().max(300),
});

const stateFeeSchema = z.object({
  state: z.string().trim().min(2).max(80),
  fee: moneySchema,
});

export const settingsPatchSchema = z
  .object({
    company: settingsCompanySchema.optional(),
    currency: z.literal('NGN').optional(),
    delivery: z
      .object({
        defaultFee: moneySchema,
        feesByState: z.array(stateFeeSchema).max(50),
      })
      .optional(),
    installation: z
      .object({
        baseFee: moneySchema,
        perPanel: moneySchema,
        perKwp: moneySchema,
      })
      .optional(),
    tax: z
      .object({
        enabled: z.boolean(),
        name: z.string().trim().min(2).max(40),
        ratePercent: z.number().min(0).max(50),
        inclusive: z.boolean(),
      })
      .optional(),
    payment: z
      .object({
        enabled: z.boolean(),
      })
      .optional(),
    quotation: z
      .object({
        validityDays: z.number().int().min(1).max(90),
      })
      .optional(),
    calculator: z
      .object({
        safetyMarginPercent: z.number().min(0).max(100),
        defaultPeakSunHours: z.number().min(1).max(12),
        systemLossPercent: z.number().min(0).max(50),
        defaultDodPercent: z.number().min(1).max(100),
        notes: z.string().trim().max(2000),
      })
      .optional(),
    engineering: z
      .object({
        defaultSystemVoltage: z.number().positive().max(1000),
        assumptionsNote: z.string().trim().max(2000),
      })
      .optional(),
    inventory: z
      .object({
        reservationTtlMinutes: z.number().int().min(5).max(240),
        defaultLowStockThreshold: z.number().int().min(0).max(10000),
        allowBackorder: z.literal(false),
      })
      .optional(),
    contact: z
      .object({
        whatsapp: phoneSchema.optional(),
        phones: z.array(phoneSchema).max(10),
        emails: z.array(emailSchema).max(10),
      })
      .optional(),
  })
  .strict();

export const SENSITIVE_SETTING_KEYS = [
  'currency',
  'tax',
  'payment',
  'quotation',
  'calculator',
  'engineering',
  'inventory',
] as const;

export const listQuerySchema = paginationSchema.extend({
  status: z.string().trim().max(40).optional(),
});

export const dashboardQuerySchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .superRefine((value, context) => {
    if (value.from && value.to && value.from > value.to) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: 'The end date must be on or after the start date' });
    }
  });
