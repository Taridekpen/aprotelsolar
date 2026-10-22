import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { APPLIANCE_CATALOGUE, type ApplianceDefinition } from '@aprotel/solar-engine';
import { api } from '../lib/api';
import { cart } from '../lib/cart';
import { naira, STATES } from '../lib/format';
import { ErrorNote, useSeo } from '../components/chrome';
import { Stepper } from './home';

type Appliance = {
  id: string;
  name: string;
  wattage: number;
  quantity: number;
  dayHours: number;
  nightHours: number;
  dutyCycle: number;
  surgeWatts: number | null;
  critical: boolean;
  estimate: boolean;
  scheduleLocked: boolean;
};

type Recommended = {
  role: string;
  id: string;
  slug: string;
  name: string;
  quantity: number;
  unitPriceNaira: number;
  lineTotalNaira: number;
  warranty: string;
  imageId: string | null;
  reason: string;
};

type Design = {
  mode: string;
  load: { connectedLoadW: number; dailyEnergyKwh: number; daytimeEnergyWh: number; nighttimeEnergyWh: number; criticalEnergyWh: number; peakSimultaneousW: number; surgeDemandW: number };
  battery: { nominalEnergyWh: number; deliveredEnergyWh: number; backupHours: number };
  inverter: { requiredContinuousW: number; requiredVa: number; powerFactor: number };
  pv: { requiredArrayW: number; sizingPeakSunHours: number; solarResource: string; worstMonthPeakSunHours: number };
  runtime: Array<{ id: string; title: string; estimatedHours: number | null; lowHours: number | null; highHours: number | null; detail: string }>;
  selected: { label: string; equipmentCostNaira: number; products: Recommended[] } | null;
  alternatives: Array<{ id: string; label: string; equipmentCostNaira: number; products: Recommended[] }>;
  unmet: { message: string } | null;
  assumptions: Array<{ id: string; text: string }>;
  warnings: Array<{ id: string; message: string }>;
  narrative: string[];
  cost: { provisional: boolean; note: string; equipmentNaira: number | null };
  engineeringApprovalRequired: boolean;
};

type EngineReply = { status: string; message: string; design: Design };

const GROUPS = [
  { id: 'all', label: 'All', categories: [] as string[] },
  { id: 'home', label: 'Home', categories: ['entertainment', 'comfort', 'lighting', 'network'] },
  { id: 'office', label: 'Office', categories: ['office'] },
  { id: 'kitchen', label: 'Kitchen', categories: ['kitchen', 'laundry'] },
  { id: 'cooling', label: 'Cooling', categories: ['cooling'] },
  { id: 'other', label: 'Other', categories: ['water'] },
];

export function CalculatorPage() {
  const [params] = useSearchParams();
  const initialHours = clamp(Number(params.get('hours')) || 8, 1, 24);
  const [items, setItems] = useState<Appliance[]>(() => itemsFromQuery(params, initialHours));
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const [hours, setHours] = useState(initialHours);
  const [backupHours, setBackupHours] = useState(8);
  const [mode, setMode] = useState<'runtime' | 'budget' | 'independence'>('runtime');
  const [state, setState] = useState('Bayelsa');
  const [budget, setBudget] = useState('');
  const [result, setResult] = useState<EngineReply | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [reference, setReference] = useState('');
  const [asking, setAsking] = useState(false);
  useSeo('Solar system calculator', 'Tap the appliances you use. The result updates from those watts, hours, and the backup duration.');

  const ready = items.length > 0 && items.every((item) => item.wattage > 0 && item.quantity >= 1 && item.dayHours + item.nightHours > 0 && item.dutyCycle > 0 && item.dutyCycle <= 1) && backupHours >= 0.5 && backupHours <= 72;
  const payload = useMemo(() => ({
    appliances: items.map((item) => ({
      name: item.name,
      wattage: item.wattage,
      quantity: item.quantity,
      hoursPerDay: Number((item.dayHours + item.nightHours).toFixed(2)),
      dayHours: item.dayHours,
      nightHours: item.nightHours,
      dutyCycle: item.dutyCycle,
      critical: item.critical,
      ...(item.surgeWatts && item.surgeWatts >= item.wattage ? { surgeWatts: item.surgeWatts } : {}),
    })),
    location: { state },
    ...(mode === 'independence' ? { autonomyDays: Math.min(7, Math.max(0.5, backupHours / 24)) } : {}),
    preferences: {
      mode,
      backupHours,
      gridTied: mode !== 'independence',
      ...(mode === 'budget' && Number(budget) > 0 ? { budgetNaira: Number(budget) } : {}),
    },
  }), [items, state, backupHours, mode, budget]);

  useEffect(() => {
    if (!ready) {
      setResult(null);
      setPending(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setPending(true);
      api<EngineReply>('/api/v1/solar/recommend', { method: 'POST', json: payload, signal: controller.signal })
        .then((reply) => { setResult(reply); setError(null); })
        .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason); })
        .finally(() => { if (!controller.signal.aborted) setPending(false); });
    }, 400);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [ready, payload]);

  const quote = useMutation({
    mutationFn: (form: FormData) => api<{ reference: string; total: string; engineeringApproval: string }>('/api/v1/quotations', {
      method: 'POST',
      json: {
        customer: { name: String(form.get('name')), email: String(form.get('email')), phone: String(form.get('phone')), location: state },
        state,
        includeInstallation: false,
        applianceSnapshot: { appliances: payload.appliances, notes: String(form.get('notes') || 'Calculator quotation.'), design: result?.design },
        items: (result?.design.selected?.products ?? []).map((product) => ({ productId: product.id, quantity: product.quantity })),
      },
    }),
    onSuccess: (created) => setReference(`${created.reference}. Server total ${naira(created.total)}. Engineering ${created.engineeringApproval}.`),
  });

  const visible = APPLIANCE_CATALOGUE.filter((item) => {
    const matchesGroup = group === 'all' || GROUPS.find((entry) => entry.id === group)?.categories.includes(item.category);
    return matchesGroup && item.name.toLowerCase().includes(query.toLowerCase());
  });
  const design = result?.design;
  const connected = items.reduce((sum, item) => sum + item.wattage * item.quantity, 0);

  function changeHours(next: number) {
    const value = clamp(next, 1, 24);
    const split = splitHours(value, mode);
    setHours(value);
    setItems((current) => current.map((item) => (item.scheduleLocked ? item : { ...item, ...split })));
  }

  return (
    <div className="wrap page">
      <p className="eyebrow">Calculator</p>
      <h1>Solar system calculator</h1>
      <p className="lede">Tap an appliance to add it. Use + and − for quantity. The result updates on its own. Wattage defaults are estimates — the nameplate is more accurate.</p>
      <div className="calc-page">
        <section className="calc-board">
          <label className="search-line">Search appliances
            <input value={query} placeholder="Search appliances…" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="chip-row" role="toolbar" aria-label="Appliance groups">
            {GROUPS.map((entry) => (
              <button className="chip" type="button" key={entry.id} aria-pressed={group === entry.id} onClick={() => setGroup(entry.id)}>{entry.label}</button>
            ))}
          </div>
          <div className="pick-grid">
            {visible.map((item) => {
              const selected = items.find((row) => row.name === item.name);
              return (
                <button className="pick-card" type="button" key={item.name} aria-pressed={Boolean(selected)} onClick={() => addOrIncrease(setItems, item, hours, mode)}>
                  <ApplianceMark category={item.category} />
                  <strong>{item.name}</strong>
                  <small>{item.wattage} W{selected ? ` · ${selected.quantity} selected` : ''}</small>
                </button>
              );
            })}
          </div>
          <form className="form-grid" style={{ marginTop: 16 }} onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const name = String(data.get('customName') || '').trim();
            const wattage = Number(data.get('customWatts'));
            if (!name || !(wattage > 0)) return;
            addOrIncrease(setItems, { name, wattage, category: 'other', wattageRange: [wattage, wattage], surgeWatts: null, dutyCycle: null, usage: '' }, hours, mode);
            event.currentTarget.reset();
          }}>
            <label className="field">Other appliance<input name="customName" required /></label>
            <label className="field">Wattage<input name="customWatts" inputMode="decimal" required min={1} /></label>
            <button className="btn-line" type="submit">Add it</button>
          </form>
        </section>
        <aside className="result-card" id="result">
          <div className="section-head">
            <h2 style={{ fontSize: 22 }}>Your load</h2>
            {items.length ? <button className="btn-line" type="button" onClick={() => setItems([])}>Clear</button> : null}
          </div>
          {items.length ? (
            <div className="selected-list">
              {items.map((item) => (
                <div className="selected-row" key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <small>{item.wattage} W · {item.dayHours + item.nightHours} h{item.estimate ? ' · estimate' : ''}</small>
                  </div>
                  <Stepper label={`${item.name} quantity`} value={item.quantity} min={0} max={50} onChange={(quantity) => {
                    if (quantity < 1) setItems((current) => current.filter((row) => row.id !== item.id));
                    else setItems((current) => current.map((row) => (row.id === item.id ? { ...row, quantity } : row)));
                  }} />
                </div>
              ))}
            </div>
          ) : <p>Nothing selected yet. Tap an appliance on the left.</p>}
          <div className="prefs">
            <label className="field">Hours each day
              <Stepper label="hours each day" value={hours} min={1} max={24} onChange={changeHours} />
              <span className="note">Counted in the evening, so the backup covers them.</span>
            </label>
            <label className="field">Backup hours
              <Stepper label="backup hours" value={backupHours} min={1} max={72} onChange={setBackupHours} />
            </label>
            <label className="field">Where it will be installed
              <select value={state} onChange={(event) => setState(event.target.value)}>{STATES.map((name) => <option key={name}>{name}</option>)}</select>
            </label>
            <div className="chip-row" role="toolbar" aria-label="Planning mode">
              {([['runtime', 'Backup'], ['budget', 'Budget'], ['independence', 'Off-grid']] as const).map(([value, label]) => (
                <button className="chip" type="button" key={value} aria-pressed={mode === value} onClick={() => {
                  setMode(value);
                  const split = splitHours(hours, value);
                  setItems((current) => current.map((item) => (item.scheduleLocked ? item : { ...item, ...split })));
                }}>{label}</button>
              ))}
            </div>
            {mode === 'budget' ? <label className="field wide">Budget in naira<input value={budget} inputMode="decimal" onChange={(event) => setBudget(event.target.value)} /></label> : null}
          </div>
          <p><strong>{connected.toLocaleString()} W</strong> connected{pending ? ' · updating…' : ''}</p>
          <ErrorNote error={error} />
          {design ? <ResultView design={design} message={result?.message ?? ''} asking={asking} setAsking={setAsking} quote={quote} reference={reference} /> : null}
        </aside>
      </div>
      {items.length ? (
        <details style={{ marginTop: 18 }}>
          <summary>Fine-tune wattage and schedule</summary>
          <p className="note">Daytime hours run from 07:00 and nighttime hours from 18:00. Leave these alone unless a device runs on a different pattern.</p>
          {items.map((item) => (
            <div className="form-grid" key={item.id} style={{ marginTop: 12 }}>
              <strong className="wide">{item.name}</strong>
              <label className="field">Watts<input aria-label={`${item.name} wattage`} type="number" min={1} value={item.wattage} onChange={(event) => patch(setItems, item.id, { wattage: Number(event.target.value), estimate: false })} /></label>
              <label className="field">Day hours<input aria-label={`${item.name} daytime hours`} type="number" min={0} max={11} step="0.5" value={item.dayHours} onChange={(event) => patch(setItems, item.id, { dayHours: Number(event.target.value), scheduleLocked: true })} /></label>
              <label className="field">Night hours<input aria-label={`${item.name} nighttime hours`} type="number" min={0} max={13} step="0.5" value={item.nightHours} onChange={(event) => patch(setItems, item.id, { nightHours: Number(event.target.value), scheduleLocked: true })} /></label>
              <label className="field">Duty cycle<input aria-label={`${item.name} duty cycle`} type="number" min={0.05} max={1} step="0.05" value={item.dutyCycle} onChange={(event) => patch(setItems, item.id, { dutyCycle: Number(event.target.value) })} /></label>
              <label className="field">Startup watts<input aria-label={`${item.name} startup watts`} type="number" min={item.wattage} value={item.surgeWatts ?? ''} onChange={(event) => patch(setItems, item.id, { surgeWatts: event.target.value === '' ? null : Number(event.target.value) })} /></label>
              <label className="field">Critical load<input aria-label={`${item.name} is critical`} type="checkbox" checked={item.critical} onChange={(event) => patch(setItems, item.id, { critical: event.target.checked })} /></label>
            </div>
          ))}
        </details>
      ) : null}
      <p><Link to="/products">Browse the catalogue</Link> if you want to choose equipment yourself.</p>
      <div className="calc-dock">
        <span>{design ? `${design.load.dailyEnergyKwh.toFixed(2)} kWh/day` : `${connected.toLocaleString()} W selected`}</span>
        <a href="#result">See the result</a>
      </div>
    </div>
  );
}

function ResultView({ design, message, asking, setAsking, quote, reference }: {
  design: Design;
  message: string;
  asking: boolean;
  setAsking: (value: boolean) => void;
  quote: { isPending: boolean; error: unknown; mutate: (form: FormData) => void };
  reference: string;
}) {
  return (
    <div aria-live="polite">
      <p className="note">{message}</p>
      <div className="stat-pills">
        <div><span>Daily energy</span><b>{design.load.dailyEnergyKwh.toFixed(2)} kWh</b></div>
        <div><span>Coincident load</span><b>{Math.round(design.load.peakSimultaneousW).toLocaleString()} W</b></div>
        <div><span>Battery</span><b>{(design.battery.nominalEnergyWh / 1000).toFixed(2)} kWh</b></div>
        <div><span>Inverter</span><b>{Math.round(design.inverter.requiredContinuousW).toLocaleString()} W</b></div>
        <div><span>Solar array</span><b>{Math.round(design.pv.requiredArrayW).toLocaleString()} W</b></div>
        <div><span>Sun hours</span><b>{design.pv.sizingPeakSunHours}</b></div>
      </div>
      {design.narrative[0] ? <p>{design.narrative[0]}</p> : null}
      {design.selected ? (
        <>
          <h3>{design.selected.label}</h3>
          <ul>
            {design.selected.products.map((product) => (
              <li key={product.id}>
                <strong>{product.quantity} × {product.name}</strong> — {naira(product.lineTotalNaira)}
                <div className="note">{product.reason}</div>
                <button className="btn-line" type="button" onClick={() => cart.add({ kind: 'product', id: product.id, slug: product.slug, name: product.name, unitPrice: product.unitPriceNaira.toFixed(2), quantity: product.quantity, imageId: product.imageId ?? undefined })}>Add to cart</button>
              </li>
            ))}
          </ul>
          <p>Equipment total {naira(design.selected.equipmentCostNaira)}. {design.cost.note}</p>
          <button className="btn" type="button" onClick={() => setAsking(true)}>Request a quotation</button>
          {asking ? (
            <form className="form-grid" style={{ marginTop: 12 }} onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); quote.mutate(new FormData(event.currentTarget)); }}>
              <ErrorNote error={quote.error} />
              {reference ? <p className="ok" role="status">{reference}</p> : null}
              <label className="field">Name<input name="name" required /></label>
              <label className="field">Phone<input name="phone" required /></label>
              <label className="field wide">Email<input name="email" type="email" required /></label>
              <button className="btn" type="submit" disabled={quote.isPending}>Submit</button>
            </form>
          ) : null}
        </>
      ) : <p className="note">{design.unmet?.message}</p>}
      <details>
        <summary>Assumptions and warnings</summary>
        {design.assumptions.map((item) => <p key={item.id}>{item.text}</p>)}
        {design.warnings.map((item) => <p key={item.id}>{item.message}</p>)}
        {design.runtime.map((scenario) => <p key={scenario.id}><strong>{scenario.title}.</strong> {scenario.lowHours == null ? 'Not estimated' : `${scenario.lowHours.toFixed(1)}–${scenario.highHours?.toFixed(1)} h`}. {scenario.detail}</p>)}
      </details>
    </div>
  );
}

function addOrIncrease(setItems: (value: Appliance[] | ((current: Appliance[]) => Appliance[])) => void, preset: ApplianceDefinition, hours: number, mode: 'runtime' | 'budget' | 'independence') {
  setItems((current) => {
    const existing = current.find((item) => item.name === preset.name);
    if (existing) return current.map((item) => (item.id === existing.id ? { ...item, quantity: item.quantity + 1 } : item));
    return [...current, {
      id: crypto.randomUUID(),
      name: preset.name,
      wattage: preset.wattage,
      quantity: 1,
      ...splitHours(hours, mode),
      dutyCycle: preset.dutyCycle ?? 1,
      surgeWatts: preset.surgeWatts,
      critical: false,
      estimate: true,
      scheduleLocked: false,
    }];
  });
}

function itemsFromQuery(params: URLSearchParams, hours: number) {
  return APPLIANCE_CATALOGUE.flatMap((preset) => {
    const quantity = Number(params.get(preset.name));
    if (!Number.isInteger(quantity) || quantity < 1) return [];
    return [{
      id: crypto.randomUUID(),
      name: preset.name,
      wattage: preset.wattage,
      quantity,
      ...splitHours(hours, 'runtime'),
      dutyCycle: preset.dutyCycle ?? 1,
      surgeWatts: preset.surgeWatts,
      critical: false,
      estimate: true,
      scheduleLocked: false,
    }];
  });
}

function patch(setItems: (value: Appliance[] | ((current: Appliance[]) => Appliance[])) => void, id: string, change: Partial<Appliance>) {
  setItems((current) => current.map((item) => (item.id === id ? { ...item, ...change } : item)));
}

function splitHours(hours: number, mode: 'runtime' | 'budget' | 'independence') {
  const total = clamp(Math.round(hours * 2) / 2, 0.5, 24);
  if (mode === 'independence') {
    const dayHours = Math.min(11, total);
    const nightHours = Math.min(13, Number((total - dayHours).toFixed(2)));
    return { dayHours, nightHours };
  }
  const nightHours = Math.min(13, total);
  const dayHours = Math.min(11, Number((total - nightHours).toFixed(2)));
  return { dayHours, nightHours };
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function ApplianceMark({ category }: { category: string }) {
  const label = category.slice(0, 1).toUpperCase();
  return <span className="pill" aria-hidden="true">{label}</span>;
}
