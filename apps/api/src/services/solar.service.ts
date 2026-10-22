import { calculateEnergyRequirements, recommendSystem, type CalculateInput, type CatalogueItem, type RecommendInput } from '@aprotel/solar-engine';
import { ProductModel } from '../models/product.model.js';
import { branchAvailability } from './inventory.service.js';
import { getSettings } from './settings.service.js';

async function engineOptions() {
  const settings = await getSettings();
  return {
    safetyMarginFraction: settings.calculator.safetyMarginPercent / 100,
    fallbackPeakSunHours: settings.calculator.defaultPeakSunHours,
    genericDod: settings.calculator.defaultDodPercent / 100,
  };
}

export async function calculateSolar(input: CalculateInput) {
  return calculateEnergyRequirements(input, await engineOptions());
}

export async function recommendSolar(input: RecommendInput) {
  const products = await ProductModel.find({
    deletedAt: null,
    publicationStatus: 'published',
    specificationProfile: { $in: ['solar_panel', 'battery', 'inverter'] },
  });
  const stock = await branchAvailability(products.map((product) => String(product._id)));
  const catalogue: CatalogueItem[] = products.map((product) => ({
    id: String(product._id),
    slug: product.slug,
    name: product.name,
    sku: product.sku,
    brand: product.brand,
    profile: product.specificationProfile as CatalogueItem['profile'],
    sellingPriceNaira: product.sellingPriceKobo / 100,
    inventoryQuantity: product.inventoryQuantity,
    warranty: product.warranty,
    imageId: product.imageIds[0] ? String(product.imageIds[0]) : null,
    specificationsVerified: product.specificationsVerified,
    specifications: (product.specifications ?? {}) as Record<string, unknown>,
    branches: stock.get(String(product._id)) ?? [],
  }));
  const result = recommendSystem(input, catalogue, await engineOptions());
  const verifiedPublishedProducts = catalogue.filter((item) => item.specificationsVerified && item.inventoryQuantity > 0).length;
  return {
    ...result,
    eligibility: {
      verifiedPublishedProducts,
      readyForRecommendation: result.status === 'designed',
      blockers: result.design.selected ? [] : result.design.warnings.map((warning) => warning.message),
    },
  };
}
