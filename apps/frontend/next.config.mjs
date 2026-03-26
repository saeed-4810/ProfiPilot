/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /**
   * Proxy API routes through Next.js dev server so frontend and backend
   * share the same origin (localhost:3000). This fixes the cross-port
   * cookie issue: the __session cookie set by Express on /auth/verify-token
   * is now visible to Next.js middleware because both run on port 3000.
   *
   * In production/staging, Firebase Hosting handles this via rewrites
   * (see firebase.json). This config only applies to `next dev`.
   *
   * Routes proxied: /auth/*, /audits/*, /api/v1/*, /dashboard/*, /health
   * Target: BACKEND_URL env var or http://localhost:3001
   */
  async rewrites() {
    const backendUrl = process.env["BACKEND_URL"] ?? "http://localhost:3001";
    return [
      { source: "/auth/:path*", destination: `${backendUrl}/auth/:path*` },
      { source: "/audits/:path*", destination: `${backendUrl}/audits/:path*` },
      { source: "/api/v1/:path*", destination: `${backendUrl}/api/v1/:path*` },
      { source: "/dashboard/:path*", destination: `${backendUrl}/dashboard/:path*` },
      { source: "/health", destination: `${backendUrl}/health` },
    ];
  },
};

export default nextConfig;
