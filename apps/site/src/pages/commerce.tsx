import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { api } from '../lib/api';
import { cart, emptyLines } from '../lib/cart';
import { naira } from '../lib/format';
import { ErrorNote, Photo, useSeo } from '../components/chrome';

type RequestReceipt = { reference: string; message: string };

export function CartPage() {
  const lines = useSyncExternalStore(cart.subscribe, cart.getSnapshot, () => emptyLines);
  const subtotal = lines.reduce((sum, line) => sum + Number(line.unitPrice) * line.quantity, 0);
  useSeo('Cart');
  return (
    <div className="wrap page">
      <h1>Cart</h1>
      {lines.length === 0 ? <p>Your cart is empty. <Link to="/products">Continue with the catalogue.</Link></p> : null}
      <table className="catalogue">
        <thead><tr><th></th><th>Item</th><th>Qty</th><th>Catalogue price</th><th></th></tr></thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.kind + line.id}>
              <td><Photo id={line.imageId} alt="" sizes="72px" /></td>
              <td><Link to={line.kind === 'product' ? `/products/${line.slug}` : `/packages/${line.slug}`}>{line.name}</Link></td>
              <td><input aria-label={`Quantity for ${line.name}`} type="number" min={1} max={99} value={line.quantity} onChange={(event) => cart.setQuantity(line.kind, line.id, Number(event.target.value))} /></td>
              <td>{naira(line.unitPrice)}</td>
              <td><button className="btn-line" type="button" onClick={() => cart.remove(line.kind, line.id)}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {lines.length ? (
        <>
          <p>Catalogue subtotal {naira(subtotal)}. Aprotel confirms the total after you send the request. No payment is taken online.</p>
          <p><Link to="/products">Continue shopping</Link> <Link className="btn" to="/checkout">Send request</Link></p>
        </>
      ) : null}
    </div>
  );
}

export function CheckoutPage() {
  const lines = useSyncExternalStore(cart.subscribe, cart.getSnapshot, () => emptyLines);
  const [receipt, setReceipt] = useState<RequestReceipt | null>(null);
  useSeo('Send a request');
  const place = useMutation({
    mutationFn: (form: FormData) => api<RequestReceipt>('/api/v1/order-requests', {
      method: 'POST',
      json: {
        name: String(form.get('name')),
        phone: String(form.get('phone')),
        email: String(form.get('email')),
        note: String(form.get('note') ?? ''),
        items: lines.map((line) => ({ kind: line.kind, id: line.id, quantity: line.quantity })),
      },
    }),
    onSuccess: (created) => {
      setReceipt(created);
      cart.clear();
    },
  });
  if (receipt) {
    return (
      <div className="wrap page">
        <h1>Request {receipt.reference}</h1>
        <p className="ok">{receipt.message}</p>
        <p><Link to="/products">Back to the catalogue</Link></p>
      </div>
    );
  }
  return (
    <div className="wrap page">
      <h1>Send a request</h1>
      <p className="note">Share your contact details with the items in your cart. Aprotel will reply to confirm price and availability. No payment is taken on this website.</p>
      {lines.length === 0 ? <p>Add equipment before sending a request. <Link to="/products">Catalogue</Link></p> : null}
      <ErrorNote error={place.error} />
      <form className="form-grid" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); place.mutate(new FormData(event.currentTarget)); }}>
        <label className="field">Name<input name="name" required minLength={2} /></label>
        <label className="field">Phone<input name="phone" required placeholder="08000000000" /></label>
        <label className="field wide">Email<input name="email" type="email" required /></label>
        <label className="field wide">Note<textarea name="note" maxLength={2000} /></label>
        <div className="wide">
          <h2>Items</h2>
          <ul>{lines.map((line) => <li key={line.kind + line.id}>{line.quantity} × {line.name} at {naira(line.unitPrice)} catalogue price</li>)}</ul>
          <p className="note">These are catalogue list prices. The company confirms the total.</p>
          <button className="btn" type="submit" disabled={place.isPending || lines.length === 0}>{place.isPending ? 'Sending…' : 'Send request'}</button>
        </div>
      </form>
    </div>
  );
}
