import type { Metadata } from "next";
import { FantasyGame } from "@/components/play/fantasy";

export const metadata: Metadata = {
	title: "Fantasy: Through the Eras",
	description: "Draft Formula 1 driver-seasons and a constructor from any era under a budget, scored against what really happened, then race them in a dream championship.",
};

export default function Page() {
	return <FantasyGame />;
}
