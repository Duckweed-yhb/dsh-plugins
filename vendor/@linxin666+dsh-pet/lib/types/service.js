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
import { Service } from '@deepseek-ai/cordis';
import { announcementFresh, MAX_ANNOUNCEMENTS, parseAnnouncement } from "./announce.js";
import { emptyProjectionRuntime, isActivityPhase, projectAssistantStreamFrame, projectOfficialEvent, } from "./event-projection.js";
import { PetLedger } from "./ledger.js";
import { PanelActionRegistry } from "./panel-actions.js";
import { DEFAULT_PET_NAME, DISPLAY_INSET_MAX, DISPLAY_SIZE_MAX, BUBBLE_SCALE_MAX, BUBBLE_SCALE_MIN, DISPLAY_SIZE_MIN, PET_NAME_MAX_LENGTH, loadPetPersist, petHomeDir, savePetPersist, } from "./persist.js";
import { DEFAULT_DECORATION_ID, decorationView, loadPetRegistry, petEntryView, petPackageRoot, } from "./registry.js";
import { WHISPER_TTL_MS } from "./chatter.js";
import { mergeVoicePacks } from "./voice-pack.js";
import { defaultPetStateConfig, PetStateMachine, } from "./state.js";
import { applyGameplayEffects, drawLotteryTier, initialGameplayState, isDeclaredMode, rollTouchBranch, rollWorkOutcome, settleGameplay, } from "./gameplay.js";
/** The unified gameplay currency: the shared treat (小鱼干) ledger. */
const GAMEPLAY_TREATS_CURRENCY = 'treats';
/** Every accepted {@link PetStatusBubbleMode}, in settings-card order. */
export const STATUS_BUBBLE_MODES = ['auto', 'off'];
/** The shipped default; the switch changes nothing until a user turns it off. */
export const DEFAULT_STATUS_BUBBLE_MODE = 'auto';
/**
 * Normalize a stored, live or hand-edited bubble mode.
 * @param value - the value the settings document carries, when any.
 * @returns the effective mode; anything but 'off' renders the bubbles.
 */
export function statusBubbleMode(value) {
    return value === 'off' ? 'off' : DEFAULT_STATUS_BUBBLE_MODE;
}
/** Settings namespace of the pet capability. Spelled here rather than imported: the browser half spells the same value. */
export const PET_SETTINGS_NAMESPACE = 'pet';
/** Hard cap on simultaneously displayed session bubbles (most recent first). */
export const MAX_SESSION_BUBBLES = 12;
/**
 * Cordis service exposing the pet RPC domain. Lazy: nothing is scanned or
 * written until an economic event or interaction arrives; event listeners
 * update only in-memory state, and persistence happens on economic changes
 * (turn rewards, feeds, config/name changes) — never on a read.
 */
export class PetService extends Service {
    static inject = [];
    machine;
    stateConfig;
    ledger;
    registry;
    persistDir;
    enabled;
    /** Status-decoration master switch (M5, #567); mirrored from settings. */
    decorationEnabled;
    /** Whether the pet renders its own session/status bubbles (issue #6). */
    statusBubbles;
    /**
     * Plugin-authored announcements, one slot per `source` (issue #1812). The
     * contract started as a single slot, where a second announcing plugin
     * displaced the first; the map is the upgrade the design note predicted for
     * exactly this moment. Insertion order is the render order and re-announcing
     * a source updates its entry in place, so two publishers on different
     * cadences never swap positions.
     */
    announcements = new Map();
    disposeActivity;
    /** Session whose most recent meaningful event currently drives the global pet. */
    displaySession;
    /**
     * Effective voice-pack overrides for the currently selected pet (M4,
     * #677). Cached per pet id; the registry is an immutable snapshot, so the
     * global pack and each entry's pack cannot change behind the cache.
     */
    voiceCache;
    /**
     * Per-session activity, most recent last (Map insertion order). Bounded by
     * MAX_SESSION_BUBBLES so a burst of sessions cannot grow it without bound;
     * disposed sessions are removed by the 'session/disposed' listener.
     */
    sessionActivity = new Map();
    /**
     * Hover-panel actions registered by sibling plugins (issue #6). The pet owns
     * the panel row and serves the registrations; each plugin owns the callback a
     * click dispatches to. Bounded, in-memory, reclaimed with the registering
     * plugin's disposer.
     */
    panelActions = new PanelActionRegistry();
    /**
     * Sessions whose reward source is the official event stream. This metadata
     * outlives transient visual resets so a derived legacy `done` cannot reward
     * the same turn again after the pet is disabled and re-enabled.
     */
    officialEventSessions = new WeakSet();
    /**
     * Resolve the settings namespace this plugin's own config is served as, when
     * the caller can read it off the composition. A plugin's settings ARE its own
     * config, so the namespace is the row's id — and an aggregate bundle renames
     * child rows (`pet` becomes `web-ui-pet`), which is why it cannot be assumed
     * to be {@link PET_SETTINGS_NAMESPACE}. `apply` sets this; absent means the
     * plugin runs outside a Loader and the package's own id stands.
     */
    settingsNamespaceProvider = undefined;
    constructor(ctx, config = {}) {
        super(ctx, 'pet');
        this.persistDir = config.persistDir ?? petHomeDir();
        this.registry = config.registry
            ?? loadPetRegistry({
                packageRoot: petPackageRoot(import.meta.url),
                ...(config.pets === undefined ? {} : { extra: config.pets }),
            });
        if (this.registry.entries.length === 0) {
            throw new Error('[dsh-pet] no valid pet manifests found; nothing to render');
        }
        let persist = loadPetPersist(this.persistDir);
        if (this.registry.byId(persist.petId) === undefined) {
            // The selected pet no longer exists (removed or a fresh install with a
            // copied pet.json): fall back to the registry default.
            persist = { ...persist, petId: this.registry.defaultEntry().id };
        }
        const selected = this.registry.byId(persist.petId) ?? this.registry.defaultEntry();
        const ledgerConfig = {
            affinity: config.affinity,
            treats: config.treats,
            ...this.remarkLayers(selected),
        };
        this.ledger = new PetLedger(persist, ledgerConfig);
        this.stateConfig = { ...defaultPetStateConfig, ...(config.state ?? {}) };
        this.machine = new PetStateMachine(this.stateConfig);
        this.enabled = config.enabled ?? true;
        this.decorationEnabled = config.decorationEnabled ?? true;
        this.statusBubbles = statusBubbleMode(config.statusBubbles);
        this.syncActivity();
    }
    /**
     * The draw-time voice-pool provider handed to every projection runtime.
     * It re-resolves when the selected pet changes, so live engines re-voice
     * on the next draw without being rebuilt (M4, #677).
     */
    voicePools() {
        return () => {
            const entry = this.activeEntry();
            if (this.voiceCache !== undefined && this.voiceCache.petId === entry.id) {
                return this.voiceCache.overrides;
            }
            const overrides = mergeVoicePacks(this.registry.globalVoice, entry.voice)?.overrides ?? {};
            this.voiceCache = { petId: entry.id, overrides };
            return overrides;
        };
    }
    /** Whether the pet service consumes session activity while enabled. */
    isEnabled() {
        return this.enabled;
    }
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
    remarkLayers(entry) {
        return {
            remarks: entry.remarks,
            voiceRemarks: mergeVoicePacks(this.registry.globalVoice, entry.voice)?.remarks,
        };
    }
    /** Re-seat the ledger's remark pools from one pet's layers. */
    applyRemarks(entry) {
        const layers = this.remarkLayers(entry);
        this.ledger.setRemarks(layers.remarks, layers.voiceRemarks);
    }
    /** RPC: current pet state snapshot. */
    async state(currentSessionId) {
        return this.view(currentSessionId);
    }
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
    announce(input) {
        const parsed = parseAnnouncement(input, Date.now());
        if (parsed === undefined)
            return { ok: false };
        const now = Date.now();
        for (const [source, entry] of this.announcements) {
            if (!announcementFresh(entry, now))
                this.announcements.delete(source);
        }
        if (!this.announcements.has(parsed.source) && this.announcements.size >= MAX_ANNOUNCEMENTS) {
            let oldest = '';
            let oldestAt = Number.POSITIVE_INFINITY;
            for (const [source, entry] of this.announcements) {
                if (entry.at < oldestAt) {
                    oldest = source;
                    oldestAt = entry.at;
                }
            }
            if (oldest !== '')
                this.announcements.delete(oldest);
        }
        this.announcements.set(parsed.source, parsed);
        return { ok: true };
    }
    /**
     * The announcement slots still fresh, in render order. An expired entry
     * simply stops appearing (the client's 2 s poll drops it); no timer owns its
     * removal.
     */
    freshAnnouncements() {
        const now = Date.now();
        return [...this.announcements.values()].filter(entry => announcementFresh(entry, now));
    }
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
    registerPanelAction(action) {
        return this.panelActions.register(action);
    }
    /**
     * RPC: dispatch one hover-panel action click back to the plugin that
     * registered it. A rejected id is a stale click (the plugin disposed its
     * registration between render and click), and a throwing callback is that
     * plugin's own failure — neither may surface as pet breakage, so both answer
     * `{ ok: false }` instead of throwing out of the route.
     * @param id - the action id the browser half reported.
     * @returns whether the click reached a registered action.
     */
    async selectPanelAction(id) {
        try {
            const selected = await this.panelActions.select(id, { petId: this.selectedPetId() });
            return selected ? { ok: true } : { ok: false, error: 'unknown-panel-action' };
        }
        catch {
            return { ok: false, error: 'panel-action-failed' };
        }
    }
    /** Current persisted display config (read-only view). */
    display() {
        return { ...this.ledger.snapshot.display };
    }
    /** RPC: the registry entries the browser half renders and selects from. */
    async pets() {
        return this.registry.entries.map(entry => petEntryView(entry, this.registry.globalVoice));
    }
    /** The loaded registry (the asset routes serve its entries). */
    registrySnapshot() {
        return this.registry;
    }
    /** RPC: structured registry diagnostics (pet-center M2, issue #623). */
    async diagnostics() {
        return { diagnostics: this.registry.diagnostics };
    }
    /**
     * The active status decoration view (M5, #567): the default 'whale' entry
     * (user directories override built-ins by id), gated by the master switch.
     */
    activeDecoration() {
        if (!this.decorationEnabled)
            return undefined;
        const entry = this.registry.decorationById?.(DEFAULT_DECORATION_ID);
        return entry === undefined ? undefined : decorationView(entry);
    }
    /** The selected pet's registry entry. */
    activeEntry() {
        return this.registry.byId(this.selectedPetId()) ?? this.registry.defaultEntry();
    }
    /** Currently selected pet id (persisted). */
    selectedPetId() {
        return this.ledger.snapshot.petId;
    }
    /** The display name of one pet (user rename or manifest displayName). */
    petName(petId = this.selectedPetId()) {
        const stored = this.ledger.snapshot.names[petId];
        if (stored !== undefined && stored.trim() !== '')
            return stored;
        return this.registry.byId(petId)?.displayName ?? DEFAULT_PET_NAME;
    }
    /** RPC: switch the selected pet (persisted, settings document mirrored). */
    async setPetId(petId) {
        const entry = this.registry.byId(petId);
        if (entry === undefined)
            return { ok: false, error: 'unknown-pet' };
        this.ledger.setPetId(entry.id);
        this.applyRemarks(entry);
        this.flush();
        this.syncSettingsFromPet();
        return { ok: true, petId: entry.id };
    }
    /** Start or stop the session-activity listeners that drive the pet. */
    setEnabled(enabled) {
        this.enabled = enabled;
        this.syncActivity();
        if (!enabled)
            this.resetActivity();
    }
    syncActivity() {
        if (this.disposeActivity !== undefined) {
            this.disposeActivity();
            this.disposeActivity = undefined;
        }
        if (!this.enabled)
            return;
        this.disposeActivity = (() => {
            const disposers = [
                this.ctx.on('session/event', (session, event) => {
                    const runtime = this.activityOf(session).runtime;
                    // `activity/status` is an optional compatibility input. It is not
                    // declared as a durable event type by this package because current
                    // Harness installations publish the official session vocabulary.
                    if (event.type === 'activity/status') {
                        const payload = (event.data ?? {});
                        if (typeof payload.phase !== 'string' || !isActivityPhase(payload.phase))
                            return;
                        this.applyActivity(session, {
                            phase: payload.phase,
                            ...(typeof payload.line === 'string' ? { line: payload.line } : {}),
                            ...(typeof payload.phrase === 'string' ? { phrase: payload.phrase } : {}),
                        });
                        // On a legacy-only stream the compatibility event owns turn
                        // rewards. Once any official activity is observed, turn/end owns
                        // them and a derived legacy `done` cannot double-count.
                        if (payload.phase === 'done' && !runtime.officialEventsSeen) {
                            this.rewardLegacyTurn();
                        }
                        return;
                    }
                    const transition = projectOfficialEvent(event, runtime);
                    if (transition === undefined)
                        return;
                    runtime.officialEventsSeen = true;
                    this.officialEventSessions.add(session);
                    this.applyActivity(session, transition.input, transition.whisper);
                    if (transition.completedTurn !== undefined) {
                        this.rewardTurn(String(session.id), transition.completedTurn);
                    }
                }),
                this.ctx.on('agent/assistant-stream', ({ agent, frame }) => {
                    const session = agent.session;
                    const runtime = this.activityOf(session).runtime;
                    const transition = projectAssistantStreamFrame(frame, runtime);
                    if (transition === undefined)
                        return;
                    runtime.officialEventsSeen = true;
                    this.officialEventSessions.add(session);
                    this.applyActivity(session, transition.input, transition.whisper);
                }),
                this.ctx.on('session/disposed', (session) => {
                    this.ledger.forgetSession(String(session.id));
                    this.officialEventSessions.delete(session);
                    this.sessionActivity.delete(session);
                    if (session !== this.displaySession)
                        return;
                    // The display session is gone: fall back to the most recent
                    // remaining session's last input, or settle to idle when none.
                    this.displaySession = undefined;
                    const remaining = [...this.sessionActivity.entries()].at(-1);
                    if (remaining !== undefined) {
                        const [nextSession, activity] = remaining;
                        this.displaySession = nextSession;
                        if (activity.lastInput !== undefined)
                            this.machine.onActivityStatus(activity.lastInput);
                        this.machine.onSessionActive();
                    }
                    else {
                        this.machine.onSessionDisposed();
                    }
                }),
            ];
            return () => { for (const dispose of disposers)
                dispose(); };
        })();
    }
    /** Drop transient activity because terminal events missed while disabled cannot be replayed safely. */
    resetActivity() {
        this.displaySession = undefined;
        this.sessionActivity.clear();
        this.machine.onSessionDisposed();
    }
    /** Return the per-session activity record, creating it on first sight. */
    activityOf(session) {
        let activity = this.sessionActivity.get(session);
        if (activity === undefined) {
            const runtime = emptyProjectionRuntime(this.voicePools());
            runtime.officialEventsSeen = this.officialEventSessions.has(session);
            activity = {
                runtime,
                machine: new PetStateMachine(this.stateConfig),
            };
            this.sessionActivity.set(session, activity);
        }
        return activity;
    }
    /**
     * Commit one activity: the session's own machine renders its bubble, and
     * the session becomes the host-global display session (most recent
     * meaningful event wins the sprite animation).
     */
    applyActivity(session, input, whisper) {
        const activity = this.activityOf(session);
        activity.lastInput = input;
        if (whisper !== undefined)
            activity.whisper = { text: whisper, at: Date.now() };
        activity.machine.onActivityStatus(input);
        activity.machine.onSessionActive();
        // Move to the tail so map order reads most-recent-last, then trim the
        // oldest session states beyond the bubble cap. The display session is
        // reassigned below, so trimming its stale predecessor is safe.
        this.sessionActivity.delete(session);
        this.sessionActivity.set(session, activity);
        while (this.sessionActivity.size > MAX_SESSION_BUBBLES) {
            const oldest = this.sessionActivity.keys().next().value;
            if (oldest === undefined)
                break;
            this.sessionActivity.delete(oldest);
        }
        this.displaySession = session;
        this.machine.onActivityStatus(input);
        this.machine.onSessionActive();
    }
    /** RPC: pet or feed the pet. */
    async interact(kind) {
        const nowMs = Date.now();
        const result = this.ledger.interact(kind, nowMs);
        if (this.ledger.takeDirty())
            this.flush();
        return result;
    }
    /* ---------------------------------------------------------------- *
     * Gameplay verbs (miku-pet generalization). The manifest block lives
     * on the registry entry; dynamic state persists per pet id. Verbs
     * settle and persist; the state view projects without writing.
     * ---------------------------------------------------------------- */
    /** The active pet's gameplay block, if it declares one. */
    gameplayDef() {
        return this.activeEntry().gameplay;
    }
    /** The persisted (or fresh) gameplay state of the selected pet. */
    gameplayState(def, now) {
        const petId = this.selectedPetId();
        const stored = this.ledger.snapshot.gameplay[petId];
        return {
            petId,
            state: stored === undefined
                ? initialGameplayState(def, now)
                // Spread first so the settle remainders (restoreCarryMs / incomeCarryMs)
                // survive a verb. Enumerating the fields dropped them, so every verb
                // floored the elapsed time and threw the remainder away -- which starves
                // any interval longer than the gap between verbs (30 s sleep restore,
                // 30 min passive income).
                : { ...stored, stats: { ...stored.stats }, currencies: { ...stored.currencies } },
        };
    }
    /** Display view of one gameplay state (rounded stats; treats ride the shared treat ledger). */
    gameplayViewOf(state) {
        const stats = {};
        for (const [name, value] of Object.entries(state.stats))
            stats[name] = Math.round(value);
        // A persisted mode the manifest no longer declares (a pet.json edit after
        // the pet was parked in it) reads as "no mode". Otherwise the client would
        // latch a mode it cannot resolve: the mode chip prints a raw i18n key, and
        // the client's roam roll — suppressed while any mode is active — would
        // never fire again.
        const def = this.gameplayDef();
        const mode = state.mode !== null && def !== undefined && !isDeclaredMode(def, state.mode) ? null : state.mode;
        return { stats, mode };
    }
    /**
     * Move gameplay 'treats' currency (the unified post-wallet currency) from
     * the engine's settle work area into the shared treat ledger, capped by
     * the stock cap. The engine keeps its generic currency record for settle
     * math; this drain is the only bridge to the wallet-free economy.
     */
    drainGameplayTreats(state) {
        const pending = Math.floor(state.currencies[GAMEPLAY_TREATS_CURRENCY] ?? 0);
        delete state.currencies[GAMEPLAY_TREATS_CURRENCY];
        if (pending > 0)
            this.ledger.grantTreats(pending);
    }
    /** Persist the mutated gameplay state of one verb call. */
    commitGameplay(petId, state) {
        this.ledger.setGameplay(petId, state);
        if (this.ledger.takeDirty())
            this.flush();
    }
    /**
     * RPC: a touch on the pet. 'zone' names a touch zone (roll a branch);
     * omitted means a plain click while a touch animation holds (clickBoost).
     */
    async gameplayTouch(zone) {
        const def = this.gameplayDef();
        if (def === undefined)
            return { ok: false, error: 'no-gameplay' };
        const now = Date.now();
        const { petId, state } = this.gameplayState(def, now);
        settleGameplay(state, def, now, { sessionActive: this.machine.render().sessionActive });
        if (zone === undefined) {
            const boost = def.touch?.clickBoost;
            if (boost === undefined)
                return { ok: false, error: 'no-touch' };
            const amount = boost.min + Math.floor(Math.random() * (boost.max - boost.min + 1));
            if (amount > 0)
                applyGameplayEffects(state, def, [{ stat: boost.stat, amount }]);
            this.drainGameplayTreats(state);
            this.commitGameplay(petId, state);
            return { ok: true, hit: false, view: this.gameplayViewOf(state) };
        }
        const target = def.touch?.zones.find(entry => entry.name === zone);
        if (target === undefined)
            return { ok: false, error: 'unknown-zone' };
        const branch = rollTouchBranch(target, Math.random);
        if (branch === undefined) {
            this.drainGameplayTreats(state);
            this.commitGameplay(petId, state);
            return { ok: true, hit: false, view: this.gameplayViewOf(state) };
        }
        if (branch.effects !== undefined)
            applyGameplayEffects(state, def, branch.effects);
        const phrase = branch.phrases !== undefined && branch.phrases.length > 0
            ? branch.phrases[Math.floor(Math.random() * branch.phrases.length)]
            : undefined;
        this.drainGameplayTreats(state);
        this.commitGameplay(petId, state);
        return {
            ok: true,
            hit: true,
            ...(branch.state === undefined ? {} : { state: branch.state }),
            ...(branch.stateMs === undefined ? {} : { stateMs: branch.stateMs }),
            ...(phrase === undefined ? {} : { phrase }),
            view: this.gameplayViewOf(state),
        };
    }
    /**
     * RPC: enter or leave a gameplay mode (null clears it). Every mode the
     * manifest declares is accepted: 'work', 'sleep', or one of the extra
     * 'modes' entries (a bath, a play session…).
     */
    async gameplaySetMode(mode) {
        const def = this.gameplayDef();
        if (def === undefined)
            return { ok: false, error: 'no-gameplay' };
        if (mode === 'work' && def.work === undefined)
            return { ok: false, error: 'no-work' };
        if (mode === 'sleep' && def.sleep === undefined)
            return { ok: false, error: 'no-sleep' };
        if (mode !== null && !isDeclaredMode(def, mode))
            return { ok: false, error: 'unknown-mode' };
        const now = Date.now();
        const { petId, state } = this.gameplayState(def, now);
        settleGameplay(state, def, now, { sessionActive: this.machine.render().sessionActive });
        // Switching modes restarts the restore cadence: a leftover carry from the
        // previous mode must not advance the new mode's first tick.
        if (state.mode !== mode)
            state.restoreCarryMs = 0;
        state.mode = mode;
        this.drainGameplayTreats(state);
        this.commitGameplay(petId, state);
        return { ok: true, view: this.gameplayViewOf(state) };
    }
    /** RPC: one work-round adjudication (only while the work mode holds). */
    async gameplayWorkTick() {
        const def = this.gameplayDef();
        if (def?.work === undefined)
            return { ok: false, error: 'no-work' };
        const now = Date.now();
        const { petId, state } = this.gameplayState(def, now);
        if (state.mode !== 'work')
            return { ok: false, error: 'not-working' };
        settleGameplay(state, def, now, { sessionActive: this.machine.render().sessionActive });
        const outcome = rollWorkOutcome(def.work, Math.random);
        const effects = outcome === 'success' ? def.work.success?.effects : def.work.fail?.effects;
        if (effects !== undefined)
            applyGameplayEffects(state, def, effects);
        this.drainGameplayTreats(state);
        this.commitGameplay(petId, state);
        return { ok: true, outcome, view: this.gameplayViewOf(state) };
    }
    /** RPC: buy one shop item (effects, currency swap, or a lottery draw). */
    async gameplayBuy(itemId) {
        const def = this.gameplayDef();
        if (def === undefined)
            return { ok: false, error: 'no-gameplay' };
        const item = def.shop?.items.find(entry => entry.id === itemId);
        if (item === undefined)
            return { ok: false, error: 'unknown-item' };
        const now = Date.now();
        const { petId, state } = this.gameplayState(def, now);
        settleGameplay(state, def, now, { sessionActive: this.machine.render().sessionActive });
        // The unified currency is the shared treat ledger (wallet removed): shop
        // prices and prizes ride the same balance the panel shows and feeding
        // consumes, capped by the stock cap.
        const treats = item.currency === GAMEPLAY_TREATS_CURRENCY;
        const balance = treats ? this.ledger.snapshot.treats.treats : (state.currencies[item.currency] ?? 0);
        if (balance < item.price) {
            return { ok: false, error: 'insufficient-funds', view: this.gameplayViewOf(state) };
        }
        if (treats)
            this.ledger.spendTreats(item.price);
        else
            state.currencies[item.currency] = balance - item.price;
        if (item.effects !== undefined)
            applyGameplayEffects(state, def, item.effects);
        let prize;
        if (item.lottery !== undefined) {
            if (item.lottery.effects !== undefined)
                applyGameplayEffects(state, def, item.lottery.effects);
            const tier = drawLotteryTier(item.lottery, Math.random);
            const prizeCurrency = tier.currency ?? item.lottery.currency ?? item.currency;
            if (prizeCurrency === GAMEPLAY_TREATS_CURRENCY)
                this.ledger.grantTreats(tier.prize);
            else
                state.currencies[prizeCurrency] = (state.currencies[prizeCurrency] ?? 0) + tier.prize;
            prize = { amount: tier.prize, currency: prizeCurrency };
        }
        this.drainGameplayTreats(state);
        this.commitGameplay(petId, state);
        return { ok: true, ...(prize === undefined ? {} : { prize }), view: this.gameplayViewOf(state) };
    }
    /** RPC: show or hide the pet. */
    async setVisible(visible) {
        this.ledger.setDisplay({ ...this.ledger.snapshot.display, visible });
        this.flush();
        this.syncSettingsFromPet();
        return { ok: true, display: this.ledger.snapshot.display };
    }
    /**
     * The persisted skin for one entry, when the manifest still declares it: a
     * stale id (skin removed from the manifest, pet swapped) reads as "default"
     * rather than pinning a track the browser half cannot resolve.
     */
    persistedSkin(entry) {
        const stored = this.ledger.petSkin(entry.id);
        if (stored === undefined)
            return undefined;
        return entry.frames2d?.skins?.some(skin => skin.id === stored) === true ? stored : undefined;
    }
    /**
     * RPC: select the current pet's frames2d skin (`undefined` restores the
     * pet's default look). The choice is stored per pet, so every later state
     * view (reload, client restart, pet re-selection) serves it back.
     */
    async setSkin(skin) {
        const entry = this.activeEntry();
        const declared = entry.frames2d?.skins ?? [];
        if (skin === undefined) {
            this.ledger.setPetSkin(entry.id, undefined);
            this.flush();
            return { ok: true };
        }
        if (!declared.some(candidate => candidate.id === skin))
            return { ok: false, error: 'unknown-skin' };
        this.ledger.setPetSkin(entry.id, skin);
        this.flush();
        return { ok: true, skin };
    }
    /** RPC: update display config (size / position / bubble scale). Pixel values are clamped to whole pixels. */
    async setConfig(patch) {
        const next = { ...this.ledger.snapshot.display, ...patch };
        next.size = Math.round(Math.min(DISPLAY_SIZE_MAX, Math.max(DISPLAY_SIZE_MIN, next.size)));
        next.right = Math.round(Math.min(DISPLAY_INSET_MAX, Math.max(0, next.right)));
        next.bottom = Math.round(Math.min(DISPLAY_INSET_MAX, Math.max(0, next.bottom)));
        next.bubbleScale = Math.min(BUBBLE_SCALE_MAX, Math.max(BUBBLE_SCALE_MIN, next.bubbleScale));
        this.ledger.setDisplay(next);
        this.flush();
        this.syncSettingsFromPet();
        return { ok: true, display: this.ledger.snapshot.display };
    }
    /** RPC: rename the selected pet (trimmed, 1–20 chars, per-pet storage). */
    async setName(name) {
        const trimmed = name.trim();
        if (trimmed === '')
            return { ok: false, error: 'name-empty' };
        if (trimmed.length > PET_NAME_MAX_LENGTH)
            return { ok: false, error: 'name-too-long' };
        this.ledger.setPetName(this.selectedPetId(), trimmed);
        this.flush();
        return { ok: true, name: trimmed };
    }
    /**
     * Apply a committed settings section to the persisted selection and display
     * config. Called by the settings surface on every change; values are
     * clamped exactly like the setConfig RPC so both write paths converge.
     * @param section - the resolved settings section.
     */
    applySettingsSection(section) {
        this.decorationEnabled = section.decorationEnabled ?? true;
        this.statusBubbles = statusBubbleMode(section.statusBubbles);
        const selected = typeof section.petId === 'string' ? this.registry.byId(section.petId) : undefined;
        if (selected !== undefined) {
            this.ledger.setPetId(selected.id);
            this.applyRemarks(selected);
        }
        else if (section.petId !== undefined) {
            // The stored selection names a pet the registry no longer has: keep the
            // current selection and repair the settings document.
            this.syncSettingsFromPet();
        }
        const next = { ...this.ledger.snapshot.display };
        // The pet's own hide/show intent, stored verbatim. The master switch is
        // applied when the state view is produced (see the state view below), not
        // here: writing the conjunction into pet.json turned `enabled: false` into
        // a persisted "the user hid the pet" and the switch could never be undone -
        // re-enabling it (or restarting) read that stored `false` straight back
        // (#1762).
        next.visible = section.visible;
        next.size = Math.round(Math.min(DISPLAY_SIZE_MAX, Math.max(DISPLAY_SIZE_MIN, section.size)));
        next.right = Math.round(Math.min(DISPLAY_INSET_MAX, Math.max(0, section.right)));
        next.bottom = Math.round(Math.min(DISPLAY_INSET_MAX, Math.max(0, section.bottom)));
        next.bubbleScale = Math.min(BUBBLE_SCALE_MAX, Math.max(BUBBLE_SCALE_MIN, section.bubbleScale ?? next.bubbleScale));
        this.ledger.setDisplay(next);
        this.flush();
    }
    /** Mirror the persisted display config into the settings document (best-effort). */
    syncSettingsFromPet() {
        const settings = this.ctx.get('settings', false);
        if (settings === undefined)
            return;
        const ns = this.settingsNamespaceProvider?.() ?? PET_SETTINGS_NAMESPACE;
        const snapshot = this.ledger.snapshot;
        void settings.update(ns, {
            visible: snapshot.display.visible,
            size: snapshot.display.size,
            right: snapshot.display.right,
            bottom: snapshot.display.bottom,
            petId: snapshot.petId,
        }).catch(() => {
            // A settings write failure must not break the pet's own persistence.
        });
    }
    /** Award the turn reward once per completed turn (idempotent per session + turn). */
    rewardTurn(sessionId, turn) {
        if (this.ledger.rewardTurn(sessionId, turn, Date.now()))
            this.flush();
    }
    /** Preserve turn rewards for installations that only emit legacy activity. */
    rewardLegacyTurn() {
        if (this.ledger.rewardLegacyTurn(Date.now()))
            this.flush();
    }
    view(currentSessionId) {
        const snapshot = this.machine.render();
        const entry = this.activeEntry();
        // One bubble per concurrently active TOP-LEVEL session. The GUI's current
        // session leads the stack when reported (the browser half passes its
        // session list's 'current'); everything else keeps the most recent
        // meaningful event order. Subagent children render no bubble of their own
        // (their activity already shows through the spawning conversation's
        // bubble/display, and the bubble buttons navigate to GUI sessions, which
        // subagents are not). Sessions whose own machine has settled (no bubble
        // copy) drop out, so a finished turn does not leave a stale bubble behind.
        const sessions = [];
        for (const [session, activity] of [...this.sessionActivity.entries()].reverse()) {
            if (sessions.length >= MAX_SESSION_BUBBLES)
                break;
            if (session.header?.origin === 'subagent')
                continue;
            const perSession = activity.machine.render();
            if (perSession.bubble === undefined)
                continue;
            // Each session's whisper rides its own bubble while fresh; an expired
            // whisper simply stops appearing (the client's 2 s poll drops it).
            const whisper = activity.whisper;
            const freshWhisper = whisper !== undefined && Date.now() - whisper.at < WHISPER_TTL_MS
                ? whisper.text
                : undefined;
            sessions.push({
                sessionId: String(session.id),
                animation: perSession.animation,
                bubble: perSession.bubble,
                phase: perSession.phase,
                ...(freshWhisper === undefined ? {} : { whisper: freshWhisper }),
            });
        }
        // The browser half reports the session the user is currently on; that
        // session's bubble leads the stack (its whisper then speaks on the
        // collapsed single bubble). An unreported or absent session keeps the
        // legacy most-recent-first order.
        if (currentSessionId !== undefined) {
            const index = sessions.findIndex(session => session.sessionId === currentSessionId);
            if (index > 0)
                sessions.unshift(sessions.splice(index, 1)[0]);
        }
        const decoration = this.activeDecoration();
        // Gameplay view: a read-only projection. The settle runs on a copy, so
        // polling never writes pet.json (verbs settle and persist).
        const gameplayDef = this.gameplayDef();
        let gameplay;
        if (gameplayDef !== undefined) {
            const { state } = this.gameplayState(gameplayDef, Date.now());
            settleGameplay(state, gameplayDef, Date.now(), { sessionActive: snapshot.sessionActive });
            gameplay = this.gameplayViewOf(state);
        }
        // Read-only: the ledger settles on economic events only, never on a read,
        // so polling the state cannot trigger pet.json writes.
        // One slot per publishing plugin (issue #1812); an expired entry simply
        // stops appearing (the client's 2 s poll drops it), no timer owns removal.
        const announcements = this.freshAnnouncements();
        // The freshest entry keeps the pre-#1812 meaning of the singular field, so
        // a browser half that predates the array still renders one bubble instead
        // of none (a rolling upgrade must never blank a publisher's bubble).
        const announcement = announcements.reduce((freshest, entry) => freshest === undefined || entry.at > freshest.at ? entry : freshest, undefined);
        const skin = this.persistedSkin(entry);
        // The hover panel's action row extensions (issue #6). Served on every poll
        // so a plugin that mounts or disposes its registration shows up (or goes
        // away) within one tick, without a separate endpoint.
        const panelActions = this.panelActions.views();
        return {
            animation: snapshot.animation,
            ...(snapshot.bubble === undefined ? {} : { bubble: snapshot.bubble }),
            phase: snapshot.phase,
            sessionActive: snapshot.sessionActive,
            sessions,
            ...(decoration === undefined ? {} : { decoration }),
            ...(announcement === undefined ? {} : { announcement }),
            ...(announcements.length === 0 ? {} : { announcements }),
            statusBubbles: this.statusBubbles,
            ...(panelActions.length === 0 ? {} : { panelActions }),
            affinity: this.ledger.affinityView(Date.now()),
            // The one place the two visibility answers are combined: the pet's own
            // hide/show intent AND the plugin master switch. Producing the effective
            // value here - rather than storing it - keeps the switch reversible and
            // keeps pet.json describing only what the user chose (#1762).
            display: { ...this.ledger.snapshot.display, visible: this.isEnabled() && this.ledger.snapshot.display.visible },
            pet: {
                id: entry.id,
                displayName: entry.displayName,
                description: entry.description,
            },
            name: this.petName(),
            ...(skin === undefined ? {} : { skin }),
            treats: {
                stocked: this.ledger.snapshot.treats.treats,
                max: this.ledger.treatMax,
            },
            ...(gameplay === undefined ? {} : { gameplay }),
        };
    }
    flush() {
        try {
            savePetPersist(this.ledger.snapshot, this.persistDir);
        }
        catch {
            // Persistence is best-effort; the in-memory ledger keeps working.
        }
    }
}
