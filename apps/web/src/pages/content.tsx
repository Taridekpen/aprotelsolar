import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiList, queryString } from '../lib/api';
import { useCan } from '../session';
import { MediaPicker } from '../components/media-picker';
import { Badge, Empty, ErrorText, Field, Loading, useConfirm, useToast } from '../components/ui';

type Entry = {
  id: string;
  type: string;
  title: string;
  summary: string;
  body: Record<string, unknown>;
  imageIds: string[];
  displayOrder: number;
  publicationStatus: string;
  seo: { title: string; description: string };
};
type Option = { id: string; name: string };

const TYPES = [
  'homepage_hero', 'promotional_banner', 'featured_section', 'featured_catalog', 'company_statistics',
  'about', 'contact_info', 'company_location', 'testimonial', 'faq', 'completed_installation', 'project_gallery',
  'navigation', 'footer', 'seo_metadata',
] as const;

export function ContentPage() {
  const can = useCan();
  const toast = useToast();
  const confirm = useConfirm();
  const client = useQueryClient();
  const [type, setType] = useState<string>('homepage_hero');
  const [editing, setEditing] = useState<Entry | null>(null);
  const [error, setError] = useState<unknown>(null);
  const query = useQuery({ queryKey: ['content', type], queryFn: () => api<Entry[]>(`/api/v1/admin/content${queryString({ type, pageSize: 100 })}`) });
  const products = useQuery({ queryKey: ['product-options'], queryFn: () => apiList<Option>(`/api/v1/admin/products${queryString({ pageSize: 100, status: 'published' })}`), enabled: type === 'featured_catalog' });
  const services = useQuery({ queryKey: ['services'], queryFn: () => api<Option[]>('/api/v1/admin/services'), enabled: type === 'featured_catalog' });

  async function save(form: FormData) {
    setError(null);
    const body = bodyFrom(type, form, editing?.body);
    const payload = {
      type,
      title: String(form.get('title') ?? ''),
      summary: String(form.get('summary') ?? ''),
      body,
      imageIds: String(form.get('imageIds') ?? '').split(',').filter(Boolean),
      displayOrder: Number(form.get('displayOrder') ?? 0),
      publicationStatus: String(form.get('publicationStatus') ?? 'published'),
      seo: { title: String(form.get('seoTitle') ?? ''), description: String(form.get('seoDescription') ?? '') },
    };
    try {
      if (editing) await api(`/api/v1/admin/content/${editing.id}`, { method: 'PATCH', json: payload });
      else await api('/api/v1/admin/content', { method: 'POST', json: payload });
      setEditing(null);
      toast('Content saved.');
      await client.invalidateQueries({ queryKey: ['content'] });
    } catch (saveError) {
      setError(saveError);
    }
  }

  return (
    <div className="split" style={{ alignItems: 'start' }}>
      <div style={{ flex: 1.2 }}>
        <label className="field">Content type
          <select value={type} onChange={(event) => { setType(event.target.value); setEditing(null); }}>
            {TYPES.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}
          </select>
        </label>
        {query.isLoading ? <Loading /> : null}
        <ErrorText error={query.error} />
        {query.data?.length === 0 ? <Empty title="Nothing in this section" body="Add a structured entry. It is published to the public page for its type." /> : null}
        {query.data && query.data.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Title</th><th>Order</th><th>State</th><th></th></tr></thead>
              <tbody>
                {query.data.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.title}</td>
                    <td>{entry.displayOrder}</td>
                    <td><Badge value={entry.publicationStatus} /></td>
                    <td>
                      <button className="btn secondary" type="button" onClick={() => setEditing(entry)}>Edit</button>
                      {can('content:write') ? <button className="btn danger" type="button" onClick={() => void confirm({ title: 'Archive this entry?', body: entry.title, danger: true, confirmLabel: 'Archive' }).then(async (ok) => { if (!ok) return; await api(`/api/v1/admin/content/${entry.id}`, { method: 'DELETE' }); await client.invalidateQueries({ queryKey: ['content'] }); })}>Archive</button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
      {can('content:write') ? (
        <ContentForm key={editing?.id ?? type} type={type} entry={editing} products={products.data?.items ?? []} services={services.data ?? []} error={error} onSave={save} onClear={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

function ContentForm({ type, entry, products, services, error, onSave, onClear }: { type: string; entry: Entry | null; products: Option[]; services: Option[]; error: unknown; onSave: (form: FormData) => void; onClear: () => void }) {
  const body = entry?.body ?? {};
  const formRef = useRef<HTMLFormElement>(null);
  const [revision, setRevision] = useState(0);
  const [images, setImages] = useState<string[]>(entry?.imageIds ?? []);
  const [stats, setStats] = useState<Array<{ label: string; value: string }>>(Array.isArray(body.items) ? body.items as Array<{ label: string; value: string }> : [{ label: '', value: '' }]);
  const [links, setLinks] = useState<Array<{ label: string; href: string }>>(Array.isArray(body.links) ? body.links as Array<{ label: string; href: string }> : Array.isArray(body.items) && type === 'navigation' ? body.items as Array<{ label: string; href: string }> : [{ label: '', href: '' }]);
  useEffect(() => { setImages(entry?.imageIds ?? []); }, [entry]);
  useEffect(() => { setRevision((current) => current + 1); }, [entry, stats, links, images]);
  return (
    <form ref={formRef} className="panel" style={{ flex: 1 }} onInput={() => setRevision((current) => current + 1)} onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); data.set('imageIds', images.join(',')); data.set('stats', JSON.stringify(stats)); data.set('links', JSON.stringify(links.filter((link) => link.label && link.href))); onSave(data); }}>
      <h2>{entry ? 'Edit entry' : 'New entry'}</h2>
      <ErrorText error={error} />
      <Field label="Title"><input name="title" required defaultValue={entry?.title ?? ''} /></Field>
      <Field label="Summary"><input name="summary" defaultValue={entry?.summary ?? ''} /></Field>
      <BodyFields type={type} body={body} products={products} services={services} stats={stats} setStats={setStats} links={links} setLinks={setLinks} />
      <Field label="Display order"><input name="displayOrder" type="number" defaultValue={entry?.displayOrder ?? 0} /></Field>
      <Field label="Publication" hint="Published entries appear on the website. Drafts stay in the admin.">
        <select name="publicationStatus" defaultValue={entry?.publicationStatus ?? 'published'}>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="inactive">Inactive</option>
        </select>
      </Field>
      <Field label="SEO title"><input name="seoTitle" defaultValue={entry?.seo.title ?? ''} /></Field>
      <Field label="SEO description"><input name="seoDescription" defaultValue={entry?.seo.description ?? ''} /></Field>
      <MediaPicker value={images} onChange={setImages} />
      <ContentPreview revision={revision} form={formRef.current} entry={entry} type={type} stats={stats} links={links} imageCount={images.length} products={products} services={services} />
      <div className="actions">
        <button className="btn" type="submit">Save content</button>
        {entry ? <button className="btn secondary" type="button" onClick={onClear}>Cancel</button> : null}
      </div>
    </form>
  );
}

function BodyFields({ type, body, products, services, stats, setStats, links, setLinks }: { type: string; body: Record<string, unknown>; products: Option[]; services: Option[]; stats: Array<{ label: string; value: string }>; setStats: (items: Array<{ label: string; value: string }>) => void; links: Array<{ label: string; href: string }>; setLinks: (items: Array<{ label: string; href: string }>) => void }) {
  const text = (name: string, label: string, area = false, source = name) => area
    ? <Field key={name} label={label}><textarea name={name} defaultValue={String(body[source] ?? '')} /></Field>
    : <Field key={name} label={label}><input name={name} defaultValue={String(body[source] ?? '')} /></Field>;
  if (type === 'homepage_hero') return <>{text('headline', 'Headline')}{text('subheadline', 'Subheadline', true)}{text('primaryCtaLabel', 'Primary button')}{text('primaryCtaHref', 'Primary link')}{text('secondaryCtaLabel', 'Secondary button')}{text('secondaryCtaHref', 'Secondary link')}</>;
  if (type === 'promotional_banner') return <>{text('message', 'Message')}{text('href', 'Link')}{dateField('startsAt', 'Starts', body.startsAt)}{dateField('endsAt', 'Ends', body.endsAt)}</>;
  if (type === 'about' || type === 'contact_info' || type === 'featured_section') return <>{text('heading', 'Heading')}{text('body', 'Body', true)}</>;
  if (type === 'company_location') return <>{text('name', 'Name')}{text('address', 'Address', true)}{text('phone', 'Phone')}{text('email', 'Email')}</>;
  if (type === 'testimonial') return <>{text('quote', 'Quote', true)}{text('author', 'Author')}{text('role', 'Role')}{text('location', 'Location')}</>;
  if (type === 'faq') return <>{text('question', 'Question')}{text('answer', 'Answer', true)}</>;
  if (type === 'completed_installation') return <>{text('projectTitle', 'Project title', false, 'title')}{text('location', 'Location')}{text('summary', 'Summary', true)}{dateField('completedOn', 'Completed on', body.completedOn)}</>;
  if (type === 'project_gallery') return <>{text('galleryTitle', 'Gallery title', false, 'title')}{text('caption', 'Caption')}</>;
  if (type === 'seo_metadata') return <>{text('page', 'Page key')}{text('metadataTitle', 'Metadata title', false, 'title')}{text('description', 'Description', true)}</>;
  if (type === 'company_statistics') return (
    <div>
      {stats.map((item, index) => (
        <div className="form-grid" key={index}>
          <Field label="Label"><input value={item.label} onChange={(event) => setStats(stats.map((row, rowIndex) => rowIndex === index ? { ...row, label: event.target.value } : row))} /></Field>
          <Field label="Value"><input value={item.value} onChange={(event) => setStats(stats.map((row, rowIndex) => rowIndex === index ? { ...row, value: event.target.value } : row))} /></Field>
        </div>
      ))}
      <button className="btn secondary" type="button" onClick={() => setStats([...stats, { label: '', value: '' }])}>Add statistic</button>
    </div>
  );
  if (type === 'featured_catalog') return (
    <>
      {text('heading', 'Heading')}
      <Field label="Featured products"><select name="productIds" multiple defaultValue={Array.isArray(body.productIds) ? body.productIds as string[] : []}>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></Field>
      <Field label="Featured services"><select name="serviceIds" multiple defaultValue={Array.isArray(body.serviceIds) ? body.serviceIds as string[] : []}>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></Field>
    </>
  );
  return (
    <div>
      {type === 'footer' ? text('blurb', 'Footer text', true) : null}
      {links.map((link, index) => (
        <div className="form-grid" key={index}>
          <Field label="Label"><input value={link.label} onChange={(event) => setLinks(links.map((row, rowIndex) => rowIndex === index ? { ...row, label: event.target.value } : row))} /></Field>
          <Field label="Link"><input value={link.href} onChange={(event) => setLinks(links.map((row, rowIndex) => rowIndex === index ? { ...row, href: event.target.value } : row))} /></Field>
        </div>
      ))}
      <button className="btn secondary" type="button" onClick={() => setLinks([...links, { label: '', href: '' }])}>Add link</button>
    </div>
  );
}

function ContentPreview({ form, entry, type, stats, links, imageCount, products, services }: { revision: number; form: HTMLFormElement | null; entry: Entry | null; type: string; stats: Array<{ label: string; value: string }>; links: Array<{ label: string; href: string }>; imageCount: number; products: Option[]; services: Option[] }) {
  const data = form ? new FormData(form) : null;
  const saved = entry?.body ?? {};
  const text = (key: string, fallback = '') => String(data?.get(key) ?? fallback).trim();
  const savedText = (key: string) => text(key, String(saved[key] ?? ''));
  const names = (key: string, options: Option[]) => {
    const stored = Array.isArray(saved[key]) ? saved[key] as string[] : [];
    const ids = new Set(data ? [...data.getAll(key)].map(String) : stored);
    return options.filter((item) => ids.has(item.id)).map((item) => item.name).join(', ');
  };
  const lines: Array<[string, string]> = [['Title', text('title', entry?.title ?? '')], ['Summary', text('summary', entry?.summary ?? '')]];
  const add = (label: string, value: string) => lines.push([label, value]);
  if (type === 'homepage_hero') {
    add('Headline', savedText('headline'));
    add('Subheadline', savedText('subheadline'));
    add('Primary action', [savedText('primaryCtaLabel'), savedText('primaryCtaHref')].filter(Boolean).join(' → '));
    add('Secondary action', [savedText('secondaryCtaLabel'), savedText('secondaryCtaHref')].filter(Boolean).join(' → '));
  } else if (type === 'promotional_banner') {
    add('Message', savedText('message'));
    add('Link', savedText('href'));
    add('Schedule', [savedText('startsAt'), savedText('endsAt')].filter(Boolean).join(' to '));
  } else if (type === 'testimonial') {
    add('Quote', savedText('quote'));
    add('Author', [savedText('author'), savedText('role'), savedText('location')].filter(Boolean).join(', '));
  } else if (type === 'faq') {
    add('Question', savedText('question'));
    add('Answer', savedText('answer'));
  } else if (type === 'company_statistics') {
    add('Statistics', stats.filter((item) => item.label && item.value).map((item) => `${item.label}: ${item.value}`).join(' · '));
  } else if (type === 'featured_catalog') {
    add('Heading', savedText('heading'));
    add('Products', names('productIds', products));
    add('Services', names('serviceIds', services));
  } else if (type === 'completed_installation') {
    add('Project', text('projectTitle', String(saved.title ?? '')));
    add('Location', savedText('location'));
    add('Summary', savedText('summary'));
    add('Completed', savedText('completedOn'));
  } else if (type === 'project_gallery') {
    add('Gallery title', text('galleryTitle', String(saved.title ?? '')));
    add('Caption', savedText('caption'));
  } else if (type === 'seo_metadata') {
    add('Page', savedText('page'));
    add('Metadata title', text('metadataTitle', String(saved.title ?? '')));
    add('Description', savedText('description'));
  } else if (type === 'navigation' || type === 'footer') {
    if (type === 'footer') add('Footer text', savedText('blurb'));
    add('Links', links.filter((link) => link.label && link.href).map((link) => link.label).join(', '));
  } else {
    for (const [key, label] of [['heading', 'Heading'], ['body', 'Body'], ['name', 'Name'], ['address', 'Address'], ['phone', 'Phone'], ['email', 'Email']] as const) {
      add(label, savedText(key));
    }
  }
  add('SEO', [text('seoTitle', entry?.seo.title ?? ''), text('seoDescription', entry?.seo.description ?? '')].filter(Boolean).join(' — '));
  const visible = lines.filter(([, value]) => value);
  return (
    <section className="section" aria-label="Content preview">
      <h3>Preview</h3>
      {visible.length ? (
        <dl className="preview">
          {visible.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : <p className="muted">The preview fills in as you complete this form.</p>}
      <p className="muted">{imageCount ? `${imageCount} image${imageCount === 1 ? '' : 's'} attached. ` : ''}Publishing places this entry on the public page for {type.replaceAll('_', ' ')}.</p>
    </section>
  );
}

function dateField(name: string, label: string, stored: unknown) {
  return (
    <Field key={name} label={label}>
      <input name={name} type="date" defaultValue={calendarDay(stored)} />
    </Field>
  );
}

function calendarDay(value: unknown) {
  const match = String(value ?? '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? '';
}

function isoDay(day: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T00:00:00.000Z` : null;
}

function bodyFrom(type: string, form: FormData, previous?: Record<string, unknown>) {
  const value = (key: string) => String(form.get(key) ?? previous?.[key] ?? '');
  const selected = (key: string) => [...form.getAll(key)].map(String);
  if (type === 'homepage_hero') return { headline: value('headline'), subheadline: value('subheadline'), primaryCtaLabel: value('primaryCtaLabel'), primaryCtaHref: value('primaryCtaHref'), secondaryCtaLabel: value('secondaryCtaLabel'), secondaryCtaHref: value('secondaryCtaHref') };
  if (type === 'promotional_banner') return { message: value('message'), href: value('href'), startsAt: isoDay(value('startsAt')), endsAt: isoDay(value('endsAt')) };
  if (type === 'about' || type === 'featured_section') return { heading: value('heading'), body: value('body') };
  if (type === 'contact_info') return { heading: value('heading'), body: value('body') };
  if (type === 'company_location') return { name: value('name'), address: value('address'), phone: value('phone'), email: value('email') || undefined };
  if (type === 'testimonial') return { quote: value('quote'), author: value('author'), role: value('role'), location: value('location') };
  if (type === 'faq') return { question: value('question'), answer: value('answer') };
  if (type === 'completed_installation') return { title: value('projectTitle'), location: value('location'), summary: value('summary'), completedOn: value('completedOn') || undefined };
  if (type === 'project_gallery') return { title: value('galleryTitle'), caption: value('caption') };
  if (type === 'seo_metadata') return { page: value('page'), title: value('metadataTitle'), description: value('description') };
  if (type === 'company_statistics') return { items: JSON.parse(String(form.get('stats') ?? '[]')).filter((item: { label: string; value: string }) => item.label && item.value) };
  if (type === 'featured_catalog') return { heading: value('heading'), productIds: selected('productIds'), serviceIds: selected('serviceIds') };
  if (type === 'footer') return { blurb: value('blurb'), links: JSON.parse(String(form.get('links') ?? '[]')) };
  return { items: JSON.parse(String(form.get('links') ?? '[]')) };
}
