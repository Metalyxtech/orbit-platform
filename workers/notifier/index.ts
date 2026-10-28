import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { render } from '@react-email/render';
import type { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { inArray } from 'drizzle-orm';
import { createElement } from 'react';
import type { EmailIntent, PlatformEvent } from '@orbit/core/events';
import { emailSuppressions } from '@orbit/db';
import { alreadyProcessed, markProcessed, workerDb } from '../shared/db';
import { log } from '../shared/log';
import { param, workerParams } from '../shared/params';
import { Email, renderContent } from './templates';

const ses = new SESv2Client({});

/**
 * Sandbox email guard: sandbox companies only email addresses on the allowlist
 * (/orbit/<env>/workers/sandboxAllowlist, comma separated; '*@domain' allowed).
 */
export function guardRecipients(to: string[], stage: PlatformEvent['companyStage'], allowlist: string) {
  if (stage !== 'sandbox') return to;
  const allowed = allowlist
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return to.filter((addr) => {
    const a = addr.toLowerCase();
    return allowed.some((rule) => (rule.startsWith('*@') ? a.endsWith(rule.slice(1)) : a === rule));
  });
}

async function send(event: PlatformEvent<{ email?: EmailIntent }>) {
  const intent = event.data?.email;
  if (!intent || intent.to.length === 0) return 'no-email';

  const params = await workerParams();
  let to = guardRecipients([...new Set(intent.to)], event.companyStage, params.sandboxAllowlist ?? '');
  if (to.length) {
    const db = await workerDb();
    const suppressed = await db.select().from(emailSuppressions).where(inArray(emailSuppressions.email, to.map((t) => t.toLowerCase())));
    const blocked = new Set(suppressed.map((s) => s.email));
    to = to.filter((t) => !blocked.has(t.toLowerCase()));
  }
  if (to.length === 0) return 'guarded';

  const element = createElement(Email, { template: intent.template, props: intent.props });
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  const subject = renderContent(intent.template, intent.props).subject;

  // One message per recipient so addresses are never exposed to each other.
  for (const addr of to) {
    await ses.send(
      new SendEmailCommand({
        FromEmailAddress: await param('fromAddress'),
        ReplyToAddresses: params.replyTo ? [params.replyTo] : undefined,
        Destination: { ToAddresses: [addr] },
        ConfigurationSetName: process.env.SES_CONFIGURATION_SET,
        Content: { Simple: { Subject: { Data: subject }, Body: { Html: { Data: html }, Text: { Data: text } } } },
        EmailTags: [
          { Name: 'template', Value: intent.template },
          { Name: 'company', Value: event.companyId },
        ],
      }),
    );
  }
  return `sent:${to.length}`;
}

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const failures: SQSBatchResponse['batchItemFailures'] = [];
  for (const record of event.Records) {
    let body: PlatformEvent<{ email?: EmailIntent }> | undefined;
    try {
      body = JSON.parse(record.body);
      if (await alreadyProcessed(body!.id)) continue;
      const result = await send(body!);
      await markProcessed(body!.id, 'notifier');
      log('info', 'notified', { id: body!.id, type: body!.type, requestId: body!.requestId, result });
    } catch (err) {
      log('error', 'notify failed', { id: body?.id, requestId: body?.requestId, error: String(err) });
      failures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures: failures };
}
