/**
 * LLM Chat Application
 * Uses Cloudflare's unified AI inference layer with authenticated AI Gateway.
 */
import { Env, ChatMessage } from "./types";

const MODEL_ID = "anthropic/claude-sonnet-4-5";

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

		const gatewayId = env.CF_GATEWAY_ID || "default";
		const gatewayOptions: Record<string, unknown> = { id: gatewayId };
		if (env.CF_AIG_TOKEN) {
			gatewayOptions.authorization = env.CF_AIG_TOKEN;
		}

		const stream = await env.AI.run(
			MODEL_ID,
			{
				messages,
				max_tokens: 1024,
				stream: true,
			},
			{ gateway: gatewayOptions },
		);

		return new Response(stream, {
			headers: {
				"content-type": "text/event-stream; charset=utf-8",
				"cache-control": "no-cache",
				connection: "keep-alive",
			},
		});
	} catch (error) {
		console.error("Error processing chat request:", error);
		const message = error instanceof Error ? error.message : String(error);
		return new Response(
			JSON.stringify({ error: message }),
			{
				status: 500,
				headers: { "content-type": "application/json" },
			},
		);
	}
}
