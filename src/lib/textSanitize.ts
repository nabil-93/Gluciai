/**
 * Drop degenerate repetition loops the model sometimes emits (e.g.
 * "…dima khassk tchawe r-r-r-r-r-…" running to the token limit). Any short
 * unit (≤8 chars) repeated 5+ times in a row is the runaway garbage and is
 * removed — normal prose never repeats a short unit that many times, so real
 * answers are left untouched. Mirrors the server-side guard in the ai-chat
 * edge function so already-stored messages also render cleanly.
 */
export function collapseRepeats(s: string): string {
  if (typeof s !== 'string' || !s) return s;
  return s
    // A short unit repeated 5+ times, plus any trailing fragment of it (the
    // [^\s]{0,8} stops at the next space, so real words are never eaten).
    .replace(/(.{1,8}?)\1{4,}[^\s]{0,8}/gs, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
