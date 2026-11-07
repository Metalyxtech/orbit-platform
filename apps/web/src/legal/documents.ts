// Orbit's Terms and Conditions and Privacy Policy. Edit the text here only.
// When you change a document in a way people must agree to again, change its `version`:
// everyone is asked to sign the new version the next time they open Orbit.
// Safe to import from client components. Have a lawyer review before relying on this text.

export type LegalDoc = 'terms' | 'privacy';
// ---- Fill these in before real customers sign (empty values are left out of the text). ----
/** Registered legal name, e.g. "Metalyxtech Private Limited". */
export const LEGAL_PROVIDER = 'Metalyxtech';
/** Email for legal, privacy and account questions. */
export const LEGAL_CONTACT = 'sales@metalyxtech.com';
/** Registered office address. */
export const LEGAL_ADDRESS = '';
/** GSTIN, shown so Indian customers can claim input tax credit. */
export const LEGAL_GSTIN = '';
/** City whose courts handle disputes, e.g. "Kochi". */
export const LEGAL_CITY = '';
// -------------------------------------------------------------------------------------------

const office = [LEGAL_ADDRESS && `Registered office: ${LEGAL_ADDRESS}.`, LEGAL_GSTIN && `GSTIN: ${LEGAL_GSTIN}.`].filter(Boolean).join(' ');

export interface LegalDocument {
  id: LegalDoc;
  title: string;
  version: string;
  effective: string;
  intro: string;
  sections: { heading: string; body: string[] }[];
}

export const TERMS: LegalDocument = {
  id: 'terms',
  title: 'Terms and Conditions',
  version: '2026-11-06',
  effective: '6 November 2026',
  intro: `These Terms and Conditions ("Terms") govern the use of Orbit, the timesheet and purchase platform provided by ${LEGAL_PROVIDER} ("Orbit", "we", "us"). By signing below you agree to these Terms. A company admin who signs also accepts them on behalf of their company ("Customer").`,
  sections: [
    {
      heading: '1. The service',
      body: [
        'Orbit provides online portals for timesheets, purchasing and related approvals, reports and notifications, together with the Management workspace and Company admin tools (the "Service").',
        'We may improve or change features from time to time. We will not remove a core feature of a paid plan during a paid period without notice.',
      ],
    },
    {
      heading: '2. Accounts and access',
      body: [
        'Each person signs in with their own account and must keep their sign-in details private. Accounts must not be shared.',
        'The Customer\'s company admin decides who may use the Service, which portals and roles they have, and removes people who leave. The Customer is responsible for the actions of everyone it gives access to.',
        'Tell us straight away at ' + LEGAL_CONTACT + ' if you believe an account has been misused.',
      ],
    },
    {
      heading: '3. Customer data',
      body: [
        'Timesheets, purchase records, documents and other information entered into Orbit belong to the Customer ("Customer Data"). We use Customer Data only to provide, secure and support the Service, as described in the Privacy Policy.',
        'The Customer is responsible for the accuracy and lawfulness of Customer Data and for having the right to enter personal information about its staff, suppliers and contacts.',
        'Each company\'s data is kept separate from every other company\'s data.',
      ],
    },
    {
      heading: '4. Acceptable use',
      body: [
        'Do not use the Service for anything unlawful, to upload malicious code, to try to access another company\'s data, to overload or probe the Service, or to resell it without our written agreement.',
        'We may suspend access that puts the Service, other customers or their data at risk, and will tell the Customer why.',
      ],
    },
    {
      heading: '5. Free trial, plans and payment',
      body: [
        'New companies get a free trial for the period shown in Plan and billing. After the trial, continued use needs a paid plan, unless Orbit has arranged the plan directly with the Customer.',
        'Plans are billed in advance for the chosen cycle (monthly, quarterly, half-yearly or yearly) through our payment provider, Razorpay. Indian customers are billed in Indian rupees plus GST; customers outside India are billed in US dollars. Prices are shown before payment.',
        'When a plan starts after a trial, the payment provider may take a small refundable amount to confirm the payment method.',
        'Subscriptions renew automatically until cancelled. The company admin can cancel at any time in Plan and billing; the plan then stays active until the end of the paid period and does not renew. Fees already paid are not refundable, except where the law requires or Orbit agrees in writing.',
        'If a payment fails and is not resolved, we may limit the Service to read-only access until it is paid.',
      ],
    },
    {
      heading: '6. Availability and support',
      body: [
        'We work to keep the Service available and secure, including regular backups, but we do not promise it will be uninterrupted or error-free. Planned maintenance will be kept short and, where possible, outside working hours.',
        'Support is provided by email and, on higher plans, by the channels listed on the pricing page.',
      ],
    },
    {
      heading: '7. Intellectual property',
      body: [
        'Orbit, its software, design and documentation belong to ' + LEGAL_PROVIDER + '. The Customer receives a non-exclusive, non-transferable right to use the Service during its subscription.',
        'Suggestions you send us may be used to improve the Service without any obligation to you.',
      ],
    },
    {
      heading: '8. Confidentiality',
      body: ['Each party will keep the other\'s confidential information private and use it only for the purpose of these Terms.'],
    },
    {
      heading: '9. Ending the service',
      body: [
        'The Customer may stop using the Service at any time by cancelling its plan. We may end the Service for serious or repeated breach of these Terms after notice.',
        'After the Service ends, the company admin may ask for an export of Customer Data within 30 days. After that we may delete Customer Data, except where we must keep records by law.',
      ],
    },
    {
      heading: '10. Liability',
      body: [
        'The Service is provided on an "as is" and "as available" basis. To the extent the law allows, we are not liable for indirect or consequential loss, loss of profit or loss of data caused by events outside our reasonable control.',
        'Our total liability in any 12 months is limited to the fees the Customer paid for the Service in those 12 months.',
      ],
    },
    {
      heading: '11. Changes to these Terms',
      body: ['We may update these Terms. When the change matters, everyone is asked to read and sign the new version the next time they open Orbit.'],
    },
    {
      heading: '12. Law and contact',
      body: [
        `These Terms are governed by the laws of India, and the courts ${LEGAL_CITY ? `at ${LEGAL_CITY} have exclusive` : 'of India have'} jurisdiction, unless the Customer and Orbit agree otherwise in writing.`,
        `Questions about these Terms: ${LEGAL_CONTACT}.${office ? ` ${office}` : ''}`,
      ],
    },
  ],
};

export const PRIVACY: LegalDocument = {
  id: 'privacy',
  title: 'Privacy Policy',
  version: '2026-11-06',
  effective: '6 November 2026',
  intro: `This Privacy Policy explains what personal information Orbit (${LEGAL_PROVIDER}) collects, why, and how it is protected. For Customer Data, the Customer (your company) decides what is collected and Orbit processes it on the Customer's behalf.`,
  sections: [
    {
      heading: '1. Information we collect',
      body: [
        'Account details: your name, work email, job title, role, and the company and portals you belong to.',
        'Work records your company enters: timesheets and hours, projects, approvals, purchase requests, quotes, orders, receipts, invoices, suppliers and attached documents.',
        'Usage and security information: sign-in times, IP address, browser type, and a history of changes made in Orbit (who changed what and when).',
        'Billing information: the company\'s plan and payment history. Card, UPI and bank details are entered directly with Razorpay and are not stored by Orbit.',
      ],
    },
    {
      heading: '2. Why we use it',
      body: [
        'To provide the Service: sign-in, approvals, notifications, reports and dashboards.',
        'To keep the Service secure, prevent misuse and keep a reliable change history.',
        'To bill the Customer and send service emails (for example approval requests and payment receipts).',
        'To provide support and improve the Service. We do not sell personal information and do not use it for advertising.',
      ],
    },
    {
      heading: '3. Who can see it',
      body: [
        'People in your company see information according to the roles and portals your company admin gives them.',
        'Orbit staff access Customer Data only when needed to run, secure or support the Service.',
        'We use trusted service providers: Amazon Web Services (hosting, email, file storage), Neon (database), WorkOS (sign-in) and Razorpay (payments). They process information only to provide their service to us.',
        'We may disclose information when the law requires it.',
      ],
    },
    {
      heading: '4. Where it is stored and how it is protected',
      body: [
        'Data is stored in secure data centres, currently in the Asia Pacific (Singapore) region. Data is encrypted in transit and at rest.',
        'Each company\'s data is kept separate by database security rules. Passwords and keys are held in encrypted storage, and access is limited to people who need it.',
      ],
    },
    {
      heading: '5. How long we keep it',
      body: [
        'We keep Customer Data while the Customer uses Orbit. After the Service ends, it is deleted after 30 days unless the Customer asks for an export first or the law requires us to keep it longer.',
        'Records of acceptance of these documents, billing records and security logs are kept as long as needed for legal and accounting purposes.',
      ],
    },
    {
      heading: '6. Your choices and rights',
      body: [
        'You can ask to see, correct or delete your personal information. Requests about your work records should normally go to your company admin, who controls that data.',
        'You can contact us at ' + LEGAL_CONTACT + ' with any privacy question or complaint. We handle personal information in line with applicable law, including India\'s Digital Personal Data Protection Act, 2023.',
      ],
    },
    {
      heading: '7. Cookies',
      body: ['Orbit uses only the cookies needed to keep you signed in and remember the company you chose. We do not use advertising or tracking cookies.'],
    },
    {
      heading: '8. Changes',
      body: ['When this policy changes in a way that matters, you will be asked to read and accept the new version the next time you open Orbit.'],
    },
  ],
};

export const DOCUMENTS: Record<LegalDoc, LegalDocument> = { terms: TERMS, privacy: PRIVACY };
export const LEGAL_DOCS = [TERMS, PRIVACY];

/**
 * Older versions. When you change a document and its version, move the old one here unchanged,
 * so signed copies made before the new copies existed can still be shown.
 */
export const ARCHIVE: LegalDocument[] = [];

/** The text of one document version, current or archived. */
export const documentVersion = (id: string, version: string) => [...LEGAL_DOCS, ...ARCHIVE].find((d) => d.id === id && d.version === version);
