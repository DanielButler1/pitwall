# Play game kit (mobile)

`import { … } from "@/features/play/kit";` The phone port of `apps/web/src/components/play/kit.tsx`.
Daily logic, picks, saves and stats stay in `@pitwall/core/game/daily` (saves already go to the app's
SQLite store through `setGameStorage`), so `gameStore(game)` works exactly as on the website.

## Data

- `dbLoader(build)` → a loader memoised per `Db` (module-level `WeakMap`). Define at module level:
  `const load = dbLoader((db) => unpack(guessFile(db)));`
- `useDbData(loader)` → `{ data, error, retry }`. `data` is null for a frame while it builds (so
  `GameLoading` paints first), then cached for every later screen.
- `useDataFile(path, map)` → React Query result for a file under the website's `/data`
  (`dataUrl(path)`), mapped once, `staleTime: Infinity`. Use it for files that need more than the
  dataset (lap charts). `path` null waits.
- `useToday()` → `{ today, rollover }` (`today` is `dayIndex()`; pass `rollover` to `Countdown` /
  `ResultCard` so midnight UTC starts the next puzzle).

## Screen

- `GameScreen({ title, today, mode, practiceLabel?, onStats?, scrollRef?, children })`: the pushed
  screen (back, title, "Puzzle #N" or the practice label under it, a stats button), with a scrolling
  body that keeps taps while the keyboard is up.
- `useGameScroll()` → `{ bringToTop(view) }` inside a GameScreen: scrolls the body so a view sits at
  the top (EntityPicker does this on focus so its matches have room above the keyboard).
- `GameHeader({ mode, onModeChange?, practiceLabel?, controls?, children })`: Daily / Practice
  (omit `onModeChange` for daily-only games), extra `controls`, and the rules folded under
  "How to play" (`children`: a string or nodes).
- `ChoiceToggle({ value, options: Choice[], onChange })`: a `Segmented` with the selection haptic
  (difficulty, pool). `Choice = { id, label, description? }`, the same shape as core's `DIFFICULTIES`.
- `HowToPlay({ title?, children })`: the folding note on its own.
- `GameLoading()`, `GameError({ what, onRetry })` ("Couldn't load {what}.").

## Picking

- `EntityPicker({ items, exclude, onPick, label, placeholder, noun, search?, showAllOnFocus?, limit?, keyboardType?, maxLength?, sanitize?, disabled? })`:
  a search field with matches listed in the page straight under it. `items: PickerItem[]`
  (`{ id, label, sublabel?, weight? }`, keep memoised); `sublabel` only shows for items sharing a
  label (two drivers called the same). **Options show names only**: never put clue-revealing info
  (flags, years, teams) in `label` or `sublabel` unless the website does. Default search is core's
  `searchByName` over `label` with `weight`; pass `search(items, query, excludeSet)` for years or
  races. Picking clears the field and closes the keyboard so the result is visible. It plays no
  haptic itself: the game plays `success`/`error` for the guess's outcome (two haptics back to back
  would collapse into one).

## Tiles

- `VERDICT_STYLE[verdict]` → `{ box, text }` classes (match `bg-success`, close `bg-warning` with dark
  ink in both themes, miss `bg-muted` + border). `useVerdictTone(verdict)` → the icon tone.
- `verdictIcon(verdict, direction, closeIcon?)`: tick, ↑/↓ close, ⇈/⇊ far, `closeIcon` or ✕.
- `ClueTileData = { key, verdict, direction?, icon?, iconRotation?, hint, srText, content }`.
  `content` is the guess's value: use `TileText` (takes the tile's ink; `strong` for numbers) and
  `Flag`. `hint` is the website's hover text; `srText` the screen-reader text (about the guess only).
- `ClueRow({ n, title, leading?, onPressTitle?, tiles })`: a guess's name line and its tiles in one
  row; tapping a tile shows its hint under the row. `ClueHeader({ labels })`: column labels above.
- `ClueTile({ tile, delay?, active?, onPress? })`: one tile (pops in after `delay` ms).
- `Legend({ close, direction? })`, `LegendItem({ verdict, icon, children })`.
- `VerdictBadge({ verdict, icon, label })`: a verdict pill (Career path's guess list).

## Result and stats

- `ResultCard({ won, status, mode, nextLabel, countdownLabel?, onNext, onShare, onStats, onRollover?, children })`:
  status (green when won), the reveal (`children`), Share result, the practice button, and in daily
  mode Your stats and the countdown.
- `shareResult(text)`: the system share sheet (RN `Share`).
- `Countdown({ onRollover?, label? })`, `formatCountdown(ms)`.
- `Figures({ items: [label, value][] })`: labelled figures for reveals.
- `StatsPanel({ open, onClose, stats, today, description, distributionTitle?, distributionLabel?, bucketLabel?, bucketSrLabel?, labelWidth?, highlight, children? })`:
  a sheet (RN `Modal`) with Played / Win % / Streak / Best streak and the distribution bars.
  `statFigures(stats, today)` gives the four figures on their own.

## Guess-game state

`useGuessGame({ game, variant?, maxGuesses, buckets?, ready, dailyTarget, randomTarget, recordResult })`
runs the "find the mystery X" loop the six guessing games share: Daily / Practice, a saved variant
(`{ key: "difficulty", ids: ["modern", "all"], fallback: "modern" }`), today's guesses saved under
`daily:<variant>`, stats under `stats:<variant>` (both `pitwall-<game>:` as on the website), a
practice target, and the success/error haptic per guess. Pass the data object as `ready`. Returns `{ today, rollover, mode, setMode,
variant, setVariant, targetId, guesses, won, over, stats, statsOpen, openStats, closeStats, guess(id),
newPractice(), playAgain(), shareLabel(), highlight, store }`. Games with other rules (hints that cost
tries, scores) use `gameStore` directly, as Lap chart mystery does.

## Haptics

`selection` for choices (`ChoiceToggle` does it), `success` / `error` for right / wrong guesses
(`useGuessGame.guess` does it). Everything via `haptic()` from `@/lib/haptics`.
