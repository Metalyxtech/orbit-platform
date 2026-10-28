import { describe, expect, it } from 'vitest';
import { guardRecipients } from '../notifier';
import { renderContent } from '../notifier/templates';

describe('sandbox email guard', () => {
  it('passes everyone for pilot and live companies', () => {
    expect(guardRecipients(['a@x.com', 'b@y.com'], 'live', '')).toEqual(['a@x.com', 'b@y.com']);
  });
  it('only allows listed testers for sandbox companies', () => {
    expect(guardRecipients(['a@x.com', 'b@y.com', 'C@Test.com'], 'sandbox', 'b@y.com, *@test.com')).toEqual(['b@y.com', 'C@Test.com']);
  });
  it('blocks all sandbox mail with an empty allowlist', () => {
    expect(guardRecipients(['a@x.com'], 'sandbox', '')).toEqual([]);
  });
});

describe('templates', () => {
  it('builds a subject for every template', () => {
    expect(renderContent('task_created', { employeeName: 'Joseph Thomas', week: 44, totalHours: 59, overtimeHours: 11 }).subject).toBe(
      'Timesheet to approve: Joseph Thomas, week 44',
    );
  });
});
