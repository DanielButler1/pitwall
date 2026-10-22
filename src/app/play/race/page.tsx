import type { Metadata } from "next";
import { RaceGuessGame } from "@/components/play/race-guess";

export const metadata: Metadata = {
	title: "Guess the race",
	description: "A daily Formula 1 puzzle: name the Grand Prix from its podium in six tries, with a new clue after every wrong guess.",
};

export default function Page() {
	return <RaceGuessGame />;
}
