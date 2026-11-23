// Shapes shared by the Timesheet admin screens.

export type Values = Record<string, unknown>;
export type WorkflowOption = { id: string; name: string; description: string | null; steps: string[]; custom: boolean };
export type Member = { membershipId: string; name: string; role: string; title: string | null };
export type CostCodeRow = { id: string; code: string; name: string; active: boolean };
export type ProjectRow = { id: string; code: string; name: string; pm: string; pmId: string | null; status: string; costCodes: number; codes: CostCodeRow[] };
export type Manager = { membershipId: string; name: string; role: string };
export type Mode = 'default' | 'skip' | 'supervisor' | 'project_managers' | 'role' | 'person';
export type CellRole = 'supervisor' | 'project_manager' | 'company_admin' | 'management';
export type Cell = { mode: Mode; role: CellRole; membershipId: string };
export type Level = { key: number; name: string; conditional: boolean; overtimeAbove: number; slaHours: number };
export type MatrixRow = { key: number; membershipId: string; cells: Cell[] };
export type UserRow = { membershipId: string; name: string; email: string; role: string; title: string | null; status: string; supervisorId: string | null };
export type CorrectionRow = { id: string; employee: string; week: number; reason: string; createdAt: string };
export type PortalAccess = {
  company: { portal: string; enabled: boolean }[];
  rows: { membershipId: string; portal: string; status: 'requested' | 'active' | 'off' }[];
};
