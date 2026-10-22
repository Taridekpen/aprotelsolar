import type { ClientSession } from 'mongoose';
import { ProductModel } from '../models/product.model.js';
import { SolarPackageModel } from '../models/solar-package.model.js';
import { AppError } from '../utils/errors.js';
import { calculateTax, deliveryFeeKobo, getSettings } from './settings.service.js';

export interface Demand {
  productId: string;
  quantity: number;
}

export interface PricedProductLine {
  kind: 'product';
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  unitPriceKobo: number;
  lineTotalKobo: number;
  specificationsSnapshot: unknown;
  specificationProfile: string;
}

export interface PricedPackageLine {
  kind: 'package';
  packageId: string;
  name: string;
  sku: string;
  quantity: number;
  unitPriceKobo: number;
  lineTotalKobo: number;
  installationChargeKobo: number;
  components: Array<{
    productId: string;
    name: string;
    sku: string;
    quantity: number;
    unitPriceKobo: number;
    lineTotalKobo: number;
    specificationsSnapshot: unknown;
  }>;
}

export interface PriceQuote {
  lines: PricedProductLine[];
  packageLines: PricedPackageLine[];
  demands: Demand[];
  subtotalKobo: number;
  deliveryCostKobo: number;
  installationCostKobo: number;
  taxKobo: number;
  totalKobo: number;
  currency: 'NGN';
}

export async function priceSelection(
  input: {
    items?: Array<{ productId: string; quantity: number }>;
    packages?: Array<{ packageId: string; quantity: number }>;
    state: string;
    includeInstallation: boolean;
    mode: 'order' | 'quote';
  },
  session?: ClientSession,
): Promise<PriceQuote> {
  const settings = await getSettings();
  const lines: PricedProductLine[] = [];
  const packageLines: PricedPackageLine[] = [];
  const demandMap = new Map<string, number>();
  let installationCostKobo = 0;
  let looseProducts = 0;

  for (const item of input.items ?? []) {
    const product = await ProductModel.findById(item.productId).session(session ?? null);
    assertAvailable(product, input.mode);
    const lineTotalKobo = product!.sellingPriceKobo * item.quantity;
    lines.push({
      kind: 'product',
      productId: String(product!._id),
      name: product!.name,
      sku: product!.sku,
      quantity: item.quantity,
      unitPriceKobo: product!.sellingPriceKobo,
      lineTotalKobo,
      specificationsSnapshot: product!.specifications,
      specificationProfile: product!.specificationProfile,
    });
    addDemand(demandMap, String(product!._id), item.quantity);
    looseProducts += 1;
    if (input.includeInstallation && product!.specificationProfile === 'solar_panel') {
      installationCostKobo += settings.installation.perPanelKobo * item.quantity;
    }
  }

  if (input.includeInstallation && looseProducts > 0) {
    installationCostKobo += settings.installation.baseFeeKobo;
  }

  for (const selected of input.packages ?? []) {
    const solarPackage = await SolarPackageModel.findById(selected.packageId).session(session ?? null);
    if (!solarPackage || solarPackage.publicationStatus !== 'published' || solarPackage.availability !== 'available') {
      throw new AppError('PRODUCT_NOT_PURCHASABLE', 'That solar package is not available', 409);
    }
    const components = [];
    for (const component of solarPackage.items) {
      const product = await ProductModel.findById(component.productId).session(session ?? null);
      assertAvailable(product, input.mode);
      const quantity = component.quantity * selected.quantity;
      components.push({
        productId: String(product!._id),
        name: product!.name,
        sku: product!.sku,
        quantity,
        unitPriceKobo: product!.sellingPriceKobo,
        lineTotalKobo: product!.sellingPriceKobo * quantity,
        specificationsSnapshot: product!.specifications,
      });
      addDemand(demandMap, String(product!._id), quantity);
    }
    packageLines.push({
      kind: 'package',
      packageId: String(solarPackage._id),
      name: solarPackage.name,
      sku: solarPackage.slug,
      quantity: selected.quantity,
      unitPriceKobo: solarPackage.priceKobo,
      lineTotalKobo: solarPackage.priceKobo * selected.quantity,
      installationChargeKobo: solarPackage.installationChargeKobo * selected.quantity,
      components,
    });
    if (input.includeInstallation) installationCostKobo += solarPackage.installationChargeKobo * selected.quantity;
  }

  const subtotalKobo = lines.reduce((sum, line) => sum + line.lineTotalKobo, 0) + packageLines.reduce((sum, line) => sum + line.lineTotalKobo, 0);
  const deliveryCostKobo = deliveryFeeKobo(settings, input.state);
  const taxKobo = calculateTax(settings, subtotalKobo + deliveryCostKobo + installationCostKobo);
  return {
    lines,
    packageLines,
    demands: [...demandMap.entries()].map(([productId, quantity]) => ({ productId, quantity })),
    subtotalKobo,
    deliveryCostKobo,
    installationCostKobo,
    taxKobo,
    totalKobo: subtotalKobo + deliveryCostKobo + installationCostKobo + taxKobo,
    currency: 'NGN',
  };
}

function assertAvailable(
  product: { deletedAt?: Date | null; publicationStatus: string; availability: string } | null,
  mode: 'order' | 'quote',
) {
  if (!product || product.deletedAt || product.publicationStatus !== 'published' || product.availability === 'discontinued') {
    throw new AppError('PRODUCT_NOT_PURCHASABLE', 'One or more products are not available', 409);
  }
  if (mode === 'order' && product.availability !== 'in_stock') {
    throw new AppError('PRODUCT_NOT_PURCHASABLE', 'Inactive products cannot be purchased', 409);
  }
}

function addDemand(map: Map<string, number>, productId: string, quantity: number) {
  map.set(productId, (map.get(productId) ?? 0) + quantity);
}
