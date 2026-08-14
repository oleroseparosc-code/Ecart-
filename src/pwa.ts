export function buildPwaAssetUrl(baseUrl: string, assetPath: string) {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedAsset = assetPath.replace(/^\/+/, "");
  return `${normalizedBase}${normalizedAsset}`;
}

export type PwaMetadata = {
  manifestPath: string;
  iconPath: string;
  documentTitle: string;
  appleTitle: string;
  themeColor: string;
};

export function getPwaMetadata(pathname = "/"): PwaMetadata {
  const normalizedPath = pathname.replace(/\/+$/, "");
  const isNarcoticViewer = normalizedPath.endsWith("/narcotic-viewer");
  if (isNarcoticViewer) {
    return {
      manifestPath: "narcotic-viewer.webmanifest",
      iconPath: "icons/narcotic-icon-192.png",
      documentTitle: "비치마약류 관리",
      appleTitle: "비치마약류 관리",
      themeColor: "#b91c1c",
    };
  }

  const isPharmacyViewer = normalizedPath.endsWith("/pharmacy-viewer");
  const isPharmacyEditor = normalizedPath.endsWith("/pharmacy-label-editor");
  const isPharmacyLocator = normalizedPath.endsWith("/pharmacy-drug-locator");
  if (isPharmacyLocator) {
    return {
      manifestPath: "pharmacy-drug-locator.webmanifest",
      iconPath: "icons/pharmacy-drug-locator-icon-192.png",
      documentTitle: "약품 라벨 스캔",
      appleTitle: "약품 라벨 스캔",
      themeColor: "#E8843C",
    };
  }
  if (isPharmacyEditor) {
    return {
      manifestPath: "pharmacy-label-editor.webmanifest",
      iconPath: "icons/pharmacy-label-editor-icon-192.png",
      documentTitle: "약제팀 라벨 편집기",
      appleTitle: "약제팀 라벨 편집기",
      themeColor: "#f97316",
    };
  }
  if (isPharmacyViewer) {
    return {
      manifestPath: "pharmacy-viewer.webmanifest",
      iconPath: "icons/app-icon-192.png",
      documentTitle: "약제팀 라벨 마스터 관리",
      appleTitle: "약제팀 라벨 마스터 관리",
      themeColor: "#f97316",
    };
  }

  const isViewer = normalizedPath.endsWith("/viewer");
  if (isViewer) {
    return {
      manifestPath: "viewer.webmanifest",
      iconPath: "icons/viewer-icon-192.png",
      documentTitle: "병동 약품 라벨 마스터관리",
      appleTitle: "병동 약품 라벨 마스터관리",
      themeColor: "#f97316",
    };
  }

  return {
    manifestPath: "manifest.webmanifest",
    iconPath: "icons/app-icon-192.png",
    documentTitle: "약사용 병동 비품관리",
    appleTitle: "비품점검",
    themeColor: "#f97316",
  };
}

function setLinkHref(selector: string, href: string) {
  const element = document.querySelector<HTMLLinkElement>(selector);
  if (element) element.href = href;
}

function setMetaContent(selector: string, content: string) {
  const element = document.querySelector<HTMLMetaElement>(selector);
  if (element) element.content = content;
}

export function applyPwaMetadata() {
  if (typeof window === "undefined") return;
  const version = "20260814f";
  const metadata = getPwaMetadata(window.location.pathname);
  const manifestHref = buildPwaAssetUrl(import.meta.env.BASE_URL, `${metadata.manifestPath}?v=${version}`);
  const iconHref = buildPwaAssetUrl(import.meta.env.BASE_URL, `${metadata.iconPath}?v=${version}`);

  setMetaContent('meta[name="theme-color"]', metadata.themeColor);
  setMetaContent('meta[name="apple-mobile-web-app-title"]', metadata.appleTitle);
  document.title = metadata.documentTitle;
  setLinkHref('link[rel="manifest"]', manifestHref);
  setLinkHref('link[rel="icon"]', iconHref);
  setLinkHref('link[rel="apple-touch-icon"]', iconHref);
}

export function shouldReloadAfterServiceWorkerUpdate(state: {
  wasControlled: boolean;
  isReloading: boolean;
}) {
  return state.wasControlled && !state.isReloading;
}

export function registerAppServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    const serviceWorkerUrl = buildPwaAssetUrl(import.meta.env.BASE_URL, "sw.js?v=20260814f");
    const wasControlled = Boolean(navigator.serviceWorker.controller);
    let isReloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!shouldReloadAfterServiceWorkerUpdate({ wasControlled, isReloading })) return;
      isReloading = true;
      window.location.reload();
    });
    void navigator.serviceWorker
      .register(serviceWorkerUrl)
      .then((registration) => registration.update())
      .catch((error) => {
        console.warn("Service worker registration failed", error);
      });
  });
}
