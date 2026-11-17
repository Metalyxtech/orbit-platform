'use client';
import { useMemo, useState } from 'react';
import { addProjectAction, saveTeamAction } from '@orbit/core/teams-actions';
import { Button, Chip, useToast } from '@orbit/ui';
import { useRouter } from 'next/navigation';

type Project = { kind: 'sales' | 'own'; key: string; number: string; title: string; status: string; customer: string | null; members: string[] };
type Person = { id: string; name: string; email: string; title: string | null; role: string };

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** One row per project: its team as chips; Edit opens a searchable people list. Saved per project. */
export function TeamsClient({ projects, people, canAdd }: { projects: Project[]; people: Person[]; canAdd: boolean }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'team' | 'open'>('all');
  const shown = projects.filter((p) => (filter === 'team' ? p.members.length > 0 : filter === 'open' ? p.members.length === 0 : true) && `${p.number} ${p.title} ${p.customer ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      {canAdd && <AddProject />}
      {projects.length === 0 && (
        <p className="muted" style={{ margin: 0 }}>
          {canAdd ? 'No projects yet. Add your first project above.' : 'No projects yet. A project appears here when a sales enquiry is won and becomes a sales order.'}
        </p>
      )}
      <div className="o-row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input className="o-input" style={{ maxWidth: 320 }} placeholder="Find a project (number, title, customer)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a project" />
        {(['all', 'team', 'open'] as const).map((f) => (
          <Button key={f} size="small" variant={filter === f ? 'primary' : undefined} onClick={() => setFilter(f)}>
            {f === 'all' ? `All (${projects.length})` : f === 'team' ? `With a team (${projects.filter((p) => p.members.length).length})` : `Open to everyone (${projects.filter((p) => !p.members.length).length})`}
          </Button>
        ))}
      </div>
      <div className="o-stack" style={{ gap: 10 }}>
        {shown.map((p) => (
          <ProjectRow key={`${p.key}:${p.members.join(',')}`} p={p} people={people} />
        ))}
      </div>
    </>
  );
}

function ProjectRow({ p, people }: { p: Project; people: Person[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(p.members);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const byId = useMemo(() => new Map(people.map((x) => [x.id, x])), [people]);
  const dirty = !same(draft, p.members);
  const list = people.filter((x) => `${x.name} ${x.email} ${x.title ?? ''} ${x.role}`.toLowerCase().includes(q.trim().toLowerCase()));
  async function save() {
    setBusy(true);
    const res = await saveTeamAction({ kind: p.kind, key: p.key, memberIds: draft });
    setBusy(false);
    if (!res.ok) return toast(res.error, 'bad');
    toast(draft.length ? `Team saved: ${p.number} is now seen only by its ${draft.length} members, the GM and admins.` : `${p.number} is open to everyone again.`);
    setOpen(false);
    router.refresh();
  }
  return (
    <div className="o-panel" style={{ borderLeft: `3px solid ${p.members.length ? 'var(--steel)' : 'var(--line)'}` }}>
      <div className="o-row" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <strong>
            {p.number} · {p.title}
          </strong>
          <div className="muted" style={{ fontSize: 12 }}>
            {[p.customer, p.kind === 'own' ? 'Company project' : 'Sales order', p.status].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="o-row" style={{ gap: 6 }}>
          {p.members.length ? <Chip tone="steel">{`Team of ${p.members.length} · restricted`}</Chip> : <Chip tone="grey">Open to everyone</Chip>}
          {!open && (
            <Button size="small" onClick={() => (setDraft(p.members), setOpen(true))}>
              {p.members.length ? 'Edit team' : 'Set up team'}
            </Button>
          )}
        </div>
      </div>
      {!open && p.members.length > 0 && (
        <div className="o-row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {p.members.map((id) => {
            const x = byId.get(id);
            return x ? <Chip key={id} tone="grey">{`${x.name}${x.title ? ` · ${x.title}` : ''}`}</Chip> : null;
          })}
        </div>
      )}
      {open && (
        <div className="o-stack" style={{ gap: 8, marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          <input className="o-input" placeholder="Find people by name, title or role" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find people" />
          <div className="p-covers" style={{ maxHeight: 260, overflowY: 'auto' }}>
            {list.map((x) => {
              const on = draft.includes(x.id);
              return (
                <label key={x.id} className={on ? 'on' : undefined}>
                  <input type="checkbox" checked={on} onChange={(e) => setDraft(e.target.checked ? [...draft, x.id] : draft.filter((d) => d !== x.id))} />
                  {x.name}
                  <span className="faint">{x.title ? ` · ${x.title}` : ` · ${x.role}`}</span>
                </label>
              );
            })}
          </div>
          <span className="faint" style={{ fontSize: 12 }}>
            {draft.length ? `${draft.length} selected. Only they (with the GM and admins) will see ${p.number} in every portal.` : 'Nobody selected: saving opens the project to everyone.'}
          </span>
          <div className="o-row" style={{ gap: 6 }}>
            <Button size="small" variant="primary" disabled={busy || !dirty} onClick={save}>
              Save team
            </Button>
            <Button size="small" onClick={() => (setDraft(p.members), setOpen(false))}>
              Discard
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** A company without Sales adds its projects here (code and name). */
function AddProject() {
  const router = useRouter();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="o-panel o-row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <label className="o-field" style={{ width: 160 }}>
        Project code
        <input className="o-input" value={code} maxLength={20} placeholder="PRJ-101" onChange={(e) => setCode(e.target.value.toUpperCase())} />
      </label>
      <label className="o-field" style={{ flex: 1, minWidth: 220 }}>
        Project name
        <input className="o-input" value={name} maxLength={120} placeholder="e.g. Warehouse extension, Kochi" onChange={(e) => setName(e.target.value)} />
      </label>
      <Button
        variant="primary"
        disabled={busy || !code.trim() || name.trim().length < 2}
        onClick={async () => {
          setBusy(true);
          const res = await addProjectAction({ code, name });
          setBusy(false);
          if (!res.ok) return toast(res.error, 'bad');
          toast(`Project ${code} added. Set up its team below.`);
          setCode('');
          setName('');
          router.refresh();
        }}
      >
        Add project
      </Button>
    </div>
  );
}
