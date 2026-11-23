// Trade forms: for each trade, the work-order fields, the default operations (routing, with the
// ones QC must inspect), the QC checklist per inspection and the final inspection checklist.
// Pure data, safe in client components. Add a trade here; nothing else needs to change.

export type FieldType = 'text' | 'number' | 'select' | 'date';
export interface TradeField {
  id: string;
  label: string;
  type: FieldType;
  options?: string[];
  unit?: string;
  required?: boolean;
  help?: string;
}
export interface TradeOperation {
  name: string;
  /** QC inspects this operation before the next one counts as done. */
  qc?: boolean;
}
export interface Trade {
  id: string;
  name: string;
  detail: string;
  /** Default unit for the work order quantity. */
  unit: string;
  units: string[];
  fields: TradeField[];
  operations: TradeOperation[];
  /** Checklist QC uses for each inspected operation. */
  checklist: string[];
  /** Checklist for the final inspection before dispatch. */
  finalChecklist: string[];
  /** Typical materials, offered when building the bill of materials. */
  materials: string[];
}

const FINAL_COMMON = ['Quantity matches the work order', 'Identification / marking done', 'Documents and test certificates attached', 'Packing / protection for transport'];

export const TRADES: Trade[] = [
  {
    id: 'steel',
    name: 'Structural steel fabrication',
    detail: 'Beams, columns, trusses, PEB, platforms',
    unit: 'MT',
    units: ['MT', 'kg', 'nos'],
    fields: [
      { id: 'drawing', label: 'Drawing number / revision', type: 'text', required: true },
      { id: 'steel', label: 'Steel grade', type: 'select', options: ['E250 (IS 2062)', 'E350', 'S275', 'S355', 'A36', 'A572 Gr 50'] },
      { id: 'weld', label: 'Welding process', type: 'select', options: ['SMAW', 'MIG/MAG (GMAW)', 'SAW', 'FCAW'] },
      { id: 'surface', label: 'Surface preparation', type: 'select', options: ['SA 2.5 blasting', 'SA 2', 'Power tool cleaning', 'None'] },
      { id: 'paint', label: 'Paint system', type: 'text', help: 'e.g. Zinc primer 75µ + PU 50µ' },
      { id: 'erection', label: 'Erection by us', type: 'select', options: ['No', 'Yes'] },
    ],
    operations: [{ name: 'Cutting' }, { name: 'Drilling / punching' }, { name: 'Fit-up', qc: true }, { name: 'Welding', qc: true }, { name: 'Blasting / surface prep', qc: true }, { name: 'Painting', qc: true }],
    checklist: ['Dimensions within tolerance', 'Weld size and profile as per drawing', 'No visible weld defects (cracks, porosity, undercut)', 'Hole positions and sizes', 'Surface profile / DFT readings recorded'],
    finalChecklist: ['Overall dimensions and camber', 'Paint DFT within spec', 'Member marks match the drawing', ...FINAL_COMMON],
    materials: ['ISMB / UB beams', 'ISMC channels', 'Angles', 'Plates', 'HSFG / MS bolts', 'Welding electrodes / wire', 'Primer', 'Finish paint'],
  },
  {
    id: 'piping',
    name: 'Piping & spool fabrication',
    detail: 'Process piping spools, headers, supports',
    unit: 'inch-dia',
    units: ['inch-dia', 'spools', 'm', 'nos'],
    fields: [
      { id: 'iso', label: 'Isometric / line number', type: 'text', required: true },
      { id: 'material', label: 'Pipe material', type: 'select', options: ['CS A106 Gr B', 'SS 304/304L', 'SS 316/316L', 'Alloy P11/P22', 'Duplex', 'GI'] },
      { id: 'schedule', label: 'Schedule', type: 'select', options: ['SCH 10', 'SCH 40', 'SCH 80', 'SCH 160', 'XS'] },
      { id: 'wps', label: 'WPS number', type: 'text' },
      { id: 'ndt', label: 'NDT required', type: 'select', options: ['None', 'RT 10%', 'RT 100%', 'UT', 'DP / MPI'] },
      { id: 'test', label: 'Pressure test', type: 'select', options: ['Hydro test', 'Pneumatic test', 'Not required'] },
    ],
    operations: [{ name: 'Cutting & bevelling' }, { name: 'Fit-up', qc: true }, { name: 'Welding', qc: true }, { name: 'NDT', qc: true }, { name: 'Hydro test', qc: true }, { name: 'Painting / pickling' }],
    checklist: ['Fit-up gap and alignment', 'Welder ID marked on joint', 'Visual weld inspection', 'NDT report reviewed', 'Test pressure held for the set time'],
    finalChecklist: ['Spool number and heat number traceable', 'Flange faces protected', 'Open ends capped', ...FINAL_COMMON],
    materials: ['Pipes', 'Elbows', 'Tees', 'Reducers', 'Flanges', 'Gaskets', 'Stud bolts', 'Filler wire / rods'],
  },
  {
    id: 'sheetmetal',
    name: 'Sheet metal',
    detail: 'Enclosures, trays, covers, brackets',
    unit: 'nos',
    units: ['nos', 'sets', 'kg'],
    fields: [
      { id: 'drawing', label: 'Drawing number / revision', type: 'text', required: true },
      { id: 'material', label: 'Material', type: 'select', options: ['CRCA', 'GI', 'SS 304', 'Aluminium', 'HR sheet'] },
      { id: 'thickness', label: 'Thickness', type: 'number', unit: 'mm' },
      { id: 'finish', label: 'Finish', type: 'select', options: ['Powder coat', 'Galvanised', 'Brushed', 'Painted', 'None'] },
      { id: 'colour', label: 'Colour / shade', type: 'text' },
    ],
    operations: [{ name: 'Laser / shearing' }, { name: 'Punching' }, { name: 'Bending', qc: true }, { name: 'Welding / riveting' }, { name: 'Powder coating', qc: true }, { name: 'Assembly' }],
    checklist: ['Bend angles and flange lengths', 'Hole and cut-out positions', 'Burr-free edges', 'Coating thickness and adhesion'],
    finalChecklist: ['Fit with mating parts', 'Shade matches approved sample', ...FINAL_COMMON],
    materials: ['Sheets', 'Fasteners', 'Rivets', 'Hinges / locks', 'Powder', 'Gaskets'],
  },
  {
    id: 'machining',
    name: 'Machining / CNC',
    detail: 'Turned and milled parts, shafts, flanges',
    unit: 'nos',
    units: ['nos', 'sets'],
    fields: [
      { id: 'drawing', label: 'Drawing number / revision', type: 'text', required: true },
      { id: 'material', label: 'Material', type: 'select', options: ['EN8', 'EN19', 'EN24', 'MS', 'SS 304', 'SS 316', 'Aluminium 6061', 'Brass', 'Cast iron'] },
      { id: 'tolerance', label: 'General tolerance', type: 'select', options: ['ISO 2768-m', 'ISO 2768-f', '±0.05 mm', '±0.01 mm'] },
      { id: 'heat', label: 'Heat treatment', type: 'select', options: ['None', 'Hardening & tempering', 'Case hardening', 'Induction hardening', 'Stress relieving'] },
      { id: 'surface', label: 'Surface finish (Ra)', type: 'text', help: 'e.g. Ra 1.6' },
    ],
    operations: [{ name: 'Raw material cutting' }, { name: 'Turning' }, { name: 'Milling / VMC', qc: true }, { name: 'Drilling / tapping' }, { name: 'Heat treatment', qc: true }, { name: 'Grinding', qc: true }],
    checklist: ['Critical dimensions measured', 'Threads gauged (go / no-go)', 'Surface finish', 'Hardness after heat treatment'],
    finalChecklist: ['First-article / sample report attached', 'Rust preventive applied', ...FINAL_COMMON],
    materials: ['Round bar', 'Flat bar', 'Forgings / castings', 'Inserts / tools', 'Coolant'],
  },
  {
    id: 'welding',
    name: 'Welding & general fabrication',
    detail: 'Frames, tanks, skids, structures',
    unit: 'nos',
    units: ['nos', 'kg', 'MT'],
    fields: [
      { id: 'drawing', label: 'Drawing number / revision', type: 'text', required: true },
      { id: 'material', label: 'Material', type: 'select', options: ['MS', 'SS 304', 'SS 316', 'Aluminium'] },
      { id: 'process', label: 'Welding process', type: 'select', options: ['SMAW', 'MIG', 'TIG', 'SAW'] },
      { id: 'wps', label: 'WPS / PQR', type: 'text' },
      { id: 'leak', label: 'Leak test', type: 'select', options: ['Not required', 'Water fill', 'Air / soap', 'DP test'] },
    ],
    operations: [{ name: 'Cutting' }, { name: 'Fit-up', qc: true }, { name: 'Welding', qc: true }, { name: 'Grinding & finishing' }, { name: 'Leak / load test', qc: true }, { name: 'Painting' }],
    checklist: ['Fit-up as per drawing', 'Weld visual inspection', 'Distortion within limits', 'Test result recorded'],
    finalChecklist: ['Lifting points and nameplate fitted', ...FINAL_COMMON],
    materials: ['Plates', 'Sections', 'Pipes', 'Electrodes / wire', 'Shielding gas', 'Paint'],
  },
  {
    id: 'painting',
    name: 'Painting & coating',
    detail: 'Blasting, painting, galvanising, powder coating',
    unit: 'm²',
    units: ['m²', 'MT', 'nos'],
    fields: [
      { id: 'surface', label: 'Surface preparation', type: 'select', options: ['SA 2.5', 'SA 3', 'SA 2', 'ST 3', 'Degreasing'] },
      { id: 'system', label: 'Paint system', type: 'text', required: true, help: 'Primer / intermediate / finish' },
      { id: 'dft', label: 'Total DFT', type: 'number', unit: 'µm' },
      { id: 'shade', label: 'Shade (RAL / IS)', type: 'text' },
    ],
    operations: [{ name: 'Surface preparation', qc: true }, { name: 'Primer', qc: true }, { name: 'Intermediate coat' }, { name: 'Finish coat', qc: true }],
    checklist: ['Surface profile (µm)', 'Humidity and dew point OK', 'Wet / dry film thickness', 'No runs, sags or pinholes'],
    finalChecklist: ['Total DFT and adhesion test', 'Shade matches', ...FINAL_COMMON],
    materials: ['Abrasive (grit / shot)', 'Primer', 'Intermediate paint', 'Finish paint', 'Thinner'],
  },
  {
    id: 'electrical',
    name: 'Electrical panels',
    detail: 'LT panels, MCC, PCC, distribution boards',
    unit: 'nos',
    units: ['nos', 'sets'],
    fields: [
      { id: 'sld', label: 'SLD / GA drawing number', type: 'text', required: true },
      { id: 'type', label: 'Panel type', type: 'select', options: ['PCC', 'MCC', 'APFC', 'Distribution board', 'Control panel', 'VFD panel'] },
      { id: 'rating', label: 'Busbar rating', type: 'number', unit: 'A' },
      { id: 'ip', label: 'IP rating', type: 'select', options: ['IP42', 'IP54', 'IP55', 'IP65'] },
      { id: 'form', label: 'Form of separation', type: 'select', options: ['Form 1', 'Form 2', 'Form 3b', 'Form 4b'] },
    ],
    operations: [{ name: 'Enclosure fabrication' }, { name: 'Powder coating' }, { name: 'Busbar & component mounting', qc: true }, { name: 'Wiring', qc: true }, { name: 'Testing (IR / HV / function)', qc: true }],
    checklist: ['Components as per BOM and SLD', 'Torque marking on terminations', 'Ferruling and wire colours', 'IR / HV test values recorded'],
    finalChecklist: ['Customer FAT done or waived', 'Drawings and test reports in the panel pocket', ...FINAL_COMMON],
    materials: ['Enclosure sheets', 'Busbars', 'Breakers (ACB / MCCB / MCB)', 'Contactors / relays', 'Cables and lugs', 'Meters'],
  },
  {
    id: 'hvac',
    name: 'HVAC ducting',
    detail: 'GI ducts, fittings, dampers',
    unit: 'm²',
    units: ['m²', 'kg', 'nos'],
    fields: [
      { id: 'drawing', label: 'Duct layout drawing', type: 'text', required: true },
      { id: 'gauge', label: 'Sheet gauge', type: 'select', options: ['26 G', '24 G', '22 G', '20 G', '18 G'] },
      { id: 'class', label: 'Pressure class', type: 'select', options: ['Low', 'Medium', 'High'] },
      { id: 'insulation', label: 'Insulation', type: 'select', options: ['None', 'Nitrile 13 mm', 'Nitrile 19 mm', 'Glass wool'] },
    ],
    operations: [{ name: 'Sheet cutting' }, { name: 'Forming & seaming', qc: true }, { name: 'Flanging' }, { name: 'Sealing', qc: true }, { name: 'Insulation' }],
    checklist: ['Duct sizes as per drawing', 'Seams and joints sealed', 'Gauge as specified', 'Leak test where required'],
    finalChecklist: ['Duct pieces numbered to the layout', ...FINAL_COMMON],
    materials: ['GI sheets', 'Angles / TDF flanges', 'Sealant', 'Insulation', 'Dampers', 'Fasteners'],
  },
  {
    id: 'precast',
    name: 'Precast concrete',
    detail: 'Slabs, beams, walls, kerbs, pipes',
    unit: 'nos',
    units: ['nos', 'm³', 'm'],
    fields: [
      { id: 'drawing', label: 'Element drawing / mark', type: 'text', required: true },
      { id: 'grade', label: 'Concrete grade', type: 'select', options: ['M25', 'M30', 'M35', 'M40', 'M50'] },
      { id: 'steel', label: 'Reinforcement', type: 'select', options: ['Fe500', 'Fe500D', 'Fe550', 'Pre-stressed strand'] },
      { id: 'curing', label: 'Curing', type: 'select', options: ['Water', 'Steam', 'Membrane'] },
    ],
    operations: [{ name: 'Mould preparation' }, { name: 'Reinforcement cage', qc: true }, { name: 'Casting', qc: true }, { name: 'Curing' }, { name: 'De-moulding & finishing', qc: true }],
    checklist: ['Cover blocks and cage dimensions', 'Slump and cube samples taken', 'Element dimensions', 'Surface finish / honeycombing'],
    finalChecklist: ['Cube strength (7 / 28 day) OK', 'Lifting inserts checked', ...FINAL_COMMON],
    materials: ['Cement', 'Aggregates', 'Sand', 'Rebar', 'Admixture', 'Inserts'],
  },
  {
    id: 'joinery',
    name: 'Joinery & woodwork',
    detail: 'Doors, furniture, panelling, cabinets',
    unit: 'nos',
    units: ['nos', 'sets', 'm²'],
    fields: [
      { id: 'drawing', label: 'Shop drawing / design ref', type: 'text', required: true },
      { id: 'board', label: 'Board / timber', type: 'select', options: ['Plywood BWP', 'MDF', 'Particle board', 'Teak', 'Rubber wood', 'HDHMR'] },
      { id: 'finish', label: 'Finish', type: 'select', options: ['Laminate', 'Veneer + PU', 'Paint', 'Melamine', 'Lacquer'] },
      { id: 'hardware', label: 'Hardware brand', type: 'text' },
    ],
    operations: [{ name: 'Cutting / panel saw' }, { name: 'Edge banding' }, { name: 'CNC / boring' }, { name: 'Assembly', qc: true }, { name: 'Polishing / finishing', qc: true }],
    checklist: ['Dimensions and squareness', 'Edge banding and joints', 'Hardware fitted and working', 'Finish without scratches'],
    finalChecklist: ['Packed with corner protection', ...FINAL_COMMON],
    materials: ['Boards', 'Laminates / veneer', 'Edge band', 'Hinges / channels', 'Adhesive', 'Polish'],
  },
  {
    id: 'facade',
    name: 'Aluminium & glazing',
    detail: 'Windows, doors, curtain wall, partitions',
    unit: 'm²',
    units: ['m²', 'nos', 'sets'],
    fields: [
      { id: 'drawing', label: 'Shop drawing / window schedule', type: 'text', required: true },
      { id: 'system', label: 'Profile system', type: 'text' },
      { id: 'glass', label: 'Glass', type: 'select', options: ['6 mm clear', '6 mm toughened', 'DGU 6-12-6', 'Laminated 6.38', 'Reflective'] },
      { id: 'finish', label: 'Profile finish', type: 'select', options: ['Powder coat', 'Anodised', 'Wood finish'] },
    ],
    operations: [{ name: 'Profile cutting' }, { name: 'Machining / punching' }, { name: 'Frame assembly', qc: true }, { name: 'Glazing', qc: true }, { name: 'Sealing & hardware' }],
    checklist: ['Frame sizes and diagonals', 'Corner joints sealed', 'Glass type and thickness', 'Hardware operation'],
    finalChecklist: ['Protective film intact', ...FINAL_COMMON],
    materials: ['Aluminium profiles', 'Glass', 'Gaskets', 'Hardware', 'Silicone sealant', 'Screws'],
  },
  {
    id: 'general',
    name: 'General manufacturing',
    detail: 'Any product: set your own fields and steps',
    unit: 'nos',
    units: ['nos', 'sets', 'kg', 'MT', 'm', 'm²', 'lot'],
    fields: [
      { id: 'drawing', label: 'Drawing / specification', type: 'text' },
      { id: 'material', label: 'Main material', type: 'text' },
      { id: 'standard', label: 'Standard / customer spec', type: 'text' },
    ],
    operations: [{ name: 'Preparation' }, { name: 'Processing', qc: true }, { name: 'Assembly', qc: true }, { name: 'Finishing' }],
    checklist: ['As per drawing / specification', 'Workmanship acceptable', 'Measurements recorded'],
    finalChecklist: FINAL_COMMON,
    materials: [],
  },
];

export const tradeOf = (id: string) => TRADES.find((t) => t.id === id) ?? TRADES[TRADES.length - 1];
