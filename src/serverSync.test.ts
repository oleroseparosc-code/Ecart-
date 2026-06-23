import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAppStateApiUrl, saveServerState } from "./serverSync";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("server sync client", () => {
  it("builds the local app-state API URL under the Vite base path", () => {
    expect(buildAppStateApiUrl("/Ecart-/")).toBe("/Ecart-/api/app-state");
    expect(buildAppStateApiUrl("/")).toBe("/api/app-state");
  });

  it("retries a transient save failure before surfacing an error", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "temporary git push failure" }), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha: "saved-after-retry" }), { status: 200 }));

    await expect(
      saveServerState(
        {
          version: 1,
          updatedAt: "2026-06-23T07:00:00.000Z",
          clientId: "phone",
          state: { room: "42W" },
        },
        { retryDelayMs: 0 },
      ),
    ).resolves.toEqual({ sha: "saved-after-retry" });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("sends the server state sha that the local save is based on", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ sha: "next-sha" }), { status: 200 }));

    await saveServerState(
      {
        version: 1,
        updatedAt: "2026-06-23T07:00:00.000Z",
        clientId: "pc",
        state: { stockDrugs: [] },
      },
      { baseSha: "current-sha", retryDelayMs: 0 },
    );

    const request = vi.mocked(globalThis.fetch).mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      baseSha: "current-sha",
      envelope: {
        clientId: "pc",
        state: { stockDrugs: [] },
      },
    });
  });

  it("can force a device state upload for manual recovery", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ sha: "forced-sha" }), { status: 200 }));

    await saveServerState(
      {
        version: 1,
        updatedAt: "2026-06-23T07:00:00.000Z",
        clientId: "phone",
        state: { roundSummaryDraft: { rows: [] } },
      },
      { force: true, retryDelayMs: 0 },
    );

    const request = vi.mocked(globalThis.fetch).mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      force: true,
      envelope: {
        clientId: "phone",
        state: { roundSummaryDraft: { rows: [] } },
      },
    });
  });
});
