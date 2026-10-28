import { desc, eq } from 'drizzle-orm';
import { createPoolDb } from '../src';
import * as schema from '../src/schema';

/**
 * Seeds the workflow library and the demo company shown in the screens (Hekur Contractors).
 * Run as the owner role:  DATABASE_OWNER_URL=... pnpm db:seed
 * Set SEED_DEMO=0 to load only the workflow library (production).
 */
const url = process.env.DATABASE_OWNER_URL;
if (!url) throw new Error('DATABASE_OWNER_URL is not set');
const db = createPoolDb(url);
const pool = db.$client;
const s = schema;

// ---------- Workflow library ----------
const twoLevel = {
  key: 'timesheet.two_level_overtime',
  version: 5,
  name: 'Two-level with overtime check',
  description: 'Supervisor, then project manager when overtime is above 6.0 h or a day is above 12 h.',
  definition: {
    steps: [
      { id: 'supervisor', name: 'Supervisor', approver: { type: 'supervisor' }, slaHours: 24, remindAfterHours: 16 },
      {
        id: 'pm',
        name: 'Project managers',
        approver: { type: 'project_managers' },
        when: { any: [{ field: 'overtimeHours', op: 'gt', value: 6 }, { field: 'maxDayHours', op: 'gt', value: 12 }] },
        reason: 'Because overtime > 6.0 h',
        slaHours: 24,
        remindAfterHours: 16,
      },
    ],
  },
};
await db.insert(s.workflowDefinitions).values(twoLevel).onConflictDoNothing();
const [wf] = await db
  .select()
  .from(s.workflowDefinitions)
  .where(eq(s.workflowDefinitions.key, twoLevel.key))
  .orderBy(desc(s.workflowDefinitions.version))
  .limit(1);
console.log('Workflow library ready');

// Super Admin (sign in with this email through WorkOS, or pick it locally in dev mode).
const superEmail = process.env.SEED_SUPER_ADMIN_EMAIL ?? 'superadmin@orbit.local';
await db
  .insert(s.users)
  .values({ workosUserId: `seed|${superEmail}`, email: superEmail, name: 'Orbit Super Admin', isSuperAdmin: true })
  .onConflictDoUpdate({ target: s.users.email, set: { isSuperAdmin: true } });

if (process.env.SEED_DEMO === '0') {
  await pool.end();
  process.exit(0);
}

// ---------- Demo company ----------
const slug = 'hekur-contractors';
const [existing] = await db.select().from(s.companies).where(eq(s.companies.slug, slug));
if (existing) {
  console.log('Demo company already exists, nothing to do');
  await pool.end();
  process.exit(0);
}

const domain = process.env.SEED_DEMO_DOMAIN ?? 'hekur.example';
const [company] = await db
  .insert(s.companies)
  .values({ name: 'Hekur Contractors', slug, stage: 'sandbox', status: 'active', timezone: 'Asia/Kolkata', emailDomains: [domain] })
  .returning();
const companyId = company.id;
await db.insert(s.companyPortals).values({ companyId, portal: 'timesheet', enabled: true, workflowDefinitionId: wf.id });
await db.insert(s.tsSettings).values({ companyId });

type Role = (typeof s.memberRole.enumValues)[number];
const people: [string, string, Role, string, string | null][] = [
  // name, email local part, role, title, supervisor (email local part)
  ['Anita George', 'anita.george', 'company_admin', 'Project manager', null],
  ['Vivek Shenoy', 'vivek.shenoy', 'project_manager', 'Project manager', null],
  ['Rahul Menon', 'rahul.menon', 'supervisor', 'Supervisor', null],
  ['Sreeja Das', 'sreeja.das', 'supervisor', 'Supervisor', null],
  ['Joseph Thomas', 'joseph.thomas', 'employee', 'Fabrication foreman', 'rahul.menon'],
  ['Suresh Kumar', 'suresh.kumar', 'employee', 'Welder', 'rahul.menon'],
  ['Biju Varghese', 'biju.varghese', 'employee', 'Fitter', 'rahul.menon'],
  ['Mohammed Asif', 'mohammed.asif', 'employee', 'Rigger', 'rahul.menon'],
  ['Prakash Rao', 'prakash.rao', 'employee', 'Helper', 'rahul.menon'],
  ['Linto Chacko', 'linto.chacko', 'employee', 'Painter', 'rahul.menon'],
];
const m: Record<string, string> = {};
for (const [name, local, role, title] of people) {
  const email = `${local}@${domain}`;
  const [u] = await db
    .insert(s.users)
    .values({ workosUserId: `seed|${email}`, email, name })
    .onConflictDoUpdate({ target: s.users.email, set: { name } })
    .returning();
  const [mem] = await db.insert(s.memberships).values({ companyId, userId: u.id, role, title, status: 'active' }).returning();
  m[local] = mem.id;
}
for (const [, local, , , sup] of people) {
  if (sup) await db.update(s.memberships).set({ supervisorId: m[sup] }).where(eq(s.memberships.id, m[local]));
}

const projectRows: [string, string, string | null, [string, string][]][] = [
  ['J07567', 'Loch Striven Platform', 'anita.george', [
    ['5120', 'Fabrication, structural steel'], ['5140', 'Welding, site repairs'], ['5160', 'Blasting and painting'],
    ['5180', 'Erection'], ['5200', 'Inspection and testing'], ['5220', 'Rigging'],
  ]],
  ['HEK-0205', 'Mysore SS Gates', 'vivek.shenoy', [['3010', 'Shop drawings check'], ['3020', 'Cutting'], ['3030', 'Welding'], ['3040', 'Polishing']]],
  ['KS-1180', 'Pune Warehouse', 'vivek.shenoy', [['4010', 'Anchor bolts'], ['4020', 'Columns'], ['4030', 'Roof trusses'], ['4040', 'Purlins'], ['4050', 'Sheeting']]],
  ['OVERHEAD', 'Overhead', null, [['9900', 'Safety induction'], ['9910', 'Training'], ['9920', 'Workshop maintenance']]],
];
const proj: Record<string, string> = {};
const cc: Record<string, string> = {};
for (const [code, name, pm, codes] of projectRows) {
  const [p] = await db.insert(s.projects).values({ companyId, code, name, pmId: pm ? m[pm] : null }).returning();
  proj[code] = p.id;
  for (const [c, cn] of codes) {
    const [row] = await db.insert(s.costCodes).values({ companyId, projectId: p.id, code: c, name: cn }).returning();
    cc[`${code}/${c}`] = row.id;
  }
}

// ---------- Timesheets ----------
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const thisWeek = addDays(today, -new Date(`${today}T00:00:00Z`).getUTCDay()); // Sunday start
const lastWeek = addDays(thisWeek, -7);

async function sheet(
  who: string,
  weekStart: string,
  status: (typeof s.timesheetStatus.enumValues)[number],
  rows: [string, number[]][],
  extra: Partial<typeof s.timesheets.$inferInsert> = {},
) {
  const dayTotals = Array.from({ length: 7 }, (_, d) => rows.reduce((t, [, h]) => t + h[d], 0));
  const total = dayTotals.reduce((a, b) => a + b, 0);
  const overtime = Math.max(0, total - 48);
  const [t] = await db
    .insert(s.timesheets)
    .values({
      companyId,
      membershipId: m[who],
      weekStart,
      status,
      totalHours: total,
      overtimeHours: overtime,
      maxDayHours: Math.max(...dayTotals),
      createdStage: 'sandbox',
      submittedAt: status === 'draft' ? null : new Date(Date.now() - 20 * 3_600_000),
      approvedAt: status === 'locked' ? new Date() : null,
      lockedAt: status === 'locked' ? new Date() : null,
      ...extra,
    })
    .returning();
  let i = 0;
  for (const [key, hours] of rows) {
    const [pcode] = key.split('/');
    for (let d = 0; d < 7; d++) {
      if (hours[d] > 0 || d === 0) {
        await db.insert(s.timesheetEntries).values({
          companyId,
          timesheetId: t.id,
          rowKey: `seed${i}`,
          projectId: proj[pcode],
          costCodeId: cc[key],
          workDate: addDays(weekStart, d),
          hours: hours[d],
        });
      }
    }
    i++;
  }
  return t;
}

async function pending(t: { id: string; overtimeHours: number }, assignee: string, dueInHours: number) {
  const [inst] = await db
    .insert(s.workflowInstances)
    .values({ companyId, definitionId: wf.id, kind: 'timesheet.submit', subjectId: t.id, context: { overtimeHours: t.overtimeHours } })
    .returning();
  await db.insert(s.workflowTasks).values({
    companyId,
    instanceId: inst.id,
    stepIndex: 0,
    stepName: 'Supervisor',
    assigneeId: m[assignee],
    dueAt: new Date(Date.now() + dueInHours * 3_600_000),
  });
}

// Screen 11.1: Joseph Thomas, My week (draft, 59.0 h, 11.0 h overtime).
await sheet('joseph.thomas', thisWeek, 'draft', [
  ['J07567/5120', [8, 8, 8, 10.5, 8, 0, 8]],
  ['J07567/5140', [0, 2, 2, 0, 2, 0, 0]],
  ['HEK-0205/3010', [0, 0, 0, 0, 1.5, 0, 0]],
  ['OVERHEAD/9900', [1, 0, 0, 0, 0, 0, 0]],
], { note: 'Thursday overtime: crane delay, lift completed after 18:00' });
// Joseph's history.
for (let w = 2; w <= 5; w++) {
  await sheet('joseph.thomas', addDays(thisWeek, -7 * w), 'locked', [['J07567/5120', [8, 8, 8, 8, 8, 0, 8]]]);
}
await sheet('joseph.thomas', addDays(thisWeek, -7), 'returned', [['J07567/5140', [8, 8, 8, 8, 8, 0, 8]]], {
  returnComment: 'Tuesday 5140 should be 5120, please correct',
  returnedBy: 'Rahul Menon',
  returnedAt: new Date(Date.now() - 30 * 3_600_000),
});

// Screen 11.3: Rahul Menon's approvals inbox (last week).
const regular: [string, number[]][] = [['J07567/5120', [8, 8, 8, 8, 8, 0, 8]]];
await pending(await sheet('suresh.kumar', lastWeek, 'in_approval', regular), 'rahul.menon', 20);
await pending(await sheet('biju.varghese', lastWeek, 'in_approval', regular), 'rahul.menon', 9);
await pending(await sheet('mohammed.asif', lastWeek, 'in_approval', [['J07567/5220', [9, 9, 9, 9, 8.5, 0, 8]]]), 'rahul.menon', 8);
await pending(await sheet('prakash.rao', lastWeek, 'in_approval', [['KS-1180/4020', [6, 6, 6, 6, 6, 0, 6]]]), 'rahul.menon', -2);
await pending(await sheet('linto.chacko', lastWeek, 'in_approval', [['HEK-0205/3040', [8, 8, 8, 8, 8, 0, 4]]]), 'rahul.menon', 15);

// Approved hours for Reports (Screen 11.5).
for (let w = 2; w <= 4; w++) {
  for (const who of ['suresh.kumar', 'biju.varghese', 'mohammed.asif', 'linto.chacko']) {
    await sheet(who, addDays(thisWeek, -7 * w), 'locked', [
      ['J07567/5120', [6, 6, 6, 6, 6, 0, 6]],
      ['KS-1180/4030', [3, 3, 3, 4, 4, 0, 2]],
    ]);
  }
}

console.log(`Demo company "Hekur Contractors" seeded. Users are <first.last>@${domain}, e.g. joseph.thomas@${domain}`);
await pool.end();
