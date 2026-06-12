import { NextRequest, NextResponse } from "next/server";
import { listProducts } from "@/lib/storage";
import {
  applyDemoSessionCookie,
  getDemoSession,
  storageContextFromSession,
} from "@/lib/demo-session";

export async function GET(req?: NextRequest) {
  try {
    const session = getDemoSession(req);
    const storageContext = storageContextFromSession(session);
    const products = storageContext ? await listProducts(storageContext) : await listProducts();
    const response = NextResponse.json({ products });
    applyDemoSessionCookie(response, session);
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
