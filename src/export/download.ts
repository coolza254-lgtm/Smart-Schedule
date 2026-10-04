interface DownloadsApi {
  save(req: { filename: string; data: Blob }): Promise<unknown>;
}
interface ClaudeHost {
  use(name: 'downloads'): Promise<DownloadsApi | null>;
}

/**
 * Save a generated file on the device. Inside a claude.ai page, saves go
 * through the host's downloads capability (plain download links are blocked
 * there); everywhere else a normal browser download is used.
 */
export async function download(blob: Blob, filename: string): Promise<void> {
  const host = (window as unknown as { claude?: ClaudeHost }).claude;
  if (host?.use) {
    const api = await host.use('downloads').catch(() => null);
    if (api) {
      try {
        await api.save({ filename, data: blob });
      } catch {
        // Declined or unavailable: the viewer already saw the host's prompt.
      }
      return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
