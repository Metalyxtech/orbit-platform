// Section 11.2: use this exact wording.
export const messages = {
  cellOver24: "A day can't be more than 24.0 h.",
  missingCostCode: 'Choose a cost code for every row, or remove the empty row.',
  noteRequired: (hours: number) =>
    `Add a note for days over ${hours.toFixed(1)} h, so your approver knows why.`,
  submitted: (week: number, approver: string) => `Week ${week} submitted. ${approver} will review it.`,
  returnedBanner: (by: string, comment: string) =>
    `Returned by ${by}: ${comment}. Fix the week and submit it again.`,
  lockedWeek: 'This week is approved and locked. Request a correction if something is wrong.',
  offline: "You're offline. Changes are saved on this device and will sync.",
  emptyApprovals: 'Nothing is waiting for you. New timesheets will appear here.',
  serverError: "Couldn't save. Your changes are kept here; we'll retry in a few seconds.",
} as const;
