import type { RemoteSaveResult, RemoteStateEnvelope, RemoteStateResult } from "./githubSync";

type ServerSyncOptions = {
  baseUrl?: string;
  timeoutMs?: number;
  retryDelayMs?: number;
};

const DEFAULT_SERVER_TIMEOUT_MS = 12000;
const SAVE_RETRY_ATTEMPTS = 3;
const SAVE_RETRY_DELAY_MS = 1200;

export function buildAppStateApiUrl(baseUrl = import.meta.env.BASE_URL) {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}api/app-state`;
}

async function fetchServerState(url: string, init: RequestInit, timeoutMs = DEFAULT_SERVER_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("자동 저장 서버 응답 시간이 초과되었습니다. PC에서 앱 서버가 실행 중인지 확인해 주세요.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

function waitForRetry(delayMs: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
}

function isTransientSaveStatus(status: number) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

export async function loadServerState<T>(options: ServerSyncOptions = {}): Promise<RemoteStateResult<T> | null> {
  const response = await fetchServerState(
    buildAppStateApiUrl(options.baseUrl),
    {
      method: "GET",
      headers: { Accept: "application/json" },
    },
    options.timeoutMs,
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`자동 저장 상태를 불러오지 못했습니다 (${response.status}).`);
  }

  return (await response.json()) as RemoteStateResult<T>;
}

async function saveServerStateOnce<T>(
  envelope: RemoteStateEnvelope<T>,
  options: ServerSyncOptions = {},
): Promise<RemoteSaveResult> {
  const response = await fetchServerState(
    buildAppStateApiUrl(options.baseUrl),
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(envelope),
    },
    options.timeoutMs,
  );

  if (!response.ok) {
    throw new Error(`자동 저장에 실패했습니다 (${response.status}).`);
  }

  return (await response.json()) as RemoteSaveResult;
}

function isTransientSaveError(error: unknown) {
  if (!(error instanceof Error)) return true;
  const status = error.message.match(/\((\d{3})\)/)?.[1];
  return status ? isTransientSaveStatus(Number(status)) : true;
}

export async function saveServerState<T>(
  envelope: RemoteStateEnvelope<T>,
  options: ServerSyncOptions = {},
): Promise<RemoteSaveResult> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= SAVE_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await saveServerStateOnce(envelope, options);
    } catch (error) {
      lastError = error;
      if (attempt === SAVE_RETRY_ATTEMPTS || !isTransientSaveError(error)) {
        throw error;
      }
      await waitForRetry(options.retryDelayMs ?? SAVE_RETRY_DELAY_MS);
    }
  }

  throw lastError;
}
