import { NextResponse } from "next/server";
import { getStorageMode, isLangfuseConfigured, resolveLangfuseEnabled } from "@/lib/runtime";

export async function GET() {
  return NextResponse.json({
    storageMode: getStorageMode(),
    langfuseAvailable: isLangfuseConfigured(),
    langfuseDefaultEnabled: resolveLangfuseEnabled(),
  });
}
