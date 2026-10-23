import Storage from "expo-sqlite/kv-store";
import type { KeyValueStorage } from "@pitwall/core/game/daily";

/** Plain key-value storage (SQLite) for caches and preferences. The app has no accounts, so no secrets. */
export const kv = Storage;

/**
 * The games' saves (@pitwall/core/game/daily reads and writes synchronously, as the web's localStorage
 * does), on the same SQLite store. Set as the games' storage at startup (app/_layout.tsx).
 */
export const gameStorage: KeyValueStorage = {
	getItem: (key) => kv.getItemSync(key),
	setItem: (key, value) => kv.setItemSync(key, value),
};
