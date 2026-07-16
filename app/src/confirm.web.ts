// Web side of the confirm seam (native sibling: confirm.ts).

/** OK/Cancel confirmation; resolves true when the user confirms. */
export function confirmAction(title: string, message: string): Promise<boolean> {
  return Promise.resolve(window.confirm(`${title}\n\n${message}`));
}
