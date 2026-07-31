import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { sharedState } from "../../../db/schema";

export const dynamic = "force-dynamic";

type AppStateEnvelope = {
  version: 1;
  updatedAt: string;
  clientId: string;
  state: Record<string, unknown>;
};

const STATE_KEY = "inventory-app-state";
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

function responseJson(request: Request, body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders(request) });
}

function mergeByKey<T extends Record<string, unknown>>(current: T[], incoming: T[], key: string) {
  const rows = new Map(current.map((row) => [String(row[key] ?? ""), row]));
  for (const row of incoming) rows.set(String(row[key] ?? ""), row);
  return [...rows.values()];
}

function mergeConflictingEnvelope(current: AppStateEnvelope, incoming: AppStateEnvelope): AppStateEnvelope {
  const currentState = current.state;
  const incomingState = incoming.state;
  const currentMaster = Array.isArray(currentState.pharmacyAdditionalRows)
    ? currentState.pharmacyAdditionalRows as Record<string, unknown>[]
    : [];
  const incomingMaster = Array.isArray(incomingState.pharmacyAdditionalRows)
    ? incomingState.pharmacyAdditionalRows as Record<string, unknown>[]
    : [];
  const currentLabels = Array.isArray(currentState.pharmacyLabels)
    ? currentState.pharmacyLabels as Record<string, unknown>[]
    : [];
  const incomingLabels = Array.isArray(incomingState.pharmacyLabels)
    ? incomingState.pharmacyLabels as Record<string, unknown>[]
    : [];

  return {
    ...incoming,
    state: {
      ...currentState,
      ...incomingState,
      pharmacyAdditionalRows: mergeByKey(currentMaster, incomingMaster, "code"),
      pharmacyLabels: mergeByKey(currentLabels, incomingLabels, "id"),
    },
  };
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: Request) {
  const db = getDb();
  const [row] = await db.select().from(sharedState).where(eq(sharedState.key, STATE_KEY)).limit(1);
  if (!row) return responseJson(request, { error: "저장된 공유 상태가 없습니다." }, 404);
  return responseJson(request, { envelope: JSON.parse(row.payload), sha: row.sha });
}

export async function PUT(request: Request) {
  try {
    const raw = await request.json() as {
      envelope?: AppStateEnvelope;
      baseSha?: string;
      force?: boolean;
      version?: number;
      updatedAt?: string;
      clientId?: string;
      state?: Record<string, unknown>;
    };
    const incoming = (raw.envelope ?? raw) as AppStateEnvelope;
    if (incoming.version !== 1 || !incoming.updatedAt || !incoming.clientId || !incoming.state) {
      return responseJson(request, { error: "공유 상태 형식이 올바르지 않습니다." }, 400);
    }

    const db = getDb();
    const [current] = await db.select().from(sharedState).where(eq(sharedState.key, STATE_KEY)).limit(1);
    if (current && raw.baseSha && raw.baseSha !== current.sha && !raw.force) {
      return responseJson(request, { error: "다른 PC에서 먼저 저장한 변경 내용이 있습니다.", sha: current.sha }, 409);
    }

    const currentEnvelope = current ? JSON.parse(current.payload) as AppStateEnvelope : null;
    const envelope = currentEnvelope && raw.force ? mergeConflictingEnvelope(currentEnvelope, incoming) : incoming;
    const sha = crypto.randomUUID();
    await db.insert(sharedState).values({
      key: STATE_KEY,
      payload: JSON.stringify(envelope),
      sha,
      updatedAt: envelope.updatedAt,
    }).onConflictDoUpdate({
      target: sharedState.key,
      set: {
        payload: JSON.stringify(envelope),
        sha,
        updatedAt: envelope.updatedAt,
      },
    });
    return responseJson(request, { sha });
  } catch (error) {
    return responseJson(request, {
      error: error instanceof Error ? error.message : "공유 상태 저장에 실패했습니다.",
    }, 500);
  }
}
