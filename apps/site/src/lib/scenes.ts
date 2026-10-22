export const scenes = {
  hero: '/images/hero-home.jpg',
  planner: '/images/planner-home.jpg',
  panels: '/images/panels.jpg',
  inverter: '/images/inverter.jpg',
  batteries: '/images/batteries.jpg',
  package: '/images/package.jpg',
  about: '/images/about-showroom.jpg',
  panelProduct: '/images/product-panel.jpg',
  services: {
    'solar-installation': '/images/service-solar.jpg',
    'inverter-installation': '/images/service-inverter.jpg',
    'energy-auditing': '/images/service-audit.jpg',
    maintenance: '/images/service-maintenance.jpg',
    'battery-replacement': '/images/service-battery.jpg',
    'cctv-installation': '/images/service-cctv.jpg',
    consultations: '/images/service-consult.jpg',
  } as Record<string, string>,
};

export function serviceScene(slug: string) {
  return scenes.services[slug] ?? scenes.package;
}

export function sceneForProfile(profile: string) {
  if (profile === 'solar_panel') return scenes.panelProduct;
  if (profile === 'inverter') return scenes.inverter;
  if (profile === 'battery') return scenes.batteries;
  return scenes.package;
}
