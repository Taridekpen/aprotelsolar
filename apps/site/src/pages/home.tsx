import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { APPLIANCE_CATALOGUE } from '@aprotel/solar-engine';
import { api, apiList, queryString } from '../lib/api';
import { cart } from '../lib/cart';
import { naira } from '../lib/format';
import type { Branch, Category, ContentPage, Product, Service, SolarPackage } from '../lib/types';
import { textBody } from '../lib/types';
import { ErrorNote, Loading, Photo, Reveal, useSeo } from '../components/chrome';
import { sceneForProfile, scenes, serviceScene } from '../lib/scenes';

const QUICK = ['Refrigerator', 'LED light', 'Fan'] as const;

export function HomePage() {
  const home = useQuery({ queryKey: ['content', 'home'], queryFn: () => api<ContentPage>('/api/v1/content/home') });
  const about = useQuery({ queryKey: ['content', 'about'], queryFn: () => api<ContentPage>('/api/v1/content/about') });
  const projects = useQuery({ queryKey: ['content', 'installations'], queryFn: () => api<ContentPage>('/api/v1/content/installations') });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/api/v1/categories') });
  const products = useQuery({ queryKey: ['products', 'home'], queryFn: () => apiList<Product>(`/api/v1/products${queryString({ pageSize: 8, sort: 'createdAt' })}`) });
  const services = useQuery({ queryKey: ['services'], queryFn: () => api<Service[]>('/api/v1/services') });
  const packages = useQuery({ queryKey: ['packages', 'home'], queryFn: () => apiList<SolarPackage>('/api/v1/solar-packages?pageSize=4') });
  const branches = useQuery({ queryKey: ['branches'], queryFn: () => api<Branch[]>('/api/v1/branches') });
  const [added, setAdded] = useState('');

  const hero = home.data?.items.find((item) => item.type === 'homepage_hero');
  const aboutEntry = about.data?.items.find((item) => item.type === 'about');
  const publishedHeadline = hero ? textBody(hero.body, 'headline') || hero.title : '';
  const headline = publishedHeadline && publishedHeadline !== 'Aprotel Solar' ? publishedHeadline : 'Reliable solar solutions for homes and businesses';
  const subheadline = hero ? textBody(hero.body, 'subheadline') || hero.summary : 'Panels, inverters, batteries, and installation from Aprotel Services Nig. Ltd.';
  useSeo(hero?.seo.title || 'Solar equipment and installation', hero?.seo.description || subheadline);
  const catalogue = products.data?.items ?? [];
  const projectItems = (projects.data?.items ?? []).filter((item) => item.type === 'completed_installation' || item.type === 'project_gallery');
  const central = branches.data?.find((branch) => branch.isCentral) ?? branches.data?.[0];
  const solutions = solutionLinks(categories.data ?? []);

  if (home.isLoading) return <Loading label="Loading the homepage" />;
  return (
    <>
      <ErrorNote error={home.error} />
      <section className="home-hero">
        <div className="copy">
          <p className="kicker">Clean energy, brighter living</p>
          <h1>{headline.includes('homes and businesses') ? <>Reliable solar solutions for <span className="gold">homes and businesses</span></> : headline}</h1>
          {subheadline ? <p className="lede">{subheadline}</p> : null}
          <div className="hero-actions">
            <Link className="btn" to="/products">Explore products</Link>
            <Link className="btn-gold" to="/calculate">Calculate your solar needs</Link>
          </div>
        </div>
        <div className="hero-art">
          <img src={scenes.hero} alt="A home with rooftop solar panels at dusk" />
        </div>
      </section>
      <div className="wrap">
        <Reveal>
        <div className="trust-row">
          <article><strong>Published prices</strong><span>What you see is the current catalogue price.</span></article>
          <article><strong>Named equipment</strong><span>Recommendations use verified, in-stock products only.</span></article>
          <article><strong>Installation support</strong><span>Ask for a visit from the contact page.</span></article>
          <article><strong>Engineer review</strong><span>A custom system stays pending until it is approved.</span></article>
        </div>
        </Reveal>
      </div>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <div>
              <h2>Find the right solar solution</h2>
              <p className="note">Open a category, or start from the appliances you already own.</p>
            </div>
          </div>
          <Reveal>
          <div className="solution-grid">
            {solutions.map((item) => (
              <Link className="solution-card" key={item.href} to={item.href}>
                <div className="media">{item.imageId ? <Photo id={item.imageId} alt="" /> : <img src={item.scene} alt="" />}</div>
                <div>
                  <h3>{item.title}</h3>
                  <p className="note">{item.text}</p>
                  <span className="text-link">{item.action}</span>
                </div>
              </Link>
            ))}
          </div>
          </Reveal>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <Reveal><QuickPlanner /></Reveal>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="section-head">
            <h2>{catalogue.some((product) => product.featured) ? 'Featured products' : 'Catalogue'}</h2>
            <Link className="text-link" to="/products">View all products</Link>
          </div>
          {catalogue.length ? (
            <div className="product-row">
              {catalogue.slice(0, 4).map((product) => (
                  <article className="product-card" key={product.id}>
                    {product.featured ? <span className="pill">Featured</span> : null}
                    <Link to={`/products/${product.slug}`}>
                      <div className="media"><Photo id={product.imageIds[0]} alt={product.name} fallback={sceneForProfile(product.specificationProfile)} /></div>
                      <h3>{product.name}</h3>
                    </Link>
                    <strong className="price">{naira(product.sellingPrice)}</strong>
                    <button className="btn" type="button" onClick={() => { cart.add({ kind: 'product', id: product.id, slug: product.slug, name: product.name, unitPrice: product.sellingPrice, imageId: product.imageIds[0] }); setAdded(product.id); }}>{added === product.id ? 'Added' : 'Add to cart'}</button>
                  </article>
              ))}
            </div>
          ) : <p>Published products will appear here.</p>}
          {(packages.data?.items.length ?? 0) > 0 ? (
            <p className="note" style={{ marginTop: 16 }}>{packages.data?.items.length} solar {packages.data?.items.length === 1 ? 'package is' : 'packages are'} published. <Link to="/packages">View packages</Link></p>
          ) : null}
        </div>
      </section>

      {(services.data?.length ?? 0) > 0 ? (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="section-head">
              <h2>Our services</h2>
              <Link className="text-link" to="/services">View all services</Link>
            </div>
            <div className="service-grid">
              {services.data?.map((service) => (
                <Link className="service-card" key={service.id} to={`/services/${service.slug}`}>
                  <div className="media">{service.imageIds[0] ? <Photo id={service.imageIds[0]} alt="" /> : <img src={serviceScene(service.slug)} alt="" />}</div>
                  <div>
                    <h3>{service.name}</h3>
                    <p className="note">{service.description}</p>
                    <span className="text-link">Learn more</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="section why">
        <div className="wrap">
          <div>
            <h2>Why Aprotel Solar</h2>
            <p>{aboutEntry ? textBody(aboutEntry.body, 'body') || aboutEntry.summary : 'Equipment, installation, and maintenance from offices you can visit.'}</p>
            <Link className="btn-gold" to="/about">About the company</Link>
          </div>
          <div className="why-grid">
            <div><h3>Catalogue you can check</h3><p>Product pages show the published specification, price, and stock.</p></div>
            <div><h3>A calculator that shows its working</h3><p>Wattage, hours, and backup duration drive the result. Missing equipment is not invented.</p></div>
            <div><h3>Offices in published locations</h3><p>{branches.data?.length ? branches.data.map((branch) => branch.city).filter((city, index, list) => list.indexOf(city) === index).join(', ') : 'Branch addresses appear when they are published.'}</p></div>
            <div><h3>A quotation before you commit</h3><p>Guest quotations keep the calculation that was submitted. An engineer still has to approve a custom installation.</p></div>
          </div>
        </div>
      </section>

      {projectItems.length ? (
        <section className="section">
          <div className="wrap">
            <div className="section-head">
              <h2>Recent installations</h2>
              <Link className="text-link" to="/projects">View all projects</Link>
            </div>
            <div className="project-grid">
              {projectItems.slice(0, 4).map((project) => (
                <Link className="project-card" key={project.id} to="/projects">
                  <div className="media"><Photo id={project.imageIds[0]} alt="" fallback={scenes.hero} /></div>
                  <h3>{textBody(project.body, 'title') || project.title}</h3>
                  <p className="note">{textBody(project.body, 'location') || project.summary}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="section cta-band">
        <div className="wrap">
          <div>
            <h2>Plan the system, then talk to Aprotel.</h2>
            <p>Size the load yourself, or send a consultation request. {central ? `Call ${central.phone}.` : ''}</p>
          </div>
          <div className="cta-actions">
            <Link className="btn-gold" to="/contact">Request a consultation</Link>
            <Link className="btn" to="/calculate">Open the calculator</Link>
          </div>
        </div>
      </section>
    </>
  );
}

function QuickPlanner() {
  const [counts, setCounts] = useState<Record<string, number>>({ Refrigerator: 1, 'LED light': 4, Fan: 1 });
  const [hours, setHours] = useState(8);
  const params = new URLSearchParams();
  for (const [name, quantity] of Object.entries(counts)) if (quantity > 0) params.set(name, String(quantity));
  params.set('hours', String(hours));
  return (
    <div className="planner">
      <div className="planner-art">
        <img src={scenes.planner} alt="A bungalow with rooftop solar panels" />
      </div>
      <div>
        <p className="kicker" style={{ background: 'white', color: 'var(--color-brand)' }}>Solar calculator</p>
        <h2>Power your appliances your way</h2>
        <p>Tap the quantity, set how many hours they run, and open a sized result. Wattage defaults are estimates.</p>
        <div className="quick-list">
          {QUICK.map((name) => {
            const preset = APPLIANCE_CATALOGUE.find((item) => item.name === name);
            return (
              <div className="quick-row" key={name}>
                <div>
                  <strong>{name}</strong>
                  <small className="note">{counts[name]} × {preset?.wattage ?? '—'} W</small>
                </div>
                <Stepper label={name} value={counts[name] ?? 0} min={0} max={20} onChange={(value) => setCounts((current) => ({ ...current, [name]: value }))} />
              </div>
            );
          })}
          <div className="quick-row">
            <div><strong>Hours each day</strong><small className="note">Applied to every appliance above.</small></div>
            <Stepper label="hours each day" value={hours} min={1} max={24} onChange={setHours} />
          </div>
        </div>
        <Link className="btn" to={`/calculate?${params.toString()}`}>Calculate now</Link>
      </div>
    </div>
  );
}

export function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      <b>{value}</b>
      <button type="button" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

function solutionLinks(categories: Category[]) {
  const find = (profile: string, words: string[]) => categories.find((category) => category.specificationProfile === profile || words.some((word) => category.name.toLowerCase().includes(word)));
  const panel = find('solar_panel', ['panel']);
  const inverter = find('inverter', ['inverter']);
  const battery = find('battery', ['batter']);
  return [
    { title: 'Solar panels', short: 'Panels', text: 'Published panel listings.', href: panel ? `/products?category=${panel.id}` : '/products?profile=solar_panel', action: 'View panels', imageId: panel?.imageId, scene: scenes.panels },
    { title: 'Inverters', short: 'Inverters', text: 'Hybrid and off-grid listings.', href: inverter ? `/products?category=${inverter.id}` : '/products?profile=inverter', action: 'View inverters', imageId: inverter?.imageId, scene: scenes.inverter },
    { title: 'Batteries', short: 'Batteries', text: 'Storage with a published specification.', href: battery ? `/products?category=${battery.id}` : '/products?profile=battery', action: 'View batteries', imageId: battery?.imageId, scene: scenes.batteries },
    { title: 'Complete packages', short: 'Packages', text: 'Pre-configured systems when a package is published.', href: '/packages', action: 'View packages', imageId: null, scene: scenes.package },
  ];
}
