import type { Metadata } from "next";
import { SeasonGuessGame } from "@/components/play/season-guess";

export const metadata: Metadata = {
	title: "Guess the season",
	description: "A daily Formula 1 puzzle: name the championship season in six tries, with a new clue after every wrong guess.",
};

export default function Page() {
	return <SeasonGuessGame />;
}
