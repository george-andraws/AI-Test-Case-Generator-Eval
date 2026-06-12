import crypto from "crypto";
import type { NextRequest, NextResponse } from "next/server";
import { DEMO_SESSION_TTL_SECONDS, isDemoMode } from "@/lib/runtime";

const COOKIE_NAME = "tcet_demo_session";

export interface DemoSession {
  id: string;
  shouldSetCookie: boolean;
}

export interface StorageContext {
  sessionId: string;
}

function getSecret(): string {
  return (
    process.env.DEMO_SESSION_SECRET ??
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    "local-demo-session-secret"
  );
}

function sign(sessionId: string): string {
  return crypto.createHmac("sha256", getSecret()).update(sessionId).digest("base64url");
}

function serialize(sessionId: string): string {
  return `${sessionId}.${sign(sessionId)}`;
}

function parse(value: string | undefined): string | null {
  if (!value) return null;
  const [sessionId, signature] = value.split(".");
  if (!sessionId || !signature) return null;
  const expected = sign(sessionId);
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }
  return sessionId;
}

export function getDemoSession(req?: NextRequest): DemoSession | null {
  if (!isDemoMode()) return null;
  const existing = parse(req?.cookies.get(COOKIE_NAME)?.value);
  if (existing) return { id: existing, shouldSetCookie: false };
  return { id: crypto.randomUUID(), shouldSetCookie: true };
}

export function storageContextFromSession(session: DemoSession | null): StorageContext | undefined {
  return session ? { sessionId: session.id } : undefined;
}

export function applyDemoSessionCookie(response: NextResponse, session: DemoSession | null): void {
  if (!session?.shouldSetCookie) return;
  response.cookies.set({
    name: COOKIE_NAME,
    value: serialize(session.id),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: DEMO_SESSION_TTL_SECONDS,
    path: "/",
  });
}
