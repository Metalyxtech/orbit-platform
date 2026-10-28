import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from '@react-email/components';
import type { EmailTemplate } from '@orbit/core/events';

type Props = Record<string, unknown> & { baseUrl?: string; path?: string };

interface Content {
  subject: string;
  heading: string;
  lines: string[];
  cta?: string;
}

const h = (n: unknown) => (typeof n === 'number' ? n.toFixed(1) : String(n ?? ''));

const content: Record<EmailTemplate, (p: Props) => Content> = {
  task_created: (p) => ({
    subject: `Timesheet to approve: ${p.employeeName}, week ${p.week}`,
    heading: `${p.employeeName} submitted week ${p.week}`,
    lines: [`${h(p.totalHours)} h in total, ${h(p.overtimeHours)} h overtime.`, 'Please review it before it is due.'],
    cta: 'Open approvals',
  }),
  task_reminder: (p) => ({
    subject: `${p.overdue ? 'Overdue' : 'Reminder'}: ${p.employeeName}, week ${p.week} is waiting for ${p.approverName}`,
    heading: p.overdue ? 'An approval is overdue' : 'A timesheet is waiting for you',
    lines: [`${p.employeeName}'s week ${p.week} is waiting for ${p.approverName}.`],
    cta: 'Open approvals',
  }),
  timesheet_returned: (p) => ({
    subject: `Week ${p.week} was returned to you`,
    heading: `Returned by ${p.approverName}`,
    lines: [`"${p.comment}"`, 'Fix the week and submit it again.'],
    cta: 'Open my week',
  }),
  timesheet_rejected: (p) => ({
    subject: `Week ${p.week} was rejected`,
    heading: `Rejected by ${p.approverName}`,
    lines: [`"${p.comment}"`],
    cta: 'Open my history',
  }),
  timesheet_approved: (p) => ({
    subject: `Week ${p.week} is approved`,
    heading: `Week ${p.week} is approved and locked`,
    lines: [`Approved by ${p.approverName}.`],
    cta: 'Open my history',
  }),
  correction_requested: (p) => ({
    subject: `Correction requested: ${p.employeeName}, week ${p.week}`,
    heading: 'A correction was requested',
    lines: [`${p.employeeName} asked to correct week ${p.week}:`, `"${p.reason}"`],
    cta: 'Open users',
  }),
  ts_deadline_reminder: (p) => ({
    subject: `Reminder: submit your timesheet for week ${p.week}`,
    heading: `Week ${p.week} is not submitted yet`,
    lines: [`Please submit it before the deadline (${p.deadline}).`],
    cta: 'Open my week',
  }),
  export_ready: (p) => ({
    subject: 'Your timesheet export is ready',
    heading: 'Your export is ready',
    lines: ['The download link works for 24 hours.'],
    cta: 'Download',
  }),
};

export function renderContent(template: EmailTemplate, props: Props) {
  return content[template](props);
}

export function Email({ template, props }: { template: EmailTemplate; props: Props }) {
  const c = content[template](props);
  const href = `${props.baseUrl ?? ''}${props.path ?? '/'}`;
  return (
    <Html>
      <Head />
      <Preview>{c.subject}</Preview>
      <Body style={{ background: '#F7F8F6', fontFamily: 'IBM Plex Sans, Arial, sans-serif', color: '#1D2328' }}>
        <Container style={{ background: '#FFFFFF', border: '1px solid #DDE1E4', borderRadius: 3, padding: 24, maxWidth: 520 }}>
          <Text style={{ fontWeight: 700, letterSpacing: '0.02em', margin: 0 }}>Orbit</Text>
          <Hr style={{ borderColor: '#DDE1E4' }} />
          <Heading as="h2" style={{ fontSize: 18 }}>
            {c.heading}
          </Heading>
          {c.lines.map((l, i) => (
            <Text key={i} style={{ fontSize: 14 }}>
              {l}
            </Text>
          ))}
          {c.cta && (
            <Section style={{ marginTop: 16 }}>
              <Button href={href} style={{ background: '#2F5D8A', color: '#FFFFFF', padding: '10px 18px', borderRadius: 3, fontSize: 14 }}>
                {c.cta}
              </Button>
            </Section>
          )}
          <Hr style={{ borderColor: '#DDE1E4', marginTop: 24 }} />
          <Text style={{ fontSize: 11, color: '#8A949C' }}>You get this email because you use Orbit at your company.</Text>
        </Container>
      </Body>
    </Html>
  );
}
