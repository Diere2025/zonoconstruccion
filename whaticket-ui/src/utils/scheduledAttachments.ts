// Scheduling uses the single-file upload endpoint. Reject before creating a
// schedule so unsupported attachments remain in the draft rather than disappearing.
export function validateScheduledAttachments(files: readonly unknown[]): string | null {
  return files.length > 1
    ? 'Podés programar un archivo por mensaje. Quitá los adjuntos extra o envialos juntos ahora.'
    : null;
}
