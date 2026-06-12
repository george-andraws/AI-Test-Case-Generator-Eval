import { Ratelimit } from "@upstash/ratelimit";
import { NextResponse, type NextRequest } from "next/server";
import { Redis } from "@upstash/redis";
import { isDemoMode } from "@/lib/runtime";

let redis: Redis | null = null;
let limiter: Ratelimit | null = null;

function getRedis(): Redis {
  if (!redis) redis = Redis.fromEnv();
  return redis;
}

function getLimiter(): Ratelimit {
  if (!limiter) {
    const requests = Number(process.env.DEMO_RATE_LIMIT_REQUESTS ?? "20");
    const window = (process.env.DEMO_RATE_LIMIT_WINDOW ?? "1 m") as Parameters<
      typeof Ratelimit.slidingWindow
    >[1];
    limiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(requests, window),
      prefix: "tcet:ratelimit",
    });
  }
  return limiter;
}

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function enforceDemoRateLimit(
  req: NextRequest,
  action: string,
  sessionId?: string
): Promise<NextResponse | null> {
  if (!isDemoMode()) return null;

  const limiter = getLimiter();
  const identifiers = [`ip:${getIp(req)}`];
  if (sessionId) identifiers.push(`session:${sessionId}`);

  for (const identifier of identifiers) {
    const result = await limiter.limit(`${action}:${identifier}`);
    if (!result.success) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again in a minute." },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(result.limit),
            "X-RateLimit-Remaining": String(result.remaining),
            "X-RateLimit-Reset": String(result.reset),
          },
        }
      );
    }
  }

  return null;
}
