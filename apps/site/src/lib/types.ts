export type Entry = {
  id: string;
  type: string;
  slug: string;
  title: string;
  summary: string;
  body: Record<string, unknown>;
  imageIds: string[];
  displayOrder: number;
  seo: { title: string; description: string };
};

export type ContentPage = { page: string; items: Entry[] };

export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string;
  imageId: string | null;
  specificationProfile: string;
};

export type Product = {
  id: string;
  name: string;
  slug: string;
  sku: string;
  brand: string;
  categoryId: string;
  shortDescription: string;
  description: string;
  sellingPrice: string;
  compareAtPrice: string | null;
  inventoryQuantity: number;
  imageIds: string[];
  specifications: Record<string, unknown>;
  specificationProfile: string;
  specificationsVerified: boolean;
  warranty: string;
  installationRequirements: string;
  availability: string;
  featured: boolean;
  stock?: Array<{ branchId: string; branchName: string; available: number }>;
};

export type Service = {
  id: string;
  name: string;
  slug: string;
  description: string;
  imageIds: string[];
  features: string[];
  startingPrice: string | null;
  availability: string;
  relatedProductIds: string[];
};

export type SolarPackage = {
  id: string;
  name: string;
  slug: string;
  description: string;
  imageIds: string[];
  items: Array<{ productId: string; quantity: number }>;
  estimatedCapacityKw: number;
  inverterSummary: string;
  batteryCapacityKwh: number;
  solarPanelCapacityKw: number;
  runtimeAssumptions: { loadWatts: number; estimatedRuntimeHours: number | null; operatingNotes: string };
  price: string;
  installationCharge: string;
  warranty: string;
  availability: string;
};

export type Branch = {
  id: string;
  name: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  country: string;
  phone: string;
  email: string;
  isCentral: boolean;
};

export function textBody(body: Record<string, unknown>, key: string) {
  const value = body[key];
  return typeof value === 'string' ? value : '';
}
