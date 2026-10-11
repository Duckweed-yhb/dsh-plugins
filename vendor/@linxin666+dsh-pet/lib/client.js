window.__ModuleLoader__.load({
	id: "@linxin666/dsh-pet",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom_client = require("react-dom/client");
		let react_dom = require("react-dom");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region \0dsh-store-engine
		const platform = ["@deepseek-ai/dsh-client", "-store"].join("");
		const legacy = ["@deepseek-ai/dsh-client-runtime", "/client"].join("");
		let engine;
		try {
			engine = require(platform);
		} catch {
			engine = require(legacy);
		}
		const createSnapshotStore = engine.createSnapshotStore;
		const defineStore = engine.defineStore;
		engine.shallowEqual;
		//#endregion
		//#region src/client/pet-store.ts
		/**
		* Browser-side pet store: the pet state snapshot plus transient UI feedback
		* (reaction bubbles), written only through the store's audit actions. The
		* RPC polling and interactions live in the plugin apply body; components
		* only ever read snapshots.
		* @module @linxin666/dsh-pet/client/pet-store
		*/
		/** Create the pet store handle (apply world only; never module-level). */
		function createPetStore() {
			return defineStore({
				init: () => ({
					snapshot: null,
					pets: [],
					state: "loading",
					error: null,
					feedback: null
				}),
				actions: {
					setSnapshot: (draft, snapshot) => {
						if (draft.state === "ready" && draft.error === null && sameSnapshot(draft.snapshot, snapshot)) return;
						draft.snapshot = snapshot;
						draft.state = "ready";
						draft.error = null;
					},
					setPets: (draft, pets) => {
						draft.pets = pets;
					},
					setState: (draft, state, error) => {
						draft.state = state;
						draft.error = error;
					},
					setFeedback: (draft, feedback) => {
						draft.feedback = feedback;
					},
					setGameplayView: (draft, view) => {
						if (draft.snapshot !== null) draft.snapshot = {
							...draft.snapshot,
							gameplay: view
						};
					}
				}
			});
		}
		/**
		* Content equality for consecutive poll snapshots. JSON compare, not field
		* enumeration: an exact string match is the only way to skip the publish, so
		* a missed field can never freeze the UI — it can only cost the render the
		* optimization exists to save.
		*/
		function sameSnapshot(previous, next) {
			return previous !== null && JSON.stringify(previous) === JSON.stringify(next);
		}
		//#endregion
		//#region src/client/work-tick-gate.ts
		/**
		* Page-wide work-tick gate for the pet's work mode. Hot reloads can leave
		* several GameplayHud instances alive, each running its own work interval;
		* without a shared gate every interval would call workTick and each stale call
		* re-rolls, re-grants treats and re-plays the success/fail track, so the
		* outcome appears to play several times per window. The gate accepts the first
		* adjudication of a window and silently suppresses the duplicates that follow.
		*
		* The window is the active pet's own `gameplay.work.tickMs`, not a constant: a
		* pet configured with a shorter cadence must actually adjudicate that often,
		* while a fixed window would downgrade it without saying so (#1494).
		* @module @linxin666/dsh-pet/client/work-tick-gate
		*/
		/** Window used when the active pet declares no work cadence. */
		const DEFAULT_WORK_TICK_MS = 1e4;
		/** Manifest bounds for `gameplay.work.tickMs` (src/gameplay.ts). */
		const MIN_WORK_TICK_MS = 1e3;
		const MAX_WORK_TICK_MS = 6e4;
		/**
		* The gate window for one pet: its configured cadence, clamped to the manifest's
		* own bounds so a malformed registry entry cannot disable or flood the gate.
		* @param tickMs - the active definition's `gameplay.work.tickMs`, when it has one.
		* @returns the window in milliseconds.
		*/
		function workTickWindowMs(tickMs) {
			if (typeof tickMs !== "number" || !Number.isFinite(tickMs)) return DEFAULT_WORK_TICK_MS;
			return Math.min(MAX_WORK_TICK_MS, Math.max(MIN_WORK_TICK_MS, tickMs));
		}
		/**
		* Create a gate.
		* @param now - the clock, injectable so tests control the window.
		* @returns the gate over that clock.
		*/
		function createWorkTickGate(now = Date.now) {
			let lastAdjudicatedAt = 0;
			return {
				allow: (tickMs) => {
					const at = now();
					if (at - lastAdjudicatedAt < workTickWindowMs(tickMs)) return false;
					lastAdjudicatedAt = at;
					return true;
				},
				reset: () => {
					lastAdjudicatedAt = 0;
				}
			};
		}
		//#endregion
		//#region node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
		function r(e) {
			var t, f, n = "";
			if ("string" == typeof e || "number" == typeof e) n += e;
			else if ("object" == typeof e) if (Array.isArray(e)) {
				var o = e.length;
				for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
			} else for (f in e) e[f] && (n && (n += " "), n += f);
			return n;
		}
		function clsx() {
			for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
			return n;
		}
		/**
		* Bubble typography scale for one display config (issue #1549): the bubble
		* follows the pet's own size so a shrunk pet does not carry a full-size
		* bubble, and the user's multiplier rides on top. The result is a CSS ratio
		* against {@link BUBBLE_BASE_FONT_PX}, bounded so the text never drops below
		* the readability floor or outgrows the pet. `bubbleScale` is optional at
		* runtime: a host that predates the field (a rolling update, or any snapshot
		* that omits it) falls back to the baseline, because a NaN ratio written into
		* `--pet-bubble-scale` collapses every bubble's text to zero.
		* @param display - display config; `bubbleScale` may be absent on older hosts.
		* @returns the ratio written to `--pet-bubble-scale` (always finite).
		*/
		function bubbleScaleFor(display) {
			const size = Number.isFinite(display.size) ? display.size : 160;
			const multiplier = typeof display.bubbleScale === "number" && Number.isFinite(display.bubbleScale) ? display.bubbleScale : 1;
			const scaled = size / 160 * multiplier;
			return Math.round(Math.min(2, Math.max(10 / 12, scaled)) * 100) / 100;
		}
		//#endregion
		//#region src/announce.ts
		/** Whether an announcement is still fresh at `now`. */
		function announcementFresh(announcement, now) {
			return now - announcement.at < announcement.ttlMs;
		}
		//#endregion
		//#region src/state.ts
		/**
		* Map one activity phase onto the animation contract.
		* - thinking → `running` and tool → `running-right` (focused work).
		* - review → `review` while answer text is streaming.
		* - waiting → `waiting` (expectant pose, needs user input).
		* - done → `jumping` (celebration), then back to `idle` after the window.
		* - failed → `failed` briefly, then back to `idle`.
		* - idle → `idle` (calm breathing loop).
		*/
		function animationForPhase(phase) {
			switch (phase) {
				case "thinking": return "running";
				case "tool": return "running-right";
				case "review": return "review";
				case "waiting": return "waiting";
				case "done": return "jumping";
				case "failed": return "failed";
				case "idle": return "idle";
			}
		}
		/** The spritesheet row index for one animation track. */
		function rowOf(animation) {
			return {
				"idle": 0,
				"running-right": 1,
				"running-left": 2,
				"waving": 3,
				"jumping": 4,
				"failed": 5,
				"waiting": 6,
				"running": 7,
				"review": 8
			}[animation];
		}
		//#endregion
		//#region src/client/spritesheet.ts
		/**
		* Spritesheet geometry helpers — parameterized by the pet definition the
		* host serves over '/api/pet/pets', so the browser half renders any registry
		* entry without per-pet code. The per-track tables (frames, durations, loop,
		* fallback) also come from the registry; these helpers only place frames,
		* guard track lengths, and map the fixed 9-row animation contract.
		* @module @linxin666/dsh-pet/client/spritesheet
		*/
		/** Row index of one animation track (the fixed 9-row contract). */
		function rowOfTrack(animation) {
			return rowOf(animation);
		}
		/**
		* Background-position (px) of one frame cell within the scaled atlas.
		* The background image is scaled by `scale` (element size ÷ cell size), and
		* background-position offsets are applied in SCALED coordinates — using raw
		* atlas coordinates here would drift each frame by the scale factor and
		* render torn/overlapping frames.
		*/
		function framePosition(cell, row, col, scale = 1) {
			return {
				x: -col * cell.width * scale,
				y: -row * cell.height * scale
			};
		}
		/**
		* Trim a track to the actual frame count of its row (the manifest's per-row
		* counts are authoritative; this is a last-line guard against a definition
		* whose row count disagrees with its track table). A row with 0 detected
		* frames degrades to the first frame so the pet never renders blank.
		*/
		function trimTrack(track, frameCount) {
			const n = Math.max(1, Math.min(frameCount, track.frames.length, track.durations.length));
			return {
				frames: track.frames.slice(0, n),
				durations: track.durations.slice(0, n),
				loop: track.loop,
				...track.fallback === void 0 ? {} : { fallback: track.fallback }
			};
		}
		//#endregion
		//#region src/client/sequences.ts
		/** Build a {@link SequenceTimeline} over one manifest sequence. */
		function createSequenceTimeline(sequence, tracks) {
			const itemDurations = sequence.map((animation) => tracks[animation].durations.reduce((sum, value) => sum + value, 0));
			const sequenceDuration = itemDurations.reduce((sum, value) => sum + value, 0);
			return { frameAt(elapsedMs) {
				let offset = Math.max(0, elapsedMs) % sequenceDuration;
				let itemIndex = 0;
				while (itemIndex < sequence.length - 1 && offset >= itemDurations[itemIndex]) {
					offset -= itemDurations[itemIndex];
					itemIndex += 1;
				}
				const animation = sequence[itemIndex];
				const track = tracks[animation];
				let frameIndex = 0;
				while (frameIndex < track.frames.length - 1 && offset >= track.durations[frameIndex]) {
					offset -= track.durations[frameIndex];
					frameIndex += 1;
				}
				return {
					animation,
					frameIndex
				};
			} };
		}
		//#endregion
		//#region \0dsh-css:src/client/pet.module.css.mjs
		const css$2 = ".v78Lda_float{pointer-events:auto;-webkit-user-select:none;user-select:none;will-change:transform;contain:layout style;flex-direction:column;align-items:center;display:flex;position:fixed}.v78Lda_sprite{image-rendering:auto;touch-action:none;contain:paint}.v78Lda_spriteWrap{flex:none;position:relative}.v78Lda_bubble{white-space:nowrap;padding:calc(4px * var(--pet-bubble-scale,1)) calc(10px * var(--pet-bubble-scale,1));font-size:calc(12px * var(--pet-bubble-scale,1));color:#f4f7ff;pointer-events:none;border-radius:999px;margin-bottom:6px;line-height:1.4;animation:2.6s ease-out forwards v78Lda_pet-bubble-pop;position:absolute;bottom:100%;box-shadow:0 2px 8px #00000040}.v78Lda_bubblePet{background:#4d6bfef2}.v78Lda_bubbleFeed{background:#0369a1f2}.v78Lda_bubbleStatus{max-width:min(calc(280px * var(--pet-bubble-scale,1)), calc(100vw - 24px));text-overflow:ellipsis;padding:calc(5px * var(--pet-bubble-scale,1)) calc(12px * var(--pet-bubble-scale,1));backdrop-filter:blur(8px);letter-spacing:.02em;background:linear-gradient(160deg,#131c36e6,#070b1af0);border:1px solid #7e98ff73;animation:.24s ease-out v78Lda_pet-bubble-in;overflow:hidden;box-shadow:0 4px 12px #02061759,inset 0 1px #e2e8ff1a,0 0 12px #4d6bfe2e}.v78Lda_bubbleWhisper{letter-spacing:.03em;animation:.32s cubic-bezier(.22,1,.36,1) v78Lda_pet-whisper-in}.v78Lda_bubbleWhisper:before{content:\"「\";opacity:.7;margin-right:2px}.v78Lda_bubbleWhisper:after{content:\"」\";opacity:.7;margin-left:2px}.v78Lda_bubbleStack{pointer-events:auto;flex-direction:column-reverse;align-items:center;gap:4px;display:flex;position:absolute;bottom:100%}.v78Lda_bubbleAnchor{display:inline-flex;position:relative}.v78Lda_bubbleMore{z-index:1;color:#eef2ff;cursor:pointer;background:linear-gradient(160deg,#4a68f5f2,#2f44b8f2);border:1px solid #7e98ff8c;border-radius:999px;justify-content:center;align-items:center;min-width:18px;height:18px;padding:0 5px;font-size:10px;font-weight:600;line-height:1;transition:filter .12s;display:inline-flex;position:absolute;top:-9px;right:-10px;box-shadow:0 2px 6px #02061766}.v78Lda_bubbleMore:hover{filter:brightness(1.15)}.v78Lda_bubbleMore:focus-visible{outline:none;box-shadow:0 0 0 2px #7e98ffe6}.v78Lda_bubbleStack .v78Lda_bubble{pointer-events:auto;margin-bottom:0;position:relative;bottom:auto}.v78Lda_bubbleClickable{cursor:pointer;font:inherit;text-align:center;appearance:none;transition:filter .12s,box-shadow .12s}.v78Lda_bubbleClickable:hover{filter:brightness(1.12)}.v78Lda_bubbleClickable:focus-visible{outline:none;box-shadow:0 0 0 2px #7e98ffe6}@keyframes v78Lda_pet-bubble-in{0%{opacity:0;transform:translateY(6px)scale(.96)}to{opacity:1;transform:translateY(0)scale(1)}}@keyframes v78Lda_pet-whisper-in{0%{opacity:0;transform:translateY(8px)scale(.9)}60%{transform:translateY(-1px)scale(1.02)}to{opacity:1;transform:translateY(0)scale(1)}}@keyframes v78Lda_pet-panel-in{0%{opacity:0;transform:translateY(4px)scale(.97)}to{opacity:1;transform:translateY(0)scale(1)}}@keyframes v78Lda_pet-bubble-pop{0%{opacity:0;transform:translateY(6px)scale(.85)}15%{opacity:1;transform:translateY(0)scale(1.05)}25%{transform:translateY(0)scale(1)}75%{opacity:1}to{opacity:0;transform:translateY(-8px)scale(.95)}}.v78Lda_panel{color:#e6ebf8;backdrop-filter:blur(10px);transform-origin:50% 0;background:linear-gradient(165deg,#131c36f2,#070b1af7);border:1px solid #7e98ff4d;border-radius:12px;flex-direction:column;gap:7px;min-width:148px;margin-top:8px;padding:10px 12px;font-size:12px;animation:.2s cubic-bezier(.22,1,.36,1) v78Lda_pet-panel-in;display:flex;position:absolute;top:100%;box-shadow:0 8px 24px #02061773,0 0 0 1px #4d6bfe1a,inset 0 1px #e2e8ff14}.v78Lda_panel:after{content:\"\";height:14px;position:absolute;bottom:100%;left:0;right:0}.v78Lda_panelAbove{transform-origin:50% 100%;margin-top:0;margin-bottom:8px;top:auto;bottom:100%}.v78Lda_panelAbove:after{top:100%;bottom:auto}.v78Lda_rankRow{white-space:nowrap;justify-content:space-between;gap:10px;display:flex}.v78Lda_nameCell{letter-spacing:.02em;background:linear-gradient(90deg,#a9c1ff,#6c8bff 60%,#4d6bfe);color:#0000;-webkit-background-clip:text;background-clip:text;font-weight:600}.v78Lda_statRank{color:#9db4ff;font-weight:600}.v78Lda_statTreats{color:#7dd3fc;font-weight:600}.v78Lda_statPoints{color:#fcd34d;font-weight:600}.v78Lda_renameRow{align-items:center;gap:6px;display:flex}.v78Lda_nameInput{color:#e6ebf8;background:#131c36e6;border:1px solid #7e98ff80;border-radius:6px;outline:none;flex:1;min-width:0;padding:3px 6px;font-size:12px}.v78Lda_nameInput:focus{border-color:#4d6bfe;box-shadow:0 0 0 2px #4d6bfe73}.v78Lda_actions{gap:6px;display:flex}.v78Lda_action{cursor:pointer;color:#fff;background:linear-gradient(#4a68f5,#3a55e0);border:none;border-radius:6px;flex:1;padding:4px 8px;font-size:12px;font-weight:600;transition:filter .12s,box-shadow .12s,transform .12s;box-shadow:0 2px 6px #4d6bfe4d}.v78Lda_action:hover{filter:brightness(1.08);transform:translateY(-1px);box-shadow:0 4px 10px #4d6bfe66}.v78Lda_action:active{filter:brightness(.94);transform:translateY(0);box-shadow:0 1px 4px #4d6bfe4d}.v78Lda_action:focus-visible{outline:none;box-shadow:0 0 0 2px #7e98ffe6}.v78Lda_summon{color:#8ea6ff;cursor:pointer;background:#070b1abf;border:1px dashed #7e98ff99;border-radius:999px;padding:2px 10px;font-size:11px;transition:border-color .12s,color .12s,background .12s,box-shadow .12s}.v78Lda_summon:hover{color:#c3d3ff;background:#070b1ae6;border-color:#7e98fff2}.v78Lda_summon:active{color:#8ea6ff;border-color:#7e98ffcc}.v78Lda_summon:focus-visible{outline:none;box-shadow:0 0 0 2px #7e98ffe6}@media (prefers-reduced-motion:reduce){.v78Lda_bubble,.v78Lda_bubbleStatus,.v78Lda_bubbleWhisper,.v78Lda_panel{opacity:1;animation:none}.v78Lda_action,.v78Lda_summon,.v78Lda_bubbleMore{transition:none}}.v78Lda_gameplayHud{width:0;height:0;position:absolute;bottom:0;left:0}.v78Lda_gameplayModeChip{color:#cdd7ff;white-space:nowrap;pointer-events:none;background:#7e98ff2e;border-radius:999px;padding:1px 8px;font-size:10px;position:absolute;top:0;left:0;transform:translateY(-100%)translateY(-4px)}.v78Lda_gameplayCard{color:#dfe6ff;background:#070b1aeb;border:1px solid #7e98ff40;border-radius:10px;min-width:180px;max-height:340px;padding:10px 12px;font-size:12px;position:absolute;bottom:0;left:0;overflow-y:auto;transform:none;box-shadow:0 8px 24px #0006}.v78Lda_gameplayBars{flex-direction:column;gap:4px;margin-bottom:8px;display:flex}.v78Lda_gameplayBarRow{align-items:center;gap:6px;display:flex}.v78Lda_gameplayBarLabel{color:#9aa8d8;flex-shrink:0;width:34px}.v78Lda_gameplayBarTrack{background:#7e98ff26;border-radius:3px;flex:1;height:6px;overflow:hidden}.v78Lda_gameplayBarFill{background:linear-gradient(90deg,#7e98ff,#9db4ff);border-radius:3px;height:100%;transition:width .3s;display:block}.v78Lda_gameplayActions{flex-wrap:wrap;gap:6px;display:flex}.v78Lda_gameplayShopItems{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:8px;display:grid}.v78Lda_gameplayShopItem{color:inherit;cursor:pointer;background:#7e98ff14;border:1px solid #7e98ff40;border-radius:8px;flex-direction:column;align-items:center;gap:4px;padding:8px 6px;display:flex}.v78Lda_gameplayShopItem:hover{background:#7e98ff29;border-color:#7e98ffb3}.v78Lda_gameplayShopItemImage{object-fit:contain;width:36px;height:36px;image-rendering:pixelated;pointer-events:none}.v78Lda_gameplayShopItemLabel{text-align:center;font-size:11px}.v78Lda_gameplayShopItemPrice{color:#ffd27e;font-size:10px}.v78Lda_gameplaySkinItems{flex-direction:column;gap:6px;margin-bottom:8px;display:flex}.v78Lda_gameplaySkinItem{width:100%;color:inherit;cursor:pointer;text-align:left;background:#7e98ff14;border:1px solid #7e98ff40;border-radius:8px;padding:8px 10px;font-size:12px;display:block}.v78Lda_gameplaySkinItem:hover{background:#7e98ff29;border-color:#7e98ffb3}.v78Lda_gameplaySkinItemActive{background:#7e98ff47;border-color:#7e98ffe6}.v78Lda_gameplayClose{color:#9aa8d8;cursor:pointer;background:0 0;border:none;padding:0 2px;font-size:14px;position:absolute;top:4px;right:8px}.v78Lda_gameplayClose:hover{color:#fff}.v78Lda_gameplayFloat{color:#3a2a00;white-space:nowrap;pointer-events:none;background:#ffd27eeb;border-radius:999px;padding:2px 10px;font-size:11px;animation:1.1s ease-out forwards v78Lda_pet-gameplay-float;position:absolute;top:-8px;left:50%;transform:translate(-50%)}@keyframes v78Lda_pet-gameplay-float{0%{opacity:0;transform:translate(-50%)translateY(6px)}20%{opacity:1}to{opacity:0;transform:translate(-50%)translateY(-18px)}}@media (prefers-reduced-motion:reduce){.v78Lda_gameplayFloat{opacity:1;animation:none}.v78Lda_gameplayBarFill{transition:none}}.v78Lda_bubbleUsage{white-space:nowrap;backdrop-filter:blur(8px);letter-spacing:.02em;background:linear-gradient(160deg,#131c36eb,#070b1af2);border:1px solid #7e98ff73;flex-direction:column;align-items:stretch;gap:3px;min-width:128px;max-width:min(280px,100vw - 24px);padding:6px 12px;animation:.28s cubic-bezier(.22,1,.36,1) v78Lda_pet-usage-in;display:flex;box-shadow:0 4px 12px #02061759,inset 0 1px #e2e8ff1a,0 0 12px #4d6bfe2e}.v78Lda_bubbleUsageHead{justify-content:space-between;align-items:baseline;gap:10px;display:flex}.v78Lda_bubbleUsageTitle{text-overflow:ellipsis;opacity:.85;overflow:hidden}.v78Lda_bubbleUsageValue{font-variant-numeric:tabular-nums;flex-shrink:0;font-weight:600}.v78Lda_bubbleUsageNote{text-overflow:ellipsis;opacity:.55;font-size:10px;overflow:hidden}.v78Lda_bubbleUsageMeter{background:#e2e8ff24;border-radius:999px;height:4px;display:block;overflow:hidden}.v78Lda_bubbleUsageMeterFill{background:#6ee7b7;border-radius:999px;height:100%;transition:width .3s;display:block}.v78Lda_bubbleUsageOk{border-color:#7e98ff73}.v78Lda_bubbleUsageWarn{border-color:#fbbf248c}.v78Lda_bubbleUsageWarn .v78Lda_bubbleUsageMeterFill{background:#fbbf24}.v78Lda_bubbleUsageLow{border-color:#f8717199}.v78Lda_bubbleUsageLow .v78Lda_bubbleUsageMeterFill{background:#f87171}@keyframes v78Lda_pet-usage-in{0%{opacity:0;transform:translateY(6px)scale(.96)}to{opacity:1;transform:translateY(0)scale(1)}}@media (prefers-reduced-motion:reduce){.v78Lda_bubbleUsage{animation:none}}";
		const tagId$2 = "@linxin666/dsh-pet/src/client/pet.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@linxin666/dsh-pet";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var pet_module_css_default = {
			"action": "v78Lda_action",
			"actions": "v78Lda_actions",
			"bubble": "v78Lda_bubble",
			"bubbleAnchor": "v78Lda_bubbleAnchor",
			"bubbleClickable": "v78Lda_bubbleClickable",
			"bubbleFeed": "v78Lda_bubbleFeed",
			"bubbleMore": "v78Lda_bubbleMore",
			"bubblePet": "v78Lda_bubblePet",
			"bubbleStack": "v78Lda_bubbleStack",
			"bubbleStatus": "v78Lda_bubbleStatus",
			"bubbleUsage": "v78Lda_bubbleUsage",
			"bubbleUsageHead": "v78Lda_bubbleUsageHead",
			"bubbleUsageLow": "v78Lda_bubbleUsageLow",
			"bubbleUsageMeter": "v78Lda_bubbleUsageMeter",
			"bubbleUsageMeterFill": "v78Lda_bubbleUsageMeterFill",
			"bubbleUsageNote": "v78Lda_bubbleUsageNote",
			"bubbleUsageOk": "v78Lda_bubbleUsageOk",
			"bubbleUsageTitle": "v78Lda_bubbleUsageTitle",
			"bubbleUsageValue": "v78Lda_bubbleUsageValue",
			"bubbleUsageWarn": "v78Lda_bubbleUsageWarn",
			"bubbleWhisper": "v78Lda_bubbleWhisper",
			"float": "v78Lda_float",
			"gameplayActions": "v78Lda_gameplayActions",
			"gameplayBarFill": "v78Lda_gameplayBarFill",
			"gameplayBarLabel": "v78Lda_gameplayBarLabel",
			"gameplayBarRow": "v78Lda_gameplayBarRow",
			"gameplayBarTrack": "v78Lda_gameplayBarTrack",
			"gameplayBars": "v78Lda_gameplayBars",
			"gameplayCard": "v78Lda_gameplayCard",
			"gameplayClose": "v78Lda_gameplayClose",
			"gameplayFloat": "v78Lda_gameplayFloat",
			"gameplayHud": "v78Lda_gameplayHud",
			"gameplayModeChip": "v78Lda_gameplayModeChip",
			"gameplayShopItem": "v78Lda_gameplayShopItem",
			"gameplayShopItemImage": "v78Lda_gameplayShopItemImage",
			"gameplayShopItemLabel": "v78Lda_gameplayShopItemLabel",
			"gameplayShopItemPrice": "v78Lda_gameplayShopItemPrice",
			"gameplayShopItems": "v78Lda_gameplayShopItems",
			"gameplaySkinItem": "v78Lda_gameplaySkinItem",
			"gameplaySkinItemActive": "v78Lda_gameplaySkinItemActive",
			"gameplaySkinItems": "v78Lda_gameplaySkinItems",
			"nameCell": "v78Lda_nameCell",
			"nameInput": "v78Lda_nameInput",
			"panel": "v78Lda_panel",
			"panelAbove": "v78Lda_panelAbove",
			"pet-bubble-in": "v78Lda_pet-bubble-in",
			"pet-bubble-pop": "v78Lda_pet-bubble-pop",
			"pet-gameplay-float": "v78Lda_pet-gameplay-float",
			"pet-panel-in": "v78Lda_pet-panel-in",
			"pet-usage-in": "v78Lda_pet-usage-in",
			"pet-whisper-in": "v78Lda_pet-whisper-in",
			"rankRow": "v78Lda_rankRow",
			"renameRow": "v78Lda_renameRow",
			"sprite": "v78Lda_sprite",
			"spriteWrap": "v78Lda_spriteWrap",
			"statPoints": "v78Lda_statPoints",
			"statRank": "v78Lda_statRank",
			"statTreats": "v78Lda_statTreats",
			"summon": "v78Lda_summon"
		};
		//#endregion
		//#region src/client/PetSprite.tsx
		/**
		* Pet sprite companion component — the browser half's centerpiece. Renders a
		* fixed-position floating sprite (React portal onto document.body), plays
		* the track matching the host animation snapshot, and exposes the
		* interaction surface: click to pet, hover panel with feed/rename/hide, drag
		* to reposition (persisted via setConfig). Everything visual comes from the
		* pet definition the host serves ('/api/pet/pets' + the state snapshot's
		* pet id), so one component renders every registry entry.
		* @module @linxin666/dsh-pet/client/PetSprite
		*/
		/** Clamp a drag offset inside the viewport with a margin. */
		function clampOffset(value, max) {
			return Math.max(0, Math.min(max, value));
		}
		/**
		* The status decoration ornament (pet-center M5, #567). Renders the active
		* phase's frame segment as a CSS-background strip at a compact bubble
		* height; prefers-reduced-motion holds the segment's first frame, and a
		* missing or undecodable asset simply paints nothing (CSS background
		* failure) — the bubble text is never disturbed. The span is aria-hidden;
		* the bubble keeps its own semantics untouched.
		*/
		function StatusOrnament(props) {
			const { decoration, phase } = props;
			const segment = decoration.phases[phase];
			const shown = segment !== void 0 && segment !== "hide";
			const segmentKey = segment !== void 0 && segment !== "hide" ? segment.from + ":" + segment.to : "none";
			const spanRef = (0, react.useRef)(null);
			const scale = 18 / decoration.cell.height;
			const frameWidth = Math.round(decoration.cell.width * scale);
			const stripWidth = decoration.columns * frameWidth;
			const durationsKey = decoration.durations.join(",");
			(0, react.useEffect)(() => {
				if (segment === void 0 || segment === "hide") return;
				const el = spanRef.current;
				if (el === null) return;
				const position = (index) => -index * frameWidth + "px 0px";
				const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
				el.style.backgroundPosition = position(segment.from);
				if (reduceMotion || segment.from === segment.to) return;
				let timer = 0;
				let index = segment.from;
				let elapsed = 0;
				let last = performance.now();
				const tick = () => {
					const now = performance.now();
					const delta = now - last;
					last = now;
					elapsed += delta;
					let duration = decoration.durations[index] ?? 120;
					if (elapsed >= duration) {
						do {
							elapsed -= duration;
							if (index < segment.to) index += 1;
							else if (decoration.loop) index = segment.from;
							duration = decoration.durations[index] ?? 120;
						} while (elapsed >= duration);
						el.style.backgroundPosition = position(index);
					}
					if (!decoration.loop && index === segment.to) return;
					timer = window.setTimeout(tick, Math.max(1, duration - elapsed));
				};
				timer = window.setTimeout(tick, 0);
				return () => window.clearTimeout(timer);
			}, [
				shown,
				segmentKey,
				frameWidth,
				decoration.loop,
				durationsKey
			]);
			if (!shown) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				ref: spanRef,
				"aria-hidden": "true",
				"data-dsh-pet-decoration": decoration.id,
				style: {
					display: "inline-block",
					width: frameWidth,
					height: 18,
					marginRight: 6,
					verticalAlign: "middle",
					flexShrink: 0,
					backgroundImage: "url(" + decoration.entryUrl + ")",
					backgroundSize: stripWidth + "px 18px",
					backgroundRepeat: "no-repeat",
					backgroundPosition: "0px 0px"
				}
			});
		}
		/**
		* The announcement bubble (dsh-usage linkage): a dedicated, specially
		* designed surface for sibling-plugin facts — a balance or today-spend pill,
		* or a plan-quota card with a tone-tinted accent, a mini meter for percent
		* windows, and the reset instant. It rides the top of the session bubble
		* stack (column-reverse puts the DOM-last child farthest from the sprite)
		* and persists for its TTL instead of the short feedback pop.
		*/
		function UsageAnnouncementBubble(props) {
			const { announcement } = props;
			const tone = announcement.tone === "low" ? pet_module_css_default.bubbleUsageLow : announcement.tone === "warn" ? pet_module_css_default.bubbleUsageWarn : pet_module_css_default.bubbleUsageOk;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: clsx(pet_module_css_default.bubble, pet_module_css_default.bubbleUsage, tone),
				role: "status",
				"aria-live": "polite",
				"data-dsh-pet-announcement": announcement.source,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: pet_module_css_default.bubbleUsageHead,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: pet_module_css_default.bubbleUsageTitle,
								children: announcement.title
							}),
							(announcement.kind === "balance" || announcement.kind === "cost") && announcement.amount !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: pet_module_css_default.bubbleUsageValue,
								children: announcement.amount
							}),
							announcement.kind === "plan" && announcement.percent !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: pet_module_css_default.bubbleUsageValue,
								children: Math.round(announcement.percent) + "%"
							})
						]
					}),
					announcement.kind === "plan" && announcement.percent !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: pet_module_css_default.bubbleUsageMeter,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: pet_module_css_default.bubbleUsageMeterFill,
							style: { width: Math.min(100, Math.max(0, announcement.percent)) + "%" }
						})
					}),
					announcement.note !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: pet_module_css_default.bubbleUsageNote,
						children: announcement.note
					})
				]
			});
		}
		/**
		* The floating pet. The spritesheet frame advances on requestAnimationFrame
		* with per-frame durations from the definition's tracks; the atlas image is
		* loaded once and the background position is written straight to the sprite
		* element (no per-frame React state).
		*/
		function PetSprite(props) {
			const { snapshot, definition, display, feedback } = props;
			const spriteRef = (0, react.useRef)(null);
			const floatRef = (0, react.useRef)(null);
			const panelRef = (0, react.useRef)(null);
			const bubbleRef = (0, react.useRef)(null);
			const [imageReady, setImageReady] = (0, react.useState)(false);
			const [hovered, setHovered] = (0, react.useState)(false);
			const [stackPeek, setStackPeek] = (0, react.useState)(false);
			const [stackPinned, setStackPinned] = (0, react.useState)(false);
			const [renaming, setRenaming] = (0, react.useState)(false);
			const [panelAbove, setPanelAbove] = (0, react.useState)(false);
			const [panelLift, setPanelLift] = (0, react.useState)(0);
			const [nameDraft, setNameDraft] = (0, react.useState)("");
			const composingRef = (0, react.useRef)(false);
			const [dragPos, setDragPos] = (0, react.useState)(null);
			const dragRef = (0, react.useRef)(null);
			const hideTimerRef = (0, react.useRef)(null);
			const frameRef = (0, react.useRef)({
				track: null,
				index: 0,
				elapsed: 0
			});
			const cell = definition.cell;
			const columns = definition.columns;
			const rows = definition.rows;
			const tracks = definition.tracks;
			const sequences = definition.sequences;
			const panel = definition.panel;
			const panelLabel = (slot, i18n) => panel?.labels?.[slot] ?? i18n;
			const panelStat = (slot, i18nKey, values) => {
				const format = panel?.stats?.[slot] ?? props.t(i18nKey, values);
				if (panel?.stats?.[slot] === void 0) return format;
				const all = {
					rank: snapshot?.affinity.rank ?? "?",
					n: snapshot?.treats.stocked ?? 0,
					points: snapshot?.affinity.points ?? 0
				};
				let text = format;
				for (const [name, value] of Object.entries(all)) text = text.replaceAll("{" + name + "}", String(value));
				return text;
			};
			const panelShows = (action) => panel?.actions === void 0 || panel.actions.includes(action);
			(0, react.useEffect)(() => {
				if (props.visual !== void 0) return;
				setImageReady(false);
				let cancelled = false;
				let retryTimer;
				let attempt = 0;
				const maxAttempts = 3;
				let activeImg = null;
				const loadAtlas = () => {
					const img = new Image();
					activeImg = img;
					img.onload = () => {
						if (!cancelled) setImageReady(true);
					};
					img.onerror = () => {
						if (cancelled) return;
						if (attempt < maxAttempts) {
							attempt += 1;
							const delay = Math.min(1e3 * Math.pow(2, attempt - 1), 8e3);
							retryTimer = setTimeout(loadAtlas, delay);
						}
					};
					img.src = definition.atlasUrl;
				};
				loadAtlas();
				return () => {
					cancelled = true;
					if (retryTimer !== void 0) clearTimeout(retryTimer);
					if (activeImg !== null) {
						activeImg.onload = null;
						activeImg.onerror = null;
					}
				};
			}, [definition.atlasUrl, props.visual]);
			const spriteScale = display.size / cell.height;
			const phase = snapshot?.phase ?? "idle";
			const animation = snapshot?.animation ?? "idle";
			const scaleRef = (0, react.useRef)(spriteScale);
			scaleRef.current = spriteScale;
			(0, react.useEffect)(() => {
				if (props.visual !== void 0) return;
				const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
				const sequence = animation === animationForPhase(phase) ? sequences?.[phase] : void 0;
				const timeline = sequence === void 0 ? void 0 : createSequenceTimeline(sequence, tracks);
				const sequenceItems = sequence === void 0 ? void 0 : new Map(sequence.map((itemAnimation) => {
					const itemRow = rowOfTrack(itemAnimation);
					return [itemAnimation, {
						row: itemRow,
						track: trimTrack(tracks[itemAnimation], rows[itemRow] ?? tracks[itemAnimation].frames.length)
					}];
				}));
				const leadAnimation = sequence?.[0] ?? animation;
				const row = rowOfTrack(leadAnimation);
				const track = trimTrack(tracks[leadAnimation], rows[row] ?? tracks[leadAnimation].frames.length);
				const leadCol = track.frames[0];
				const lead = framePosition(cell, row, leadCol, scaleRef.current);
				let lastPosStr = lead.x + "px " + lead.y + "px";
				if (spriteRef.current !== null) spriteRef.current.style.backgroundPosition = lastPosStr;
				if (reduceMotion) return;
				let raf = 0;
				let last = performance.now();
				let sequenceElapsed = 0;
				const tick = (ts) => {
					const delta = ts - last;
					last = ts;
					if (timeline !== void 0 && sequenceItems !== void 0) {
						sequenceElapsed += delta;
						const current = timeline.frameAt(sequenceElapsed);
						const item = sequenceItems.get(current.animation);
						const col = item.track.frames[current.frameIndex];
						const pos = framePosition(cell, item.row, col, scaleRef.current);
						const posStr = pos.x + "px " + pos.y + "px";
						if (posStr !== lastPosStr) {
							lastPosStr = posStr;
							if (spriteRef.current !== null) spriteRef.current.style.backgroundPosition = posStr;
						}
						raf = requestAnimationFrame(tick);
						return;
					}
					const st = frameRef.current;
					if (st.track !== animation) {
						st.track = animation;
						st.index = 0;
						st.elapsed = 0;
					}
					st.elapsed += delta;
					const maxIndex = track.frames.length - 1;
					while (st.elapsed >= (track.durations[st.index] ?? 0) && st.index < maxIndex) {
						st.elapsed -= track.durations[st.index] ?? 0;
						st.index += 1;
					}
					if (st.elapsed >= (track.durations[st.index] ?? 0)) {
						if (track.loop) {
							st.elapsed = 0;
							st.index = 0;
						} else st.index = maxIndex;
					}
					const col = track.frames[st.index];
					const pos = framePosition(cell, row, col, scaleRef.current);
					const posStr = pos.x + "px " + pos.y + "px";
					if (posStr !== lastPosStr) {
						lastPosStr = posStr;
						if (spriteRef.current !== null) spriteRef.current.style.backgroundPosition = posStr;
					}
					raf = requestAnimationFrame(tick);
				};
				raf = requestAnimationFrame(tick);
				return () => cancelAnimationFrame(raf);
			}, [
				animation,
				phase,
				cell,
				columns,
				rows,
				tracks,
				sequences,
				props.visual
			]);
			const feedbackDoneRef = (0, react.useRef)(props.onFeedbackDone);
			feedbackDoneRef.current = props.onFeedbackDone;
			(0, react.useEffect)(() => {
				if (feedback === null) return;
				const timer = window.setTimeout(() => feedbackDoneRef.current(), 2600);
				return () => window.clearTimeout(timer);
			}, [feedback]);
			const draggedRef = (0, react.useRef)(false);
			const clearHideTimer = () => {
				if (hideTimerRef.current !== null) {
					window.clearTimeout(hideTimerRef.current);
					hideTimerRef.current = null;
				}
			};
			(0, react.useEffect)(() => () => clearHideTimer(), []);
			const onPointerDown = (e) => {
				if (props.dragDisabled === true) return;
				endWalk(false);
				e.preventDefault();
				e.target.setPointerCapture?.(e.pointerId);
				const current = dragPos ?? {
					right: display.right,
					bottom: display.bottom
				};
				dragRef.current = {
					startX: e.clientX,
					startY: e.clientY,
					...current
				};
				draggedRef.current = false;
				setHovered(false);
			};
			const onPointerMove = (e) => {
				const drag = dragRef.current;
				if (drag === null) return;
				const dx = e.clientX - drag.startX;
				const dy = e.clientY - drag.startY;
				if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
					if (!draggedRef.current) props.onDraggingChange?.(true);
					draggedRef.current = true;
				}
				const right = clampOffset(drag.right - dx, window.innerWidth - 40);
				const bottom = clampOffset(drag.bottom - dy, window.innerHeight - 40);
				setDragPos({
					right,
					bottom
				});
			};
			const onPointerUp = () => {
				if (dragRef.current === null) return;
				dragRef.current = null;
				if (draggedRef.current) props.onDraggingChange?.(false);
				if (dragPos !== null) props.onDragEnd(dragPos.right, dragPos.bottom);
			};
			const pos = dragPos ?? {
				right: display.right,
				bottom: display.bottom
			};
			const spriteWidth = Math.round(cell.width * spriteScale);
			const spriteHeight = Math.round(cell.height * spriteScale);
			const [facingRight, setFacingRight] = (0, react.useState)(false);
			const walkRafRef = (0, react.useRef)(0);
			const walkTargetRef = (0, react.useRef)(null);
			const dragPosRef = (0, react.useRef)(dragPos);
			dragPosRef.current = dragPos;
			/** Stop an active walk; `persist` lands the pet on the spot it reached. */
			const endWalk = (persist) => {
				if (walkRafRef.current === 0) return;
				window.cancelAnimationFrame(walkRafRef.current);
				walkRafRef.current = 0;
				setFacingRight(false);
				const settled = walkTargetRef.current;
				walkTargetRef.current = null;
				if (persist && settled !== null) props.onDragEnd(settled.right, settled.bottom);
			};
			(0, react.useEffect)(() => {
				const bus = props.bus;
				if (bus === void 0) return void 0;
				bus.walk = (direction, distance, speed) => {
					if (dragRef.current !== null || walkRafRef.current !== 0) return 0;
					const current = dragPosRef.current ?? {
						right: display.right,
						bottom: display.bottom
					};
					const margin = 8;
					const maxRight = Math.max(margin, window.innerWidth - spriteWidth - margin);
					const maxBottom = Math.max(margin, window.innerHeight - spriteHeight - margin);
					const wanted = { ...current };
					if (direction === "left") wanted.right = current.right + distance;
					else if (direction === "right") wanted.right = current.right - distance;
					else if (direction === "up") wanted.bottom = current.bottom + distance;
					else wanted.bottom = current.bottom - distance;
					const target = {
						right: Math.max(margin, clampOffset(wanted.right, maxRight)),
						bottom: Math.max(margin, clampOffset(wanted.bottom, maxBottom))
					};
					const travelled = direction === "left" ? target.right - current.right : direction === "right" ? current.right - target.right : direction === "up" ? target.bottom - current.bottom : current.bottom - target.bottom;
					if (travelled < 1) return 0;
					const duration = Math.max(150, travelled / Math.max(1, speed) * 1e3);
					const startedAt = performance.now();
					setFacingRight(direction === "right");
					walkTargetRef.current = current;
					const step = (now) => {
						const t = Math.min(1, (now - startedAt) / duration);
						const next = {
							right: current.right + (target.right - current.right) * t,
							bottom: current.bottom + (target.bottom - current.bottom) * t
						};
						walkTargetRef.current = next;
						setDragPos(next);
						if (t < 1) {
							walkRafRef.current = window.requestAnimationFrame(step);
							return;
						}
						walkRafRef.current = 0;
						walkTargetRef.current = null;
						setFacingRight(false);
						props.onDragEnd(next.right, next.bottom);
					};
					walkRafRef.current = window.requestAnimationFrame(step);
					return travelled;
				};
				return () => {
					bus.walk = void 0;
					if (walkRafRef.current !== 0) {
						window.cancelAnimationFrame(walkRafRef.current);
						walkRafRef.current = 0;
					}
					setFacingRight(false);
					walkTargetRef.current = null;
				};
			}, [
				props.bus,
				definition.id,
				display.right,
				display.bottom,
				spriteWidth
			]);
			const bubbleScale = bubbleScaleFor(display);
			const statusBubblesOn = (snapshot?.statusBubbles ?? "auto") !== "off";
			const sessionBubbles = statusBubblesOn ? snapshot?.sessions ?? [] : [];
			const stackOpen = stackPeek || stackPinned;
			const visibleSessions = !stackOpen && sessionBubbles.length > 1 ? sessionBubbles.slice(0, 1) : sessionBubbles;
			const statusBubble = statusBubblesOn && feedback === null && sessionBubbles.length === 0 ? snapshot?.bubble : void 0;
			const announced = snapshot?.announcements ?? (snapshot?.announcement !== void 0 ? [snapshot.announcement] : []);
			const now = Date.now();
			const usageAnnouncements = feedback === null ? announced.filter((entry) => announcementFresh(entry, now)) : [];
			const bubblePresent = feedback !== null || sessionBubbles.length > 0 || statusBubble !== void 0 || usageAnnouncements.length > 0;
			const displayName = snapshot?.name ?? definition.displayName;
			const decoration = snapshot?.decoration;
			(0, react.useEffect)(() => {
				if (sessionBubbles.length <= 1) setStackPinned(false);
			}, [sessionBubbles.length]);
			(0, react.useLayoutEffect)(() => {
				if (!hovered) {
					setPanelAbove(false);
					setPanelLift(0);
					return;
				}
				const updatePanelPlacement = () => {
					const sprite = spriteRef.current;
					const panel = panelRef.current;
					if (sprite === null || panel === null) return;
					const above = window.innerHeight - sprite.getBoundingClientRect().bottom < panel.getBoundingClientRect().height + 8;
					setPanelAbove(above);
					const bubbleHeight = above ? bubbleRef.current?.getBoundingClientRect().height ?? 0 : 0;
					setPanelLift(bubbleHeight > 0 ? Math.ceil(bubbleHeight) + 14 : 0);
				};
				updatePanelPlacement();
				window.addEventListener("resize", updatePanelPlacement);
				return () => window.removeEventListener("resize", updatePanelPlacement);
			}, [
				hovered,
				renaming,
				pos.right,
				pos.bottom,
				display.size,
				bubblePresent,
				sessionBubbles.length,
				stackOpen,
				feedback
			]);
			const float = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: floatRef,
				className: pet_module_css_default.float,
				style: {
					right: pos.right,
					bottom: pos.bottom,
					zIndex: 2147483e3,
					"--pet-bubble-scale": String(bubbleScale)
				},
				onPointerEnter: () => {
					clearHideTimer();
					setHovered(true);
				},
				onPointerLeave: (e) => {
					const next = e.relatedTarget;
					if (next instanceof Node && floatRef.current?.contains(next)) return;
					if (renaming) return;
					clearHideTimer();
					hideTimerRef.current = window.setTimeout(() => setHovered(false), 300);
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: pet_module_css_default.spriteWrap,
						style: {
							width: spriteWidth,
							height: spriteHeight
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							ref: spriteRef,
							className: pet_module_css_default.sprite,
							style: {
								width: spriteWidth,
								height: spriteHeight,
								...props.visual === void 0 ? {
									backgroundImage: imageReady ? "url(" + definition.atlasUrl + ")" : void 0,
									backgroundSize: cell.width * columns * spriteScale + "px " + cell.height * (definition.atlasRows ?? rows.length) * spriteScale + "px",
									backgroundRepeat: "no-repeat",
									backgroundPosition: "0 0"
								} : {},
								cursor: dragRef.current === null ? "grab" : "grabbing",
								...facingRight ? { transform: "scaleX(-1)" } : {}
							},
							onPointerDown,
							onPointerMove,
							onPointerUp,
							onClick: (e) => {
								if (draggedRef.current) return;
								if (props.onGameplayTap !== void 0 && spriteRef.current !== null) {
									const rect = spriteRef.current.getBoundingClientRect();
									if (rect.width > 0 && rect.height > 0) props.onGameplayTap((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
								}
								props.onPet();
							},
							role: "button",
							"aria-label": definition.displayName,
							children: props.visual
						})
					}),
					props.hud,
					feedback !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						ref: bubbleRef,
						className: clsx(pet_module_css_default.bubble, feedback.kind === "feed" ? pet_module_css_default.bubbleFeed : pet_module_css_default.bubblePet),
						children: feedback.text
					}, feedback.at),
					feedback === null && (sessionBubbles.length > 0 || statusBubble !== void 0 || usageAnnouncements.length > 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						ref: bubbleRef,
						className: pet_module_css_default.bubbleStack,
						onPointerEnter: () => setStackPeek(true),
						onPointerLeave: () => setStackPeek(false),
						children: [
							visibleSessions.map((session, index) => {
								const speaksWhisper = session.whisper !== void 0;
								const bubble = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: clsx(pet_module_css_default.bubble, pet_module_css_default.bubbleStatus, pet_module_css_default.bubbleClickable, speaksWhisper && pet_module_css_default.bubbleWhisper),
									title: props.t("pet.openSessionHint"),
									onClick: () => {
										props.onOpenSession(session.sessionId);
									},
									children: [index === 0 && !speaksWhisper && decoration !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatusOrnament, {
										decoration,
										phase
									}), session.whisper ?? session.bubble]
								}, speaksWhisper ? "whisper:" + session.whisper : session.sessionId);
								if (index !== 0 || sessionBubbles.length <= 1) return bubble;
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: pet_module_css_default.bubbleAnchor,
									children: [bubble, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: pet_module_css_default.bubbleMore,
										title: stackOpen ? props.t("pet.collapseSessions") : props.t("pet.moreSessions", { n: sessionBubbles.length - 1 }),
										"aria-label": stackOpen ? props.t("pet.collapseSessions") : props.t("pet.moreSessions", { n: sessionBubbles.length - 1 }),
										"aria-expanded": stackOpen,
										onClick: (e) => {
											e.stopPropagation();
											setStackPinned((open) => !open);
										},
										children: stackOpen ? "×" : "+" + String(sessionBubbles.length - 1)
									})]
								}, "primary");
							}),
							sessionBubbles.length === 0 && statusBubble !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: clsx(pet_module_css_default.bubble, pet_module_css_default.bubbleStatus),
								role: "status",
								"aria-live": "polite",
								children: [decoration !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatusOrnament, {
									decoration,
									phase
								}), statusBubble]
							}, "status"),
							usageAnnouncements.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageAnnouncementBubble, { announcement: entry }, entry.source))
						]
					}),
					hovered && dragRef.current === null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						ref: panelRef,
						className: clsx(pet_module_css_default.panel, panelAbove && pet_module_css_default.panelAbove),
						"data-placement": panelAbove ? "above" : "below",
						style: panelAbove && panelLift > 0 ? { marginBottom: panelLift } : void 0,
						onPointerEnter: () => {
							clearHideTimer();
						},
						children: renaming ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: pet_module_css_default.renameRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: pet_module_css_default.nameInput,
								value: nameDraft,
								maxLength: 20,
								placeholder: props.t("pet.namePlaceholder"),
								autoFocus: true,
								onChange: (e) => setNameDraft(e.target.value),
								onCompositionStart: () => {
									composingRef.current = true;
								},
								onCompositionEnd: () => {
									composingRef.current = false;
								},
								onKeyDown: (e) => {
									if (composingRef.current || e.nativeEvent.isComposing || e.key === "Process") return;
									if (e.key === "Enter") {
										const trimmed = nameDraft.trim();
										if (trimmed !== "") {
											props.onRename(trimmed);
											setRenaming(false);
										}
									} else if (e.key === "Escape") setRenaming(false);
								}
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: pet_module_css_default.action,
								onClick: () => {
									const trimmed = nameDraft.trim();
									if (trimmed !== "") {
										props.onRename(trimmed);
										setRenaming(false);
									}
								},
								children: panelLabel("confirm", props.t("pet.confirm"))
							})]
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: pet_module_css_default.rankRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: pet_module_css_default.nameCell,
									children: displayName
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: pet_module_css_default.statRank,
									children: (() => {
										const rawRank = snapshot?.affinity.rank ?? "?";
										const rankKey = `pet.rank.name.${rawRank}`;
										const localized = props.t(rankKey);
										return panelStat("rank", "pet.rank", { rank: localized !== rankKey ? localized : rawRank });
									})()
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: pet_module_css_default.rankRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: pet_module_css_default.statTreats,
									children: panelStat("treats", "pet.treats", { n: snapshot?.treats.stocked ?? 0 })
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: pet_module_css_default.statPoints,
									children: panelStat("points", "pet.points", { points: snapshot?.affinity.points ?? 0 })
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: pet_module_css_default.actions,
								children: [
									panelShows("feed") && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: pet_module_css_default.action,
										onClick: props.onFeed,
										children: panelLabel("feed", props.t("pet.feed"))
									}),
									panelShows("rename") && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: pet_module_css_default.action,
										onClick: () => {
											clearHideTimer();
											setNameDraft(displayName);
											setRenaming(true);
										},
										children: panelLabel("rename", props.t("pet.rename"))
									}),
									panelShows("hide") && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: pet_module_css_default.action,
										onClick: props.onHide,
										children: panelLabel("hide", props.t("pet.hide"))
									}),
									props.onGameplayMenu !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: pet_module_css_default.action,
										onClick: props.onGameplayMenu,
										children: props.t("pet.gameplay.menu")
									}),
									(snapshot?.panelActions ?? []).map((action) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: pet_module_css_default.action,
										"data-dsh-pet-panel-action": action.id,
										...action.title === void 0 ? {} : { title: action.title },
										onClick: () => {
											props.onPanelAction(action.id);
										},
										children: action.label
									}, action.id))
								]
							})
						] })
					})
				]
			});
			return (0, react_dom.createPortal)(float, props.portalTarget ?? document.body);
		}
		//#endregion
		//#region src/client/drag-stream.ts
		/** Create the stream (one per pet activation, owned by the renderer switch). */
		function createDragStream() {
			let current = false;
			const listeners = /* @__PURE__ */ new Set();
			return {
				get: () => current,
				subscribe(listener) {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				push(dragging) {
					if (dragging === current) return;
					current = dragging;
					for (const listener of [...listeners]) listener(dragging);
				}
			};
		}
		//#endregion
		//#region src/client/renderers/registry.ts
		/** Renderer dispatch table. */
		var RendererRegistry = class {
			renderers = /* @__PURE__ */ new Map();
			/** Register one renderer implementation (id wins on re-register). */
			register(renderer) {
				this.renderers.set(renderer.id, renderer);
			}
			/** Whether a renderer kind is available in this build. */
			has(id) {
				return this.renderers.has(id);
			}
			/** The registered renderer kinds (for diagnostics). */
			kinds() {
				return [...this.renderers.keys()].sort();
			}
			/** Remove every registration (tests; the client index registers once). */
			clear() {
				this.renderers.clear();
			}
			/**
			* Mount a renderer for one activation. An unknown kind renders a clear
			* diagnostic card into the container instead of failing silently.
			*/
			mount(kind, ctx, config) {
				const renderer = this.renderers.get(kind);
				if (renderer === void 0) {
					const note = document.createElement("div");
					note.dataset.dshPetRendererFallback = kind;
					note.textContent = "Pet renderer \"" + kind + "\" is not available in this build (supported: " + this.kinds().join(", ") + ").";
					ctx.container.appendChild(note);
					ctx.onCleanup(() => note.remove());
					return { dispose: () => note.remove() };
				}
				return renderer.mount(ctx, renderer.validateConfig(config));
			}
		};
		/**
		* The plugin-wide renderer registry. The client entry registers the
		* built-in renderers at apply time; the renderer switch and the live2d
		* bridge dispatch through this instance.
		*/
		const defaultPetRendererRegistry = new RendererRegistry();
		//#endregion
		//#region src/client/phase-stream.ts
		/** Create the stream (one per pet entry lifetime, owned by the plugin body). */
		function createPhaseStream(initial = "idle") {
			let current = initial;
			const listeners = /* @__PURE__ */ new Set();
			return {
				get: () => current,
				subscribe(listener) {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				push(phase) {
					if (phase === current) return;
					current = phase;
					for (const listener of [...listeners]) listener(phase);
				}
			};
		}
		//#endregion
		//#region src/client/renderers/live2d/Live2dVisualMount.tsx
		/**
		* Live2D visual mount (pet-center M3) — the React bridge between the pet
		* center chrome and the imperative live2d renderer. The bridge owns the
		* contract context (asset base, phase stream, interaction write-back,
		* activation cleanups), feeds the polled phase into the stream, forwards
		* sub-4px taps as hit-test coordinates, and renders the localized error
		* card when the renderer reports a fatal boot failure.
		* @module @linxin666/dsh-pet/client/renderers/live2d/Live2dVisualMount
		*/
		/** Mount the live2d renderer as the sprite's visual (inside the chrome). */
		function Live2dVisualMount(props) {
			const containerRef = (0, react.useRef)(null);
			const streamRef = (0, react.useRef)(null);
			const handleRef = (0, react.useRef)(null);
			const downRef = (0, react.useRef)(null);
			const [error, setError] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				setError(null);
				const container = containerRef.current;
				const live2d = props.definition.live2d;
				if (container === null || live2d === void 0) return void 0;
				streamRef.current ??= createPhaseStream(props.phase);
				const cleanups = [];
				const ctx = {
					petId: props.definition.id,
					assetBase: "/pet/" + encodeURIComponent(props.definition.id),
					container,
					phase: streamRef.current,
					interact: props.onPet,
					onCleanup: (fn) => {
						cleanups.push(fn);
					}
				};
				let handle;
				try {
					handle = defaultPetRendererRegistry.mount("live2d", ctx, live2d);
				} catch {
					setError("load-failed");
					return () => {
						for (const fn of cleanups.splice(0)) fn();
					};
				}
				handleRef.current = handle;
				handle.onError?.(setError);
				return () => {
					handleRef.current = null;
					for (const fn of cleanups.splice(0)) fn();
					handle.dispose();
				};
			}, [props.definition]);
			(0, react.useEffect)(() => {
				streamRef.current?.push(props.phase);
			}, [props.phase]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				ref: containerRef,
				"data-dsh-pet-live2d": props.definition.id,
				style: {
					width: "100%",
					height: "100%"
				},
				onPointerDown: (e) => {
					downRef.current = {
						x: e.clientX,
						y: e.clientY
					};
				},
				onPointerUp: (e) => {
					const down = downRef.current;
					downRef.current = null;
					if (down === null) return;
					if (Math.abs(e.clientX - down.x) > 4 || Math.abs(e.clientY - down.y) > 4) return;
					const rect = e.currentTarget.getBoundingClientRect();
					handleRef.current?.tap(e.clientX - rect.left, e.clientY - rect.top);
				},
				children: error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					"data-dsh-pet-live2d-error": error,
					children: error === "core-missing" ? props.t("pet.live2d.core-missing") : error === "vendor-missing" ? props.t("pet.live2d.vendor-missing") : props.t("pet.live2d.load-failed")
				})
			});
		}
		//#endregion
		//#region src/client/renderers/Frames2dVisualMount.tsx
		/**
		* Frames2d visual mount — the React bridge between the pet center chrome
		* and the imperative frames2d renderer, mirroring the live2d mount. The
		* bridge owns the contract context (asset base, phase stream, interaction
		* write-back, activation cleanups), feeds the polled phase into the stream,
		* forwards the chrome's drag gesture onto the conventional 'drag' track
		* (when the pet declares one), and renders the localized fallback card when
		* the served config is invalid.
		* @module @linxin666/dsh-pet/client/renderers/Frames2dVisualMount
		*/
		/** Mount the frames2d renderer as the sprite's visual (inside the chrome). */
		function Frames2dVisualMount(props) {
			const containerRef = (0, react.useRef)(null);
			const streamRef = (0, react.useRef)(null);
			const handleRef = (0, react.useRef)(null);
			const [invalid, setInvalid] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				setInvalid(false);
				const container = containerRef.current;
				const frames2d = props.definition.frames2d;
				if (container === null || frames2d === void 0) return void 0;
				streamRef.current ??= createPhaseStream(props.phase);
				const cleanups = [];
				const ctx = {
					petId: props.definition.id,
					assetBase: "/pet/" + encodeURIComponent(props.definition.id),
					container,
					phase: streamRef.current,
					interact: props.onPet,
					onCleanup: (fn) => {
						cleanups.push(fn);
					}
				};
				let handle;
				try {
					handle = defaultPetRendererRegistry.mount("frames2d", ctx, frames2d);
				} catch {
					setInvalid(true);
					return () => {
						for (const fn of cleanups.splice(0)) fn();
					};
				}
				handleRef.current = handle;
				if (props.bus !== void 0) {
					const gameplayBus = props.bus;
					gameplayBus.setTrack = (track) => {
						handleRef.current?.setState(track);
					};
					gameplayBus.setIdleTrack = (track) => {
						handleRef.current?.setIdleTrack(track);
					};
					if (gameplayBus.idleTrack !== void 0) handle.setIdleTrack(gameplayBus.idleTrack);
					cleanups.push(() => {
						gameplayBus.setTrack = void 0;
						gameplayBus.setIdleTrack = void 0;
					});
				}
				const dragTrack = props.definition.gameplay?.dragState ?? (frames2d.tracks.drag === void 0 ? void 0 : "drag");
				const offDrag = props.drag.subscribe((dragging) => {
					if (dragTrack === void 0) return;
					if (dragging) {
						handle.setState(dragTrack);
						return;
					}
					handle.setState(props.definition.gameplay?.dragEndState);
				});
				cleanups.push(offDrag);
				return () => {
					handleRef.current = null;
					for (const fn of cleanups.splice(0)) fn();
					handle.dispose();
				};
			}, [props.definition]);
			(0, react.useEffect)(() => {
				streamRef.current?.push(props.phase);
			}, [props.phase]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				ref: containerRef,
				"data-dsh-pet-frames2d": props.definition.id,
				style: {
					width: "100%",
					height: "100%",
					pointerEvents: "none"
				},
				children: invalid && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					"data-dsh-pet-frames2d-error": "invalid-config",
					children: props.t("pet.renderer.unavailable", { renderer: "frames2d" })
				})
			});
		}
		//#endregion
		//#region src/client/renderers/PetRendererSwitch.tsx
		/**
		* Renderer switch — the client dispatch seam of the pet center (issue #623,
		* milestone M2 P5 / M3). The pet's manifest picks the renderer: sprite2d
		* hands straight through to the sprite; live2d injects its visual INTO the
		* sprite chrome (the dock, bubbles and panel belong to the pet center, not
		* the renderer); a renderer this build cannot serve renders a clear
		* diagnostic card instead of blanking.
		* @module @linxin666/dsh-pet/client/renderers/PetRendererSwitch
		*/
		/** Dispatch one pet definition to its renderer; unknown kinds get a card. */
		function PetRendererSwitch(props) {
			const renderer = props.definition.renderer ?? "sprite2d";
			const dragRef = (0, react.useRef)(null);
			if (dragRef.current === null || dragRef.current.id !== props.definition.id) dragRef.current = {
				id: props.definition.id,
				stream: createDragStream()
			};
			const drag = props.drag ?? dragRef.current.stream;
			if (renderer === "sprite2d") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: props.children });
			if (renderer === "frames2d" && defaultPetRendererRegistry.has("frames2d") && (0, react.isValidElement)(props.children)) {
				const visual = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Frames2dVisualMount, {
					definition: props.definition,
					phase: props.phase,
					onPet: props.onPet,
					drag,
					...props.bus === void 0 ? {} : { bus: props.bus },
					t: props.t
				});
				return (0, react.cloneElement)(props.children, {
					visual,
					onDraggingChange: (dragging) => drag.push(dragging)
				});
			}
			if (renderer === "live2d" && defaultPetRendererRegistry.has("live2d") && (0, react.isValidElement)(props.children)) {
				const visual = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Live2dVisualMount, {
					definition: props.definition,
					phase: props.phase,
					onPet: props.onPet,
					t: props.t
				});
				return (0, react.cloneElement)(props.children, { visual });
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				"data-dsh-pet-renderer-fallback": renderer,
				children: props.t("pet.renderer.unavailable", { renderer })
			});
		}
		//#endregion
		//#region src/gameplay.ts
		/** Every roam direction, in roll order (equal chance each unless restricted). */
		const PET_ROAM_DIRECTIONS = [
			"up",
			"down",
			"left",
			"right"
		];
		/**
		* One declared extra mode, by OWN key only. A plain `modes[id]` lookup also
		* answers for Object.prototype members ('constructor', 'toString', …), which
		* would let a crafted mode id pass the "is it declared?" test.
		*/
		function declaredModeOf(manifest, mode) {
			const modes = manifest.modes;
			if (modes === void 0 || !Object.prototype.hasOwnProperty.call(modes, mode)) return void 0;
			return modes[mode];
		}
		/** Every mode the menu offers, in manifest order (sleep first, then extras). */
		function declaredModes(manifest) {
			return [...manifest.sleep === void 0 ? [] : ["sleep"], ...Object.keys(manifest.modes ?? {})];
		}
		/**
		* The frames2d track one active mode holds. 'work' is owned by the work loop
		* (its state, result and fallback are its own), so it resolves to undefined.
		*/
		function modeStateOf(manifest, mode) {
			if (mode === "sleep") return manifest.sleep?.state;
			if (mode === "work") return manifest.work?.state;
			return declaredModeOf(manifest, mode)?.state;
		}
		/** The zone one normalized hit-box point lands in, if any. */
		function touchZoneAt(touch, yFraction) {
			return touch.zones.find((zone) => yFraction >= zone.y0 && yFraction < zone.y1);
		}
		//#endregion
		//#region src/client/gameplay-hud.tsx
		/**
		* Gameplay HUD — the client half of the manifest 'gameplay' block (miku-pet
		* generalization). One component owns everything the block needs: the stat
		* bars and shop card (menu / shop pages), the touch-zone tap
		* handling, the idle director rolls, the work and sleep loops, and the
		* float-text toasts. It talks to the host through the injected verb API,
		* writes results straight back into the store (the 2 s poll stays the
		* backstop), and steers the frames2d renderer through the per-pet bus.
		* @module @linxin666/dsh-pet/client/GameplayHud
		*/
		let floatSeq = 0;
		/** The gameplay overlay for one frames2d pet that declares 'gameplay'. */
		function GameplayHud(props) {
			const { definition, store, api, bus } = props;
			const ui = (0, react.useSyncExternalStore)(store.subscribe, store.getSnapshot);
			const def = definition.gameplay;
			const view = ui.snapshot?.gameplay;
			const persistedSkin = ui.snapshot?.skin;
			const [open, setOpen] = (0, react.useState)(false);
			const [page, setPage] = (0, react.useState)("root");
			const [skinId, setSkinId] = (0, react.useState)(void 0);
			const skinIdRef = (0, react.useRef)(void 0);
			skinIdRef.current = skinId;
			const hudRef = (0, react.useRef)(null);
			const cardRef = (0, react.useRef)(null);
			const [floats, setFloats] = (0, react.useState)([]);
			const modeRef = (0, react.useRef)(view?.mode ?? null);
			modeRef.current = view?.mode ?? null;
			/** Live gameplay view for the interval loops (def identity is stable, view is not). */
			const viewRef = (0, react.useRef)(view);
			viewRef.current = view;
			const draggingRef = (0, react.useRef)(false);
			const touchLockUntilRef = (0, react.useRef)(0);
			const missRef = (0, react.useRef)(0);
			const busyRef = (0, react.useRef)(false);
			/** A roam walk owns the visual right now (the idle director must not steal it). */
			const roamHeldRef = (0, react.useRef)(false);
			/** A one-shot idle-director act owns the visual right now (the roam must not cut in). */
			const actHeldRef = (0, react.useRef)(false);
			/** Pending release of the roam's walk track (cleared when another owner takes it). */
			const roamTimerRef = (0, react.useRef)(0);
			const tr = props.t;
			const statLabel = (name) => tr("pet.gameplay.stat." + name);
			const currencyLabel = (name) => tr("pet.gameplay.currency." + name);
			const pushFloat = (text) => {
				const id = ++floatSeq;
				setFloats((list) => [...list.slice(-3), {
					id,
					text
				}]);
				window.setTimeout(() => {
					setFloats((list) => list.filter((entry) => entry.id !== id));
				}, 1100);
			};
			const applyResult = (result) => {
				if (result.view !== void 0) store.actions.setGameplayView(result.view);
			};
			/**
			* Give up the roam's claim on the shared track-override slot. Every other
			* owner (a mode, a touch reaction, a drag) calls this before it takes the
			* slot, so a walk that is still in flight can never release someone else's
			* track when its own hold window elapses.
			*/
			const yieldRoam = () => {
				if (roamTimerRef.current !== 0) {
					window.clearTimeout(roamTimerRef.current);
					roamTimerRef.current = 0;
				}
				roamHeldRef.current = false;
			};
			(0, react.useEffect)(() => {
				if (def === void 0) return void 0;
				const holdTrack = (track, holdMs) => {
					yieldRoam();
					bus.setTrack?.(track);
					touchLockUntilRef.current = Date.now() + holdMs;
					window.setTimeout(() => {
						if (Date.now() >= touchLockUntilRef.current) bus.setTrack?.(void 0);
					}, holdMs);
				};
				const speak = (phrases) => {
					if (phrases !== void 0 && phrases.length > 0) {
						const phrase = phrases[Math.floor(Math.random() * phrases.length)];
						store.actions.setFeedback({
							text: phrase,
							kind: "none",
							at: Date.now()
						});
					}
				};
				const trackDuration = (track) => definition.frames2d?.tracks[track]?.durations.reduce((sum, ms) => sum + ms, 0) ?? 0;
				bus.tap = (fx, fy) => {
					if (modeRef.current !== null && modeRef.current !== "work") {
						api.setMode(null).then(applyResult, () => void 0);
						return;
					}
					if (modeRef.current === "work") return;
					const box = def.hitBox ?? {
						x0: 0,
						y0: 0,
						x1: 1,
						y1: 1
					};
					const hx = (fx - box.x0) / (box.x1 - box.x0);
					const hy = (fy - box.y0) / (box.y1 - box.y0);
					if (hx < 0 || hx > 1 || hy < 0 || hy > 1) return;
					if (Date.now() < touchLockUntilRef.current) {
						api.touch().then(applyResult, () => void 0);
						return;
					}
					const activeSkin = definition.frames2d?.skins?.find((skin) => skin.id === skinIdRef.current);
					if (activeSkin !== void 0) {
						const actions = activeSkin.clickActions ?? [];
						if (actions.length > 0) {
							let roll = Math.random();
							const fired = actions.find((action) => {
								if (roll < action.probability) return true;
								roll -= action.probability;
								return false;
							});
							if (fired !== void 0) {
								holdTrack(fired.track, trackDuration(fired.track) || 3e3);
								speak(fired.phrases);
								return;
							}
						}
						api.touch().then(applyResult, () => void 0);
						return;
					}
					const zone = def.touch === void 0 ? void 0 : touchZoneAt(def.touch, hy);
					if (zone === void 0) return;
					api.touch(zone.name).then((result) => {
						applyResult(result);
						if (result.hit !== true) return;
						if (result.state !== void 0) holdTrack(result.state, result.stateMs ?? 3e3);
						if (result.phrase !== void 0) store.actions.setFeedback({
							text: result.phrase,
							kind: "none",
							at: Date.now()
						});
					}, () => void 0);
				};
				return () => {
					bus.tap = void 0;
				};
			}, [definition.id, def]);
			(0, react.useEffect)(() => {
				bus.openCard = (next) => {
					setOpen((prev) => next ?? !prev);
					setPage("root");
				};
				return () => {
					bus.openCard = void 0;
				};
			}, [bus]);
			(0, react.useLayoutEffect)(() => {
				if (!open) return void 0;
				const hud = hudRef.current;
				const card = cardRef.current;
				if (hud === null || card === null) return void 0;
				const place = () => {
					const box = hud.parentElement?.getBoundingClientRect();
					if (box === void 0) return;
					const gap = 8;
					const width = card.getBoundingClientRect().width;
					const x = window.innerWidth - box.right >= width + gap ? box.width + gap : -(width + gap);
					card.style.transform = "translate(" + Math.round(x) + "px, " + Math.round(-box.height / 2) + "px) translateY(50%)";
					card.style.maxHeight = Math.round(box.height) + "px";
				};
				place();
				window.addEventListener("resize", place);
				return () => {
					window.removeEventListener("resize", place);
				};
			}, [open, page]);
			(0, react.useEffect)(() => {
				return props.drag.subscribe((dragging) => {
					draggingRef.current = dragging;
					if (dragging) yieldRoam();
					if (dragging && modeRef.current !== null && modeRef.current !== "work") api.setMode(null).then(applyResult, () => void 0);
				});
			}, [props.drag]);
			(0, react.useEffect)(() => {
				const director = def?.idleDirector;
				if (def === void 0 || director === void 0) return void 0;
				const total = director.idleWeight + director.acts.reduce((sum, act) => sum + act.weight, 0);
				if (total <= 0) return void 0;
				let actTimer = 0;
				const timer = window.setInterval(() => {
					if (modeRef.current !== null || draggingRef.current) return;
					if (Date.now() < touchLockUntilRef.current) return;
					if (roamHeldRef.current) return;
					if (actHeldRef.current) return;
					let pickedAct;
					if (missRef.current >= director.maxMiss) {
						const actTotal = director.acts.reduce((sum, act) => sum + act.weight, 0);
						let actRoll = Math.random() * actTotal;
						for (const act of director.acts) {
							actRoll -= act.weight;
							if (actRoll < 0) {
								pickedAct = act;
								break;
							}
						}
					} else {
						let roll = Math.random() * total;
						for (const act of director.acts) {
							roll -= act.weight;
							if (roll < 0) {
								pickedAct = act;
								break;
							}
						}
					}
					if (pickedAct === void 0) {
						missRef.current += 1;
						return;
					}
					missRef.current = 0;
					actHeldRef.current = true;
					bus.setTrack?.(pickedAct.track);
					const holdMs = definition.frames2d?.tracks[pickedAct.track]?.durations.reduce((sum, ms) => sum + ms, 0) ?? 0;
					window.clearTimeout(actTimer);
					actTimer = window.setTimeout(() => {
						actHeldRef.current = false;
					}, holdMs > 0 ? holdMs : 3e3);
					if (pickedAct.phrases !== void 0 && pickedAct.phrases.length > 0) {
						const phrase = pickedAct.phrases[Math.floor(Math.random() * pickedAct.phrases.length)];
						store.actions.setFeedback({
							text: phrase,
							kind: "none",
							at: Date.now()
						});
					}
				}, director.intervalMs);
				return () => {
					window.clearInterval(timer);
					window.clearTimeout(actTimer);
					actHeldRef.current = false;
				};
			}, [definition.id, def]);
			(0, react.useEffect)(() => {
				const work = def?.work;
				if (def === void 0 || work === void 0 || view?.mode !== "work") return void 0;
				const skinGameplay = definition.frames2d?.skins?.find((skin) => skin.id === skinIdRef.current)?.gameplayTracks;
				/** The state's track, swapped for the skin's override when it declares one. */
				const trackOf = (state) => skinGameplay?.[state] ?? state;
				bus.setTrack?.(trackOf(work.state));
				let resultTimer = 0;
				const timer = window.setInterval(() => {
					if (busyRef.current) return;
					busyRef.current = true;
					api.workTick().then((result) => {
						busyRef.current = false;
						if (modeRef.current !== "work") return;
						applyResult(result);
						if (result.ok !== true || result.outcome === void 0) return;
						const resultTrack = trackOf(result.outcome === "success" ? work.successState : work.failState);
						const hold = result.outcome === "success" ? work.resultMs?.success ?? 1300 : work.resultMs?.fail ?? 1900;
						bus.setTrack?.(resultTrack);
						resultTimer = window.setTimeout(() => {
							if (modeRef.current === "work") bus.setTrack?.(trackOf(work.state));
						}, hold);
					}, () => {
						busyRef.current = false;
					});
				}, work.tickMs);
				return () => {
					window.clearInterval(timer);
					window.clearTimeout(resultTimer);
					bus.setTrack?.(void 0);
				};
			}, [
				definition.id,
				def,
				view?.mode,
				skinId
			]);
			(0, react.useEffect)(() => {
				const active = view?.mode;
				if (def === void 0 || active === void 0 || active === null || active === "work") return void 0;
				const hold = modeStateOf(def, active);
				if (hold === void 0) return void 0;
				const skinGameplay = definition.frames2d?.skins?.find((skin) => skin.id === skinIdRef.current)?.gameplayTracks;
				yieldRoam();
				bus.setTrack?.(skinGameplay?.[active] ?? hold);
				return () => bus.setTrack?.(void 0);
			}, [
				definition.id,
				def,
				view?.mode,
				skinId
			]);
			(0, react.useEffect)(() => {
				const roam = def?.roam;
				if (def === void 0 || roam === void 0) return void 0;
				const roll = () => {
					if (modeRef.current !== null || draggingRef.current) return;
					if (Date.now() < touchLockUntilRef.current) return;
					if (roamHeldRef.current || actHeldRef.current) return;
					if (Math.random() >= roam.probability) return;
					const span = roam.distanceMax - roam.distanceMin;
					const distance = roam.distanceMin + Math.random() * span;
					const directions = roam.directions ?? PET_ROAM_DIRECTIONS;
					const direction = directions[Math.floor(Math.random() * directions.length)] ?? "left";
					const travelled = bus.walk?.(direction, distance, roam.speed) ?? 0;
					if (travelled === 0) return;
					roamHeldRef.current = true;
					bus.setTrack?.(roam.state);
					roamTimerRef.current = window.setTimeout(() => {
						roamTimerRef.current = 0;
						if (!roamHeldRef.current) return;
						roamHeldRef.current = false;
						bus.setTrack?.(void 0);
					}, Math.max(150, Math.abs(travelled) / roam.speed * 1e3));
				};
				let timer = 0;
				const lead = window.setTimeout(() => {
					roll();
					timer = window.setInterval(roll, roam.intervalMs);
				}, Math.round(roam.intervalMs / 2));
				return () => {
					window.clearTimeout(lead);
					window.clearInterval(timer);
					yieldRoam();
				};
			}, [definition.id, def]);
			if (def === void 0 || view === void 0) return null;
			const mode = view.mode;
			const stats = def.stats ?? {};
			const shop = def.shop;
			const menuModes = declaredModes(def);
			/** Action-button label for one mode (active = the button that leaves it). */
			const modeLabel = (name, active) => {
				if (name === "sleep") return tr(active ? "pet.gameplay.wake" : "pet.gameplay.sleep");
				const declared = def.modes?.[name];
				return (active ? declared?.activeLabel ?? declared?.label : declared?.label) ?? tr("pet.gameplay." + name);
			};
			/** Chip label for the mode the pet is in right now. */
			const modeChip = (name) => {
				if (name === "work") return tr("pet.gameplay.working");
				if (name === "sleep") return tr("pet.gameplay.sleeping");
				const declared = def.modes?.[name];
				return declared?.activeLabel ?? declared?.label ?? tr("pet.gameplay." + name);
			};
			const buy = (itemId) => {
				api.buy(itemId).then((result) => {
					applyResult(result);
					if (result.ok !== true) {
						if (result.error === "insufficient-funds") {
							const item = shop?.items.find((entry) => entry.id === itemId);
							pushFloat(tr("pet.gameplay.insufficient", { currency: currencyLabel(item?.currency ?? "treats") }));
						}
						return;
					}
					if (result.prize !== void 0) pushFloat(tr("pet.gameplay.prize", {
						amount: result.prize.amount,
						currency: currencyLabel(result.prize.currency)
					}));
				}, () => void 0);
			};
			const setMode = (next) => {
				api.setMode(next).then(applyResult, () => void 0);
			};
			(0, react.useEffect)(() => {
				setSkinId(persistedSkin);
			}, [definition.id, persistedSkin]);
			(0, react.useEffect)(() => {
				const skin = definition.frames2d?.skins?.find((candidate) => candidate.id === skinId);
				bus.idleTrack = skin?.idleTrack;
				bus.setIdleTrack?.(skin?.idleTrack);
			}, [
				definition.id,
				skinId,
				persistedSkin
			]);
			const skins = definition.frames2d?.skins;
			/** The base idle track one skin id resolves to (undefined = default look). */
			const skinTrackOf = (id) => id === void 0 ? void 0 : definition.frames2d?.skins?.find((candidate) => candidate.id === id)?.idleTrack;
			const selectSkin = (skin) => {
				setSkinId(skin?.id);
				bus.setIdleTrack?.(skin?.idleTrack);
				const restore = () => {
					setSkinId(persistedSkin);
					bus.setIdleTrack?.(skinTrackOf(persistedSkin));
				};
				api.setSkin(skin?.id).then((result) => {
					if (result.ok) return;
					restore();
				}, restore);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: hudRef,
				className: pet_module_css_default.gameplayHud,
				"data-dsh-pet-gameplay": definition.id,
				children: [
					floats.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: pet_module_css_default.gameplayFloat,
						children: entry.text
					}, entry.id)),
					mode !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: pet_module_css_default.gameplayModeChip,
						children: modeChip(mode)
					}),
					open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						ref: cardRef,
						className: pet_module_css_default.gameplayCard,
						"data-page": page,
						children: [
							page === "root" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: pet_module_css_default.gameplayBars,
								children: Object.entries(stats).map(([name, stat]) => {
									const value = view.stats[name] ?? 0;
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: pet_module_css_default.gameplayBarRow,
										title: statLabel(name) + " " + String(value) + "/" + String(stat.max),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: pet_module_css_default.gameplayBarLabel,
											children: statLabel(name)
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: pet_module_css_default.gameplayBarTrack,
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: pet_module_css_default.gameplayBarFill,
												style: { width: Math.round(value / stat.max * 100) + "%" }
											})
										})]
									}, name);
								})
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: pet_module_css_default.gameplayActions,
								children: [
									menuModes.map((name) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: pet_module_css_default.action,
										onClick: () => setMode(mode === name ? null : name),
										children: modeLabel(name, mode === name)
									}, name)),
									shop !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: pet_module_css_default.action,
										onClick: () => setPage("shop"),
										children: tr("pet.gameplay.shop")
									}),
									skins !== void 0 && skins.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: pet_module_css_default.action,
										onClick: () => setPage("skins"),
										children: tr("pet.gameplay.skin")
									}),
									def.work !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: pet_module_css_default.action,
										onClick: () => setMode(mode === "work" ? null : "work"),
										children: tr(mode === "work" ? "pet.gameplay.stopWork" : "pet.gameplay.work")
									})
								]
							})] }),
							page === "shop" && shop !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: pet_module_css_default.gameplayShopItems,
								children: shop.items.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: pet_module_css_default.gameplayShopItem,
									onClick: () => buy(item.id),
									title: item.label + " — " + String(item.price) + " " + currencyLabel(item.currency),
									children: [
										item.image !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
											className: pet_module_css_default.gameplayShopItemImage,
											src: item.image,
											alt: "",
											draggable: false
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: pet_module_css_default.gameplayShopItemLabel,
											children: item.label
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: pet_module_css_default.gameplayShopItemPrice,
											children: [
												item.price,
												" ",
												currencyLabel(item.currency)
											]
										})
									]
								}, item.id))
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: pet_module_css_default.gameplayActions,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: pet_module_css_default.action,
									onClick: () => setPage("root"),
									children: tr("pet.gameplay.back")
								})
							})] }),
							page === "skins" && skins !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: pet_module_css_default.gameplaySkinItems,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: skinId === void 0 ? pet_module_css_default.gameplaySkinItem + " " + pet_module_css_default.gameplaySkinItemActive : pet_module_css_default.gameplaySkinItem,
									onClick: () => selectSkin(void 0),
									children: tr("pet.gameplay.skinDefault")
								}), skins.map((skin) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: skinId === skin.id ? pet_module_css_default.gameplaySkinItem + " " + pet_module_css_default.gameplaySkinItemActive : pet_module_css_default.gameplaySkinItem,
									onClick: () => selectSkin(skin),
									children: skin.label
								}, skin.id))]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: pet_module_css_default.gameplayActions,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: pet_module_css_default.action,
									onClick: () => setPage("root"),
									children: tr("pet.gameplay.back")
								})
							})] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: pet_module_css_default.gameplayClose,
								"aria-label": tr("pet.gameplay.back"),
								onClick: () => setOpen(false),
								children: "×"
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region src/client/PetDockEntry.tsx
		/**
		* Global floating pet entry. The pet is host-global (its state, display and
		* interactions live on '/api/pet/*' endpoints with no session dimension), so
		* it must not ride a session-scoped slot — on the new-conversation screen no
		* session exists to scope a slot by, and the pet would vanish (issue #48).
		* The client half therefore mounts this entry straight onto 'document.body'
		* (see index.ts): while visible it renders the floating PetSprite (a portal
		* into the plugin root, so the root owns the whole surface), while hidden it
		* renders a fixed-position summon button. Which sprite renders is decided by
		* the host snapshot's pet id resolved against the registry list — no per-pet
		* component exists.
		* @module @linxin666/dsh-pet/client/PetDockEntry
		*/
		const DEFAULT_DISPLAY = {
			visible: true,
			size: 160,
			right: 24,
			bottom: 20,
			bubbleScale: 1
		};
		/**
		* Dock entry: while the pet is visible, mount the floating PetSprite (it
		* portals itself onto document.body); while hidden, render the summon
		* button so the pet can always come back. The store is the plugin-owned
		* single instance — the slot system provides none because the pet is
		* host-global, not session-scoped.
		*/
		function PetDockEntry(props) {
			const { store, ensure } = props;
			const ui = (0, react.useSyncExternalStore)(store.subscribe, store.getSnapshot);
			const snapshot = ui.snapshot;
			const feedback = ui.feedback;
			const definition = ui.pets.find((entry) => entry.id === snapshot?.pet.id) ?? null;
			const visible = snapshot?.display.visible ?? true;
			(0, react.useEffect)(() => {
				ensure();
			}, [ensure]);
			const auxRef = (0, react.useRef)(null);
			if (definition !== null && (auxRef.current === null || auxRef.current.id !== definition.id)) auxRef.current = {
				id: definition.id,
				bus: {},
				drag: createDragStream()
			};
			const aux = auxRef.current;
			const gameplay = definition?.gameplay;
			if (visible) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				"data-pet-dock": true,
				"data-testid": "pet-dock",
				children: snapshot === null || definition === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PetRendererSwitch, {
					definition,
					phase: snapshot?.phase ?? "idle",
					onPet: props.pet,
					...aux === null ? {} : {
						drag: aux.drag,
						bus: aux.bus
					},
					t: props.t,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PetSprite, {
						snapshot,
						definition,
						display: snapshot.display,
						feedback,
						onPet: props.pet,
						onFeed: props.feed,
						onHide: props.hide,
						onDragEnd: props.dragEnd,
						onRename: props.rename,
						onPanelAction: props.panelAction,
						onOpenSession: props.openSession,
						onFeedbackDone: props.feedbackDone,
						portalTarget: props.portalTarget,
						dragDisabled: snapshot.gameplay?.mode === "work",
						...aux === null ? {} : { bus: aux.bus },
						...gameplay === void 0 || aux === null ? {} : {
							onGameplayTap: (fx, fy) => aux.bus.tap?.(fx, fy),
							onGameplayMenu: () => aux.bus.openCard?.(),
							hud: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GameplayHud, {
								definition,
								store,
								api: props.gameplay,
								bus: aux.bus,
								drag: aux.drag,
								t: props.t
							})
						},
						t: props.t
					})
				})
			});
			const display = snapshot?.display ?? DEFAULT_DISPLAY;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: pet_module_css_default.summon,
				style: {
					position: "fixed",
					right: display.right,
					bottom: display.bottom,
					zIndex: 2147483e3
				},
				onClick: props.summon,
				"data-testid": "pet-summon",
				"data-dsh-part": "summon-button",
				children: props.t("pet.summon", { name: snapshot?.name ?? "" })
			});
		}
		//#endregion
		//#region src/contracts/renderer.ts
		/** Contract version renderers declare against (independent of the manifest). */
		const PET_RENDERER_API_VERSION = "x-org.linxin666.pet-center/v1alpha1";
		//#endregion
		//#region src/client/renderers/live2d/runtime.ts
		/**
		* Live2D runtime loading (pet-center M3) — the two scripts a live2d mount
		* needs, fetched lazily through the plugin's own runtime route: the
		* user-supplied Cubism Core (proprietary; the plugin never bundles or
		* downloads it — issue #623 M1 §0) and the plugin-shipped MIT vendor bundle
		* (pixi.js + untitled-pixi-live2d-engine). Each loads at most once per page;
		* concurrent mounts share the in-flight promise, and a failure is cached as
		* 'absent' so a broken install stops retrying the network every mount.
		*
		* The vendor surface below is the structural slice the renderer consumes;
		* the real objects come from 'window.__dshPetLive2d' (lib/live2d-vendor.js),
		* so this module never imports pixi — the client bundle stays lean.
		* @module @linxin666/dsh-pet/client/renderers/live2d/runtime
		*/
		/** Runtime file URLs the host serves ('/api/pet/runtime/<name>', M3-2). */
		const CORE_URL = "/api/pet/runtime/live2dcubismcore.min.js";
		const VENDOR_URL = "/api/pet/runtime/live2d-vendor.js";
		const defaultInjector = (src) => new Promise((resolve, reject) => {
			const tag = document.createElement("script");
			tag.src = src;
			tag.onload = () => resolve();
			tag.onerror = () => reject(/* @__PURE__ */ new Error("script failed to load: " + src));
			document.head.appendChild(tag);
		});
		let corePromise;
		let vendorPromise;
		/**
		* Ensure the Cubism Core global exists, injecting the runtime-route script
		* once when absent. Resolves false when the user has not installed the core
		* (a normal state — the renderer turns it into install guidance).
		*/
		function ensureCubismCore(probe = {}) {
			if (typeof window !== "undefined" && window.Live2DCubismCore !== void 0) return Promise.resolve(true);
			if (probe.inject !== void 0) return probe.inject(CORE_URL).then(() => typeof window !== "undefined" && window.Live2DCubismCore !== void 0).catch(() => false);
			corePromise ??= defaultInjector(CORE_URL).then(() => typeof window !== "undefined" && window.Live2DCubismCore !== void 0).catch(() => false);
			return corePromise;
		}
		/** Ensure the plugin vendor bundle global exists (same caching discipline). */
		function ensureLive2dVendor(probe = {}) {
			if (typeof window !== "undefined" && window.__dshPetLive2d !== void 0) return Promise.resolve(window.__dshPetLive2d);
			if (probe.inject !== void 0) return probe.inject(VENDOR_URL).then(() => typeof window !== "undefined" ? window.__dshPetLive2d : void 0).catch(() => void 0);
			vendorPromise ??= defaultInjector(VENDOR_URL).then(() => typeof window !== "undefined" ? window.__dshPetLive2d : void 0).catch(() => void 0);
			return vendorPromise;
		}
		//#endregion
		//#region src/client/renderers/live2d.ts
		/** The de-facto tap-motion group of Cubism sample models. */
		const TAP_GROUP = "TapBody";
		/**
		* Keep one screen-appropriate atlas LOD instead of asking Pixi for the
		* engine's default full mip chain. A user model can legitimately carry an
		* 8192px texture while the pet itself is only a few hundred pixels tall;
		* `single-auto` preserves the source for larger renders and generates one
		* downsampled atlas only when the effective on-screen scale warrants it.
		*/
		const TEXTURE_OPTIONS = { lod: "single-auto" };
		/** Recursively release the activation without invalidating shared texture caches. */
		const DESTROY_OPTIONS = { children: true };
		/** Remove only this activation's canvas; `true` would release Pixi globals. */
		const RENDERER_DESTROY_OPTIONS = { removeView: true };
		/** Ignore hidden/zero boxes and keep Pixi dimensions stable and integral. */
		function normalizeRendererSize(width, height) {
			if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return void 0;
			return {
				width: Math.max(1, Math.round(width)),
				height: Math.max(1, Math.round(height))
			};
		}
		/** Fit the model from its unscaled dimensions into the current Pixi screen. */
		function layoutModel(app, model, sourceSize, config) {
			const fit = Math.min(app.renderer.width / sourceSize.width, app.renderer.height / sourceSize.height) * .92;
			model.scale.set(fit * (config.scale ?? 1));
			model.anchor.set(.5);
			model.position.set(app.renderer.width / 2 + (config.translate?.x ?? 0), app.renderer.height / 2 + (config.translate?.y ?? 0));
		}
		let vendorConfigured = false;
		/** Configure pixi extensions + the Cubism SDK once per page. */
		function configureOnce(vendor) {
			if (vendorConfigured) return;
			vendorConfigured = true;
			vendor.extensions.add(vendor.Live2DPlugin);
			vendor.configureCubismSDK({ memorySizeMB: 32 });
		}
		/** Fail-closed config validation (contract: unknown manifest block in). */
		function validateLive2dConfig(config) {
			if (typeof config !== "object" || config === null) throw new Error("live2d config is not an object");
			const source = config;
			if (typeof source.modelUrl !== "string" || source.modelUrl === "") throw new Error("live2d config modelUrl is required");
			const motions = source.motions;
			if (typeof motions !== "object" || motions === null || typeof motions.idle !== "string") throw new Error("live2d config motions.idle is required");
			return config;
		}
		/** The live2d renderer implementation. */
		const live2dRenderer = {
			id: "live2d",
			apiVersion: PET_RENDERER_API_VERSION,
			validateConfig: validateLive2dConfig,
			mount(ctx, config) {
				let disposed = false;
				let app;
				let model;
				let modelAttached = false;
				let modelSourceSize;
				let resizeObserver;
				let resizeTracking = false;
				let errorListener;
				let unsubscribe;
				/** The motion group the current phase maps to (resume target after taps). */
				let phaseGroup = config.motions.idle;
				let tapPlaying = false;
				const stopResizeTracking = () => {
					resizeTracking = false;
					resizeObserver?.disconnect();
					resizeObserver = void 0;
				};
				const resizeRenderer = (pixiApp, width, height) => {
					const next = normalizeRendererSize(width, height);
					if (disposed || !resizeTracking || next === void 0) return;
					if (pixiApp.renderer.width === next.width && pixiApp.renderer.height === next.height) return;
					pixiApp.renderer.resize(next.width, next.height);
					if (model !== void 0 && modelSourceSize !== void 0) layoutModel(pixiApp, model, modelSourceSize, config);
				};
				const trackContainerSize = (pixiApp) => {
					if (typeof ResizeObserver === "undefined") return;
					resizeTracking = true;
					resizeObserver = new ResizeObserver((entries) => {
						const entry = entries.find((candidate) => candidate.target === ctx.container);
						if (entry === void 0) return;
						resizeRenderer(pixiApp, entry.contentRect.width, entry.contentRect.height);
					});
					resizeObserver.observe(ctx.container);
					resizeRenderer(pixiApp, ctx.container.clientWidth, ctx.container.clientHeight);
				};
				/** Release every resource currently owned by this activation exactly once. */
				const destroyResources = () => {
					stopResizeTracking();
					unsubscribe?.();
					unsubscribe = void 0;
					const currentApp = app;
					const currentModel = model;
					const modelOwnedByApp = currentApp !== void 0 && modelAttached;
					app = void 0;
					model = void 0;
					modelSourceSize = void 0;
					modelAttached = false;
					try {
						if (currentModel !== void 0 && !modelOwnedByApp) currentModel.destroy(DESTROY_OPTIONS);
					} finally {
						currentApp?.destroy(RENDERER_DESTROY_OPTIONS, DESTROY_OPTIONS);
					}
				};
				const playGroup = (group) => {
					if (model === void 0) return;
					const groups = model.internalModel.settings.motions ?? {};
					const count = Array.isArray(groups[group]) ? groups[group].length : 0;
					if (count === 0) {
						if (group !== config.motions.idle) playGroup(config.motions.idle);
						return;
					}
					const index = count > 1 ? Math.floor(Math.random() * count) : 0;
					model.motion(group, index);
				};
				const applyPhase = (phase) => {
					phaseGroup = config.motions[phase] ?? config.motions.idle;
					playGroup(phaseGroup);
					const expression = config.expressions?.[phase];
					if (expression !== void 0 && model !== void 0) model.expression(expression);
				};
				const boot = async () => {
					if (!await ensureCubismCore()) {
						if (!disposed) errorListener?.("core-missing");
						return;
					}
					const vendor = await ensureLive2dVendor();
					if (vendor === void 0) {
						if (!disposed) errorListener?.("vendor-missing");
						return;
					}
					configureOnce(vendor);
					const pixiApp = new vendor.Application();
					const initialSize = normalizeRendererSize(ctx.container.clientWidth, ctx.container.clientHeight) ?? {
						width: 160,
						height: 174
					};
					try {
						await pixiApp.init({
							width: initialSize.width,
							height: initialSize.height,
							backgroundAlpha: 0,
							antialias: true,
							autoDensity: true,
							preference: "webgl"
						});
					} catch (error) {
						try {
							pixiApp.destroy(RENDERER_DESTROY_OPTIONS, DESTROY_OPTIONS);
						} catch {}
						throw error;
					}
					if (disposed) {
						pixiApp.destroy(RENDERER_DESTROY_OPTIONS, DESTROY_OPTIONS);
						return;
					}
					app = pixiApp;
					pixiApp.canvas.style.display = "block";
					pixiApp.canvas.style.width = "100%";
					pixiApp.canvas.style.height = "100%";
					ctx.container.appendChild(pixiApp.canvas);
					trackContainerSize(pixiApp);
					const loaded = await vendor.Live2DModel.from(config.modelUrl, {
						autoUpdate: false,
						autoHitTest: false,
						autoFocus: false,
						textureOptions: TEXTURE_OPTIONS
					});
					model = loaded;
					if (disposed) {
						destroyResources();
						return;
					}
					modelSourceSize = {
						width: Math.max(1, loaded.width),
						height: Math.max(1, loaded.height)
					};
					layoutModel(pixiApp, loaded, modelSourceSize, config);
					pixiApp.stage.addChild(loaded);
					modelAttached = true;
					loaded.automator.autoUpdate = true;
					loaded.on("motionFinish", () => {
						if (tapPlaying) {
							tapPlaying = false;
							playGroup(phaseGroup);
						}
					});
					applyPhase(ctx.phase.get());
					unsubscribe = ctx.phase.subscribe(applyPhase);
				};
				boot().catch(() => {
					try {
						destroyResources();
					} finally {
						if (!disposed) errorListener?.("load-failed");
					}
				});
				return {
					dispose() {
						if (disposed) return;
						disposed = true;
						destroyResources();
					},
					tap(x, y) {
						const current = model;
						if (disposed || current === void 0) return;
						const hits = current.hitTest(x, y);
						const allowed = config.hitAreas;
						if (!(allowed === void 0 ? hits.length > 0 : hits.some((name) => allowed.includes(name)))) return;
						const group = (current.internalModel.settings.motions ?? {})[TAP_GROUP];
						if (!Array.isArray(group) || group.length === 0) return;
						tapPlaying = true;
						const index = group.length > 1 ? Math.floor(Math.random() * group.length) : 0;
						current.motion(TAP_GROUP, index);
					},
					onError(listener) {
						errorListener = listener;
					}
				};
			}
		};
		//#endregion
		//#region src/client/renderers/frames2d.ts
		/**
		* frames2d renderer — plays the free-form named frame-sequence tracks of a
		* frames2d pet (manifest v2 'frames2d' block). The pet center picks the
		* track from the ActivityPhase stream (phase -> track map, idle fallback);
		* the gameplay driver may force a track through the handle's setState
		* override (drag/work/sleep/shop...), and a finished non-loop track settles
		* into its fallback, releasing the override when the fallback matches the
		* phase-mapped track. Rendering never throws: a broken track list degrades
		* to the first decodable frame, and the 1.2 s stall watchdog re-kicks the
		* playback chain after timer throttling.
		*
		* Frame presentation has two modes picked once at mount by capability
		* probing:
		* - Canvas bitmap buffer (default where createImageBitmap/fetch/2D context
		*   exist): frames are decoded once into an ImageBitmap on demand, with a
		*   bounded look-ahead window over the playing track, and drawn onto one
		*   <canvas> - steady-state playback issues zero DOM mutations and zero
		*   re-decodes (measured hotspot: swapping <img>.src per frame drove image
		*   decode + invalidation every tick).
		* - Classic <img> fallback (jsdom/tests or missing APIs): identical to the
		*   historical behavior - cache-warm Image elements plus guarded src swaps,
		*   so environments without modern decoding keep working unchanged.
		*
		* @module @linxin666/dsh-pet/client/renderers/frames2d
		*/
		/** Stall watchdog period: a looping track stuck longer re-kicks its chain. */
		const WATCHDOG_MS = 1200;
		function isRecord(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value);
		}
		/** Fail-closed client-side validation of the served frames2d block. */
		function validateFrames2dConfig(config) {
			if (!isRecord(config) || !isRecord(config.tracks) || !isRecord(config.phases)) throw new Error("frames2d config requires tracks and phases objects");
			const tracks = {};
			for (const [name, raw] of Object.entries(config.tracks)) {
				if (!isRecord(raw) || !Array.isArray(raw.frames) || raw.frames.length === 0 || raw.frames.some((f) => typeof f !== "string" || f === "") || !Array.isArray(raw.durations) || raw.durations.length !== raw.frames.length || raw.durations.some((d) => typeof d !== "number" || !(d > 0))) throw new Error("frames2d track " + JSON.stringify(name) + " needs same-length frames/durations");
				tracks[name] = {
					frames: raw.frames,
					durations: raw.durations,
					loop: raw.loop !== false,
					...typeof raw.fallback === "string" ? { fallback: raw.fallback } : {}
				};
			}
			const phases = config.phases;
			if (typeof phases.idle !== "string" || tracks[phases.idle] === void 0) throw new Error("frames2d phases.idle must name an existing track");
			let skins;
			if (Array.isArray(config.skins)) {
				const resolved = [];
				for (const skin of config.skins) {
					if (!isRecord(skin) || typeof skin.id !== "string" || typeof skin.label !== "string" || typeof skin.idleTrack !== "string" || skin.idleTrack === "") continue;
					const target = tracks[skin.idleTrack];
					if (target === void 0 || !target.loop) continue;
					let clickActions;
					if (Array.isArray(skin.clickActions)) {
						const kept = [];
						for (const action of skin.clickActions) {
							if (!isRecord(action) || typeof action.track !== "string" || action.track === "" || typeof action.probability !== "number" || !(action.probability > 0) || action.probability > 1) continue;
							if (tracks[action.track] === void 0) continue;
							kept.push({
								track: action.track,
								probability: action.probability,
								...Array.isArray(action.phrases) ? { phrases: action.phrases } : {}
							});
						}
						if (kept.length > 0) clickActions = kept;
					}
					let gameplayTracks;
					if (isRecord(skin.gameplayTracks)) {
						const kept = {};
						for (const [state, trackName] of Object.entries(skin.gameplayTracks)) {
							if (typeof trackName !== "string" || trackName === "" || tracks[trackName] === void 0) continue;
							kept[state] = trackName;
						}
						if (Object.keys(kept).length > 0) gameplayTracks = kept;
					}
					resolved.push({
						id: skin.id,
						label: skin.label,
						idleTrack: skin.idleTrack,
						...clickActions === void 0 ? {} : { clickActions },
						...gameplayTracks === void 0 ? {} : { gameplayTracks }
					});
				}
				if (resolved.length > 0) skins = resolved;
			}
			return {
				tracks,
				phases,
				...skins === void 0 ? {} : { skins }
			};
		}
		const frames2dRenderer = {
			id: "frames2d",
			apiVersion: PET_RENDERER_API_VERSION,
			validateConfig: validateFrames2dConfig,
			mount(ctx, config) {
				const reducedMotion = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
				let canvas = null;
				let context2d = null;
				let img = null;
				try {
					if (typeof createImageBitmap === "function" && typeof fetch === "function") {
						const probe = document.createElement("canvas");
						const c2d = probe.getContext("2d");
						if (c2d !== null) {
							canvas = probe;
							context2d = c2d;
						}
					}
				} catch {
					canvas = null;
					context2d = null;
				}
				if (canvas !== null && context2d !== null) {
					canvas.dataset.dshPetFrames2d = ctx.petId;
					canvas.draggable = false;
					canvas.style.width = "100%";
					canvas.style.height = "100%";
					canvas.style.objectFit = "contain";
					canvas.style.pointerEvents = "none";
					ctx.container.appendChild(canvas);
				} else {
					img = document.createElement("img");
					img.dataset.dshPetFrames2d = ctx.petId;
					img.alt = "";
					img.draggable = false;
					img.style.width = "100%";
					img.style.height = "100%";
					img.style.objectFit = "contain";
					img.style.pointerEvents = "none";
					ctx.container.appendChild(img);
				}
				const decoding = /* @__PURE__ */ new Map();
				const decodedAll = [];
				const FRAME_POOL_LIMIT = 8;
				const frameQueue = [];
				let activeFrames = 0;
				const decodeFrame = async (url) => {
					try {
						const response = await fetch(url);
						if (!response.ok) throw new Error("http " + response.status);
						const bitmap = await createImageBitmap(await response.blob());
						return {
							source: bitmap,
							width: bitmap.width,
							height: bitmap.height
						};
					} catch {
						return await new Promise((resolve) => {
							try {
								const pre = new Image();
								pre.onload = () => {
									resolve(pre.naturalWidth > 0 ? {
										source: pre,
										width: pre.naturalWidth,
										height: pre.naturalHeight
									} : void 0);
								};
								pre.onerror = () => resolve(void 0);
								pre.src = url;
							} catch {
								resolve(void 0);
							}
						});
					}
				};
				const pumpFrames = () => {
					while (activeFrames < FRAME_POOL_LIMIT && frameQueue.length > 0) {
						const queued = frameQueue.shift();
						activeFrames += 1;
						queued.release();
					}
				};
				const loadFrame = (url, jump = false) => {
					if (jump) {
						const index = frameQueue.findIndex((queued) => queued.url === url);
						if (index > 0) frameQueue.unshift(frameQueue.splice(index, 1)[0]);
					}
					const cached = decoding.get(url);
					if (cached !== void 0) return cached;
					let release;
					const job = new Promise((resolve) => {
						release = resolve;
					}).then(() => disposed ? void 0 : decodeFrame(url));
					job.then((frame) => {
						if (frame === void 0) decoding.delete(url);
					}, () => decoding.delete(url));
					job.finally(() => {
						activeFrames -= 1;
						pumpFrames();
					});
					decoding.set(url, job);
					decodedAll.push(job.then(() => void 0, () => void 0));
					const entry = {
						url,
						release
					};
					if (jump) frameQueue.unshift(entry);
					else frameQueue.push(entry);
					pumpFrames();
					return job;
				};
				/**
				* Bounded look-ahead window: decode only the frames playback is about to
				* need. The historical warm pass decoded every frame of every track up
				* front - a shipped pet carries ~1.1k 512x683 frames, so that pass pulls
				* tens of megabytes and retains every decoded bitmap for the life of the
				* page. Prefetching the playing track's next frames keeps loops and phase
				* switches warm while unplayed tracks (and every unselected skin's
				* frames) stay on demand, where playback jumps the queue anyway.
				*/
				const PREFETCH_AHEAD = 12;
				const prefetchAhead = (trackId, index) => {
					const def = config.tracks[trackId];
					if (def === void 0) return;
					const end = Math.min(def.frames.length, index + 1 + PREFETCH_AHEAD);
					for (let ahead = index + 1; ahead < end; ahead += 1) {
						const url = def.frames[ahead];
						if (url !== void 0) loadFrame(url);
					}
				};
				let disposed = false;
				let timer;
				let watchdog;
				let track = config.phases.idle;
				let frameIndex = 0;
				let lastAdvance = Date.now();
				let override;
				let baseIdle = config.phases.idle;
				let drawToken = 0;
				let lastDrawnUrl;
				const trackForPhase = (phase) => {
					const mapped = config.phases[phase];
					if (mapped === void 0) return baseIdle;
					const target = mapped === config.phases.idle ? baseIdle : mapped;
					return config.tracks[target] !== void 0 ? target : baseIdle;
				};
				/** Canvas path: paints the newest requested frame; stale draws drop out. */
				const paintCanvas = (url) => {
					if (context2d === null || canvas === null) return;
					const myToken = ++drawToken;
					loadFrame(url, true).then((frame) => {
						if (disposed || frame === void 0 || myToken !== drawToken) return;
						if (lastDrawnUrl === url) return;
						lastDrawnUrl = url;
						if (canvas.width !== frame.width || canvas.height !== frame.height) {
							canvas.width = frame.width;
							canvas.height = frame.height;
						} else context2d.clearRect(0, 0, canvas.width, canvas.height);
						context2d.drawImage(frame.source, 0, 0);
					}).catch(() => {});
				};
				const show = (trackId, index) => {
					const url = config.tracks[trackId]?.frames[index];
					if (url === void 0) return;
					prefetchAhead(trackId, index);
					if (img !== null) {
						if (img.getAttribute("src") !== url) img.src = url;
						return;
					}
					paintCanvas(url);
				};
				const schedule = (ms) => {
					if (disposed) return;
					timer = setTimeout(tick, ms);
				};
				function tick() {
					if (disposed) return;
					const def = config.tracks[track];
					if (def === void 0 || def.frames.length === 0) return;
					lastAdvance = Date.now();
					const next = frameIndex + 1;
					if (next < def.frames.length) {
						frameIndex = next;
						show(track, frameIndex);
						schedule(def.durations[frameIndex] ?? 200);
						return;
					}
					if (def.loop) {
						frameIndex = 0;
						show(track, frameIndex);
						schedule(def.durations[frameIndex] ?? 200);
						return;
					}
					const target = def.fallback !== void 0 && config.tracks[def.fallback] !== void 0 ? def.fallback === config.phases.idle ? baseIdle : def.fallback : baseIdle;
					if (target === trackForPhase(ctx.phase.get())) override = void 0;
					play(target);
				}
				function play(trackId) {
					if (disposed) return;
					if (config.tracks[trackId] === void 0) trackId = baseIdle;
					if (timer !== void 0) clearTimeout(timer);
					track = trackId;
					frameIndex = 0;
					lastAdvance = Date.now();
					show(track, frameIndex);
					if (reducedMotion) return;
					const def = config.tracks[track];
					schedule(def.durations[0] ?? 200);
				}
				const unsubscribe = ctx.phase.subscribe((phase) => {
					if (override !== void 0) return;
					const target = trackForPhase(phase);
					if (target !== track) play(target);
				});
				if (!reducedMotion) watchdog = setInterval(() => {
					if (disposed) return;
					const def = config.tracks[track];
					if (def === void 0 || !def.loop) return;
					const expected = (def.durations[frameIndex] ?? 200) + WATCHDOG_MS;
					if (Date.now() - lastAdvance > expected) tick();
				}, WATCHDOG_MS);
				play(track);
				let disposedOnce = false;
				const dispose = () => {
					if (disposedOnce) return;
					disposedOnce = true;
					disposed = true;
					unsubscribe();
					if (timer !== void 0) clearTimeout(timer);
					if (watchdog !== void 0) clearInterval(watchdog);
					for (const queued of frameQueue.splice(0)) queued.release();
					Promise.allSettled(decodedAll).then(() => {
						for (const job of decoding.values()) job.then((frame) => {
							try {
								const maybeClose = (frame?.source)?.close;
								if (typeof maybeClose === "function" && frame !== void 0) maybeClose.call(frame.source);
							} catch {}
						}).catch(() => {});
						decoding.clear();
					});
					canvas?.remove();
					img?.remove();
				};
				ctx.onCleanup(dispose);
				return {
					dispose,
					setState(next) {
						if (disposed) return;
						if (next === void 0) {
							override = void 0;
							const target = trackForPhase(ctx.phase.get());
							if (target !== track) play(target);
							return;
						}
						if (config.tracks[next] === void 0) return;
						override = next;
						if (next !== track) play(next);
					},
					setIdleTrack(next) {
						if (disposed) return;
						if (next === void 0 || config.tracks[next] !== void 0 && config.tracks[next].loop) baseIdle = next ?? config.phases.idle;
						if (override === void 0) {
							const target = trackForPhase(ctx.phase.get());
							if (target !== track) play(target);
						}
					},
					currentTrack() {
						return track;
					}
				};
			}
		};
		//#endregion
		//#region src/client/ui-teardown.ts
		/**
		* Cross-bundle-instance teardown slot for the page-global pet root
		* (issue #785).
		*
		* A client bundle swap (HMR rebuilt frame, plugin update, duplicate
		* injection) runs a new apply body while the previous instance's fiber
		* may still be draining. Module state does not survive the swap, so a
		* closure guard only sees one apply body and the previous instance's
		* container keeps sitting on document.body: the page shows two pets
		* until a full refresh. The slot rides globalThis (which does survive)
		* so a re-apply can find the previous instance and unmount its React
		* root cleanly before mounting its own; the previous fiber's later
		* disposal stays a no-op through the idempotent teardowns.
		*/
		const SLOT = Symbol.for("dsh-pet.client-ui-teardown");
		/**
		* Claim the page-global pet UI slot with the current instance's teardown
		* (React root unmount + container removal + poll stop).
		* @param teardown - what a later instance runs to take the slot over.
		* @returns a disposer that clears the slot when the current instance's
		* UI is torn down (settings toggle, takeover, or fiber disposal).
		*/
		function registerPetUiTeardown(teardown) {
			const slot = globalThis;
			slot[SLOT] = teardown;
			return () => {
				if (slot[SLOT] === teardown) slot[SLOT] = void 0;
			};
		}
		/**
		* Run the previous instance's teardown if one is registered, so the
		* re-applying instance becomes the sole owner of the page-global pet
		* root. No-op when the previous fiber already tore down cleanly.
		*/
		function takeoverPetUiTeardown() {
			const slot = globalThis;
			const teardown = slot[SLOT];
			slot[SLOT] = void 0;
			teardown?.();
		}
		//#endregion
		//#region \0dsh-css:src/client/settings-card.module.css.mjs
		const css$1 = ".KApx_W_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}.KApx_W_card:hover{border-color:var(--dsw-alias-label-dimmed)}.KApx_W_cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}.KApx_W_header{appearance:none;box-sizing:border-box;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}.KApx_W_header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}.KApx_W_headerStatic{box-sizing:border-box;border-radius:12px;align-items:center;gap:12px;width:100%;padding:14px 16px;display:flex}.KApx_W_headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}.KApx_W_name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}.KApx_W_description{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.5}.KApx_W_pending{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}.KApx_W_chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}.KApx_W_chevronOpen{transform:rotate(180deg)}.KApx_W_body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}.KApx_W_readOnly{color:var(--dsw-alias-label-secondary);margin:12px 0 0;font-size:12px;line-height:1.5}.KApx_W_notExposed{color:var(--dsw-alias-state-warn-primary);margin:12px 0 0;font-size:12px;line-height:1.5}.KApx_W_footer{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}.KApx_W_failed{min-width:0;color:var(--dsw-alias-state-error-primary,#b42318);text-overflow:ellipsis;white-space:nowrap;flex:1;margin:0;font-size:12px;line-height:1.5;overflow:hidden}.KApx_W_discard,.KApx_W_save{appearance:none;font:inherit;cursor:pointer;border:1px solid #0000;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}.KApx_W_discard{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}.KApx_W_discard:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}.KApx_W_save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}.KApx_W_discard:disabled,.KApx_W_save:disabled{opacity:.4;cursor:default}.KApx_W_discard:focus-visible,.KApx_W_save:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}.KApx_W_field{flex-direction:column;gap:6px;padding:12px 0;display:flex}.KApx_W_field+.KApx_W_field{border-top:1px solid var(--dsw-alias-border-l2)}.KApx_W_head{align-items:center;gap:8px;display:flex}.KApx_W_label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}.KApx_W_badges{align-items:center;gap:8px;display:inline-flex}.KApx_W_badge{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}.KApx_W_reset{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;padding:0;font-size:12px;line-height:1.5}.KApx_W_reset:hover:not(:disabled){color:var(--dsw-alias-label-primary)}.KApx_W_reset:disabled{cursor:default}.KApx_W_reset:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.KApx_W_input,.KApx_W_select{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5}.KApx_W_input:focus-visible,.KApx_W_select:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}.KApx_W_input:disabled,.KApx_W_select:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}.KApx_W_inputInvalid{border:1px solid var(--dsw-alias-state-error-primary,#b42318);background:var(--dsw-alias-bg-layer-3);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5}.KApx_W_inputInvalid:focus-visible{outline:2px solid var(--dsw-alias-state-error-primary,#b42318);outline-offset:1px;border-color:var(--dsw-alias-state-error-primary,#b42318)}.KApx_W_selectWrap{position:relative}.KApx_W_selectButton{appearance:none;text-align:left;cursor:pointer;justify-content:space-between;align-items:center;gap:8px;width:100%;display:flex}.KApx_W_selectLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.KApx_W_selectChevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}.KApx_W_selectChevronOpen{transform:rotate(180deg)}.KApx_W_selectPopup{z-index:40;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);max-height:240px;box-shadow:0 8px 24px var(--dsw-alias-bg-mask-2);opacity:0;border-radius:8px;flex-direction:column;padding:4px;transition:opacity .1s,transform .1s;display:flex;position:absolute;top:calc(100% + 4px);left:0;right:0;overflow-y:auto;transform:translateY(-4px)}.KApx_W_selectPopupOpen{opacity:1;transform:none}.KApx_W_selectPopupClose{opacity:0;pointer-events:none;transform:translateY(-4px)}.KApx_W_selectOption{color:var(--dsw-alias-label-primary);cursor:pointer;white-space:nowrap;text-overflow:ellipsis;border-radius:6px;flex-shrink:0;padding:6px 10px;font-size:13px;line-height:1.5;overflow:hidden}.KApx_W_selectOption:hover,.KApx_W_selectOptionActive{background:var(--dsw-alias-interactive-bg-hover)}.KApx_W_selectOptionSelected{color:var(--dsw-alias-brand-primary);background:color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 10%, transparent);font-weight:500}.KApx_W_invalid{color:var(--dsw-alias-state-error-primary,#b42318);margin:0;font-size:12px;line-height:1.5}.KApx_W_hint{color:var(--dsw-alias-label-secondary);margin:0;font-size:12px;line-height:1.5}@media (prefers-reduced-motion:reduce){.KApx_W_card,.KApx_W_header,.KApx_W_chevron,.KApx_W_chevronOpen,.KApx_W_discard,.KApx_W_save,.KApx_W_selectChevron,.KApx_W_selectChevronOpen,.KApx_W_selectPopup{transition:none}}";
		const tagId$1 = "@linxin666/dsh-pet/src/client/settings-card.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@linxin666/dsh-pet";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var settings_card_module_css_default = {
			"badge": "KApx_W_badge",
			"badges": "KApx_W_badges",
			"body": "KApx_W_body",
			"card": "KApx_W_card",
			"cardOpen": "KApx_W_cardOpen",
			"chevron": "KApx_W_chevron",
			"chevronOpen": "KApx_W_chevronOpen",
			"description": "KApx_W_description",
			"discard": "KApx_W_discard",
			"failed": "KApx_W_failed",
			"field": "KApx_W_field",
			"footer": "KApx_W_footer",
			"head": "KApx_W_head",
			"headText": "KApx_W_headText",
			"header": "KApx_W_header",
			"headerStatic": "KApx_W_headerStatic",
			"hint": "KApx_W_hint",
			"input": "KApx_W_input",
			"inputInvalid": "KApx_W_inputInvalid",
			"invalid": "KApx_W_invalid",
			"label": "KApx_W_label",
			"name": "KApx_W_name",
			"notExposed": "KApx_W_notExposed",
			"pending": "KApx_W_pending",
			"readOnly": "KApx_W_readOnly",
			"reset": "KApx_W_reset",
			"save": "KApx_W_save",
			"select": "KApx_W_select",
			"selectButton": "KApx_W_selectButton",
			"selectChevron": "KApx_W_selectChevron",
			"selectChevronOpen": "KApx_W_selectChevronOpen",
			"selectLabel": "KApx_W_selectLabel",
			"selectOption": "KApx_W_selectOption",
			"selectOptionActive": "KApx_W_selectOptionActive",
			"selectOptionSelected": "KApx_W_selectOptionSelected",
			"selectPopup": "KApx_W_selectPopup",
			"selectPopupClose": "KApx_W_selectPopupClose",
			"selectPopupOpen": "KApx_W_selectPopupOpen",
			"selectWrap": "KApx_W_selectWrap"
		};
		//#endregion
		//#region src/client/PluginSettingsCard.tsx
		/**
		* Family-shared chrome for plugin settings cards: a disclosure header naming
		* the plugin and what its settings govern, the controls inside, and the save
		* that writes them. Renders nothing while the namespace is unavailable — a
		* deployment that does not compose the owning plugin should show no trace of
		* it. Inlined into each consumer's client bundle; mirrors the official
		* ui-plugin-config PluginCard in a self-contained slice.
		*/
		/**
		* Render one plugin settings card.
		* @param props - the plugin's copy keys, its form state, and its controls.
		* @returns the card, or nothing while the namespace is still loading.
		*/
		function PluginSettingsCard(props) {
			const [open, setOpen] = (0, react.useState)(props.defaultOpen ?? true);
			const { state, alwaysOpen } = props;
			if (!state.available) return null;
			const title = props.t(props.titleKey);
			const description = props.t(props.descriptionKey);
			const blocked = !state.dirty || state.invalid || state.saving;
			const expanded = alwaysOpen === true || open;
			const cardClass = expanded ? `${settings_card_module_css_default.cardOpen} ${settings_card_module_css_default.card}` : settings_card_module_css_default.card;
			const header = alwaysOpen === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: settings_card_module_css_default.headerStatic,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: settings_card_module_css_default.headText,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: settings_card_module_css_default.name,
						title,
						children: title
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: settings_card_module_css_default.description,
						title: description,
						children: props.descriptionNode ?? description
					})]
				}), state.dirty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: settings_card_module_css_default.pending,
					title: props.t("settings.unsaved"),
					children: props.t("settings.unsaved")
				}) : null]
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: settings_card_module_css_default.header,
				"aria-expanded": open,
				"aria-label": `${props.t(open ? "settings.collapse" : "settings.expand")}: ${title}`,
				onClick: () => {
					setOpen(!open);
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: settings_card_module_css_default.headText,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: settings_card_module_css_default.name,
							title,
							children: title
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: settings_card_module_css_default.description,
							title: description,
							children: props.descriptionNode ?? description
						})]
					}),
					state.dirty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: settings_card_module_css_default.pending,
						title: props.t("settings.unsaved"),
						children: props.t("settings.unsaved")
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
						width: "14",
						height: "14",
						viewBox: "0 0 14 14",
						fill: "none",
						xmlns: "http://www.w3.org/2000/svg",
						className: open ? `${settings_card_module_css_default.chevron} ${settings_card_module_css_default.chevronOpen}` : settings_card_module_css_default.chevron,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
							d: "M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z",
							fill: "currentColor"
						})
					})
				]
			});
			if (!state.exposed && props.renderChildrenWhenNotExposed !== true) {
				const showNotice = props.hideNotExposedNotice !== true;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
					className: cardClass,
					children: [header, expanded ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: settings_card_module_css_default.body,
						children: showNotice ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: settings_card_module_css_default.notExposed,
							role: "status",
							children: props.t("settings.notExposed")
						}) : null
					}) : null]
				});
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: cardClass,
				children: [header, expanded ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: settings_card_module_css_default.body,
					children: [
						!state.writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: settings_card_module_css_default.readOnly,
							role: "status",
							children: props.t("settings.readOnly")
						}) : null,
						props.children,
						props.hideFooter === true ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: settings_card_module_css_default.footer,
							children: [
								state.failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
									className: settings_card_module_css_default.failed,
									role: "status",
									children: [props.t("settings.saveFailed"), state.failedReason ? " - " + state.failedReason : ""]
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: settings_card_module_css_default.discard,
									disabled: !state.dirty || state.saving,
									onClick: props.onDiscard,
									children: props.t("settings.discard")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: settings_card_module_css_default.save,
									disabled: blocked,
									onClick: props.onSave,
									children: props.t(!state.saving ? "settings.save" : "settings.saving")
								})
							]
						})
					]
				}) : null]
			});
		}
		/** A staged value field. `numeric` only hints the keypad: which drafts a field accepts is decided by its spec. */
		function ValueField(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: settings_card_module_css_default.field,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: settings_card_module_css_default.head,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							className: settings_card_module_css_default.label,
							htmlFor: props.id,
							children: props.label
						}), props.overridden ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: settings_card_module_css_default.badges,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: settings_card_module_css_default.badge,
								children: props.overriddenLabel
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: settings_card_module_css_default.reset,
								disabled: props.disabled,
								onClick: props.onReset,
								children: props.resetLabel
							})]
						}) : null]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						id: props.id,
						className: props.invalid ? settings_card_module_css_default.inputInvalid : settings_card_module_css_default.input,
						type: "text",
						...props.numeric === true ? { inputMode: "numeric" } : {},
						...props.invalid ? { "aria-invalid": true } : {},
						value: props.text,
						placeholder: props.placeholder ?? "",
						disabled: props.disabled,
						onChange: (event) => {
							props.onEdit(event.target.value);
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: props.invalid ? settings_card_module_css_default.invalid : settings_card_module_css_default.hint,
						children: props.invalid ? props.invalidLabel : props.hint
					})
				]
			});
		}
		const NON_SKIN_BODY_MARKERS = /* @__PURE__ */ new Set(["dshSkinCenter", "dshSidebarCollapsed"]);
		function isSkinActive() {
			return Object.keys(document.body.dataset).some((key) => key.startsWith("dsh") && !NON_SKIN_BODY_MARKERS.has(key));
		}
		const SELECT_CLOSE_MS = 100;
		/**
		* The shared dual-mode select control. While an appearance skin is active it
		* renders the legacy native `<select>` untouched, so element-level skin
		* selectors keep working; under the default appearance it renders a
		* self-drawn `role="listbox"` popup whose open/close is transition-animated.
		* Staged cards reach it through BooleanField/ChoiceField; immediate-apply
		* editors (the side-card prefs) bind it directly through onEdit.
		* 双模式下拉框：皮肤激活时用原生 select，默认外观用自绘动画弹层。
		*/
		function SelectField(props) {
			const { id, options, value } = props;
			const [open, setOpen] = (0, react.useState)(false);
			const [closing, setClosing] = (0, react.useState)(false);
			const [phase, setPhase] = (0, react.useState)("initial");
			const [activeIndex, setActiveIndex] = (0, react.useState)(0);
			const closeTimer = (0, react.useRef)(void 0);
			const wrapRef = (0, react.useRef)(null);
			const popupRef = (0, react.useRef)(null);
			const currentIndex = () => {
				const index = options.findIndex((option) => option.value === value);
				return index >= 0 ? index : 0;
			};
			const close = (0, react.useCallback)(() => {
				if (closeTimer.current !== void 0) clearTimeout(closeTimer.current);
				setClosing(true);
				closeTimer.current = setTimeout(() => {
					setClosing(false);
					setOpen(false);
				}, SELECT_CLOSE_MS);
			}, []);
			const openPopup = () => {
				if (closeTimer.current !== void 0) clearTimeout(closeTimer.current);
				setActiveIndex(currentIndex());
				setPhase("initial");
				setClosing(false);
				setOpen(true);
			};
			const commit = (index) => {
				const option = options[index];
				if (option) props.onEdit(option.value);
				close();
			};
			const onTriggerClick = () => {
				if (props.disabled) return;
				if (open && !closing) close();
				else openPopup();
			};
			const onKeyDown = (event) => {
				if (props.disabled) return;
				const count = options.length;
				switch (event.key) {
					case "ArrowDown":
					case "ArrowUp":
					case "Enter":
					case " ":
						event.preventDefault();
						if (!open) openPopup();
						else if (!closing) {
							if (event.key === "ArrowDown") setActiveIndex((index) => (index + 1) % count);
							else if (event.key === "ArrowUp") setActiveIndex((index) => (index - 1 + count) % count);
							else commit(activeIndex);
						}
						break;
					case "Escape":
						if (open) {
							event.preventDefault();
							event.stopPropagation();
							close();
						}
						break;
					case "Tab": if (open) close();
				}
			};
			(0, react.useEffect)(() => () => {
				if (closeTimer.current !== void 0) clearTimeout(closeTimer.current);
			}, []);
			(0, react.useLayoutEffect)(() => {
				if (open && !closing && phase === "initial") {
					popupRef.current?.offsetHeight;
					setPhase("open");
				}
			}, [
				open,
				closing,
				phase
			]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const onPointerDown = (event) => {
					const target = event.target;
					if (target instanceof Node && !wrapRef.current?.contains(target)) close();
				};
				document.addEventListener("pointerdown", onPointerDown);
				return () => document.removeEventListener("pointerdown", onPointerDown);
			}, [open, close]);
			(0, react.useEffect)(() => {
				if (props.disabled && open) close();
			}, [
				props.disabled,
				open,
				close
			]);
			if (isSkinActive()) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
				id,
				className: settings_card_module_css_default.select,
				value,
				disabled: props.disabled,
				onChange: (event) => {
					props.onEdit(event.target.value);
				},
				children: options.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
					value: option.value,
					children: option.label
				}, option.value))
			});
			const label = options.find((option) => option.value === value)?.label ?? "";
			const popupClass = closing ? `${settings_card_module_css_default.selectPopup} ${settings_card_module_css_default.selectPopupClose}` : phase === "open" ? `${settings_card_module_css_default.selectPopup} ${settings_card_module_css_default.selectPopupOpen}` : settings_card_module_css_default.selectPopup;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: settings_card_module_css_default.selectWrap,
				ref: wrapRef,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					id,
					className: `${settings_card_module_css_default.select} ${settings_card_module_css_default.selectButton}`,
					disabled: props.disabled,
					"aria-haspopup": "listbox",
					"aria-expanded": open,
					"aria-activedescendant": open ? `${id}-o${activeIndex}` : void 0,
					"aria-invalid": props.invalid || void 0,
					onClick: onTriggerClick,
					onKeyDown,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: settings_card_module_css_default.selectLabel,
						children: label
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
						width: "14",
						height: "14",
						viewBox: "0 0 14 14",
						fill: "none",
						xmlns: "http://www.w3.org/2000/svg",
						className: open ? `${settings_card_module_css_default.selectChevron} ${settings_card_module_css_default.selectChevronOpen}` : settings_card_module_css_default.selectChevron,
						"aria-hidden": "true",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
							d: "M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z",
							fill: "currentColor"
						})
					})]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: popupClass,
					role: "listbox",
					ref: popupRef,
					children: options.map((option, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						id: `${id}-o${index}`,
						role: "option",
						"aria-selected": option.value === value,
						className: `${settings_card_module_css_default.selectOption}${option.value === value ? ` ${settings_card_module_css_default.selectOptionSelected}` : ""}${index === activeIndex && !closing ? ` ${settings_card_module_css_default.selectOptionActive}` : ""}`,
						onClick: () => {
							commit(index);
						},
						children: option.label
					}, option.value))
				}) : null]
			});
		}
		/** A staged boolean field: 继承 / 开 / 关. */
		function BooleanField(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: settings_card_module_css_default.field,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: settings_card_module_css_default.head,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							className: settings_card_module_css_default.label,
							htmlFor: props.id,
							children: props.label
						}), props.overridden ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: settings_card_module_css_default.badges,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: settings_card_module_css_default.badge,
								children: props.overriddenLabel
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: settings_card_module_css_default.reset,
								disabled: props.disabled,
								onClick: props.onReset,
								children: props.resetLabel
							})]
						}) : null]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectField, {
						id: props.id,
						options: [
							{
								value: "",
								label: props.inheritLabel
							},
							{
								value: "true",
								label: props.onLabel
							},
							{
								value: "false",
								label: props.offLabel
							}
						],
						value: props.text,
						disabled: props.disabled,
						invalid: props.invalid,
						onEdit: props.onEdit
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: settings_card_module_css_default.hint,
						children: props.hint
					})
				]
			});
		}
		/** A staged enumerated field rendered as a select. */
		function ChoiceField(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: settings_card_module_css_default.field,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: settings_card_module_css_default.head,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							className: settings_card_module_css_default.label,
							htmlFor: props.id,
							children: props.label
						}), props.overridden ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: settings_card_module_css_default.badges,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: settings_card_module_css_default.badge,
								children: props.overriddenLabel
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: settings_card_module_css_default.reset,
								disabled: props.disabled,
								onClick: props.onReset,
								children: props.resetLabel
							})]
						}) : null]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectField, {
						id: props.id,
						options: [{
							value: "",
							label: props.inheritLabel
						}, ...props.choices],
						value: props.text,
						disabled: props.disabled,
						invalid: props.invalid,
						onEdit: props.onEdit
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: props.invalid ? settings_card_module_css_default.invalid : settings_card_module_css_default.hint,
						children: props.invalid ? props.invalidLabel : props.hint
					})
				]
			});
		}
		//#endregion
		//#region src/client/settings-form.ts
		/** A whole- or decimal-number field. An empty draft clears the field; any other draft that is not a finite number within the constraints blocks the save. */
		function numberField(field, constraints = {}) {
			const { integer = false, min } = constraints;
			return {
				field,
				format: (value) => typeof value === "number" ? String(value) : "",
				parse: (text) => {
					const trimmed = text.trim();
					if (trimmed === "") return { kind: "clear" };
					const parsed = Number(trimmed);
					if (!Number.isFinite(parsed)) return void 0;
					if (integer && !Number.isInteger(parsed)) return void 0;
					if (min !== void 0 && parsed < min) return void 0;
					return {
						kind: "set",
						value: parsed
					};
				}
			};
		}
		/** A boolean field, edited through true/false draft text. */
		function booleanField(field) {
			return {
				field,
				format: (value) => typeof value === "boolean" ? String(value) : "",
				parse: (text) => {
					const trimmed = text.trim();
					if (trimmed === "") return { kind: "clear" };
					if (trimmed === "true") return {
						kind: "set",
						value: true
					};
					if (trimmed === "false") return {
						kind: "set",
						value: false
					};
				}
			};
		}
		/** An enumerated string field; only the listed choices are accepted. An empty draft clears the field. */
		function choiceField(field, choices) {
			return {
				field,
				format: (value) => typeof value === "string" && choices.includes(value) ? value : "",
				parse: (text) => {
					if (text === "") return { kind: "clear" };
					return choices.includes(text) ? {
						kind: "set",
						value: text
					} : void 0;
				}
			};
		}
		/**
		* Stages one card's edits over one settings namespace and writes them on save.
		*
		* The Host is the only authority on whether a value was accepted — its
		* validators own the constraints no schema can express — so the outcome is
		* read back from the section rather than predicted here. A save that did not
		* land keeps its drafts, so the user can correct them instead of retyping.
		*/
		var CardForm = class {
			scope;
			specs;
			staged = /* @__PURE__ */ new Map();
			listeners = /* @__PURE__ */ new Set();
			/** The form subscription installed in the constructor; released by dispose(). */
			disposeForm;
			disposed = false;
			saving = false;
			failed = false;
			failedReason;
			/** @param scope - the bound configuration form for this card's namespace. */
			constructor(scope, specs) {
				this.scope = scope;
				this.specs = new Map(specs.map((spec) => [spec.field, spec]));
				this.disposeForm = scope.subscribe(() => {
					this.publish();
				});
			}
			/**
			* Release the form subscription and every bound store listener. The card
			* must call this on teardown; later calls are no-ops.
			*/
			dispose() {
				if (this.disposed) return;
				this.disposed = true;
				this.disposeForm();
				this.listeners.clear();
			}
			/** Publish a projection of this form, rebuilt whenever the form or a draft changes. */
			bind(project) {
				const store = createSnapshotStore(project());
				this.listeners.add(() => {
					store.set(project());
				});
				return store;
			}
			/** Read the card-level state: what the Host serves, and what a save would do. */
			shell() {
				const snapshot = this.scope.getSnapshot();
				const plan = this.plan();
				return {
					available: snapshot.status !== "loading",
					exposed: snapshot.status === "ready",
					writable: snapshot.writable,
					dirty: plan.length > 0,
					invalid: plan.some((item) => item.judge === void 0),
					saving: this.saving,
					failed: this.failed,
					...this.failedReason === void 0 ? {} : { failedReason: this.failedReason }
				};
			}
			/** Read one field's state from the effective section and its staged draft. */
			field(field) {
				const spec = this.specOf(field);
				const staged = this.staged.get(field);
				if (staged === void 0) return {
					text: spec.format(this.sectionValue(field)),
					overridden: this.stored(field),
					invalid: false
				};
				const write = staged.clear ? { kind: "clear" } : spec.parse(staged.text);
				return {
					text: staged.text,
					overridden: write?.kind === "set",
					invalid: write === void 0
				};
			}
			/** The actions the card's slot registration injects. */
			actions() {
				return {
					edit: (field, text) => {
						this.stage(field, {
							text,
							clear: false
						});
					},
					resetField: (field) => {
						this.stage(field, {
							text: this.specOf(field).format(this.baseValue(field)),
							clear: true
						});
					},
					save: () => {
						this.save();
					},
					discard: () => {
						if (this.staged.size === 0 && !this.failed) return;
						this.staged.clear();
						this.failed = false;
						this.failedReason = void 0;
						this.publish();
					}
				};
			}
			/**
			* Write every staged edit in one atomic form mutation, then re-seed from
			* what the Host accepted.
			*
			* The whole batch rides one mutate, so cross-field validate hooks
			* (baseURL+model) judge it as a unit: the Host either applies every write
			* or refuses the batch. The form contract answers a refusal or a skipped
			* write with `false` (it recovers with a fresh Host view instead of
			* throwing), so the outcome is judged twice: the answer itself, and then the
			* settled snapshot read back one planned write at a time. One missed write
			* fails the whole save. A transport that rejects instead (the dsh-web bridge
			* controller on a dead connection) reports through the same failure path
			* with its rejection message. A save that did not land keeps its drafts, so
			* the user can correct them instead of retyping.
			* @returns settlement after the mutation and the read-back.
			*/
			async save() {
				const plan = this.plan();
				const valid = plan.filter((item) => item.judge !== void 0);
				if (plan.length === 0 || this.saving || valid.length !== plan.length) return;
				const pending = /* @__PURE__ */ new Map();
				for (const item of plan) pending.set(item.field, this.staged.get(item.field));
				this.saving = true;
				this.failed = false;
				this.failedReason = void 0;
				this.publish();
				const ops = valid.map((item) => item.op.op === "set" ? {
					op: "set",
					path: [item.field],
					value: item.op.value
				} : {
					op: "unset",
					path: [item.field]
				});
				let failedReason;
				let accepted = false;
				try {
					accepted = await this.scope.mutate(ops);
				} catch (error) {
					failedReason = error instanceof Error ? error.message : String(error);
				}
				const landed = accepted && failedReason === void 0 && valid.every((item) => item.judge());
				for (const [field, before] of pending) if (landed && this.staged.get(field) === before) this.staged.delete(field);
				this.saving = false;
				this.failed = !landed;
				this.failedReason = failedReason;
				this.publish();
			}
			/**
			* Every staged edit a save would write. An entry whose draft is not a value
			* its field accepts carries no write: the form is still dirty, and the save
			* refuses rather than dropping the edit. A staged edit that matches the
			* effective section is not a write at all.
			* @returns the planned writes, in the order the fields were staged.
			*/
			plan() {
				const plan = [];
				for (const [field, staged] of this.staged) {
					const spec = this.specOf(field);
					if (staged.clear) {
						if (this.stored(field)) plan.push({
							field,
							op: {
								field,
								op: "unset"
							},
							judge: () => this.landedUnset(field)
						});
						continue;
					}
					if (staged.text === spec.format(this.sectionValue(field))) continue;
					const write = spec.parse(staged.text);
					if (write === void 0) plan.push({
						field,
						op: {
							field,
							op: "unset"
						},
						judge: void 0
					});
					else if (write.kind === "clear") plan.push({
						field,
						op: {
							field,
							op: "unset"
						},
						judge: () => this.landedUnset(field)
					});
					else plan.push({
						field,
						op: {
							field,
							op: "set",
							value: write.value
						},
						judge: () => this.landedSet(field, write.value)
					});
				}
				return plan;
			}
			/**
			* Read-back judgment for a planned set: the user layer must hold the
			* intended value once the mutation has settled.
			*/
			landedSet(field, value) {
				if (this.specOf(field).secret) return true;
				return this.userLayer()?.[field] === value;
			}
			/**
			* Read-back judgment for a planned unset: the field must be gone from the
			* user layer once the mutation has settled.
			*/
			landedUnset(field) {
				return !this.stored(field);
			}
			stage(field, edit) {
				this.staged.set(field, edit);
				this.failed = false;
				this.failedReason = void 0;
				this.publish();
			}
			specOf(field) {
				const spec = this.specs.get(field);
				if (spec === void 0) throw new Error(`settings card has no field ${field}`);
				return spec;
			}
			snapshotOf() {
				return this.scope.getSnapshot();
			}
			sectionValue(field) {
				return this.snapshotOf().value?.[field];
			}
			baseValue(field) {
				return this.snapshotOf().base?.[field];
			}
			userLayer() {
				return this.snapshotOf().user;
			}
			stored(field) {
				const user = this.userLayer();
				return user !== void 0 && Object.hasOwn(user, field);
			}
			publish() {
				for (const listener of this.listeners) listener();
			}
		};
		//#endregion
		//#region \0dsh-css:src/client/settings-section.module.css.mjs
		const css = ".c5M8OW_sectionList{margin:0;padding:0;list-style:none}";
		const tagId = "@linxin666/dsh-pet/src/client/settings-section.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@linxin666/dsh-pet";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var settings_section_module_css_default = { "sectionList": "c5M8OW_sectionList" };
		//#endregion
		//#region src/client/PetSettingsCard.tsx
		/**
		* The bubble modes this card can write, in render order. Mirrors the host
		* schema's union (see PetStatusBubbleMode); the browser half never imports the
		* host module for a value, so the accepted set is spelled here as literals.
		*/
		const STATUS_BUBBLE_CHOICES = ["auto", "off"];
		/** Fetch the registry list (the same data the sprite renders from). */
		async function fetchPetChoices() {
			const response = await fetch("/api/pet/pets");
			if (!response.ok) throw new Error("pet pets failed: " + response.status);
			return await response.json();
		}
		/** Read the selection and visibility from the same persisted state the pet renders. */
		async function fetchPetState() {
			const response = await fetch("/api/pet/state");
			if (!response.ok) throw new Error("pet state failed: " + response.status);
			const body = await response.json();
			if (typeof body.pet?.id !== "string") throw new Error("pet state has no selected pet");
			return {
				petId: body.pet.id,
				visible: body.display?.visible !== false
			};
		}
		/** Bridges the 'pet' scope onto the card's staged form. */
		var PetSettingsCardController = class {
			form;
			store;
			petChoices = [];
			petLabels = /* @__PURE__ */ new Map();
			selectedPetId;
			selectedVisible;
			stagedPetId;
			stagedVisible;
			savingPet = false;
			petSaveFailed = false;
			loaded = false;
			attempts = 0;
			disposed = false;
			/** Pending deferred-load or retry timer; cancelled by dispose(). */
			pendingTimer;
			/** @param scope - the bound configuration form for the 'pet' entry. */
			constructor(scope) {
				this.form = new CardForm(scope, [
					booleanField("enabled"),
					booleanField("decorationEnabled"),
					choiceField("statusBubbles", STATUS_BUBBLE_CHOICES),
					booleanField("visible"),
					numberField("size"),
					numberField("right"),
					numberField("bottom"),
					numberField("bubbleScale"),
					choiceField("petId", this.petChoices)
				]);
				this.store = this.form.bind(() => this.projection());
				this.pendingTimer = window.setTimeout(() => {
					this.pendingTimer = void 0;
					if (this.disposed) return;
					this.loadPets();
					this.loadPetState();
				}, 0);
			}
			/** Resolve the registry choices once (retried a few times on failure). */
			async loadPets() {
				if (this.loaded || this.disposed) return;
				try {
					const list = await fetchPetChoices();
					if (this.disposed) return;
					this.petChoices.splice(0, this.petChoices.length, ...list.map((choice) => choice.id));
					for (const choice of list) this.petLabels.set(choice.id, choice.displayName);
					this.loaded = true;
					this.store.set(this.projection());
				} catch {
					if (this.disposed) return;
					this.attempts += 1;
					if (this.attempts < 3) this.pendingTimer = window.setTimeout(() => {
						this.pendingTimer = void 0;
						if (this.disposed) return;
						this.loadPets();
					}, 3e3);
				}
			}
			async loadPetState() {
				try {
					const state = await fetchPetState();
					if (this.disposed) return;
					this.selectedPetId = state.petId;
					this.selectedVisible = state.visible;
					this.store.set(this.projection());
				} catch {}
			}
			fallback() {
				const shell = this.form.shell();
				return shell.available && !shell.exposed && this.selectedPetId !== void 0;
			}
			/**
			* The visibility the fallback switch renders: the staged draft when the user
			* moved it, the persisted value otherwise. There is no user layer to override
			* here, so the field is never marked overridden.
			*/
			fallbackVisible() {
				const value = this.stagedVisible ?? this.selectedVisible;
				return {
					text: value === void 0 ? "" : String(value),
					overridden: false,
					invalid: false
				};
			}
			/**
			* Persist the staged selection and visibility through the pet API — the only
			* writer available when the aggregate shell serves this card, since there is
			* no Host settings form to mutate — then confirm the read-back before the
			* drafts are cleared.
			*/
			async saveFallback() {
				const petId = this.stagedPetId;
				const visible = this.stagedVisible;
				if (this.savingPet) return;
				if (petId === void 0 && visible === void 0) return;
				if (petId !== void 0 && !this.petChoices.includes(petId)) return;
				this.savingPet = true;
				this.petSaveFailed = false;
				this.store.set(this.projection());
				try {
					if (petId !== void 0) {
						const response = await fetch("/api/pet/set-pet", {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ petId })
						});
						const result = await response.json();
						if (!response.ok || result.ok !== true || result.petId !== petId) throw new Error("pet selection was not persisted");
					}
					if (visible !== void 0) {
						if (!(await fetch("/api/pet/set-visible", {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ visible })
						})).ok) throw new Error("pet visibility was not persisted");
					}
					const persisted = await fetchPetState();
					if (petId !== void 0 && persisted.petId !== petId) throw new Error("pet selection was not persisted");
					if (visible !== void 0 && persisted.visible !== visible) throw new Error("pet visibility was not persisted");
					this.selectedPetId = persisted.petId;
					this.selectedVisible = persisted.visible;
					if (this.stagedPetId === petId) this.stagedPetId = void 0;
					if (this.stagedVisible === visible) this.stagedVisible = void 0;
				} catch {
					this.petSaveFailed = true;
				} finally {
					this.savingPet = false;
					if (!this.disposed) this.store.set(this.projection());
				}
			}
			projection() {
				const fallback = this.fallback();
				const shell = this.form.shell();
				const configuredPet = this.form.field("petId");
				return {
					...shell,
					...fallback ? {
						exposed: true,
						writable: true,
						dirty: this.stagedPetId !== void 0 && this.stagedPetId !== this.selectedPetId || this.stagedVisible !== void 0 && this.stagedVisible !== this.selectedVisible,
						invalid: this.stagedPetId !== void 0 && !this.petChoices.includes(this.stagedPetId),
						saving: this.savingPet,
						failed: this.petSaveFailed,
						failedReason: void 0
					} : {},
					petSelectionFallback: fallback,
					enabled: this.form.field("enabled"),
					decorationEnabled: this.form.field("decorationEnabled"),
					statusBubbles: this.form.field("statusBubbles"),
					visible: fallback ? this.fallbackVisible() : this.form.field("visible"),
					size: this.form.field("size"),
					right: this.form.field("right"),
					bottom: this.form.field("bottom"),
					bubbleScale: this.form.field("bubbleScale"),
					petId: fallback ? {
						text: this.stagedPetId ?? this.selectedPetId ?? "",
						overridden: false,
						invalid: this.stagedPetId !== void 0 && !this.petChoices.includes(this.stagedPetId)
					} : configuredPet.text === "" && this.selectedPetId !== void 0 ? {
						...configuredPet,
						text: this.selectedPetId
					} : configuredPet,
					petChoices: this.petChoices.map((id) => ({
						value: id,
						label: this.petLabels.get(id) ?? id
					}))
				};
			}
			/**
			* Build the face the card's slot registration injects.
			* @returns the card's snapshot and its form actions.
			*/
			inject() {
				const actions = this.form.actions();
				return {
					hooks: { petSettingsCard: this.store },
					edit: (field, value) => {
						if (!this.fallback()) return actions.edit(field, value);
						if (field === "petId") this.stagedPetId = value === "" ? void 0 : value;
						else if (field === "visible") this.stagedVisible = value === "" ? void 0 : value === "true";
						else return;
						this.petSaveFailed = false;
						this.store.set(this.projection());
					},
					resetField: (field) => {
						if (!this.fallback()) return actions.resetField(field);
						if (field === "petId") this.stagedPetId = void 0;
						else if (field === "visible") this.stagedVisible = void 0;
						else return;
						this.petSaveFailed = false;
						this.store.set(this.projection());
					},
					save: () => {
						if (this.fallback()) this.saveFallback();
						else actions.save();
					},
					discard: () => {
						if (!this.fallback()) return actions.discard();
						this.stagedPetId = void 0;
						this.stagedVisible = void 0;
						this.petSaveFailed = false;
						this.store.set(this.projection());
					}
				};
			}
			/**
			* Release the card's scope subscription, bound stores and pending load
			* timers; the slot disposer calls this on teardown.
			*/
			dispose() {
				if (this.disposed) return;
				this.disposed = true;
				if (this.pendingTimer !== void 0) {
					window.clearTimeout(this.pendingTimer);
					this.pendingTimer = void 0;
				}
				this.form.dispose();
			}
		};
		/**
		* Render the pet settings card.
		* @param props - locale copy, the card snapshot, and its form actions.
		* @returns the card.
		*/
		function PetSettingsCard(props) {
			const { t } = props;
			const state = props.usePetSettingsCard((snapshot) => snapshot);
			const disabled = !state.writable;
			const fieldProps = {
				overriddenLabel: t("settings.overridden"),
				resetLabel: t("settings.reset"),
				invalidLabel: t("settings.invalidNumber"),
				disabled
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(PluginSettingsCard, {
				t,
				titleKey: "settings.title",
				descriptionKey: "settings.description",
				descriptionNode: state.petSelectionFallback ? t("settings.petHint") : void 0,
				state,
				onSave: props.save,
				onDiscard: props.discard,
				alwaysOpen: true,
				children: [
					state.petSelectionFallback ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BooleanField, {
						id: "settings-pet-enabled",
						label: t("settings.enabled"),
						hint: t("settings.enabledHint"),
						inheritLabel: t("settings.inherit"),
						onLabel: t("settings.on"),
						offLabel: t("settings.off"),
						...fieldProps,
						...state.enabled,
						onEdit: (text) => {
							props.edit("enabled", text);
						},
						onReset: () => {
							props.resetField("enabled");
						}
					}),
					state.petSelectionFallback ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BooleanField, {
						id: "settings-pet-decoration",
						label: t("settings.decoration"),
						hint: t("settings.decorationHint"),
						inheritLabel: t("settings.inherit"),
						onLabel: t("settings.on"),
						offLabel: t("settings.off"),
						...fieldProps,
						...state.decorationEnabled,
						onEdit: (text) => {
							props.edit("decorationEnabled", text);
						},
						onReset: () => {
							props.resetField("decorationEnabled");
						}
					}),
					state.petSelectionFallback ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChoiceField, {
						id: "settings-pet-status-bubbles",
						label: t("settings.statusBubbles"),
						hint: t("settings.statusBubblesHint"),
						inheritLabel: t("settings.inherit"),
						...fieldProps,
						...state.statusBubbles,
						choices: [{
							value: STATUS_BUBBLE_CHOICES[0],
							label: t("settings.on")
						}, {
							value: STATUS_BUBBLE_CHOICES[1],
							label: t("settings.off")
						}],
						onEdit: (text) => {
							props.edit("statusBubbles", text);
						},
						onReset: () => {
							props.resetField("statusBubbles");
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChoiceField, {
						id: "settings-pet-pet",
						label: t("settings.pet"),
						hint: t("settings.petHint"),
						inheritLabel: t("settings.inherit"),
						...fieldProps,
						...state.petId,
						choices: state.petChoices,
						onEdit: (text) => {
							props.edit("petId", text);
						},
						onReset: () => {
							props.resetField("petId");
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(BooleanField, {
						id: "settings-pet-visible",
						label: t("settings.visible"),
						hint: t("settings.visibleHint"),
						inheritLabel: t("settings.inherit"),
						onLabel: t("settings.on"),
						offLabel: t("settings.off"),
						...fieldProps,
						...state.visible,
						onEdit: (text) => {
							props.edit("visible", text);
						},
						onReset: () => {
							props.resetField("visible");
						}
					}),
					state.petSelectionFallback ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ValueField, {
						id: "settings-pet-size",
						label: t("settings.size"),
						hint: t("settings.sizeHint"),
						numeric: true,
						...fieldProps,
						...state.size,
						onEdit: (text) => {
							props.edit("size", text);
						},
						onReset: () => {
							props.resetField("size");
						}
					}),
					state.petSelectionFallback ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ValueField, {
						id: "settings-pet-right",
						label: t("settings.right"),
						hint: t("settings.rightHint"),
						numeric: true,
						...fieldProps,
						...state.right,
						onEdit: (text) => {
							props.edit("right", text);
						},
						onReset: () => {
							props.resetField("right");
						}
					}),
					state.petSelectionFallback ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ValueField, {
						id: "settings-pet-bottom",
						label: t("settings.bottom"),
						hint: t("settings.bottomHint"),
						numeric: true,
						...fieldProps,
						...state.bottom,
						onEdit: (text) => {
							props.edit("bottom", text);
						},
						onReset: () => {
							props.resetField("bottom");
						}
					}),
					state.petSelectionFallback ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ValueField, {
						id: "settings-pet-bubble-scale",
						label: t("settings.bubbleScale"),
						hint: t("settings.bubbleScaleHint"),
						numeric: true,
						...fieldProps,
						...state.bubbleScale,
						onEdit: (text) => {
							props.edit("bubbleScale", text);
						},
						onReset: () => {
							props.resetField("bubbleScale");
						}
					})
				]
			});
		}
		/** Render the pet settings card as a first-level settings page. */
		function PetSettingsSection(props) {
			const { t, usePetSettingsCard, save, discard, edit, resetField } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
				className: settings_section_module_css_default.sectionList,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PetSettingsCard, {
					t,
					usePetSettingsCard,
					save,
					discard,
					edit,
					resetField
				})
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/** Chinese copy. */
		const zh = {
			"pet.feed": "喂食",
			"pet.hide": "隐藏",
			"pet.rename": "改名",
			"pet.confirm": "确定",
			"pet.namePlaceholder": "输入新名字",
			"pet.summon": "召唤{name}",
			"pet.rank": "亲密度 {rank}",
			"pet.rank.name.幼鲸": "幼鲸",
			"pet.rank.name.伙伴": "伙伴",
			"pet.rank.name.挚友": "挚友",
			"pet.rank.name.深海羁绊": "深海羁绊",
			"pet.rank.name.心有灵犀": "心有灵犀",
			"pet.rank.name.传说羁绊": "传说羁绊",
			"pet.rank.name.神话羁绊": "神话羁绊",
			"pet.rank.name.永恒之契": "永恒之契",
			"pet.rank.name.鲸生共渡": "鲸生共渡",
			"pet.points": "{points} 点",
			"pet.treats": "小鱼干 ×{n}",
			"pet.state.loading": "宠物正在赶来…",
			"pet.state.error": "宠物迷路了（连接失败）",
			"pet.renderer.unavailable": "这只宠物需要的渲染器（{renderer}）在当前版本不可用。",
			"pet.live2d.core-missing": "Live2D 核心未安装：请把官方 live2dcubismcore.min.js 放入 $DSH_HOME/pets/.runtime/ 后刷新（步骤见宠物插件 README）。",
			"pet.live2d.vendor-missing": "Live2D 组件缺失，请升级宠物插件。",
			"pet.live2d.load-failed": "Live2D 模型加载失败，请检查该宠物目录的完整性。",
			"pet.openSessionHint": "点击跳转到对应会话",
			"pet.gameplay.menu": "玩法",
			"pet.gameplay.work": "打工",
			"pet.gameplay.stopWork": "收工",
			"pet.gameplay.sleep": "休息",
			"pet.gameplay.wake": "起床",
			"pet.gameplay.shop": "商店",
			"pet.gameplay.skin": "皮肤",
			"pet.gameplay.skinDefault": "默认",
			"pet.gameplay.back": "返回",
			"pet.gameplay.buy": "购买",
			"pet.gameplay.insufficient": "{currency}不足",
			"pet.gameplay.prize": "中奖 +{amount} {currency}",
			"pet.gameplay.working": "打工中",
			"pet.gameplay.sleeping": "睡觉中",
			"pet.gameplay.stat.hunger": "饱食",
			"pet.gameplay.stat.mood": "心情",
			"pet.gameplay.stat.energy": "精力",
			"pet.gameplay.stat.affection": "好感",
			"pet.gameplay.currency.treats": "小鱼干",
			"pet.moreSessions": "展开其余 {n} 个会话的气泡",
			"pet.collapseSessions": "收起会话气泡",
			"settings.title": "宠物",
			"settings.description": "选择宠物并调整它的显示布局。",
			"settings.pet": "宠物",
			"settings.petHint": "选择显示哪只宠物；每只宠物独立命名，可在宠物悬浮面板改名。",
			"settings.enabled": "启用宠物",
			"settings.enabledHint": "关闭后隐藏宠物并停止轮询，可在设置里重新启用。",
			"settings.decoration": "状态装饰",
			"settings.decorationHint": "在宠物状态气泡里显示喷水鲸鱼等状态装饰；关闭后气泡只剩文字。",
			"settings.statusBubbles": "状态气泡",
			"settings.statusBubblesHint": "宠物自带的会话／状态气泡（正在思考、正在使用 xxx）。关掉后只剩第三方插件通过公告契约推送的气泡与互动反馈气泡；默认开启。",
			"settings.visible": "显示宠物",
			"settings.visibleHint": "关闭后宠物隐藏，可从聊天输入区重新召唤。",
			"settings.size": "大小（px）",
			"settings.sizeHint": "精灵单元高度，范围 32–1024。",
			"settings.bubbleScale": "气泡字号倍率",
			"settings.bubbleScaleHint": "状态、碎碎念与用量气泡的字号会随宠物大小自动缩放；这一项是在此基础上再乘一个倍率（0.5–2，默认 1）。字号本身不小于 10px、不大于 24px。",
			"settings.right": "距右侧（px）",
			"settings.rightHint": "距视口右边缘的水平内缩距离。",
			"settings.bottom": "距底部（px）",
			"settings.bottomHint": "距视口底边的垂直内缩距离。",
			"settings.inherit": "继承",
			"settings.on": "开",
			"settings.off": "关",
			"settings.overridden": "已覆盖",
			"settings.reset": "恢复默认",
			"settings.notExposed": "当前 DSH 版本未向设置页暴露本插件的配置命名空间，表单不可用。可编辑 $DSH_HOME/settings.yaml 直接配置，或确认提供该命名空间的插件已挂载其设置域并重启。",
			"settings.readOnly": "当前部署的设置只读。",
			"settings.expand": "展开设置",
			"settings.collapse": "收起设置",
			"settings.save": "保存",
			"settings.saving": "保存中…",
			"settings.discard": "放弃",
			"settings.unsaved": "未保存",
			"settings.saveFailed": "部署未接受这些值，已保留供你修改。",
			"settings.invalidNumber": "请输入数字，留空则使用默认值。"
		};
		/** English copy. */
		const en = {
			"pet.feed": "Feed",
			"pet.hide": "Hide",
			"pet.rename": "Rename",
			"pet.confirm": "OK",
			"pet.namePlaceholder": "Enter a new name",
			"pet.summon": "Summon {name}",
			"pet.rank": "Affinity {rank}",
			"pet.rank.name.幼鲸": "Baby Whale",
			"pet.rank.name.伙伴": "Companion",
			"pet.rank.name.挚友": "Close Friend",
			"pet.rank.name.深海羁绊": "Deep Sea Bond",
			"pet.rank.name.心有灵犀": "Kindred Spirit",
			"pet.rank.name.传说羁绊": "Legendary Bond",
			"pet.rank.name.神话羁绊": "Mythic Bond",
			"pet.rank.name.永恒之契": "Eternal Covenant",
			"pet.rank.name.鲸生共渡": "Lifelong Companion",
			"pet.points": "{points} pts",
			"pet.treats": "Treats ×{n}",
			"pet.state.loading": "The pet is on its way…",
			"pet.state.error": "The pet is lost (connection failed)",
			"pet.renderer.unavailable": "This pet needs a renderer ({renderer}) that is not available in this build.",
			"pet.live2d.core-missing": "Live2D Cubism Core is not installed: place the official live2dcubismcore.min.js under $DSH_HOME/pets/.runtime/ and refresh (see the pet plugin README).",
			"pet.live2d.vendor-missing": "The Live2D component is missing; please update the pet plugin.",
			"pet.live2d.load-failed": "The Live2D model failed to load; check the pet directory is complete.",
			"pet.openSessionHint": "Click to jump to this session",
			"pet.gameplay.menu": "Play",
			"pet.gameplay.work": "Work",
			"pet.gameplay.stopWork": "Stop work",
			"pet.gameplay.sleep": "Sleep",
			"pet.gameplay.wake": "Wake up",
			"pet.gameplay.shop": "Shop",
			"pet.gameplay.skin": "Skin",
			"pet.gameplay.skinDefault": "Default",
			"pet.gameplay.back": "Back",
			"pet.gameplay.buy": "Buy",
			"pet.gameplay.insufficient": "Not enough {currency}",
			"pet.gameplay.prize": "Prize +{amount} {currency}",
			"pet.gameplay.working": "Working",
			"pet.gameplay.sleeping": "Sleeping",
			"pet.gameplay.stat.hunger": "Hunger",
			"pet.gameplay.stat.mood": "Mood",
			"pet.gameplay.stat.energy": "Energy",
			"pet.gameplay.stat.affection": "Affection",
			"pet.gameplay.currency.treats": "Treats",
			"pet.moreSessions": "Expand {n} more session bubbles",
			"pet.collapseSessions": "Collapse session bubbles",
			"settings.title": "Pet",
			"settings.description": "Pick a pet and tune its display layout.",
			"settings.pet": "Pet",
			"settings.petHint": "Choose which pet shows. Names are stored per pet; rename from the pet hover panel.",
			"settings.enabled": "Enable the pet",
			"settings.enabledHint": "When off, the pet hides and polling stops; re-enable it here.",
			"settings.decoration": "Status decoration",
			"settings.decorationHint": "Show ornaments like the spouting whale inside the pet status bubbles; when off, bubbles stay text-only.",
			"settings.statusBubbles": "Status bubbles",
			"settings.statusBubblesHint": "The pet's own session/status bubbles (thinking, using ...). Turning them off leaves only bubbles a third-party plugin pushes through the announcement contract, plus the interaction feedback bubble; on by default.",
			"settings.visible": "Show the pet",
			"settings.visibleHint": "When off, the pet hides; summon it again from the input row.",
			"settings.size": "Size (px)",
			"settings.sizeHint": "Sprite cell height, 32–1024.",
			"settings.bubbleScale": "Bubble text multiplier",
			"settings.bubbleScaleHint": "Status, whisper, and usage bubbles scale with the pet automatically; this multiplies that result (0.5–2, default 1). The rendered text stays between 10px and 24px.",
			"settings.right": "Right inset (px)",
			"settings.rightHint": "Horizontal inset from the viewport right edge.",
			"settings.bottom": "Bottom inset (px)",
			"settings.bottomHint": "Vertical inset from the viewport bottom edge.",
			"settings.inherit": "Inherit",
			"settings.on": "On",
			"settings.off": "Off",
			"settings.overridden": "Overridden",
			"settings.reset": "Reset to default",
			"settings.notExposed": "This DSH version does not expose this plugin's settings namespace to the configuration page, so the form is unavailable. Edit $DSH_HOME/settings.yaml directly, or confirm that the plugin owning the namespace is mounted with its settings domain and restart.",
			"settings.readOnly": "This deployment stores settings read-only.",
			"settings.expand": "Show settings",
			"settings.collapse": "Hide settings",
			"settings.save": "Save",
			"settings.saving": "Saving…",
			"settings.discard": "Discard",
			"settings.unsaved": "Unsaved",
			"settings.saveFailed": "The deployment did not accept these values; they were left for you to correct.",
			"settings.invalidNumber": "Enter a number, or leave blank to use the default."
		};
		//#endregion
		//#region src/client/main-session.ts
		/**
		* Resolve the Session the main view currently shows.
		*
		* Reads the catalog's rows rather than a per-id retain-info source: ownership
		* counts ride the list snapshot, so this neither allocates observers nor opens
		* history, and a subscription to the list still fires when the selection moves.
		* @param byId - the session catalog's rows (`SessionListState.byId`), when available.
		* @returns the main-view session id, or undefined when the main view shows none.
		*/
		function mainViewSessionId(byId) {
			if (byId === void 0 || byId === null) return void 0;
			for (const row of Object.values(byId)) if (row !== void 0 && (row.retainedBy?.mainView ?? 0) > 0) return row.id;
		}
		//#endregion
		//#region src/client/telemetry.ts
		const VISITOR_KEY = "dsh-web-ui-telemetry-visitor";
		const DAY_KEY_PREFIX = "dsh-web-ui-telemetry-day:";
		const ENDPOINT = "https://dsh-market.com/api/telemetry/event";
		/** The building package's version, when the bundle carries it. */
		function bakedVersion() {
			try {
				return "0.4.6";
			} catch {
				return;
			}
		}
		/** Read or lazily create the anonymous visitor id; null when storage is unavailable. */
		function visitorId() {
			try {
				const existing = localStorage.getItem(VISITOR_KEY);
				if (existing && /^[A-Za-z0-9_-]{16,64}$/.test(existing)) return existing;
				const fresh = crypto.randomUUID().replaceAll("-", "");
				localStorage.setItem(VISITOR_KEY, fresh);
				return fresh;
			} catch {
				return null;
			}
		}
		/** Drop stale per-day dedup keys so localStorage does not grow forever. */
		function pruneDayKeys(today) {
			try {
				for (let index = localStorage.length - 1; index >= 0; index -= 1) {
					const key = localStorage.key(index);
					if (key !== null && key.startsWith(DAY_KEY_PREFIX) && key !== DAY_KEY_PREFIX + today) localStorage.removeItem(key);
				}
			} catch {}
		}
		/**
		* Fire the daily heartbeat for the given items at most once per UTC day per
		* browser. Never throws and never blocks the caller. Items without an explicit
		* version inherit the bundle's baked build version.
		*/
		function reportDailyHeartbeat(items) {
			try {
				if (items.length === 0) return;
				const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
				if (navigator.webdriver) return;
				if (localStorage.getItem(DAY_KEY_PREFIX + today) !== null) return;
				const visitor = visitorId();
				if (visitor === null) return;
				pruneDayKeys(today);
				const payloadItems = items.map((item) => {
					const out = { name: item.name };
					const version = item.version ?? bakedVersion();
					if (version !== void 0) out.version = version;
					if (item.channel !== void 0) out.channel = item.channel;
					return out;
				});
				const body = JSON.stringify({
					kind: "heartbeat",
					visitor,
					items: payloadItems
				});
				fetch(ENDPOINT, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body,
					keepalive: true
				}).then((response) => {
					if (response.ok) localStorage.setItem(DAY_KEY_PREFIX + today, "1");
				}).catch(() => {});
			} catch {}
		}
		//#endregion
		//#region src/client/index.ts
		/** Same-origin JSON fetch helper (GET without body, POST with JSON body). */
		async function petFetch(path, body) {
			const response = await fetch(path, body === void 0 ? {} : {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body)
			});
			if (!response.ok) throw new Error("pet " + path + " failed: " + response.status);
			return await response.json();
		}
		/** The live host API instance (always defined; failures surface per call). */
		const petApi = {
			state: (currentSessionId) => petFetch("/api/pet/state" + (currentSessionId === void 0 ? "" : "?current=" + encodeURIComponent(currentSessionId))),
			pets: () => petFetch("/api/pet/pets"),
			interact: (kind) => petFetch("/api/pet/interact", { kind }),
			setVisible: (visible) => petFetch("/api/pet/set-visible", { visible }),
			setConfig: (patch) => petFetch("/api/pet/set-config", patch),
			setName: (name) => petFetch("/api/pet/set-name", { name }),
			setPet: (petId) => petFetch("/api/pet/set-pet", { petId }),
			panelAction: (id) => petFetch("/api/pet/panel-action", { id }),
			setSkin: (skin) => petFetch("/api/pet/set-skin", skin === void 0 ? {} : { skin }),
			gameplayTouch: (zone) => petFetch("/api/pet/gameplay/touch", zone === void 0 ? {} : { zone }),
			gameplaySetMode: (mode) => petFetch("/api/pet/gameplay/mode", { mode }),
			gameplayWorkTick: () => petFetch("/api/pet/gameplay/work-tick", {}),
			gameplayBuy: (item) => petFetch("/api/pet/gameplay/buy", { item })
		};
		/** Poll interval for the host snapshot. */
		const POLL_MS = 2e3;
		/** Settings namespace of the pet's settings page. It is the profile entry id the Host serves a form for. */
		const PET_SETTINGS_NS = "pet";
		/** Required services (sessions powers bubble-to-session navigation). */
		const inject = [
			"slots",
			"locale",
			"connection",
			"configForms",
			"remote",
			"sessions",
			"uiWorkspace"
		];
		const PET_ENTRY_IDS = [
			"web-ui-pet",
			"ui-pet",
			PET_SETTINGS_NS
		];
		/** How long the deferred form keeps retrying before it settles on the fallback. */
		const BINDER_RETRY_MS = 250;
		const BINDER_ATTEMPTS = 24;
		/** The snapshot an unresolved (or resolvable-but-unbound) form publishes. */
		function pendingSnapshot(status) {
			return {
				status,
				value: void 0,
				base: void 0,
				user: void 0,
				revision: void 0,
				writable: false,
				mode: "host"
			};
		}
		/**
		* A ConfigForm that late-binds to the family settings binder.
		*
		* The binder service (dsh-web-settings) is not guaranteed to be published by the
		* time this plugin's apply() runs: the aggregate bundle mounts its inlined
		* children — including the binder — inside an async mount that awaits the
		* active-rows fetch, while standalone loader entries like this one apply
		* synchronously in that window. A single early probe then permanently falls
		* back to `configForms.get('pet')`, which is never a served row id under the
		* aggregate (the row is `web-ui-pet`), so the settings card renders "not
		* exposed" forever even though the Host serves the namespace.
		*
		* This form resolves through the binder as soon as the service appears and
		* delegates the whole ConfigForm surface to it, re-publishing to its own
		* subscribers on every swap. Until a form is resolved it publishes a loading
		* (then unavailable) snapshot so the card shows a transient state, never a
		* false "not exposed". If the binder never appears it retries for a bounded
		* window, then permanently binds the non-bridge fallback by SERVED entry id.
		*/
		var DeferredSettingsForm = class {
			ctx;
			current;
			listeners = /* @__PURE__ */ new Set();
			unsubscribeCurrent;
			retryTimer;
			attempts = 0;
			disposed = false;
			fallback;
			fallbackUnsubscribe;
			constructor(ctx) {
				this.ctx = ctx;
				this.fallback = ctx.configForms.get(this.resolveFallbackEntryId());
				if (!this.resolve() && !this.fallbackSettled()) this.scheduleRetry();
				else if (this.current === void 0) this.adoptFallback();
			}
			/**
			* True only once the shared mirror answers for the pet namespace itself.
			*
			* 'ready' is the only state that answers (#1813). A host-persisted row starts
			* out as 'loading' — the mirror has published no view yet — and that is not
			* an answer: adopting it on sight drops the retry window, and under the
			* aggregate, which serves only the renamed 'web-ui-pet' row, the form then
			* settles into 'unavailable' and the page stays "not exposed" for good. So
			* 'loading' and 'unavailable' both keep the window open and let the binder be
			* adopted the moment the aggregate publishes it.
			*/
			fallbackSettled() {
				try {
					return this.fallback.getSnapshot().status === "ready";
				} catch {
					return false;
				}
			}
			/**
			* Bind the fallback to a SERVED row id when the mirror can name one; a mirror
			* that cannot is left to report its own unavailable state.
			*/
			resolveFallbackEntryId() {
				try {
					const served = this.ctx.configForms.describe().getSnapshot().view?.namespaces.map((view) => view.ns);
					if (served && served.length > 0) {
						const hit = PET_ENTRY_IDS.find((id) => served.includes(id));
						if (hit !== void 0) return hit;
					}
				} catch {}
				return PET_SETTINGS_NS;
			}
			/**
			* Adopt the family binder the moment it is published.
			* @returns true when a binder was bound, false when none is available yet.
			*/
			resolve() {
				if (this.disposed) return false;
				let binder;
				try {
					binder = this.ctx.get("webUiSettings");
				} catch {
					binder = void 0;
				}
				if (binder === void 0 || typeof binder.bind !== "function") return false;
				let bound;
				try {
					bound = binder.bind({ namespace: PET_SETTINGS_NS });
				} catch {
					return false;
				}
				this.current = bound;
				this.unsubscribeCurrent?.();
				this.unsubscribeCurrent = bound.subscribe(() => this.publish());
				this.publish();
				return true;
			}
			/**
			* Adopt the shared per-entry form. It is used immediately unless it cannot
			* answer yet (still loading, or reporting the namespace unavailable), in which
			* case the binder may still be on its way and the retry window takes over
			* (see scheduleRetry).
			*/
			adoptFallback() {
				this.current = this.fallback;
				this.fallbackUnsubscribe ??= this.fallback.subscribe(() => this.publish());
				this.unsubscribeCurrent = this.fallbackUnsubscribe;
				this.publish();
			}
			/** Retry the binder lookup a few times across the aggregate's async mount. */
			scheduleRetry() {
				if (this.disposed) return;
				if (this.attempts >= BINDER_ATTEMPTS) {
					this.adoptFallback();
					return;
				}
				this.attempts += 1;
				this.retryTimer = window.setTimeout(() => {
					this.retryTimer = void 0;
					if (this.disposed) return;
					if (this.resolve()) return;
					if (this.fallbackSettled()) {
						this.attempts = BINDER_ATTEMPTS;
						this.adoptFallback();
						return;
					}
					this.scheduleRetry();
				}, 250);
			}
			publish() {
				for (const listener of this.listeners) listener();
			}
			/** The resolved form, or a placeholder snapshot when still pending. */
			snapshot() {
				return this.current?.getSnapshot() ?? pendingSnapshot(this.attempts >= BINDER_ATTEMPTS ? "unavailable" : "loading");
			}
			getSnapshot() {
				return this.snapshot();
			}
			subscribe(listener) {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			}
			mutate(ops, expectedRevision) {
				return this.current?.mutate(ops, expectedRevision) ?? Promise.resolve(false);
			}
			set(field, value) {
				return this.current?.set(field, value) ?? Promise.resolve(false);
			}
			unset(field) {
				return this.current?.unset(field) ?? Promise.resolve(false);
			}
			/** Release the retry timer and mirror subscription; not part of ConfigForm. */
			dispose() {
				if (this.disposed) return;
				this.disposed = true;
				if (this.retryTimer !== void 0) {
					window.clearTimeout(this.retryTimer);
					this.retryTimer = void 0;
				}
				this.unsubscribeCurrent?.();
				this.unsubscribeCurrent = void 0;
				this.current = void 0;
				this.listeners.clear();
				this.fallbackUnsubscribe?.();
				this.fallbackUnsubscribe = void 0;
			}
		};
		/**
		* Client plugin body: register dictionaries, mount the global pet entry and
		* poll loop while the plugin is enabled, and seat the settings card as a
		* first-level settings section.
		* @param ctx - client root context.
		*/
		/** The page-wide work-tick gate; its window follows the active pet's cadence. */
		const workTickGate = createWorkTickGate();
		/**
		* The work cadence the active pet declares, when its registry entry is known.
		* @param store - the pet store holding the host snapshot and the registry list.
		* @returns the configured `gameplay.work.tickMs`, or undefined when unknown.
		*/
		function activeWorkTickMs(store) {
			const state = store.getSnapshot();
			return state.pets.find((entry) => entry.id === state.snapshot?.pet.id)?.gameplay?.work?.tickMs;
		}
		function apply(ctx) {
			reportDailyHeartbeat([{ name: "@linxin666/dsh-pet" }]);
			ctx.effect(() => {
				try {
					return ctx.locale.register("pet", {
						zh,
						en
					});
				} catch {
					return () => {};
				}
			}, "pet: dictionaries");
			defaultPetRendererRegistry.register(live2dRenderer);
			defaultPetRendererRegistry.register(frames2dRenderer);
			const settingsForm = new DeferredSettingsForm(ctx);
			const enabled = () => {
				const snapshot = settingsForm.getSnapshot();
				return snapshot.status === "ready" ? snapshot.value?.enabled ?? true : snapshot.status === "unavailable";
			};
			const petSettings = new PetSettingsCardController(settingsForm);
			ctx.slots.inject("settings.section", () => {
				try {
					const unregister = ctx.slots.register({
						name: "settings.section",
						id: "pet",
						order: 130,
						label: () => ctx.locale.bind("pet")("settings.title"),
						locale: "pet",
						inject: () => petSettings.inject()
					}, PetSettingsSection);
					return () => {
						unregister();
						petSettings.dispose();
					};
				} catch {
					return () => {};
				}
			});
			let disposeUi;
			let clearUiTeardown;
			let uiDead = false;
			const killUi = () => {
				if (uiDead) return;
				uiDead = true;
				clearUiTeardown?.();
				clearUiTeardown = void 0;
				disposeUi?.();
				disposeUi = void 0;
			};
			const syncUi = () => {
				if (!uiDead && enabled() && disposeUi === void 0) {
					const petStore = createPetStore().create();
					const setSnapshot = petStore.actions.setSnapshot;
					const setPets = petStore.actions.setPets;
					const setState = petStore.actions.setState;
					const setFeedback = petStore.actions.setFeedback;
					const sessions = ctx.sessions;
					const currentSessionId = () => mainViewSessionId(sessions.list.getSnapshot().byId);
					let petsLoaded = false;
					let stateSeq = 0;
					const pollNow = () => {
						if (!petsLoaded) petApi.pets().then((list) => {
							petsLoaded = true;
							setPets(list);
						}, () => {});
						const seq = stateSeq + 1;
						stateSeq = seq;
						petApi.state(currentSessionId()).then((snapshot) => {
							if (seq !== stateSeq) return;
							setSnapshot(snapshot);
						}, () => {
							if (seq !== stateSeq) return;
							setState("error", "pet.state transport error");
						});
					};
					const disposePoll = ctx.effect(() => {
						let timer;
						const stop = () => {
							if (timer !== void 0) {
								window.clearInterval(timer);
								timer = void 0;
							}
						};
						const start = () => {
							if (timer === void 0 && document.visibilityState === "visible") timer = window.setInterval(pollNow, POLL_MS);
						};
						const onVisibility = () => {
							if (document.visibilityState === "visible") {
								pollNow();
								start();
							} else stop();
						};
						start();
						document.addEventListener("visibilitychange", onVisibility);
						return () => {
							stop();
							document.removeEventListener("visibilitychange", onVisibility);
						};
					}, "pet: poll");
					const disposeSessionWatch = ctx.effect(() => {
						return sessions.list.subscribe(() => {
							if (document.visibilityState === "visible") pollNow();
						});
					}, "pet: current-session watch");
					const openSession = (sessionId) => {
						if (sessions.list.getSnapshot().byId[sessionId] === void 0) return;
						ctx.uiWorkspace.openSession(sessionId);
					};
					const injected = () => ({
						store: petStore,
						ensure: pollNow,
						openSession,
						pet: () => {
							petApi.interact("pet").then((result) => {
								setFeedback({
									text: result.reaction,
									kind: "pet",
									at: Date.now()
								});
							}, () => {});
						},
						feed: () => {
							petApi.interact("feed").then((result) => {
								setFeedback({
									text: result.reaction,
									kind: "feed",
									at: Date.now()
								});
							}, () => {});
						},
						hide: () => {
							petApi.setVisible(false).then(() => {
								pollNow();
							}, () => {});
						},
						summon: () => {
							petApi.setVisible(true).then(() => {
								pollNow();
							}, () => {});
						},
						dragEnd: (right, bottom) => {
							petApi.setConfig({
								right,
								bottom
							}).then(() => {
								pollNow();
							}, () => {});
						},
						rename: (name) => {
							petApi.setName(name).then((result) => {
								if (result.ok) pollNow();
							}, () => {});
						},
						panelAction: (id) => {
							petApi.panelAction(id).then((result) => {
								if (result.ok) pollNow();
							}, () => {});
						},
						feedbackDone: () => {
							setFeedback(null);
						},
						gameplay: {
							touch: (zone) => petApi.gameplayTouch(zone),
							setSkin: (skin) => petApi.setSkin(skin).then((result) => {
								if (result.ok) pollNow();
								return result;
							}, () => ({
								ok: false,
								error: "transport"
							})),
							setMode: async (mode) => {
								if (mode === "work") workTickGate.reset();
								return petApi.gameplaySetMode(mode);
							},
							workTick: async () => {
								if (!workTickGate.allow(activeWorkTickMs(petStore))) return { ok: true };
								return petApi.gameplayWorkTick();
							},
							buy: (item) => petApi.gameplayBuy(item)
						}
					});
					takeoverPetUiTeardown();
					for (const stale of Array.from(document.querySelectorAll("div[data-dsh-pet-root]"))) stale.remove();
					const container = document.createElement("div");
					container.dataset.dshPetRoot = "";
					container.dataset.dshPlugin = "pet";
					document.body.appendChild(container);
					const petRoot = (0, react_dom_client.createRoot)(container);
					petRoot.render((0, react.createElement)(PetDockEntry, {
						...injected(),
						t: ctx.locale.bind("pet"),
						portalTarget: container
					}));
					let uiGone = false;
					disposeUi = () => {
						if (uiGone) return;
						uiGone = true;
						clearUiTeardown?.();
						clearUiTeardown = void 0;
						petRoot.unmount();
						container.remove();
						disposePoll();
						disposeSessionWatch();
						disposeUi = void 0;
					};
					clearUiTeardown = registerPetUiTeardown(() => {
						uiDead = true;
						disposeUi?.();
					});
				} else if (!uiDead && !enabled() && disposeUi !== void 0) {
					disposeUi();
					disposeUi = void 0;
				}
			};
			const unsubscribeSettings = settingsForm.subscribe(syncUi);
			ctx.effect(() => () => {
				unsubscribeSettings();
				settingsForm.dispose();
				killUi();
			}, "pet: client lifecycle");
			syncUi();
		}
		//#endregion
		exports.BINDER_RETRY_MS = BINDER_RETRY_MS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map