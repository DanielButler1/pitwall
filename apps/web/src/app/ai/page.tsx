import type { Metadata } from "next";
import { completedRaces } from "@pitwall/core/f1/dataset";
import { recordIndex } from "@pitwall/core/f1/records";
import { AiPage } from "@/components/pages/ai";
import { getDb } from "@/lib/server";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
	title: "Use Pitwall with ChatGPT, Claude and other AI assistants",
	description: "Connect ChatGPT, Claude or any MCP-compatible AI assistant to Pitwall and ask it anything about Formula 1 history since 1950.",
};

export default function Page() {
	const db = getDb();
	const { meta } = db;
	// next season's calendar is in the data before it has run, so count seasons with a race run
	const raced = db.years.filter((y) => completedRaces(db, y).length);
	return (
		<AiPage
			view={{
				endpoint: `${SITE_URL}/mcp`,
				firstYear: meta.firstYear,
				lastYear: raced[raced.length - 1] ?? meta.lastCompletedYear,
				races: raced.reduce((n, y) => n + completedRaces(db, y).length, 0),
				drivers: db.resultsByDriver.size,
				records: recordIndex().length,
				f1dbRelease: meta.release?.tag ?? null,
				jolpica: meta.jolpica ? { dumpDate: meta.jolpica.dumpDate, lapsFrom: meta.jolpica.lapsFrom, pitStopsFrom: meta.jolpica.pitStopsFrom } : null,
			}}
		/>
	);
}
