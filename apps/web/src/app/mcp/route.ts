// The MCP endpoint (Streamable HTTP, stateless): connect ChatGPT, Claude or any MCP client to https://<site>/mcp.
// The tools are in src/lib/mcp/server.ts. Public and read-only, so it needs no sign-in.

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createPitwallServer } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const maxDuration = 30;

// browser-based clients (e.g. the MCP Inspector) call it cross-origin
const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
	"Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version",
};

async function handle(request: Request): Promise<Response> {
	// someone opening the address in a browser gets the page that explains it
	const accept = request.headers.get("accept") ?? "";
	if (request.method === "GET" && accept.includes("text/html") && !accept.includes("text/event-stream")) {
		return Response.redirect(new URL("/ai", request.url), 307);
	}
	const server = createPitwallServer();
	const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
	await server.connect(transport);
	const response = await transport.handleRequest(request);
	const headers = new Headers(response.headers);
	for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export { handle as GET, handle as POST, handle as DELETE };

export function OPTIONS() {
	return new Response(null, { status: 204, headers: CORS });
}
