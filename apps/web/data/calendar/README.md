# Calendars

Announced seasons that F1DB doesn't have yet: one file per season (`2027.json`). It holds the calendar and the drivers under contract, so the site can show the season and its first race before F1DB publishes them. The build only uses a season from here while F1DB has none of its races (and its entrants while F1DB has none). Once F1DB has the season, the file is ignored and can be deleted whenever you like.

```json
{
	"races": [{ "round": 1, "date": "2027-03-14", "grandPrixId": "bahrain", "circuitId": "bahrain", "sprint": true }],
	"entrants": [{ "constructorId": "mclaren", "engineId": "mercedes", "drivers": ["lando-norris", "oscar-piastri"] }]
}
```

- **Ids:** F1DB's ids for Grands Prix, circuits, constructors, engines and drivers. The build fails on any it doesn't know.
- **`date`:** race day. For Las Vegas that's the Saturday.
- **`sprint`:** set it on sprint weekends.
- **Laps and distance:** taken from the latest race at the circuit.
- **Official name:** "Formula 1 <Grand Prix> <year>". The sponsors' titles come with F1DB.
- **Drivers F1DB doesn't have yet** (a rookie confirmed before their first race): add them under `drivers`, in F1DB's shape (`id`, `name`, `firstName`, `lastName`, `nationalityCountryId`, and optionally `abbreviation`, `permanentNumber`, `dateOfBirth`, `placeOfBirth` and `gender`). They get a driver page and a place on the grid. Once F1DB has the driver, its record is used instead. A driver in `entrants` who is in neither is left off with a warning.

## 2027

From the calendar announced on 16 September 2026: 24 rounds with 10 sprint weekends. Portugal (Portimão) and Turkey (Istanbul Park) are back, and the Dutch Grand Prix is gone.
- Turkey still needed the FIA's circuit homologation when the calendar was published.
- Las Vegas is Saturday 20 November.

Rafael Câmara (Haas, #50, confirmed 15 October 2026) is under `drivers` until F1DB adds him.

Seats still open when this was written:
- Racing Bulls: both seats.
- Haas: the seat beside Câmara.

Fill these in as they're announced.
