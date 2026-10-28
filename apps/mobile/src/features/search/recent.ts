// The last few results chosen from search, newest first, kept on the device.

import { kv } from "@/lib/storage";
import { createStore } from "@/lib/store";
import type { SearchItem } from "./searchData";

const KEY = "pitwall.search.recent";
const MAX = 8;

function read(): SearchItem[] {
	try {
		const list = JSON.parse(kv.getItemSync(KEY) ?? "[]") as SearchItem[];
		return Array.isArray(list) ? list.filter((x) => x && typeof x.path === "string" && typeof x.label === "string") : [];
	} catch {
		return [];
	}
}

export const recentStore = createStore<SearchItem[]>(read());

const save = (list: SearchItem[]) => {
	recentStore.set(list);
	void kv.setItem(KEY, JSON.stringify(list)).catch(() => undefined);
};

export const addRecent = (item: SearchItem) => save([item, ...recentStore.get().filter((x) => x.path !== item.path)].slice(0, MAX));

export const clearRecent = () => save([]);
