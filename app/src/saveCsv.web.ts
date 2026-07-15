// Web side of the CSV-save seam (native sibling: saveCsv.ts).
export async function saveCsv(filename: string, csv: string): Promise<string> {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return `Downloaded ${filename}`;
}
