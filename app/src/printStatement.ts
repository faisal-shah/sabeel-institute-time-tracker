// Native side of the print seam (web sibling: printStatement.web.ts).
export const CAN_PRINT = false;

export interface StatementData {
  displayName: string;
  totalLabel: string;
  generatedOn: string;
  rows: { activityName: string; hours: string }[];
}

export function printStatement(_data: StatementData): string {
  return 'Printing is available on the website. Open the site on a computer to print or save a PDF.';
}
