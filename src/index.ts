/**
 * Geometry Dash Private Server (GDPS) — Cloudflare Worker
 *
 * Proxies all GD protocol requests to boomlings.com, then:
 *   - Filters "hidden" levels from search / download results
 *   - Injects custom mod status for designated account IDs
 *
 * Admin panel is served at / and the REST API lives at /admin/api/*.
 */
import { Env } from "./types";
import { filterLevelsResponse, injectModLevel, extractLevelId } from "./gdparse";

const GD_BASE = "https://www.boomlings.com/database";

const JSON_CORS: HeadersInit = {
	"Content-Type": "application/json",
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
	async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === "OPTIONS") {
			return new Response(null, { headers: JSON_CORS });
		}

		if (url.pathname.startsWith("/admin/api/")) {
			return handleAdminAPI(request, env, url);
		}

		if (url.pathname.startsWith("/database/")) {
			return proxyGD(request, env, url);
		}

		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;

// ---------------------------------------------------------------------------
// GD proxy
// ---------------------------------------------------------------------------

async function proxyGD(request: Request, env: Env, url: URL): Promise<Response> {
	const endpoint = url.pathname.slice("/database/".length);
	const body = await request.text();

	const upstream = await fetch(`${GD_BASE}/${endpoint}`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body,
	});

	let text = await upstream.text();

	if (endpoint === "getGJLevels21.php") {
		text = await applyLevelFilter(text, env);
	} else if (endpoint === "downloadGJLevel22.php") {
		text = await applyDownloadBlock(text, body, env);
	} else if (endpoint === "getGJUserInfo20.php" || endpoint === "getGJUsers20.php") {
		text = await applyModInjection(text, env);
	}

	return new Response(text, {
		status: upstream.status,
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}

async function applyLevelFilter(text: string, env: Env): Promise<string> {
	if (text === "-1") return text;
	const rows = await env.DB.prepare("SELECT level_id FROM hidden_levels").all<{ level_id: string }>();
	if (!rows.results?.length) return text;
	const hiddenIds = new Set(rows.results.map((r) => r.level_id));
	return filterLevelsResponse(text, hiddenIds);
}

async function applyDownloadBlock(text: string, body: string, env: Env): Promise<string> {
	const levelId = extractLevelId(body);
	if (!levelId) return text;
	const row = await env.DB.prepare("SELECT 1 FROM hidden_levels WHERE level_id = ?")
		.bind(levelId)
		.first();
	return row ? "-1" : text;
}

async function applyModInjection(text: string, env: Env): Promise<string> {
	if (text === "-1") return text;
	const rows = await env.DB.prepare("SELECT account_id, mod_level FROM mod_users").all<{
		account_id: string;
		mod_level: number;
	}>();
	if (!rows.results?.length) return text;
	const modMap = new Map(rows.results.map((r) => [r.account_id, r.mod_level]));
	return injectModLevel(text, modMap);
}

// ---------------------------------------------------------------------------
// Admin API
// ---------------------------------------------------------------------------

function authorized(request: Request, env: Env): boolean {
	const header = request.headers.get("Authorization") ?? "";
	const key = header.startsWith("Bearer ") ? header.slice(7) : header;
	return !!env.ADMIN_KEY && key === env.ADMIN_KEY;
}

function ok(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), { status, headers: JSON_CORS });
}

async function handleAdminAPI(request: Request, env: Env, url: URL): Promise<Response> {
	if (!authorized(request, env)) return ok({ error: "Unauthorized" }, 401);

	const path = url.pathname.slice("/admin/api/".length);
	const method = request.method;

	// ---- Hidden levels ----
	if (path === "levels" && method === "GET") {
		const { results } = await env.DB.prepare(
			"SELECT level_id, added_at FROM hidden_levels ORDER BY added_at DESC",
		).all();
		return ok(results);
	}

	if (path === "levels/hide" && method === "POST") {
		const { levelId } = (await request.json()) as { levelId: string };
		if (!levelId) return ok({ error: "levelId required" }, 400);
		await env.DB.prepare("INSERT OR IGNORE INTO hidden_levels (level_id) VALUES (?)").bind(String(levelId)).run();
		return ok({ ok: true });
	}

	if (path === "levels/unhide" && method === "POST") {
		const { levelId } = (await request.json()) as { levelId: string };
		if (!levelId) return ok({ error: "levelId required" }, 400);
		await env.DB.prepare("DELETE FROM hidden_levels WHERE level_id = ?").bind(String(levelId)).run();
		return ok({ ok: true });
	}

	// ---- Mod users ----
	if (path === "mods" && method === "GET") {
		const { results } = await env.DB.prepare(
			"SELECT account_id, mod_level, added_at FROM mod_users ORDER BY added_at DESC",
		).all();
		return ok(results);
	}

	if (path === "mods/add" && method === "POST") {
		const { accountId, modLevel = 1 } = (await request.json()) as { accountId: string; modLevel?: number };
		if (!accountId) return ok({ error: "accountId required" }, 400);
		await env.DB.prepare("INSERT OR REPLACE INTO mod_users (account_id, mod_level) VALUES (?, ?)")
			.bind(String(accountId), Number(modLevel))
			.run();
		return ok({ ok: true });
	}

	if (path === "mods/remove" && method === "POST") {
		const { accountId } = (await request.json()) as { accountId: string };
		if (!accountId) return ok({ error: "accountId required" }, 400);
		await env.DB.prepare("DELETE FROM mod_users WHERE account_id = ?").bind(String(accountId)).run();
		return ok({ ok: true });
	}

	// ---- Username → account ID lookup (proxies to boomlings) ----
	if (path === "lookup" && method === "GET") {
		const username = url.searchParams.get("username");
		if (!username) return ok({ error: "username required" }, 400);

		const res = await fetch(`${GD_BASE}/getGJUsers20.php`, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: `str=${encodeURIComponent(username)}&secret=Wmfd2893gb7`,
		});
		const text = await res.text();
		if (text === "-1") return ok({ error: "User not found" }, 404);

		const entry = text.split("#")[0].split("|")[0];
		const fields = entry.split(":");
		const get = (key: string) => {
			const i = fields.indexOf(key);
			return i !== -1 ? fields[i + 1] : null;
		};
		return ok({ username: get("1"), playerID: get("2"), accountID: get("16") });
	}

	return ok({ error: "Not found" }, 404);
}
