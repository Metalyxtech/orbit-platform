'use client';
import { useRouter } from 'next/navigation';
import { Button, TopBar, useToast } from '@orbit/ui';
import { exportAction } from '../../actions';

// Reports: filters and export.

export function ReportFilters({ month, projectId, projects }: { month: string; projectId: string; projects: { id: string; label: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    return { value: d.toISOString().slice(0, 7), label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
  });
  const go = (m: string, p: string) => router.push(`?month=${m}${p ? `&project=${p}` : ''}`);

  async function doExport() {
    const res = await exportAction({ month, projectIds: projectId ? [projectId] : undefined });
    if (!res.ok) return toast(res.error, 'bad');
    toast('Export started. We will email you a download link (valid 24 hours).');
  }

  return (
    <TopBar crumbs={['Timesheet', 'Reports']}>
      <select className="o-select" style={{ width: 170 }} value={month} onChange={(e) => go(e.target.value, projectId)} aria-label="Month">
        {months.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <select className="o-select" style={{ width: 180 }} value={projectId} onChange={(e) => go(month, e.target.value)} aria-label="Project">
        <option value="">All my projects</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <Button onClick={doExport}>Export to Excel</Button>
    </TopBar>
  );
}

/** Company admin adds a person; they sign in with that email and land straight in the company. */
