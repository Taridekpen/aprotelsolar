import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Branch, ContentPage } from '../lib/types';
import { textBody } from '../lib/types';
import { ErrorNote, Loading, OfficeList, Photo, useSeo } from '../components/chrome';
import { scenes } from '../lib/scenes';

export function AboutPage() {
  const about = useQuery({ queryKey: ['content', 'about'], queryFn: () => api<ContentPage>('/api/v1/content/about') });
  const services = useQuery({ queryKey: ['services'], queryFn: () => api<Array<{ id: string; name: string; slug: string; description: string }>>('/api/v1/services') });
  const branches = useQuery({ queryKey: ['branches'], queryFn: () => api<Branch[]>('/api/v1/branches') });
  const entry = about.data?.items.find((item) => item.type === 'about');
  const stats = about.data?.items.find((item) => item.type === 'company_statistics');
  const quotes = about.data?.items.filter((item) => item.type === 'testimonial') ?? [];
  const statItems = Array.isArray(stats?.body.items) ? stats.body.items as Array<{ label?: string; value?: string }> : [];
  useSeo(entry?.seo.title || 'About Aprotel', entry?.seo.description || textBody(entry?.body ?? {}, 'body'));
  if (about.isLoading) return <Loading />;
  return (
    <article className="wrap page">
      <ErrorNote error={about.error} />
      <p className="eyebrow">About</p>
      <h1>{entry ? textBody(entry.body, 'heading') || entry.title : 'About Aprotel'}</h1>
      <div className="prose-split">
        <Photo id={entry?.imageIds[0]} alt={entry?.title ?? 'Aprotel showroom'} fallback={scenes.about} />
        <p>{entry ? textBody(entry.body, 'body') || entry.summary : 'Company background is published from the administration dashboard.'}</p>
      </div>
      {statItems.length > 0 ? (
        <section className="measure">
          <h2>Company figures</h2>
          <ol>
            {statItems.filter((item) => item.label && item.value).map((item) => <li key={item.label}><span>{item.label}</span><strong>{item.value}</strong></li>)}
          </ol>
        </section>
      ) : null}
      <section className="prose-split">
        <h2>Services</h2>
        <ul>
          {(services.data ?? []).map((service) => <li key={service.id}><Link to={`/services/${service.slug}`}>{service.name}</Link> — {service.description}</li>)}
        </ul>
      </section>
      <section>
        <h2>Operating locations</h2>
        <OfficeList branches={branches.data ?? []} />
      </section>
      {quotes.map((quote) => (
        <blockquote className="quote" key={quote.id}>
          {textBody(quote.body, 'quote')}
          <footer>{textBody(quote.body, 'author')}</footer>
        </blockquote>
      ))}
    </article>
  );
}
