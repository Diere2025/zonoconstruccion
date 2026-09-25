export type ImageUploadPreset = 'catalog' | 'document';

/** Prepare user photos before uploading them to Storage. PDFs and other attachments pass through. */
export async function optimizeImageUpload(file: File, preset: ImageUploadPreset = 'catalog'): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (file.size > 30 * 1024 * 1024) throw new Error('La imagen supera el límite de 30 MB.');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('No se pudo leer la imagen. Elegí una foto JPG, PNG o WebP.');
  }

  try {
    const maxDimension = preset === 'document' ? 2200 : 1600;
    const targetBytes = preset === 'document' ? 1_600_000 : 900_000;
    let scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    let result: Blob | null = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No se pudo preparar la imagen.');
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const quality = preset === 'document' ? Math.max(0.76, 0.91 - attempt * 0.04) : Math.max(0.7, 0.85 - attempt * 0.05);
      result = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', quality));
      if (!result || result.type !== 'image/webp') {
        context.globalCompositeOperation = 'destination-over';
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        result = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      }
      if (!result) throw new Error('No se pudo comprimir la imagen.');
      if (result.size <= targetBytes || attempt === 5) break;
      scale *= 0.82;
    }
    if (!result) throw new Error('No se pudo comprimir la imagen.');
    const extension = result.type === 'image/webp' ? 'webp' : 'jpg';
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'imagen';
    return new File([result], `${baseName}.${extension}`, { type: result.type, lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}
