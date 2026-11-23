import { describe, expect, it } from 'vitest';
import { canControl, CONTROLLED, isControlled } from '../src/holds';

describe('GM process control', () => {
  it('lets only the GM (management) and company admins stop or resume', () => {
    expect(canControl({ role: 'management' })).toBe(true);
    expect(canControl({ role: 'company_admin' })).toBe(true);
    expect(canControl({ role: 'project_manager' })).toBe(false);
    expect(canControl({ role: 'employee' })).toBe(false);
  });
  it('covers each portal process and nothing else', () => {
    expect(Object.keys(CONTROLLED)).toEqual(['proc_request', 'work_order', 'mat_request', 'qc_inspection', 'sales_enquiry']);
    expect(isControlled('work_order')).toBe(true);
    expect(isControlled('timesheets')).toBe(false);
  });
});
