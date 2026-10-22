import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useSession } from '../session';
import { firstAllowedPath } from '../components/shell';
import { ErrorText, Field } from '../components/ui';

export function LoginPage() {
  const { admin, loading, login } = useSession();
  const navigate = useNavigate();
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  if (!loading && admin) return <Navigate to={firstAllowedPath(admin.permissions)} replace />;
  return (
    <main className="page" style={{ maxWidth: 420, margin: '8vh auto' }}>
      <img src="/logo.png" alt="Aprotel" width={160} />
      <h1>Administration</h1>
      <p className="muted">Staff sign-in for Aprotel Services Nig. Ltd. Customers do not register here.</p>
      <form onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setPending(true);
        setError(null);
        void login(String(form.get('email')), String(form.get('password')))
          .then(() => navigate('/'))
          .catch(setError)
          .finally(() => setPending(false));
      }}>
        <ErrorText error={error} />
        <Field label="Email"><input name="email" type="email" autoComplete="username" required /></Field>
        <Field label="Password"><input name="password" type="password" autoComplete="current-password" required /></Field>
        <button className="btn" type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p><Link to="/forgot-password">Forgot password</Link></p>
    </main>
  );
}

export function ForgotPage() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState<unknown>(null);
  return (
    <main className="page" style={{ maxWidth: 420, margin: '8vh auto' }}>
      <h1>Reset password</h1>
      <form onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        void api<{ message: string }>('/api/v1/auth/forgot-password', { method: 'POST', json: { email: new FormData(event.currentTarget).get('email') } })
          .then((result) => setMessage(result.message))
          .catch(setError);
      }}>
        <ErrorText error={error} />
        {message ? <p role="status">{message}</p> : null}
        <Field label="Email"><input name="email" type="email" required /></Field>
        <button className="btn" type="submit">Send reset link</button>
      </form>
      <p><Link to="/login">Back to sign in</Link></p>
    </main>
  );
}

export function ResetPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<unknown>(null);
  return (
    <main className="page" style={{ maxWidth: 420, margin: '8vh auto' }}>
      <h1>Choose a new password</h1>
      <form onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        void api('/api/v1/auth/reset-password', { method: 'POST', json: { token: params.get('token'), password: new FormData(event.currentTarget).get('password') } })
          .then(() => navigate('/login'))
          .catch(setError);
      }}>
        <ErrorText error={error} />
        <Field label="New password"><input name="password" type="password" required minLength={12} /></Field>
        <button className="btn" type="submit">Update password</button>
      </form>
    </main>
  );
}
