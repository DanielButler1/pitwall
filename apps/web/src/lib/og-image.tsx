import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { SITE_URL } from "./site";

/**
 * The picture shown when a page is shared (WhatsApp, Discord, iMessage, X) or in some search results: the logo,
 * what the page is, and a row of its numbers. Each page folder has an opengraph-image.tsx that calls this; like the
 * pages, the current season's are built at deploy time and the rest the first time they're asked for.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const RED = "#dc2626";
const MUTED = "#71717a";

const font = (file: string, weight: 400 | 600 | 700) => ({
	name: "Montserrat",
	weight,
	style: "normal" as const,
	data: readFileSync(join(process.cwd(), "assets", "fonts", `Montserrat-${file}.ttf`)),
});
let fonts: ReturnType<typeof font>[] | undefined;

const svg = (text: string) => `data:image/svg+xml;base64,${Buffer.from(text).toString("base64")}`;
const logo = () => svg(readFileSync(join(process.cwd(), "src", "app", "icon.svg"), "utf8"));

// Resolved like an import, so it works however node_modules is laid out.
const flags = join(createRequire(join(process.cwd(), "package.json")).resolve("flag-icons/package.json"), "..", "flags", "4x3");
/** A country's flag (ISO alpha-2) as an image, or undefined when there's none. */
function flag(iso: string | null | undefined): string | undefined {
	if (!iso) return undefined;
	try {
		return svg(readFileSync(join(flags, `${iso.toLowerCase()}.svg`), "utf8"));
	} catch {
		return undefined;
	}
}

/** One of the numbers along the bottom: "Wins" 105, with a note under it. */
export type OgStat = { label: string; value: string | number; note?: string | null };

export function ogImage({
	section,
	title,
	detail,
	flag: iso,
	stats = [],
}: {
	/** What kind of page this is, e.g. "Driver". */
	section?: string;
	title: string;
	detail?: string | null;
	/** ISO alpha-2 of a flag to show before the title. */
	flag?: string | null;
	/** Up to four numbers along the bottom. */
	stats?: OgStat[];
}) {
	fonts ??= [font("Regular", 400), font("SemiBold", 600), font("Bold", 700)];
	const flagSrc = flag(iso);
	// a flag takes about four letters' room
	const length = title.length + (flagSrc ? 4 : 0);
	const titleSize = length > 46 ? 58 : length > 28 ? 68 : 80;
	const shown = stats.slice(0, 4);
	return new ImageResponse(
		(
			<div
				style={{
					width: "100%",
					height: "100%",
					display: "flex",
					flexDirection: "column",
					padding: "60px 72px",
					background: "linear-gradient(135deg, #ffffff 0%, #ffffff 52%, #fee2e2 100%)",
					color: "#09090b",
					fontFamily: "Montserrat",
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 18 }}>
					{/* eslint-disable-next-line @next/next/no-img-element -- rendered to a PNG, not a page */}
					<img src={logo()} width={64} height={64} alt="" />
					<div style={{ display: "flex", flexDirection: "column" }}>
						<span style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.04em" }}>Pitwall</span>
						<span style={{ fontSize: 19, fontWeight: 400, color: MUTED, marginTop: 2 }}>Formula 1 statistics since 1950</span>
					</div>
					<span style={{ marginLeft: "auto", fontSize: 24, fontWeight: 600, color: "#52525b" }}>{new URL(SITE_URL).host}</span>
				</div>

				<div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
					{section && <span style={{ fontSize: 28, fontWeight: 600, color: RED, letterSpacing: "-0.02em" }}>{section}</span>}
					<div style={{ display: "flex", alignItems: "center", marginTop: 14 }}>
						{flagSrc && (
							// eslint-disable-next-line @next/next/no-img-element -- rendered to a PNG, not a page
							<img
								src={flagSrc}
								width={Math.round(titleSize * 0.8)}
								height={Math.round(titleSize * 0.6)}
								alt=""
								style={{ marginRight: 24, borderRadius: 6, boxShadow: "0 0 0 1px rgba(0,0,0,0.08)" }}
							/>
						)}
						<span style={{ fontSize: titleSize, fontWeight: 700, letterSpacing: "-0.055em", lineHeight: 1.04, maxWidth: flagSrc ? 940 : 1000 }}>{title}</span>
					</div>
					{detail && <span style={{ fontSize: 28, fontWeight: 400, color: "#52525b", lineHeight: 1.35, marginTop: 22, maxWidth: 960 }}>{detail}</span>}
				</div>

				{shown.length > 0 && (
					<div style={{ display: "flex", marginTop: 40, paddingTop: 24, borderTop: "2px solid #e4e4e7" }}>
						{shown.map((s, i) => {
							const value = String(s.value);
							return (
								<div
									key={s.label}
									style={{
										display: "flex",
										flexDirection: "column",
										flex: 1,
										minWidth: 0,
										paddingLeft: i === 0 ? 0 : 24,
										marginLeft: i === 0 ? 0 : 24,
										borderLeft: i === 0 ? "none" : "2px solid #e4e4e7",
									}}
								>
									<span style={{ fontSize: 18, fontWeight: 600, color: MUTED }}>{s.label}</span>
									<span style={{ fontSize: value.length > 12 ? 24 : value.length > 8 ? 28 : 36, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.1, marginTop: 6 }}>
										{value}
									</span>
									{s.note && <span style={{ fontSize: 17, color: MUTED, marginTop: 4 }}>{s.note}</span>}
								</div>
							);
						})}
					</div>
				)}
			</div>
		),
		{ ...OG_SIZE, fonts },
	);
}

const num = (n: number) => n.toLocaleString("en-GB");
export { num as ogNumber };
/** "1950–1955", or the one year. */
export const ogYears = (years: [number, number] | null) => (!years ? null : years[0] === years[1] ? `${years[0]}` : `${years[0]}–${years[1]}`);
