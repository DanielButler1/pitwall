import { Share } from "react-native";
import { webUrl } from "@/lib/config";

/** Opens the share sheet with the same page on the website. */
export function shareLink(path: string, title: string) {
	const url = webUrl(path);
	void Share.share({ title, message: `${title}\n${url}`, url }).catch(() => undefined);
}
