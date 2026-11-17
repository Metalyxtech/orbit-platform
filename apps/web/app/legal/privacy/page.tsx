import { PRIVACY } from '@/legal/documents';
import { PublicLegal } from '../PublicLegal';

export const metadata = { title: 'Orbit Privacy Policy' };

export default function Privacy() {
  return <PublicLegal doc={PRIVACY} />;
}
