/**
 * Geometry Dash protocol response parser / transformer utilities.
 *
 * GD uses a simple text-based protocol:
 *   - Key-value pairs separated by ':'  (e.g. "1:levelID:2:name:...")
 *   - Multiple records separated by '|'
 *   - Response sections separated by '#'
 */

/**
 * Filter hidden level IDs out of a getGJLevels21 response.
 * Response format: levelsStr#creatorsStr#songsStr#pageInfo#hash
 * levelsStr is '|'-separated level entries, each a ':'-separated k:v string.
 */
export function filterLevelsResponse(responseText: string, hiddenIds: Set<string>): string {
	if (!responseText || responseText === "-1") return responseText;

	const hashIdx = responseText.indexOf("#");
	const levelsPart = hashIdx !== -1 ? responseText.slice(0, hashIdx) : responseText;
	const suffix = hashIdx !== -1 ? responseText.slice(hashIdx) : "";

	const levels = levelsPart.split("|").filter(Boolean);
	const filtered = levels.filter((levelStr) => {
		const fields = levelStr.split(":");
		const idIdx = fields.indexOf("1");
		if (idIdx === -1 || idIdx + 1 >= fields.length) return true;
		return !hiddenIds.has(fields[idIdx + 1]);
	});

	return filtered.join("|") + suffix;
}

/**
 * Inject mod level into a getGJUserInfo20 or getGJUsers20 response.
 * Looks up account ID (key 16) in the modMap and sets role (key 17).
 * Handles both single-user (getGJUserInfo20) and multi-user (getGJUsers20) formats.
 */
export function injectModLevel(responseText: string, modMap: Map<string, number>): string {
	if (!responseText || responseText === "-1") return responseText;

	// getGJUsers20 has '#pageInfo#hash' suffix; getGJUserInfo20 does not
	const hashIdx = responseText.indexOf("#");
	const usersPart = hashIdx !== -1 ? responseText.slice(0, hashIdx) : responseText;
	const suffix = hashIdx !== -1 ? responseText.slice(hashIdx) : "";

	const entries = usersPart.split("|").filter(Boolean);
	const processed = entries.map((entry) => processUserEntry(entry, modMap));
	return processed.join("|") + suffix;
}

function processUserEntry(entry: string, modMap: Map<string, number>): string {
	const fields = entry.split(":");

	const acctIdx = fields.indexOf("16");
	if (acctIdx === -1 || acctIdx + 1 >= fields.length) return entry;

	const accountId = fields[acctIdx + 1];
	const modLevel = modMap.get(accountId);
	if (modLevel === undefined) return entry;

	const roleIdx = fields.indexOf("17");
	if (roleIdx !== -1 && roleIdx + 1 < fields.length) {
		fields[roleIdx + 1] = String(modLevel);
	} else {
		fields.push("17", String(modLevel));
	}

	return fields.join(":");
}

/** Extract levelID from a GD form-encoded request body */
export function extractLevelId(body: string): string | null {
	return new URLSearchParams(body).get("levelID");
}
