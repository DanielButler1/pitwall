import type { Metadata } from "next";
import { HigherLowerGame } from "@/components/play/higher-lower";

export const metadata: Metadata = {
	title: "Higher or lower",
	description: "A daily Formula 1 game: does the next driver or constructor have more wins, poles, starts, podiums or laps led? Ten rounds a day, or play endless.",
};

export default function Page() {
	return <HigherLowerGame />;
}
