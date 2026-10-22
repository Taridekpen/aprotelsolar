import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, apiList, queryString } from '../lib/api';
import { moneyInput, naira } from '../lib/format';
import { useCan } from '../session';
import { MediaPicker } from '../components/media-picker';
import { Badge, Empty, ErrorText, Field, Loading, UnsavedDialog, useConfirm, useToast, useUnsaved } from '../components/ui';

type Service = {
  id: string;
  name: string;
  slug: string;
  description: string;
  imageIds: string[];
  features: string[];
  startingPrice: string | null;
  availability: string;
  relatedProductIds: string[];
  displayOrder: number;
  publicationStatus: string;
};
type Product = { id: string; name: string };

export function ServiceListPage() {
  const can = useCan();
  const confirm = useConfirm();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['services'], queryFn: () => api<Service[]>('/api/v1/admin/services') });
  const ordered = [...(query.data ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    const current = ordered[index]!;
    const other = ordered[target]!;
    await api(`/api/v1/admin/services/${current.id}`, { method: 'PATCH', json: { displayOrder: other.displayOrder } });
    await api(`/api/v1/admin/services/${other.id}`, { method: 'PATCH', json: { displayOrder: current.displayOrder } });
    await client.invalidateQueries({ queryKey: ['services'] });
  }

  return (
    <div>
      <div className="page-head">
        <p>Published services appear on the public services pages.</p>
        {can('services:write') ? <Link className="btn" to="/services/new">Add service</Link> : null}
      </div>
      {query.isLoading ? <Loading /> : null}
      <ErrorText error={query.error} />
      {ordered.length === 0 && !query.isLoading ? <Empty title="No services" body="Create the first service." /> : null}
      {ordered.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Service</th><th>From</th><th>Availability</th><th>State</th><th></th></tr></thead>
            <tbody>
              {ordered.map((service, index) => (
                <tr key={service.id}>
                  <td><Link to={`/services/${service.id}`}>{service.name}</Link></td>
                  <td>{service.startingPrice ? naira(service.startingPrice) : '—'}</td>
                  <td><Badge value={service.availability} /></td>
                  <td><Badge value={service.publicationStatus} /></td>
                  <td>
                    {can('services:write') ? <button className="btn secondary" type="button" onClick={() => void move(index, -1)}>Up</button> : null}
                    {can('services:write') ? <button className="btn secondary" type="button" onClick={() => void move(index, 1)}>Down</button> : null}
                    {can('services:publish') ? <button className="btn secondary" type="button" onClick={() => void api(`/api/v1/admin/services/${service.id}/publish`, { method: 'POST', json: {} }).then(() => client.invalidateQueries({ queryKey: ['services'] }))}>Publish</button> : null}
                    {can('services:publish') ? <button className="btn secondary" type="button" onClick={() => void api(`/api/v1/admin/services/${service.id}`, { method: 'PATCH', json: { publicationStatus: 'inactive' } }).then(() => client.invalidateQueries({ queryKey: ['services'] }))}>Inactive</button> : null}
                    {can('services:publish') ? <button className="btn danger" type="button" onClick={() => void confirm({ title: 'Archive service?', body: service.name, danger: true, confirmLabel: 'Archive' }).then(async (ok) => { if (!ok) return; await api(`/api/v1/admin/services/${service.id}`, { method: 'DELETE' }); await client.invalidateQueries({ queryKey: ['services'] }); })}>Archive</button> : null}
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

export function ServiceFormPage() {
  const { id } = useParams();
  const creating = id === 'new';
  const navigate = useNavigate();
  const client = useQueryClient();
  const can = useCan();
  const toast = useToast();
  const [dirty, setDirty] = useState(false);
  const blocker = useUnsaved(dirty);
  const existing = useQuery({
    queryKey: ['service', id],
    enabled: !creating,
    queryFn: () => api<Service[]>('/api/v1/admin/services').then((items) => {
      const service = items.find((item) => item.id === id);
      if (!service) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Service was not found.' });
      return service;
    }),
  });
  const products = useQuery({ queryKey: ['product-options'], queryFn: () => apiList<Product>(`/api/v1/admin/products${queryString({ pageSize: 100, status: 'published' })}`) });
  const [form, setForm] = useState({ name: '', slug: '', description: '', features: '', startingPrice: '', availability: 'available', publicationStatus: 'draft', imageIds: [] as string[], relatedProductIds: [] as string[] });
  useEffect(() => {
    if (!existing.data) return;
    const service = existing.data;
    setForm({
      name: service.name,
      slug: service.slug,
      description: service.description,
      features: service.features.join('\n'),
      startingPrice: service.startingPrice ?? '',
      availability: service.availability,
      publicationStatus: service.publicationStatus,
      imageIds: service.imageIds,
      relatedProductIds: service.relatedProductIds,
    });
    setDirty(false);
  }, [existing.data]);
  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        slug: form.slug || undefined,
        description: form.description,
        features: form.features.split('\n').map((line) => line.trim()).filter(Boolean),
        startingPrice: form.startingPrice.trim() ? moneyInput(form.startingPrice) : null,
        availability: form.availability,
        publicationStatus: form.publicationStatus,
        imageIds: form.imageIds,
        relatedProductIds: form.relatedProductIds,
      };
      return creating ? api<Service>('/api/v1/admin/services', { method: 'POST', json: payload }) : api<Service>(`/api/v1/admin/services/${id}`, { method: 'PATCH', json: payload });
    },
    onSuccess: async (saved) => {
      flushSync(() => setDirty(false));
      toast('Service saved.');
      if (creating) navigate(`/services/${saved.id}`);
      await client.invalidateQueries({ queryKey: ['services'] });
    },
  });
  if (!creating && existing.isLoading) return <Loading />;
  return (
    <form onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      <UnsavedDialog blocker={blocker} />
      <ErrorText error={save.error} />
      <div className="form-grid">
        <Field label="Name"><input required value={form.name} onChange={(event) => { setDirty(true); setForm({ ...form, name: event.target.value }); }} /></Field>
        <Field label="Slug"><input value={form.slug} onChange={(event) => { setDirty(true); setForm({ ...form, slug: event.target.value }); }} /></Field>
        <div className="wide"><Field label="Description"><textarea required value={form.description} onChange={(event) => { setDirty(true); setForm({ ...form, description: event.target.value }); }} /></Field></div>
        <div className="wide"><Field label="Benefits" hint="One benefit per line."><textarea value={form.features} onChange={(event) => { setDirty(true); setForm({ ...form, features: event.target.value }); }} /></Field></div>
        <Field label="Starting price"><input value={form.startingPrice} onChange={(event) => { setDirty(true); setForm({ ...form, startingPrice: event.target.value }); }} /></Field>
        <Field label="Availability">
          <select value={form.availability} onChange={(event) => { setDirty(true); setForm({ ...form, availability: event.target.value }); }}>
            <option value="available">Available</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </Field>
        <Field label="Publication">
          <select value={form.publicationStatus} disabled={!can('services:publish')} onChange={(event) => { setDirty(true); setForm({ ...form, publicationStatus: event.target.value }); }}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
        </Field>
        <div className="wide">
          <Field label="Associated products">
            <select multiple value={form.relatedProductIds} onChange={(event) => { setDirty(true); setForm({ ...form, relatedProductIds: [...event.target.selectedOptions].map((option) => option.value) }); }}>
              {products.data?.items.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="wide"><MediaPicker value={form.imageIds} onChange={(imageIds) => { setDirty(true); setForm({ ...form, imageIds }); }} /></div>
      </div>
      <div className="actions">
        <button className="btn" disabled={!can('services:write') || save.isPending} type="submit">Save service</button>
        <Link className="btn secondary" to="/services">Back</Link>
      </div>
    </form>
  );
}
