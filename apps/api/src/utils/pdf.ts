function escapePdfText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapLine(value: string, width: number) {
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) return [''];
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function renderTextPdf(lines: string[]): Buffer {
  const wrapped = lines.flatMap((line) => wrapLine(line, 92));
  const pageSize = 46;
  const pages: string[][] = [];
  for (let index = 0; index < wrapped.length; index += pageSize) {
    pages.push(wrapped.slice(index, index + pageSize));
  }
  if (pages.length === 0) pages.push(['']);

  const objects: string[] = [];
  const pageIds: number[] = [];
  const fontId = 3;
  let nextId = 4;
  const pageObjects: Array<{ pageId: number; contentId: number; stream: string }> = [];
  for (const page of pages) {
    const contentId = nextId++;
    const pageId = nextId++;
    pageIds.push(pageId);
    const commands = ['BT', '/F1 11 Tf', '48 790 Td', '14 TL'];
    page.forEach((line, index) => {
      if (index === 0) commands.push(`(${escapePdfText(line)}) Tj`);
      else commands.push('T*', `(${escapePdfText(line)}) Tj`);
    });
    commands.push('ET');
    const stream = commands.join('\n');
    pageObjects.push({ pageId, contentId, stream });
  }

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  for (const page of pageObjects) {
    objects[page.contentId] = `<< /Length ${Buffer.byteLength(page.stream)} >>\nstream\n${page.stream}\nendstream`;
    objects[page.pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${page.contentId} 0 R >>`;
  }

  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(body);
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length}\n`;
  body += '0000000000 65535 f \n';
  for (let id = 1; id < objects.length; id += 1) {
    body += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}

export function quotationPdfLines(quotation: {
  reference: string;
  customer: { name: string; email: string; phone: string; location?: string };
  status: string;
  engineeringApproval: string;
  currency: string;
  lines: Array<{ name: string; sku: string; quantity: number; unitPrice: string; lineTotal: string }>;
  packageLines: Array<{ name: string; quantity: number; unitPrice: string; lineTotal: string }>;
  subtotal: string;
  deliveryCost: string;
  installationCost: string;
  tax: string;
  total: string;
  expiresAt?: string | Date;
  applianceSnapshot?: {
    notes?: string;
    design?: {
      narrative?: string[];
      assumptions?: Array<{ text: string }>;
      warnings?: Array<{ message: string }>;
      engineeringApprovalRequired?: boolean;
    };
  };
}) {
  const lines = [
    'Aprotel Services Nig. Ltd.',
    `Quotation ${quotation.reference}`,
    `Status: ${quotation.status}`,
    `Engineering approval: ${quotation.engineeringApproval}`,
    `Customer: ${quotation.customer.name}`,
    `Email: ${quotation.customer.email}`,
    `Phone: ${quotation.customer.phone}`,
    `Location: ${quotation.customer.location ?? ''}`,
    '',
    'Equipment',
  ];
  for (const line of quotation.lines) {
    lines.push(`${line.quantity} x ${line.name} (${line.sku}) — ${quotation.currency} ${line.unitPrice} — ${quotation.currency} ${line.lineTotal}`);
  }
  for (const line of quotation.packageLines) {
    lines.push(`${line.quantity} x ${line.name} — ${quotation.currency} ${line.unitPrice} — ${quotation.currency} ${line.lineTotal}`);
  }
  lines.push(
    '',
    `Subtotal: ${quotation.currency} ${quotation.subtotal}`,
    `Delivery: ${quotation.currency} ${quotation.deliveryCost}`,
    `Installation: ${quotation.currency} ${quotation.installationCost}`,
    `Tax: ${quotation.currency} ${quotation.tax}`,
    `Total: ${quotation.currency} ${quotation.total}`,
    quotation.expiresAt ? `Valid until: ${new Date(quotation.expiresAt).toISOString().slice(0, 10)}` : '',
    '',
    'Planning notes',
  );
  const design = quotation.applianceSnapshot?.design;
  if (design?.narrative?.length) {
    for (const line of design.narrative) lines.push(line);
  } else {
    lines.push(quotation.applianceSnapshot?.notes || 'No calculation snapshot was stored with this quotation.');
  }
  for (const assumption of design?.assumptions ?? []) lines.push(`Assumption: ${assumption.text}`);
  for (const warning of design?.warnings ?? []) lines.push(`Warning: ${warning.message}`);
  lines.push(
    '',
    'This document is an estimate. It is not an approved installation design and it does not promise a quantity of electricity.',
    design?.engineeringApprovalRequired ? 'Engineering approval is required before this is treated as a final system design.' : '',
    `Engineering approval: ${quotation.engineeringApproval}`,
    'Prices are the stored quotation snapshot. Payment status is not confirmed by this document.',
  );
  return lines.filter((line) => line !== undefined);
}
