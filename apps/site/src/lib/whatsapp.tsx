import type { ReactNode } from 'react';
import type { CartLine } from './cart';
import { naira, specificationRows } from './format';
import type { Product, SolarPackage } from './types';

export const WHATSAPP_NUMBER = '2347036913410';
export const WHATSAPP_DISPLAY = '+234 703 691 3410';

export function whatsAppUrl(message: string) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

function pageUrl(path: string) {
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}${path}`;
}

function clip(text: string, max = 400) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
}

export function productWhatsAppMessage(product: Product, quantity = 1) {
  const lines = [
    'Hello Aprotel Solar, I want to buy this product:',
    '',
    `Product: ${product.name}`,
    `Brand: ${product.brand}`,
    `SKU: ${product.sku}`,
    `Quantity: ${quantity}`,
    `Price: ${naira(product.sellingPrice)} each`,
    `Line total: ${naira(Number(product.sellingPrice) * quantity)}`,
  ];
  if (product.compareAtPrice) lines.push(`Previous price: ${naira(product.compareAtPrice)}`);
  if (product.availability) lines.push(`Availability: ${product.availability}`);
  if (product.warranty) lines.push(`Warranty: ${product.warranty}`);
  if (product.shortDescription) lines.push(`Summary: ${clip(product.shortDescription, 280)}`);
  const specs = specificationRows(product.specifications).slice(0, 10);
  if (specs.length) {
    lines.push('', 'Specifications:');
    for (const row of specs) lines.push(`- ${row.label}: ${row.value}`);
  }
  if (product.description && product.description !== product.shortDescription) {
    lines.push('', `Description: ${clip(product.description, 500)}`);
  }
  if (product.installationRequirements) lines.push(`Installation: ${clip(product.installationRequirements, 240)}`);
  lines.push('', `Page: ${pageUrl(`/products/${product.slug}`)}`);
  lines.push('', 'Please confirm availability and the total.');
  return lines.join('\n');
}

export function packageWhatsAppMessage(item: SolarPackage, included: string[] = []) {
  const runtime = item.runtimeAssumptions;
  const lines = [
    'Hello Aprotel Solar, I want this solar package:',
    '',
    `Package: ${item.name}`,
    `Solar panels: ${item.solarPanelCapacityKw} kW`,
    `Battery: ${item.batteryCapacityKwh} kWh`,
    `Inverter: ${item.inverterSummary}`,
    `Estimated capacity: ${item.estimatedCapacityKw} kW`,
    `Package price: ${naira(item.price)}`,
    `Installation charge: ${naira(item.installationCharge)}`,
  ];
  if (item.availability) lines.push(`Availability: ${item.availability}`);
  if (item.warranty) lines.push(`Warranty: ${item.warranty}`);
  lines.push(`Stated load: ${runtime.loadWatts} W`);
  if (runtime.estimatedRuntimeHours != null) lines.push(`Recorded runtime: ${runtime.estimatedRuntimeHours} hours at that load`);
  if (runtime.operatingNotes) lines.push(`Operating notes: ${clip(runtime.operatingNotes, 280)}`);
  if (item.description) lines.push('', `Description: ${clip(item.description, 500)}`);
  if (included.length) {
    lines.push('', 'Included equipment:');
    for (const row of included) lines.push(`- ${row}`);
  }
  lines.push('', `Page: ${pageUrl(`/packages/${item.slug}`)}`);
  lines.push('', 'Please confirm availability and the total.');
  return lines.join('\n');
}

export function cartWhatsAppMessage(items: CartLine[]) {
  const subtotal = items.reduce((sum, line) => sum + Number(line.unitPrice) * line.quantity, 0);
  const lines = ['Hello Aprotel Solar, I want to order these items from my cart:', ''];
  items.forEach((line, index) => {
    const lineTotal = Number(line.unitPrice) * line.quantity;
    const kind = line.kind === 'package' ? 'Package' : 'Product';
    lines.push(`${index + 1}. ${line.quantity} × ${line.name} (${kind})`);
    lines.push(`   Catalogue price: ${naira(line.unitPrice)} each`);
    lines.push(`   Line total: ${naira(lineTotal)}`);
    lines.push(`   ${pageUrl(line.kind === 'product' ? `/products/${line.slug}` : `/packages/${line.slug}`)}`);
  });
  lines.push('', `Catalogue subtotal: ${naira(subtotal)}`);
  lines.push('', 'Please confirm availability and the total. No payment has been made on the website.');
  return lines.join('\n');
}

export function recommendedProductMessage(product: {
  name: string;
  brand?: string;
  sku?: string;
  slug: string;
  quantity: number;
  unitPriceNaira: number;
  warranty: string;
  reason: string;
}) {
  const lines = [
    'Hello Aprotel Solar, I want to buy this product:',
    '',
    `Product: ${product.name}`,
  ];
  if (product.brand) lines.push(`Brand: ${product.brand}`);
  if (product.sku) lines.push(`SKU: ${product.sku}`);
  lines.push(
    `Quantity: ${product.quantity}`,
    `Price: ${naira(product.unitPriceNaira)} each`,
    `Line total: ${naira(product.unitPriceNaira * product.quantity)}`,
  );
  if (product.warranty) lines.push(`Warranty: ${product.warranty}`);
  if (product.reason) lines.push(`Selection note: ${clip(product.reason, 280)}`);
  lines.push('', `Page: ${pageUrl(`/products/${product.slug}`)}`);
  lines.push('', 'Please confirm availability and the total.');
  return lines.join('\n');
}

export function WhatsAppLink({ href, children, className = 'btn-wa' }: { href: string; children?: ReactNode; className?: string }) {
  return (
    <a className={children == null ? `${className} btn-wa-icon` : className} href={href} target="_blank" rel="noopener noreferrer" aria-label={children == null ? 'WhatsApp' : undefined}>
      <WhatsAppIcon />
      {children}
    </a>
  );
}

export function PurchaseActions({
  message,
  onAdd,
  added = false,
  disabled = false,
  addLabel = 'Add to cart',
}: {
  message: string;
  onAdd: () => void;
  added?: boolean;
  disabled?: boolean;
  addLabel?: string;
}) {
  return (
    <div className="buy-actions">
      <button className="btn" type="button" disabled={disabled} onClick={onAdd}>{added ? 'Added' : addLabel}</button>
      <WhatsAppLink href={whatsAppUrl(message)} />
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M20.52 3.48A11.78 11.78 0 0 0 12.06 0C5.5 0 .16 5.34.16 11.9c0 2.1.55 4.14 1.6 5.95L0 24l6.3-1.65a11.86 11.86 0 0 0 5.76 1.47h.01c6.56 0 11.9-5.34 11.9-11.9 0-3.18-1.24-6.16-3.45-8.44zM12.07 21.8h-.01a9.86 9.86 0 0 1-5.02-1.38l-.36-.21-3.74.98 1-3.64-.23-.37a9.84 9.84 0 0 1-1.51-5.26c0-5.45 4.44-9.89 9.9-9.89 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 7c0 5.45-4.44 9.87-9.91 9.87zm5.42-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35z" />
    </svg>
  );
}
