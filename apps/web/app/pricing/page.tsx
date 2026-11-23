import { PricingClient } from './PricingClient';

export const metadata = { title: 'SteelConnect360 pricing' };

/** Public pricing page (no sign-in). */
export default function Pricing() {
  return <PricingClient />;
}
