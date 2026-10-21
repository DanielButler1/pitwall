// Compact global search index (~80 KB, ~24 KB gzipped). The header search reads the static copy in
// public/data/search-index.json (scripts/build-client-data.ts); this route is its fallback.
import { getDb } from "@/lib/f1/server";
import { searchIndex } from "@/lib/f1/views";

export const dynamic = "force-static";

export function GET() {
	return Response.json(searchIndex(getDb()));
}
