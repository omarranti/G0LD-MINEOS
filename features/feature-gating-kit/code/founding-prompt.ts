/**
 * Save-gated trigger for the Founding Member prompt.
 *
 * The activation funnel in analytics.ts names the first save as the aha
 * moment, so that is what unlocks the paid pitch for an existing free
 * account. Before the save-flow fix this was unbuildable: `listing_saved`
 * had never once fired, because the save mutation failed server-side on
 * stale sessions.
 *
 * The counter is per-browser localStorage, not a server-side SavedListing
 * count. It is free, it keeps the prompt a purely client concern, and it
 * costs a query we do not need. The tradeoff is that it resets on a new
 * device, so a user can see the prompt twice across browsers. That is
 * acceptable for a first pass; move to a server count if it becomes a
 * complaint.
 *
 * Deliberately NOT wired to the pending-save replay
 * (components/listings/pending-save-replay.tsx). That path completes a save
 * the user made *before* signing up, and it lands on `/explore?welcome=1`
 * where the welcome-activation trigger already owns the moment. Counting it
 * would put the paid interrupt back in the first seconds of a new account,
 * which is exactly what a retired experiment showed hurts activation.
 */

/** Saves required before the founding prompt unlocks. Tune here, one place. */
export const FOUNDING_PROMPT_SAVE_THRESHOLD = 1;

const SAVE_COUNT_KEY = "save-count";

/** Window event dispatched when the save threshold is first crossed. */
export const SAVE_MILESTONE_EVENT = "app:save-milestone";

export interface SaveMilestoneDetail {
  /** Best-effort city slug, used for the quiet-hours commerce check. */
  citySlug?: string;
}

/** City display name to the slug shape used by the city geo config. */
export function citySlugFromName(city: string | undefined): string | undefined {
  if (!city) return undefined;
  const slug = city
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || undefined;
}

/**
 * Record a save and, on the run that crosses the threshold, announce the
 * milestone. Fires on `===` rather than `>=` so it announces exactly once
 * per browser no matter how many times the user saves afterwards.
 */
export function recordSaveForFoundingPrompt(city?: string): void {
  if (typeof window === "undefined") return;

  let count: number;
  try {
    count = Number(localStorage.getItem(SAVE_COUNT_KEY) ?? "0") + 1;
    localStorage.setItem(SAVE_COUNT_KEY, String(count));
  } catch {
    // Private mode or storage disabled. No prompt is the right failure.
    return;
  }

  if (count !== FOUNDING_PROMPT_SAVE_THRESHOLD) return;

  const detail: SaveMilestoneDetail = { citySlug: citySlugFromName(city) };
  window.dispatchEvent(new CustomEvent(SAVE_MILESTONE_EVENT, { detail }));
}
