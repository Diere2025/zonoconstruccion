import jsPDF from "jspdf";

/** Trim only transparent or pure-white rows at the bottom of the capture. */
function getContentHeight(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) return canvas.height;
  try {
    // Read in strips to avoid duplicating the entire high-resolution image.
    for (let end = canvas.height; end > 0;) {
      const start = Math.max(0, end - 128);
      const { data } = context.getImageData(0, start, canvas.width, end - start);
      for (let y = end - start - 1; y >= 0; y--) {
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          if (data[i + 3] !== 0 && (data[i] < 255 || data[i + 1] < 255 || data[i + 2] < 255)) {
            return start + y + 1;
          }
        }
      }
      end = start;
    }
    return 0;
  } catch {
    // If pixel reads are unavailable, preserve the full capture.
    return canvas.height;
  }
}

/** Paginate a complete document capture without splitting ordinary rows or totals. */
export function createPrintablePdf(canvas: HTMLCanvasElement, documentElement: HTMLElement) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 10;
  const width = pdf.internal.pageSize.getWidth() - margin * 2;
  const pixelsPerMm = canvas.width / width;
  const pageHeight = Math.floor((pdf.internal.pageSize.getHeight() - margin * 2) * pixelsPerMm);
  const contentHeight = getContentHeight(canvas);
  const bounds = documentElement.getBoundingClientRect();
  const scale = canvas.height / bounds.height;
  const blocks = Array.from(documentElement.querySelectorAll("tr, [data-pdf-keep-together]"))
    .map(element => {
      const rect = element.getBoundingClientRect();
      return { top: Math.round((rect.top - bounds.top) * scale), bottom: Math.round((rect.bottom - bounds.top) * scale) };
    });

  let start = 0;
  while (start < contentHeight) {
    let end = Math.min(start + pageHeight, contentHeight);
    // Move the break above a crossing block. Oversized blocks must still advance.
    if (end < contentHeight) {
      let changed = true;
      while (changed) {
        changed = false;
        for (const block of blocks) {
          if (block.top > start && block.top < end && block.bottom > end && block.bottom - block.top <= pageHeight) {
            end = block.top;
            changed = true;
          }
        }
      }
    }
    const page = document.createElement("canvas");
    page.width = canvas.width;
    page.height = end - start;
    const context = page.getContext("2d");
    if (!context) throw new Error("No se pudo preparar una página del PDF.");
    context.drawImage(canvas, 0, start, canvas.width, page.height, 0, 0, page.width, page.height);
    if (start > 0) pdf.addPage();
    pdf.addImage(page, "PNG", margin, margin, width, page.height / pixelsPerMm, undefined, "FAST");
    start = end;
  }
  return pdf;
}
