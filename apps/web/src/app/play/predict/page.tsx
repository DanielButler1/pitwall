import type { Metadata } from "next";
import { PredictGame } from "@/components/play/predict";

export const metadata: Metadata = {
	title: "Race prediction",
	description: "A daily Formula 1 puzzle: a historical race's starting grid. Predict the top six and the fastest lap, then see how it really finished.",
};

export default function Page() {
	return <PredictGame />;
}
