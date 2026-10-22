export const PUBLICATION_STATUSES = ['draft', 'published', 'inactive', 'archived'] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const PRODUCT_AVAILABILITY = ['in_stock', 'out_of_stock', 'preorder', 'discontinued'] as const;
export type ProductAvailability = (typeof PRODUCT_AVAILABILITY)[number];

export const SPECIFICATION_PROFILES = ['solar_panel', 'battery', 'inverter', 'generic'] as const;
export type SpecificationProfile = (typeof SPECIFICATION_PROFILES)[number];

export const ACCOUNT_STATUSES = ['active', 'suspended', 'disabled'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ENQUIRY_TYPES = [
  'general',
  'product',
  'installation',
  'quotation',
  'maintenance',
  'cctv',
  'consultation',
] as const;
export type EnquiryType = (typeof ENQUIRY_TYPES)[number];

export const ENQUIRY_STATUSES = ['new', 'contacted', 'in_review', 'quoted', 'resolved', 'closed'] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

export const QUOTATION_STATUSES = ['submitted', 'in_review', 'approved', 'rejected', 'expired', 'converted'] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const ENGINEERING_APPROVALS = ['pending', 'approved', 'rejected'] as const;
export type EngineeringApproval = (typeof ENGINEERING_APPROVALS)[number];

export const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'cancelled', 'refunded', 'review'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const FULFILMENT_STATUSES = [
  'unfulfilled',
  'processing',
  'ready',
  'dispatched',
  'delivered',
  'cancelled',
] as const;
export type FulfilmentStatus = (typeof FULFILMENT_STATUSES)[number];

export const CONTENT_TYPES = [
  'homepage_hero',
  'promotional_banner',
  'about',
  'contact_info',
  'company_location',
  'testimonial',
  'faq',
  'completed_installation',
  'project_gallery',
  'featured_section',
  'featured_catalog',
  'company_statistics',
  'navigation',
  'footer',
  'seo_metadata',
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_PAGES = {
  home: ['homepage_hero', 'promotional_banner', 'featured_section', 'featured_catalog', 'company_statistics', 'testimonial'],
  about: ['about', 'company_statistics', 'testimonial'],
  contact: ['contact_info', 'company_location'],
  faq: ['faq'],
  installations: ['completed_installation', 'project_gallery'],
  navigation: ['navigation', 'footer', 'seo_metadata'],
} as const;

export type ContentPage = keyof typeof CONTENT_PAGES;

export const BATTERY_CHEMISTRIES = [
  'lithium_iron_phosphate',
  'lithium_ion',
  'lead_acid',
  'gel',
  'agm',
  'other',
] as const;

export const GRID_COMPATIBILITY = ['off_grid', 'grid_tie', 'hybrid', 'none'] as const;

export const SERVICE_AVAILABILITY = ['available', 'unavailable'] as const;
export const PACKAGE_AVAILABILITY = ['available', 'unavailable'] as const;
export const BRANCH_STATUSES = ['active', 'inactive'] as const;

export const CURRENCY = 'NGN' as const;
