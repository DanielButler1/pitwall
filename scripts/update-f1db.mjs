// Downloads an F1DB release (split JSON) into ./f1db for scripts/build-data.mjs.
// scripts/prepare-data.mjs runs it with the tag pinned in data/sources.json.
//
//   node scripts/update-f1db.mjs            (latest stable release)
//   node scripts/update-f1db.mjs v2026.17.0 (a specific tag)

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dest = join(root, "f1db");
const tag = process.argv[2];
const ASSET = "f1db-json-splitted.zip";

const headers = { "User-Agent": "pitwall-f1db-updater", Accept: "application/vnd.github+json" };
const api = tag
	? `https://api.github.com/repos/f1db/f1db/releases/tags/${tag}`
	: "https://api.github.com/repos/f1db/f1db/releases/latest";

const res = await fetch(api, { headers });
if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
const release = await res.json();
const asset = release.assets?.find((a) => a.name === ASSET);
if (!asset) throw new Error(`Release ${release.tag_name} has no ${ASSET}`);

console.log(`Downloading F1DB ${release.tag_name} (${(asset.size / 1024 / 1024).toFixed(1)} MB)…`);
const zip = await fetch(asset.browser_download_url, { headers: { "User-Agent": headers["User-Agent"] } });
if (!zip.ok) throw new Error(`Download failed: ${zip.status}`);
const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
let count = 0;
for (const [path, bytes] of Object.entries(files)) {
	const name = path.split("/").pop();
	if (!name?.endsWith(".json")) continue;
	writeFileSync(join(dest, name), bytes);
	count++;
}
writeFileSync(
	join(dest, "f1db-release.json"),
	JSON.stringify({ sourceRepo: "f1db/f1db", tag: release.tag_name, publishedAt: release.published_at, downloadedAt: new Date().toISOString() }, null, 2),
);
console.log(`Installed ${count} files into ${dest}`);
