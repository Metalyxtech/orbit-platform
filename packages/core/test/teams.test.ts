import { describe, expect, it } from 'vitest';
import { canManageTeams } from '../src/teams';

describe('project teams', () => {
  it('lets only the GM and company admins set up teams (they also see every project)', () => {
    expect(canManageTeams({ role: 'management' })).toBe(true);
    expect(canManageTeams({ role: 'company_admin' })).toBe(true);
    expect(canManageTeams({ role: 'project_manager' })).toBe(false);
    expect(canManageTeams({ role: 'supervisor' })).toBe(false);
  });
});
