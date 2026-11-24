import { Link } from 'react-router-dom';
import { useSyncExternalStore } from 'react';
import { cart, emptyLines } from '../lib/cart';
import { naira } from '../lib/format';
import { cartWhatsAppMessage, WhatsAppLink, whatsAppUrl } from '../lib/whatsapp';
import { Photo, useSeo } from '../components/chrome';

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
          <p>Catalogue subtotal {naira(subtotal)}. Checkout opens WhatsApp with every item in this cart. Aprotel confirms the total in the chat. No payment is taken online.</p>
          <p className="buy-actions">
            <Link className="btn-line" to="/products">Continue shopping</Link>
            <WhatsAppLink href={whatsAppUrl(cartWhatsAppMessage(lines))}>Checkout</WhatsAppLink>
          </p>
        </>
      ) : null}
    </div>
  );
}

export function CheckoutPage() {
  const lines = useSyncExternalStore(cart.subscribe, cart.getSnapshot, () => emptyLines);
  const subtotal = lines.reduce((sum, line) => sum + Number(line.unitPrice) * line.quantity, 0);
  useSeo('Checkout');
  return (
    <div className="wrap page">
      <h1>Checkout</h1>
      <p className="note">Checkout opens a WhatsApp chat with +234 703 691 3410 and every item in your cart. Aprotel confirms price and availability there. No payment is taken on this website.</p>
      {lines.length === 0 ? <p>Your cart is empty. <Link to="/products">Continue with the catalogue.</Link></p> : (
        <>
          <ul>
            {lines.map((line) => (
              <li key={line.kind + line.id}>
                {line.quantity} × {line.name} at {naira(line.unitPrice)} each ({naira(Number(line.unitPrice) * line.quantity)})
              </li>
            ))}
          </ul>
          <p>Catalogue subtotal {naira(subtotal)}.</p>
          <p className="buy-actions">
            <Link className="btn-line" to="/cart">Back to cart</Link>
            <WhatsAppLink href={whatsAppUrl(cartWhatsAppMessage(lines))}>Continue</WhatsAppLink>
          </p>
        </>
      )}
    </div>
  );
}
