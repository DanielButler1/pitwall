// The data sources a build uses, pinned in data/sources.json:
//   { "f1db": "<F1DB release tag>", "jolpica": "<Jolpica dump date>" }
// Builds download exactly that F1DB release; the Jolpica link is a short-lived signed URL,
// so builds take the newest dump and the pinned date only records when it last changed.
// scripts/check-data-updates.mjs moves the pins forward.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const sourcesFile = join(root, "data", "sources.json");

export const readSources = () => JSON.parse(readFileSync(sourcesFile, "utf8"));
export const writeSources = (s) => writeFileSync(sourcesFile, JSON.stringify(s, null, "\t") + "\n");

const readJson = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null);
/** What is in ./f1db and ./jolpica right now. */
export const localF1db = () => readJson(join(root, "f1db", "f1db-release.json"))?.tag ?? null;
export const localJolpica = () => readJson(join(root, "jolpica", "jolpica-dump.json"))?.dumpDate ?? null;

const headers = { "User-Agent": "pitwall-data-check", Accept: "application/vnd.github+json" };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

export async function latestF1db() {
	const res = await fetch("https://api.github.com/repos/f1db/f1db/releases/latest", { headers });
	if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
	return (await res.json()).tag_name;
}

/** The date of the newest free Jolpica dump, read from its redirect without downloading it. */
export async function latestJolpica() {
	const res = await fetch("https://api.jolpi.ca/data/dumps/download/delayed/", { redirect: "manual", headers: { "User-Agent": headers["User-Agent"] } });
	const date = res.headers.get("location")?.match(/dumps\/(\d{4}-\d{2}-\d{2})\//)?.[1];
	if (!date) throw new Error(`Couldn't find the Jolpica dump date (HTTP ${res.status})`);
	return date;
}
