/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true
  },
  experimental: {
    outputFileTracingIncludes: {
      
      "/api/pdf/generate": [
        
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
