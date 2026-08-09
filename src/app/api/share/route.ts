import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { isValidSerial, parseSerial } from "@/lib/identifier";
import { blobConfigured, siteOrigin } from "@/lib/site";

/**
 * Parks a finished PNG so the /s/<id> page can advertise it as an OG image and
 * X renders the actual card in the link preview.
 *
 * Only the rendered picture is uploaded. The form values that produced it stay
 * in the browser; the few labels stored alongside are the ones already printed
 * on the image itself.
 */

export const runtime = "nodejs";

const MAX_UPLOAD = 8 * 1024 * 1024;

/* -------------------------------------------------------------- rate limit

   This is the only endpoint in the app that accepts anything, and it writes to
   paid object storage. Without a limit, one script can fill the bucket with
   8 MB uploads and the bill is somebody's problem.

   The counter is in memory, which on serverless means per instance rather than
   global, so a determined attacker with enough concurrency still gets through.
   It is a speed bump, not a wall, and it is written down as one. The real
   defence for a public deployment is a limiter at the edge; this stops the
   accident and the casual case, which is most of them.
------------------------------------------------------------------------- */

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 6;
const seen = new Map<string, { count: number; resetAt: number }>();

function overLimit(key: string): boolean {
  const now = Date.now();
  const entry = seen.get(key);

  if (!entry || now > entry.resetAt) {
    seen.set(key, { count: 1, resetAt: now + WINDOW_MS });
    // Opportunistic sweep so the map cannot grow without bound.
    if (seen.size > 5000) {
      for (const [id, value] of seen) if (now > value.resetAt) seen.delete(id);
    }
    return false;
  }

  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

/** Best available caller identity behind a proxy. Spoofable; see above. */
function callerKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
}

/** Drops angle brackets and collapses whitespace before anything is stored. */
function clean(value: string, limit: number): string {
  return value
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

export async function POST(request: Request) {
  if (!blobConfigured()) {
    return NextResponse.json({ error: "sharing_not_configured" }, { status: 501 });
  }

  if (overLimit(callerKey(request))) {
    return NextResponse.json(
      { error: "too_many_requests" },
      { status: 429, headers: { "Retry-After": String(WINDOW_MS / 1000) } },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const image = form.get("image");
  const serial = String(form.get("serial") ?? "");
  const format = String(form.get("format") ?? "card");

  if (!(image instanceof File)) {
    return NextResponse.json({ error: "missing_image" }, { status: 400 });
  }
  if (image.type !== "image/png" || image.size === 0 || image.size > MAX_UPLOAD) {
    return NextResponse.json({ error: "unsupported_image" }, { status: 415 });
  }
  // Accepts the prefixed pass number as well as the bare body, so a caller
  // that sends what is printed on the card is not rejected for it.
  const parsed = parseSerial(serial);
  if (!parsed.valid && !isValidSerial(serial)) {
    return NextResponse.json({ error: "bad_serial" }, { status: 400 });
  }
  const body = parsed.body;
  if (!["card", "pfp", "team"].includes(format)) {
    return NextResponse.json({ error: "bad_format" }, { status: 400 });
  }

  const id = `${body}-${Date.now().toString(36)}`;

  try {
    const uploaded = await put(`shares/${id}.png`, image, {
      access: "public",
      contentType: "image/png",
      addRandomSuffix: false,
      cacheControlMaxAge: 60 * 60 * 24 * 30,
    });

    await put(
      `shares/${id}.json`,
      JSON.stringify({
        id,
        serial: body,
        format,
        imageUrl: uploaded.url,
        name: clean(String(form.get("name") ?? ""), 40),
        title: clean(String(form.get("title") ?? ""), 48),
        team: clean(String(form.get("team") ?? ""), 32),
        createdAt: new Date().toISOString(),
      }),
      {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false,
        cacheControlMaxAge: 60 * 60 * 24 * 30,
      },
    );

    const origin = siteOrigin();
    return NextResponse.json({
      id,
      pageUrl: `${origin}/s/${id}`,
      imageUrl: uploaded.url,
    });
  } catch {
    return NextResponse.json({ error: "upload_failed" }, { status: 502 });
  }
}
