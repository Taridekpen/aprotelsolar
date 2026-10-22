import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiList, downloadFile, queryString } from '../lib/api';
import { naira, when } from '../lib/format';
import { useCan } from '../session';
import { Badge, Empty, ErrorText, Loading, Pager, useToast } from '../components/ui';

type QuoteLine = { productId: string; name: string; sku: string; quantity: number; unitPrice: string; lineTotal: string };
type Quotation = {
  id: string;
  reference: string;
  customer: { name: string; email: string; phone: string; location?: string };
  lines: QuoteLine[];
  packageLines: Array<{ name: string; quantity: number; unitPrice: string; lineTotal: string }>;
  subtotal: string;
  deliveryCost: string;
  installationCost: string;
  tax: string;
  total: string;
  status: string;
  engineeringApproval: string;
  applianceSnapshot: unknown;
  internalNotes?: Array<{ body: string; createdAt: string }>;
  commercialRevisions?: Array<{ reason: string; total: string; createdAt: string; lines: QuoteLine[] }>;
  createdAt: string;
};

export function QuotationsPage() {
  const [params, setParams] = useSearchParams();
  const can = useCan();
  const toast = useToast();
  const client = useQueryClient();
  const [open, setOpen] = useState<Quotation | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [installation, setInstallation] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const list = useQuery({
    queryKey: ['quotations', params.toString()],
    queryFn: () => apiList<Quotation>(`/api/v1/admin/quotations${queryString({ page: params.get('page') ?? 1, pageSize: 20, status: params.get('status') ?? undefined })}`),
  });

  async function load(id: string) {
    const quote = await api<Quotation>(`/api/v1/admin/quotations/${id}`);
    setOpen(quote);
    setPrices(Object.fromEntries(quote.lines.map((line) => [line.productId, line.unitPrice])));
    setInstallation(quote.installationCost);
    setError(null);
  }

  async function patch(body: Record<string, unknown>) {
    if (!open) return;
    setError(null);
    try {
      const saved = await api<Quotation>(`/api/v1/admin/quotations/${open.id}`, { method: 'PATCH', json: body });
      setOpen(saved);
      setNote('');
      toast('Quotation updated.');
      await client.invalidateQueries({ queryKey: ['quotations'] });
    } catch (patchError) {
      setError(patchError);
    }
  }

  return (
    <div>
      <p className="muted">Engineering approval is separate from commercial changes. Payment is not marked here.</p>
      <form className="filters" onSubmit={(event) => { event.preventDefault(); const status = String(new FormData(event.currentTarget).get('status') ?? ''); const next = new URLSearchParams(); if (status) next.set('status', status); setParams(next); }}>
        <select name="status" defaultValue={params.get('status') ?? ''} aria-label="Status">
          <option value="">All statuses</option>
          {['submitted', 'in_review', 'approved', 'rejected', 'expired', 'converted'].map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
        </select>
        <button className="btn secondary" type="submit">Apply</button>
      </form>
      {list.isLoading ? <Loading /> : null}
      <ErrorText error={list.error} />
      {list.data?.items.length === 0 ? <Empty title="No quotations" body="Guest quotations appear after a customer submits one." /> : null}
      {list.data && list.data.items.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Reference</th><th>Customer</th><th>Total</th><th>Status</th><th>Engineering</th><th>Date</th></tr></thead>
            <tbody>
              {list.data.items.map((quote) => (
                <tr key={quote.id}>
                  <td><button className="btn secondary" type="button" onClick={() => void load(quote.id)}>{quote.reference}</button></td>
                  <td>{quote.customer.name}</td>
                  <td>{naira(quote.total)}</td>
                  <td><Badge value={quote.status} /></td>
                  <td><Badge value={quote.engineeringApproval} /></td>
                  <td>{when(quote.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <Pager meta={list.data?.meta} onPage={(page) => { const next = new URLSearchParams(params); next.set('page', String(page)); setParams(next); }} />
      {open ? (
        <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="quote-title">
          <div className="row"><h2 id="quote-title">{open.reference}</h2><button className="btn secondary" type="button" onClick={() => setOpen(null)}>Close</button></div>
          <ErrorText error={error} />
          <p>{open.customer.name}<br />{open.customer.email}<br />{open.customer.phone}</p>
          <h3>Calculation snapshot</h3>
          <DesignSnapshot value={open.applianceSnapshot} />
          <h3>Equipment</h3>
          {open.lines.map((line) => (
            <p key={line.productId}>{line.quantity} × {line.name} ({line.sku}) — {naira(line.unitPrice)}</p>
          ))}
          {open.packageLines.map((line) => <p key={line.name}>{line.quantity} × {line.name} — {naira(line.unitPrice)}</p>)}
          <p>Subtotal {naira(open.subtotal)} · Delivery {naira(open.deliveryCost)} · Installation {naira(open.installationCost)} · Tax {naira(open.tax)} · Total {naira(open.total)}</p>
          {can('quotations:update') ? (
            <label className="field">Commercial status
              <select value={open.status} onChange={(event) => void patch({ status: event.target.value })}>
                {['submitted', 'in_review', 'approved', 'rejected', 'expired', 'converted'].map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
              </select>
            </label>
          ) : null}
          {can('quotations:approve') ? (
            <label className="field">Engineering review
              <select value={open.engineeringApproval} onChange={(event) => void patch({ engineeringApproval: event.target.value })}>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
          ) : <p>Engineering approval is limited to engineers and administrators.</p>}
          {can('quotations:update') ? (
            <form onSubmit={(event) => {
              event.preventDefault();
              const lines = open.lines.filter((line) => prices[line.productId] && prices[line.productId] !== line.unitPrice).map((line) => ({ productId: line.productId, unitPrice: prices[line.productId] }));
              const body: Record<string, unknown> = { reason };
              if (lines.length) body.lines = lines;
              if (installation !== open.installationCost) body.installationCost = installation;
              void api<Quotation>(`/api/v1/admin/quotations/${open.id}/commercial-adjustment`, { method: 'POST', json: body })
                .then(async (saved) => { setOpen(saved); setReason(''); toast('Commercial adjustment stored.'); await client.invalidateQueries({ queryKey: ['quotations'] }); })
                .catch(setError);
            }}>
              <h3>Commercial adjustment</h3>
              <p className="muted">The current equipment and prices are stored before the new prices are calculated on the server.</p>
              {open.lines.map((line) => (
                <label className="field" key={line.productId}>{line.name} unit price
                  <input value={prices[line.productId] ?? ''} onChange={(event) => setPrices({ ...prices, [line.productId]: event.target.value })} />
                </label>
              ))}
              <label className="field">Installation charge<input value={installation} onChange={(event) => setInstallation(event.target.value)} /></label>
              <label className="field">Reason<input required minLength={5} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
              <button className="btn" type="submit">Save adjustment</button>
            </form>
          ) : null}
          <div className="actions">
            <button className="btn secondary" type="button" onClick={() => void downloadFile(`/api/v1/admin/quotations/${open.id}/pdf`, `${open.reference}.pdf`).catch(setError)}>Download PDF</button>
          </div>
          {can('quotations:update') ? (
            <form onSubmit={(event) => { event.preventDefault(); void patch({ note }); }}>
              <label className="field">Internal note<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label>
              <button className="btn secondary" type="submit">Add note</button>
            </form>
          ) : null}
          <h3>Price history</h3>
          {open.commercialRevisions?.length ? open.commercialRevisions.map((revision, index) => (
            <p key={index}>{when(revision.createdAt)} · {naira(revision.total)} · {revision.reason}</p>
          )) : <p>No commercial revisions yet. The original snapshot is the current quotation.</p>}
        </div>
      ) : null}
    </div>
  );
}

/** Renders the stored calculation without recalculating it. */
function DesignSnapshot({ value }: { value: unknown }) {
  const design = value && typeof value === 'object' && 'design' in value ? (value as { design?: { narrative?: string[]; warnings?: Array<{ message: string }> } }).design : null;
  return (
    <div>
      {design?.narrative?.map((line) => <p key={line}>{line}</p>)}
      {design?.warnings?.map((warning) => <p key={warning.message}>{warning.message}</p>)}
      <details>
        <summary>Stored snapshot</summary>
        <pre>{JSON.stringify(value, null, 2)}</pre>
      </details>
    </div>
  );
}

