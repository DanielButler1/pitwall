# Race notes

What neither F1DB nor Jolpica records, entered by hand: safety car, virtual safety car and red flag laps, each driver's tyres stint by stint, the compounds Pirelli brought, and the weather. One file per season (`2025.json`), one entry per round. Everything is optional: enter what you know, and the site shows what's there.

```json
{
	"21": {
		"weather": "wet",
		"neutralised": [
			{ "type": "SC", "from": 1, "to": 4 },
			{ "type": "VSC", "from": 28, "to": 28 },
			{ "type": "SC", "from": 29, "to": 32 },
			{ "type": "RF", "lap": 33 }
		],
		"compounds": { "H": "C2", "M": "C3", "S": "C4" },
		"tyres": {
			"VER": "I I",
			"OCO": "I I",
			"NOR": "I I I"
		},
		"sources": ["https://en.wikipedia.org/wiki/2024_S%C3%A3o_Paulo_Grand_Prix"],
		"note": "anything for yourself; not shown"
	}
}
```

(The tyres here are made up to show the format.)

- **`weather`**: `dry`, `wet` (the race was run in wet conditions) or `mixed` (it changed during the race).
- **`neutralised`**: in race order.
  - `SC` / `VSC` `from`–`to`: the laps it was out on, counted like the lap chart. A start behind the safety car is `"from": 1`. It goes in at the end of `to`.
  - `RF`: the lap the red flag came out on.
  - A VSC that turns into a safety car can share its last lap with the safety car's first.
- **`compounds`**: Pirelli's three for the weekend, from hardest. Pirelli named them C0 to C6 from 2019; leave this out before then, or if you don't know.
- **`tyres`**: a driver's compounds in order, one per stint, separated by spaces:
  - The codes are `HS` hypersoft, `US` ultrasoft, `SS` supersoft, `S` soft, `M` medium, `H` hard, `SH` superhard, `I` intermediate and `W` wet. `?` means a stint you don't know.
  - Use the 2011–18 names as they were (e.g. 2018 Abu Dhabi had `HS`/`US`/`SS`); since 2019 it's just `S`/`M`/`H`.
  - Name drivers by their three-letter code (`VER`), car number (`"33"`) or F1DB id (`max-verstappen`).
- **`sources`**: where it came from, for checking later. It's not shown on the site.

## Commands

From `apps/web`:

```bash
node scripts/race-notes.mjs template 2026 16 --add   # add a race to 2026.json with every driver filled in:
                                                       # one "?" per stint, counted from the pit stops
node scripts/race-notes.mjs check                    # check everything, and list what's covered per season
node scripts/race-notes.mjs missing 2026             # races of a season with no notes yet
```

`template` without `--add` just prints the entry. Replace the `?`s and `C?`s, and delete the fields you don't know (`"weather": null` is fine).

## Checks

The build (and `check`) fails on anything that can't be right:
- a round that doesn't exist, or has no results yet;
- a lap past the end of the race;
- a VSC before 2015;
- two neutralisations overlapping;
- a driver who wasn't in the race;
- an unknown tyre code.

It only warns when a driver's number of stints doesn't match their pit stops. A red flag lets drivers change tyres without a stop, and Jolpica occasionally misses a stop.

## What's in here already

`node scripts/import-race-notes.mjs` seeded the files from Wikipedia. It only fills fields a round doesn't have, so it never overwrites anything typed by hand, and re-running it is safe. `--dry` reports without writing.
- **Red flags, 1971 on:** from [List of red-flagged Formula One races](https://en.wikipedia.org/wiki/List_of_red-flagged_Formula_One_races).
- **Safety cars 1973–2021 and VSCs 2015–2021:** from the deployment tables in the [Safety car article as of February 2022](https://en.wikipedia.org/w/index.php?title=Safety_car&oldid=1072024350). They were removed from the article after that.
  - The tables have gaps. A race with no safety car here may still have had one; a race with none should have `"neutralised": []`.
  - 2015 Monaco was left out because the table contradicts itself.
  - 2022 onwards has red flags only.
- **Weather:** each race article's infobox, read as dry, wet or mixed where its words were clear. It covers about 1,040 races.
- **Compounds, 2019 on:** from each article's "Tyre choices" section, where it lists three C-numbers.
- **Tyres per driver:** none. No open source has them; that part is yours.

Wikipedia's text is CC BY-SA 4.0. Facts themselves can't be owned, but to be safe, credit Wikipedia for this data and keep this folder under CC BY-SA 4.0.

## Where to find more

Only use sources you're allowed to copy facts from, and check them against each other. Don't copy from:
- F1's live timing or anything built on it (FastF1, OpenF1, and datasets made from them);
- the FIA's documents;
- formula1.com;
- other F1 statistics websites.

Good places:
- Your own notes from watching.
- Wikipedia race reports.
- Press reports of strategies and safety cars, as facts in your own words. Don't copy their tables or graphics.
