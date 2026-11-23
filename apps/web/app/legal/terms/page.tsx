import { TERMS } from '@/legal/documents';
import { PublicLegal } from '../PublicLegal';

export const metadata = { title: 'SteelConnect360 Terms and Conditions' };

export default function Terms() {
  return <PublicLegal doc={TERMS} />;
}
