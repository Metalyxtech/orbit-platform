import { describe, expect, it } from 'vitest';
import { simulate, type ApproverResolver, type WorkflowDefinition } from '../src/workflow';
import { signBody, verifySignature } from '../src/hmac';

const def: WorkflowDefinition = {
  steps: [
    { id: 's', name: 'Supervisor', approver: { type: 'supervisor' }, slaHours: 24 },
    {
      id: 'pm',
      name: 'Project managers',
      approver: { type: 'project_managers' },
      when: { any: [{ field: 'overtimeHours', op: 'gt', value: 6 }, { field: 'maxDayHours', op: 'gt', value: 12 }] },
      reason: 'Because overtime > 6.0 h',
      slaHours: 24,
    },
  ],
};

const resolver: ApproverResolver = {
  async resolve(rule) {
    return rule.type === 'supervisor'
      ? [{ membershipId: 'rm', name: 'Rahul Menon' }]
      : [{ membershipId: 'ag', name: 'Anita George' }, { membershipId: 'vs', name: 'Vivek Shenoy' }];
  },
};

describe('workflow.simulate', () => {
  it('adds the PM step when overtime is above 6 h', async () => {
    const route = await simulate(def, { submitterId: 'jt', overtimeHours: 11, maxDayHours: 11.5 }, resolver);
    expect(route.map((r) => r.name)).toEqual(['Supervisor', 'Project managers']);
    expect(route[1].approvers).toHaveLength(2);
    expect(route[1].reason).toBe('Because overtime > 6.0 h');
  });
  it('stops at the supervisor without overtime', async () => {
    const route = await simulate(def, { submitterId: 'jt', overtimeHours: 0, maxDayHours: 9.6 }, resolver);
    expect(route.map((r) => r.name)).toEqual(['Supervisor']);
  });
  it('adds the PM step for a day above 12 h', async () => {
    const route = await simulate(def, { submitterId: 'jt', overtimeHours: 1, maxDayHours: 12.5 }, resolver);
    expect(route).toHaveLength(2);
  });
});

describe('hmac', () => {
  it('verifies its own signature and rejects tampering', () => {
    const sig = signBody('s3cret', '{"a":1}');
    expect(verifySignature('s3cret', '{"a":1}', sig)).toBe(true);
    expect(verifySignature('s3cret', '{"a":2}', sig)).toBe(false);
    expect(verifySignature('other', '{"a":1}', sig)).toBe(false);
  });
  it('rejects old signatures', () => {
    const sig = signBody('s3cret', 'x', Math.floor(Date.now() / 1000) - 3600);
    expect(verifySignature('s3cret', 'x', sig)).toBe(false);
  });
});
