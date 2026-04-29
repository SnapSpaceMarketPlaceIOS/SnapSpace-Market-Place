/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The wish page renders Supabase-hosted images. Allow any HTTPS host so
  // we don't break when storage URLs rotate (e.g. custom domain swap).
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
  // AASA (Apple App Site Association) is served via a dedicated route
  // handler at app/.well-known/apple-app-site-association/route.ts so it
  // returns the correct application/json content type without relying on
  // config-level header rewrites.
};

export default nextConfig;
