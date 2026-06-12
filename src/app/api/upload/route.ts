import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { urlToSlug } from "@/lib/storage";
import { applyDemoSessionCookie, getDemoSession } from "@/lib/demo-session";
import { enforceDemoRateLimit } from "@/lib/demo-rate-limit";
import { isDemoMode } from "@/lib/runtime";

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const ALLOWED_MIME = new Set(Object.keys(MIME_TO_EXT));
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * GET /api/upload?path=data/images/{slug}/rev-1-screenshot-1.png
 * Serves a stored image file. Only paths under data/images/ are allowed.
 */
export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get("path");
  if (!filePath) {
    return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });
  }

  if (isDemoMode() && /^https:\/\//.test(filePath)) {
    try {
      const response = await fetch(filePath);
      if (!response.ok) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }
      return new Response(response.body, {
        headers: {
          "Content-Type": response.headers.get("Content-Type") ?? "application/octet-stream",
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
  }

  // Guard against path traversal: only allow files inside data/images/
  const normalized = path.normalize(filePath).replace(/\\/g, "/");
  if (!normalized.startsWith("data/images/")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 403 });
  }

  const absolutePath = path.join(process.cwd(), normalized);
  try {
    const buffer = await fs.readFile(absolutePath);
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const contentType =
      ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "webp"
        ? "image/webp"
        : "image/png";
    return new Response(buffer, { headers: { "Content-Type": contentType } });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}

/**
 * POST /api/upload — multipart/form-data
 * Fields: url (string), revision (number), images (File[])
 * Saves images to data/images/{url-slug}/rev-{N}-screenshot-{i}.{ext}
 * Returns: { paths: string[] }
 */
export async function POST(req: NextRequest) {
  try {
    const session = getDemoSession(req);
    const rateLimitResponse = await enforceDemoRateLimit(req, "upload", session?.id);
    if (rateLimitResponse) {
      applyDemoSessionCookie(rateLimitResponse, session);
      return rateLimitResponse;
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
    }

    const url = formData.get("url");
    const revisionRaw = formData.get("revision");
    if (typeof url !== "string" || !url) {
      return NextResponse.json({ error: "Missing url field" }, { status: 400 });
    }
    const revision = parseInt(String(revisionRaw ?? ""), 10);
    if (isNaN(revision)) {
      return NextResponse.json({ error: "Missing or invalid revision field" }, { status: 400 });
    }

    const files = formData.getAll("images") as File[];
    if (files.length === 0) {
      return NextResponse.json({ paths: [] });
    }

    const paths: string[] = [];
    const slug = urlToSlug(url);

    if (isDemoMode()) {
      if (!session) {
        return NextResponse.json({ error: "Demo session is required" }, { status: 400 });
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!ALLOWED_MIME.has(file.type)) {
          return NextResponse.json(
            { error: `Unsupported MIME type: ${file.type}` },
            { status: 400 }
          );
        }
        if (file.size > MAX_FILE_SIZE_BYTES) {
          return NextResponse.json(
            { error: `File exceeds ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB limit: ${file.name}` },
            { status: 400 }
          );
        }
        const ext = MIME_TO_EXT[file.type];
        const fileName = `demo/images/${session.id}/${slug}/rev-${revision}-screenshot-${i + 1}.${ext}`;
        const blob = await put(fileName, file, {
          access: "public",
          addRandomSuffix: false,
          contentType: file.type,
        });
        paths.push(blob.url);
      }

      const response = NextResponse.json({ paths });
      applyDemoSessionCookie(response, session);
      return response;
    }

    const imageDir = path.join(process.cwd(), "data", "images", slug);
    await fs.mkdir(imageDir, { recursive: true });

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!ALLOWED_MIME.has(file.type)) {
        return NextResponse.json(
          { error: `Unsupported MIME type: ${file.type}` },
          { status: 400 }
        );
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { error: `File exceeds ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB limit: ${file.name}` },
          { status: 400 }
        );
      }
      const ext = MIME_TO_EXT[file.type];
      const fileName = `rev-${revision}-screenshot-${i + 1}.${ext}`;
      const filePath = path.join(imageDir, fileName);
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(filePath, buffer);
      paths.push(`data/images/${slug}/${fileName}`);
    }

    const response = NextResponse.json({ paths });
    applyDemoSessionCookie(response, session);
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
