import type { Metadata } from "next";
import { TermsPage } from "@/components/pages/legal";

export const metadata: Metadata = {
	title: "Terms of use",
	description: "The terms for using Pitwall's website, AI server and Android app.",
};

export default function Page() {
	return <TermsPage />;
}
