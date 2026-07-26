/**
 * Where the bottom bar's + button actually is, in window coordinates.
 *
 * The add menu is a transparent modal: the bar stays visible underneath it,
 * so the menu's close button has to land exactly on the + for the two to
 * read as one control turning into a cross. Copying the bar's paddings and
 * column count into the menu worked until one of them changed — this is the
 * measured truth instead, published by the bar itself.
 *
 * Deliberately a module value and not a React context: the menu is a route
 * OUTSIDE the tabs layout, so it is not under the tab-bar provider and could
 * never read a context the bar writes.
 */
export interface TabFabAnchor {
  /** Window-space top-left of the button. */
  x: number;
  y: number;
  /** Diameter, so the menu can match the size as well as the position. */
  size: number;
}

let anchor: TabFabAnchor | null = null;

export function setTabFabAnchor(next: TabFabAnchor) {
  // A zero-sized measurement means the bar is mid-layout; keep the last good
  // one rather than sending the menu's button to the corner of the screen.
  if (next.size > 0) anchor = next;
}

export function getTabFabAnchor(): TabFabAnchor | null {
  return anchor;
}
