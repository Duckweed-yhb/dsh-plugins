window.__ModuleLoader__.load({
	id: "@linxin666/dsh-client-ui-web-ui-settings",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_cordis = require("@deepseek-ai/cordis");
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
		engine.defineStore;
		engine.shallowEqual;
		//#endregion
		//#region src/protocol.ts
		/**
		* Settings-bridge protocol shared by the host and client halves of
		* dsh-web-settings.
		*
		* The Host settings surface (`ctx.settings`, the new SettingsForms service)
		* describes ONE form per active profile entry id and writes by that id; the
		* settings namespace a family plugin used to register no longer exists as a
		* separate key. The bridge keeps serving the family plugins their own view of
		* that surface over a same-origin, loopback-only HTTP pair, gated by the
		* user's web_settings_namespaces allowlist from settings.yaml with a built-in
		* family fallback list: each view now carries the profile entry id
		* ({@link BridgeNamespaceView.entryId}) that owns the namespace, and the
		* client half uses it to bind the native `ctx.configForms` form. The bridge
		* HTTP transport stays the fallback for pages whose entry id cannot be
		* resolved.
		*/
		/** Bridge route prefix (same-origin, loopback-only). */
		const WEB_UI_SETTINGS_BRIDGE_PREFIX = "/api/dsh-web-ui-settings";
		//#endregion
		//#region src/client/compat-settings-scope.ts
		/**
		* Family settings transport for the Web UI plugin group.
		*
		* The 0.1.7 settings surface addresses ONE form per active profile entry id
		* (`ctx.configForms.get(entryId)`) and carries no package identity at all, so
		* a family plugin that only knows its own settings namespace cannot reach its
		* form directly. This binder bridges the gap: it asks the host bridge which
		* profile entry id owns the requested namespace, binds the native
		* `ctx.configForms` form for that id, and keeps the loopback bridge controller
		* as the fallback for pages the entry id never reaches (a deployment whose
		* profile row the bridge cannot trace). Family plugins opt in through
		* `ctx.get('webUiSettings')` without a hard service dependency, so a
		* deployment without this package keeps the previous behavior.
		*/
		/** True when the value is a well-formed bridge RPC result (the inner result payload the route answers). */
		function isBridgeResult(value) {
			if (typeof value !== "object" || value === null) return false;
			const record = value;
			if (typeof record.ok !== "boolean") return false;
			if (record.ok) return typeof record.value === "object" && record.value !== null;
			return typeof record.code === "string" && typeof record.message === "string";
		}
		/**
		* Build the fetch-backed settings face for the bridge routes. Network and
		* HTTP failures collapse into an ok:false envelope so the controller keeps
		* its unavailable state instead of throwing into plugin activation.
		* @param fetchFn - the same-origin fetch implementation.
		* @returns the settings face.
		*/
		function createBridgeApi(fetchFn) {
			const post = async (path, body) => {
				try {
					const response = await fetchFn(WEB_UI_SETTINGS_BRIDGE_PREFIX + path, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(body)
					});
					if (!response.ok) return { result: {
						ok: false,
						code: "internal",
						message: "bridge HTTP " + response.status
					} };
					const parsed = await response.json();
					if (!isBridgeResult(parsed)) return { result: {
						ok: false,
						code: "internal",
						message: "bridge malformed response"
					} };
					return { result: parsed };
				} catch {
					return { result: {
						ok: false,
						code: "internal",
						message: "settings bridge unreachable"
					} };
				}
			};
			return { settings: {
				describe: async (payload) => post("/describe", payload),
				mutate: async (payload) => post("/mutate", payload)
			} };
		}
		function readPathInLayer(target, path) {
			let curr = target;
			for (const seg of path) {
				if (typeof curr !== "object" || curr === null || !Object.hasOwn(curr, seg)) return { found: false };
				curr = curr[seg];
			}
			return {
				found: true,
				value: curr
			};
		}
		/**
		* Judge each requested field against a redacted namespace view. A secret
		* field is redacted from the user layer, so it is judged by the view's
		* secret-set marker; every other field is judged by user-layer
		* presence/value. Shared by the bridge controller and the native batch
		* surface (both answer the same redacted view shape).
		*/
		function judgeLandedFields(fields, view) {
			const secretSet = /* @__PURE__ */ new Map();
			for (const secret of view.secrets ?? []) secretSet.set(secret.path.join("."), secret.set);
			const user = view.user;
			return fields.map(({ field, op, value, path }) => {
				const keyPath = path ?? [field];
				const secretKey = path ? path.join(".") : field;
				const secretFlag = secretSet.get(secretKey);
				if (secretFlag !== void 0) return {
					field,
					landed: secretFlag
				};
				const read = readPathInLayer(user, keyPath);
				if (op === "set") return {
					field,
					landed: read.found && read.value === value
				};
				return {
					field,
					landed: !read.found
				};
			});
		}
		/** The snapshots a form publishes before any Host answer, stable per status. */
		const PENDING_SNAPSHOTS = /* @__PURE__ */ new Map();
		/** The snapshot a page with no Host answer yet reports. */
		function pendingSnapshot(status) {
			const held = PENDING_SNAPSHOTS.get(status);
			if (held !== void 0) return held;
			const snapshot = {
				status,
				value: void 0,
				base: void 0,
				user: void 0,
				revision: void 0,
				writable: false,
				mode: "host"
			};
			PENDING_SNAPSHOTS.set(status, snapshot);
			return snapshot;
		}
		/** The snapshot a page with no settings transport at all reports. */
		function unavailableSnapshot() {
			return pendingSnapshot("unavailable");
		}
		/**
		* A ConfigForm over the bridge face. Mirrors the native controller's ordering
		* (serialized queue, revision-fenced writes, recovery read after a refusal)
		* but trusts the Host-answered view without re-running the wire-schema
		* validation: the Host already validated it, and the family cards bind
		* without a narrowing decoder.
		*/
		var BridgeScopeController = class {
			api;
			store;
			spec;
			tail = Promise.resolve();
			disposed = false;
			/** Profile entry id the last accepted view carried; undefined until the Host answers one. */
			entryId;
			constructor(api, spec) {
				this.api = api;
				this.spec = spec;
				this.store = createSnapshotStore(pendingSnapshot("loading"));
			}
			getSnapshot() {
				return this.store.getSnapshot();
			}
			subscribe(listener) {
				return this.store.subscribe(listener);
			}
			/** Queue a Host refresh through the bridge. */
			load() {
				return this.enqueue(() => this.read());
			}
			set(field, value) {
				return this.enqueue(() => this.write({
					op: "set",
					path: [field],
					value
				}));
			}
			unset(field) {
				return this.enqueue(() => this.write({
					op: "unset",
					path: [field]
				}));
			}
			/**
			* Write every staged op in one bridge /mutate so the Host validate hook
			* judges the whole batch (baseURL+model together) instead of each field in
			* isolation.
			* @param fields - the operations to apply, in order.
			* @param expectedRevision - revision the caller read, when it holds one.
			* @returns whether the Host accepted the whole batch; a refusal recovers
			*   with a fresh view and answers false.
			*/
			mutate(fields, expectedRevision) {
				const bridgeFields = fields.map((field) => "value" in field ? {
					field: field.path.join("."),
					op: field.op,
					value: field.value,
					path: [...field.path]
				} : {
					field: field.path.join("."),
					op: field.op,
					path: [...field.path]
				});
				return this.enqueue(async () => (await this.writeBatch(bridgeFields, expectedRevision)).ok);
			}
			/** Compatibility batch result used by generated settings forms. */
			mutateBatch(fields, expectedRevision) {
				return this.enqueue(() => this.writeBatch(fields, expectedRevision));
			}
			/** The profile entry id the Host's last answer reported, when it reported one. */
			resolvedEntryId() {
				return this.entryId;
			}
			/** Stop queued operations and wait for the current bridge call to settle. */
			async dispose() {
				this.disposed = true;
				await this.tail;
			}
			enqueue(operation) {
				if (this.disposed) return Promise.resolve(void 0);
				const task = this.tail.then(async () => {
					if (this.disposed) return void 0;
					return operation();
				});
				this.tail = task.catch(() => {});
				return task;
			}
			async read() {
				let response;
				try {
					response = await this.api.settings.describe({});
				} catch {
					if (!this.disposed) this.store.update((draft) => {
						draft.status = "unavailable";
					});
					return;
				}
				if (!response.result.ok || this.disposed) {
					if (!this.disposed) this.store.update((draft) => {
						draft.status = "unavailable";
					});
					return;
				}
				const { namespaces, writable } = response.result.value;
				const view = namespaces.find((candidate) => candidate.ns === this.spec.namespace);
				if (view === void 0) {
					this.entryId = void 0;
					this.store.update((draft) => {
						draft.status = "unavailable";
						draft.writable = writable;
					});
					return;
				}
				this.accept(view.value, view, writable);
			}
			async write(op) {
				const revision = this.getSnapshot().revision;
				let response;
				try {
					response = await this.api.settings.mutate({
						ns: this.spec.namespace,
						ops: [op],
						...revision === void 0 ? {} : { expectedRevision: revision }
					});
				} catch {
					await this.read();
					return false;
				}
				if (!response.result.ok || this.disposed) {
					await this.read();
					return false;
				}
				this.accept(response.result.value.value, response.result.value, void 0);
				return true;
			}
			async writeBatch(fields, expectedRevision) {
				const revision = expectedRevision ?? this.getSnapshot().revision;
				const ops = fields.map(({ field, op, value, path }) => op === "set" ? {
					op,
					path: path ?? [field],
					value
				} : {
					op,
					path: path ?? [field]
				});
				let response;
				try {
					response = await this.api.settings.mutate({
						ns: this.spec.namespace,
						ops,
						...revision === void 0 ? {} : { expectedRevision: revision }
					});
				} catch {
					await this.read();
					return {
						ok: false,
						fields: [],
						code: "internal",
						message: "settings bridge unreachable"
					};
				}
				if (!response.result.ok || this.disposed) {
					const refusal = response.result.ok === false ? response.result : {
						code: "internal",
						message: "settings bridge unreachable"
					};
					await this.read();
					return {
						ok: false,
						fields: [],
						code: refusal.code,
						message: refusal.message
					};
				}
				this.accept(response.result.value.value, response.result.value, void 0);
				return {
					ok: true,
					fields: judgeLandedFields(fields, response.result.value)
				};
			}
			/** Publish one accepted Host view (value narrowed by the optional decoder). */
			accept(section, view, writable) {
				const decoded = this.spec.decode === void 0 ? section : this.spec.decode(section);
				this.entryId = view.entryId;
				this.store.update((draft) => {
					draft.revision = view.revision;
					draft.base = view.base;
					draft.user = view.user;
					if (writable !== void 0) draft.writable = writable;
					if (decoded === void 0) return;
					draft.status = "ready";
					draft.value = decoded;
				});
			}
		};
		/**
		* Narrow one ready native snapshot's section, keeping the value a previous
		* decode accepted when the decoder refuses the section.
		*/
		function projectDecoded(source, decode, previous) {
			const value = decode(source.value);
			if (value !== void 0) return {
				...source,
				value
			};
			if (previous === void 0) return {
				...source,
				status: "loading",
				value: void 0
			};
			return {
				...source,
				status: previous.status,
				value: previous.value
			};
		}
		/**
		* Wrap the family transport: the native per-entry form when the Host serves
		* one for this namespace, the loopback bridge controller otherwise.
		* @param options - the namespace, the shared forms service, and the fetch seat.
		* @returns the compatibility form implementing the ConfigForm contract.
		*/
		function createCompatScope(options) {
			const { namespace, configForms, decode } = options;
			const fallback = options.fetchFn === void 0 ? void 0 : new BridgeScopeController(createBridgeApi(options.fetchFn), {
				namespace,
				...decode === void 0 ? {} : { decode }
			});
			/** The native per-entry form, bound the moment its profile entry id is known. */
			let native;
			let nativeEntryId;
			let nativeUnsubscribe;
			let decoded;
			/** Project one native form's snapshot through this scope's decoder (stable references). */
			const projectNative = (form) => {
				const source = form.getSnapshot();
				if (decode === void 0) return source;
				if (decoded !== void 0 && decoded.source === source) return decoded.projected;
				const projected = source.status === "ready" ? projectDecoded(source, decode, decoded?.projected) : source;
				decoded = {
					source,
					projected
				};
				return projected;
			};
			function project() {
				if (native !== void 0) return projectNative(native);
				return fallback?.getSnapshot() ?? unavailableSnapshot();
			}
			const store = createSnapshotStore(project());
			const publish = () => {
				store.set(project());
			};
			/**
			* The profile entry ids the shared mirror serves, or undefined while it has
			* no answer yet: an unanswered mirror is not evidence of absence.
			*/
			const servedEntryIds = () => {
				try {
					return configForms?.describe().getSnapshot().view?.namespaces.map((view) => view.ns);
				} catch {
					return [];
				}
			};
			/** Bind the native form of one profile entry id, if this page serves one. */
			const bindNative = (entryId) => {
				if (configForms === void 0 || native !== void 0) return;
				let form;
				try {
					form = configForms.get(entryId);
				} catch {
					return;
				}
				native = form;
				nativeEntryId = entryId;
				nativeUnsubscribe = form.subscribe(() => {
					if (native !== void 0) publish();
				});
				publish();
			};
			/**
			* Promote the transport to the native form the moment its profile entry id
			* is known: through the bridge, which is the only place the namespace to
			* entry-id mapping lives, or — for a caller that already binds by entry id —
			* by the namespace itself being one of the served entry ids. A mirror that
			* explicitly lacks the resolved id keeps the bridge: the native form would
			* only report the namespace unavailable.
			*/
			const promote = () => {
				if (native !== void 0) return;
				const served = servedEntryIds();
				const resolved = fallback?.resolvedEntryId();
				if (resolved !== void 0 && (served === void 0 || served.includes(resolved))) {
					bindNative(resolved);
					return;
				}
				if (native === void 0 && served?.includes(namespace) === true) bindNative(namespace);
			};
			const unsubscribes = [];
			if (fallback !== void 0) unsubscribes.push(fallback.subscribe(() => {
				promote();
				if (native === void 0) publish();
			}));
			if (configForms !== void 0) try {
				unsubscribes.push(configForms.describe().subscribe(() => {
					promote();
					if (native === void 0) publish();
				}));
			} catch {}
			promote();
			if (native === void 0) if (fallback !== void 0) fallback.load();
			else publish();
			/** The native batch surface: one atomic mutate, per-field landed flags read back. */
			const nativeBatch = (form) => async (fields, expectedRevision) => {
				const ops = fields.map(({ field, op, value, path }) => op === "set" ? {
					op,
					path: path ?? [field],
					value
				} : {
					op,
					path: path ?? [field]
				});
				if (!await form.mutate(ops, expectedRevision ?? form.getSnapshot().revision)) return {
					ok: false,
					fields: [],
					code: "settings-rejected",
					message: "the Host refused the settings mutation"
				};
				const view = configForms?.describe().getSnapshot().view?.namespaces.find((candidate) => candidate.ns === nativeEntryId);
				return {
					ok: true,
					fields: judgeLandedFields(fields, {
						user: form.getSnapshot().user,
						...view?.secrets === void 0 ? {} : { secrets: [...view.secrets] }
					})
				};
			};
			return {
				dispose: () => {
					for (const unsubscribe of unsubscribes.splice(0)) unsubscribe();
					nativeUnsubscribe?.();
					nativeUnsubscribe = void 0;
					native = void 0;
					fallback?.dispose();
				},
				entryId: () => nativeEntryId ?? fallback?.resolvedEntryId(),
				getSnapshot: () => store.getSnapshot(),
				subscribe: (listener) => store.subscribe(listener),
				mutate: (ops, expectedRevision) => native?.mutate(ops, expectedRevision) ?? fallback?.mutate(ops, expectedRevision) ?? Promise.resolve(false),
				set: (field, value) => native?.set(field, value) ?? fallback?.set(field, value) ?? Promise.resolve(false),
				unset: (field) => native?.unset(field) ?? fallback?.unset(field) ?? Promise.resolve(false),
				load: async () => {
					if (native !== void 0) return;
					await fallback?.load();
				},
				get mutateBatch() {
					if (native !== void 0) return nativeBatch(native);
					return fallback?.mutateBatch.bind(fallback);
				}
			};
		}
		/** True when the value is the shared configuration forms service. */
		function isConfigFormsFace(value) {
			if (typeof value !== "object" || value === null) return false;
			const face = value;
			return typeof face.get === "function" && typeof face.describe === "function";
		}
		/** True when the value exposes the settings invalidation face the wrapper listens to. */
		function isRemoteFace(value) {
			return typeof value === "object" && value !== null && typeof value.$on === "function";
		}
		/**
		* The family settings binder, provided as the webUiSettings service. Its
		* bind() resolves the profile entry id through the bridge and hands back the
		* native shared form, falling back to the loopback bridge controller for a
		* page the entry id never reaches.
		*/
		var WebUiSettingsBinder = class extends _deepseek_ai_cordis.Service {
			constructor(ctx) {
				super(ctx, "webUiSettings");
			}
			/**
			* The binder itself under the previous cohort's seat name.
			* @deprecated The 0.1.7 client serves no `ctx.settingsScope` service; this
			* alias only keeps call sites written as
			* `ctx.get('webUiSettings') ?? ctx.settingsScope` compiling while they are
			* migrated to `ctx.get('webUiSettings')`.
			*/
			get settingsScope() {
				return this;
			}
			/**
			* Bind one family settings namespace.
			* @param spec - the namespace and an optional narrowing decoder.
			* @returns the form the caller stages and saves through.
			*/
			bind(spec) {
				const ctx = this.ctx;
				const forms = ctx.get("configForms");
				const scope = createCompatScope({
					namespace: spec.namespace,
					...spec.decode === void 0 ? {} : { decode: spec.decode },
					...isConfigFormsFace(forms) ? { configForms: forms } : {},
					...typeof fetch === "function" ? { fetchFn: (input, init) => fetch(input, init) } : {}
				});
				ctx.effect(() => {
					const disposers = [];
					const remote = ctx.get("remote");
					if (isRemoteFace(remote)) disposers.push(remote.$on("settings/document-updated", (namespace) => {
						if (namespace !== void 0 && String(namespace) !== spec.namespace && String(namespace) !== scope.entryId()) return;
						scope.load();
					}));
					disposers.push(ctx.on("connection/reset", () => {
						scope.load();
					}));
					return () => {
						for (const dispose of disposers) dispose();
						scope.dispose();
					};
				}, "web-ui-settings: compat form invalidation");
				return scope;
			}
		};
		//#endregion
		//#region \0dsh-css:packages/dsh-web-settings/src/client/web-ui-settings.module.css.mjs
		const css = ".HfjcPG_section{flex-direction:column;display:flex}.HfjcPG_heading{color:var(--dsw-alias-label-primary);margin:0 0 14px;font-size:17px;font-weight:600;line-height:1.4}.HfjcPG_sectionList{margin:0;padding:0;list-style:none}.HfjcPG_subcards{flex-direction:column;gap:10px;margin:0;padding:0;list-style:none;display:flex}[class*=_navList]:has(>[class*=_navCell]:nth-child(8)):not(:has(>[class*=_navCell]:nth-child(9)))>[class*=_navCell]:nth-child(5)>[class*=_navIcon],[class*=_navList]:has(>[class*=_navCell]:nth-child(8)):not(:has(>[class*=_navCell]:nth-child(9)))>[class*=_navCell]:nth-child(6)>[class*=_navIcon],[class*=_navList]:has(>[class*=_navCell]:nth-child(8)):not(:has(>[class*=_navCell]:nth-child(9)))>[class*=_navCell]:nth-child(7)>[class*=_navIcon],[class*=_navList]:has(>[class*=_navCell]:nth-child(8)):not(:has(>[class*=_navCell]:nth-child(9)))>[class*=_navCell]:nth-child(8)>[class*=_navIcon]{display:none}[class*=_navList]:has(>[class*=_navCell]:nth-child(8)):not(:has(>[class*=_navCell]:nth-child(9)))>[class*=_navCell]:nth-child(5):before{content:\"\";background:currentColor;flex:none;width:16px;height:16px;-webkit-mask:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z'/%3E%3C/svg%3E\") 50%/contain no-repeat;mask:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z'/%3E%3C/svg%3E\") 50%/contain no-repeat}[class*=_navList]:has(>[class*=_navCell]:nth-child(8)):not(:has(>[class*=_navCell]:nth-child(9)))>[class*=_navCell]:nth-child(6):before{content:\"\";background:currentColor;flex:none;width:16px;height:16px;-webkit-mask:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill-rule='evenodd' d='M8 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12zm0-4a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'/%3E%3C/svg%3E\") 50%/contain no-repeat;mask:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill-rule='evenodd' d='M8 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12zm0-4a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'/%3E%3C/svg%3E\") 50%/contain no-repeat}[class*=_navList]:has(>[class*=_navCell]:nth-child(8)):not(:has(>[class*=_navCell]:nth-child(9)))>[class*=_navCell]:nth-child(7):before{content:\"\";background:currentColor;flex:none;width:16px;height:16px;-webkit-mask:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cellipse cx='8' cy='11' rx='4.2' ry='2.8'/%3E%3Ccircle cx='2.8' cy='6.2' r='1.9'/%3E%3Ccircle cx='8' cy='4.6' r='1.9'/%3E%3Ccircle cx='13.2' cy='6.2' r='1.9'/%3E%3C/svg%3E\") 50%/contain no-repeat;mask:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cellipse cx='8' cy='11' rx='4.2' ry='2.8'/%3E%3Ccircle cx='2.8' cy='6.2' r='1.9'/%3E%3Ccircle cx='8' cy='4.6' r='1.9'/%3E%3Ccircle cx='13.2' cy='6.2' r='1.9'/%3E%3C/svg%3E\") 50%/contain no-repeat}[class*=_navList]:has(>[class*=_navCell]:nth-child(8)):not(:has(>[class*=_navCell]:nth-child(9)))>[class*=_navCell]:nth-child(8):before{content:\"\";background:currentColor;flex:none;width:16px;height:16px;-webkit-mask:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ccircle cx='5.5' cy='5.5' r='3'/%3E%3Ccircle cx='11' cy='5.5' r='3'/%3E%3Cpath d='M2.5 13.5c0-3 2-4.2 3-4.2H11c1.5 0 3 1.2 3 4.2z'/%3E%3C/svg%3E\") 50%/contain no-repeat;mask:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ccircle cx='5.5' cy='5.5' r='3'/%3E%3Ccircle cx='11' cy='5.5' r='3'/%3E%3Cpath d='M2.5 13.5c0-3 2-4.2 3-4.2H11c1.5 0 3 1.2 3 4.2z'/%3E%3C/svg%3E\") 50%/contain no-repeat}";
		const tagId = "@linxin666/dsh-client-ui-web-ui-settings/packages/dsh-web-settings/src/client/web-ui-settings.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@linxin666/dsh-client-ui-web-ui-settings";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var web_ui_settings_module_css_default = {
			"heading": "HfjcPG_heading",
			"section": "HfjcPG_section",
			"sectionList": "HfjcPG_sectionList",
			"subcards": "HfjcPG_subcards"
		};
		//#endregion
		//#region src/client/WebUIPluginsCard.tsx
		/** Render the family plugin cards directly under a static heading. */
		function WebUIPluginsSection(props) {
			const { t, renderSlot } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: web_ui_settings_module_css_default.section,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
					className: web_ui_settings_module_css_default.heading,
					title: t("title"),
					children: t("title")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
					className: web_ui_settings_module_css_default.subcards,
					children: renderSlot("web-ui.plugin.item", {})
				})]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* The `web-ui-plugins` locale dictionaries for the group card.
		*/
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = { "title": "Web 插件" };
		/** English dictionary, checked complete against the zh key set. */
		const en = { "title": "Web Plugins" };
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
		/** Required services. */
		const inject = [
			"slots",
			"locale",
			"connection",
			"configForms",
			"remote"
		];
		/**
		* Register the Web UI plugin group as a first-level settings section: its own
		* nav item hosts the family plugin cards in the section body.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			reportDailyHeartbeat([{ name: "@linxin666/dsh-client-ui-web-ui-settings" }]);
			ctx.effect(() => {
				try {
					return ctx.locale.register("web-ui-plugins", {
						zh,
						en
					});
				} catch {
					return () => {};
				}
			}, "web-ui-settings: dictionaries");
			new WebUiSettingsBinder(ctx);
			ctx.slots.inject("settings.section", () => {
				try {
					return ctx.slots.register({
						name: "settings.section",
						id: "web-ui-plugins",
						order: 110,
						label: () => ctx.locale.bind("web-ui-plugins")("title"),
						locale: "web-ui-plugins",
						children: { "web-ui.plugin.item": {
							kind: "list",
							scope: "root"
						} }
					}, WebUIPluginsSection);
				} catch {
					return () => {};
				}
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map