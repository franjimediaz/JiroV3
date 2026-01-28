/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true
  },
  experimental: {
    outputFileTracingIncludes: {
      // Ruta de tu handler (la que aparece en el build como /api/pdf/generate)
      "/api/pdf/generate": [
        // pnpm guarda deps en node_modules/.pnpm/...
        "./node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/.local-browsers/**",
        "./node_modules/.pnpm/playwright@*/node_modules/playwright/.local-browsers/**",
      ],
    },
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
