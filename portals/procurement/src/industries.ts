// More industry templates, the sector each industry belongs to, and the libraries of common
// form fields and industry checks any company can add. Pure data, safe in client components.
import type { FieldType, FormField, IndustryOption, IndustryTemplate, OptionalStage } from './config';

const f = (id: string, label: string, type: FieldType = 'text', options = '', required = false): FormField => ({ id, label, type, options, required });
const flow = (o: Partial<Record<OptionalStage, boolean>> = {}): Record<OptionalStage, boolean> => ({
  stock_check: true,
  pr_approval: true,
  po_approval: true,
  receiving: true,
  inspection: true,
  invoice: true,
  ...o,
});

export const SECTORS = ['Construction', 'Engineering and fabrication', 'Energy and process', 'Manufacturing', 'Services and general'] as const;
export type Sector = (typeof SECTORS)[number];

/** Sector and one-line description for every industry (base and extra). */
export const INDUSTRY_INFO: Record<string, { sector: Sector; desc: string }> = {
  general: { sector: 'Services and general', desc: 'Simple requisitions for any business: department, cost centre, specification.' },
  fab: { sector: 'Engineering and fabrication', desc: 'Sections and plate by drawing, grade and heat number, with mill certificates.' },
  rebar: { sector: 'Construction', desc: 'Bar bending schedules, bar marks and shapes, weighbridge and test certificates.' },
  construction: { sector: 'Construction', desc: 'Materials by work package and zone, delivery windows and direct-to-site.' },
  mep: { sector: 'Engineering and fabrication', desc: 'Equipment by system and tag, submittal approval, serials and O&M documents.' },
  process: { sector: 'Energy and process', desc: 'Packages by WBS and discipline, vendor documents and third-party inspection.' },
  marine: { sector: 'Engineering and fabrication', desc: 'Hull and block materials, class society approval and certificates.' },
  oilgas: { sector: 'Energy and process', desc: 'Material specs by AFE and criticality, 3.2 certificates, PMI and witness tests.' },
  manufacturing: { sector: 'Manufacturing', desc: 'Parts by work order and drawing revision, batch tracking and first article checks.' },
  electrical: { sector: 'Engineering and fabrication', desc: 'Cable, switchgear and fittings by catalogue number, ratings and type tests.' },
  infra: { sector: 'Construction', desc: 'Earthworks, pavement and drainage by chainage, weighbridge and lab tests.' },
  precast: { sector: 'Construction', desc: 'Element schedules, casting beds and mix designs, with cube test results.' },
  fitout: { sector: 'Construction', desc: 'Finishes by floor and design package, sample approval before ordering.' },
  facilities: { sector: 'Services and general', desc: 'Spares and services by site, asset and maintenance type, asset tagging.' },
  it: { sector: 'Services and general', desc: 'Laptops, licences and office supplies by department, serials and warranty.' },
  health: { sector: 'Services and general', desc: 'Clinical and lab supplies by ward, batch and expiry, cold-chain checks.' },
};

/** Extra industry templates, merged into TEMPLATES in config.ts. */
export const MORE_TEMPLATES: Record<string, IndustryTemplate> = {
  marine: {
    name: 'Shipbuilding and marine',
    unit: 't',
    minQuotes: 2,
    flow: flow(),
    header: [f('hull', 'Hull / vessel no.', 'text', '', true), f('block', 'Block / zone'), f('classsoc', 'Class society', 'select', 'ABS,DNV,LR,BV,IRS,ClassNK'), f('classreq', 'Class approval required', 'check')],
    line: [f('mspec', 'Material spec', 'text', '', true), f('mgrade', 'Grade', 'select', 'A,B,AH36,DH36,EH36'), f('thk', 'Thickness (mm)', 'number'), f('heat', 'Heat no.')],
    options: [
      { id: 'classcert', label: 'Class certificate mandatory', desc: 'Receipts need the class society certificate for every heat.', on: true, docsRequired: true },
      { id: 'heat', label: 'Heat number traceability at receipt', desc: 'The storekeeper records the heat number of every line received.', on: true, receiptField: { where: 'line', label: 'Heat no.' } },
      { id: 'surveyor', label: 'Class surveyor witness', desc: 'QC confirms the class surveyor witnessed the inspection.', on: true, qcCheck: 'Class surveyor witnessed' },
    ],
  },
  oilgas: {
    name: 'Oil and gas',
    unit: 'nos',
    minQuotes: 3,
    flow: flow(),
    header: [f('facility', 'Field / facility', 'text', '', true), f('afe', 'AFE / cost code', 'text', '', true), f('ogdisc', 'Discipline', 'select', 'Mechanical,Piping,Electrical,Instrumentation,Civil,Process'), f('crit', 'Criticality', 'select', 'Critical,High,Normal')],
    line: [f('mesc', 'Material spec / MESC no.', 'text', '', true), f('tagno', 'Tag no.'), f('sizerating', 'Size / rating'), f('certtype', 'Material certificate', 'select', '2.2,3.1,3.2')],
    options: [
      { id: 'cert32', label: '3.2 material certificate mandatory', desc: 'Receipts need EN 10204 3.2 certificates.', on: true, docsRequired: true },
      { id: 'pmi', label: 'PMI at receipt', desc: 'The storekeeper records the positive material identification result per line.', on: true, receiptField: { where: 'line', label: 'PMI result' } },
      { id: 'tpi', label: 'Third-party inspection hold point', desc: 'QC confirms the third-party inspector witnessed the inspection.', on: true, qcCheck: 'Third-party inspector witnessed' },
      { id: 'vdr', label: 'Vendor document review before PO', desc: 'The buyer confirms vendor drawings and datasheets are accepted before issuing.', on: true, issueCheck: 'Vendor documents reviewed and accepted' },
    ],
  },
  manufacturing: {
    name: 'Manufacturing',
    unit: 'nos',
    minQuotes: 2,
    flow: flow(),
    header: [f('prodline', 'Production line / cell', 'select', 'Line 1,Line 2,Line 3,Assembly,Maintenance'), f('wo', 'Work order no.', 'text', '', true), f('planweek', 'Production plan week')],
    line: [f('partno', 'Part no.', 'text', '', true), f('drgrev', 'Drawing revision'), f('mat', 'Material'), f('suppart', 'Supplier part no.')],
    options: [
      { id: 'fai', label: 'First article inspection', desc: 'QC confirms the first article was checked against the drawing.', on: true, qcCheck: 'First article checked against drawing' },
      { id: 'lot', label: 'Batch / lot capture at receipt', desc: 'The storekeeper records the batch or lot number per line.', on: true, receiptField: { where: 'line', label: 'Batch / lot no.' } },
      { id: 'coc', label: 'Certificate of conformity mandatory', desc: 'Receipts need the supplier certificate of conformity.', on: true, docsRequired: true },
    ],
  },
  electrical: {
    name: 'Electrical contracting',
    unit: 'nos',
    minQuotes: 2,
    flow: flow(),
    header: [f('elpkg', 'Package', 'select', 'LV distribution,MV,Lighting,Earthing,Containment,Cabling'), f('sld', 'Drawing / SLD ref')],
    line: [f('make', 'Make'), f('catno', 'Catalogue no.', 'text', '', true), f('elrating', 'Rating'), f('ip', 'IP rating', 'select', 'IP20,IP44,IP54,IP65,IP66,IP67')],
    options: [
      { id: 'typetest', label: 'Type test certificate mandatory', desc: 'Receipts need type test certificates for switchgear and panels.', on: true, docsRequired: true },
      { id: 'serial', label: 'Serial number capture', desc: 'The storekeeper records serial numbers for each line at receipt.', on: true, receiptField: { where: 'line', label: 'Serial no(s).' } },
    ],
  },
  infra: {
    name: 'Infrastructure and roads',
    unit: 't',
    minQuotes: 2,
    flow: flow({ stock_check: false }),
    header: [f('chainage', 'Chainage / section', 'text', '', true), f('infrapkg', 'Work package', 'select', 'Earthworks,Pavement,Drainage,Structures,Utilities'), f('dloc', 'Delivery location')],
    line: [f('spec', 'Specification'), f('source', 'Source / quarry')],
    options: [
      { id: 'wb', label: 'Weighbridge check at receipt', desc: 'The storekeeper records the weighbridge weight of each delivery.', on: true, receiptField: { where: 'header', label: 'Weighbridge weight (t)' } },
      { id: 'labtest', label: 'Lab test results before acceptance', desc: 'QC confirms lab test results are acceptable.', on: true, qcCheck: 'Lab test results acceptable' },
    ],
  },
  precast: {
    name: 'Precast concrete',
    unit: 'nos',
    minQuotes: 2,
    flow: flow(),
    header: [f('elsched', 'Element schedule ref', 'text', '', true), f('bed', 'Casting bed', 'select', 'Bed 1,Bed 2,Bed 3,Bed 4'), f('pourdate', 'Planned pour date', 'date')],
    line: [f('elmark', 'Element mark'), f('mix', 'Mix design / grade'), f('dims', 'Dimensions')],
    options: [
      { id: 'cube', label: 'Cube test results', desc: 'QC confirms cube test results meet the mix design.', on: true, qcCheck: 'Cube test results meet the mix design' },
      { id: 'mtc', label: 'Mill test certificate mandatory', desc: 'Receipts of reinforcement and inserts need mill certificates.', on: true, docsRequired: true },
    ],
  },
  fitout: {
    name: 'Interior fit-out',
    unit: 'nos',
    minQuotes: 2,
    flow: flow({ inspection: false }),
    header: [f('floor', 'Floor / area'), f('dpkg', 'Design package', 'select', 'Ceilings,Partitions,Flooring,Joinery,Sanitary,Furniture'), f('sample', 'Sample approval received', 'check')],
    line: [f('finish', 'Finish / colour code'), f('brand', 'Brand / approved equal'), f('supcode', 'Supplier code')],
    options: [
      { id: 'sampleok', label: 'Sample approval before PO', desc: 'The buyer confirms the designer approved the sample before ordering.', on: true, issueCheck: 'Designer approved the sample' },
      { id: 'damage', label: 'Damage check at receipt', desc: 'The storekeeper notes any damage on delivery.', on: true, receiptField: { where: 'header', label: 'Damage notes' } },
    ],
  },
  facilities: {
    name: 'Facilities and maintenance',
    unit: 'nos',
    minQuotes: 1,
    flow: flow({ inspection: false }),
    header: [f('site', 'Site / building', 'text', '', true), f('asset', 'Asset / equipment'), f('mtype', 'Maintenance type', 'select', 'Preventive,Breakdown,Project'), f('wo', 'Work order no.')],
    line: [f('partno', 'Part no.'), f('makemodel', 'Make / model')],
    options: [{ id: 'assettag', label: 'Asset tag at receipt', desc: 'The storekeeper records the asset tag for equipment received.', on: true, receiptField: { where: 'line', label: 'Asset tag' } }],
  },
  it: {
    name: 'IT and office supplies',
    unit: 'nos',
    minQuotes: 2,
    flow: flow({ inspection: false }),
    header: [f('dept', 'Department', 'select', 'Operations,Engineering,Finance,HR,Admin,IT'), f('costcentre', 'Cost centre'), f('reqfor', 'Requested for (person)')],
    line: [f('make', 'Make'), f('model', 'Model'), f('spec', 'Specification')],
    options: [
      { id: 'serial', label: 'Serial number capture', desc: 'The storekeeper records serial numbers for each line at receipt.', on: true, receiptField: { where: 'line', label: 'Serial no(s).' } },
      { id: 'warranty', label: 'Warranty documents at receipt', desc: 'Receipts need warranty certificates.', on: true, docsRequired: true },
    ],
  },
  health: {
    name: 'Healthcare and lab supplies',
    unit: 'nos',
    minQuotes: 2,
    flow: flow(),
    header: [f('ward', 'Department / ward', 'select', 'Pharmacy,Laboratory,Theatre,ICU,Wards,Radiology'), f('clinical', 'Clinical approval received', 'check')],
    line: [f('catno', 'Catalogue no.', 'text', '', true), f('pack', 'Pack size'), f('storage', 'Storage', 'select', 'Room temperature,2 to 8 °C,Frozen')],
    options: [
      { id: 'batchexp', label: 'Batch and expiry capture', desc: 'The storekeeper records batch and expiry for each line.', on: true, receiptField: { where: 'line', label: 'Batch / expiry' } },
      { id: 'coldchain', label: 'Cold-chain temperature at receipt', desc: 'The storekeeper records the temperature on arrival.', on: true, receiptField: { where: 'header', label: 'Temperature on arrival (°C)' } },
      { id: 'coa', label: 'Certificate of analysis mandatory', desc: 'Receipts need the certificate of analysis.', on: true, docsRequired: true },
    ],
  },
};

/** Common fields the admin can add to any form in one click. */
export const FIELD_LIBRARY: { header: FormField[]; line: FormField[] } = {
  header: [
    f('dwgref', 'Drawing ref'),
    f('rev', 'Revision'),
    f('wbs', 'WBS code'),
    f('costcentre', 'Cost centre'),
    f('wo', 'Work order no.'),
    f('budget', 'Budget code'),
    f('package', 'Package'),
    f('discipline', 'Discipline', 'select', 'Civil,Structural,Mechanical,Electrical,Piping,Instrumentation'),
    f('dloc', 'Delivery location'),
    f('dwin', 'Delivery window', 'select', 'Morning,Afternoon,Night shift'),
    f('contact', 'Site contact'),
    f('certs', 'Certificates required', 'check'),
    f('inspreq', 'Inspection required', 'check'),
  ],
  line: [
    f('spec', 'Specification'),
    f('grade', 'Grade'),
    f('size', 'Size'),
    f('make', 'Make'),
    f('model', 'Model'),
    f('partno', 'Part / catalogue no.'),
    f('heat', 'Heat no.'),
    f('serialno', 'Serial no.'),
    f('tagno', 'Tag no.'),
    f('finish', 'Colour / finish'),
    f('linedwg', 'Drawing ref'),
    f('reqdate', 'Required date', 'date'),
  ],
};

/** Every industry check from every template, so any company can switch on any of them. */
export function checkLibrary(all: Record<string, IndustryTemplate>): (IndustryOption & { from: string })[] {
  const out: (IndustryOption & { from: string })[] = [];
  for (const t of Object.values(all)) for (const o of t.options) if (!out.some((x) => x.id === o.id)) out.push({ ...o, from: t.name });
  return out;
}
