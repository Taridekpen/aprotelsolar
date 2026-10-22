import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { api, apiList, queryString } from '../lib/api';
import { cart, compareList, emptyCompare } from '../lib/cart';
import { naira, specificationRows, mediaUrl } from '../lib/format';
import type { Category, Product } from '../lib/types';
import { ErrorNote, Loading, Photo, useSeo } from '../components/chrome';
import { sceneForProfile } from '../lib/scenes';

export function ProductsPage() {
  const [params, setParams] = useSearchParams();
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/api/v1/categories') });
  const query = {
    q: params.get('q') ?? '',
    category: params.get('category') ?? '',
    brand: params.get('brand') ?? '',
    specificationProfile: params.get('profile') ?? '',
    minPrice: params.get('min') ?? '',
    maxPrice: params.get('max') ?? '',
    sort: params.get('sort') ?? 'createdAt',
    order: params.get('order') ?? 'desc',
    page: params.get('page') ?? '1',
  };
  const products = useQuery({
    queryKey: ['products', query],
    queryFn: () => apiList<Product>(`/api/v1/products${queryString({ ...query, pageSize: 12 })}`),
  });
  useSeo('Solar equipment');
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const [key, value] of data.entries()) if (String(value)) next.set(key, String(value));
    setParams(next);
  }
  return (
    <div className="wrap page">
      <p className="eyebrow">Marketplace</p>
      <h1>Solar equipment</h1>
      <p className="note">Published products from the Aprotel catalogue. Prices are in naira.</p>
      <form className="filters" onSubmit={apply}>
        <label className="field">Search<input name="q" defaultValue={query.q} /></label>
        <label className="field">Category
          <select name="category" defaultValue={query.category}>
            <option value="">All</option>
            {categories.data?.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
        <label className="field">Brand<input name="brand" defaultValue={query.brand} /></label>
        <label className="field">Equipment type
          <select name="profile" defaultValue={query.specificationProfile}>
            <option value="">Any</option>
            <option value="solar_panel">Solar panel</option>
            <option value="battery">Battery</option>
            <option value="inverter">Inverter</option>
            <option value="generic">Other</option>
          </select>
        </label>
        <label className="field">Minimum price (₦)<input name="min" inputMode="decimal" defaultValue={query.minPrice} /></label>
        <label className="field">Maximum price (₦)<input name="max" inputMode="decimal" defaultValue={query.maxPrice} /></label>
        <label className="field">Sort
          <select name="sort" defaultValue={query.sort}>
            <option value="createdAt">Newest</option>
            <option value="price">Price</option>
            <option value="name">Name</option>
            <option value="brand">Brand</option>
          </select>
        </label>
        <label className="field">Order
          <select name="order" defaultValue={query.order}><option value="desc">Descending</option><option value="asc">Ascending</option></select>
        </label>
        <button className="btn" type="submit">Apply</button>
      </form>
      <ErrorNote error={products.error} />
      {products.isLoading ? <Loading /> : null}
      <table className="catalogue">
        <thead><tr><th></th><th>Product</th><th>Price</th><th></th></tr></thead>
        <tbody>
          {products.data?.items.map((product) => <ProductRow key={product.id} product={product} />)}
        </tbody>
      </table>
      {products.data && products.data.items.length === 0 ? <p>No published products match these filters.</p> : null}
      {products.data ? (
        <div className="pager">
          <button className="btn-line" type="button" disabled={query.page === '1'} onClick={() => setParams((current) => { current.set('page', String(Number(query.page) - 1)); return current; })}>Previous</button>
          <span>Page {products.data.meta.page} of {products.data.meta.pageCount || 1}</span>
          <button className="btn-line" type="button" disabled={products.data.meta.page >= products.data.meta.pageCount} onClick={() => setParams((current) => { current.set('page', String(Number(query.page) + 1)); return current; })}>Next</button>
          <Link to="/compare">Compare</Link>
        </div>
      ) : null}
    </div>
  );
}

function ProductRow({ product }: { product: Product }) {
  const selected = useSyncExternalStore(compareList.subscribe, () => compareList.getSnapshot().includes(product.slug), () => false);
  return (
    <tr>
      <td><Photo id={product.imageIds[0]} alt="" sizes="72px" fallback={sceneForProfile(product.specificationProfile)} /></td>
      <td><Link to={`/products/${product.slug}`}><strong>{product.name}</strong></Link><br /><span className="note">{product.brand} · {product.sku}</span></td>
      <td className="price">{naira(product.sellingPrice)}</td>
      <td>
        <button className="btn" type="button" onClick={() => cart.add({ kind: 'product', id: product.id, slug: product.slug, name: product.name, unitPrice: product.sellingPrice, imageId: product.imageIds[0] })}>Add</button>
        <button className="btn-line" type="button" onClick={() => compareList.toggle(product.slug)}>{selected ? 'Compared' : 'Compare'}</button>
      </td>
    </tr>
  );
}

export function ProductPage() {
  const { slug = '' } = useParams();
  const [quantity, setQuantity] = useState(1);
  const [image, setImage] = useState(0);
  const product = useQuery({ queryKey: ['product', slug], queryFn: () => api<Product>(`/api/v1/products/${slug}`) });
  const related = useQuery({
    queryKey: ['products', 'related', product.data?.categoryId],
    enabled: Boolean(product.data),
    queryFn: () => apiList<Product>(`/api/v1/products${queryString({ category: product.data?.categoryId, pageSize: 5 })}`),
  });
  useSeo(product.data?.name ?? 'Product', product.data?.shortDescription);
  useEffect(() => {
    if (!product.data) return;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.data.name,
      sku: product.data.sku,
      brand: product.data.brand,
      description: product.data.shortDescription,
      image: product.data.imageIds.map((id) => mediaUrl(id, 'original')),
      offers: {
        '@type': 'Offer',
        priceCurrency: 'NGN',
        price: product.data.sellingPrice,
      },
    });
    document.head.appendChild(script);
    return () => script.remove();
  }, [product.data]);
  if (product.isLoading) return <Loading />;
  if (product.error || !product.data) return <div className="wrap page"><ErrorNote error={product.error ?? new Error('Product was not found')} /></div>;
  const item = product.data;
  const rows = specificationRows(item.specifications);
  const current = item.imageIds[image] ?? item.imageIds[0];
  return (
    <article className="wrap page">
      <div className="product-layout">
        <div>
          <div className="gallery-main"><Photo id={current} alt={item.name} priority sizes="(max-width: 860px) 100vw, 50vw" fallback={sceneForProfile(item.specificationProfile)} /></div>
          <div className="thumbs">
            {item.imageIds.map((id, index) => (
              <button key={id} type="button" aria-current={index === image} onClick={() => setImage(index)}>
                <Photo id={id} alt="" sizes="64px" />
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="eyebrow">{item.brand}</p>
          <h1>{item.name}</h1>
          <p className="price">{naira(item.sellingPrice)}{item.compareAtPrice ? <span className="compare-at">{naira(item.compareAtPrice)}</span> : null}</p>
          <p className="note">Catalogue price. Aprotel confirms the total when you send a request.</p>
          <p>{item.shortDescription}</p>
          <label className="field">Quantity<input type="number" min={1} max={99} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>
          <p>
            <button className="btn" type="button" disabled={quantity < 1} onClick={() => cart.add({ kind: 'product', id: item.id, slug: item.slug, name: item.name, unitPrice: item.sellingPrice, quantity, imageId: item.imageIds[0] })}>Add to cart</button>
            <Link className="btn-line" to={`/contact?product=${item.id}&type=installation`}>Installation enquiry</Link>
          </p>
          {item.warranty ? <p><strong>Warranty.</strong> {item.warranty}</p> : null}
          {item.installationRequirements ? <p>{item.installationRequirements}</p> : null}
          <p className="note">{item.specificationsVerified ? 'Electrical specifications are marked verified by Aprotel engineering.' : 'Specifications are published as supplied. They have not been marked verified.'} No separate compatibility list is published for this product.</p>
        </div>
      </div>
      <h2>Specifications</h2>
      {rows.length ? (
        <table className="spec-table">
          <tbody>{rows.map((row) => <tr key={row.key}><th scope="row">{row.label}</th><td>{row.value}</td></tr>)}</tbody>
        </table>
      ) : <p>No technical specifications have been published for this product.</p>}
      <h2>Description</h2>
      <p>{item.description}</p>
      <h2>Related equipment</h2>
      <ul>
        {related.data?.items.filter((other) => other.id !== item.id).slice(0, 4).map((other) => (
          <li key={other.id}><Link to={`/products/${other.slug}`}>{other.name}</Link> — {naira(other.sellingPrice)}</li>
        ))}
      </ul>
    </article>
  );
}

export function ComparePage() {
  const slugs = useSyncExternalStore(compareList.subscribe, compareList.getSnapshot, () => emptyCompare);
  const products = useQuery({
    queryKey: ['compare', slugs],
    queryFn: async () => Promise.all(slugs.map((slug) => api<Product>(`/api/v1/products/${slug}`))),
  });
  useSeo('Compare equipment');
  const keys = [...new Set((products.data ?? []).flatMap((product) => specificationRows(product.specifications).map((row) => row.key)))];
  return (
    <div className="wrap page">
      <h1>Compare</h1>
      <p className="note">Up to three published products. Empty cells mean the specification was not published.</p>
      {slugs.length === 0 ? <p>Choose products from the catalogue.</p> : null}
      <ErrorNote error={products.error} />
      {products.data ? (
        <table className="spec-table">
          <thead><tr><th></th>{products.data.map((product) => <th key={product.id}>{product.name}</th>)}</tr></thead>
          <tbody>
            <tr><th scope="row">Price</th>{products.data.map((product) => <td key={product.id}>{naira(product.sellingPrice)}</td>)}</tr>
            {keys.map((key) => (
              <tr key={key}>
                <th scope="row">{specificationRows({ [key]: 'x' })[0]?.label ?? key}</th>
                {products.data?.map((product) => <td key={product.id}>{specificationRows(product.specifications).find((row) => row.key === key)?.value ?? '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
