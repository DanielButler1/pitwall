import { HomePage } from "@/components/pages/home";
import { onThisDayView } from "@/lib/f1/diary";
import { milestoneWatch } from "@/lib/f1/milestones";
import { getDb } from "@/lib/f1/server";
import { homeView } from "@/lib/f1/views";

// "On this day" follows the date (UTC), so the page is rebuilt every hour rather than only at deploy.
export const revalidate = 3600;

export default function Page() {
	const now = new Date();
	return (
		<HomePage
			view={homeView(getDb())}
			milestones={milestoneWatch(getDb())}
			onThisDay={onThisDayView(getDb(), now.getUTCMonth() + 1, now.getUTCDate())}
		/>
	);
}
