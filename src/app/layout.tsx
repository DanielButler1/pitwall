import "./globals.css";
import "flag-icons/css/flag-icons.min.css";
import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { EntityCards } from "@/components/entity-cards";
import { SiteHeader } from "@/components/site-header";
import { Toaster } from "@/components/ui/sonner";
import { getDb } from "@/lib/f1/server";
import { SITE_URL } from "@/lib/site";

const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat" });

export const metadata: Metadata = {
	metadataBase: new URL(SITE_URL),
	openGraph: { siteName: "Pitwall", type: "website" },
	title: { default: "Pitwall: Formula 1 statistics and what-ifs", template: "%s | Pitwall" },
	description: "Every Formula 1 season, race, driver and team since 1950, plus a lab to rewrite history and browse the result.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	const { meta } = getDb();
	return (
		<html lang="en" className={montserrat.variable} suppressHydrationWarning>
			<body className="min-h-dvh antialiased">
				<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
					<SiteHeader />
					{children}
					<Toaster />
					<EntityCards />
					<footer className="text-muted-foreground mt-16 border-t px-4 py-8 text-xs sm:px-6 lg:px-10">
						Data: <a className="underline" href="https://github.com/f1db/f1db">F1DB</a>
						{meta.release && ` ${meta.release.tag}`} (CC BY 4.0), seasons {meta.firstYear}–{meta.lastCompletedYear}.
						{meta.jolpica && (
							<>
								{" "}
								Lap charts, laps led and pit stops: <a className="underline" href="https://github.com/jolpica/jolpica-f1">Jolpica F1</a> (free
								non-commercial data dump{meta.jolpica.dumpDate && ` of ${meta.jolpica.dumpDate}`}, laps since {meta.jolpica.lapsFrom}, pit stops
								since {meta.jolpica.pitStopsFrom}).
							</>
						)}{" "}
						Not affiliated with Formula 1.
					</footer>
				</ThemeProvider>
			</body>
		</html>
	);
}
