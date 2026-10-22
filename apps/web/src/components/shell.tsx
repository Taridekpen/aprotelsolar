import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useCan, useSession } from '../session';

const NAV = [
  { to: '/', label: 'Overview', permission: 'reports:read', end: true },
  { to: '/products', label: 'Products', permission: 'products:read' },
  { to: '/categories', label: 'Categories', permission: 'categories:read' },
  { to: '/services', label: 'Services', permission: 'services:read' },
  { to: '/packages', label: 'Solar Packages', permission: 'packages:read' },
  { to: '/branches', label: 'Branches', permission: 'branches:read' },
  { to: '/media', label: 'Media Library', permission: 'media:read' },
  { to: '/enquiries', label: 'Requests', permission: 'enquiries:read' },
  { to: '/content', label: 'Website Content', permission: 'content:read' },
  { to: '/analytics', label: 'Analytics', permission: 'reports:read' },
  { to: '/administrators', label: 'Administrators', permission: 'administrators:read' },
  { to: '/settings', label: 'Settings', permission: 'settings:read' },
] as const;

const TITLES: Record<string, string> = {
  '/': 'Overview',
  '/products': 'Products',
  '/categories': 'Categories',
  '/services': 'Services',
  '/packages': 'Solar packages',
  '/branches': 'Branches',
  '/media': 'Media library',
  '/enquiries': 'Requests',
  '/content': 'Website content',
  '/analytics': 'Analytics',
  '/administrators': 'Administrators',
  '/settings': 'Settings',
  '/account': 'Account',
};

type DashboardNote = {
  enquiries: { new: number };
};

export function Shell() {
  const { admin, logout } = useSession();
  const can = useCan();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const root = `/${location.pathname.split('/')[1] ?? ''}`;
  const title = TITLES[location.pathname] ?? TITLES[root] ?? 'Administration';
  const notes = useQuery({
    queryKey: ['notifications'],
    enabled: can('reports:read'),
    queryFn: () => api<DashboardNote>('/api/v1/admin/dashboard'),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    setOpen(false);
    setAccountOpen(false);
    setNotesOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setAccountOpen(false);
        setNotesOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const items = NAV.filter((item) => can(item.permission));
  const noteCount = notes.data ? notes.data.enquiries.new : 0;

  return (
    <div className="shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      {open ? <button className="backdrop" aria-label="Close navigation" onClick={() => setOpen(false)} /> : null}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <img src="/logo.png" alt="Aprotel" />
          <div>
            <strong>Aprotel Solar</strong>
            <span>Administration</span>
          </div>
        </div>
        <nav className="nav" aria-label="Primary">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={'end' in item ? item.end : false}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button className="icon-btn mobile-only" type="button" aria-label="Open navigation" onClick={() => setOpen(true)}>
            Menu
          </button>
          <h1>{title}</h1>
          <div className="spacer" />
          {can('reports:read') ? (
            <div className="menu-wrap">
              <button className="btn secondary" type="button" aria-expanded={notesOpen} onClick={() => setNotesOpen((value) => !value)}>
                Notifications{noteCount ? ` (${noteCount})` : ''}
              </button>
              {notesOpen && notes.data ? (
                <div className="menu" role="menu">
                  <Link to="/enquiries?status=new">{notes.data.enquiries.new} new requests</Link>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="identity">
            <strong>{admin?.fullName}</strong>
            <span>{admin?.role.replaceAll('_', ' ')}</span>
          </div>
          <div className="menu-wrap">
            <button className="btn secondary" type="button" aria-expanded={accountOpen} aria-haspopup="menu" onClick={() => setAccountOpen((value) => !value)}>
              Account
            </button>
            {accountOpen ? (
              <div className="menu" role="menu">
                <Link to="/account">Profile and password</Link>
                <button
                  type="button"
                  onClick={() => {
                    void logout().then(() => navigate('/login'));
                  }}
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </header>
        <main id="main" className="page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function firstAllowedPath(permissions: string[]) {
  const match = NAV.find((item) => permissions.includes(item.permission));
  return match?.to ?? '/account';
}
