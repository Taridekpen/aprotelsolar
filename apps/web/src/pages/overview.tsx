import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ErrorText, Loading } from '../components/ui';

type Dashboard = {
  products: { published: number; draft: number; inactive: number };
  enquiries: { new: number };
};

export function OverviewPage() {
  const report = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => api<Dashboard>('/api/v1/admin/dashboard'),
  });

  if (report.isLoading) return <Loading label="Loading overview" />;
  if (report.error) return <ErrorText error={report.error} />;
  const data = report.data;
  if (!data) return null;

  return (
    <div>
      <div className="grid">
        <article className="stat"><span>Published products</span><b>{data.products.published}</b></article>
        <article className="stat"><span>Draft products</span><b>{data.products.draft}</b></article>
        <article className="stat"><span>New requests</span><b>{data.enquiries.new}</b></article>
      </div>
      <p><Link to="/enquiries">Open requests</Link></p>
    </div>
  );
}
