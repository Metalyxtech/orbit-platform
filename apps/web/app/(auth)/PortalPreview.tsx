'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@orbit/ui';
import { PORTAL_CATALOG, type PortalInfo } from '@/portal-catalog';
import { PORTAL_PREVIEWS, type PortalPreview as Preview, type WorkflowStep } from '@/portal-previews';

type Tab = 'workflow' | 'dashboard';

const KIND_LABEL: Record<NonNullable<WorkflowStep['kind']>, string> = { approve: 'Approval', auto: 'Automatic', branch: 'When a rule applies' };

/** Full-screen preview of one portal: its approval workflow and a sample dashboard. */
export function PortalPreview({
  id,
  picked,
  onClose,
  onSwitch,
  onToggle,
  onRequest,
}: {
  id: string;
  picked: boolean;
  onClose: () => void;
  onSwitch: (id: string) => void;
  onToggle: () => void;
  onRequest: () => void;
}) {
  const [tab, setTab] = useState<Tab>('workflow');
  const [mounted, setMounted] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const p = PORTAL_CATALOG.find((x) => x.id === id)!;
  const data = PORTAL_PREVIEWS[id]!;
  const idx = PORTAL_CATALOG.indexOf(p);
  const step = (d: number) => onSwitch(PORTAL_CATALOG[(idx + d + PORTAL_CATALOG.length) % PORTAL_CATALOG.length]!.id);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && !(e.target instanceof HTMLInputElement)) step(1);
      if (e.key === 'ArrowLeft' && !(e.target instanceof HTMLInputElement)) step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!mounted) return null;
  return createPortal(
    <div className="o-pv-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="o-pv" role="dialog" aria-modal="true" aria-labelledby="o-pv-title" style={{ '--accent': p.accent } as CSSProperties}>
        <header className="o-pv-head">
          <div className="o-pv-head-top">
            <span className="o-pv-ico">
              <Icon name={p.icon} size={22} />
            </span>
            <div className="o-pv-title">
              <span className="o-pv-kicker">SteelConnect360 · Portal preview</span>
              <h2 id="o-pv-title">{p.name}</h2>
              <p>{p.tagline}</p>
            </div>
            <button ref={closeRef} type="button" className="o-pv-close" onClick={onClose} aria-label="Close preview">
              ✕
            </button>
          </div>
          <nav className="o-pv-switch" aria-label="Other portals">
            {PORTAL_CATALOG.map((x) => (
              <button
                key={x.id}
                type="button"
                className={x.id === id ? 'on' : ''}
                style={{ '--accent': x.accent } as CSSProperties}
                onClick={() => onSwitch(x.id)}
                aria-current={x.id === id}
              >
                <Icon name={x.icon} size={13} />
                {x.name}
              </button>
            ))}
          </nav>
        </header>

        <div className="o-pv-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'workflow'} onClick={() => setTab('workflow')}>
            <Icon name="sliders" size={14} /> Workflow
          </button>
          <button type="button" role="tab" aria-selected={tab === 'dashboard'} onClick={() => setTab('dashboard')}>
            <Icon name="chart" size={14} /> Dashboard
          </button>
          <span className="o-pv-sample">Sample data</span>
        </div>

        <div className="o-pv-body" key={`${id}-${tab}`}>
          {tab === 'workflow' ? <WorkflowView data={data} /> : <DashboardView portal={p} data={data} />}
        </div>

        <footer className="o-pv-foot">
          <div className="o-pv-nav">
            <button type="button" onClick={() => step(-1)} aria-label="Previous portal">
              <Icon name="left" size={14} />
            </button>
            <span>
              {idx + 1} / {PORTAL_CATALOG.length}
            </span>
            <button type="button" onClick={() => step(1)} aria-label="Next portal">
              <Icon name="right" size={14} />
            </button>
          </div>
          <label className={`o-pv-include${picked ? ' on' : ''}`}>
            <input type="checkbox" checked={picked} onChange={onToggle} />
            <Icon name={picked ? 'check' : 'plus'} size={13} />
            {picked ? 'In my email' : 'Add to my email'}
          </label>
          <button type="button" className="o-showcase-cta" onClick={onRequest}>
            <Icon name="mail" size={16} /> Email me the full details
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function WorkflowView({ data }: { data: Preview }) {
  const steps = data.workflow.steps;
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPlaying(false);
      return;
    }
  }, []);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setActive((a) => (a + 1) % (steps.length + 1)), 1600);
    return () => clearInterval(t);
  }, [playing, steps.length]);
  const cur = steps[Math.min(active, steps.length - 1)]!;
  const done = active >= steps.length;

  return (
    <div className="o-pv-wf">
      <div className="o-pv-wf-head">
        <div>
          <h3>{data.workflow.title}</h3>
          <p>Every step is tracked, timed and emailed to the right person.</p>
        </div>
        <button type="button" className="o-pv-play" onClick={() => setPlaying((v) => !v)} aria-pressed={playing}>
          {playing ? '❚❚ Pause' : '▶ Play'}
        </button>
      </div>

      <ol className="o-pv-track" style={{ '--n': steps.length } as CSSProperties}>
        {steps.map((s, i) => {
          const state = i < active ? 'done' : i === active ? 'now' : 'next';
          return (
            <li key={s.label} className={`o-pv-step ${state} ${s.kind ?? ''}`} style={{ animationDelay: `${i * 70}ms` }}>
              <button type="button" onClick={() => (setPlaying(false), setActive(i))}>
                <span className="o-pv-node">{state === 'done' ? <Icon name="check" size={14} /> : i + 1}</span>
                <span className="o-pv-step-label">{s.label}</span>
                <span className="o-pv-role">{s.role}</span>
                {s.kind && <span className={`o-pv-kind ${s.kind}`}>{KIND_LABEL[s.kind]}</span>}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="o-pv-now" aria-live="polite">
        {done ? (
          <>
            <span className="o-pv-now-badge ok">
              <Icon name="check" size={14} /> Complete
            </span>
            <span>
              Closed out with a full history: who did what, and when. <b>Average cycle: 2–3 days.</b>
            </span>
          </>
        ) : (
          <>
            <span className="o-pv-now-badge">
              Step {Math.min(active, steps.length - 1) + 1} of {steps.length}
            </span>
            <span>
              <b>{cur.label}</b> · {cur.role}. {cur.note}.
            </span>
          </>
        )}
      </div>

      <div className="o-pv-rules">
        {data.workflow.rules.map((r) => (
          <div key={r}>
            <Icon name="shield" size={15} />
            <span>{r}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const TONE_CLASS = { ok: 'ok', warn: 'warn', bad: 'bad', info: 'info', idle: 'idle' } as const;

function DashboardView({ portal, data }: { portal: PortalInfo; data: Preview }) {
  const d = data.dashboard;
  return (
    <div className="o-pv-app">
      <div className="o-pv-chrome">
        <i />
        <i />
        <i />
        <span>app.steelconnect360.com/{portal.id}</span>
      </div>
      <div className="o-pv-app-body">
        <aside className="o-pv-side">
          <div className="o-pv-side-brand">
            <Icon name={portal.icon} size={14} /> {portal.name}
          </div>
          {data.nav.map((n, i) => (
            <span key={n} className={i === 0 ? 'on' : ''}>
              {n}
            </span>
          ))}
        </aside>
        <div className="o-pv-main">
          <div className="o-pv-kpis">
            {d.kpis.map((k, i) => (
              <div key={k.label} className="o-pv-kpi" style={{ animationDelay: `${i * 60}ms` }}>
                <span>{k.label}</span>
                <strong>{k.value}</strong>
                <em className={k.good ? 'good' : 'bad'}>{k.delta}</em>
              </div>
            ))}
          </div>
          <div className="o-pv-row">
            <section className="o-pv-card">
              <h4>{d.chart.title}</h4>
              <BarChart chart={d.chart} />
            </section>
            <section className="o-pv-card">
              <h4>{d.split.title}</h4>
              <Donut parts={d.split.parts} />
            </section>
          </div>
          <section className="o-pv-card">
            <h4>{d.table.title}</h4>
            <table className="o-pv-table">
              <thead>
                <tr>
                  {d.table.cols.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {d.table.rows.map((r) => (
                  <tr key={r.cells[0]}>
                    {r.cells.map((c, i) => (
                      <td key={i}>{c}</td>
                    ))}
                    <td>
                      <span className={`o-pv-chip ${TONE_CLASS[r.tone]}`}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
}

function BarChart({ chart }: { chart: Preview['dashboard']['chart'] }) {
  const W = 420;
  const H = 170;
  const pad = { l: 8, r: 8, t: 12, b: 22 };
  const lo = chart.min ?? 0;
  const top = Math.max(...chart.values, ...(chart.target ?? []));
  const max = top + (top - lo) * 0.12;
  const n = chart.values.length;
  const slot = (W - pad.l - pad.r) / n;
  const bw = Math.min(34, slot * 0.56);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - (v - lo) / (max - lo));
  const cx = (i: number) => pad.l + slot * i + slot / 2;
  const target = chart.target?.map((v, i) => `${i ? 'L' : 'M'}${cx(i)},${y(v)}`).join(' ');
  return (
    <figure className="o-pv-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={chart.title}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={pad.l} x2={W - pad.r} y1={y(lo + (max - lo) * f)} y2={y(lo + (max - lo) * f)} className="grid" />
        ))}
        {chart.values.map((v, i) => (
          <g key={i}>
            <rect x={cx(i) - bw / 2} y={y(v)} width={bw} height={H - pad.b - y(v)} rx={4} className="bar" style={{ animationDelay: `${i * 60}ms` }}>
              <title>{`${chart.labels[i]}: ${v.toLocaleString('en-IN')}${chart.unit ? ` ${chart.unit}` : ''}`}</title>
            </rect>
            <text x={cx(i)} y={H - 6} textAnchor="middle" className="lbl">
              {chart.labels[i]}
            </text>
          </g>
        ))}
        {target && <path d={target} className="target" />}
        {chart.target?.map((v, i) => <circle key={i} cx={cx(i)} cy={y(v)} r={2.6} className="target-dot" />)}
      </svg>
      <figcaption>
        <span className="sw bar" /> Actual{chart.unit ? ` (${chart.unit})` : ''}
        {chart.target && (
          <>
            <span className="sw target" /> Target
          </>
        )}
      </figcaption>
    </figure>
  );
}

function Donut({ parts }: { parts: { label: string; value: number }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const R = 42;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const shades = [1, 0.7, 0.45, 0.25];
  return (
    <div className="o-pv-donut">
      <svg viewBox="0 0 120 120" role="img" aria-label={parts.map((p) => `${p.label} ${Math.round((p.value / total) * 100)}%`).join(', ')}>
        <circle cx="60" cy="60" r={R} className="track" />
        {parts.map((p, i) => {
          const len = (p.value / total) * C;
          const el = (
            <circle
              key={p.label}
              cx="60"
              cy="60"
              r={R}
              className="seg"
              style={{ opacity: shades[i] ?? 0.2, strokeDasharray: `${Math.max(len - 2, 0)} ${C}`, strokeDashoffset: -acc }}
            />
          );
          acc += len;
          return el;
        })}
        <text x="60" y="57" textAnchor="middle" className="big">
          {Math.round((parts[0]!.value / total) * 100)}%
        </text>
        <text x="60" y="72" textAnchor="middle" className="small">
          {parts[0]!.label}
        </text>
      </svg>
      <ul>
        {parts.map((p, i) => (
          <li key={p.label}>
            <span className="sw" style={{ opacity: shades[i] ?? 0.2 }} />
            {p.label}
            <b>{Math.round((p.value / total) * 100)}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
