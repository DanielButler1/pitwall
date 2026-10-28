import { HomePage } from "@/components/pages/home";
import { onThisDayView } from "@pitwall/core/f1/diary";
import { milestoneWatch } from "@pitwall/core/f1/milestones";
import { getDb, getFactIndex } from "@/lib/server";
import { homeView } from "@pitwall/core/f1/views";
import { onThisDayFacts, raceEntries, seasonFacts, upcomingFacts } from "@pitwall/core/f1/race-facts";

// "On this day" follows the date (UTC), so the page is rebuilt every hour rather than only at deploy.
export const revalidate = 3600;

export default function Page() {
	const now = new Date();
	const db = getDb();
	const index = getFactIndex();
	const view = homeView(db);
	const latest = view.latestRace && db.racesByYear.get(view.latestRace.race.year)?.find((r) => r.round === view.latestRace!.race.round);
	return (
		<HomePage
			view={view}
			milestones={milestoneWatch(db)}
			onThisDay={onThisDayView(db, now.getUTCMonth() + 1, now.getUTCDate())}
			upcoming={upcomingFacts(db, 4)}
			facts={{
				latest: latest ? raceEntries(db, index, latest.id) : [],
				season: view.titleFight ? seasonFacts(db, index, view.lastYear, 4) : [],
				onThisDay: onThisDayFacts(db, index, now.getUTCMonth() + 1, now.getUTCDate(), 3),
			}}
		/>
	);
}
