import { cloneElement, createContext, isValidElement, useContext, useEffect, useId, useRef, useState, type FormEvent, type ReactElement, type ReactNode } from 'react';
import { useBlocker } from 'react-router-dom';
import { ApiError, type PageMeta } from '../lib/api';

type Toast = { id: number; message: string };
type ConfirmRequest = { title: string; body: string; confirmLabel?: string; danger?: boolean };

const ToastContext = createContext<(message: string) => void>(() => undefined);
const ConfirmContext = createContext<(request: ConfirmRequest) => Promise<boolean>>(async () => false);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  function push(message: string) {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4000);
  }
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div className="toast" key={toast.id} role="status">
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<(ConfirmRequest & { resolve: (value: boolean) => void }) | null>(null);
  function ask(next: ConfirmRequest) {
    return new Promise<boolean>((resolve) => setRequest({ ...next, resolve }));
  }
  function close(value: boolean) {
    request?.resolve(value);
    setRequest(null);
  }
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {request ? (
        <div className="backdrop" role="presentation">
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <h2 id="confirm-title">{request.title}</h2>
            <p>{request.body}</p>
            <div className="actions">
              <button className="btn secondary" type="button" onClick={() => close(false)}>
                Cancel
              </button>
              <button className={`btn ${request.danger ? 'danger' : ''}`} type="button" onClick={() => close(true)}>
                {request.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ErrorText({ error }: { error: unknown }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) ref.current?.scrollIntoView({ block: 'center' });
  }, [error]);
  if (!error) return null;
  const api = error instanceof ApiError ? error : new ApiError({ status: 0, code: 'UNKNOWN', message: error instanceof Error ? error.message : 'Something went wrong.' });
  return (
    <div className="alert" role="alert" ref={ref}>
      <strong>{api.message}</strong>
      {api.details?.length ? (
        <ul>
          {api.details.map((detail, index) => (
            <li key={`${detail.path ?? 'field'}-${index}`}>
              {detail.path ? `${detail.path}: ` : ''}
              {detail.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const id = useId();
  const control = isValidElement(children) ? cloneElement(children as ReactElement<{ id?: string }>, { id }) : children;
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      {control}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      <p className="muted">{body}</p>
    </div>
  );
}

export function Loading({ label = 'Loading records' }: { label?: string }) {
  return <p role="status">{label}…</p>;
}

export function Badge({ value }: { value: string }) {
  const warn = ['low', 'pending', 'failed', 'rejected', 'inactive', 'out_of_stock', 'new'].some((item) => value.includes(item));
  const neutral = ['draft', 'archived', 'closed', 'cancelled'].includes(value);
  return <span className={`badge ${warn ? 'warn' : ''} ${neutral ? 'neutral' : ''}`}>{value.replaceAll('_', ' ')}</span>;
}

export function Pager({ meta, onPage }: { meta?: PageMeta; onPage: (page: number) => void }) {
  if (!meta) return null;
  return (
    <div className="row" style={{ marginTop: 10 }}>
      <span className="muted">
        {meta.total} records · page {meta.page} of {Math.max(meta.pageCount, 1)}
      </span>
      <button className="btn secondary" type="button" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>
        Previous
      </button>
      <button className="btn secondary" type="button" disabled={meta.page >= meta.pageCount} onClick={() => onPage(meta.page + 1)}>
        Next
      </button>
    </div>
  );
}

export function useUnsaved(dirty: boolean) {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const blocker = useBlocker(() => dirtyRef.current);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  return blocker;
}

export function UnsavedDialog({ blocker }: { blocker: ReturnType<typeof useBlocker> }) {
  if (blocker.state !== 'blocked') return null;
  return (
    <div className="backdrop">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="unsaved-title">
        <h2 id="unsaved-title">Leave this form?</h2>
        <p>Changes have not been saved.</p>
        <div className="actions">
          <button className="btn secondary" type="button" onClick={() => blocker.reset()}>
            Stay
          </button>
          <button className="btn danger" type="button" onClick={() => blocker.proceed()}>
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}

export function FilterForm({ onSubmit, children }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void; children: ReactNode }) {
  return (
    <form className="filters" onSubmit={onSubmit}>
      {children}
      <button className="btn secondary" type="submit">
        Apply
      </button>
    </form>
  );
}
