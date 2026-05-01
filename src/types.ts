/**
 * Type definitions for the LLM chat application.
 */
export interface Env {
	/**
	 * Cloudflare Account ID for AI REST API calls.
	 */
	CF_ACCOUNT_ID: string;

	/**
	 * Cloudflare API Token with AI permissions.
	 */
	CF_API_TOKEN: string;

	/**
	 * Binding for static assets.
	 */
	ASSETS: { fetch: (request: Request) => Promise<Response> };
}

/**
 * Represents a chat message.
 */
export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}
