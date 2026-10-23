// /random/race, /random/driver, /random/constructor, /random/season: a redirect to a random
// page of that kind, picked afresh on every request.
import { completedRaces, isStart } from "@/lib/f1/dataset";
import { getDb } from "@/lib/f1/server";
import { driverCareers, constructorCareers } from "@/lib/f1/stats";

export const dynamic = "force-dynamic";

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

/** Paths to choose from: drivers and constructors with a handful of starts, so pages have something on them. */
function paths(kind: string): string[] {
	const db = getDb();
	switch (kind) {
		case "race":
			return db.races.filter((r) => db.resultsByRace.get(r.id)?.some(isStart)).map((r) => `/races/${r.year}/${r.round}`);
		case "driver":
			return [...driverCareers(db).values()].filter((c) => c.starts >= 5).map((c) => `/drivers/${c.id}`);
		case "constructor":
			return [...constructorCareers(db).values()].filter((c) => c.starts >= 5).map((c) => `/constructors/${c.id}`);
		case "season":
			return db.years.filter((y) => completedRaces(db, y).length).map((y) => `/seasons/${y}`);
		default:
			return [];
	}
}

export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
	const list = paths((await params).kind);
	if (!list.length) return new Response("Not found", { status: 404 });
	return new Response(null, { status: 307, headers: { Location: new URL(pick(list), request.url).toString(), "Cache-Control": "no-store" } });
}
