import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useCan } from '../session';
import { Badge, Empty, ErrorText, Field, Loading, useConfirm, useToast } from '../components/ui';

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string;
  parentId: string | null;
  specificationProfile: string;
  displayOrder: number;
  publicationStatus: string;
};

const empty = { name: '', description: '', parentId: '', specificationProfile: 'generic', publicationStatus: 'draft' };

export function CategoriesPage() {
  const can = useCan();
  const toast = useToast();
  const confirm = useConfirm();
  const client = useQueryClient();
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const query = useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/api/v1/admin/categories') });
  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...form, parentId: form.parentId || null };
      if (editing) return api(`/api/v1/admin/categories/${editing}`, { method: 'PATCH', json: payload });
      return api('/api/v1/admin/categories', { method: 'POST', json: payload });
    },
    onSuccess: async () => {
      setForm(empty);
      setEditing(null);
      toast('Category saved.');
      await client.invalidateQueries({ queryKey: ['categories'] });
    },
  });

  async function reorder(index: number, direction: -1 | 1) {
    const items = [...(query.data ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    await api('/api/v1/admin/categories/reorder', { method: 'PATCH', json: { ids: next.map((category) => category.id) } });
    await client.invalidateQueries({ queryKey: ['categories'] });
  }

  const ordered = [...(query.data ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);
  return (
    <div className="split" style={{ alignItems: 'start' }}>
      <div style={{ flex: 2 }}>
        {query.isLoading ? <Loading /> : null}
        <ErrorText error={query.error} />
        {ordered.length === 0 && !query.isLoading ? <Empty title="No categories" body="Create a category before adding products." /> : null}
        {ordered.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Profile</th><th>State</th><th></th></tr></thead>
              <tbody>
                {ordered.map((category, index) => (
                  <tr key={category.id}>
                    <td>{category.name}</td>
                    <td>{category.specificationProfile.replaceAll('_', ' ')}</td>
                    <td><Badge value={category.publicationStatus} /></td>
                    <td>
                      <button className="btn secondary" type="button" onClick={() => { setEditing(category.id); setForm({ name: category.name, description: category.description, parentId: category.parentId ?? '', specificationProfile: category.specificationProfile, publicationStatus: category.publicationStatus }); }}>Edit</button>
                      {can('categories:write') ? <button className="btn secondary" type="button" onClick={() => void reorder(index, -1)}>Up</button> : null}
                      {can('categories:write') ? <button className="btn secondary" type="button" onClick={() => void reorder(index, 1)}>Down</button> : null}
                      {can('categories:write') ? <button className="btn danger" type="button" onClick={() => void confirm({ title: 'Archive category?', body: category.name, danger: true, confirmLabel: 'Archive' }).then(async (ok) => { if (!ok) return; await api(`/api/v1/admin/categories/${category.id}`, { method: 'DELETE' }); await client.invalidateQueries({ queryKey: ['categories'] }); })}>Archive</button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
      {can('categories:write') ? (
        <form className="panel" style={{ flex: 1 }} onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
          <h2>{editing ? 'Edit category' : 'New category'}</h2>
          <ErrorText error={save.error} />
          <Field label="Name"><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
          <Field label="Description"><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
          <Field label="Parent">
            <select value={form.parentId} onChange={(event) => setForm({ ...form, parentId: event.target.value })}>
              <option value="">None</option>
              {ordered.filter((category) => category.id !== editing).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </Field>
          <Field label="Specification profile">
            <select value={form.specificationProfile} onChange={(event) => setForm({ ...form, specificationProfile: event.target.value })}>
              <option value="solar_panel">Solar panel</option>
              <option value="battery">Battery</option>
              <option value="inverter">Inverter</option>
              <option value="generic">Generic</option>
            </select>
          </Field>
          <Field label="Publication">
            <select value={form.publicationStatus} onChange={(event) => setForm({ ...form, publicationStatus: event.target.value })}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
          <div className="actions">
            <button className="btn" type="submit" disabled={save.isPending}>Save</button>
            {editing ? <button className="btn secondary" type="button" onClick={() => { setEditing(null); setForm(empty); }}>Cancel</button> : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
