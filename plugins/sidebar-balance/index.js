// @yhb/dsh-plugin-sidebar-balance — host half
//
// fork 自 dsh-sidebar-balance@0.1.1（MIT，作者 zhouchengke2046）。与原版只有三处差异，都是踩坑换来的：
//
//   1. 【崩溃修复】删掉原版用 webServer.tapIndex 往 window.__DSH_BOOT__ 注入 boot row 的整段代码。
//      原版那一行的 inject 写的是 "@deepseek-ai/dsh-client-runtime"，而外壳产物
//      @deepseek-ai/dsh-web-frontend/dist/assets/index-5SrrfWpU.js（633 KB）里根本没有这个 id
//      → 条目永不激活 → 启动批次报 "web boot: 1 entry did not activate"，整页起不来
//      （2026-10-12 实测崩过一次）。浏览器半区改走标准 dsh.client 扫描——dsh-bloom-theme 走的就是这条路，
//      已在同一台机器上验证可用；代价是少一层"自托管 + 注入 boot row"的兜底。
//
//   2. 两条 API 路由改名 /api/yhb-sidebar-balance/*，与仍留在 profile 里的原包彻底隔离。
//
//   3. DeepSeek 余额在「没有开放平台 key」时回退到宿主账号钱包（ctx.get('deepseekAccount')）——
//      也就是「设置 → 账号」那一份。只有桌面端登录账号、没有 sk- key 的 profile 因此也能显示余额。
//
// 沿用原版的凭据路径与安全边界：密钥只经 ctx.credentials.resolve(ref)，不出宿主；
// 两条路由只认 loopback Host + 同源 Origin；错误文案过 redact()；宿主侧 30s TTL 缓存。

export const name = "@yhb/dsh-plugin-sidebar-balance";

/** Required host services. */
export const inject = ["webServer", "credentials"];

const DEFAULTS = {
	balanceApiKeyEnv: "DEEPSEEK_API_KEY",
	balanceBaseUrl: "https://api.deepseek.com",
	opencodeApiKeyEnv: "OPENCODE_GO_API_KEY",
	opencodeBaseUrl: "https://opencode.ai/zen/go",
	cacheMs: 30_000,
	timeoutMs: 15_000,
	accountFallback: true, // 无开放平台 key 时改读宿主账号钱包
	allowedHosts: [] // extra Hosts permitted beyond loopback
};

/**
 * Resolve a credential reference through the DSH credentials service
 * (process env, `$DSH_HOME/.credentials.yaml`, `.env` layers).
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {string} refName
 */
async function resolveKey(ctx, refName) {
	const hit = await ctx.credentials.resolve(refName);
	return hit?.value ?? null;
}

/** GET a JSON endpoint with Bearer auth and a timeout. */
async function getJSON(baseUrl, path, apiKey, timeoutMs) {
	const res = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, {
		headers: { Authorization: `Bearer ${apiKey}` },
		signal: AbortSignal.timeout(timeoutMs)
	});
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new Error(`HTTP ${res.status}: ${redact(body).slice(0, 200)}`);
	}
	return await res.json();
}

/**
 * Small TTL + in-flight cache: several open tabs never hammer the upstream.
 * @template T
 * @param {() => Promise<T>} fn
 * @param {number} ttlMs
 */
function makeCache(fn, ttlMs) {
	/** @type {{ at: number, promise: Promise<T> } | null} */
	let slot = null;
	return () => {
		const now = Date.now();
		if (slot !== null && now - slot.at < ttlMs) return slot.promise;
		const promise = fn().catch((error) => {
			if (slot?.promise === promise) slot = null;
			throw error;
		});
		slot = { at: now, promise };
		return promise;
	};
}

/** Redact likely secrets out of error text before it reaches the UI. */
function redact(message) {
	return String(message)
		.replace(/sk-[A-Za-z0-9_\-]{6,}/g, "sk-***")
		.replace(/github_pat_[A-Za-z0-9_]{10,}/gi, "github_pat_***")
		.replace(/(bearer\s+)[A-Za-z0-9_.\-]{16,}/gi, "$1***");
}

/** True only for loopback (or explicitly allowed) Hosts and same-origin. */
function isTrustedRequest(req, allowedHosts) {
	const host = String(req?.headers?.host || "");
	const origin = String(req?.headers?.origin || "");
	const loopback = ["127.0.0.1", "localhost", "[::1]", "::1"];
	const hostOk = loopback.some((h) => host === h || host.startsWith(h + ":"))
		|| allowedHosts.some((a) => host === a || host.startsWith(a + ":"));
	if (!hostOk) return false;
	if (origin !== "" && origin !== "null") {
		const ok = origin.startsWith("http://127.0.0.1")
			|| origin.startsWith("http://localhost")
			|| origin.startsWith("http://[::1]");
		if (!ok) return false;
	}
	return true;
}

/**
 * 账号钱包 → 插件余额结构。
 *
 * 宿主 `deepseekAccount.getBalance(client)` 的形状（由 cost-meter 1.8.22 的实现反推、字段一致）：
 *   { status: 'ready', value: [{ currency: 'CNY'|'USD', balance: '<字符串>' }], bonusWallets: [同形状] }
 * `value` = 充值余额，`bonusWallets` = 赠送余额。挑选规则与 cost-meter 一致：
 * 有余额的 CNY → 其他有余额的币种 → CNY → 第一个。
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @returns {Promise<object | null>} 面板可直接渲染的余额；服务缺席/未登录/形状不认识时返回 null
 */
async function accountBalance(ctx) {
	const account = typeof ctx.get === "function" ? ctx.get("deepseekAccount") : undefined;
	if (typeof account?.getBalance !== "function") return null;
	try {
		const details = await account.getBalance({
			version: "",
			locale: "zh",
			timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60
		});
		if (details === null || typeof details !== "object" || details.status !== "ready") return null;
		const walletsOf = (list) => {
			if (!Array.isArray(list)) return [];
			const out = [];
			for (const entry of list) {
				const currency = typeof entry?.currency === "string" ? entry.currency.toUpperCase() : "";
				const raw = typeof entry?.balance === "string" ? entry.balance.trim() : "";
				if (currency === "" || raw === "" || !Number.isFinite(Number(raw))) continue;
				out.push({ currency, amount: Number(raw) });
			}
			return out;
		};
		const normal = walletsOf(details.value);
		const bonus = walletsOf(details.bonusWallets);
		if (normal.length === 0 && bonus.length === 0) return null;
		const totals = new Map();
		for (const wallet of [...normal, ...bonus]) totals.set(wallet.currency, (totals.get(wallet.currency) ?? 0) + wallet.amount);
		const entries = [...totals].map(([currency, total]) => ({ currency, total }));
		const positive = entries.filter((entry) => entry.total > 0);
		const picked = positive.find((entry) => entry.currency === "CNY")
			?? positive[0]
			?? entries.find((entry) => entry.currency === "CNY")
			?? entries[0];
		if (picked === undefined) return null;
		const sumOf = (list) => list.filter((wallet) => wallet.currency === picked.currency).reduce((acc, wallet) => acc + wallet.amount, 0);
		const toppedUp = sumOf(normal);
		const granted = sumOf(bonus);
		const fmt = (n) => (Math.round(n * 100) / 100).toFixed(2);
		return {
			source: "account",
			is_available: true,
			currency: picked.currency,
			total_balance: fmt(toppedUp + granted),
			granted_balance: fmt(granted),
			topped_up_balance: fmt(toppedUp)
		};
	} catch {
		// 宿主错误可能含凭据/路径/请求内容：一律折叠成 null，由调用方给出固定文案。
		return null;
	}
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {Record<string, unknown>} rawConfig - loader entry config
 */
export function apply(ctx, rawConfig = {}) {
	const raw = { ...DEFAULTS, ...(rawConfig ?? {}) };
	const cfg = {
		...raw,
		cacheMs: Math.min(600000, Math.max(1000, Number(raw.cacheMs) || 30000)),
		timeoutMs: Math.min(60000, Math.max(2000, Number(raw.timeoutMs) || 15000)),
		accountFallback: raw.accountFallback !== false
	};

	const balanceOnce = makeCache(async () => {
		const key = await resolveKey(ctx, cfg.balanceApiKeyEnv);
		if (key !== null) {
			const body = await getJSON(cfg.balanceBaseUrl, "/user/balance", key, cfg.timeoutMs);
			const info = Array.isArray(body?.balance_infos) ? body.balance_infos[0] ?? null : null;
			return {
				source: "api-key",
				is_available: body?.is_available ?? false,
				currency: info?.currency ?? "CNY",
				total_balance: info?.total_balance ?? null,
				granted_balance: info?.granted_balance ?? null,
				topped_up_balance: info?.topped_up_balance ?? null
			};
		}
		if (cfg.accountFallback) {
			const wallet = await accountBalance(ctx);
			if (wallet !== null) return wallet;
		}
		throw new Error(`未配置 DeepSeek API key(credentials: ${cfg.balanceApiKeyEnv})，且宿主账号钱包不可用`);
	}, cfg.cacheMs);

	const opencodeOnce = makeCache(async () => {
		const key = await resolveKey(ctx, cfg.opencodeApiKeyEnv);
		if (key === null) throw new Error(`未配置 OpenCode Go key(credentials: ${cfg.opencodeApiKeyEnv})`);
		const body = await getJSON(cfg.opencodeBaseUrl, "/v1/usage", key, cfg.timeoutMs);
		return body?.usage ?? null;
	}, cfg.cacheMs);

	const jsonRoute = (loader) => async (req, res) => {
		res.setHeader("content-type", "application/json; charset=utf-8");
		res.setHeader("cache-control", "no-store");
		if (!isTrustedRequest(req, cfg.allowedHosts)) {
			res.statusCode = 403;
			res.end(JSON.stringify({ error: "forbidden" }));
			return;
		}
		try {
			res.end(JSON.stringify(await loader()));
		} catch (error) {
			res.statusCode = 502;
			res.end(JSON.stringify({ error: redact(error instanceof Error ? error.message : String(error)) }));
		}
	};

	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: "/api/yhb-sidebar-balance/balance",
		handler: jsonRoute(balanceOnce)
	}), "yhb-sidebar-balance: balance route");
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: "/api/yhb-sidebar-balance/opencode",
		handler: jsonRoute(opencodeOnce)
	}), "yhb-sidebar-balance: go usage route");
}
