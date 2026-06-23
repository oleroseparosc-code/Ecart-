import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGithubContentsUrl, decodeBase64Utf8, encodeBase64Utf8, loadRemoteState, shouldApplyRemoteState } from "./githubSync";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("github sync helpers", () => {
  it("builds the GitHub contents API URL for the shared state file", () => {
    expect(
      buildGithubContentsUrl({
        owner: "oleroseparosc-code",
        repo: "Ecart-",
        branch: "main",
        path: "app-state/shared-state.json",
      }),
    ).toBe("https://api.github.com/repos/oleroseparosc-code/Ecart-/contents/app-state%2Fshared-state.json?ref=main");
  });

  it("round-trips Korean JSON through base64", () => {
    const text = JSON.stringify({ room: "HBEF심혈관조영실", note: "수량 확인" });

    expect(decodeBase64Utf8(encodeBase64Utf8(text))).toBe(text);
  });

  it("applies only newer remote state from another client", () => {
    expect(
      shouldApplyRemoteState({
        remoteUpdatedAt: "2026-06-23T10:00:05.000Z",
        localUpdatedAt: "2026-06-23T10:00:00.000Z",
        remoteClientId: "phone",
        clientId: "pc",
      }),
    ).toBe(true);

    expect(
      shouldApplyRemoteState({
        remoteUpdatedAt: "2026-06-23T10:00:00.000Z",
        localUpdatedAt: "2026-06-23T10:00:05.000Z",
        remoteClientId: "phone",
        clientId: "pc",
      }),
    ).toBe(false);

    expect(
      shouldApplyRemoteState({
        remoteUpdatedAt: "2026-06-23T10:00:05.000Z",
        localUpdatedAt: "2026-06-23T10:00:00.000Z",
        remoteClientId: "pc",
        clientId: "pc",
      }),
    ).toBe(false);
  });

  it("times out stalled GitHub load requests", async () => {
    globalThis.fetch = vi.fn((_url, init) => {
      const signal = (init as RequestInit | undefined)?.signal;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });

    await expect(
      loadRemoteState(
        {
          owner: "oleroseparosc-code",
          repo: "Ecart-",
          branch: "main",
          path: "app-state/shared-state.json",
          token: "secret",
        },
        { timeoutMs: 1 },
      ),
    ).rejects.toThrow("GitHub 요청 시간이 초과");
  });
});
