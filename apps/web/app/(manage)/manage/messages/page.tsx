import { query } from '@orbit/core/next';
import { listMessages, projectChoices, recipients } from '@/messages';
import { MessagesClient } from './MessagesClient';

export const dynamic = 'force-dynamic';

/** Messages and review comments with admins, project managers and anyone in the company. */
export default async function Messages({ searchParams }: { searchParams: Promise<{ box?: string; to?: string }> }) {
  const f = await searchParams;
  const box = f.box === 'sent' ? 'sent' : 'inbox';
  const d = await query(async (tx, ctx) => ({
    list: await listMessages(tx, ctx, box),
    people: await recipients(tx, ctx),
    projects: await projectChoices(tx, ctx),
  }));
  return (
    <MessagesClient
      box={box}
      available={d.list.ok}
      rows={d.list.data.map((m) => ({ ...m, createdAt: m.createdAt.toISOString(), readAt: m.readAt?.toISOString() ?? null }))}
      people={d.people}
      projects={d.projects}
      preselect={f.to ?? null}
    />
  );
}
