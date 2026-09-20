export async function waitForPrintImages(rootId: string, timeoutMs = 4000): Promise<void> {
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  const root = document.getElementById(rootId);
  if (!root) return;

  const images = Array.from(root.querySelectorAll('img'));
  await Promise.all(images.map(image => {
    if (image.complete && image.naturalWidth > 0) return Promise.resolve();
    return new Promise<void>(resolve => {
      const finish = () => {
        window.clearTimeout(timeout);
        image.removeEventListener('load', finish);
        image.removeEventListener('error', finish);
        resolve();
      };
      const timeout = window.setTimeout(finish, timeoutMs);
      image.addEventListener('load', finish, { once: true });
      image.addEventListener('error', finish, { once: true });
    });
  }));
}
