import { NextResponse } from "next/server";
import { listProducts } from "@/lib/storage";

export async function GET() {
  try {
    const products = await listProducts();
    return NextResponse.json({ products });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
