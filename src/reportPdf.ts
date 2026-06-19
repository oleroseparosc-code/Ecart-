import html2canvas from "html2canvas";

type PdfImagePage = {
  bytes: Uint8Array;
  width: number;
  height: number;
  drawWidth: number;
  drawHeight: number;
};

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const PAGE_MARGIN = 24;

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

async function renderElementToCanvas(element: HTMLElement) {
  const width = Math.ceil(Math.max(element.scrollWidth, element.getBoundingClientRect().width, 960));
  return html2canvas(element, {
    backgroundColor: "#ffffff",
    scale: Math.min(2, Math.max(1, window.devicePixelRatio || 1)),
    useCORS: true,
    width,
    windowWidth: Math.max(width, window.innerWidth),
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

function canvasToPdfPages(canvas: HTMLCanvasElement): PdfImagePage[] {
  const pages: PdfImagePage[] = [];
  const printableWidth = A4_WIDTH - PAGE_MARGIN * 2;
  const printableHeight = A4_HEIGHT - PAGE_MARGIN * 2;
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
      bytes: dataUrlToBytes(pageCanvas.toDataURL("image/jpeg", 0.92)),
      width: pageCanvas.width,
      height: pageCanvas.height,
      drawWidth: printableWidth,
      drawHeight,
    });
  }

  return pages;
}

function buildPdf(pages: PdfImagePage[]) {
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
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`,
    );
    addBytes(page.bytes);
    addText("\nendstream\nendobj\n");

    const x = PAGE_MARGIN;
    const y = A4_HEIGHT - PAGE_MARGIN - page.drawHeight;
    const commands = `q\n${page.drawWidth.toFixed(2)} 0 0 ${page.drawHeight.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm\n/${page.name} Do\nQ\n`;

    beginObject(page.contentObjectId);
    addText(`<< /Length ${encoder.encode(commands).length} >>\nstream\n${commands}endstream\nendobj\n`);

    beginObject(page.pageObjectId);
    addText(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_WIDTH} ${A4_HEIGHT}] /Resources << /XObject << /${page.name} ${page.imageObjectId} 0 R >> >> /Contents ${page.contentObjectId} 0 R >>\nendobj\n`,
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

export async function downloadElementAsPdf(element: HTMLElement, fileName: string): Promise<PdfDownloadResult> {
  const canvas = await renderElementToCanvas(element);
  const pages = canvasToPdfPages(canvas);
  const pdf = buildPdf(pages);
  const url = URL.createObjectURL(pdf);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  return { fileName, url };
}
