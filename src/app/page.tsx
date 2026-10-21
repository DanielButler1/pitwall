import { HomePage } from "@/components/pages/home";
import { milestoneWatch } from "@/lib/f1/milestones";
import { getDb } from "@/lib/f1/server";
import { homeView } from "@/lib/f1/views";

export default function Page() {
	return <HomePage view={homeView(getDb())} milestones={milestoneWatch(getDb())} />;
}
