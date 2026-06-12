import { del, list } from "@vercel/blob";
import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";

const DEMO_BLOB_PREFIX = "demo/images/";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function sessionIdFromBlobPath(pathname: string): string | null {
  const normalized = pathname.replace(/^\/+/, "");
  if (!normalized.startsWith(DEMO_BLOB_PREFIX)) return null;
  return normalized.slice(DEMO_BLOB_PREFIX.length).split("/")[0] || null;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const redis = Redis.fromEnv();
  let cursor: string | undefined;
  let scanned = 0;
  let deleted = 0;

  do {
    const page = await list({ prefix: DEMO_BLOB_PREFIX, cursor, limit: 1000 });
    cursor = page.cursor;
    scanned += page.blobs.length;

    const staleUrls: string[] = [];
    for (const blob of page.blobs) {
      const sessionId = sessionIdFromBlobPath(new URL(blob.url).pathname);
      if (!sessionId) continue;
      const active = await redis.exists(`tcet:session:${sessionId}:products`);
      if (!active) staleUrls.push(blob.url);
    }

    if (staleUrls.length > 0) {
      await del(staleUrls);
      deleted += staleUrls.length;
    }
  } while (cursor);

  return NextResponse.json({ success: true, scanned, deleted });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
