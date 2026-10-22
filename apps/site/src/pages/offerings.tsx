import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, apiList } from '../lib/api';
import { cart } from '../lib/cart';
import { mapsLink, naira } from '../lib/format';
import type { ContentPage, Product, Service, SolarPackage } from '../lib/types';
import { textBody } from '../lib/types';
import { ErrorNote, Loading, Photo, useSeo } from '../components/chrome';
import { scenes, serviceScene } from '../lib/scenes';

export function ServicesPage() {
  const services = useQuery({ queryKey: ['services'], queryFn: () => api<Service[]>('/api/v1/services') });
  useSeo('Services');
  return (
    <div className="wrap page">
      <p className="eyebrow">Services</p>
      <h1>Installation, maintenance, and security</h1>
      <ErrorNote error={services.error} />
      {services.isLoading ? <Loading /> : null}
      <ol className="side-list" style={{ listStyle: 'none', padding: 0 }}>
        {services.data?.map((service) => (
          <li key={service.id}>
            <Link to={`/services/${service.slug}`}>
              <Photo id={service.imageIds[0]} alt="" sizes="72px" fallback={serviceScene(service.slug)} />
              <span>
                <strong>{service.name}</strong>
                <br />{service.description}
                <br />{service.startingPrice ? `From ${naira(service.startingPrice)}` : 'Price on consultation'}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ServicePage() {
  const { slug = '' } = useParams();
  const service = useQuery({ queryKey: ['service', slug], queryFn: () => api<Service>(`/api/v1/services/${slug}`) });
  const products = useQuery({ queryKey: ['products', 'service'], queryFn: () => apiList<Product>('/api/v1/products?pageSize=100'), enabled: Boolean(service.data?.relatedProductIds.length) });
  useSeo(service.data?.name ?? 'Service', service.data?.description);
  if (service.isLoading) return <Loading />;
  if (!service.data) return <div className="wrap page"><ErrorNote error={service.error} /></div>;
  const item = service.data;
  const related = products.data?.items.filter((product) => item.relatedProductIds.includes(product.id)) ?? [];
  return (
    <article className="wrap page">
      <p className="eyebrow">Service</p>
      <h1>{item.name}</h1>
      <Photo id={item.imageIds[0]} alt={item.name} priority fallback={serviceScene(item.slug)} />
      <p>{item.description}</p>
      {item.startingPrice ? <p>From {naira(item.startingPrice)}</p> : <p>Aprotel quotes this service after a consultation.</p>}
      {item.features.length ? <ul>{item.features.map((feature) => <li key={feature}>{feature}</li>)}</ul> : null}
      <p><Link className="btn" to={`/contact?type=consultation&service=${encodeURIComponent(item.name)}`}>Request a consultation</Link></p>
      {related.length ? <ul>{related.map((product) => <li key={product.id}><Link to={`/products/${product.slug}`}>{product.name}</Link></li>)}</ul> : null}
    </article>
  );
}

export function PackagesPage() {
  const packages = useQuery({ queryKey: ['packages'], queryFn: () => apiList<SolarPackage>('/api/v1/solar-packages?pageSize=50') });
  useSeo('Solar packages');
  return (
    <div className="wrap page">
      <p className="eyebrow">Systems</p>
      <h1>Solar packages</h1>
      <p className="note">Runtime figures are the assumptions saved with each package. They are not a verified yield calculation.</p>
      <ErrorNote error={packages.error} />
      {packages.isLoading ? <Loading /> : null}
      {(packages.data?.items ?? []).map((item) => (
        <article key={item.id} className="prose-split">
          <Photo id={item.imageIds[0]} alt={item.name} fallback={scenes.package} />
          <div>
            <h2><Link to={`/packages/${item.slug}`}>{item.name}</Link></h2>
            <p>{item.solarPanelCapacityKw} kW panels · {item.batteryCapacityKwh} kWh battery · {item.inverterSummary}</p>
            <p>At a stated load of {item.runtimeAssumptions.loadWatts} W{item.runtimeAssumptions.estimatedRuntimeHours != null ? `, the recorded assumption is ${item.runtimeAssumptions.estimatedRuntimeHours} hours` : ''}. {item.runtimeAssumptions.operatingNotes}</p>
            <p className="price">{naira(item.price)} <span className="note">plus {naira(item.installationCharge)} installation</span></p>
          </div>
        </article>
      ))}
      {packages.data?.items.length === 0 ? <p>No packages are published yet.</p> : null}
    </div>
  );
}

export function PackagePage() {
  const { slug = '' } = useParams();
  const itemQuery = useQuery({ queryKey: ['package', slug], queryFn: () => api<SolarPackage>(`/api/v1/solar-packages/${slug}`) });
  const products = useQuery({ queryKey: ['products', 'package-contents'], queryFn: () => apiList<Product>('/api/v1/products?pageSize=100') });
  useSeo(itemQuery.data?.name ?? 'Solar package');
  if (itemQuery.isLoading) return <Loading />;
  if (!itemQuery.data) return <div className="wrap page"><ErrorNote error={itemQuery.error} /></div>;
  const item = itemQuery.data;
  return (
    <article className="wrap page">
      <p className="eyebrow">Package</p>
      <h1>{item.name}</h1>
      <Photo id={item.imageIds[0]} alt={item.name} priority fallback={scenes.package} />
      <p>{item.description}</p>
      <table className="spec-table">
        <tbody>
          <tr><th scope="row">Panel capacity</th><td>{item.solarPanelCapacityKw} kW</td></tr>
          <tr><th scope="row">Battery capacity</th><td>{item.batteryCapacityKwh} kWh</td></tr>
          <tr><th scope="row">Inverter</th><td>{item.inverterSummary}</td></tr>
          <tr><th scope="row">Recorded load</th><td>{item.runtimeAssumptions.loadWatts} W</td></tr>
          <tr><th scope="row">Recorded runtime</th><td>{item.runtimeAssumptions.estimatedRuntimeHours == null ? 'Not stated' : `${item.runtimeAssumptions.estimatedRuntimeHours} hours at the recorded load`}</td></tr>
          <tr><th scope="row">Operating notes</th><td>{item.runtimeAssumptions.operatingNotes}</td></tr>
          <tr><th scope="row">Package price</th><td>{naira(item.price)}</td></tr>
          <tr><th scope="row">Installation charge</th><td>{naira(item.installationCharge)}</td></tr>
          {item.warranty ? <tr><th scope="row">Warranty</th><td>{item.warranty}</td></tr> : null}
        </tbody>
      </table>
      <h2>Included equipment</h2>
      <ul>
        {item.items.map((part) => {
          const product = products.data?.items.find((candidate) => candidate.id === part.productId);
          return <li key={part.productId}>{part.quantity} × {product ? <Link to={`/products/${product.slug}`}>{product.name}</Link> : 'Published product'}</li>;
        })}
      </ul>
      <p>
        <Link className="btn" to={`/quote?package=${item.id}`}>Request a quotation</Link>
        {item.availability === 'available' ? (
          <button className="btn-line" type="button" onClick={() => cart.add({ kind: 'package', id: item.id, slug: item.slug, name: item.name, unitPrice: item.price, imageId: item.imageIds[0] })}>Add to cart</button>
        ) : <span> This package is not available to purchase.</span>}
      </p>
    </article>
  );
}

export function ProjectsPage() {
  const page = useQuery({ queryKey: ['content', 'installations'], queryFn: () => api<ContentPage>('/api/v1/content/installations') });
  useSeo('Projects');
  return (
    <div className="wrap page">
      <p className="eyebrow">Work</p>
      <h1>Completed installations</h1>
      <ErrorNote error={page.error} />
      {page.isLoading ? <Loading /> : null}
      {page.data?.items.length === 0 ? <p>Project galleries appear here when they are published.</p> : null}
      {page.data?.items.map((entry) => (
        <article className="spread" key={entry.id}>
          <Photo id={entry.imageIds[0]} alt={entry.title} fallback={scenes.hero} />
          <div>
            <h2>{textBody(entry.body, 'title') || entry.title}</h2>
            <p>{textBody(entry.body, 'location')}</p>
            <p>{textBody(entry.body, 'summary') || textBody(entry.body, 'caption') || entry.summary}</p>
            {entry.imageIds.length > 1 ? (
              <div className="thumbs">
                {entry.imageIds.slice(1).map((id) => <Photo key={id} id={id} alt="" sizes="64px" />)}
              </div>
            ) : null}
            {textBody(entry.body, 'location') ? <p><a href={mapsLink([textBody(entry.body, 'location')])}>Map</a></p> : null}
          </div>
        </article>
      ))}
    </div>
  );
}
