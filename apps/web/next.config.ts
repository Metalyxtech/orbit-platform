import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV !== 'production';

// Browser uploads go straight to S3 with a pre-signed URL (bucket.s3.<region>.amazonaws.com),
// so the policy must allow that host or every file upload is blocked. A local S3 stand-in
// (AWS_ENDPOINT_URL_S3) is allowed too, with its bucket sub-domains.
const region = process.env.APP_AWS_REGION ?? 'ap-southeast-1';
const s3 = [`https://*.s3.${region}.amazonaws.com`, `https://s3.${region}.amazonaws.com`, 'https://*.s3.amazonaws.com'];
const localS3 = process.env.AWS_ENDPOINT_URL_S3;
if (localS3) {
  const u = new URL(localS3);
  s3.push(u.origin, `${u.protocol}//*.${u.host}`);
}

// Everything the app loads is same-origin (fonts are bundled). Next.js injects inline bootstrap
// scripts, so script-src keeps 'unsafe-inline'; moving to nonces needs a middleware and is the
// next hardening step. Razorpay Checkout is the one third party: its script, frame and API.
// S3 is allowed for uploads only (connect-src).
// form-action lists WorkOS because the sign-out form is redirected to its logout URL.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://checkout.razorpay.com${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://*.razorpay.com ${s3.join(' ')}${dev ? ' ws: wss:' : ''}`,
  "frame-src 'self' https://*.razorpay.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://api.workos.com",
  "frame-ancestors 'none'",
  ...(dev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@orbit/core', '@orbit/db', '@orbit/ui', '@orbit/portal-timesheet', '@orbit/portal-procurement', '@orbit/portal-sales', '@orbit/portal-production', '@orbit/portal-quality', '@orbit/portal-custom-1'],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), usb=(), browsing-topics=()' },
        ],
      },
      // Machine endpoints and auth redirects are never cached by browsers or CDNs.
      { source: '/(api|auth)/(.*)', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
    ];
  },
};

export default config;
