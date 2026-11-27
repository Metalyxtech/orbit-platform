// Indian GST helpers: the state a GSTIN belongs to (its first two digits), and whether a sale or
// purchase is within the state (CGST + SGST) or between states (IGST).

/** GST state code -> [two-letter code used by Zoho Books, state name]. */
export const GST_STATES: Record<string, [string, string]> = {
  '01': ['JK', 'Jammu and Kashmir'],
  '02': ['HP', 'Himachal Pradesh'],
  '03': ['PB', 'Punjab'],
  '04': ['CH', 'Chandigarh'],
  '05': ['UT', 'Uttarakhand'],
  '06': ['HR', 'Haryana'],
  '07': ['DL', 'Delhi'],
  '08': ['RJ', 'Rajasthan'],
  '09': ['UP', 'Uttar Pradesh'],
  '10': ['BR', 'Bihar'],
  '11': ['SK', 'Sikkim'],
  '12': ['AR', 'Arunachal Pradesh'],
  '13': ['NL', 'Nagaland'],
  '14': ['MN', 'Manipur'],
  '15': ['MZ', 'Mizoram'],
  '16': ['TR', 'Tripura'],
  '17': ['ML', 'Meghalaya'],
  '18': ['AS', 'Assam'],
  '19': ['WB', 'West Bengal'],
  '20': ['JH', 'Jharkhand'],
  '21': ['OR', 'Odisha'],
  '22': ['CG', 'Chhattisgarh'],
  '23': ['MP', 'Madhya Pradesh'],
  '24': ['GJ', 'Gujarat'],
  '26': ['DN', 'Dadra and Nagar Haveli and Daman and Diu'],
  '27': ['MH', 'Maharashtra'],
  '29': ['KA', 'Karnataka'],
  '30': ['GA', 'Goa'],
  '31': ['LD', 'Lakshadweep'],
  '32': ['KL', 'Kerala'],
  '33': ['TN', 'Tamil Nadu'],
  '34': ['PY', 'Puducherry'],
  '35': ['AN', 'Andaman and Nicobar Islands'],
  '36': ['TS', 'Telangana'],
  '37': ['AD', 'Andhra Pradesh'],
  '38': ['LA', 'Ladakh'],
};

export const GSTIN_RE = /^[0-9]{2}[A-Z0-9]{13}$/;
export const stateOf = (gstin: string | null | undefined) => (gstin && GSTIN_RE.test(gstin.trim().toUpperCase()) ? gstin.trim().slice(0, 2) : null);

/** Same state (or either side unknown) -> CGST + SGST; different states -> IGST. */
export function isInterState(ours: string | null | undefined, theirs: string | null | undefined) {
  const a = stateOf(ours);
  const b = stateOf(theirs);
  return !!a && !!b && a !== b;
}
