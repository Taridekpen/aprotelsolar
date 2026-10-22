import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiList, queryString } from '../lib/api';
import { naira, when } from '../lib/format';
import { useCan } from '../session';
import { Badge, Empty, ErrorText, Loading, Pager, useConfirm, useToast } from '../components/ui';

type Order = {
  id: string;
  orderNumber: string;
  customer: { name: string; email: string; phone: string };
  delivery: { recipientName: string; phone: string; addressLine1: string; city: string; state: string; notes?: string };
  branchId: string;
  lines: Array<{ name: string; sku: string; quantity: number; unitPrice: string; lineTotal: string }>;
  subtotal: string;
  deliveryCost: string;
  installationCost: string;
  tax: string;
  total: string;
  paymentStatus: string;
  fulfilmentStatus: string;
  paymentReference: string;
  createdAt: string;
};
type Branch = { id: string; name: string };

const FULFILMENT = ['unfulfilled', 'processing', 'ready', 'dispatched', 'delivered'];

export function OrderListPage() {
  const [params, setParams] = useSearchParams();
  const query = useQuery({
    queryKey: ['orders', params.toString()],
    queryFn: () => apiList<Order>(`/api/v1/admin/orders${queryString({
      page: params.get('page') ?? 1,
      pageSize: 20,
      q: params.get('q') ?? undefined,
      status: params.get('status') ?? undefined,
      fulfilment: params.get('fulfilment') ?? undefined,
    })}`),
  });
  return (
    <div>
      <p className="muted">Payment status comes from verified payment records. It cannot be marked paid from this screen.</p>
      <form className="filters" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const next = new URLSearchParams();
        for (const key of ['q', 'status', 'fulfilment']) {
          const value = String(form.get(key) ?? '');
          if (value) next.set(key, value);
        }
        setParams(next);
      }}>
        <input name="q" defaultValue={params.get('q') ?? ''} aria-label="Search orders" placeholder="Order number, name, email" />
        <select name="status" defaultValue={params.get('status') ?? ''} aria-label="Payment status">
          <option value="">Any payment</option>
          {['pending', 'paid', 'failed', 'cancelled', 'refunded', 'review'].map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <select name="fulfilment" defaultValue={params.get('fulfilment') ?? ''} aria-label="Fulfilment">
          <option value="">Any fulfilment</option>
          {FULFILMENT.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <button className="btn secondary" type="submit">Apply</button>
      </form>
      {query.isLoading ? <Loading /> : null}
      <ErrorText error={query.error} />
      {query.data?.items.length === 0 ? <Empty title="No orders" body="Guest purchases will be listed here." /> : null}
      {query.data && query.data.items.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Payment</th><th>Fulfilment</th><th>Date</th></tr></thead>
            <tbody>
              {query.data.items.map((order) => (
                <tr key={order.id}>
                  <td><Link to={`/orders/${order.id}`}>{order.orderNumber}</Link></td>
                  <td>{order.customer.name}</td>
                  <td>{naira(order.total)}</td>
                  <td><Badge value={order.paymentStatus} /></td>
                  <td><Badge value={order.fulfilmentStatus} /></td>
                  <td>{when(order.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <Pager meta={query.data?.meta} onPage={(page) => { const next = new URLSearchParams(params); next.set('page', String(page)); setParams(next); }} />
    </div>
  );
}

export function OrderDetailPage() {
  const { id } = useParams();
  const can = useCan();
  const toast = useToast();
  const confirm = useConfirm();
  const client = useQueryClient();
  const [error, setError] = useState<unknown>(null);
  const order = useQuery({ queryKey: ['order', id], queryFn: () => api<Order>(`/api/v1/admin/orders/${id}`) });
  const branches = useQuery({ queryKey: ['branches'], queryFn: () => api<Branch[]>('/api/v1/admin/branches'), enabled: can('branches:read') });
  if (order.isLoading) return <Loading />;
  if (order.error) return <ErrorText error={order.error} />;
  const data = order.data;
  if (!data) return null;
  return (
    <div className="panel">
      <ErrorText error={error} />
      <h2>{data.orderNumber}</h2>
      <p>{data.customer.name}<br />{data.customer.email}<br />{data.customer.phone}</p>
      <p>Deliver to {data.delivery.recipientName}, {data.delivery.addressLine1}, {data.delivery.city}, {data.delivery.state}. {data.delivery.notes}</p>
      <p>Payment <Badge value={data.paymentStatus} /> {data.paymentReference ? `· ${data.paymentReference}` : ''}</p>
      <p>Fulfilment <Badge value={data.fulfilmentStatus} /></p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead>
          <tbody>
            {data.lines.map((line, index) => <tr key={index}><td>{line.name} {line.sku}</td><td>{line.quantity}</td><td>{naira(line.unitPrice)}</td><td>{naira(line.lineTotal)}</td></tr>)}
          </tbody>
        </table>
      </div>
      <p>Subtotal {naira(data.subtotal)} · Delivery {naira(data.deliveryCost)} · Installation {naira(data.installationCost)} · Tax {naira(data.tax)} · Total {naira(data.total)}</p>
      {can('orders:update') ? (
        <form className="form-grid" key={`${data.fulfilmentStatus}-${data.branchId}`} onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const body: Record<string, unknown> = { fulfilmentStatus: form.get('fulfilmentStatus') };
          const branchId = String(form.get('branchId') ?? '');
          if (branchId) body.branchId = branchId;
          setError(null);
          void api(`/api/v1/admin/orders/${id}/fulfilment`, { method: 'PATCH', json: body })
            .then(async () => { toast('Fulfilment updated.'); await client.invalidateQueries({ queryKey: ['order', id] }); })
            .catch(setError);
        }}>
          <label className="field">Fulfilment stage
            <select name="fulfilmentStatus" defaultValue={data.fulfilmentStatus}>
              {FULFILMENT.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          {branches.data ? (
            <label className="field">Branch
              <select name="branchId" defaultValue={data.branchId}>
                {branches.data.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </label>
          ) : null}
          <button className="btn" type="submit">Update fulfilment</button>
        </form>
      ) : null}
      {can('orders:cancel') && data.paymentStatus !== 'paid' && data.paymentStatus !== 'cancelled' ? (
        <button className="btn danger" type="button" onClick={() => void confirm({ title: 'Cancel this unpaid order?', body: 'Paid orders cannot be cancelled here. Stock reserved for a pending order is released.', danger: true, confirmLabel: 'Cancel order' }).then(async (ok) => {
          if (!ok) return;
          try {
            await api(`/api/v1/admin/orders/${id}/cancel`, { method: 'POST', json: {} });
            toast('Order cancelled.');
            await client.invalidateQueries({ queryKey: ['order', id] });
          } catch (cancelError) {
            setError(cancelError);
          }
        })}>Cancel unpaid order</button>
      ) : null}
    </div>
  );
}
