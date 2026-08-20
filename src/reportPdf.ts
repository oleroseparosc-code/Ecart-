import html2canvas from "html2canvas";

type PdfImagePage = {
  bytes: Uint8Array;
  width: number;
  height: number;
  drawWidth: number;
  drawHeight: number;
  filter?: "/FlateDecode";
};

const PAPER_SIZES = {
  A4: { width: 595.28, height: 841.89 },
  A3: { width: 841.89, height: 1190.55 },
} as const;
const PAGE_MARGIN = 24;

export type PdfPaper = keyof typeof PAPER_SIZES;
export type PdfOrientation = "portrait" | "landscape";

function paperSize(paper: PdfPaper, orientation: PdfOrientation) {
  const size = PAPER_SIZES[paper];
  return orientation === "portrait" ? size : { width: size.height, height: size.width };
}

const encoder = new TextEncoder();

function normalizeFormControls(root: HTMLElement) {
  root.querySelectorAll("input").forEach((input) => {
    const replacement = root.ownerDocument.createElement("span");
    replacement.className = "pdf-input-value";
    if (input.type === "checkbox" || input.type === "radio") {
      replacement.textContent = input.checked ? "✓" : "";
    } else {
      replacement.textContent = input.value || "";
    }
    input.replaceWith(replacement);
  });

  root.querySelectorAll("button").forEach((button) => {
    button.remove();
  });
}

function dataUrlToBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function canvasToLosslessPdfImage(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is not available.");

  const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const rgb = new Uint8Array(canvas.width * canvas.height * 3);
  for (let source = 0, target = 0; source < rgba.length; source += 4, target += 3) {
    const alpha = rgba[source + 3];
    rgb[target] = Math.round((rgba[source] * alpha + 255 * (255 - alpha)) / 255);
    rgb[target + 1] = Math.round((rgba[source + 1] * alpha + 255 * (255 - alpha)) / 255);
    rgb[target + 2] = Math.round((rgba[source + 2] * alpha + 255 * (255 - alpha)) / 255);
  }

  if (typeof CompressionStream === "undefined") return { bytes: rgb };
  const compressed = new CompressionStream("deflate");
  const bytes = new Uint8Array(await new Response(new Blob([rgb]).stream().pipeThrough(compressed)).arrayBuffer());
  return { bytes, filter: "/FlateDecode" as const };
}

async function renderElementToCanvas(element: HTMLElement, exactElementWidth = false) {
  const measuredWidth = Math.max(element.scrollWidth, element.getBoundingClientRect().width);
  const measuredHeight = Math.max(element.scrollHeight, element.getBoundingClientRect().height);
  const width = Math.ceil(exactElementWidth ? measuredWidth : Math.max(measuredWidth, 960));
  const height = Math.ceil(measuredHeight);
  return html2canvas(element, {
    backgroundColor: "#ffffff",
    scale: Math.min(8, Math.max(6, window.devicePixelRatio || 1)),
    useCORS: true,
    width,
    height,
    windowWidth: Math.max(width, window.innerWidth),
    windowHeight: Math.max(height, window.innerHeight),
    onclone: (_, clonedElement) => {
      const root = clonedElement as HTMLElement;
      root.style.boxShadow = "none";
      root.style.border = "0";
      root.querySelectorAll<HTMLElement>(".table-wrap").forEach((wrap) => {
        wrap.style.overflow = "visible";
      });
      normalizeFormControls(root);
    },
  });
}

async function canvasToFullBleedPdfPage(canvas: HTMLCanvasElement, paper: PdfPaper, orientation: PdfOrientation): Promise<PdfImagePage> {
  const { width, height } = paperSize(paper, orientation);
  return {
    ...(await canvasToLosslessPdfImage(canvas)),
    width: canvas.width,
    height: canvas.height,
    drawWidth: width,
    drawHeight: height,
  };
}

async function canvasToPdfPages(canvas: HTMLCanvasElement, paper: PdfPaper, orientation: PdfOrientation): Promise<PdfImagePage[]> {
  const pages: PdfImagePage[] = [];
  const { width: paperWidth, height: paperHeight } = paperSize(paper, orientation);
  const printableWidth = paperWidth - PAGE_MARGIN * 2;
  const printableHeight = paperHeight - PAGE_MARGIN * 2;
  const sliceHeight = Math.floor((printableHeight / printableWidth) * canvas.width);

  for (let top = 0; top < canvas.height; top += sliceHeight) {
    const currentSliceHeight = Math.min(sliceHeight, canvas.height - top);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = currentSliceHeight;
    const context = pageCanvas.getContext("2d");
    if (!context) throw new Error("Canvas is not available.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    context.drawImage(canvas, 0, top, canvas.width, currentSliceHeight, 0, 0, canvas.width, currentSliceHeight);

    const drawHeight = Math.min(printableHeight, (currentSliceHeight / canvas.width) * printableWidth);
    pages.push({
      ...(await canvasToLosslessPdfImage(pageCanvas)),
      width: pageCanvas.width,
      height: pageCanvas.height,
      drawWidth: printableWidth,
      drawHeight,
    });
  }

  return pages;
}

function buildPdf(pages: PdfImagePage[], paper: PdfPaper, orientation: PdfOrientation, pageMargin = PAGE_MARGIN) {
  const { width: paperWidth, height: paperHeight } = paperSize(paper, orientation);
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let byteLength = 0;
  const pageObjectIds: number[] = [];

  function addText(text: string) {
    const bytes = encoder.encode(text);
    chunks.push(bytes);
    byteLength += bytes.length;
  }

  function addBytes(bytes: Uint8Array) {
    chunks.push(bytes);
    byteLength += bytes.length;
  }

  function beginObject(id: number) {
    offsets[id] = byteLength;
    addText(`${id} 0 obj\n`);
  }

  addText("%PDF-1.4\n");

  beginObject(1);
  addText("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  let nextObjectId = 3;
  const pageDefinitions = pages.map((page, index) => {
    const imageObjectId = nextObjectId;
    const contentObjectId = nextObjectId + 1;
    const pageObjectId = nextObjectId + 2;
    nextObjectId += 3;
    pageObjectIds.push(pageObjectId);
    return { ...page, imageObjectId, contentObjectId, pageObjectId, name: `Im${index + 1}` };
  });

  beginObject(2);
  addText(`<< /Type /Pages /Count ${pageDefinitions.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] >>\nendobj\n`);

  for (const page of pageDefinitions) {
    beginObject(page.imageObjectId);
    addText(
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8${page.filter ? ` /Filter ${page.filter}` : ""} /Length ${page.bytes.length} >>\nstream\n`,
    );
    addBytes(page.bytes);
    addText("\nendstream\nendobj\n");

    const x = pageMargin;
    const y = paperHeight - pageMargin - page.drawHeight;
    const commands = `q\n${page.drawWidth.toFixed(2)} 0 0 ${page.drawHeight.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm\n/${page.name} Do\nQ\n`;

    beginObject(page.contentObjectId);
    addText(`<< /Length ${encoder.encode(commands).length} >>\nstream\n${commands}endstream\nendobj\n`);

    beginObject(page.pageObjectId);
    addText(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${paperWidth} ${paperHeight}] /Resources << /XObject << /${page.name} ${page.imageObjectId} 0 R >> >> /Contents ${page.contentObjectId} 0 R >>\nendobj\n`,
    );
  }

  const xrefOffset = byteLength;
  addText(`xref\n0 ${nextObjectId}\n0000000000 65535 f \n`);
  for (let id = 1; id < nextObjectId; id += 1) {
    addText(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  addText(`trailer\n<< /Size ${nextObjectId} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const parts = chunks.map((chunk) => {
    const copy = new Uint8Array(chunk.byteLength);
    copy.set(chunk);
    return copy.buffer;
  });
  return new Blob(parts, { type: "application/pdf" });
}

export type PdfDownloadResult = {
  fileName: string;
  url: string;
};

export async function downloadElementAsPdf(
  element: HTMLElement,
  fileName: string,
  options: { paper?: PdfPaper; orientation?: PdfOrientation; fullBleed?: boolean } = {},
): Promise<PdfDownloadResult> {
  const paper = options.paper ?? "A4";
  const orientation = options.orientation ?? "portrait";
  const fullBleed = options.fullBleed ?? false;
  let pages: PdfImagePage[] = [];

  const childPages = Array.from(element.querySelectorAll(".bulk-report-page")) as HTMLElement[];
  if (childPages.length > 0) {
    for (const child of childPages) {
      const canvas = await renderElementToCanvas(child, fullBleed);
      if (fullBleed) {
        pages.push(await canvasToFullBleedPdfPage(canvas, paper, orientation));
      } else {
        pages.push(...(await canvasToPdfPages(canvas, paper, orientation)));
      }
    }
  } else {
    const canvas = await renderElementToCanvas(element, fullBleed);
    pages = fullBleed
      ? [await canvasToFullBleedPdfPage(canvas, paper, orientation)]
      : await canvasToPdfPages(canvas, paper, orientation);
  }

  const pdf = buildPdf(pages, paper, orientation, fullBleed ? 0 : PAGE_MARGIN);
  const url = URL.createObjectURL(pdf);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  return { fileName, url };
}
