export class SupportError extends Error {
    constructor(message: string, public status = 422) { super(message); }
}
export function uuid(value: unknown): string {
    if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
        throw new SupportError('El identificador no es válido.');
    return value;
}
export function object(value: unknown): Record<string, unknown> {
    if (!value || Array.isArray(value) || typeof value !== 'object')
        throw new SupportError('Los datos enviados no son válidos.');
    return value as Record<string, unknown>;
}
export function text(value: unknown, max = 10000): string {
    if (typeof value !== 'string' || value.length > max)
        throw new SupportError('Revisá la extensión del texto enviado.');
    return value.trim();
}
export function operation(value: unknown) {
    const input = object(value);
    const key = uuid(input.idempotencyKey);
    const data = object(input.payload ?? {});
    if (input.expectedVersion !== undefined && (!Number.isSafeInteger(input.expectedVersion) || Number(input.expectedVersion) < 1))
        throw new SupportError('La versión del ticket no es válida.');
    const attachments = data.attachments;
    if (attachments !== undefined && (!Array.isArray(attachments) || attachments.length > 5))
        throw new SupportError('Podés enviar hasta 5 imágenes.');
    if (Array.isArray(attachments))
        attachments.forEach(uuid);
    if (data.body !== undefined)
        text(data.body);
    if (data.solution !== undefined)
        text(data.solution);
    return { key, data, version: input.expectedVersion === undefined ? null : Number(input.expectedVersion) };
}
export function inspectImage(bytes: Uint8Array, claimedMime: string) {
    if (!bytes.length || bytes.length > 10 * 1024 * 1024)
        throw new SupportError('Cada imagen puede pesar hasta 10 MB.', 413);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const ascii = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));
    let mime = '';
    let width = 0;
    let height = 0;
    if (bytes.length >= 33 && bytes.slice(0, 8).every((v, i) => v === [137, 80, 78, 71, 13, 10, 26, 10][i]) && ascii(12, 4) === 'IHDR') {
        mime = 'image/png';
        width = view.getUint32(16);
        height = view.getUint32(20);
        let offset = 8;
        let data = false;
        let end = false;
        while (offset + 12 <= bytes.length) {
            const length = view.getUint32(offset);
            const chunk = ascii(offset + 4, 4);
            if (offset + length + 12 > bytes.length || (offset === 8 && length !== 13))
                break;
            if (chunk === 'IDAT' && length > 0)
                data = true;
            if (chunk === 'IEND' && length === 0 && offset + 12 === bytes.length) {
                end = true;
                break;
            }
            offset += length + 12;
        }
        if (!data || !end)
            throw new SupportError('La imagen PNG está incompleta o dañada.');
    }
    else if (bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9) {
        mime = 'image/jpeg';
        let i = 2;
        while (i + 4 < bytes.length) {
            if (bytes[i++] !== 0xff)
                break;
            while (bytes[i] === 0xff)
                i++;
            const marker = bytes[i++];
            if (marker === 0xd9 || marker === 0xda)
                break;
            if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7))
                continue;
            if (i + 2 > bytes.length)
                break;
            const length = view.getUint16(i);
            if (length < 2 || i + length > bytes.length)
                break;
            if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 8) {
                height = view.getUint16(i + 3);
                width = view.getUint16(i + 5);
                break;
            }
            i += length;
        }
    }
    else if (bytes.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP' && view.getUint32(4, true) + 8 === bytes.length) {
        mime = 'image/webp';
        const chunk = ascii(12, 4);
        if (chunk === 'VP8X') {
            width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
            height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
        }
        if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
            width = view.getUint16(26, true) & 0x3fff;
            height = view.getUint16(28, true) & 0x3fff;
        }
        if (chunk === 'VP8L' && bytes[20] === 0x2f) {
            const bits = view.getUint32(21, true);
            width = (bits & 0x3fff) + 1;
            height = ((bits >>> 14) & 0x3fff) + 1;
        }
    }
    if (!mime || mime !== claimedMime || width < 1 || height < 1 || width * height > 100000000)
        throw new SupportError('Elegí una imagen JPG, PNG o WebP válida.');
    return { mime, width, height };
}
const dbErrors: Record<string, [
    number,
    string
]> = {
    SUPPORT_FORBIDDEN: [403, 'No tenés permiso para realizar esta acción.'],
    SUPPORT_NOT_FOUND: [404, 'No se encontró la incidencia.'],
    SUPPORT_CONFLICT: [409, 'La incidencia cambió. Actualizá y revisá la información antes de volver a enviar.'],
    SUPPORT_INVALID: [422, 'Revisá los datos y el estado de la incidencia.'],
    SUPPORT_BODY_REQUIRED: [422, 'Escribí la respuesta o el motivo de esta acción.'],
    SUPPORT_SOLUTION_REQUIRED: [422, 'Indicá qué se solucionó antes de pedir una prueba.'],
    SUPPORT_IMPACT_REQUIRED: [422, 'Explicá qué operación está bloqueada para sugerir prioridad crítica.'],
    SUPPORT_REQUESTER_INACTIVE: [422, 'El solicitante está desactivado. Revisá el caso antes de pedirle una acción.'],
    SUPPORT_LAST_ADMIN: [422, 'Debe quedar al menos un administrador activo.'],
    SUPPORT_SECTOR_OPEN: [422, 'Transferí las incidencias abiertas antes de desactivar el sector.'],
    SUPPORT_UPLOAD_INVALID: [422, 'La imagen ya se usó, venció o no corresponde a este envío.'],
    SUPPORT_UPLOAD_LIMIT: [413, 'Se superó el límite de imágenes. Quitá archivos o enviá menos imágenes.'],
    SUPPORT_RATE_LIMIT: [429, 'Se enviaron muchas acciones. Esperá un minuto e intentá nuevamente.'],
};
export function databaseError(error: {
    message?: string;
    code?: string;
} | null) {
    if (!error)
        return;
    const entry = Object.entries(dbErrors).find(([key]) => error.message?.includes(key))?.[1];
    if (entry)
        throw new SupportError(entry[1], entry[0]);
    if (['23514', '23502', '22P02', '23505', '23503', '22023'].includes(error.code || ''))
        throw new SupportError('Revisá los campos enviados; hay datos inválidos o repetidos.');
    throw new SupportError('No se pudo completar la operación. Intentá nuevamente.', 503);
}
