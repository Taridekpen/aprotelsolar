import { useState } from 'react';
import { ROLE_PERMISSIONS, ROLES, type Role } from '@aprotel/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiList, queryString } from '../lib/api';
import { when } from '../lib/format';
import { useCan, useSession } from '../session';
import { OverviewPage } from './overview';
import { Badge, Empty, ErrorText, Field, Loading, Pager, useToast } from '../components/ui';

type Settings = {
  company: { legalName: string; displayName: string; email: string; phone: string; website: string };
  delivery: { defaultFee: string; feesByState: Array<{ state: string; fee: string }> };
  installation: { baseFee: string; perPanel: string; perKwp: string };
  tax: { enabled: boolean; name: string; ratePercent: number; inclusive: boolean };
  payment: { enabled: boolean };
  quotation: { validityDays: number };
  calculator: { safetyMarginPercent: number; defaultPeakSunHours: number; systemLossPercent: number; defaultDodPercent: number; notes: string };
  engineering: { defaultSystemVoltage: number; assumptionsNote: string };
  inventory: { reservationTtlMinutes: number; defaultLowStockThreshold: number; allowBackorder: boolean };
  contact: { whatsapp?: string; phones: string[]; emails: string[] };
};
type Staff = { id: string; fullName: string; email: string; role: Role; status: string; permissionsRestricted: boolean; permissionOverrides: string[]; effectivePermissions: string[] };
type Audit = { id: string; action: string; resourceType: string; actorId: string | null; createdAt: string };

export function SettingsPage() {
  const can = useCan();
  const toast = useToast();
  const client = useQueryClient();
  const [error, setError] = useState<unknown>(null);
  const query = useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/api/v1/admin/settings') });
  const sensitive = can('settings:update_sensitive');
  const settings = query.data;
  if (query.isLoading) return <Loading />;
  if (query.error || !settings) return <ErrorText error={query.error} />;
  return (
    <form className="panel" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const patch: Record<string, unknown> = {
        company: { legalName: form.get('legalName'), displayName: form.get('displayName'), email: form.get('email'), phone: form.get('phone'), website: form.get('website') },
        delivery: {
          defaultFee: form.get('defaultFee'),
          feesByState: settings.delivery.feesByState.map((fee) => ({ state: fee.state, fee: fee.fee })),
        },
        installation: { baseFee: form.get('baseFee'), perPanel: form.get('perPanel'), perKwp: form.get('perKwp') },
        contact: { whatsapp: form.get('whatsapp') || undefined, phones: String(form.get('phones') ?? '').split(',').map((item) => item.trim()).filter(Boolean), emails: String(form.get('emails') ?? '').split(',').map((item) => item.trim()).filter(Boolean) },
      };
      if (sensitive) {
        patch.tax = { enabled: form.get('taxEnabled') === 'on', name: form.get('taxName'), ratePercent: Number(form.get('ratePercent')), inclusive: form.get('taxInclusive') === 'on' };
        patch.quotation = { validityDays: Number(form.get('validityDays')) };
        patch.calculator = { safetyMarginPercent: Number(form.get('safetyMarginPercent')), defaultPeakSunHours: Number(form.get('defaultPeakSunHours')), systemLossPercent: Number(form.get('systemLossPercent')), defaultDodPercent: Number(form.get('defaultDodPercent')), notes: form.get('notes') };
        patch.engineering = { defaultSystemVoltage: Number(form.get('defaultSystemVoltage')), assumptionsNote: form.get('assumptionsNote') };
      }
      setError(null);
      void api('/api/v1/admin/settings', { method: 'PATCH', json: patch })
        .then(async () => { toast('Settings saved.'); await client.invalidateQueries({ queryKey: ['settings'] }); })
        .catch(setError);
    }}>
      <ErrorText error={error} />
      <h2>Company</h2>
      <div className="form-grid">
        <Field label="Legal name"><input name="legalName" defaultValue={settings.company.legalName} disabled={!can('settings:update')} /></Field>
        <Field label="Display name"><input name="displayName" defaultValue={settings.company.displayName} /></Field>
        <Field label="Email"><input name="email" defaultValue={settings.company.email} /></Field>
        <Field label="Phone"><input name="phone" defaultValue={settings.company.phone} /></Field>
        <Field label="Website"><input name="website" defaultValue={settings.company.website} /></Field>
        <Field label="WhatsApp"><input name="whatsapp" defaultValue={settings.contact.whatsapp ?? ''} /></Field>
        <Field label="Phones" hint="Comma-separated"><input name="phones" defaultValue={settings.contact.phones.join(', ')} /></Field>
        <Field label="Emails" hint="Comma-separated"><input name="emails" defaultValue={settings.contact.emails.join(', ')} /></Field>
        <Field label="Default delivery fee"><input name="defaultFee" defaultValue={settings.delivery.defaultFee} /></Field>
        <Field label="Installation base fee"><input name="baseFee" defaultValue={settings.installation.baseFee} /></Field>
        <Field label="Fee per panel"><input name="perPanel" defaultValue={settings.installation.perPanel} /></Field>
        <Field label="Fee per kWp"><input name="perKwp" defaultValue={settings.installation.perKwp} /></Field>
      </div>
      <h2>Sensitive configuration</h2>
      {sensitive ? null : <p className="muted">Tax, quotation validity, and calculator assumptions can be changed by a super administrator.</p>}
      <div className="form-grid">
        <label className="check"><input name="taxEnabled" type="checkbox" defaultChecked={settings.tax.enabled} disabled={!sensitive} /> Tax enabled</label>
        <Field label="Tax name"><input name="taxName" defaultValue={settings.tax.name} disabled={!sensitive} /></Field>
        <Field label="Tax rate percent"><input name="ratePercent" defaultValue={settings.tax.ratePercent} disabled={!sensitive} /></Field>
        <label className="check"><input name="taxInclusive" type="checkbox" defaultChecked={settings.tax.inclusive} disabled={!sensitive} /> Prices include tax</label>
        <Field label="Quotation validity (days)"><input name="validityDays" defaultValue={settings.quotation.validityDays} disabled={!sensitive} /></Field>
        <Field label="Safety margin %"><input name="safetyMarginPercent" defaultValue={settings.calculator.safetyMarginPercent} disabled={!sensitive} /></Field>
        <Field label="Peak sun hours"><input name="defaultPeakSunHours" defaultValue={settings.calculator.defaultPeakSunHours} disabled={!sensitive} /></Field>
        <Field label="System loss %"><input name="systemLossPercent" defaultValue={settings.calculator.systemLossPercent} disabled={!sensitive} /></Field>
        <Field label="Depth of discharge %"><input name="defaultDodPercent" defaultValue={settings.calculator.defaultDodPercent} disabled={!sensitive} /></Field>
        <Field label="Default system voltage"><input name="defaultSystemVoltage" defaultValue={settings.engineering.defaultSystemVoltage} disabled={!sensitive} /></Field>
        <div className="wide"><Field label="Calculator notes"><textarea name="notes" defaultValue={settings.calculator.notes} disabled={!sensitive} /></Field></div>
        <div className="wide"><Field label="Engineering assumptions"><textarea name="assumptionsNote" defaultValue={settings.engineering.assumptionsNote} disabled={!sensitive} /></Field></div>
      </div>
      <p className="muted">Provider secrets stay in the server environment. They are not stored from this form.</p>
      {can('settings:update') ? <button className="btn" type="submit">Save settings</button> : null}
    </form>
  );
}

export function AdministratorsPage() {
  const can = useCan();
  const toast = useToast();
  const client = useQueryClient();
  const [error, setError] = useState<unknown>(null);
  const [role, setRole] = useState<Role>('editor');
  const [restricted, setRestricted] = useState(false);
  const [overrides, setOverrides] = useState<string[]>([...ROLE_PERMISSIONS.editor]);
  const query = useQuery({ queryKey: ['administrators'], queryFn: () => apiList<Staff>('/api/v1/admin/administrators?pageSize=100') });
  return (
    <div className="split" style={{ alignItems: 'start' }}>
      <div style={{ flex: 1.4 }}>
        {query.isLoading ? <Loading /> : null}
        <ErrorText error={query.error} />
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th>{can('administrators:manage') ? <th></th> : null}</tr></thead>
            <tbody>
              {query.data?.items.map((person) => (
                <tr key={person.id}>
                  <td>{person.fullName}</td>
                  <td>{person.email}</td>
                  <td>{person.role.replaceAll('_', ' ')}{person.permissionsRestricted ? ' · narrowed' : ''}</td>
                  <td><Badge value={person.status} /></td>
                  {can('administrators:manage') ? <td>
                    <button className="btn secondary" type="button" onClick={() => void api(`/api/v1/admin/administrators/${person.id}`, { method: 'PATCH', json: { status: person.status === 'active' ? 'suspended' : 'active' } }).then(() => client.invalidateQueries({ queryKey: ['administrators'] }))}>{person.status === 'active' ? 'Suspend' : 'Activate'}</button>
                  </td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {can('administrators:manage') ? (
        <form className="panel" onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setError(null);
          void api('/api/v1/admin/administrators', { method: 'POST', json: { fullName: form.get('fullName'), email: form.get('email'), password: form.get('password'), role, permissionOverrides: restricted ? overrides : null } })
            .then(async () => { toast('Administrator created.'); event.currentTarget.reset(); await client.invalidateQueries({ queryKey: ['administrators'] }); })
            .catch(setError);
        }}>
          <h2>New administrator</h2>
          <ErrorText error={error} />
          <Field label="Full name"><input name="fullName" required /></Field>
          <Field label="Email"><input name="email" type="email" required /></Field>
          <Field label="Password" hint="12 or more characters with upper, lower, number, and symbol."><input name="password" type="password" required minLength={12} /></Field>
          <Field label="Role">
            <select value={role} onChange={(event) => { const next = event.target.value as Role; setRole(next); setOverrides([...ROLE_PERMISSIONS[next]]); }}>
              {ROLES.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}
            </select>
          </Field>
          <label className="check"><input type="checkbox" checked={restricted} onChange={(event) => setRestricted(event.target.checked)} /> Narrow this role</label>
          {restricted ? ROLE_PERMISSIONS[role].map((permission) => (
            <label className="check" key={permission}>
              <input type="checkbox" checked={overrides.includes(permission)} onChange={(event) => setOverrides((current) => event.target.checked ? [...current, permission] : current.filter((item) => item !== permission))} />
              {permission}
            </label>
          )) : null}
          <button className="btn" type="submit">Create administrator</button>
          <p className="muted">Customers do not have accounts. This list is staff only.</p>
        </form>
      ) : null}
    </div>
  );
}

export function AccountPage() {
  const { admin } = useSession();
  const toast = useToast();
  const [error, setError] = useState<unknown>(null);
  return (
    <form className="panel" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      setError(null);
      void api('/api/v1/auth/password', { method: 'PATCH', json: { currentPassword: form.get('currentPassword'), newPassword: form.get('newPassword') } })
        .then(() => { toast('Password updated.'); event.currentTarget.reset(); })
        .catch(setError);
    }}>
      <h2>Profile</h2>
      <p>{admin?.fullName}<br />{admin?.email}<br />{admin?.role.replaceAll('_', ' ')}</p>
      <ErrorText error={error} />
      <Field label="Current password"><input name="currentPassword" type="password" required /></Field>
      <Field label="New password"><input name="newPassword" type="password" required minLength={12} /></Field>
      <button className="btn" type="submit">Update password</button>
    </form>
  );
}

export function AnalyticsPage() {
  const can = useCan();
  const [page, setPage] = useState(1);
  const audit = useQuery({
    queryKey: ['audit', page],
    enabled: can('audit:read'),
    queryFn: () => apiList<Audit>(`/api/v1/admin/audit-logs${queryString({ page, pageSize: 20 })}`),
  });
  return (
    <div>
      {can('reports:read') ? <OverviewPage /> : null}
      {can('audit:read') ? (
        <section className="section">
          <h2>Audit log</h2>
          {audit.isLoading ? <Loading /> : null}
          <ErrorText error={audit.error} />
          {audit.data?.items.length === 0 ? <Empty title="No audit entries" body="Administrative changes are recorded as they happen." /> : null}
          {audit.data && audit.data.items.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>When</th><th>Action</th><th>Resource</th><th>Actor</th></tr></thead>
                <tbody>
                  {audit.data.items.map((item) => <tr key={item.id}><td>{when(item.createdAt)}</td><td>{item.action}</td><td>{item.resourceType}</td><td>{item.actorId ?? '—'}</td></tr>)}
                </tbody>
              </table>
            </div>
          ) : null}
          <Pager meta={audit.data?.meta} onPage={setPage} />
        </section>
      ) : null}
    </div>
  );
}
