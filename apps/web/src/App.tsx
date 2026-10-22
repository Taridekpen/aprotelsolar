import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { ConfirmProvider, ToastProvider } from './components/ui';
import { Shell, firstAllowedPath } from './components/shell';
import { SessionProvider, useSession } from './session';
import { ForgotPage, LoginPage, ResetPage } from './pages/auth';
import { OverviewPage } from './pages/overview';
import { ProductFormPage, ProductListPage } from './pages/products';
import { CategoriesPage } from './pages/categories';
import { ServiceFormPage, ServiceListPage } from './pages/services';
import { PackageFormPage, PackageListPage } from './pages/packages';
import { BranchesPage } from './pages/stock';
import { MediaPage } from './pages/media';
import { EnquiryPage } from './pages/enquiries';
import { ContentPage } from './pages/content';
import { AccountPage, AdministratorsPage, AnalyticsPage, SettingsPage } from './pages/admin';

function RequireAuth({ children }: { children: ReactNode }) {
  const { admin, loading } = useSession();
  if (loading) return <p className="page">Checking session…</p>;
  if (!admin) return <Navigate to="/login" replace />;
  return children;
}

function HomeRedirect() {
  const { admin } = useSession();
  if (!admin?.permissions.includes('reports:read')) return <Navigate to={firstAllowedPath(admin?.permissions ?? [])} replace />;
  return <OverviewPage />;
}

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/forgot-password', element: <ForgotPage /> },
  { path: '/reset-password', element: <ResetPage /> },
  {
    path: '/',
    element: <RequireAuth><Shell /></RequireAuth>,
    children: [
      { index: true, element: <HomeRedirect /> },
      { path: 'products', element: <ProductListPage /> },
      { path: 'products/new', element: <ProductFormPage /> },
      { path: 'products/:id', element: <ProductFormPage /> },
      { path: 'categories', element: <CategoriesPage /> },
      { path: 'services', element: <ServiceListPage /> },
      { path: 'services/new', element: <ServiceFormPage /> },
      { path: 'services/:id', element: <ServiceFormPage /> },
      { path: 'packages', element: <PackageListPage /> },
      { path: 'packages/new', element: <PackageFormPage /> },
      { path: 'packages/:id', element: <PackageFormPage /> },
      { path: 'branches', element: <BranchesPage /> },
      { path: 'media', element: <MediaPage /> },
      { path: 'enquiries', element: <EnquiryPage /> },
      { path: 'content', element: <ContentPage /> },
      { path: 'analytics', element: <AnalyticsPage /> },
      { path: 'administrators', element: <AdministratorsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'account', element: <AccountPage /> },
    ],
  },
]);

export function App() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }));
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ConfirmProvider>
          <SessionProvider>
            <RouterProvider router={router} />
          </SessionProvider>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
