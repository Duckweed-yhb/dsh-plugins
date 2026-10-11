/**
 * Pet host service — the `pet.*` RPC domain. A composition facade: it wires
 * the pure event projection (`event-projection`) onto the state machine,
 * delegates the affinity economy to the ledger (`ledger`), and routes
 * persistence through `persist`. The API gateway maps these methods onto
 * `pet.state` / `pet.pets` / `pet.interact` / `pet.setVisible` /
 * `pet.setConfig` / `pet.setName` / `pet.setPet` for browser consumers.
 *
 * Concurrent sessions each keep their own machine: the sprite animation
 * follows the most recent meaningful event (the display session) while the
 * state view carries one bubble per active session.
 * @module @linxin666/dsh-pet/service
 */
import { Context, Service } from '@deepseek-ai/cordis';
import type { AffinityConfig, PetAffinityView, PetInteraction } from './affinity.ts';
import { type PetAnnouncement } from './announce.ts';
import type { TreatConfig } from './treats.ts';
import { type LedgerInteractionResult } from './ledger.ts';
import { type PetPanelActionRegistration, type PetPanelActionView } from './panel-actions.ts';
import { type PetDisplayConfig } from './persist.ts';
import { type PetDefinition, type PetManifest, type PetRegistry, type PetRegistryDiagnostic } from './registry.ts';
import type { DecorationView } from './contracts/status-decoration.ts';
import { type PetStateConfig, type PetStateSnapshot } from './state.ts';
/** Plugin configuration. */
export interface PetConfig {
    /** Affinity tuning. */
    affinity?: Partial<AffinityConfig>;
    /** State machine tuning. */
    state?: Partial<PetStateConfig>;
    /** Treat economy tuning. */
    treats?: Partial<TreatConfig>;
    /** Persistence directory override (defaults to $DSH_HOME). */
    persistDir?: string;
    /** Master switch for the plugin (browser half + host routes). */
    enabled?: boolean;
    /** Status-decoration master switch (pet-center M5, #567); defaults to on. */
    decorationEnabled?: boolean;
    /** Whether the pet's own session/status bubbles render (issue #6); defaults to 'auto'. */
    statusBubbles?: PetStatusBubbleMode;
    /** Prebuilt registry (tests); defaults to scanning the package + user dirs. */
    registry?: PetRegistry;
    /** Extra manifest entries composed by the embedding application. */
    pets?: readonly PetManifest[];
}
/**
 * The pet's settings-namespace section: the pet selection and display fields
 * the web settings surface edits. `right`/`bottom` are also updated by drag
 * interactions, which keep the settings document in sync through the service.
 * Naming is per pet and lives outside the settings document (the hover-panel
 * rename targets the selected pet).
 */
export interface PetSettingsSection {
    /** Selected pet id (a registry entry; the service clamps stale values). */
    petId?: string;
    /** Master switch. */
    visible: boolean;
    /** Scale of the rendered pet in px (sprite cell height). */
    size: number;
    /** Horizontal inset from the viewport right edge, px. */
    right: number;
    /** Vertical inset from the viewport bottom edge, px. */
    bottom: number;
    /** Bubble typography multiplier (#1549); see PetDisplayConfig. */
    bubbleScale?: number;
    /** Master switch for the plugin (browser half + host routes). */
    enabled?: boolean;
    /**
     * Status-decoration master switch (pet-center M5, #567). Defaults to on;
     * the settings surface mirrors this field and can turn it off.
     */
    decorationEnabled?: boolean;
    /** Whether the pet's own session/status bubbles render (issue #6). */
    statusBubbles?: PetStatusBubbleMode;
}
/**
 * Whether the pet renders its own session/status bubbles (issue #6).
 *
 * `auto` is the shipped behavior: every active session keeps a bubble, and a
 * sibling plugin's announcement bubble rides the same stack above them. `off`
 * hides ONLY the pet's own bubbles — the announcement bubble, the interaction
 * feedback bubble and the sprite itself are untouched — which is what a plugin
 * that drives its own bubble surface needs. Anything unknown resolves to
 * `auto`, so an older profile or a hand-edited settings document keeps the
 * status bubbles rather than losing them silently.
 */
export type PetStatusBubbleMode = 'auto' | 'off';
/** Every accepted {@link PetStatusBubbleMode}, in settings-card order. */
export declare const STATUS_BUBBLE_MODES: readonly PetStatusBubbleMode[];
/** The shipped default; the switch changes nothing until a user turns it off. */
export declare const DEFAULT_STATUS_BUBBLE_MODE: PetStatusBubbleMode;
/**
 * Normalize a stored, live or hand-edited bubble mode.
 * @param value - the value the settings document carries, when any.
 * @returns the effective mode; anything but 'off' renders the bubbles.
 */
export declare function statusBubbleMode(value: unknown): PetStatusBubbleMode;
/** Settings namespace of the pet capability. Spelled here rather than imported: the browser half spells the same value. */
export declare const PET_SETTINGS_NAMESPACE = "pet";
/**
 * One active TOP-LEVEL session as the pet displays it. Sessions run in
 * parallel, so each gets its own bubble while the sprite itself follows the
 * most recent meaningful event (the display session). Subagent children
 * report no bubble of their own: their work is already reflected by the
 * bubble of the conversation that spawned them, and the bubble buttons
 * navigate to GUI sessions, which subagents are not.
 */
export interface PetSessionView {
    /** Session identity (stringified for the wire; never exposed as a key). */
    sessionId: string;
    /** The animation this session's activity maps onto. */
    animation: PetStateSnapshot['animation'];
    /** This session's status bubble copy. */
    bubble: string;
    /** This session's raw activity phase. */
    phase: PetStateSnapshot['phase'];
    /** This session's fresh inner whisper (碎碎念), when one is within its TTL. */
    whisper?: string;
}
/** Hard cap on simultaneously displayed session bubbles (most recent first). */
export declare const MAX_SESSION_BUBBLES = 12;
/** Snapshot returned by `pet.state`. */
export interface PetStateView {
    animation: PetStateSnapshot['animation'];
    bubble?: string;
    phase: PetStateSnapshot['phase'];
    sessionActive: boolean;
    /**
     * Per-session bubbles for every concurrently active TOP-LEVEL session:
     * the GUI's current session first when reported, the rest most recently
     * active first; optional so older hosts without the multi-session view
     * stay consumable. The single 'bubble' above mirrors the display session.
     */
    sessions?: PetSessionView[];
    /** Affinity ledger snapshot. */
    affinity: PetAffinityView;
    /** Display configuration. */
    display: PetDisplayConfig;
    /** The selected pet's registry identity. */
    pet: {
        /** Registry id. */
        id: string;
        /** Manifest display name (unrenamed default). */
        displayName: string;
        /** Manifest description. */
        description: string;
    };
    /** The selected pet's display name (user rename or manifest default). */
    name: string;
    /**
     * The selected frames2d skin id for this pet (absent = the pet's default
     * look). Persisted host-side, so a page reload or client restart restores
     * the user's last choice instead of falling back to the default look.
     */
    skin?: string;
    /** Treat (小鱼干) stock snapshot. */
    treats: {
        /** Stocked treats now. */
        stocked: number;
        /** Stock cap. */
        max: number;
    };
    /**
     * The active status decoration (pet-center M5, #567), when the master
     * switch is on and the default decoration entry exists. Absent means the
     * browser half renders no ornament.
     */
    decoration?: DecorationView;
    /**
     * The selected pet's gameplay view (miku-pet generalization), present
     * when the pet declares a gameplay block. Read-only projection: polling
     * settles the view in memory but never writes pet.json.
     */
    gameplay?: PetGameplayStateView;
    /**
     * The freshest plugin-authored announcement, within its TTL; absent when none
     * is fresh. Rendered as a dedicated styled bubble above the session stack.
     *
     * Kept alongside `announcements` with exactly the meaning it had when the
     * contract had a single slot, so a browser half predating the per-source
     * upgrade keeps rendering one bubble instead of none (issue #1812). New
     * readers should use `announcements`.
     */
    announcement?: PetAnnouncement;
    /**
     * Every fresh plugin-authored announcement, one per publishing plugin, in
     * render order (issue #1812). Absent when nothing is fresh, so a host with no
     * publisher serves exactly what it served before the upgrade.
     */
    announcements?: PetAnnouncement[];
    /**
     * Whether the pet's own session/status bubbles render (issue #6). Absent
     * on a host that predates the switch, which the browser half reads as
     * `'auto'` — the behavior that shipped before it existed. Turning it to
     * `'off'` hides those bubbles only; `announcement` and `bubble` (the
     * legacy single status bubble) are still served, so the wire contract does
     * not change with the display preference.
     */
    statusBubbles?: PetStatusBubbleMode;
    /**
     * Actions a sibling plugin registered into the hover panel's action row
     * (issue #6), in render order. Absent when none is registered, so the
     * panel row is exactly what it was before the extension point existed.
     */
    panelActions?: PetPanelActionView[];
}
/** Result of `pet.interact`. */
export type PetInteractResult = LedgerInteractionResult;
/** The gameplay slice of the state view (dynamic state only; defs ride the pet definition). */
export interface PetGameplayStateView {
    /** Stat values rounded for display. */
    stats: Record<string, number>;
    /** Active mode id ('work' | 'sleep' | a declared extra mode) or null. */
    mode: string | null;
}
/** Result of the gameplay verbs (touch / setMode / workTick / buy). */
export interface PetGameplayVerbResult {
    ok: boolean;
    error?: string;
    /** Touch: whether a branch hit, plus its presentation. */
    hit?: boolean;
    state?: string;
    stateMs?: number;
    phrase?: string;
    /** Work tick outcome. */
    outcome?: 'success' | 'fail';
    /** Shop purchase: the drawn prize, when the item was a lottery. */
    prize?: {
        amount: number;
        currency: string;
    };
    view?: PetGameplayStateView;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        pet: PetService;
    }
}
/**
 * Cordis service exposing the pet RPC domain. Lazy: nothing is scanned or
 * written until an economic event or interaction arrives; event listeners
 * update only in-memory state, and persistence happens on economic changes
 * (turn rewards, feeds, config/name changes) — never on a read.
 */
export declare class PetService extends Service {
    static inject: string[];
    private readonly machine;
    private readonly stateConfig;
    private readonly ledger;
    private readonly registry;
    private readonly persistDir;
    private enabled;
    /** Status-decoration master switch (M5, #567); mirrored from settings. */
    private decorationEnabled;
    /** Whether the pet renders its own session/status bubbles (issue #6). */
    private statusBubbles;
    /**
     * Plugin-authored announcements, one slot per `source` (issue #1812). The
     * contract started as a single slot, where a second announcing plugin
     * displaced the first; the map is the upgrade the design note predicted for
     * exactly this moment. Insertion order is the render order and re-announcing
     * a source updates its entry in place, so two publishers on different
     * cadences never swap positions.
     */
    private readonly announcements;
    private disposeActivity;
    /** Session whose most recent meaningful event currently drives the global pet. */
    private displaySession;
    /**
     * Effective voice-pack overrides for the currently selected pet (M4,
     * #677). Cached per pet id; the registry is an immutable snapshot, so the
     * global pack and each entry's pack cannot change behind the cache.
     */
    private voiceCache;
    /**
     * Per-session activity, most recent last (Map insertion order). Bounded by
     * MAX_SESSION_BUBBLES so a burst of sessions cannot grow it without bound;
     * disposed sessions are removed by the 'session/disposed' listener.
     */
    private readonly sessionActivity;
    /**
     * Hover-panel actions registered by sibling plugins (issue #6). The pet owns
     * the panel row and serves the registrations; each plugin owns the callback a
     * click dispatches to. Bounded, in-memory, reclaimed with the registering
     * plugin's disposer.
     */
    private readonly panelActions;
    /**
     * Sessions whose reward source is the official event stream. This metadata
     * outlives transient visual resets so a derived legacy `done` cannot reward
     * the same turn again after the pet is disabled and re-enabled.
     */
    private readonly officialEventSessions;
    /**
     * Resolve the settings namespace this plugin's own config is served as, when
     * the caller can read it off the composition. A plugin's settings ARE its own
     * config, so the namespace is the row's id — and an aggregate bundle renames
     * child rows (`pet` becomes `web-ui-pet`), which is why it cannot be assumed
     * to be {@link PET_SETTINGS_NAMESPACE}. `apply` sets this; absent means the
     * plugin runs outside a Loader and the package's own id stands.
     */
    settingsNamespaceProvider: (() => string | undefined) | undefined;
    constructor(ctx: Context, config?: PetConfig);
    /**
     * The draw-time voice-pool provider handed to every projection runtime.
     * It re-resolves when the selected pet changes, so live engines re-voice
     * on the next draw without being rebuilt (M4, #677).
     */
    private voicePools;
    /** Whether the pet service consumes session activity while enabled. */
    isEnabled(): boolean;
    /**
     * The remark layers one pet contributes to the ledger: its manifest pools
     * first, then the voice packs (a pet directory's voice.json over the global
     * `$DSH_HOME/pets/.voice.json`). Every path that seats the ledger's remark
     * pools resolves them here, so no call site can apply the manifest pools and
     * silently drop the voice layer: doing that reverted a pet whose lines a voice
     * pack had translated back to the built-in pools the moment the settings
     * surface applied.
     * @param entry - the pet whose remark pools apply.
     * @returns the layers `PetLedger.setRemarks` takes.
     */
    private remarkLayers;
    /** Re-seat the ledger's remark pools from one pet's layers. */
    private applyRemarks;
    /** RPC: current pet state snapshot. */
    state(currentSessionId?: string): Promise<PetStateView>;
    /**
     * RPC: one plugin-authored announcement bubble, held in the publisher's own
     * slot keyed by `source` (issue #1812). The payload is validated into a
     * bounded PetAnnouncement; a malformed one is dropped silently — a sibling
     * plugin's bug must never surface as pet breakage. Re-announcing replaces
     * only the caller's own slot, so publishers coexist instead of displacing
     * each other. Announcements are in-memory only.
     *
     * The slot table is bounded by {@link MAX_ANNOUNCEMENTS}. Expired entries are
     * pruned first, so a silent publisher never holds a slot; when the table is
     * genuinely full, the entry that has been silent longest gives up its slot
     * to the arriving one — a publisher that keeps refreshing is never evicted.
     */
    announce(input: unknown): {
        ok: boolean;
    };
    /**
     * The announcement slots still fresh, in render order. An expired entry
     * simply stops appearing (the client's 2 s poll drops it); no timer owns its
     * removal.
     */
    private freshAnnouncements;
    /**
     * Register one action into the hover panel's action row (issue #6). The pet
     * renders the button and dispatches the click back to `onSelect`; the plugin
     * decides what the button does. Registering is a wiring step, so a malformed
     * registration throws at the caller's own apply instead of being dropped.
     *
     * The registration is reclaimed by the disposer, so the idiomatic call binds
     * it to the registering plugin's fiber:
     * ```ts
     * ctx.effect(() => ctx.pet.registerPanelAction({
     *   id: 'pet-quota-swap',
     *   label: '换装',
     *   onSelect: async () => { await cycleToNextPet(ctx.pet) },
     * }))
     * ```
     * @param action - the registration to serve in the panel row.
     * @returns a disposer that removes this registration.
     * @throws when the id, label or callback is unusable, or the row is full.
     */
    registerPanelAction(action: PetPanelActionRegistration): () => void;
    /**
     * RPC: dispatch one hover-panel action click back to the plugin that
     * registered it. A rejected id is a stale click (the plugin disposed its
     * registration between render and click), and a throwing callback is that
     * plugin's own failure — neither may surface as pet breakage, so both answer
     * `{ ok: false }` instead of throwing out of the route.
     * @param id - the action id the browser half reported.
     * @returns whether the click reached a registered action.
     */
    selectPanelAction(id: string): Promise<{
        ok: boolean;
        error?: string;
    }>;
    /** Current persisted display config (read-only view). */
    display(): PetDisplayConfig;
    /** RPC: the registry entries the browser half renders and selects from. */
    pets(): Promise<PetDefinition[]>;
    /** The loaded registry (the asset routes serve its entries). */
    registrySnapshot(): PetRegistry;
    /** RPC: structured registry diagnostics (pet-center M2, issue #623). */
    diagnostics(): Promise<{
        diagnostics: PetRegistryDiagnostic[];
    }>;
    /**
     * The active status decoration view (M5, #567): the default 'whale' entry
     * (user directories override built-ins by id), gated by the master switch.
     */
    private activeDecoration;
    /** The selected pet's registry entry. */
    activeEntry(): NonNullable<PetRegistry['entries'][number]>;
    /** Currently selected pet id (persisted). */
    selectedPetId(): string;
    /** The display name of one pet (user rename or manifest displayName). */
    petName(petId?: string): string;
    /** RPC: switch the selected pet (persisted, settings document mirrored). */
    setPetId(petId: string): Promise<{
        ok: true;
        petId: string;
    } | {
        ok: false;
        error: string;
    }>;
    /** Start or stop the session-activity listeners that drive the pet. */
    setEnabled(enabled: boolean): void;
    private syncActivity;
    /** Drop transient activity because terminal events missed while disabled cannot be replayed safely. */
    private resetActivity;
    /** Return the per-session activity record, creating it on first sight. */
    private activityOf;
    /**
     * Commit one activity: the session's own machine renders its bubble, and
     * the session becomes the host-global display session (most recent
     * meaningful event wins the sprite animation).
     */
    private applyActivity;
    /** RPC: pet or feed the pet. */
    interact(kind: PetInteraction): Promise<PetInteractResult>;
    /** The active pet's gameplay block, if it declares one. */
    private gameplayDef;
    /** The persisted (or fresh) gameplay state of the selected pet. */
    private gameplayState;
    /** Display view of one gameplay state (rounded stats; treats ride the shared treat ledger). */
    private gameplayViewOf;
    /**
     * Move gameplay 'treats' currency (the unified post-wallet currency) from
     * the engine's settle work area into the shared treat ledger, capped by
     * the stock cap. The engine keeps its generic currency record for settle
     * math; this drain is the only bridge to the wallet-free economy.
     */
    private drainGameplayTreats;
    /** Persist the mutated gameplay state of one verb call. */
    private commitGameplay;
    /**
     * RPC: a touch on the pet. 'zone' names a touch zone (roll a branch);
     * omitted means a plain click while a touch animation holds (clickBoost).
     */
    gameplayTouch(zone?: string): Promise<PetGameplayVerbResult>;
    /**
     * RPC: enter or leave a gameplay mode (null clears it). Every mode the
     * manifest declares is accepted: 'work', 'sleep', or one of the extra
     * 'modes' entries (a bath, a play session…).
     */
    gameplaySetMode(mode: string | null): Promise<PetGameplayVerbResult>;
    /** RPC: one work-round adjudication (only while the work mode holds). */
    gameplayWorkTick(): Promise<PetGameplayVerbResult>;
    /** RPC: buy one shop item (effects, currency swap, or a lottery draw). */
    gameplayBuy(itemId: string): Promise<PetGameplayVerbResult>;
    /** RPC: show or hide the pet. */
    setVisible(visible: boolean): Promise<{
        ok: true;
        display: PetDisplayConfig;
    }>;
    /**
     * The persisted skin for one entry, when the manifest still declares it: a
     * stale id (skin removed from the manifest, pet swapped) reads as "default"
     * rather than pinning a track the browser half cannot resolve.
     */
    private persistedSkin;
    /**
     * RPC: select the current pet's frames2d skin (`undefined` restores the
     * pet's default look). The choice is stored per pet, so every later state
     * view (reload, client restart, pet re-selection) serves it back.
     */
    setSkin(skin: string | undefined): Promise<{
        ok: true;
        skin?: string;
    } | {
        ok: false;
        error: string;
    }>;
    /** RPC: update display config (size / position / bubble scale). Pixel values are clamped to whole pixels. */
    setConfig(patch: Partial<PetDisplayConfig>): Promise<{
        ok: true;
        display: PetDisplayConfig;
    }>;
    /** RPC: rename the selected pet (trimmed, 1–20 chars, per-pet storage). */
    setName(name: string): Promise<{
        ok: true;
        name: string;
    } | {
        ok: false;
        error: string;
    }>;
    /**
     * Apply a committed settings section to the persisted selection and display
     * config. Called by the settings surface on every change; values are
     * clamped exactly like the setConfig RPC so both write paths converge.
     * @param section - the resolved settings section.
     */
    applySettingsSection(section: PetSettingsSection): void;
    /** Mirror the persisted display config into the settings document (best-effort). */
    private syncSettingsFromPet;
    /** Award the turn reward once per completed turn (idempotent per session + turn). */
    private rewardTurn;
    /** Preserve turn rewards for installations that only emit legacy activity. */
    private rewardLegacyTurn;
    private view;
    private flush;
}
//# sourceMappingURL=service.d.ts.map