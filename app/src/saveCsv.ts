// Native side of the CSV-save seam (web sibling: saveCsv.web.ts).
// On Android there's no filesystem picker wired in v1 — managers run exports
// from the website. Keep a clear message rather than a silent no-op.
export async function saveCsv(_filename: string, _csv: string): Promise<string> {
  return 'CSV export is available on the website. Open the site on a computer to download.';
}
