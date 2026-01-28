/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true
  },
  outputFileTracingIncludes: {
    "/api/pdf/generate": [
      // Incluye los brotli/bin de Sparticuz
      "./node_modules/**/@sparticuz/chromium/**",
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
