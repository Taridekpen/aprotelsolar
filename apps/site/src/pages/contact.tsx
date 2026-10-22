import { FormEvent, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, apiList } from '../lib/api';
import { naira, STATES } from '../lib/format';
import type { Branch, ContentPage, Product, SolarPackage } from '../lib/types';
import { textBody } from '../lib/types';
import { ErrorNote, Loading, OfficeList, useSeo } from '../components/chrome';

const TYPES = ['general', 'product', 'installation', 'quotation', 'maintenance', 'cctv', 'consultation'] as const;

export function ContactPage() {
  const [params] = useSearchParams();
  const contact = useQuery({ queryKey: ['content', 'contact'], queryFn: () => api<ContentPage>('/api/v1/content/contact') });
  const faqs = useQuery({ queryKey: ['content', 'faq'], queryFn: () => api<ContentPage>('/api/v1/content/faq') });
  const branches = useQuery({ queryKey: ['branches'], queryFn: () => api<Branch[]>('/api/v1/branches') });
  const info = contact.data?.items.find((item) => item.type === 'contact_info');
  const locations = contact.data?.items.filter((item) => item.type === 'company_location') ?? [];
  useSeo(info?.seo.title || 'Contact', info?.seo.description);
  const [reference, setReference] = useState('');
  const send = useMutation({
    mutationFn: (form: FormData) => api<{ reference: string }>('/api/v1/enquiries', {
      method: 'POST',
      json: {
        name: String(form.get('name')),
        email: String(form.get('email')),
        phone: String(form.get('phone')),
        location: String(form.get('location')),
        enquiryType: String(form.get('enquiryType')),
        message: String(form.get('message')),
        productIds: params.get('product') ? [params.get('product')] : undefined,
      },
    }),
    onSuccess: (result) => setReference(result.reference),
  });
  return (
    <div className="wrap page">
      <p className="eyebrow">Contact</p>
      <h1>{info ? textBody(info.body, 'heading') || info.title : 'Contact Aprotel'}</h1>
      <p>{branches.data?.length ? 'Call an office or send a consultation request.' : info ? textBody(info.body, 'body') || info.summary : 'Call a branch or send a consultation request.'}</p>
      <div className="prose-split">
        <div>
          <h2>Branches</h2>
          <OfficeList branches={branches.data ?? []} />
          {locations.map((location) => {
            const address = textBody(location.body, 'address');
            return (
              <p key={location.id}>
                <strong>{textBody(location.body, 'name') || location.title}</strong>
                {textBody(location.body, 'phone') ? <><br />{textBody(location.body, 'phone')}</> : null}
                {address ? <details className="address-reveal"><summary>Show address</summary>{address}</details> : null}
              </p>
            );
          })}
          <p className="note">Business hours are shown when they are published in website content.</p>
        </div>
        <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); send.mutate(new FormData(event.currentTarget)); }}>
          <ErrorNote error={send.error} />
          {reference ? <p className="ok" role="status">Request received. Reference {reference}.</p> : null}
          <div className="form-grid">
            <label className="field">Name<input name="name" required minLength={2} /></label>
            <label className="field">Phone<input name="phone" required /></label>
            <label className="field">Email<input name="email" type="email" required /></label>
            <label className="field">Location<input name="location" required defaultValue="Yenagoa" /></label>
            <label className="field wide">Enquiry
              <select name="enquiryType" defaultValue={params.get('type') ?? 'consultation'}>
                {TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label className="field wide">Message
              <textarea name="message" required minLength={10} defaultValue={params.get('service') ? `Consultation for ${params.get('service')}. ` : ''} />
            </label>
          </div>
          <button className="btn" type="submit" disabled={send.isPending}>{send.isPending ? 'Sending…' : 'Send'}</button>
        </form>
      </div>
      {faqs.data?.items.length ? (
        <section>
          <h2>Questions</h2>
          {faqs.data.items.map((item) => (
            <details key={item.id}>
              <summary>{textBody(item.body, 'question') || item.title}</summary>
              <p>{textBody(item.body, 'answer') || item.summary}</p>
            </details>
          ))}
        </section>
      ) : null}
      {contact.isLoading || branches.isLoading ? <Loading /> : null}
    </div>
  );
}

export function QuotePage() {
  const [params] = useSearchParams();
  const products = useQuery({ queryKey: ['products', 'quote'], queryFn: () => apiList<Product>('/api/v1/products?pageSize=100') });
  const packages = useQuery({ queryKey: ['packages', 'quote'], queryFn: () => apiList<SolarPackage>('/api/v1/solar-packages?pageSize=50') });
  const [reference, setReference] = useState('');
  useSeo('Request a quotation');
  const send = useMutation({
    mutationFn: (form: FormData) => {
      const productId = String(form.get('productId') || '');
      const packageId = String(form.get('packageId') || '');
      if (!productId && !packageId) throw new Error('Choose a product or a solar package.');
      return api<{ reference: string; total: string; engineeringApproval: string }>('/api/v1/quotations', {
        method: 'POST',
        json: {
          customer: { name: String(form.get('name')), email: String(form.get('email')), phone: String(form.get('phone')), location: String(form.get('state')) },
          state: String(form.get('state')),
          includeInstallation: form.get('installation') === 'on',
          applianceSnapshot: { notes: String(form.get('notes') || 'Customer quotation from the website.') },
          items: productId ? [{ productId, quantity: Number(form.get('quantity') || 1) }] : [],
          packageIds: packageId ? [{ packageId, quantity: 1 }] : [],
        },
      });
    },
    onSuccess: (result) => setReference(`${result.reference} · server total ${naira(result.total)} · engineering ${result.engineeringApproval}`),
  });
  return (
    <div className="wrap page">
      <h1>Request a quotation</h1>
      <p className="note">The total is priced by the server from current catalogue records. Engineering approval stays pending until an engineer reviews it.</p>
      <ErrorNote error={send.error} />
      {reference ? <p className="ok" role="status">Quotation {reference}.</p> : null}
      <form className="form-grid" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); send.mutate(new FormData(event.currentTarget)); }}>
        <label className="field">Name<input name="name" required /></label>
        <label className="field">Phone<input name="phone" required /></label>
        <label className="field">Email<input name="email" type="email" required /></label>
        <label className="field">State<select name="state" defaultValue="Bayelsa">{STATES.map((state) => <option key={state}>{state}</option>)}</select></label>
        <label className="field">Product
          <select key={products.data ? 'products-ready' : 'products-loading'} name="productId" defaultValue={params.get('product') ?? ''}>
            <option value="">None</option>
            {products.data?.items.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
        </label>
        <label className="field">Quantity<input name="quantity" type="number" min={1} defaultValue={1} /></label>
        <label className="field wide">Package
          <select key={packages.data ? 'packages-ready' : 'packages-loading'} name="packageId" defaultValue={params.get('package') ?? ''}>
            <option value="">None</option>
            {packages.data?.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="field wide">Notes<textarea name="notes" /></label>
        <label className="wide"><input name="installation" type="checkbox" /> Include installation</label>
        <button className="btn" type="submit" disabled={send.isPending}>Submit quotation</button>
      </form>
    </div>
  );
}
