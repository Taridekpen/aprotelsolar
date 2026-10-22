import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiList, queryString } from '../lib/api';
import { when } from '../lib/format';
import { useCan } from '../session';
import { Badge, Empty, ErrorText, Field, Loading, Pager, useToast } from '../components/ui';

type Branch = { id: string; name: string; code: string; city: string; state: string; phone: string; addressLine1: string; status: string; isCentral: boolean; email?: string };
type Product = { id: string; name: string; sku: string };
type Level = { id: string; productId: string; branchId: string; onHand: number; reserved: number; available: number; lowStockThreshold: number; lowStock: boolean };
type Movement = { id: string; productId: string; branchId: string; type: string; onHandDelta: number; note: string; createdAt: string };

export function InventoryPage() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') ?? 'stock';
  const can = useCan();
  const toast = useToast();
  const client = useQueryClient();
  const [error, setError] = useState<unknown>(null);
  const products = useQuery({ queryKey: ['product-options'], queryFn: () => apiList<Product>(`/api/v1/admin/products${queryString({ pageSize: 100 })}`), enabled: can('products:read') });
  const branches = useQuery({ queryKey: ['branches'], queryFn: () => api<Branch[]>('/api/v1/admin/branches'), enabled: can('branches:read') });
  const stock = useQuery({
    queryKey: ['inventory', params.toString()],
    enabled: view !== 'movements',
    queryFn: () => apiList<Level>(`/api/v1/admin/inventory${view === 'low' ? '/low-stock' : ''}${queryString({ page: params.get('page') ?? 1, pageSize: 20, productId: params.get('productId') ?? undefined, branchId: params.get('branchId') ?? undefined })}`),
  });
  const movements = useQuery({
    queryKey: ['movements', params.toString()],
    enabled: view === 'movements',
    queryFn: () => apiList<Movement>(`/api/v1/admin/inventory/movements${queryString({ page: params.get('page') ?? 1, pageSize: 20, productId: params.get('productId') ?? undefined })}`),
  });
  const names = new Map(products.data?.items.map((product) => [product.id, `${product.name} (${product.sku})`]));
  const branchNames = new Map(branches.data?.map((branch) => [branch.id, branch.name]));

  function submit(path: string, body: Record<string, unknown>) {
    setError(null);
    return api(path, { method: path.endsWith('thresholds') ? 'PATCH' : 'POST', json: body })
      .then(async () => {
        toast('Inventory updated.');
        await client.invalidateQueries({ queryKey: ['inventory'] });
        await client.invalidateQueries({ queryKey: ['movements'] });
      })
      .catch(setError);
  }

  return (
    <div>
      <div className="actions">
        {['stock', 'low', 'movements'].map((item) => (
          <button key={item} className={`btn ${view === item ? '' : 'secondary'}`} type="button" onClick={() => setParams({ view: item })}>
            {item === 'low' ? 'Low stock' : item === 'movements' ? 'Movement history' : 'Stock by branch'}
          </button>
        ))}
      </div>
      <form className="filters" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const next = new URLSearchParams(params);
        for (const key of ['productId', 'branchId']) {
          const value = String(form.get(key) ?? '');
          if (value) next.set(key, value); else next.delete(key);
        }
        next.delete('page');
        setParams(next);
      }}>
        <select name="productId" defaultValue={params.get('productId') ?? ''} aria-label="Product">
          <option value="">All products</option>
          {products.data?.items.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
        </select>
        <select name="branchId" defaultValue={params.get('branchId') ?? ''} aria-label="Branch">
          <option value="">All branches</option>
          {branches.data?.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
        <button className="btn secondary" type="submit">Apply</button>
      </form>
      <p className="muted">Stock actions follow the signed-in role. A reason is required for manual adjustments.</p>
      <ErrorText error={error} />
      {view !== 'movements' && stock.isLoading ? <Loading /> : null}
      {view === 'movements' && movements.isLoading ? <Loading /> : null}
      <ErrorText error={view === 'movements' ? movements.error : stock.error} />
      {view !== 'movements' && stock.data?.items.length === 0 ? <Empty title="No stock lines" body="Stock lines appear after products and branches exist." /> : null}
      {view !== 'movements' && stock.data && stock.data.items.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Product</th><th>Branch</th><th>On hand</th><th>Reserved</th><th>Available</th><th>Reorder</th><th></th></tr></thead>
            <tbody>
              {stock.data.items.map((level) => (
                <tr key={level.id}>
                  <td>{names.get(level.productId) ?? level.productId}</td>
                  <td>{branchNames.get(level.branchId) ?? level.branchId}</td>
                  <td>{level.onHand}</td>
                  <td>{level.reserved}</td>
                  <td>{level.available}</td>
                  <td>{level.lowStockThreshold}{level.lowStock ? ' · Low' : ''}</td>
                  <td>{level.lowStock ? <Badge value="low" /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {view === 'movements' && movements.data?.items.length === 0 ? <Empty title="No movements" body="Receipts, adjustments, transfers, and order reservations are listed here." /> : null}
      {view === 'movements' && movements.data && movements.data.items.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Type</th><th>Product</th><th>Branch</th><th>Change</th><th>Note</th></tr></thead>
            <tbody>
              {movements.data.items.map((movement) => (
                <tr key={movement.id}>
                  <td>{when(movement.createdAt)}</td>
                  <td>{movement.type.replaceAll('_', ' ')}</td>
                  <td>{names.get(movement.productId) ?? movement.productId}</td>
                  <td>{branchNames.get(movement.branchId) ?? movement.branchId}</td>
                  <td>{movement.onHandDelta}</td>
                  <td>{movement.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <Pager meta={view === 'movements' ? movements.data?.meta : stock.data?.meta} onPage={(page) => { const next = new URLSearchParams(params); next.set('page', String(page)); setParams(next); }} />
      {(can('inventory:receive') || can('inventory:adjust') || can('inventory:transfer')) && products.data && branches.data ? (
        <InventoryForms products={products.data.items} branches={branches.data} onSubmit={submit} />
      ) : null}
    </div>
  );
}

function InventoryForms({ products, branches, onSubmit }: { products: Product[]; branches: Branch[]; onSubmit: (path: string, body: Record<string, unknown>) => Promise<unknown> }) {
  const can = useCan();
  return (
    <div className="split" style={{ alignItems: 'start', marginTop: 16 }}>
      {can('inventory:receive') ? (
        <form className="panel" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void onSubmit('/api/v1/admin/inventory/receipts', { productId: form.get('productId'), branchId: form.get('branchId'), quantity: Number(form.get('quantity')), note: form.get('note') || undefined }); }}>
          <h2>Receive</h2>
          <ProductBranch products={products} branches={branches} />
          <Field label="Quantity"><input name="quantity" required type="number" min={1} /></Field>
          <Field label="Note"><input name="note" /></Field>
          <button className="btn" type="submit">Record receipt</button>
        </form>
      ) : null}
      {can('inventory:adjust') ? (
        <form className="panel" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void onSubmit('/api/v1/admin/inventory/adjustments', { productId: form.get('productId'), branchId: form.get('branchId'), delta: Number(form.get('delta')), note: form.get('note') }); }}>
          <h2>Adjust</h2>
          <ProductBranch products={products} branches={branches} />
          <Field label="Delta" hint="Use a negative number to remove stock."><input name="delta" required type="number" /></Field>
          <Field label="Reason"><input name="note" required minLength={3} /></Field>
          <button className="btn" type="submit">Record adjustment</button>
        </form>
      ) : null}
      {can('inventory:transfer') ? (
        <form className="panel" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void onSubmit('/api/v1/admin/inventory/transfers', { productId: form.get('productId'), fromBranchId: form.get('fromBranchId'), toBranchId: form.get('branchId'), quantity: Number(form.get('quantity')), note: form.get('note') || undefined }); }}>
          <h2>Transfer</h2>
          <Field label="Product"><select name="productId" required>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></Field>
          <Field label="From"><select name="fromBranchId" required>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></Field>
          <Field label="To"><select name="branchId" required>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></Field>
          <Field label="Quantity"><input name="quantity" required type="number" min={1} /></Field>
          <Field label="Note"><input name="note" /></Field>
          <button className="btn" type="submit">Transfer stock</button>
        </form>
      ) : null}
    </div>
  );
}

function ProductBranch({ products, branches }: { products: Product[]; branches: Branch[] }) {
  return (
    <>
      <Field label="Product"><select name="productId" required>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></Field>
      <Field label="Branch"><select name="branchId" required>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></Field>
    </>
  );
}

const branchEmpty = { name: '', code: '', addressLine1: '', city: '', state: 'Bayelsa', phone: '', email: '', isCentral: false, status: 'active' };

export function BranchesPage() {
  const can = useCan();
  const toast = useToast();
  const client = useQueryClient();
  const [form, setForm] = useState(branchEmpty);
  const [editing, setEditing] = useState<string | null>(null);
  const query = useQuery({ queryKey: ['branches'], queryFn: () => api<Branch[]>('/api/v1/admin/branches') });
  const save = useMutation({
    mutationFn: () => {
      const payload = { ...form, code: form.code.toUpperCase(), email: form.email || undefined };
      return editing ? api(`/api/v1/admin/branches/${editing}`, { method: 'PATCH', json: payload }) : api('/api/v1/admin/branches', { method: 'POST', json: payload });
    },
    onSuccess: async () => {
      setForm(branchEmpty);
      setEditing(null);
      toast('Branch saved.');
      await client.invalidateQueries({ queryKey: ['branches'] });
    },
  });
  return (
    <div className="split" style={{ alignItems: 'start' }}>
      <div style={{ flex: 2 }}>
        {query.isLoading ? <Loading /> : null}
        <ErrorText error={query.error} />
        {query.data?.length === 0 ? <Empty title="No branches" body="Add an Aprotel location before receiving stock." /> : null}
        {query.data && query.data.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Branch</th><th>Code</th><th>Location</th><th>Phone</th><th>State</th><th></th></tr></thead>
              <tbody>
                {query.data.map((branch) => (
                  <tr key={branch.id}>
                    <td>{branch.name}{branch.isCentral ? ' · Central' : ''}</td>
                    <td>{branch.code}</td>
                    <td>{branch.city}, {branch.state}</td>
                    <td>{branch.phone}</td>
                    <td><Badge value={branch.status} /></td>
                    <td>{can('branches:write') ? <button className="btn secondary" type="button" onClick={() => { setEditing(branch.id); setForm({ name: branch.name, code: branch.code, addressLine1: branch.addressLine1, city: branch.city, state: branch.state, phone: branch.phone, email: branch.email ?? '', isCentral: branch.isCentral, status: branch.status }); }}>Edit</button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
      {can('branches:write') ? (
        <form className="panel" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
          <h2>{editing ? 'Edit branch' : 'New branch'}</h2>
          <ErrorText error={save.error} />
          <Field label="Name"><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
          <Field label="Code"><input required value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /></Field>
          <Field label="Address"><input required value={form.addressLine1} onChange={(event) => setForm({ ...form, addressLine1: event.target.value })} /></Field>
          <Field label="City"><input required value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></Field>
          <Field label="State"><input required value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} /></Field>
          <Field label="Phone"><input required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
          <Field label="Email"><input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
          <label className="check"><input type="checkbox" checked={form.isCentral} onChange={(event) => setForm({ ...form, isCentral: event.target.checked })} /> Central fulfilment branch</label>
          <Field label="Status">
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
          <button className="btn" type="submit" disabled={save.isPending}>Save branch</button>
        </form>
      ) : null}
    </div>
  );
}
