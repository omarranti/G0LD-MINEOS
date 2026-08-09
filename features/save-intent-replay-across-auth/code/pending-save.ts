/**
 * Pending-save handoff across the signup redirect.
 *
 * A logged-out visitor tapping "save" is the free-account acquisition moment:
 * we route them to /signup and they come back to the same listing. Before this
 * module existed, the save itself was dropped on the floor, so the user landed
 * back on the page they started from with nothing saved and no prompt telling
 * them to try again. `save_signup_prompt` fired; `listing_saved` never has, not
 * once in the project's history.
 *
 * The listing id is parked in localStorage on the way out and replayed by
 * <PendingSaveReplay> once a session exists. Entries expire so a save intent
 * abandoned days ago doesn't fire on some unrelated later login.
 */

const KEY = "pending_save";
const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

export type PendingSaveSource =
  | "detail_page"
  | "city_hub"
  | "pseo_card"
  | "explore_card";

export interface PendingSave {
  listingId: string;
  source: PendingSaveSource;
  at: number;
}

export function rememberPendingSave(
  listingId: string,
  source: PendingSaveSource,
): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ listingId, source, at: Date.now() } satisfies PendingSave),
    );
  } catch {
    // localStorage unavailable (private mode, blocked storage). The signup
    // redirect still happens; only the replay is lost.
  }
}

/**
 * Read the pending save and clear it in the same breath. Clearing on read is
 * what keeps a remount or a double-invoked effect from replaying the same
 * save twice.
 */
export function takePendingSave(): PendingSave | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    localStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as Partial<PendingSave>;
    if (!parsed.listingId || !parsed.at) return null;
    if (Date.now() - parsed.at > MAX_AGE_MS) return null;
    return {
      listingId: parsed.listingId,
      source: parsed.source ?? "city_hub",
      at: parsed.at,
    };
  } catch {
    return null;
  }
}
