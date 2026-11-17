'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Chip, useToast } from '@orbit/ui';
import { cancelCompanyPortalAction, requestCompanyPortalAction } from '../actions';

type Portal = { id: string; name: string; roles: string[]; pages: string[]; state: 'on' | 'requested' | 'none' };

export function PortalsClient({ portals }: { portals: Portal[] }) {
  const router = useRouter();
  const toast = useToast();
  async function act(p: Portal, kind: 'request' | 'cancel') {
    const res = kind === 'request' ? await requestCompanyPortalAction({ portal: p.id }) : await cancelCompanyPortalAction({ portal: p.id });
    if (!res.ok) return toast(res.error, 'bad');
    toast(kind === 'request' ? `${p.name} requested. Orbit will review it.` : `${p.name} request withdrawn.`);
    router.refresh();
  }
  return (
    <div className="o-form-gallery">
      {portals.map((p) => (
        <article key={p.id} className="o-panel o-form-card">
          <div className="o-row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>{p.name}</h2>
            <Chip tone={p.state === 'on' ? 'ok' : p.state === 'requested' ? 'warn' : 'grey'}>{p.state === 'on' ? 'In use' : p.state === 'requested' ? 'Waiting for Orbit' : 'Not added'}</Chip>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '8px 0 4px' }}>
            Pages: {p.pages.join(', ')}
          </p>
          {p.roles.length > 0 && (
            <p className="faint" style={{ fontSize: 11, margin: 0 }}>
              Roles inside: {p.roles.join(', ')}
            </p>
          )}
          <div className="o-row" style={{ marginTop: 'auto', paddingTop: 12 }}>
            {p.state === 'none' && (
              <Button variant="primary" onClick={() => act(p, 'request')}>
                Request {p.name}
              </Button>
            )}
            {p.state === 'requested' && <Button onClick={() => act(p, 'cancel')}>Withdraw request</Button>}
            {p.state === 'on' && (
              <Link className="o-btn" href="/manage/company/people">
                Give it to people
              </Link>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
