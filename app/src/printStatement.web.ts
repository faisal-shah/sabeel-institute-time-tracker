// Web side of the print seam (native sibling: printStatement.ts).
// Opens a clean, self-contained statement in a new window and triggers print;
// the org can print to paper or "Save as PDF".
export const CAN_PRINT = true;

export interface StatementData {
  displayName: string;
  totalLabel: string;
  generatedOn: string;
  rows: { activityName: string; hours: string }[];
}

export function printStatement(data: StatementData): string {
  const esc = (s: string) =>
    s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string);
  const rows = data.rows
    .map((r) => `<tr><td>${esc(r.activityName)}</td><td class="num">${esc(r.hours)}</td></tr>`)
    .join('');
  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Volunteer hours — ${esc(data.displayName)}</title>
<style>
  /* Sabeel brand palette (see app/src/theme.ts): raspberry headings, taupe
     support text, warm-ivory paper, gold rule accents. */
  body { font-family: Georgia, serif; color: #2B2320; background: #FDF8EF; max-width: 640px; margin: 48px auto; padding: 0 24px; }
  h1 { color: #82163A; font-size: 22px; margin-bottom: 4px; }
  .sub { color: #7C6A5A; margin-top: 0; border-bottom: 1px solid #D09749; padding-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 24px; }
  th, td { text-align: left; padding: 8px 4px; border-bottom: 1px solid #DFD5C4; }
  th.num, td.num { text-align: right; }
  tfoot td { font-weight: bold; border-top: 2px solid #82163A; border-bottom: none; }
  .foot { margin-top: 40px; color: #7C6A5A; font-size: 13px; }
  @media print { body { margin: 0; } }
</style></head><body>
  <img src="/logo.png" alt="Sabeel Institute" style="width:180px;display:block;margin-bottom:16px" onerror="this.remove()">
  <h1>Statement of Volunteer Hours</h1>
  <p class="sub">Sabeel Institute · generated ${esc(data.generatedOn)}</p>
  <p><strong>${esc(data.displayName)}</strong></p>
  <table>
    <thead><tr><th>Activity</th><th class="num">Hours</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td>Total</td><td class="num">${esc(data.totalLabel)}</td></tr></tfoot>
  </table>
  <p class="foot">This statement reflects hours recorded in the Sabeel Institute Time Tracker.</p>
</body></html>`;
  const w = window.open('', '_blank');
  if (!w) return 'Please allow pop-ups to print the statement.';
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
  return 'Opened the printable statement.';
}
