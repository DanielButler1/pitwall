import type { Metadata } from "next";
import { ChainGame } from "@/components/play/chain";

export const metadata: Metadata = {
	title: "Teammate chain",
	description: "A daily Formula 1 puzzle: link two drivers through team-mates in as few links as possible.",
};

export default function Page() {
	return <ChainGame />;
}
