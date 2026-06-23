export type SyncDeviceMode = "mobile" | "pc";

const MOBILE_VIEWPORT_WIDTH = 768;

export function getSyncDeviceMode({
  isMobileMode,
  viewportWidth,
}: {
  isMobileMode: boolean;
  viewportWidth: number;
}): SyncDeviceMode {
  return isMobileMode || viewportWidth <= MOBILE_VIEWPORT_WIDTH ? "mobile" : "pc";
}

export function getSyncActionAvailability({ mode, hasConfig }: { mode: SyncDeviceMode; hasConfig: boolean }) {
  return {
    showPull: mode === "pc",
    showPush: mode === "mobile",
    canPull: mode === "pc" && hasConfig,
    canPush: mode === "mobile" && hasConfig,
  };
}
