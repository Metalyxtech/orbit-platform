import { Body, Button, Container, Head, Heading, Hr, Html, Img, Preview, Section, Text } from '@react-email/components';
import type { EmailTemplate } from '@orbit/core/events';

type Props = Record<string, unknown> & { baseUrl?: string; path?: string };

interface Content {
  subject: string;
  heading: string;
  lines: string[];
  cta?: string;
  /** Titled blocks with bullet points (portal guide). */
  sections?: { title: string; body?: string; items: string[]; accent?: string }[];
  /** Replaces the default "you use SteelConnect360 at your company" footer. */
  footer?: string;
}

type Section = NonNullable<Content['sections']>[number];
const sectionsOf = (p: Props): Section[] => (Array.isArray(p.sections) ? (p.sections as Section[]) : []);
const names = (p: Props) => sectionsOf(p).map((x) => x.title).join(', ');

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
  portal_info: (p) => ({
    subject: `Your SteelConnect360 guide: ${names(p) || 'portals'}`,
    heading: p.name ? `Hi ${p.name}, here is how each portal works` : 'Here is how each portal works',
    lines: [
      'Every portal runs in one login, with approval routes, dashboards and email notifications built in. Your company data is kept separate from every other company.',
    ],
    sections: sectionsOf(p),
    cta: 'See plans and start a 7-day trial',
    footer: 'You get this email because you asked for portal details on the SteelConnect360 sign-in page. Reply to this email to talk to our team.',
  }),
  portal_info_lead: (p) => ({
    subject: `New portal enquiry: ${p.company || p.email} (${names(p)})`,
    heading: 'Someone asked for portal details',
    lines: [
      `Name: ${p.name || '-'}`,
      `Email: ${p.email}`,
      `Company: ${p.company || '-'}`,
      `Phone: ${p.phone || '-'}`,
      `Portals: ${names(p)}`,
      ...(p.message ? [`Message: ${p.message}`] : []),
    ],
    footer: 'Sent from the SteelConnect360 sign-in page.',
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
          <Section>
            {props.baseUrl ? (
              <Img src={`${props.baseUrl}/logo-mark.png`} width="32" height="32" alt="" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 10 }} />
            ) : null}
            <Text style={{ display: 'inline-block', verticalAlign: 'middle', fontWeight: 700, letterSpacing: '0.02em', margin: 0 }}>SteelConnect360</Text>
          </Section>
          <Hr style={{ borderColor: '#DDE1E4' }} />
          <Heading as="h2" style={{ fontSize: 18 }}>
            {c.heading}
          </Heading>
          {c.lines.map((l, i) => (
            <Text key={i} style={{ fontSize: 14 }}>
              {l}
            </Text>
          ))}
          {c.sections?.map((sec, i) => (
            <Section key={`s${i}`} style={{ borderLeft: `3px solid ${sec.accent ?? '#2F5D8A'}`, paddingLeft: 12, margin: '14px 0' }}>
              <Text style={{ fontSize: 15, fontWeight: 700, margin: '0 0 2px' }}>{sec.title}</Text>
              {sec.body ? <Text style={{ fontSize: 13, color: '#4A545C', margin: '0 0 6px' }}>{sec.body}</Text> : null}
              {sec.items.map((it, j) => (
                <Text key={j} style={{ fontSize: 13, margin: '2px 0' }}>
                  • {it}
                </Text>
              ))}
            </Section>
          ))}
          {c.cta && (
            <Section style={{ marginTop: 16 }}>
              <Button href={href} style={{ background: '#2F5D8A', color: '#FFFFFF', padding: '10px 18px', borderRadius: 3, fontSize: 14 }}>
                {c.cta}
              </Button>
            </Section>
          )}
          <Hr style={{ borderColor: '#DDE1E4', marginTop: 24 }} />
          <Text style={{ fontSize: 11, color: '#8A949C' }}>{c.footer ?? 'You get this email because you use SteelConnect360 at your company.'}</Text>
        </Container>
      </Body>
    </Html>
  );
}
