'use client';
import { useActionState, useRef, useState, type CSSProperties } from 'react';
import { Icon } from '@orbit/ui';
import { PORTAL_CATALOG } from '@/portal-catalog';
import { PortalPreview } from './PortalPreview';
import { requestPortalInfoAction, type InfoState } from './sign-in/info-action';

const initial: InfoState = { status: 'idle' };

/** Sign-in brand panel: the portals as tiles. Pick the ones you like and get the details by email. */
export function PortalShowcase() {
  const [picked, setPicked] = useState<string[]>(['production', 'quality']);
  const [open, setOpen] = useState<string>('production');
  const [formOpen, setFormOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const [state, action, pending] = useActionState(requestPortalInfoAction, initial);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const active = PORTAL_CATALOG.find((p) => p.id === open) ?? PORTAL_CATALOG[0]!;
  const requestFromPreview = () => {
    if (preview && !picked.includes(preview)) setPicked((p) => [...p, preview]);
    setPreview(null);
    setFormOpen(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  return (
    <div className="o-showcase">
      <div className="o-showcase-kicker">Manufacturing portals</div>
      <h2>Run the whole job, from enquiry to dispatch.</h2>
      <p className="o-showcase-lead">Click a portal to see its workflow and dashboard. Pick the ones you like and we will email you the details.</p>

      <div className="o-showcase-grid" role="list">
        {PORTAL_CATALOG.map((p) => {
          const on = picked.includes(p.id);
          return (
            <div
              key={p.id}
              role="listitem"
              className={`o-ptile${on ? ' on' : ''}${open === p.id ? ' open' : ''}`}
              style={{ '--accent': p.accent } as CSSProperties}
              onMouseEnter={() => setOpen(p.id)}
            >
              <button type="button" className="o-ptile-main" onClick={() => (setOpen(p.id), setPreview(p.id))} onFocus={() => setOpen(p.id)} aria-haspopup="dialog">
                <span className="o-ptile-ico">
                  <Icon name={p.icon} size={18} />
                </span>
                <span className="o-ptile-name">{p.name}</span>
                <span className="o-ptile-tag">{p.tagline}</span>
                <span className="o-ptile-open">
                  Workflow &amp; dashboard <Icon name="right" size={11} />
                </span>
              </button>
              <label className="o-ptile-pick" title={on ? 'Remove from my email' : 'Add to my email'}>
                <input type="checkbox" checked={on} onChange={() => toggle(p.id)} aria-label={`Include ${p.name} in the email`} />
                <Icon name={on ? 'check' : 'plus'} size={12} />
              </label>
            </div>
          );
        })}
      </div>

      <div className="o-showcase-detail" style={{ '--accent': active.accent } as CSSProperties} aria-live="polite">
        <div className="o-showcase-detail-head">
          <Icon name={active.icon} size={16} />
          <strong>{active.name}</strong>
          <span>{active.tagline}</span>
          <button type="button" className="o-showcase-peek" onClick={() => setPreview(active.id)}>
            Open preview <Icon name="right" size={12} />
          </button>
        </div>
        <ul>
          {active.features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>

      <div ref={formRef} />
      {state.status === 'sent' ? (
        <div className="o-showcase-sent" role="status">
          <Icon name="mail" size={18} />
          <div>
            <strong>Check your inbox.</strong>
            <span>The portal guide is on its way{state.email ? ` to ${state.email}` : ''}. Reply to it to talk to our team.</span>
          </div>
        </div>
      ) : !formOpen ? (
        <button type="button" className="o-showcase-cta" onClick={() => setFormOpen(true)} disabled={picked.length === 0}>
          <Icon name="mail" size={16} />
          {picked.length === 0 ? 'Pick a portal to get the details' : `Email me details on ${picked.length} portal${picked.length > 1 ? 's' : ''}`}
          <Icon name="right" size={14} />
        </button>
      ) : (
        <form action={action} className="o-showcase-form">
          {picked.map((id) => (
            <input key={id} type="hidden" name="portals" value={id} />
          ))}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="o-hp" aria-hidden />
          <div className="o-showcase-row">
            <input name="email" type="email" required placeholder="Work email *" autoComplete="email" autoFocus aria-label="Work email" />
            <input name="name" placeholder="Your name" autoComplete="name" aria-label="Your name" />
          </div>
          <div className="o-showcase-row">
            <input name="company" placeholder="Company" autoComplete="organization" aria-label="Company" />
            <input name="phone" type="tel" placeholder="Phone (optional)" autoComplete="tel" aria-label="Phone" />
          </div>
          {state.status === 'error' && (
            <div className="o-showcase-err" role="alert">
              {state.message}
            </div>
          )}
          <div className="o-showcase-actions">
            <button type="submit" className="o-showcase-cta" disabled={pending || picked.length === 0}>
              <Icon name="mail" size={16} />
              {pending ? 'Sending…' : 'Send me the details'}
            </button>
            <button type="button" className="o-showcase-cancel" onClick={() => setFormOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {preview && (
        <PortalPreview
          id={preview}
          picked={picked.includes(preview)}
          onClose={() => setPreview(null)}
          onSwitch={(id) => (setPreview(id), setOpen(id))}
          onToggle={() => toggle(preview)}
          onRequest={requestFromPreview}
        />
      )}
    </div>
  );
}
