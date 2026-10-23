import { driversView } from "@pitwall/core/f1/views";
import { Flag, Page, TabScreen } from "@/components/f1";
import { Row, Section } from "@/components/ui";
import { useView } from "@/data/dataset";
import { href, useOpen } from "@/lib/links";

export function BrowseScreen() {
	const drivers = useView((db) => driversView(db).rows.slice(0, 30), []);
	const open = useOpen();
	return (
		<TabScreen title="Browse">
			<Page>
				<Section title="Drivers">
					{drivers.map((d, i) => (
						<Row key={d.driver.id} leading={<Flag code={d.driver.country} />} title={d.driver.name} value={`${d.wins} wins`} onPress={() => open(href.driver(d.driver.id))} last={i === drivers.length - 1} />
					))}
				</Section>
			</Page>
		</TabScreen>
	);
}
