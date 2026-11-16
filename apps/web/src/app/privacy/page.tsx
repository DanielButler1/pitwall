import type { Metadata } from "next";
import { PrivacyPage } from "@/components/pages/legal";

export const metadata: Metadata = {
	title: "Privacy policy",
	description: "What Pitwall's website, AI server and Android app collect: no accounts, analytics or tracking cookies.",
};

export default function Page() {
	return <PrivacyPage />;
}
