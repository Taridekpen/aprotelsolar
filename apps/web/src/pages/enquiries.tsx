import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiList, queryString } from '../lib/api';
import { when } from '../lib/format';
import { useCan } from '../session';
import { Badge, Empty, ErrorText, Loading, Pager, useToast } from '../components/ui';

type Enquiry = {
  id: string;
  reference: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  enquiryType: string;
  message: string;
  productIds: string[];
  solarCalculation: unknown;
  recommendationSnapshot: unknown;
  status: string;
  assignedTo: string | null;
  internalNotes: Array<{ body: string; createdAt: string }>;
  createdAt: string;
};
type Admin = { id: string; fullName: string };

const STATUSES = [
  ['new', 'New'],
  ['contacted', 'Contacted'],
  ['in_review', 'Under review'],
  ['quoted', 'Quoted'],
  ['resolved', 'Resolved'],
  ['closed', 'Closed'],
] as const;

export function EnquiryPage({ installation = false }: { installation?: boolean }) {
  const [params, setParams] = useSearchParams();
  const can = useCan();
  const toast = useToast();
  const client = useQueryClient();
  const [open, setOpen] = useState<Enquiry | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);
  const staff = useQuery({ queryKey: ['administrators'], queryFn: () => apiList<Admin>('/api/v1/admin/administrators?pageSize=100'), enabled: can('administrators:read') && can('enquiries:update') });
  const query = useQuery({
    queryKey: ['enquiries', installation, params.toString()],
    queryFn: () => apiList<Enquiry>(`/api/v1/admin/enquiries${queryString({
      page: params.get('page') ?? 1,
      pageSize: 20,
      q: params.get('q') ?? undefined,
      status: params.get('status') ?? undefined,
      enquiryType: installation ? 'installation' : params.get('enquiryType') ?? undefined,
    })}`),
  });

  async function update(id: string, body: Record<string, unknown>) {
    setError(null);
    try {
      const saved = await api<Enquiry>(`/api/v1/admin/enquiries/${id}`, { method: 'PATCH', json: body });
      setOpen(saved);
      setNote('');
      toast('Enquiry updated.');
      await client.invalidateQueries({ queryKey: ['enquiries'] });
    } catch (updateError) {
      setError(updateError);
    }
  }

  return (
    <div>
      <form className="filters" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const next = new URLSearchParams();
        const q = String(form.get('q') ?? '');
        const status = String(form.get('status') ?? '');
        if (q) next.set('q', q);
        if (status) next.set('status', status);
        if (!installation) {
          const enquiryType = String(form.get('enquiryType') ?? '');
          if (enquiryType) next.set('enquiryType', enquiryType);
        }
        setParams(next);
      }}>
        <input name="q" defaultValue={params.get('q') ?? ''} aria-label="Search enquiries" placeholder="Name, email, reference" />
        <select name="status" defaultValue={params.get('status') ?? ''} aria-label="Status">
          <option value="">All statuses</option>
          {STATUSES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select>
        {installation ? null : (
          <select name="enquiryType" defaultValue={params.get('enquiryType') ?? ''} aria-label="Category">
            <option value="">All categories</option>
            {['general', 'product', 'installation', 'quotation', 'maintenance', 'cctv', 'consultation'].map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        )}
        <button className="btn secondary" type="submit">Apply</button>
      </form>
      {query.isLoading ? <Loading /> : null}
      <ErrorText error={query.error} />
      {query.data?.items.length === 0 ? <Empty title="Inbox is clear" body="New customer messages will appear here." /> : null}
      {query.data && query.data.items.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Reference</th><th>Customer</th><th>Category</th><th>Status</th><th>Submitted</th></tr></thead>
            <tbody>
              {query.data.items.map((enquiry) => (
                <tr key={enquiry.id}>
                  <td><button className="btn secondary" type="button" onClick={() => setOpen(enquiry)}>{enquiry.reference}</button></td>
                  <td>{enquiry.name}<br />{enquiry.email}</td>
                  <td>{enquiry.enquiryType.replaceAll('_', ' ')}</td>
                  <td><Badge value={enquiry.status} /></td>
                  <td>{when(enquiry.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <Pager meta={query.data?.meta} onPage={(page) => { const next = new URLSearchParams(params); next.set('page', String(page)); setParams(next); }} />
      {open ? (
        <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="enquiry-title">
          <div className="row"><h2 id="enquiry-title">{open.reference}</h2><button className="btn secondary" type="button" onClick={() => setOpen(null)}>Close</button></div>
          <ErrorText error={error} />
          <p>{open.name}<br />{open.email}<br />{open.phone}<br />{open.location}</p>
          <p>{open.message}</p>
          <p>Products: {open.productIds.length ? open.productIds.join(', ') : 'None selected'}</p>
          <h3>Solar calculation</h3>
          <DesignNotes value={open.solarCalculation} />
          <h3>Recommended equipment</h3>
          <DesignNotes value={open.recommendationSnapshot} />
          {can('enquiries:update') ? (
            <>
              <label className="field">Status
                <select value={open.status} onChange={(event) => void update(open.id, { status: event.target.value })}>
                  {STATUSES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                </select>
              </label>
              {staff.data ? (
                <label className="field">Assigned staff
                  <select value={open.assignedTo ?? ''} onChange={(event) => void update(open.id, { assignedTo: event.target.value || null })}>
                    <option value="">Unassigned</option>
                    {staff.data.items.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
                  </select>
                </label>
              ) : <p className="muted">Assignment is available to administrators who can view staff accounts.</p>}
              <label className="field">Internal note
                <textarea value={note} onChange={(event) => setNote(event.target.value)} />
              </label>
              <button className="btn" type="button" disabled={!note.trim()} onClick={() => void update(open.id, { note })}>Add note</button>
            </>
          ) : null}
          <h3>Notes</h3>
          {open.internalNotes?.length ? open.internalNotes.map((item, index) => <p key={index}>{when(item.createdAt)} — {item.body}</p>) : <p>No internal notes.</p>}
        </div>
      ) : null}
    </div>
  );
}

function DesignNotes({ value }: { value: unknown }) {
  const design = readDesign(value);
  if (!design) return <p>{value ? 'No sizing design was stored on this record.' : 'Nothing was submitted.'}</p>;
  return (
    <div>
      {design.narrative?.map((line) => <p key={line}>{line}</p>)}
      {design.selected?.products?.map((product) => <p key={product.id}>{product.quantity} × {product.name} — {product.reason}</p>)}
      {design.unmet?.message ? <p>{design.unmet.message}</p> : null}
      {design.warnings?.map((warning) => <p key={warning.id}>{warning.message}</p>)}
      <p>Engineering approval is required before this is treated as a final design.</p>
      <details>
        <summary>Stored record</summary>
        <pre>{JSON.stringify(value, null, 2)}</pre>
      </details>
    </div>
  );
}

function readDesign(value: unknown): {
  narrative?: string[];
  selected?: { products?: Array<{ id: string; name: string; quantity: number; reason: string }> };
  unmet?: { message?: string };
  warnings?: Array<{ id: string; message: string }>;
} | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { design?: unknown };
  const design = record.design && typeof record.design === 'object' ? record.design : 'load' in record ? record : null;
  return design && typeof design === 'object' ? design as ReturnType<typeof readDesign> : null;
}
