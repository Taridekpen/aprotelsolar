import '../config/load-dotenv.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { loadEnv } from '../config/env.js';
import { BranchModel } from '../models/branch.model.js';
import { CategoryModel } from '../models/category.model.js';
import { ContentEntryModel } from '../models/content.model.js';
import { ServiceModel } from '../models/service.model.js';
import { ensureDefaultSettings } from '../services/settings.service.js';

const env = loadEnv();
await connectDatabase(env);
await ensureDefaultSettings();

const categories = [
  ['Solar Panels', 'solar-panels', 'solar_panel'],
  ['Inverters', 'inverters', 'inverter'],
  ['Batteries', 'batteries', 'battery'],
  ['Charge Controllers', 'charge-controllers', 'generic'],
  ['Solar Accessories', 'solar-accessories', 'generic'],
  ['CCTV Systems', 'cctv-systems', 'generic'],
] as const;

for (const [index, [name, slug, specificationProfile]] of categories.entries()) {
  await CategoryModel.updateOne(
    { slug },
    {
      $setOnInsert: {
        name,
        slug,
        description: `${name} supplied and installed by Aprotel Services Nig. Ltd.`,
        specificationProfile,
        displayOrder: index,
        publicationStatus: 'published',
      },
    },
    { upsert: true },
  );
}

const branches = [
  ['Yenagoa Headquarters', 'YEN-HQ', 'Suite 5 Destiny Plaza, Okutukutu, Tamic Junction', 'Yenagoa', 'Bayelsa', '09122948902', true],
  ['Opolo Firman Office', 'YEN-OPOLO', 'Opolo Roundabout', 'Yenagoa', 'Bayelsa', '09074444655', false],
  ['Mbiama Office', 'YEN-MBIAMA', 'Opolo Mbiama', 'Yenagoa', 'Bayelsa', '09040474900', false],
  ['Benin Headquarters', 'BEN-HQ', '37 Airport Road', 'Benin City', 'Edo', '09044407395', false],
  ['Benin Solar Planet', 'BEN-PLANET', 'Subway, Airport Road', 'Benin City', 'Edo', '08071471720', false],
  ['Lagos Alaba Office', 'LOS-ALABA', 'Alaba International Market', 'Lagos', 'Lagos', '09155448006', false],
] as const;

for (const [index, [name, code, addressLine1, city, state, phone, isCentral]] of branches.entries()) {
  await BranchModel.updateOne(
    { code },
    {
      $setOnInsert: {
        name,
        code,
        addressLine1,
        city,
        state,
        country: 'Nigeria',
        phone,
        isCentral,
        status: 'active',
        displayOrder: index,
      },
    },
    { upsert: true },
  );
}

const services = [
  ['Solar Installation', 'solar-installation', 'Design and installation of residential, commercial, and industrial solar systems.'],
  ['Inverter Installation', 'inverter-installation', 'Supply and installation of inverters for backup and hybrid systems.'],
  ['Energy Auditing', 'energy-auditing', 'Review of site loads and existing electrical demand before a system is specified.'],
  ['Maintenance', 'maintenance', 'Inspection and maintenance for installed solar and power equipment.'],
  ['Battery Replacement', 'battery-replacement', 'Replacement of battery banks after the existing equipment has been assessed.'],
  ['CCTV Installation', 'cctv-installation', 'Supply and installation of CCTV surveillance systems.'],
  ['Consultations', 'consultations', 'Technical consultation for solar, backup power, and security projects.'],
] as const;

for (const [index, [name, slug, description]] of services.entries()) {
  await ServiceModel.updateOne(
    { slug },
    { $setOnInsert: { name, slug, description, features: [], availability: 'available', displayOrder: index, publicationStatus: 'published' } },
    { upsert: true },
  );
}

const content = [
  {
    type: 'about',
    slug: 'company',
    title: 'About Aprotel',
    body: {
      heading: 'Aprotel Services Nig. Ltd.',
      body: 'Aprotel Services Nig. Ltd. supplies solar equipment, installs solar and CCTV systems, and supports homes and businesses from offices in Bayelsa, Edo, and Lagos.',
    },
  },
  {
    type: 'contact_info',
    slug: 'main',
    title: 'Contact',
    body: {
      heading: 'Talk to Aprotel',
      body: 'Call the Yenagoa headquarters on 09122948902 or visit Suite 5 Destiny Plaza, Okutukutu, Tamic Junction.',
    },
  },
  {
    type: 'homepage_hero',
    slug: 'primary',
    title: 'Homepage hero',
    body: {
      headline: 'Solar power and security for homes and businesses',
      subheadline: 'Equipment sales, installation, maintenance, and CCTV from Aprotel Services Nig. Ltd.',
      primaryCtaLabel: 'Request a quotation',
      primaryCtaHref: '/contact',
      secondaryCtaLabel: 'Browse equipment',
      secondaryCtaHref: '/products',
    },
  },
] as const;

for (const [index, entry] of content.entries()) {
  await ContentEntryModel.updateOne(
    { type: entry.type, slug: entry.slug },
    { $setOnInsert: { ...entry, summary: '', displayOrder: index, publicationStatus: 'published', seo: { title: entry.title, description: '' } } },
    { upsert: true },
  );
}

console.log('Seed data is in place.');
await disconnectDatabase();
