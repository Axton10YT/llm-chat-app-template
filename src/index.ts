/**
 * LLM Chat Application
 * Uses Cloudflare AI REST API (not Workers AI binding)
 */
import { Env, ChatMessage } from "./types";

const MODEL_ID = "@anthropic/claude-3-5-haiku";
const SYSTEM_PROMPT =
	"You are a helpful, friendly assistant. Provide concise and accurate responses. Follow the user's requests at all times.";

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/api/chat") {
			if (request.method === "POST") {
				return handleChatRequest(request, env);
			}
			return new Response("Method not allowed", { status: 405 });
		}

		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;

async function handleChatRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const { messages = [] } = (await request.json()) as {
			messages: ChatMessage[];
		};

		if (!messages.some((msg) => msg.role === "system")) {
			messages.unshift({ role: "system", content: SYSTEM_PROMPT });
		}

		const response = await fetch(
			`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/run/${MODEL_ID}`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${env.CF_API_TOKEN}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					messages,
					max_tokens: 1024,
					stream: true,
				}),
			},
		);

		if (!response.ok) {
			const err = await response.text();
			console.error("Cloudflare AI error:", err);
			return new Response(JSON.stringify({ error: err }), {
				status: response.status,
				headers: { "content-type": "application/json" },
			});
		}

		return new Response(response.body, {
			headers: {
				"content-type": "text/event-stream; charset=utf-8",
				"cache-control": "no-cache",
				connection: "keep-alive",
			},
		});
	} catch (error) {
		console.error("Error processing chat request:", error);
		return new Response(
			JSON.stringify({ error: "Failed to process request" }),
			{
				status: 500,
				headers: { "content-type": "application/json" },
			},
		);
	}
}
