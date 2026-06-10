export interface Env {
	/** D1 database for hidden levels and mod users */
	DB: D1Database;
	/** Secret admin key for the management panel */
	ADMIN_KEY: string;
	/** Static assets binding (serves the admin panel) */
	ASSETS: { fetch: (request: Request) => Promise<Response> };
}
