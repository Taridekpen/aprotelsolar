import { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiList, queryString } from '../lib/api';
import { moneyInput, naira, numberInput, tagList } from '../lib/format';
import { useCan } from '../session';
import { MediaPicker } from '../components/media-picker';
import { Badge, Empty, ErrorText, Field, FilterForm, Loading, Pager, UnsavedDialog, useConfirm, useToast, useUnsaved } from '../components/ui';

type Category = { id: string; name: string; specificationProfile: string; parentId: string | null; publicationStatus: string };
type Product = {
  id: string;
  name: string;
  slug: string;
  sku: string;
  brand: string;
  categoryId: string;
  description: string;
  shortDescription: string;
  sellingPrice: string;
  compareAtPrice: string | null;
  costPrice?: string;
  imageIds: string[];
  specifications: Record<string, unknown>;
  specificationProfile: string;
  specificationsVerified: boolean;
  warranty: string;
  installationRequirements: string;
  featured: boolean;
  publicationStatus: string;
};

const PANEL = ['ratedWattageW', 'voc', 'vmp', 'isc', 'imp', 'tempCoeffPmaxPctPerC', 'tempCoeffVocPctPerC', 'tempCoeffIscPctPerC', 'lengthMm', 'widthMm', 'depthMm', 'weightKg'] as const;
const BATTERY = ['nominalVoltage', 'ampHours', 'nominalKwh', 'usableDodPercent', 'continuousDischargeCurrentA', 'maxChargeCurrentA'] as const;
const INVERTER = ['ratedContinuousPowerW', 'vaRating', 'surgeRatingW', 'surgeDurationSeconds', 'batteryVoltage', 'efficiencyPercent', 'mpptMinV', 'mpptMaxV', 'maxPvVoltage', 'maxPvInputCurrentA'] as const;

export function ProductListPage() {
  const [params, setParams] = useSearchParams();
  const can = useCan();
  const confirm = useConfirm();
  const toast = useToast();
  const client = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const query = useQuery({
    queryKey: ['products', params.toString()],
    queryFn: () => apiList<Product>(`/api/v1/admin/products${queryString({
      page: params.get('page') ?? 1,
      pageSize: 20,
      q: params.get('q') ?? undefined,
      status: params.get('status') ?? undefined,
      brand: params.get('brand') ?? undefined,
      category: params.get('category') ?? undefined,
      sort: params.get('sort') ?? 'createdAt',
      order: params.get('order') ?? 'desc',
    })}`),
  });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/api/v1/admin/categories') });

  async function bulk(action: 'publish' | 'unpublish' | 'inactive' | 'archive') {
    const verb = action === 'archive' ? 'Archive' : action === 'inactive' ? 'Mark inactive' : action === 'publish' ? 'Publish' : 'Unpublish';
    const ok = await confirm({ title: `${verb} ${selected.length} products?`, body: 'Each product is updated through the catalogue API.', confirmLabel: verb, danger: action === 'archive' });
    if (!ok) return;
    const failures: string[] = [];
    for (const id of selected) {
      try {
        if (action === 'publish') await api(`/api/v1/admin/products/${id}/publish`, { method: 'POST', json: {} });
        else if (action === 'unpublish') await api(`/api/v1/admin/products/${id}/unpublish`, { method: 'POST', json: {} });
        else if (action === 'archive') await api(`/api/v1/admin/products/${id}`, { method: 'DELETE' });
        else await api(`/api/v1/admin/products/${id}`, { method: 'PATCH', json: { publicationStatus: 'inactive' } });
      } catch (error) {
        failures.push(error instanceof Error ? error.message : 'Update failed');
      }
    }
    setSelected([]);
    await client.invalidateQueries({ queryKey: ['products'] });
    toast(failures.length ? `${failures.length} products were not updated.` : 'Products updated.');
  }

  return (
    <div>
      <div className="page-head">
        <p>Prices and publication changes are stored in the catalogue and shown on the public site when published.</p>
        {can('products:write') ? <Link className="btn" to="/products/new">Add product</Link> : null}
      </div>
      <FilterForm
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const next = new URLSearchParams(params);
          for (const key of ['q', 'status', 'brand', 'category', 'sort', 'order']) {
            const value = String(form.get(key) ?? '');
            if (value) next.set(key, value);
            else next.delete(key);
          }
          next.delete('page');
          setParams(next);
        }}
      >
        <input name="q" defaultValue={params.get('q') ?? ''} placeholder="Search name, SKU, brand" aria-label="Search products" />
        <select name="status" defaultValue={params.get('status') ?? ''} aria-label="Publication">
          <option value="">All publication states</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="inactive">Inactive</option>
          <option value="archived">Archived</option>
        </select>
        <input name="brand" defaultValue={params.get('brand') ?? ''} placeholder="Brand" aria-label="Brand" />
        <select name="category" defaultValue={params.get('category') ?? ''} aria-label="Category">
          <option value="">All categories</option>
          {categories.data?.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
        <select name="sort" defaultValue={params.get('sort') ?? 'createdAt'} aria-label="Sort">
          <option value="createdAt">Newest</option>
          <option value="name">Name</option>
          <option value="price">Price</option>
          <option value="brand">Brand</option>
        </select>
        <select name="order" defaultValue={params.get('order') ?? 'desc'} aria-label="Order">
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </FilterForm>
      {can('products:publish') && selected.length > 0 ? (
        <div className="actions">
          <button className="btn secondary" type="button" onClick={() => void bulk('publish')}>Publish</button>
          <button className="btn secondary" type="button" onClick={() => void bulk('unpublish')}>Unpublish</button>
          <button className="btn secondary" type="button" onClick={() => void bulk('inactive')}>Mark inactive</button>
          <button className="btn danger" type="button" onClick={() => void bulk('archive')}>Archive</button>
        </div>
      ) : null}
      {query.isLoading ? <Loading /> : null}
      <ErrorText error={query.error} />
      {query.data && query.data.items.length === 0 ? <Empty title="No products" body="Add a product or change the filters." /> : null}
      {query.data && query.data.items.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th><span className="sr-only">Select</span></th>
                <th>Product</th>
                <th>SKU</th>
                <th>Brand</th>
                <th>Price</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((product) => (
                <tr key={product.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${product.name}`}
                      checked={selected.includes(product.id)}
                      onChange={(event) => setSelected((current) => event.target.checked ? [...current, product.id] : current.filter((id) => id !== product.id))}
                    />
                  </td>
                  <td><Link to={`/products/${product.id}`}>{product.name}</Link>{product.featured ? ' · Featured' : ''}</td>
                  <td>{product.sku}</td>
                  <td>{product.brand}</td>
                  <td>{naira(product.sellingPrice)}</td>
                  <td><Badge value={product.publicationStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <Pager meta={query.data?.meta} onPage={(page) => {
        const next = new URLSearchParams(params);
        next.set('page', String(page));
        setParams(next);
      }} />
    </div>
  );
}

function specNumber(spec: Record<string, unknown>, key: string) {
  const value = spec[key];
  return value == null ? '' : String(value);
}

export function ProductFormPage() {
  const { id } = useParams();
  const creating = !id || id === 'new';
  const navigate = useNavigate();
  const client = useQueryClient();
  const can = useCan();
  const toast = useToast();
  const [dirty, setDirty] = useState(false);
  const blocker = useUnsaved(dirty);
  const existing = useQuery({
    queryKey: ['product', id],
    enabled: !creating,
    queryFn: () => api<Product>(`/api/v1/admin/products/${id}`),
  });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/api/v1/admin/categories') });
  const product = existing.data;
  const [form, setForm] = useState({
    name: '', sku: '', brand: '', categoryId: '', slug: '', shortDescription: '', description: '',
    sellingPrice: '', compareAtPrice: '', costPrice: '', warranty: '', installationRequirements: '',
    publicationStatus: 'draft', featured: false, specificationsVerified: false, imageIds: [] as string[],
    cellType: '', chemistry: '', gridCompatibility: '', bms: '', configurations: '', batteries: '', attributes: [{ key: '', value: '', unit: '' }],
    specs: {} as Record<string, string>,
  });

  useEffect(() => {
    if (!product) return;
    const spec = product.specifications ?? {};
    setForm({
      name: product.name,
      sku: product.sku,
      brand: product.brand,
      categoryId: product.categoryId,
      slug: product.slug,
      shortDescription: product.shortDescription,
      description: product.description,
      sellingPrice: product.sellingPrice,
      compareAtPrice: product.compareAtPrice ?? '',
      costPrice: product.costPrice ?? '',
      warranty: product.warranty,
      installationRequirements: product.installationRequirements,
      publicationStatus: product.publicationStatus,
      featured: product.featured,
      specificationsVerified: product.specificationsVerified,
      imageIds: product.imageIds,
      cellType: String(spec.cellType ?? ''),
      chemistry: String(spec.chemistry ?? ''),
      gridCompatibility: String(spec.gridCompatibility ?? ''),
      bms: Array.isArray(spec.bmsCompatibility) ? spec.bmsCompatibility.join(', ') : '',
      configurations: Array.isArray(spec.supportedConfigurations) ? spec.supportedConfigurations.join(', ') : '',
      batteries: Array.isArray(spec.supportedBatteryTypes) ? spec.supportedBatteryTypes.join(', ') : '',
      attributes: Array.isArray(spec.attributes) && spec.attributes.length
        ? (spec.attributes as Array<{ key: string; value: string; unit?: string }>).map((row) => ({ key: row.key, value: row.value, unit: row.unit ?? '' }))
        : [{ key: '', value: '', unit: '' }],
      specs: Object.fromEntries([...PANEL, ...BATTERY, ...INVERTER].map((key) => [key, specNumber(spec, key)])),
    });
    setDirty(false);
  }, [product]);

  const category = categories.data?.find((item) => item.id === form.categoryId);
  const profile = category?.specificationProfile ?? product?.specificationProfile ?? 'generic';
  const numbers = useMemo(() => (profile === 'solar_panel' ? PANEL : profile === 'battery' ? BATTERY : profile === 'inverter' ? INVERTER : []), [profile]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      const specifications: Record<string, unknown> = { type: profile };
      for (const key of numbers) {
        const value = numberInput(form.specs[key] ?? '');
        if (value !== undefined) specifications[key] = value;
      }
      if (profile === 'solar_panel' && form.cellType) specifications.cellType = form.cellType;
      if (profile === 'battery') {
        if (form.chemistry) specifications.chemistry = form.chemistry;
        const bms = tagList(form.bms);
        const configurations = tagList(form.configurations);
        if (bms) specifications.bmsCompatibility = bms;
        if (configurations) specifications.supportedConfigurations = configurations;
      }
      if (profile === 'inverter') {
        if (form.gridCompatibility) specifications.gridCompatibility = form.gridCompatibility;
        const batteries = tagList(form.batteries);
        if (batteries) specifications.supportedBatteryTypes = batteries;
      }
      if (profile === 'generic') {
        specifications.attributes = form.attributes.filter((row) => row.key && row.value).map((row) => ({ key: row.key, value: row.value, unit: row.unit || undefined }));
      }
      const payload: Record<string, unknown> = {
        name: form.name,
        sku: form.sku,
        brand: form.brand,
        categoryId: form.categoryId,
        description: form.description,
        shortDescription: form.shortDescription,
        sellingPrice: moneyInput(form.sellingPrice),
        compareAtPrice: form.compareAtPrice.trim() ? moneyInput(form.compareAtPrice) : null,
        imageIds: form.imageIds,
        specifications,
        warranty: form.warranty,
        installationRequirements: form.installationRequirements,
        featured: form.publicationStatus === 'published' ? form.featured : false,
        publicationStatus: form.publicationStatus,
      };
      if (form.slug.trim()) payload.slug = form.slug.trim();
      if (can('products:read_cost') && form.costPrice.trim()) payload.costPrice = moneyInput(form.costPrice);
      if (can('products:verify_specs')) payload.specificationsVerified = form.specificationsVerified;
      if (creating) return api<Product>('/api/v1/admin/products', { method: 'POST', json: payload });
      return api<Product>(`/api/v1/admin/products/${id}`, { method: 'PATCH', json: payload });
    },
    onSuccess: async (saved) => {
      flushSync(() => setDirty(false));
      toast('Product saved.');
      if (creating) navigate(`/products/${saved.id}`);
      await client.invalidateQueries({ queryKey: ['products'] });
      await client.invalidateQueries({ queryKey: ['product', saved.id] });
    },
  });

  if (!creating && existing.isLoading) return <Loading label="Loading product" />;
  if (existing.error) return <ErrorText error={existing.error} />;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <UnsavedDialog blocker={blocker} />
      <ErrorText error={save.error} />
      <section className="section panel">
        <h2>Basic information</h2>
        <div className="form-grid">
          <Field label="Product name"><input required minLength={2} value={form.name} onChange={(event) => update('name', event.target.value)} /></Field>
          <Field label="SKU"><input required value={form.sku} onChange={(event) => update('sku', event.target.value)} /></Field>
          <Field label="Brand"><input required value={form.brand} onChange={(event) => update('brand', event.target.value)} /></Field>
          <Field label="Category">
            <select required value={form.categoryId} onChange={(event) => update('categoryId', event.target.value)}>
              <option value="">Select a category</option>
              {categories.data?.filter((item) => item.publicationStatus !== 'archived').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>
          <Field label="URL slug" hint="Leave blank to generate a slug from the name."><input value={form.slug} onChange={(event) => update('slug', event.target.value)} /></Field>
          <Field label="Short description"><input required maxLength={300} value={form.shortDescription} onChange={(event) => update('shortDescription', event.target.value)} /></Field>
          <div className="wide"><Field label="Description"><textarea required value={form.description} onChange={(event) => update('description', event.target.value)} /></Field></div>
        </div>
      </section>
      <section className="section panel">
        <h2>Pricing</h2>
        <p className="muted">Enter naira. This is the catalogue list price shown with a request.</p>
        <div className="form-grid">
          <Field label="Selling price"><input required inputMode="decimal" value={form.sellingPrice} onChange={(event) => update('sellingPrice', event.target.value)} /></Field>
          <Field label="Comparison price"><input inputMode="decimal" value={form.compareAtPrice} onChange={(event) => update('compareAtPrice', event.target.value)} /></Field>
          {can('products:read_cost') ? <Field label="Cost price"><input inputMode="decimal" value={form.costPrice} onChange={(event) => update('costPrice', event.target.value)} /></Field> : null}
        </div>
      </section>
      <section className="section panel">
        <h2>Media</h2>
        <MediaPicker value={form.imageIds} onChange={(imageIds) => update('imageIds', imageIds)} disabled={!can('media:upload') && creating} />
      </section>
      <section className="section panel">
        <h2>Technical specifications</h2>
        <p className="muted">Fields follow the category profile: {profile.replaceAll('_', ' ')}.</p>
        <div className="form-grid">
          {numbers.map((key) => (
            <Field key={key} label={key.replaceAll(/([A-Z])/g, ' $1')}>
              <input inputMode="decimal" value={form.specs[key] ?? ''} onChange={(event) => update('specs', { ...form.specs, [key]: event.target.value })} />
            </Field>
          ))}
          {profile === 'solar_panel' ? <Field label="Cell type"><input value={form.cellType} onChange={(event) => update('cellType', event.target.value)} /></Field> : null}
          {profile === 'battery' ? (
            <>
              <Field label="Chemistry">
                <select value={form.chemistry} onChange={(event) => update('chemistry', event.target.value)}>
                  <option value="">Select</option>
                  {['lithium_iron_phosphate', 'lithium_ion', 'lead_acid', 'gel', 'agm', 'other'].map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}
                </select>
              </Field>
              <Field label="BMS compatibility" hint="Comma-separated"><input value={form.bms} onChange={(event) => update('bms', event.target.value)} /></Field>
              <Field label="Supported configurations" hint="Comma-separated"><input value={form.configurations} onChange={(event) => update('configurations', event.target.value)} /></Field>
            </>
          ) : null}
          {profile === 'inverter' ? (
            <>
              <Field label="Supported battery types" hint="Comma-separated"><input value={form.batteries} onChange={(event) => update('batteries', event.target.value)} /></Field>
              <Field label="Grid compatibility">
                <select value={form.gridCompatibility} onChange={(event) => update('gridCompatibility', event.target.value)}>
                  <option value="">Select</option>
                  {['off_grid', 'grid_tie', 'hybrid', 'none'].map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}
                </select>
              </Field>
            </>
          ) : null}
        </div>
        {profile === 'generic' ? form.attributes.map((row, index) => (
          <div className="form-grid" key={index}>
            <Field label="Attribute"><input value={row.key} onChange={(event) => {
              const attributes = [...form.attributes];
              attributes[index] = { ...row, key: event.target.value };
              update('attributes', attributes);
            }} /></Field>
            <Field label="Value"><input value={row.value} onChange={(event) => {
              const attributes = [...form.attributes];
              attributes[index] = { ...row, value: event.target.value };
              update('attributes', attributes);
            }} /></Field>
          </div>
        )) : null}
        {profile === 'generic' ? <button className="btn secondary" type="button" onClick={() => update('attributes', [...form.attributes, { key: '', value: '', unit: '' }])}>Add attribute</button> : null}
        {can('products:verify_specs') ? (
          <label className="check">
            <input type="checkbox" checked={form.specificationsVerified} onChange={(event) => update('specificationsVerified', event.target.checked)} />
            Specifications verified
          </label>
        ) : null}
      </section>
      <section className="section panel">
        <h2>Publication</h2>
        <div className="form-grid">
          <Field label="Warranty"><input value={form.warranty} onChange={(event) => update('warranty', event.target.value)} /></Field>
          <Field label="State">
            <select value={form.publicationStatus} onChange={(event) => update('publicationStatus', event.target.value)} disabled={!can('products:publish')}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
          <div className="wide"><Field label="Installation requirements"><textarea value={form.installationRequirements} onChange={(event) => update('installationRequirements', event.target.value)} /></Field></div>
        </div>
        <label className="check">
          <input type="checkbox" checked={form.featured} disabled={form.publicationStatus !== 'published'} onChange={(event) => update('featured', event.target.checked)} />
          Featured on the public site
        </label>
        <div className="actions">
          <button className="btn" type="submit" disabled={save.isPending || !can('products:write')}>{save.isPending ? 'Saving…' : 'Save product'}</button>
          <Link className="btn secondary" to="/products">Back to products</Link>
        </div>
      </section>
    </form>
  );
}
