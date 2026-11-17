import { TERMS } from '@/legal/documents';
import { PublicLegal } from '../PublicLegal';

export const metadata = { title: 'Orbit Terms and Conditions' };

export default function Terms() {
  return <PublicLegal doc={TERMS} />;
}
