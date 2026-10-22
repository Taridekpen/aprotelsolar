import { CategoryModel } from '../models/category.model.js';
import { ServiceModel } from '../models/service.model.js';
import { SolarPackageModel } from '../models/solar-package.model.js';

export function findCategoryBySlug(slug: string) {
  return CategoryModel.findOne({ slug, publicationStatus: 'published' });
}

export function listPublishedCategories() {
  return CategoryModel.find({ publicationStatus: 'published' }).sort({ displayOrder: 1, name: 1 });
}

export function listPublishedServices() {
  return ServiceModel.find({ publicationStatus: 'published' }).sort({ displayOrder: 1, name: 1 });
}

export function findPublishedService(slug: string) {
  return ServiceModel.findOne({ slug, publicationStatus: 'published' });
}

export function listPublishedPackages() {
  return SolarPackageModel.find({ publicationStatus: 'published', availability: 'available' }).sort({ createdAt: -1 });
}

export function findPublishedPackage(slug: string) {
  return SolarPackageModel.findOne({ slug, publicationStatus: 'published' });
}
