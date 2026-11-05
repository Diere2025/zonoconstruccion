import jsPDF from 'jspdf';

export interface CatalogUnit {
    code: string;
    name: string;
    condition: string;
    state: string;
    reason: string;
    defect: string;
    list_price: number;
    discount: number;
    final_price: number;
    image_urls: string[];
}
export interface CatalogPhoto { data: string | Uint8Array; width?: number; height?: number }
const money = (value: number) => '$' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(value);
export const tankAccessories = 'Todos los tanques incluyen aro, tapa, brida y aireador, aunque no se vean en las fotos.';

/** The same renderer powers browser downloads and the rendered PDF verification. */
export async function createOutletCatalogPdf(
    units: CatalogUnit[],
    loadPhoto: (url: string) => Promise<CatalogPhoto>,
    generatedAt = new Date(),
    allowEmpty = false,
) {
    const available = units.filter(u => u.state === 'available').sort((a, b) => a.code.localeCompare(b.code, 'es', { numeric: true }));
    if (!available.length && !allowEmpty) throw new Error('No hay unidades disponibles para el catálogo.');
    const unitPhotos: CatalogPhoto[][] = available.map(() => []);
    let nextPhotoUnit = 0;
    // Four simultaneous downloads keep a full catalogue responsive without flooding storage.
    await Promise.all(Array.from({ length: Math.min(4, available.length) }, async () => {
        while (nextPhotoUnit < available.length) {
            const index = nextPhotoUnit++, unit = available[index];
            for (const url of unit.image_urls.slice(0, 3)) {
                try { unitPhotos[index].push(await loadPhoto(url)); }
                catch { throw new Error(`No se pudo descargar una foto de ${unit.code}. Volvé a generar el catálogo.`); }
            }
        }
    }));
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    pdf.setProperties({ title: 'ZONO | Segunda y Outlet', subject: 'Catálogo de unidades disponibles', author: 'Zono Construcción' });
    const issued = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(generatedAt);
    const ink = () => pdf.setTextColor(23, 37, 84);
    const blue = () => pdf.setTextColor(37, 99, 235);
    let cursor = 57;
    const header = () => {
        pdf.setFillColor(37, 99, 235); pdf.rect(0, 0, 210, 3, 'F');
        ink(); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(23); pdf.text('ZONO', 14, 16);
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.text('CONSTRUCCIÓN', 14, 21);
        pdf.setTextColor(100, 116, 139); pdf.setFontSize(8); pdf.text(issued, 196, 13, { align: 'right' });
        pdf.text(`${available.length} unidades disponibles`, 196, 19, { align: 'right' });
        ink(); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(20); pdf.text('Segunda y Outlet', 14, 33);
        pdf.setFillColor(239, 246, 255); pdf.roundedRect(14, 39, 182, 12, 2, 2, 'F');
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); blue();
        pdf.text(pdf.splitTextToSize(tankAccessories, 172), 19, 44);
    };
    header();
    if (!available.length) {
        ink(); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(12);
        pdf.text('En este momento no hay unidades disponibles.', 14, 67);
    }
    for (const [unitIndex, unit] of available.entries()) {
        if (!Number.isFinite(Number(unit.final_price)) || !Number.isFinite(Number(unit.list_price))) throw new Error(`Revisá el precio de ${unit.code}.`);
        const photos = unitPhotos[unitIndex];
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12);
        const nameLines = pdf.splitTextToSize(unit.name, 78) as string[];
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
        const detail = [unit.reason.trim(), unit.defect.trim()].filter((v, i, a) => v && a.indexOf(v) === i).join('\n');
        const detailLines = pdf.splitTextToSize(detail || 'Consultar condición de la unidad.', 78) as string[];
        // Long descriptions continue on another card rather than being cut off or shrunk.
        let offset = 0;
        do {
            const lines = detailLines.slice(offset, offset + 30);
            const titleHeight = nameLines.length * 4.8;
            const height = Math.max(105, 44 + titleHeight + lines.length * 4);
            if (cursor + height > 278) { pdf.addPage(); header(); cursor = 57; }
            pdf.setDrawColor(219, 228, 241); pdf.setLineWidth(0.3); pdf.setFillColor(255, 255, 255);
            pdf.roundedRect(14, cursor, 182, height, 3, 3, 'FD');
            blue(); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11);
            pdf.text(`${unit.code}${offset ? ' / continuación' : ''}`, 20, cursor + 10);
            pdf.setFontSize(8); pdf.setTextColor(100, 116, 139);
            pdf.text(unit.condition === 'segunda' ? 'SEGUNDA' : 'OUTLET', 190, cursor + 10, { align: 'right' });
            const fitImage = (photo: CatalogPhoto, x: number, y: number, w: number, h: number) => {
                const dimensions = photo.width && photo.height ? photo : pdf.getImageProperties(photo.data);
                const imageWidth = dimensions.width!, imageHeight = dimensions.height!;
                const scale = Math.min(w / imageWidth, h / imageHeight);
                const width = imageWidth * scale, height = imageHeight * scale;
                pdf.addImage(photo.data, x + (w - width) / 2, y + (h - height) / 2, width, height, undefined, 'FAST');
            };
            pdf.setFillColor(248, 250, 252); pdf.roundedRect(20, cursor + 17, 86, 76, 2, 2, 'F');
            if (photos.length) {
                if (photos.length === 1) fitImage(photos[0], 21, cursor + 18, 84, 74);
                else {
                    fitImage(photos[0], 21, cursor + 18, 56, 74);
                    photos.slice(1).forEach((p, i) => fitImage(p, 79, cursor + 18 + i * 38, 26, 36));
                }
            } else {
                pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(100, 116, 139);
                pdf.text('Sin foto', 63, cursor + 56, { align: 'center' });
            }
            ink(); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12);
            pdf.text(nameLines, 112, cursor + 22, { lineHeightFactor: 1.13 });
            const priceY = cursor + 24 + titleHeight;
            pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(100, 116, 139);
            pdf.text(`Lista ${money(Number(unit.list_price))}  /  -${unit.discount}%`, 112, priceY);
            blue(); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(20); pdf.text(money(Number(unit.final_price)), 112, priceY + 10);
            ink(); pdf.setFontSize(8); pdf.text('CONDICIÓN DE LA UNIDAD', 112, priceY + 19);
            pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(71, 85, 105);
            pdf.text(lines, 112, priceY + 25, { lineHeightFactor: 1.26 });
            offset += lines.length;
            cursor += height + 7;
        } while (offset < detailLines.length);
    }
    const pages = pdf.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
        pdf.setPage(page); pdf.setDrawColor(226, 232, 240); pdf.line(14, 282, 196, 282);
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(100, 116, 139);
        pdf.text('Unidades únicas. Precios y disponibilidad sujetos a confirmación al realizar el pedido.', 14, 288);
        pdf.text(`${page} / ${pages}`, 196, 288, { align: 'right' });
    }
    return pdf;
}

export async function downloadOutletCatalogPdf(units: CatalogUnit[]) {
    const pdf = await createOutletCatalogPdf(units, async url => {
        const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error('No se pudo cargar la foto.');
        const bitmap = await createImageBitmap(await response.blob());
        try {
            const scale = Math.min(1, 1100 / Math.max(bitmap.width, bitmap.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('No se pudo preparar la foto.');
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            return { data: canvas.toDataURL('image/jpeg', 0.82), width: canvas.width, height: canvas.height };
        } finally { bitmap.close(); }
    });
    const date = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date()).replaceAll('/', '-');
    pdf.save(`ZONO-Segunda-y-Outlet-${date}.pdf`);
}
