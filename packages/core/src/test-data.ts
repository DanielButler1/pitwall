// Where the tests find the built dataset (apps/web/data/f1.json, made by the web app's data
// scripts). PITWALL_DATA (a file path) overrides it.
import { pathToFileURL } from "node:url";

export const dataFile = process.env.PITWALL_DATA ? pathToFileURL(process.env.PITWALL_DATA) : new URL("../../../apps/web/data/f1.json", import.meta.url);
