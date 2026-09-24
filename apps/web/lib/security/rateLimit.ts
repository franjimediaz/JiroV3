import { rateLimited } from "@/lib/auth/apiError";

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

function isProduction() {
  return process.env.NODE_ENV === "production";
}

export async function enforceRateLimit(options: RateLimitOptions) {
  const externalConfigured = Boolean(process.env.RATE_LIMIT_REDIS_URL || process.env.UPSTASH_REDIS_REST_URL);
  if (isProduction() && !externalConfigured && process.env.ALLOW_IN_MEMORY_RATE_LIMIT !== "1") {
    throw new Error("Rate limiting storage is not configured");
  }

  const now = Date.now();
  const bucket = buckets.get(options.key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(options.key, { count: 1, resetAt: now + options.windowMs });
    return;
  }

  if (bucket.count >= options.limit) {
    throw rateLimited(Math.ceil((bucket.resetAt - now) / 1000));
  }

  bucket.count += 1;
}

export function getClientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || "unknown";
}
