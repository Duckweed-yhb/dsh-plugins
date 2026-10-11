import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import { isAbsolute as isAbsolute$1, join as join$1 } from "node:path/posix";
import z from "schemastery";
import { timingSafeEqual } from "node:crypto";
import { SettingsConflictError } from "@deepseek-ai/dsh-settings";
//#region src/dsh-home.ts
/**
* DSH_HOME resolution shared by the plugin family's Host halves: the
* environment override wins, the platform home fallback follows. Mirrors
* what dsh-pet and dsh-liangshen each used to implement locally.
*/
/** Expand a leading ~ (or ~user) in a path, platform-style. */
function expandHome(path, home = homedir()) {
	const j = home.startsWith("/") ? join$1 : join;
	if (path === "~") return home;
	if (path.startsWith("~/") || path.startsWith("~\\")) return j(home, path.slice(2));
	return path;
}
/**
* Resolve the DSH home directory.
* @param env - process environment to read DSH_HOME from.
* @param home - platform home directory fallback (test seam).
* @returns the absolute DSH home path.
*/
function resolveDshHome(env = process.env, home = homedir()) {
	const isPosix = home.startsWith("/");
	const j = isPosix ? join$1 : join;
	const isAbs = isPosix ? isAbsolute$1 : isAbsolute;
	const raw = env.DSH_HOME;
	if (raw !== void 0 && raw.trim() !== "") {
		const expanded = expandHome(raw.trim(), home);
		return isAbs(expanded) ? expanded : j(process.cwd(), expanded);
	}
	return j(home, ".dsh");
}
//#endregion
//#region src/allowlist.ts
/**
* rc.6 compatibility allowlist for the settings bridge.
*
* rc.6 host-apiproxy never reads settings.yaml for a namespace allowlist: its
* WEB_SETTINGS_NAMESPACES set is hard-coded. Users configure
* web_settings_namespaces expecting the configuration page to honor it, so
* this package reads that key itself (host side) and maps the entries — which
* users spell as package names like dsh-client-ui-task-board — onto the real
* settings namespaces the plugins register (task-board and friends). When the
* key is absent, a built-in family fallback list keeps every family plugin's
* configuration form visible out of the box. The final allowlist is always
* intersected with the namespaces actually registered in the host settings
* seam, so an unknown entry can never surface a form or accept a write.
*/
/** Settings namespaces the dsh-web family plugins register. */
const FAMILY_NAMESPACES = [
	"dsh-ssh",
	"task-board",
	"remote-web-ui",
	"pet",
	"skin-background",
	"skin-custom-theme",
	"skin-wallpaper",
	"community-plugins",
	"dsh-web-ui-market",
	"dsh-market",
	"ui-market",
	"usage",
	"liangshen",
	"session-archive"
];
/**
* Package names and plugin ids to their settings namespace. A null value
* means the package owns no settings namespace (its configuration lives
* elsewhere, e.g. localStorage), so the entry is intentionally ignored.
*/
const NAMESPACE_ALIASES = {
	"dsh-ssh": "dsh-ssh",
	ssh: "dsh-ssh",
	"dsh-client-ui-task-board": "task-board",
	"dsh-task-board": "task-board",
	"task-board": "task-board",
	"dsh-remote-web-ui": "remote-web-ui",
	"remote-web-ui": "remote-web-ui",
	"dsh-pet": "pet",
	pet: "pet",
	"dsh-skins": "skin-background",
	"dsh-client-ui-skin-center": "skin-background",
	"skin-center": "skin-background",
	"skin-background": "skin-background",
	"skin-custom-theme": "skin-custom-theme",
	"skin-wallpaper": "skin-wallpaper",
	"community-plugins": "community-plugins",
	"dsh-community-plugins": "community-plugins",
	"dsh-client-ui-community-plugins": "community-plugins",
	"dsh-market": "dsh-market",
	dshmarket: "dsh-market",
	"dsh-client-ui-market": "dsh-web-ui-market",
	"dsh-web-ui-market": "dsh-web-ui-market",
	"ui-market": "dsh-web-ui-market",
	"web-ui-market": "dsh-web-ui-market",
	"dsh-workshop": "dsh-web-ui-market",
	market: "dsh-market",
	usage: "usage",
	"dsh-usage": "usage",
	liangshen: "liangshen",
	"dsh-liangshen": "liangshen",
	"session-archive": "session-archive",
	"dsh-session-archive": "session-archive",
	"dsh-git-graph": null,
	"dsh-client-ui-git-graph": null,
	"dsh-web": null,
	"dsh-web-all": null,
	"dsh-client-ui-web-ui-settings": null
};
/**
* Resolve one user-configured allowlist entry to all matching settings namespaces.
* Handles both the official dshmarket namespace ('dsh-market') and the family
* aggregate namespace ('dsh-web-ui-market') interchangeably.
*
* An entry may also be spelled as a full npm name (the scoped package a family
* plugin installs as, or the aggregate's `@linxin666/dsh-web-all/<x>` subplugin
* row). Such an identity resolves through its bare package segment, because
* the profile row is the only place a package name still appears — the
* settings surface itself carries entry ids alone.
*/
function resolveNamespaceEntries(entry) {
	const direct = resolveDirectNamespaceEntries(entry);
	if (direct.length > 0) return direct;
	const bare = bareIdentity(entry);
	return bare === void 0 ? [] : resolveDirectNamespaceEntries(bare);
}
/** The last path segment of an scoped npm name (`@scope/pkg` and `@scope/bundle/sub`). */
function bareIdentity(entry) {
	const key = entry.trim();
	if (!key.startsWith("@")) return void 0;
	const slash = key.lastIndexOf("/");
	if (slash < 0 || slash === key.length - 1) return void 0;
	return key.slice(slash + 1);
}
/** Resolve one allowlist entry spelled exactly as the alias table or the family list spells it. */
function resolveDirectNamespaceEntries(entry) {
	const key = entry.trim();
	if (key === "") return [];
	if (key === "dsh-market" || key === "market" || key === "dsh-client-ui-market" || key === "dsh-web-ui-market" || key === "dshmarket") return ["dsh-market", "dsh-web-ui-market"];
	if (Object.hasOwn(NAMESPACE_ALIASES, key)) {
		const target = NAMESPACE_ALIASES[key];
		return target === null || target === void 0 ? [] : [target];
	}
	if (FAMILY_NAMESPACES.includes(key)) return [key];
	return [];
}
/**
* Resolve one user-configured allowlist entry to a settings namespace.
* @param entry - raw entry from the user's allowlist.
* @returns the settings namespace, or undefined when the entry names nothing
*   configurable (unknown name, or a package without a settings namespace).
*/
function resolveNamespaceEntry(entry) {
	return resolveNamespaceEntries(entry)[0];
}
/**
* Compose the effective bridge allowlist.
* @param userEntries - normalized web_settings_namespaces entries; the empty
*   list selects the built-in family fallback list.
* @param registered - namespaces currently registered in the host settings
*   seam (the only namespaces a form or write can target).
* @returns the allowlist: resolved entries intersected with the registered
*   set, sorted for a stable wire view.
*/
function composeAllowlist(userEntries, registered) {
	const requested = userEntries.length === 0 ? FAMILY_NAMESPACES : userEntries;
	const resolved = /* @__PURE__ */ new Set();
	for (const entry of requested) for (const ns of resolveNamespaceEntries(entry)) resolved.add(ns);
	const registeredSet = new Set(registered);
	return [...resolved].filter((ns) => registeredSet.has(ns)).sort();
}
/** Strip one YAML scalar's quoting (single or double quotes). */
function stripQuotes(value) {
	const trimmed = value.trim();
	if (trimmed.length >= 2 && (trimmed[0] === "'" || trimmed[0] === "\"") && trimmed[trimmed.length - 1] === trimmed[0]) return trimmed.slice(1, -1).trim();
	return trimmed;
}
/** Trim one YAML list or map item down to its entry name. */
function entryOfItem(item) {
	let value = item.trim();
	if (value.startsWith("- ")) value = value.slice(2).trim();
	if (value === "") return void 0;
	const colon = value.indexOf(":");
	if (colon >= 0) value = value.slice(0, colon).trim();
	const name = stripQuotes(value);
	return name === "" ? void 0 : name;
}
/**
* Extract the web_settings_namespaces entries from raw settings.yaml text.
* Accepts a block list, a block map, and an inline flow list — the shapes
* users have actually tried. Returns the empty list when the key is absent
* or unparseable.
* @param text - raw settings.yaml content (the empty string is fine).
* @returns the configured entries in document order.
*/
function extractWebSettingsNamespaces(text) {
	if (text.trim() === "") return [];
	const inline = /(?:^|\n)\s*web_settings_namespaces\s*:\s*\[([^\]]*)\]/m.exec(text);
	if (inline !== null) {
		const entries = [];
		for (const part of inline[1].split(",")) {
			const name = stripQuotes(part);
			if (name !== "") entries.push(name);
		}
		return entries;
	}
	const lines = text.split(/\r?\n/);
	const start = lines.findIndex((line) => /^\s*web_settings_namespaces\s*:\s*(?:#.*)?$/.test(line.trim()));
	if (start < 0) return [];
	const entries = [];
	for (const line of lines.slice(start + 1)) {
		const trimmed = line.trim();
		if (trimmed === "") break;
		if (trimmed.startsWith("#")) continue;
		if (!/^\s/.test(line) && !trimmed.startsWith("-")) break;
		const name = entryOfItem(trimmed);
		if (name !== void 0) entries.push(name);
	}
	return entries;
}
//#endregion
//#region src/http.ts
/** Default body cap for readJsonBody: 64 KiB. */
const DEFAULT_JSON_BODY_MAX_BYTES = 64 * 1024;
/** Family-default JSON response headers; callers may append or override. */
const JSON_HEADERS = {
	"content-type": "application/json; charset=utf-8",
	"referrer-policy": "no-referrer"
};
/**
* Lenient bounded body reader: parse a request body as JSON, or null on an
* empty body, invalid JSON, or a body past maxBytes (default 64 KiB).
* Overflow destroys the request instead of draining the remainder (no drain
* call, matching the current repo-wide behavior); callers must not keep
* reading the request afterwards. With objectOnly, non-JSON-object payloads
* also yield null.
*/
async function readJsonBody(req, opts = {}) {
	const maxBytes = opts.maxBytes ?? DEFAULT_JSON_BODY_MAX_BYTES;
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const buffer = chunk;
		size += buffer.length;
		if (size > maxBytes) {
			req.destroy();
			return null;
		}
		chunks.push(buffer);
	}
	const text = Buffer.concat(chunks).toString("utf8");
	if (text === "") return null;
	try {
		const parsed = JSON.parse(text);
		if (opts.objectOnly && !isJsonObject(parsed)) return null;
		return parsed;
	} catch {
		return null;
	}
}
/** Whether a value is a JSON object: typeof object, not null, not an array. */
function isJsonObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/**
* Write one JSON response. Default headers are the family defaults
* (content-type and referrer-policy); caller headers are appended or
* override them.
*/
function writeJson(res, status, body, headers = {}) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		...JSON_HEADERS,
		...headers
	});
	res.end(payload);
}
//#endregion
//#region src/bridge.ts
/**
* Host-side settings bridge for the Web UI plugin group.
*
* Serves the dsh-web family settings namespaces over a same-origin HTTP pair.
* Access is loopback-only by default; deployments may opt in an authenticated
* local reverse proxy. The handlers ride the Host settings surface
* (`ctx.settings`, the SettingsForms service), which keeps the official schema
* validation, revision fencing, persistence, and event emission for free; the
* bridge only adds the allowlist gate the apiproxy normally provides and the
* namespace-to-profile-entry-id mapping the new surface does not carry. Error
* codes mirror the official RPC codes so the client controller treats
* refusals exactly like an apiproxy answer.
*/
/** Header an authenticated same-host reverse proxy replaces before forwarding. */
const WEB_UI_SETTINGS_PROXY_TOKEN_HEADER = "x-dsh-web-ui-settings-proxy-token";
/** Whether a socket address is a literal loopback peer. */
function isLoopbackAddress(address) {
	return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}
/** Whether a normalized hostname is a literal loopback authority. */
function isLoopbackHostname(hostname) {
	if (hostname === "localhost" || hostname === "[::1]") return true;
	const parts = hostname.split(".");
	return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
/** Parse one bare Host authority. */
function parseAuthority(authority) {
	if (authority.trim() !== authority) return void 0;
	const authorityMatch = authority.startsWith("[") ? /^\[[^\]]+\](?::([0-9]+))?$/.exec(authority) : /^[^:@/?#\s]+(?::([0-9]+))?$/.exec(authority);
	if (authorityMatch === null) return void 0;
	try {
		const url = new URL("http://" + authority);
		if (url.username !== "" || url.password !== "" || url.pathname !== "/" || url.search !== "" || url.hash !== "") return void 0;
		const rawPort = authorityMatch[1];
		if (rawPort !== void 0 && (String(Number(rawPort)) !== rawPort || Number(rawPort) > 65535)) return void 0;
		return {
			canonical: url.hostname.toLowerCase() + (rawPort === void 0 ? "" : ":" + rawPort),
			url
		};
	} catch {
		return;
	}
}
/** Resolve and validate the opt-in proxy policy once, when routes mount. */
function resolveBridgeAccess(access) {
	const trustedProxyHosts = /* @__PURE__ */ new Set();
	for (const entry of access?.trustedProxyHosts ?? []) {
		const parsed = parseAuthority(entry);
		if (parsed === void 0 || parsed.canonical !== entry.toLowerCase()) throw new Error("web-ui-settings: trustedProxyHosts entry " + JSON.stringify(entry) + " is not a canonical host[:port] authority");
		trustedProxyHosts.add(parsed.canonical);
	}
	const proxyToken = access?.proxyToken;
	if (trustedProxyHosts.size > 0 && (proxyToken === void 0 || proxyToken === "")) throw new Error("web-ui-settings: authenticated proxy hosts require a non-empty proxy token");
	return {
		trustedProxyHosts,
		...proxyToken === void 0 ? {} : { proxyToken }
	};
}
/** Compare the proxy token without content-dependent early exit. */
function matchesProxyToken(candidate, expected) {
	if (typeof candidate !== "string" || expected === void 0 || candidate === "" || expected === "") return false;
	const candidateBytes = Buffer.from(candidate);
	const expectedBytes = Buffer.from(expected);
	return candidateBytes.length === expectedBytes.length && timingSafeEqual(candidateBytes, expectedBytes);
}
/** Browser same-origin markers shared by direct loopback and proxy requests. */
function isSameOriginRequest(request, hostUrl) {
	if (request.headers["sec-fetch-site"] === "cross-site") return false;
	const origin = request.headers.origin;
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}
/** Hot-path trust decision over an already validated policy. */
function isTrustedBridgeRequestResolved(request, access) {
	const address = request.socket.remoteAddress;
	if (!isLoopbackAddress(address)) return false;
	const host = request.headers.host;
	if (typeof host !== "string") return false;
	const parsedHost = parseAuthority(host);
	if (parsedHost === void 0 || parsedHost.canonical !== host.toLowerCase() || !isSameOriginRequest(request, parsedHost.url)) return false;
	if (isLoopbackHostname(parsedHost.url.hostname)) return true;
	if (!access.trustedProxyHosts.has(parsedHost.canonical)) return false;
	return matchesProxyToken(request.headers[WEB_UI_SETTINGS_PROXY_TOKEN_HEADER], access.proxyToken);
}
/** The package identities one profile row declares, in resolution order. */
function entryIdentities(entry) {
	const options = entry.options;
	if (options === void 0) return [];
	const identities = [];
	if (typeof options.name === "string") identities.push(options.name);
	const config = options.config;
	if (typeof config === "object" && config !== null) {
		const plugin = config.plugin;
		if (typeof plugin === "string") identities.push(plugin);
	}
	return identities;
}
/** The profile entry id of one row, when it carries one. */
function entryIdOf(entry) {
	const id = entry.options?.id;
	return typeof id === "string" ? id : void 0;
}
/**
* The family settings namespaces one profile row serves. A standalone install
* names the family client package directly; an aggregate install names the
* `dsh-web-all/<x>` subplugin while its config points at the same client
* package. Both resolve through the allowlist's package-name table, so the
* bridge never invents a second identity mapping.
* @param entry - one profile entry.
* @returns every family settings namespace the row serves, in a stable order.
*/
function entryNamespaces(entry) {
	const found = [];
	for (const identity of entryIdentities(entry)) for (const ns of resolveNamespaceEntries(identity)) if (!found.includes(ns)) found.push(ns);
	return found;
}
/**
* The extra family settings namespaces one entry declares itself, on top of
* the one its package identity resolves to.
*
* A plugin whose Config nests several sub-namespaces under one profile row —
* the skin center declares `skin-background`, `skin-custom-theme` and
* `skin-wallpaper` — is registered by the Host as a single descriptor keyed by
* that row's entry id, with the whole Config object as its `value`. The Host
* therefore has one form for the row, but the family cards address one
* namespace each. Resolving only the first alias made the other two absent
* from the served map, so the allowlist could never intersect them in and
* every write to them was refused as `settings-not-exposed` (#1755). Reading
* the declared keys back off the descriptor's own value keeps each sub-namespace
* bound to the entry id the Host actually writes through.
*
* @param descriptor - the live descriptor of the entry's row.
* @returns the declared sub-namespaces that the allowlist recognizes, in the
*   descriptor's own key order.
*/
function declaredNamespaces(descriptor) {
	const value = descriptor.value;
	if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
	const found = [];
	for (const [key, nested] of Object.entries(value)) {
		if (typeof nested !== "object" || nested === null || Array.isArray(nested)) continue;
		if (resolveNamespaceEntry(key) !== void 0 && !found.includes(key)) found.push(key);
	}
	return found;
}
/**
* Project the live Host settings view onto the namespaces the bridge serves.
* The descriptor's `ns` is a profile entry id on the new surface, so each one
* is traced back to its family namespace through the profile row that owns it.
* @param deps - the settings surface and the profile-entry reader.
* @param options - describe options; secret redaction is the wire default and
*   is relaxed only by an in-process reader that must see what a user holds.
* @returns one entry per family namespace, keyed by that namespace.
*/
function servedNamespaces(deps, options) {
	const byId = /* @__PURE__ */ new Map();
	for (const entry of deps.entries?.() ?? []) {
		const id = entryIdOf(entry);
		if (id !== void 0) byId.set(id, entry);
	}
	const served = /* @__PURE__ */ new Map();
	for (const descriptor of deps.settings.describe(options ?? { redactSecrets: true })) {
		const ns = String(descriptor.ns);
		const owner = byId.get(ns);
		const families = owner === void 0 ? [] : [...entryNamespaces(owner), ...declaredNamespaces(descriptor)];
		if (families.length > 0) {
			for (const family of families) served.set(family, {
				descriptor,
				entryId: ns
			});
			continue;
		}
		const direct = resolveNamespaceEntry(ns);
		if (direct !== void 0) served.set(direct, {
			descriptor,
			entryId: void 0
		});
	}
	return served;
}
/** Project one served namespace onto the bridge wire view. */
function toView(ns, served) {
	const { descriptor, entryId } = served;
	return {
		ns,
		...entryId === void 0 ? {} : { entryId },
		schema: descriptor.schema,
		value: descriptor.value,
		...descriptor.base === void 0 ? {} : { base: descriptor.base },
		...descriptor.user === void 0 ? {} : { user: descriptor.user },
		...descriptor.secrets === void 0 ? {} : { secrets: descriptor.secrets.map((secret) => ({
			path: [...secret.path],
			set: secret.set
		})) },
		revision: descriptor.revision
	};
}
/** Map a Host settings failure onto the official-shaped refusal envelope. */
function failureOf(error) {
	if (error instanceof SettingsConflictError) return {
		ok: false,
		code: "settings-conflict",
		message: error.message
	};
	return {
		ok: false,
		code: "settings-rejected",
		message: error instanceof Error ? error.message : String(error)
	};
}
/**
* Build the bridge handlers. The allowlist is re-read on every call so edits
* to settings.yaml take effect without a host restart.
* @param deps - the settings surface, the settings.yaml reader, and the profile-entry reader.
* @returns the handlers.
*/
function makeBridgeHandlers(deps) {
	const allowlisted = (served) => composeAllowlist(extractWebSettingsNamespaces(deps.readSettingsYaml()), [...served.keys()]);
	return {
		async describe() {
			const served = servedNamespaces(deps);
			return {
				ok: true,
				value: {
					namespaces: allowlisted(served).map((ns) => toView(ns, served.get(ns))),
					writable: deps.settings.writable !== false
				}
			};
		},
		async mutate(request) {
			const body = request;
			if (body === null || typeof body !== "object" || typeof body.ns !== "string" || !Array.isArray(body.ops)) return {
				ok: false,
				code: "settings-rejected",
				message: "malformed bridge settings request"
			};
			const { ns } = body;
			const served = servedNamespaces(deps);
			if (!allowlisted(served).includes(ns)) return {
				ok: false,
				code: "settings-not-exposed",
				message: "settings namespace \"" + ns + "\" is not exposed to configuration clients"
			};
			const target = served.get(ns);
			const entryId = target.entryId ?? ns;
			const expectedRevision = typeof body.expectedRevision === "number" ? body.expectedRevision : void 0;
			try {
				await deps.settings.mutate(entryId, body.ops, expectedRevision);
			} catch (error) {
				return failureOf(error);
			}
			const descriptor = deps.settings.describe({ redactSecrets: true }).find((candidate) => String(candidate.ns) === entryId);
			if (descriptor === void 0) return {
				ok: false,
				code: "internal",
				message: "settings namespace \"" + ns + "\" was disposed after the mutate"
			};
			return {
				ok: true,
				value: toView(ns, {
					descriptor,
					entryId: target.entryId
				})
			};
		}
	};
}
/**
* Build the loopback-default bridge routes, optionally admitting one
* authenticated same-host reverse proxy.
* @param deps - handler dependencies.
* @param access - opt-in authenticated proxy policy.
* @returns the exact-path route registrations.
*/
function makeBridgeRoutes(deps, access) {
	const handlers = makeBridgeHandlers(deps);
	const resolvedAccess = resolveBridgeAccess(access);
	const guard = (req, res) => {
		if (!isTrustedBridgeRequestResolved(req, resolvedAccess)) {
			writeJson(res, 403, { error: "forbidden" });
			return false;
		}
		if (req.method !== "POST") {
			writeJson(res, 405, { error: "method not allowed: " + (req.method ?? "") });
			return false;
		}
		return true;
	};
	return [{
		kind: "exact",
		path: "/api/dsh-web-ui-settings/describe",
		handler: async (req, res) => {
			if (!guard(req, res)) return;
			writeJson(res, 200, await handlers.describe());
		}
	}, {
		kind: "exact",
		path: "/api/dsh-web-ui-settings/mutate",
		handler: async (req, res) => {
			if (!guard(req, res)) return;
			const body = await readJsonBody(req);
			if (body === null) {
				writeJson(res, 400, {
					ok: false,
					code: "settings-rejected",
					message: "unreadable JSON body"
				});
				return;
			}
			writeJson(res, 200, await handlers.mutate(body));
		}
	}];
}
//#endregion
//#region src/mount-once.ts
/**
* Host single-instance guard shared by the plugin family. The family bundle
* (dsh-web-all / dsh-skins) namespaces every child row id (web-ui-*), so
* the loader accepts a standalone install of the same package side by side;
* without this guard the second instance would still re-register the same
* webserver routes, tools, settings namespaces, and system-prompt sections
* and fail the boot. mountOnce makes a mount of an already-mounted package a
* no-op for as long as the first instance lives (the browser half is already
* deduped by package name in the client module host).
*
* A no-op is only safe while the holder is ALIVE. The holder can be disposed
* long after the refused mount ran its course: the Host reloads a profile by
* creating the new loader entries before the old ones are torn down (a
* plugin-manager enable/disable/install write, a settings-driven row reload,
* HMR), so the new aggregate shell entry mounts its family plugin while the
* previous entry still owns the name. Dropping that refused mount lost the
* plugin for good - the previous entry then disposed its own mount, releasing
* the name with nobody left to take it, and the family row stayed listed as
* active while its host routes 404ed (the task-board panel showed
* "board.hostError.notMounted", no degraded record appeared, and only a Host
* restart recovered it).
*
* The refused mount is therefore QUEUED, not dropped, and replayed the moment
* the holder releases the name - if the waiting fiber is still alive then. The
* single-instance guarantee is unchanged: exactly one mount is live per
* package name, and the replay re-enters the guard so a later mount still
* dedupes against it.
*
* The registry rides a global symbol so two module instances of the same
* package (npm copy vs repository link) still share one verdict. That symbol
* is a CROSS-REPOSITORY contract, not this file's private state: the four
* satellite packages (dsh-skins / dsh-pet / dsh-presets /
* dsh-community-plugins) are separate repositories carrying their own copy of
* this guard, rebuilt on their own schedule, so the value under `MOUNTED`
* must keep the shape every published copy reads (a `Set` of package names
* with `has`/`add`/`delete`). The wait queues this guard added therefore live
* under their own additive key, and the registry reads back a `Set` even when
* some other build left a different value there. Changing `MOUNTED`'s shape
* in place broke that contract once: a satellite's legacy copy created a
* `Set`, the family's new copy read it as a `Map`, and every family row
* mounted after it failed with "claims.get is not a function".
*
* cordis `ctx.effect` runs its callback immediately and treats the callback's
* return value as the fiber disposer, so the unmarker is returned, not run.
*/
/** Published cross-repository contract: package names currently mounted. */
const MOUNTED = Symbol.for("dsh-web.mounted-plugins");
/** Additive key this guard owns: refused mounts waiting for the name. */
const WAITERS = Symbol.for("dsh-web.mounted-plugins.waiters");
/**
* The shared name registry, always a `Set` whatever another build stored here:
* a foreign value (an interim shape, a hand-written global) must not take every
* family plugin down with it.
* @returns the process-wide set of mounted package names.
*/
function mountedSet() {
	const registry = globalThis;
	const existing = registry[MOUNTED];
	if (existing instanceof Set) return existing;
	const created = /* @__PURE__ */ new Set();
	registry[MOUNTED] = created;
	return created;
}
/** Queue per package name for mounts refused while a holder was alive. */
function mountWaiters() {
	const registry = globalThis;
	return registry[WAITERS] ??= /* @__PURE__ */ new Map();
}
/**
* Wrap a cordis plugin apply so the package runs at most once per process.
* The first mount registers normally and releases the name when its fiber
* disposes; a mount refused while that name is held waits for the release and
* then runs, unless its own fiber disposes first.
* @param packageName - npm package identity shared by every install source.
* @param fn - the original plugin apply.
* @returns an apply of the same shape.
*/
function mountOnce(packageName, fn) {
	const mount = (...args) => {
		const mounted = mountedSet();
		const ctx = args[0];
		if (mounted.has(packageName)) {
			const waiters = mountWaiters();
			const queue = waiters.get(packageName) ?? [];
			let alive = true;
			const pending = { run: () => {
				if (alive) mount(...args);
			} };
			ctx?.effect?.(() => () => {
				alive = false;
				const index = queue.indexOf(pending);
				if (index >= 0) queue.splice(index, 1);
			});
			queue.push(pending);
			waiters.set(packageName, queue);
			return;
		}
		mounted.add(packageName);
		ctx?.effect?.(() => () => {
			mounted.delete(packageName);
			const waiters = mountWaiters();
			const queue = waiters.get(packageName);
			if (queue === void 0) return;
			waiters.delete(packageName);
			for (const waiter of queue.splice(0)) queueMicrotask(() => {
				waiter.run();
			});
		});
		return fn(...args);
	};
	return mount;
}
//#endregion
//#region src/index.ts
/**
* Host half of the dsh-web-settings group. Mounts the settings bridge: a
* loopback-default HTTP pair that serves the family plugins' settings
* namespaces through the Host settings surface (ctx.settings, the
* SettingsForms service), gated by the user's web_settings_namespaces
* allowlist from settings.yaml (with the built-in family fallback list). An
* explicit authenticated-proxy config may admit exact same-origin Hosts
* without changing the default. Each view reports the profile entry id that
* owns the namespace so the browser half can bind the native
* ctx.configForms form; the bridge HTTP transport is the fallback.
*
* It also adopts the family settings the 0.1.7 settings subsystem left
* orphaned in the renamed legacy document: once the composition has settled,
* each family section there is written into the entry that serves its
* namespace, exactly once (see legacy-import.ts). The repair never blocks
* activation and never overwrites a field an entry's user layer holds.
*/
/** Default environment variable holding the reverse-proxy shared token. */
const DEFAULT_PROXY_TOKEN_ENV = "DSH_WEB_UI_SETTINGS_PROXY_TOKEN";
const Config = z.object({
	trustedProxyHosts: z.array(String).default([]),
	proxyTokenEnv: z.string().min(1).default(DEFAULT_PROXY_TOKEN_ENV)
});
/** Resolve the opt-in proxy token without putting its value in plugin config. */
function resolveProxyAccess(config, env = process.env) {
	const trustedProxyHosts = config?.trustedProxyHosts ?? [];
	if (trustedProxyHosts.length === 0) return { trustedProxyHosts };
	const proxyTokenEnv = config?.proxyTokenEnv ?? "DSH_WEB_UI_SETTINGS_PROXY_TOKEN";
	if (proxyTokenEnv.trim() === "") throw new Error("web-ui-settings: proxyTokenEnv must not be empty");
	const proxyToken = env[proxyTokenEnv];
	if (proxyToken === void 0 || proxyToken === "") throw new Error("web-ui-settings: trustedProxyHosts requires a non-empty " + proxyTokenEnv + " environment variable");
	return {
		trustedProxyHosts,
		proxyToken
	};
}
/** Required services before the bridge routes can mount. */
const inject = ["webServer"];
/**
* Resolve the settings YAML fallback path when the host settings surface does
* not report a usable settings document: $DSH_HOME/settings.yaml (defaulting
* to ~/.dsh/settings.yaml). Test seam: env and home are injectable.
*/
function settingsYamlFallbackPath(env = process.env, home = homedir()) {
	return join(resolveDshHome(env, home), "settings.yaml");
}
/**
* Path of the settings document the Host imported on first boot and then
* renamed: the settings surface moves `$DSH_HOME/settings.yaml` into its
* profile configuration once, so the renamed file is where a pre-0.1.7
* `web_settings_namespaces` block survives longest.
* @param env - process environment to read DSH_HOME from (test seam).
* @param home - platform home directory fallback (test seam).
* @returns the absolute path of the imported settings document.
*/
function importedSettingsYamlPath(env = process.env, home = homedir()) {
	return join(resolveDshHome(env, home), "settings.yaml.imported");
}
/** Whether one Host-reported path names a settings YAML document. */
function isSettingsDocumentPath(path) {
	const name = basename(path);
	return name === "settings.yaml" || name === "settings.yaml.imported";
}
/**
* Candidate raw settings documents, most authoritative first: the renamed
* import, then the legacy document path, then — only when it really is a
* settings document — the path the Host reports through
* `settings.documentPath`. On 0.1.7 that path is the PROFILE PATCH the native
* configuration editor edits, so it is checked rather than trusted.
* @param hostDocumentPath - `ctx.settings.documentPath`, when readable.
* @param env - process environment to read DSH_HOME from (test seam).
* @param home - platform home directory fallback (test seam).
* @returns the candidate paths in read order.
*/
function settingsYamlCandidatePaths(hostDocumentPath, env = process.env, home = homedir()) {
	const candidates = [importedSettingsYamlPath(env, home), settingsYamlFallbackPath(env, home)];
	if (hostDocumentPath !== void 0 && hostDocumentPath !== "" && isSettingsDocumentPath(hostDocumentPath) && !candidates.includes(hostDocumentPath)) candidates.push(hostDocumentPath);
	return candidates;
}
/**
* Read the first readable candidate document.
* @param candidates - candidate paths in read order.
* @returns the document text, or '' when none of them is readable.
*/
function readSettingsYamlDocument(candidates) {
	for (const path of candidates) try {
		return readFileSync(path, "utf8");
	} catch {}
	return "";
}
/**
* Read the Host profile entries the bridge resolves settings namespaces from.
* The config editor is optional: a Host that serves no editor still serves
* settings, so the bridge degrades to namespace-only views instead of failing.
* @param ctx - a context carrying service lookup.
* @returns the profile entries, or the empty list when the editor is absent.
*/
function readProfileEntries(ctx) {
	let editor;
	try {
		editor = ctx.get("configEditor");
	} catch {
		return [];
	}
	if (typeof editor !== "object" || editor === null) return [];
	const entries = editor.entries;
	if (typeof entries !== "function") return [];
	let rows;
	try {
		rows = entries.call(editor);
	} catch {
		return [];
	}
	return Array.isArray(rows) ? rows : [];
}
/**
* Mount the settings bridge when a settings surface exists (it is what the
* bridge serves, so without one there is nothing to expose).
* @param ctx - host plugin context.
* @param config - loopback-default bridge and authenticated-proxy config.
*/
const apply = mountOnce("@linxin666/dsh-client-ui-web-ui-settings", applyImpl);
function applyImpl(ctx, config) {
	const access = resolveProxyAccess(config);
	ctx.inject(["settings"], (sctx) => {
		let documentPath;
		try {
			documentPath = sctx.settings.documentPath;
		} catch {
			documentPath = void 0;
		}
		const candidates = settingsYamlCandidatePaths(documentPath);
		sctx.effect(() => {
			const disposers = makeBridgeRoutes({
				settings: sctx.settings,
				readSettingsYaml: () => readSettingsYamlDocument(candidates),
				entries: () => readProfileEntries(sctx)
			}, access).map((route) => sctx.webServer.register(route));
			return () => {
				for (const dispose of disposers) dispose();
			};
		}, "web-ui-settings: settings bridge");
	});
}
//#endregion
export { Config, DEFAULT_PROXY_TOKEN_ENV, apply, importedSettingsYamlPath, inject, isSettingsDocumentPath, readProfileEntries, readSettingsYamlDocument, resolveProxyAccess, settingsYamlCandidatePaths, settingsYamlFallbackPath };
