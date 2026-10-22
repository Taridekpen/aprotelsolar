import { lazy, Suspense, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Loading, Shell } from './components/chrome';

const HomePage = lazy(() => import('./pages/home').then((module) => ({ default: module.HomePage })));
const AboutPage = lazy(() => import('./pages/about').then((module) => ({ default: module.AboutPage })));
const ProductsPage = lazy(() => import('./pages/catalog').then((module) => ({ default: module.ProductsPage })));
const ProductPage = lazy(() => import('./pages/catalog').then((module) => ({ default: module.ProductPage })));
const ComparePage = lazy(() => import('./pages/catalog').then((module) => ({ default: module.ComparePage })));
const PackagesPage = lazy(() => import('./pages/offerings').then((module) => ({ default: module.PackagesPage })));
const PackagePage = lazy(() => import('./pages/offerings').then((module) => ({ default: module.PackagePage })));
const ServicesPage = lazy(() => import('./pages/offerings').then((module) => ({ default: module.ServicesPage })));
const ServicePage = lazy(() => import('./pages/offerings').then((module) => ({ default: module.ServicePage })));
const ProjectsPage = lazy(() => import('./pages/offerings').then((module) => ({ default: module.ProjectsPage })));
const ContactPage = lazy(() => import('./pages/contact').then((module) => ({ default: module.ContactPage })));
const QuotePage = lazy(() => import('./pages/contact').then((module) => ({ default: module.QuotePage })));
const CartPage = lazy(() => import('./pages/commerce').then((module) => ({ default: module.CartPage })));
const CheckoutPage = lazy(() => import('./pages/commerce').then((module) => ({ default: module.CheckoutPage })));
const CalculatorPage = lazy(() => import('./pages/calculator').then((module) => ({ default: module.CalculatorPage })));

const client = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } });

function Page({ children }: { children: ReactNode }) {
  return (
    <Shell>
      <Suspense fallback={<div className="wrap page"><Loading /></div>}>{children}</Suspense>
    </Shell>
  );
}

const router = createBrowserRouter([
  { path: '/', element: <Page><HomePage /></Page> },
  { path: '/about', element: <Page><AboutPage /></Page> },
  { path: '/products', element: <Page><ProductsPage /></Page> },
  { path: '/products/:slug', element: <Page><ProductPage /></Page> },
  { path: '/compare', element: <Page><ComparePage /></Page> },
  { path: '/packages', element: <Page><PackagesPage /></Page> },
  { path: '/packages/:slug', element: <Page><PackagePage /></Page> },
  { path: '/services', element: <Page><ServicesPage /></Page> },
  { path: '/services/:slug', element: <Page><ServicePage /></Page> },
  { path: '/projects', element: <Page><ProjectsPage /></Page> },
  { path: '/contact', element: <Page><ContactPage /></Page> },
  { path: '/quote', element: <Page><QuotePage /></Page> },
  { path: '/cart', element: <Page><CartPage /></Page> },
  { path: '/checkout', element: <Page><CheckoutPage /></Page> },
  { path: '/calculate', element: <Page><CalculatorPage /></Page> },
  { path: '*', element: <Page><div className="wrap page"><h1>Page not found</h1></div></Page> },
]);

export function App() {
  return (
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
