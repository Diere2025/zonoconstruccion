export interface MediaSendStep<T> {
  file: T;
  body: string;
}

// WhatsApp entrega cada archivo como un mensaje independiente. Solo el primero
// debe llevar el texto compuesto para no duplicar una respuesta rápida.
export function createMediaSendPlan<T>(files: readonly T[], body: string): MediaSendStep<T>[] {
  return files.map((file, index) => ({ file, body: index === 0 ? body : '' }));
}
