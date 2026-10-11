/**
 * Hover-panel action contract — the extension point a sibling plugin uses to
 * add its own button to the pet's floating hover panel (issue #6).
 *
 * A plugin registers one action in process through the pet service
 * (`ctx.pet.registerPanelAction({ id, label, onSelect })`); the host validates
 * it into a bounded view, serves the registered actions in the state snapshot
 * (`PetStateView.panelActions`), and the browser half renders one button per
 * entry at the end of the panel's action row. A click travels back through
 * `POST /api/pet/panel-action`, which dispatches to the registering plugin's
 * own callback — the pet owns the row, the plugin owns what the button does.
 *
 * The validation and the registry live in this pure module so the contract has
 * exactly one home and stays testable without the cordis service.
 * @module @linxin666/dsh-pet/panel-actions
 */

/** How many plugin actions one hover panel can carry at most. */
export const MAX_PANEL_ACTIONS = 8

/**
 * Action id grammar: a lowercase id in the shape pet and decoration ids use
 * (`^` + kebab/dot segments). The id is what a click travels back on, so it
 * has to be stable, addressable and free of separators the wire would treat as
 * structure.
 */
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/

/**
 * Label bound. The action row is compact and wraps beyond a few characters per
 * button, so a plugin names its action (换装, Quota) rather than a sentence;
 * the optional title carries the longer explanation as a tooltip.
 */
const LABEL_MAX = 24

/** Title (tooltip) bound; the same reason voice-pack labels are bounded. */
const TITLE_MAX = 80

/** One registered action as the browser half renders it. */
export interface PetPanelActionView {
  /** Registration id; the click dispatches back on it. */
  id: string
  /** Button label. */
  label: string
  /** Optional tooltip (the label's longer explanation). */
  title?: string
  /** Sort key within the registered block; ties break on id. */
  order: number
}

/**
 * What a panel action click knows about the pet at the moment it arrives. The
 * registering plugin may read more off the service (`selectedPetId()`), so this
 * stays a read-only snapshot rather than a live handle.
 */
export interface PetPanelActionContext {
  /** The selected pet id when the click arrived. */
  petId: string
}

/** The callback a registration carries; a click invokes it in the host. */
export type PetPanelActionHandler = (context: PetPanelActionContext) => void | Promise<void>

/** One action a sibling plugin registers into the panel's action row. */
export interface PetPanelActionRegistration {
  /** Unique, stable id (kebab-case); re-registering the same id replaces it. */
  id: string
  /** Button label (bounded). */
  label: string
  /** Optional tooltip rendered as the button's `title`. */
  title?: string
  /** Sort key within the registered block (default 0; ascending, ties on id). */
  order?: number
  /** Invoked in the host when the browser half dispatches this action. */
  onSelect: PetPanelActionHandler
}

/** A validated registration: the wire view plus the host-side callback. */
interface PanelActionEntry {
  view: PetPanelActionView
  onSelect: PetPanelActionHandler
}

function boundedString(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max)
}

/**
 * Validate one registration. Returns undefined — never throws — when the shape
 * is unusable: the id must match the id grammar and the label must survive
 * truncation, so a click can always be dispatched back to a known row.
 * @param input - the registration a sibling plugin passed to the service.
 * @returns the wire view, or undefined when the registration is malformed.
 */
export function normalizePanelAction(input: unknown): PetPanelActionView | undefined {
  if (typeof input !== 'object' || input === null) return undefined
  const data = input as Record<string, unknown>
  // The id is an identity, not copy: an over-long one is refused rather than
  // truncated, because truncating it could silently collapse two plugins'
  // registrations onto one row.
  const id = typeof data.id === 'string' ? data.id.trim() : undefined
  if (id === undefined || !ID_PATTERN.test(id)) return undefined
  const label = boundedString(data.label, LABEL_MAX)
  if (label === undefined) return undefined
  const title = boundedString(data.title, TITLE_MAX)
  const order = typeof data.order === 'number' && Number.isFinite(data.order) ? data.order : 0
  return {
    id,
    label,
    ...(title === undefined ? {} : { title }),
    order,
  }
}

/**
 * The panel's action registry: one bounded, ordered table of plugin actions.
 *
 * Registration is id-wins (a later registration of the same id replaces the
 * earlier one, and the superseded disposer stops touching the table so a
 * disposing plugin can never remove the action that replaced it). The table is
 * in-memory only — it dies with the pet service fiber — and every entry is
 * reclaimed by the disposer the registering plugin runs with its own fiber.
 */
export class PanelActionRegistry {
  private readonly actions = new Map<string, PanelActionEntry>()

  /**
   * Register one action.
   * @param input - the registration a sibling plugin passed to the service.
   * @returns a disposer removing this registration.
   * @throws when the registration is malformed. Unlike `announce` — a hot path
   * whose payload a caller may build from untrusted data — a registration is
   * built once at the registering plugin's own apply, so a bad id or label is a
   * wiring mistake that should fail where it was written.
   */
  register(input: unknown): () => void {
    const registration = (typeof input === 'object' && input !== null ? input : {}) as PetPanelActionRegistration
    const view = normalizePanelAction(registration)
    if (view === undefined) throw new Error('[dsh-pet] invalid panel action: id and label are required')
    if (typeof registration.onSelect !== 'function') {
      throw new Error('[dsh-pet] invalid panel action: onSelect must be a function')
    }
    if (!this.actions.has(view.id) && this.actions.size >= MAX_PANEL_ACTIONS) {
      throw new Error('[dsh-pet] panel action limit reached: ' + MAX_PANEL_ACTIONS)
    }
    const entry: PanelActionEntry = { view, onSelect: registration.onSelect }
    this.actions.set(view.id, entry)
    return () => {
      // Only the registration that still owns the id may clear it.
      if (this.actions.get(view.id) === entry) this.actions.delete(view.id)
    }
  }

  /** The registered actions as the state view serves them, in render order. */
  views(): PetPanelActionView[] {
    return [...this.actions.values()]
      .map(entry => entry.view)
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  }

  /**
   * Dispatch a click to the plugin that registered this id.
   * @param id - the id the browser half reported.
   * @param context - what the pet looked like when the click arrived.
   * @returns whether the id was registered. A handler that throws rejects:
   * the caller decides how a sibling plugin's failure is reported.
   */
  async select(id: string, context: PetPanelActionContext): Promise<boolean> {
    const entry = this.actions.get(id)
    if (entry === undefined) return false
    await entry.onSelect(context)
    return true
  }

  /** Drop every registration (service teardown; tests). */
  clear(): void {
    this.actions.clear()
  }
}
