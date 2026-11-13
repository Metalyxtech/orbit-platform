import { LoadingOrbit } from '@/LoadingOrbit';

// Root fallback: any page without its own loading screen shows this instead of an empty page.
export default function Loading() {
  return <LoadingOrbit />;
}
