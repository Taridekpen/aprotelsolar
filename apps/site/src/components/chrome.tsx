import { FormEvent, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { api } from '../lib/api';
import { cart } from '../lib/cart';
import { mapsLink, mediaUrl } from '../lib/format';
import type { Branch, ContentPage, Entry } from '../lib/types';
import { textBody } from '../lib/types';

const NAV = [
  ['/', 'Home'],
  ['/products', 'Products'],
  ['/packages', 'Solar Packages'],
  ['/services', 'Services'],
  ['/calculate', 'Calculator'],
  ['/projects', 'Projects'],
  ['/about', 'About'],
  ['/contact', 'Contact'],
] as const;

export function useSeo(title: string, description?: string) {
  useEffect(() => {
    document.title = title ? `${title} · Aprotel Solar` : 'Aprotel Solar';
    if (!description) return;
    let tag = document.querySelector('meta[name="description"]');
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute('name', 'description');
      document.head.appendChild(tag);
    }
    tag.setAttribute('content', description);
  }, [title, description]);
}

export function Photo({ id, alt, priority = false, sizes, fallback }: { id?: string | null; alt: string; priority?: boolean; sizes?: string; fallback?: string }) {
  if (!id && fallback) return <img className="photo" src={fallback} alt={alt} loading={priority ? 'eager' : 'lazy'} decoding="async" />;
  if (!id) return <div className="photo-fallback" aria-hidden="true">Aprotel</div>;
  return (
    <img
      className="photo"
      src={mediaUrl(id, 'medium')}
      srcSet={`${mediaUrl(id, 'thumbnail')} 320w, ${mediaUrl(id, 'medium')} 960w`}
      sizes={sizes ?? '(max-width: 800px) 100vw, 640px'}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
    />
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const count = useSyncExternalStore(cart.subscribe, () => cart.getSnapshot().reduce((sum, line) => sum + line.quantity, 0), () => 0);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();
  const navigation = useQuery({ queryKey: ['content', 'navigation'], queryFn: () => api<ContentPage>('/api/v1/content/navigation') });
  const branches = useQuery({ queryKey: ['branches'], queryFn: () => api<Branch[]>('/api/v1/branches') });
  const footer = navigation.data?.items.find((item) => item.type === 'footer');
  const links = navigation.data?.items.find((item) => item.type === 'navigation');
  const navItems = linkItems(links) ?? NAV.map(([href, label]) => ({ href, label }));
  const offices = branches.data ?? [];
  const places = [...new Set(offices.map((branch) => branch.state))];
  const central = offices.find((branch) => branch.isCentral) ?? offices[0];
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = String(new FormData(event.currentTarget).get('q') ?? '').trim();
    setOpen(false);
    navigate(term ? `/products?q=${encodeURIComponent(term)}` : '/products');
  }
  return (
    <div className="shell">
      <a className="skip" href="#content">Skip to content</a>
      <div className="topbar">
        <div>{places.length ? places.map((place) => <span key={place}>{place}</span>) : <span>Aprotel Services Nig. Ltd.</span>}</div>
        <div>
          {central?.phone ? <a href={`tel:${central.phone}`}>{central.phone}</a> : null}
          {central?.email ? <a href={`mailto:${central.email}`}> · {central.email}</a> : null}
        </div>
      </div>
      <header className="site-header">
        <Link className="mark" to="/" aria-label="Aprotel Solar" onClick={() => setOpen(false)}>
          <img src="/logo.png" alt="" width={78} height={78} />
        </Link>
        <nav className={open ? 'primary-nav open' : 'primary-nav'} aria-label="Primary">
          {navItems.map((item) => (
            <NavLink key={item.href + item.label} to={item.href} end={item.href === '/'} onClick={() => setOpen(false)}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="header-tools">
          {searching ? (
            <form className="header-search" onSubmit={search}>
              <input name="q" aria-label="Search products" placeholder="Search products" autoFocus />
            </form>
          ) : null}
          <button className="icon-button" type="button" aria-label="Search products" onClick={() => setSearching((value) => !value)}>
            <SearchIcon />
          </button>
          <Link className="icon-button cart-link" to="/cart" aria-label={`Cart, ${count} items`}>
            <CartIcon />
            <b>{count}</b>
          </Link>
          <button className="menu-button" type="button" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </header>
      <main id="content">{children}</main>
      <footer className="site-footer">
        <div className="wrap footer-grid">
          <div>
            <Link className="mark" to="/" aria-label="Aprotel Solar" style={{ color: 'white', marginBottom: 12 }}>
              <img src="/logo.png" alt="" width={68} height={68} />
            </Link>
            <p>{footer ? textBody(footer.body, 'blurb') || footer.summary : 'Solar equipment, installation, maintenance, and CCTV.'}</p>
          </div>
          <div>
            <h2>Quick links</h2>
            <ul className="link-columns">
              {navItems.map((item) => <li key={item.href}><Link to={item.href}>{item.label}</Link></li>)}
            </ul>
          </div>
          <div>
            <h2>Our locations</h2>
            <OfficeList branches={offices} />
          </div>
          <div>
            <h2>Contact us</h2>
            {central ? (
              <>
                <p><a href={`tel:${central.phone}`}>{central.phone}</a></p>
                {central.email ? <p><a href={`mailto:${central.email}`}>{central.email}</a></p> : null}
                <p><Link className="btn-gold" to="/contact">Contact Aprotel</Link></p>
              </>
            ) : <p>Office details appear when branches are published.</p>}
          </div>
        </div>
        <p className="wrap fine">© {new Date().getFullYear()} Aprotel Services Nig. Ltd. Catalogue prices are confirmed when you send a request.</p>
      </footer>
    </div>
  );
}

function linkItems(entry?: Entry) {
  const raw = entry?.body.items ?? entry?.body.links;
  if (!Array.isArray(raw)) return null;
  const items = raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const link = item as { label?: string; href?: string };
    if (!link.label || !link.href) return [];
    return [{ label: link.label, href: link.href }];
  });
  return items.length ? items : null;
}

function MenuIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
}
function CloseIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>;
}
function SearchIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>;
}
function CartIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6h15l-1.5 9h-12z" /><path d="M6 6L5 3H2" /><circle cx="9" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></svg>;
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  const details = error instanceof Error && 'details' in error ? (error as { details?: Array<{ path?: string; message: string }> }).details : undefined;
  return (
    <div className="alert" role="alert">
      <strong>{message}</strong>
      {details?.length ? <ul>{details.map((detail, index) => <li key={index}>{detail.path ? `${detail.path}: ` : ''}{detail.message}</li>)}</ul> : null}
    </div>
  );
}

export function OfficeList({ branches }: { branches: Branch[] }) {
  const [open, setOpen] = useState(false);
  const primary = yenagoaOffice(branches);
  const rest = branches.filter((branch) => branch !== primary);
  if (!primary) return null;
  return (
    <ul>
      <OfficeLine branch={primary} />
      {rest.length ? (
        <li>
          <button className="show-more" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? 'Show less' : 'Show more'}</button>
          {open ? <ul className="more-offices">{rest.map((branch) => <OfficeLine key={branch.id} branch={branch} />)}</ul> : null}
        </li>
      ) : null}
    </ul>
  );
}

function yenagoaOffice(branches: Branch[]) {
  const yenagoa = branches.filter((branch) => branch.city.toLowerCase() === 'yenagoa');
  return yenagoa.find((branch) => branch.isCentral) ?? yenagoa.find((branch) => /headquarter/i.test(branch.name)) ?? yenagoa[0] ?? branches[0];
}

export function OfficeLine({ branch }: { branch: Branch }) {
  const street = [branch.addressLine1, branch.addressLine2].filter(Boolean).join(', ');
  return (
    <li>
      <strong>{branch.name}</strong>
      <div>{[branch.city, branch.state].filter(Boolean).join(', ')}</div>
      {branch.phone ? <div><a href={`tel:${branch.phone}`}>{branch.phone}</a></div> : null}
      {branch.email ? <div><a href={`mailto:${branch.email}`}>{branch.email}</a></div> : null}
      {street ? (
        <>
          <div>{street}</div>
          <a href={mapsLink([branch.addressLine1, branch.city, branch.state, branch.country])}>Get directions</a>
        </>
      ) : null}
    </li>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return <p className="note" role="status">{label}…</p>;
}

export function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setShown(true);
        observer.disconnect();
      }
    }, { threshold: 0.16 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className={`reveal${shown ? ' is-in' : ''} ${className}`.trim()}>{children}</div>;
}
