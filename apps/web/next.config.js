/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true
  },
  outputFileTracingIncludes: {
    // ✅ clave más fiable para App Router route handlers
    "app/api/pdf/generate/route": [
      "./node_modules/**/@sparticuz/chromium/bin/**",
      "./node_modules/**/@sparticuz/chromium/build/**",
    ],
    // ✅ fallback por si Next usa otra clave interna para ese handler
    "/api/pdf/generate": [
      "./node_modules/**/@sparticuz/chromium/bin/**",
      "./node_modules/**/@sparticuz/chromium/build/**",
    ],
  },
  async redirects() {
    return [];
  },
  async rewrites() {
    return [];
  },
  transpilePackages: ['@repo/ui'],
};


export default nextConfig;
