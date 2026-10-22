import { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, apiList, queryString } from '../lib/api';
import { moneyInput, naira, numberInput } from '../lib/format';
import { useCan } from '../session';
import { MediaPicker } from '../components/media-picker';
import { Badge, Empty, ErrorText, Field, Loading, UnsavedDialog, useConfirm, useToast, useUnsaved } from '../components/ui';

type Product = {
  id: string;
  name: string;
  sku: string;
  sellingPrice: string;
  specificationProfile: string;
  specifications: Record<string, number | string | undefined>;
};
type SolarPackage = {
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
  publicationStatus: string;
};

export function PackageListPage() {
  const can = useCan();
  const confirm = useConfirm();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['packages'], queryFn: () => api<SolarPackage[]>('/api/v1/admin/solar-packages') });
  return (
    <div>
      <div className="page-head">
        <p>Package prices are stored as package prices. Runtime is recorded as an assumption until the calculation engine is available.</p>
        {can('packages:write') ? <Link className="btn" to="/packages/new">Create package</Link> : null}
      </div>
      {query.isLoading ? <Loading /> : null}
      <ErrorText error={query.error} />
      {query.data?.length === 0 ? <Empty title="No solar packages" body="Build a package from published products." /> : null}
      {query.data && query.data.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Package</th><th>Price</th><th>Installation</th><th>State</th><th></th></tr></thead>
            <tbody>
              {query.data.map((item) => (
                <tr key={item.id}>
                  <td><Link to={`/packages/${item.id}`}>{item.name}</Link></td>
                  <td>{naira(item.price)}</td>
                  <td>{naira(item.installationCharge)}</td>
                  <td><Badge value={item.publicationStatus} /></td>
                  <td>
                    {can('packages:publish') ? <button className="btn secondary" type="button" onClick={() => void api(`/api/v1/admin/solar-packages/${item.id}/publish`, { method: 'POST', json: {} }).then(() => client.invalidateQueries({ queryKey: ['packages'] }))}>Publish</button> : null}
                    {can('packages:publish') ? <button className="btn danger" type="button" onClick={() => void confirm({ title: 'Archive package?', body: item.name, danger: true, confirmLabel: 'Archive' }).then(async (ok) => { if (!ok) return; await api(`/api/v1/admin/solar-packages/${item.id}`, { method: 'DELETE' }); await client.invalidateQueries({ queryKey: ['packages'] }); })}>Archive</button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function PackageFormPage() {
  const { id } = useParams();
  const creating = id === 'new';
  const navigate = useNavigate();
  const client = useQueryClient();
  const can = useCan();
  const toast = useToast();
  const [dirty, setDirty] = useState(false);
  const blocker = useUnsaved(dirty);
  const [search, setSearch] = useState('');
  const products = useQuery({ queryKey: ['package-products', search], queryFn: () => apiList<Product>(`/api/v1/admin/products${queryString({ q: search, pageSize: 50 })}`) });
  const existing = useQuery({
    queryKey: ['package', id],
    enabled: !creating,
    queryFn: () => api<SolarPackage[]>('/api/v1/admin/solar-packages').then((items) => {
      const solarPackage = items.find((item) => item.id === id);
      if (!solarPackage) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Solar package was not found.' });
      return solarPackage;
    }),
  });
  const [form, setForm] = useState({
    name: '', slug: '', description: '', items: [] as Array<{ productId: string; quantity: number }>,
    estimatedCapacityKw: '', inverterSummary: '', batteryCapacityKwh: '', solarPanelCapacityKw: '',
    loadWatts: '', estimatedRuntimeHours: '', operatingNotes: '', price: '', installationCharge: '', warranty: '',
    availability: 'available', publicationStatus: 'draft', imageIds: [] as string[],
  });
  useEffect(() => {
    const item = existing.data;
    if (!item) return;
    setForm({
      name: item.name, slug: item.slug, description: item.description, items: item.items,
      estimatedCapacityKw: String(item.estimatedCapacityKw), inverterSummary: item.inverterSummary,
      batteryCapacityKwh: String(item.batteryCapacityKwh), solarPanelCapacityKw: String(item.solarPanelCapacityKw),
      loadWatts: String(item.runtimeAssumptions.loadWatts),
      estimatedRuntimeHours: item.runtimeAssumptions.estimatedRuntimeHours == null ? '' : String(item.runtimeAssumptions.estimatedRuntimeHours),
      operatingNotes: item.runtimeAssumptions.operatingNotes, price: item.price, installationCharge: item.installationCharge,
      warranty: item.warranty, availability: item.availability, publicationStatus: item.publicationStatus, imageIds: item.imageIds,
    });
    setDirty(false);
  }, [existing.data]);

  const selected = useMemo(() => form.items.map((item) => ({ ...item, product: products.data?.items.find((product) => product.id === item.productId) })), [form.items, products.data]);
  const suggestion = useMemo(() => {
    let panelW = 0;
    let batteryKwh = 0;
    let inverterW = 0;
    let priced = 0;
    let incomplete = false;
    for (const item of selected) {
      const spec = item.product?.specifications;
      if (!item.product || !spec) { incomplete = true; continue; }
      priced += Number(item.product.sellingPrice) * item.quantity;
      if (item.product.specificationProfile === 'solar_panel') {
        if (!spec.ratedWattageW) incomplete = true;
        panelW += Number(spec.ratedWattageW ?? 0) * item.quantity;
      }
      if (item.product.specificationProfile === 'battery') {
        if (!spec.nominalKwh) incomplete = true;
        batteryKwh += Number(spec.nominalKwh ?? 0) * item.quantity;
      }
      if (item.product.specificationProfile === 'inverter') {
        if (!spec.ratedContinuousPowerW) incomplete = true;
        inverterW += Number(spec.ratedContinuousPowerW ?? 0) * item.quantity;
      }
    }
    return { panelKw: panelW / 1000, batteryKwh, inverterKw: inverterW / 1000, priced, incomplete };
  }, [selected]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        slug: form.slug || undefined,
        description: form.description,
        imageIds: form.imageIds,
        items: form.items,
        estimatedCapacityKw: numberInput(form.estimatedCapacityKw),
        inverterSummary: form.inverterSummary,
        batteryCapacityKwh: numberInput(form.batteryCapacityKwh),
        solarPanelCapacityKw: numberInput(form.solarPanelCapacityKw),
        runtimeAssumptions: {
          loadWatts: numberInput(form.loadWatts),
          estimatedRuntimeHours: form.estimatedRuntimeHours.trim() ? numberInput(form.estimatedRuntimeHours) : null,
          operatingNotes: form.operatingNotes,
        },
        price: moneyInput(form.price),
        installationCharge: moneyInput(form.installationCharge),
        warranty: form.warranty,
        availability: form.availability,
        publicationStatus: form.publicationStatus,
      };
      return creating ? api('/api/v1/admin/solar-packages', { method: 'POST', json: payload }) : api(`/api/v1/admin/solar-packages/${id}`, { method: 'PATCH', json: payload });
    },
    onSuccess: async () => {
      flushSync(() => setDirty(false));
      toast('Package saved.');
      if (creating) navigate('/packages');
      await client.invalidateQueries({ queryKey: ['packages'] });
    },
  });

  if (!creating && existing.isLoading) return <Loading />;
  return (
    <form onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      <UnsavedDialog blocker={blocker} />
      <ErrorText error={save.error} />
      <section className="panel">
        <h2>Package</h2>
        <div className="form-grid">
          <Field label="Name"><input required value={form.name} onChange={(event) => set('name', event.target.value)} /></Field>
          <Field label="Slug"><input value={form.slug} onChange={(event) => set('slug', event.target.value)} /></Field>
          <div className="wide"><Field label="Description"><textarea required value={form.description} onChange={(event) => set('description', event.target.value)} /></Field></div>
          <Field label="Package price"><input required value={form.price} onChange={(event) => set('price', event.target.value)} /></Field>
          <Field label="Installation charge"><input required value={form.installationCharge} onChange={(event) => set('installationCharge', event.target.value)} /></Field>
          <Field label="Warranty"><input value={form.warranty} onChange={(event) => set('warranty', event.target.value)} /></Field>
          <Field label="Availability">
            <select value={form.availability} onChange={(event) => set('availability', event.target.value)}>
              <option value="available">Available</option>
              <option value="unavailable">Unavailable</option>
            </select>
          </Field>
          <Field label="Publication">
            <select value={form.publicationStatus} disabled={!can('packages:publish')} onChange={(event) => set('publicationStatus', event.target.value)}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
        </div>
      </section>
      <section className="section panel">
        <h2>Included equipment</h2>
        <Field label="Find products"><input value={search} onChange={(event) => setSearch(event.target.value)} /></Field>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Product</th><th>Profile</th><th>Catalogue price</th><th></th></tr></thead>
            <tbody>
              {products.data?.items.map((product) => (
                <tr key={product.id}>
                  <td>{product.name}</td>
                  <td>{product.specificationProfile.replaceAll('_', ' ')}</td>
                  <td>{naira(product.sellingPrice)}</td>
                  <td><button className="btn secondary" type="button" onClick={() => {
                    const current = form.items.find((item) => item.productId === product.id);
                    set('items', current ? form.items.map((item) => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item) : [...form.items, { productId: product.id, quantity: 1 }]);
                  }}>Add</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {form.items.length === 0 ? <Empty title="No equipment selected" body="Add at least one product." /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Selected</th><th>Quantity</th><th></th></tr></thead>
              <tbody>
                {form.items.map((item) => (
                  <tr key={item.productId}>
                    <td>{selected.find((row) => row.productId === item.productId)?.product?.name ?? item.productId}</td>
                    <td><input aria-label="Quantity" value={item.quantity} onChange={(event) => set('items', form.items.map((row) => row.productId === item.productId ? { ...row, quantity: Number(event.target.value) || 1 } : row))} /></td>
                    <td><button className="btn secondary" type="button" onClick={() => set('items', form.items.filter((row) => row.productId !== item.productId))}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p>Combined from recorded specifications: panels {suggestion.panelKw.toFixed(2)} kW, batteries {suggestion.batteryKwh.toFixed(2)} kWh, inverters {suggestion.inverterKw.toFixed(2)} kW. Catalogue equipment total {naira(suggestion.priced.toFixed(2))}.</p>
        {suggestion.incomplete ? <p className="muted">Some selected products are outside this search page or do not have the specification used for that total.</p> : null}
        <button className="btn secondary" type="button" onClick={() => {
          set('solarPanelCapacityKw', suggestion.panelKw ? String(suggestion.panelKw) : form.solarPanelCapacityKw);
          set('batteryCapacityKwh', String(suggestion.batteryKwh));
          set('estimatedCapacityKw', suggestion.inverterKw ? String(suggestion.inverterKw) : form.estimatedCapacityKw);
        }}>Copy suggested capacities</button>
      </section>
      <section className="section panel">
        <h2>Capacity and assumptions</h2>
        <p className="muted">These values are saved with the package. They are not a verified runtime from the calculation engine.</p>
        <div className="form-grid">
          <Field label="Estimated inverter capacity (kW)"><input required value={form.estimatedCapacityKw} onChange={(event) => set('estimatedCapacityKw', event.target.value)} /></Field>
          <Field label="Solar panel capacity (kW)"><input required value={form.solarPanelCapacityKw} onChange={(event) => set('solarPanelCapacityKw', event.target.value)} /></Field>
          <Field label="Battery capacity (kWh)"><input required value={form.batteryCapacityKwh} onChange={(event) => set('batteryCapacityKwh', event.target.value)} /></Field>
          <Field label="Inverter summary"><input required value={form.inverterSummary} onChange={(event) => set('inverterSummary', event.target.value)} /></Field>
          <Field label="Assumed load (W)"><input required value={form.loadWatts} onChange={(event) => set('loadWatts', event.target.value)} /></Field>
          <Field label="Estimated runtime hours" hint="Optional. Leave blank if it has not been calculated."><input value={form.estimatedRuntimeHours} onChange={(event) => set('estimatedRuntimeHours', event.target.value)} /></Field>
          <div className="wide"><Field label="Operating notes" hint="Describe the load these hours refer to. At least 10 characters."><textarea required minLength={10} value={form.operatingNotes} onChange={(event) => set('operatingNotes', event.target.value)} /></Field></div>
          <div className="wide"><MediaPicker value={form.imageIds} onChange={(imageIds) => set('imageIds', imageIds)} /></div>
        </div>
        <div className="actions">
          <button className="btn" type="submit" disabled={!can('packages:write') || save.isPending}>Save package</button>
          <Link className="btn secondary" to="/packages">Back</Link>
        </div>
      </section>
    </form>
  );
}
