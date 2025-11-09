/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true
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
