import { describe, expect, it } from 'vitest';
import { hoursBetween, QC_ROLES, QC_STATUS, SOURCES } from './config';
import { qualityManifest } from './manifest';

describe('quality config', () => {
  it('has the QC roles, with QC engineers inspecting and the QC manager approving', () => {
    expect(QC_ROLES.map((r) => r.id)).toEqual(['inspector', 'manager', 'gm', 'admin']);
  });
  it('labels every status and source', () => {
    expect(Object.keys(QC_STATUS)).toEqual(['pending', 'submitted', 'approved', 'cancelled']);
    expect(Object.keys(SOURCES)).toEqual(['purchase', 'production', 'store']);
  });
  it('defaults company admins to admin, management to GM, others to inspector', () => {
    expect(qualityManifest.defaultPortalRole?.('company_admin')).toBe('admin');
    expect(qualityManifest.defaultPortalRole?.('management')).toBe('gm');
    expect(qualityManifest.defaultPortalRole?.('employee')).toBe('inspector');
  });
  it('measures turnaround in hours', () => {
    expect(hoursBetween('2026-11-01T00:00:00Z', '2026-11-02T06:00:00Z')).toBe(30);
  });
});
