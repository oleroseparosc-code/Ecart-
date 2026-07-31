import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

const WORKBOOK_KEY = "pharmacy/원내보유의약품리스트.xlsx";
const CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const ALLOWED_ORIGINS = new Set([
  "https://donggukpharm7992-star.github.io",
  "https://oleroseparosc-code.github.io",
]);

function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin") ?? "";
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) || /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin)
    ? origin
    : "";
  return {
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: Request) {
  const object = await env.BUCKET.get(WORKBOOK_KEY);
  if (!object) {
    return Response.json({ error: "저장된 원내보유의약품리스트가 없습니다." }, {
      status: 404,
      headers: corsHeaders(request),
    });
  }
  return new Response(object.body, {
    headers: {
      ...corsHeaders(request),
      "Content-Type": object.httpMetadata?.contentType ?? CONTENT_TYPE,
      "Content-Length": String(object.size),
      ETag: object.etag,
    },
  });
}

export async function PUT(request: Request) {
  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (contentLength > 10 * 1024 * 1024) {
    return Response.json({ error: "엑셀 파일 크기가 허용 범위를 초과했습니다." }, {
      status: 413,
      headers: corsHeaders(request),
    });
  }
  const data = await request.arrayBuffer();
  if (data.byteLength < 4 || new Uint8Array(data, 0, 2).join(",") !== "80,75") {
    return Response.json({ error: "올바른 Excel 통합 문서가 아닙니다." }, {
      status: 400,
      headers: corsHeaders(request),
    });
  }
  const stored = await env.BUCKET.put(WORKBOOK_KEY, data, {
    httpMetadata: { contentType: CONTENT_TYPE },
    customMetadata: { updatedAt: new Date().toISOString() },
  });
  return Response.json({ saved: true, etag: stored.etag }, {
    headers: corsHeaders(request),
  });
}
