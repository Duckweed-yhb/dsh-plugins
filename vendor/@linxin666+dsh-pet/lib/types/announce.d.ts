/**
 * The pet announcement-bubble contract: a sibling plugin
 * pushes one structured announcement through `pet.announce(...)`, the host
 * validates it into a bounded payload, and the browser half renders it as a
 * dedicated, specially styled bubble above the session bubble stack.
 *
 * One slot per publisher (issue #1812): `source` is the slot key, so two
 * announcing plugins coexist instead of displacing each other, and each keeps
 * its own TTL. The single-slot contract this replaced is kept on the wire as
 * the freshest entry, so an older browser half keeps working unchanged.
 *
 * The validation lives in this pure module so the wire contract has exactly
 * one home and stays testable without the cordis service.
 * @module @linxin666/dsh-pet/announce
 */
/** One plugin-authored announcement bubble. */
export interface PetAnnouncement {
    /** Authoring plugin's source tag (its own package short name). */
    source: string;
    /** Bubble content kind: a spend estimate, an account balance, or a plan-quota status. */
    kind: 'balance' | 'cost' | 'plan';
    /** Lead text (usually the provider display name). */
    title: string;
    /** Balance or today-spend amount, formatted for display (kinds `balance` and `cost`). */
    amount?: string;
    /** Plan usage percent 0-100 (kind `plan`). */
    percent?: number;
    /** ISO 8601 reset instant (kind `plan`). */
    resetAt?: string;
    /** Short trailing note (plan tier name, peak-period status, currency code, ...). */
    note?: string;
    /** Visual tone; drives the bubble's accent color. */
    tone: 'ok' | 'warn' | 'low';
    /** Freshness window in ms; an expired announcement stops rendering. */
    ttlMs: number;
    /** Epoch ms the announcement arrived. */
    at: number;
}
/** Default freshness window. */
export declare const ANNOUNCE_DEFAULT_TTL_MS = 10000;
/**
 * How many publishers can hold an announcement bubble at once (issue #1812).
 *
 * The contract has exactly one slot per `source` — that is the whole upgrade
 * from the single-slot design — but the pet's bubble stack is a finite column,
 * so the table is bounded rather than open. The bound is deliberately above the
 * realistic publisher count (a quota bubble, a balance bubble, a notification):
 * it exists so a misbehaving publisher that rotates `source` per bubble cannot
 * grow the pet's stack without limit.
 */
export declare const MAX_ANNOUNCEMENTS = 4;
/**
 * Hard TTL ceiling. A repeating announcer declares its poll cadence as
 * the TTL, so an always-on bubble stays continuous across polls; the
 * ceiling means a source that dies unmounts its bubble within at most one
 * missed refresh cycle rather than lingering forever.
 */
export declare const ANNOUNCE_MAX_TTL_MS = 7200000;
/**
 * Validate one announce payload. Unknown fields are dropped, oversized text
 * is truncated, and anything structurally wrong resolves to undefined — a
 * malformed announcement never reaches the pet's bubble surface.
 * @param input - the payload a sibling plugin passed to `pet.announce`.
 * @param now - epoch ms the announcement arrived.
 */
export declare function parseAnnouncement(input: unknown, now: number): PetAnnouncement | undefined;
/** Whether an announcement is still fresh at `now`. */
export declare function announcementFresh(announcement: PetAnnouncement, now: number): boolean;
//# sourceMappingURL=announce.d.ts.map