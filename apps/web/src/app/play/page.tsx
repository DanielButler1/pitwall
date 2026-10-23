import type { Metadata } from "next";
import { PlayHub } from "@/components/play/hub";

export const metadata: Metadata = { title: "Play", description: "Daily Formula 1 puzzles and games built on seventy-odd years of results." };

export default function PlayPage() {
	return <PlayHub />;
}
