/**
 * Type definitions for the LLM chat application.
 */
export interface Env {
	/**
	 * Workers AI binding — routes to external providers via AI Gateway.
	 */
	AI: Ai;

	/**
	 * Your AI Gateway ID (from the gateway URL in the dashboard).
	 */
	CF_GATEWAY_ID: string;

	/**
	 * Your AI Gateway auth token (cfut_... key from gateway settings).
	 */
	CF_AIG_TOKEN: string;

	/**
	 * Static assets binding.
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
