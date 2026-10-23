import { View } from "react-native";
import { Pos } from "@/components/f1";

/** A position badge in a fixed-width slot, so names line up whether the position has one digit or three letters. */
export function PosCell({ text }: { text: string }) {
	return (
		<View className="w-10 items-start">
			<Pos text={text} />
		</View>
	);
}
