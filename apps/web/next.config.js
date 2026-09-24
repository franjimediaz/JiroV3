/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV === "development";
const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  ...(isDev ? ["'unsafe-eval'"] : []),
].join(" ");

const csp = [
  "default-src 'self'",
  "connect-src 'self' https://*.supabase.co",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src ${scriptSrc}`,
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

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
  async headers() {
    const headers = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Content-Security-Policy", value: csp },
    ];

    if (process.env.NODE_ENV === "production") {
      headers.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      });
    }

    return [{ source: "/(.*)", headers }];
  },
  transpilePackages: ['@repo/ui'],
};


export default nextConfig;
