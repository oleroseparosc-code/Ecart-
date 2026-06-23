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
});
