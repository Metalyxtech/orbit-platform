'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, useToast } from '@orbit/ui';
import { markReadAction, sendMessageAction } from '../actions';

type Row = {
  id: string;
  kind: 'message' | 'review';
  subject: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  otherName: string;
  otherRole: string;
  project: string | null;
};
type Person = { id: string; name: string; role: string; title: string | null };

const ROLE: Record<string, string> = {
  company_admin: 'Company admin',
  project_manager: 'Project manager',
  management: 'Management',
  supervisor: 'Supervisor',
  employee: 'Employee',
};
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function MessagesClient({
  box,
  available,
  rows,
  people,
  projects,
  preselect,
}: {
  box: 'inbox' | 'sent';
  available: boolean;
  rows: Row[];
  people: Person[];
  projects: { id: string; label: string }[];
  preselect: string | null;
}) {
  const toast = useToast();
  const router = useRouter();
  const [writing, setWriting] = useState(!!preselect);
  const [open, setOpen] = useState<string | null>(null);
  const [to, setTo] = useState<string[]>(preselect ? [preselect] : []);
  const [kind, setKind] = useState<'message' | 'review'>('message');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [projectId, setProjectId] = useState('');
  const [sending, setSending] = useState(false);

  const toggle = (id: string) => setTo((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));
  const quick = (roles: string[]) => setTo(people.filter((p) => roles.includes(p.role)).map((p) => p.id));

  async function send() {
    setSending(true);
    const res = await sendMessageAction({ to, kind, subject, body, projectId: projectId || null });
    setSending(false);
    if (!res.ok) return toast(res.error, 'bad');
    toast(`Sent to ${res.data} ${res.data === 1 ? 'person' : 'people'}.`);
    setWriting(false);
    setTo([]);
    setSubject('');
    setBody('');
    setProjectId('');
    router.refresh();
  }

  async function openRow(r: Row) {
    setOpen(open === r.id ? null : r.id);
    if (box === 'inbox' && !r.readAt) {
      await markReadAction(r.id);
      router.refresh();
    }
  }

  return (
    <>
      <header className="o-top">
        <strong style={{ flex: 1 }}>Messages</strong>
        <Button variant="primary" onClick={() => setWriting((w) => !w)} disabled={!available}>
          {writing ? 'Close' : 'Write'}
        </Button>
      </header>
      <div className="o-page">
        {!available && <div className="o-banner">Messages switch on after the latest database update (pnpm db:migrate).</div>}

        {writing && available && (
          <div className="o-panel o-stack" style={{ gap: 12 }}>
            <h2 style={{ margin: 0 }}>New {kind === 'review' ? 'review comment' : 'message'}</h2>
            <div className="o-row" style={{ flexWrap: 'wrap', gap: 6 }}>
              <span className="faint" style={{ fontSize: 12 }}>Quick pick:</span>
              <Button size="small" onClick={() => quick(['company_admin'])}>
                Company admins
              </Button>
              <Button size="small" onClick={() => quick(['project_manager'])}>
                Project managers
              </Button>
              <Button size="small" onClick={() => quick(['company_admin', 'project_manager'])}>
                Admins and PMs
              </Button>
              <Button size="small" onClick={() => setTo([])}>
                Clear
              </Button>
            </div>
            <div className="o-recipients">
              {people.map((p) => (
                <label key={p.id} className={`o-recipient ${to.includes(p.id) ? 'on' : ''}`}>
                  <input type="checkbox" checked={to.includes(p.id)} onChange={() => toggle(p.id)} />
                  <span>
                    {p.name}
                    <span className="faint" style={{ display: 'block', fontSize: 11 }}>
                      {ROLE[p.role]}
                      {p.title ? `, ${p.title}` : ''}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <div className="o-form-row">
              <label className="o-field">
                Type
                <select className="o-select" value={kind} onChange={(e) => setKind(e.target.value as 'message' | 'review')}>
                  <option value="message">Message</option>
                  <option value="review">Review comment</option>
                </select>
              </label>
              <label className="o-field">
                About project (optional)
                <select className="o-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">No project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="o-field" style={{ flex: 2 }}>
                Subject
                <input className="o-input" value={subject} maxLength={140} onChange={(e) => setSubject(e.target.value)} />
              </label>
            </div>
            <label className="o-field">
              {kind === 'review' ? 'Your review' : 'Message'}
              <textarea className="o-textarea" style={{ minHeight: 120 }} value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} />
            </label>
            <div className="o-row" style={{ justifyContent: 'space-between' }}>
              <span className="faint" style={{ fontSize: 12 }}>{to.length} selected</span>
              <Button variant="primary" disabled={sending || to.length === 0 || subject.trim().length < 2 || body.trim().length < 2} onClick={send}>
                Send
              </Button>
            </div>
          </div>
        )}

        <div className="o-row" style={{ gap: 6 }}>
          <Link className={`o-btn small ${box === 'inbox' ? 'primary' : ''}`} href="/manage/messages">
            Inbox
          </Link>
          <Link className={`o-btn small ${box === 'sent' ? 'primary' : ''}`} href="/manage/messages?box=sent">
            Sent
          </Link>
        </div>
        <div className="o-panel flush">
          {rows.length === 0 ? (
            <div className="o-empty">{box === 'inbox' ? 'No messages yet.' : 'You have not sent anything yet.'}</div>
          ) : (
            <ul className="o-msgs">
              {rows.map((r) => (
                <li key={r.id} className={box === 'inbox' && !r.readAt ? 'unread' : ''}>
                  <button type="button" onClick={() => openRow(r)} aria-expanded={open === r.id}>
                    <span className="o-row" style={{ justifyContent: 'space-between', width: '100%' }}>
                      <span>
                        {r.kind === 'review' && <span className="o-chip warn" style={{ marginRight: 6 }}>Review</span>}
                        <strong>{r.subject}</strong>
                        <span className="faint" style={{ marginLeft: 8, fontSize: 12 }}>
                          {box === 'inbox' ? 'from' : 'to'} {r.otherName} ({ROLE[r.otherRole]})
                          {r.project ? ` · ${r.project}` : ''}
                        </span>
                      </span>
                      <span className="faint" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{when(r.createdAt)}</span>
                    </span>
                  </button>
                  {open === r.id && <p className="o-msg-body">{r.body}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
