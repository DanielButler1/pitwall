// The record catalogue: every record category, mapped to an
// implementation (or marked unavailable with a reason). Metadata is cheap and
// static; `compute` runs lazily per category and per Db (see index.ts).

import type { Db } from "../dataset.ts";
import * as A from "./aggregate.ts";
import { fmt, rerank } from "./cells.ts";
import { METRICS, type Kind, type MetricId } from "./facts.ts";
import { raceExtremes, type RaceMetricId } from "./races.ts";
import * as L from "./laps.ts";
import * as S from "./special.ts";
import * as T from "./titles.ts";
import type { EntityKind, RecordCategory, RecordRow } from "./types.ts";

/** Catalogue key (section/family/leaf) | title. */
const SOURCE = `
pilote/champion/nombre|By number
pilote/champion/chronologie|Chronology
pilote/champion/age|By age
pilote/champion/doyen|The seniors
pilote/champion/consecutif|Consecutively
pilote/champion/interval|Interval between two
pilote/champion/gp-avant|Grand Prix before
pilote/champion/saison-avant|Season before
pilote/champion/victoire|Wins
pilote/champion/ecart|Gap
pilote/champion/constructeur-different|With the most different constructors
pilote/champion/moteur-different|With the most different engines
pilote/champion/constructeur|Constructor titles
pilote/champion/vice-champion|Vice-champion
pilote/champion/podium|Podium
pilote/champion/meilleur-classement|Best ranked in the World Championship
pilote/victoire/nombre|By number
pilote/victoire/chronologie|Chronology
pilote/victoire/chronologie-record|Chronology of the record
pilote/victoire/age|By age
pilote/victoire/jour-anniversaire|The day of his birthday
pilote/victoire/age-nation|By age and nation
pilote/victoire/doyen|The seniors
pilote/victoire/consecutive|Consecutively
pilote/victoire/consecutive-debut|Consecutively in early season
pilote/victoire/derniere|Last
pilote/victoire/ecart|Interval between two
pilote/victoire/interval|Interval between the first and the last
pilote/victoire/annee|In a year
pilote/victoire/nb-annee|By number of years
pilote/victoire/annee-consecutive|Consecutive years
pilote/victoire/gp-avant|Grand Prix before
pilote/victoire/meme-constructeur|With the same constructor
pilote/victoire/constructeur-different|With the most different constructors
pilote/victoire/meme-moteur|With the same engine
pilote/victoire/moteur-different|With the most different engines
pilote/victoire/grandprix|By Grand Prix
pilote/victoire/grandprix-consecutif|Consecutively by Grand Prix
pilote/victoire/grandprix-different|By different Grand Prix
pilote/victoire/circuit|By circuit
pilote/victoire/circuit-different|By different circuit
pilote/victoire/grille|By grid position
pilote/victoire/grille-different|By different grid position
pilote/victoire/national|By national GP
pilote/victoire/dernier-tour|Win by taking the lead in the last lap
pilote/victoire/sans-etre-champion|In a year without winning the championship
pilote/victoire/sans-tour-en-tete|Win without leading a lap
pilote/victoire/sans-pole|Win without pole position
pilote/victoire/avec-meilleur-tour|Win and fastest lap
pilote/victoire/different-consecutif|Consecutively different winner
pilote/victoire/par-annee|Different drivers over a year
pilote/pole/nombre|By number
pilote/pole/chronologie|Chronology
pilote/pole/chronologie-record|Chronology of the record
pilote/pole/age|By age
pilote/pole/jour-anniversaire|The day of his birthday
pilote/pole/age-nation|By age and nation
pilote/pole/doyen|The seniors
pilote/pole/consecutive|Consecutively
pilote/pole/consecutive-debut|Consecutively in early season
pilote/pole/derniere|Last
pilote/pole/ecart|Interval between two
pilote/pole/interval|Interval between the first and the last
pilote/pole/annee|In a year
pilote/pole/nb-annee|By number of years
pilote/pole/annee-consecutive|Consecutive years
pilote/pole/gp-avant|Grand Prix before
pilote/pole/meme-constructeur|With the same constructor
pilote/pole/constructeur-different|With the most different constructors
pilote/pole/meme-moteur|With the same engine
pilote/pole/moteur-different|With the most different engines
pilote/pole/grandprix|By Grand Prix
pilote/pole/grandprix-consecutif|Consecutively by Grand Prix
pilote/pole/grandprix-different|By different Grand Prix
pilote/pole/circuit|By circuit
pilote/pole/circuit-different|By different circuit
pilote/pole/national|By national GP
pilote/pole/et-victoire|Pole position and win
pilote/pole/sans-victoire|Pole position without win
pilote/pole/non-partant|Pole position and did not start
pilote/pole/par-annee|Different drivers over a year
pilote/meilleurtour/nombre|By number
pilote/meilleurtour/chronologie|Chronology
pilote/meilleurtour/chronologie-record|Chronology of the record
pilote/meilleurtour/age|By age
pilote/meilleurtour/age-nation|By age and nation
pilote/meilleurtour/doyen|The seniors
pilote/meilleurtour/consecutif|Consecutively
pilote/meilleurtour/ecart|Interval between two
pilote/meilleurtour/interval|Interval between the first and the last
pilote/meilleurtour/annee|In a year
pilote/meilleurtour/nb-annee|By number of years
pilote/meilleurtour/annee-consecutive|Consecutive years
pilote/meilleurtour/gp-avant|Grand Prix before
pilote/meilleurtour/meme-constructeur|With the same constructor
pilote/meilleurtour/constructeur-different|With the most different constructors
pilote/meilleurtour/meme-moteur|With the same engine
pilote/meilleurtour/moteur-different|With the most different engines
pilote/meilleurtour/grandprix|By Grand Prix
pilote/meilleurtour/grandprix-consecutif|Consecutively by Grand Prix
pilote/meilleurtour/grandprix-different|By different Grand Prix
pilote/meilleurtour/circuit|By circuit
pilote/meilleurtour/circuit-different|By different circuit
pilote/meilleurtour/national|By national GP
pilote/point/nombre|By number
pilote/point/chronologie|Chronology
pilote/point/age|By age
pilote/point/age-nation|By age and nation
pilote/point/doyen|The seniors
pilote/point/consecutif|Consecutively
pilote/point/consecutif-sans-sprint|Consecutively (without sprints)
pilote/point/ecart|Interval between two
pilote/point/interval|Interval between the first and the last
pilote/point/annee|In a year (points retained)
pilote/point/annee-tous|In a year (all)
pilote/point/nb-annee|By number of years
pilote/point/annee-consecutive|Consecutive years
pilote/point/gp-avant|Grand Prix before
pilote/point/gp-dans|Grands Prix in the points
pilote/point/moyenne|Average
pilote/point/moyenne-saison|Average per season
pilote/point/sans-victoire|Without win
pilote/point/sans-podium|Without podium
pilote/point/constructeur-different|With the most different constructors
pilote/point/moteur-different|With the most different engines
pilote/podium/nombre|By number
pilote/podium/2e|2nd place
pilote/podium/3e|3rd place
pilote/podium/2et3e|2nd and 3rd places
pilote/podium/chronologie|Chronology
pilote/podium/chronologie-record|Chronology of the record
pilote/podium/age|By age
pilote/podium/jour-anniversaire|The day of his birthday
pilote/podium/age-nation|By age and nation
pilote/podium/doyen|The seniors
pilote/podium/consecutif|Consecutively
pilote/podium/consecutive-debut|Consecutively in early season
pilote/podium/dernier|Last
pilote/podium/ecart|Interval between two
pilote/podium/interval|Interval between the first and the last
pilote/podium/annee|In a year
pilote/podium/nb-annee|By number of years
pilote/podium/annee-consecutive|Consecutive years
pilote/podium/gp-avant|Grand Prix before
pilote/podium/avant-victoire|Before first win
pilote/podium/sans-victoire|Without win
pilote/podium/meme-constructeur|With the same constructor
pilote/podium/constructeur-different|With the most different constructors
pilote/podium/meme-moteur|With the same engine
pilote/podium/moteur-different|With the most different engines
pilote/podium/grandprix|By Grand Prix
pilote/podium/grandprix-consecutif|Consecutively by Grand Prix
pilote/podium/grandprix-different|By different Grand Prix
pilote/podium/circuit|By circuit
pilote/podium/circuit-different|By different circuit
pilote/podium/national|By national GP
pilote/podium/moyenne-age|By average age
pilote/podium/identique|Identical podium
pilote/podium/trio|Trio most often together
pilote/podium/duo|Duo most often together
pilote/podium/duo12|1st and 2nd most often together
pilote/entete/tour|By number of laps
pilote/entete/kms|By number of km
pilote/entete/gp|By number of GP
pilote/entete/deboutenbout|From start to finish
pilote/entete/chronologie|Chronology
pilote/entete/age|By age
pilote/entete/age-nation|By age and nation
pilote/entete/doyen|The seniors
pilote/entete/gp-consecutif|Consecutively (GP)
pilote/entete/tour-consecutif|Consecutively (laps)
pilote/entete/kms-consecutif|Consecutively (km)
pilote/entete/ecart|Interval between two
pilote/entete/interval|Interval between the first and the last
pilote/entete/tour-annee|Laps in a year
pilote/entete/kms-annee|Km in a year
pilote/entete/gp-annee|GP in a year
pilote/entete/nb-annee|By number of years
pilote/entete/annee-consecutive|Consecutive years
pilote/entete/gp-avant|Grand Prix before
pilote/entete/sans-victoire|Without win
pilote/entete/tour-gp|By Grand Prix (laps)
pilote/entete/kms-gp|By Grand Prix (km)
pilote/entete/tour-circuit|By circuit (laps)
pilote/entete/kms-circuit|By circuit (km)
pilote/entete/constructeur-different|With the most different constructors
pilote/entete/moteur-different|With the most different engines
pilote/gp/nombre|Number
pilote/gp/chronologie|Chronology
pilote/gp/chronologie-record|Chronology of the record
pilote/gp/tour|Laps raced
pilote/gp/kms|Km raced
pilote/gp/championnat|Leads the championship
pilote/gp/championnat-age|Leads the championship by age
pilote/gp/championnat-consecutif|Leads the championship consecutively
pilote/gp/avec-champion|With World Champions
pilote/gp/avec-vainqueur|With race winners
pilote/gp/meme-coequipier|With the same teammate
pilote/gp/meme-constructeur|With the same constructor
pilote/gp/constructeur-different|With the most different constructors
pilote/gp/meme-moteur|With the same engine
pilote/gp/moteur-different|With the most different engines
pilote/gp/age|By age
pilote/gp/age-nation|By age and nation
pilote/gp/doyen|The seniors
pilote/gp/moyenne-age|By average age
pilote/gp/consecutif|Consecutively
pilote/gp/ecart|Interval between two
pilote/gp/interval|Interval between the first and the last
pilote/gp/sans-victoire|Without win
pilote/gp/sans-pole|Without pole position
pilote/gp/sans-meilleur-tour|Without fastest lap
pilote/gp/sans-vicpolmt|Without win, pole or fastest lap
pilote/gp/sans-point|Without points
pilote/gp/sans-podium|Without podium
pilote/gp/sans-tour-en-tete|Without leading a lap
pilote/divers/saison|Number of seasons
pilote/divers/engagement|Entries
pilote/divers/hattrick|Hat tricks
pilote/divers/hattrick-age|Hat tricks by age
pilote/divers/chelem|Grand slams
pilote/divers/chelem-age|Grand slams by age
pilote/divers/premiere-ligne|Front row
pilote/divers/premiere-ligne-duo|Duo most often together on the front row
pilote/divers/premiere-ligne-age|Front row by age
pilote/divers/premiere-ligne-consecutive|Consecutive front rows
pilote/divers/grille-moyenne|Average grid position
pilote/divers/qualification|Fastest in qualifying
pilote/divers/arrivee|Finished
pilote/divers/arrivee-consecutive|Consecutively finished
pilote/divers/classe|Classified
pilote/divers/classe-consecutif|Consecutively classified
pilote/divers/abandon|Retirements
pilote/divers/abandon-consecutif|Consecutive retirements
pilote/divers/abandon-tour1|1st lap retirements
pilote/divers/tour-vainqueur|In the winner's lap
pilote/divers/position|Position
pilote/divers/gain|Positions gained
pilote/divers/premier-gp-grille|Grid position at first Grand Prix
pilote/divers/premier-gp-classement|Result at first Grand Prix
pilote/divers/dernier-gp-classement|Result at last Grand Prix
pilote/divers/non-qualifie|Never qualified
pilote/divers/disqualifie|Disqualified
pilote/divers/premier-sans-gagner|First across the line without winning
pilote/divers/concurrent|Competitors
pilote/divers/troisieme-pilote|Third driver only
pilote/divers/femmes|Women
pilote/divers/famille|Family relationships
pilote/divers/decede|Passed away
pilote/sprint/victoire|Wins
pilote/sprint/pole|Pole positions
pilote/sprint/meilleur-tour|Fastest laps
pilote/sprint/point|Points
pilote/sprint/podium|Podiums
pilote/sprint/entete-tour|Laps led
pilote/sprint/entete-km|Km led
constructeur/champion/nombre|By number
constructeur/champion/chronologie|Chronology
constructeur/champion/consecutif|Consecutively
constructeur/champion/interval|Interval between two
constructeur/champion/pilote|Driver titles
constructeur/champion/victoire|Wins
constructeur/champion/ecart|Gap
constructeur/champion/vice-champion|Vice-champion
constructeur/champion/podium|Podium
constructeur/victoire/nombre|By number
constructeur/victoire/modele|By model
constructeur/victoire/chronologie|Chronology
constructeur/victoire/chronologie-record|Chronology of the record
constructeur/victoire/consecutive|Consecutively
constructeur/victoire/consecutive-debut|Consecutively in early season
constructeur/victoire/derniere|Last
constructeur/victoire/ecart|Interval between two
constructeur/victoire/annee|In a year
constructeur/victoire/nb-annee|By number of years
constructeur/victoire/annee-consecutive|Consecutive years
constructeur/victoire/gp-avant|Grand Prix before
constructeur/victoire/grandprix|By Grand Prix
constructeur/victoire/grandprix-different|By different Grand Prix
constructeur/victoire/circuit|By circuit
constructeur/victoire/circuit-different|By different circuit
constructeur/pole/nombre|By number
constructeur/pole/double|By one-two
constructeur/pole/chronologie|Chronology
constructeur/pole/chronologie-record|Chronology of the record
constructeur/pole/consecutive|Consecutively
constructeur/pole/consecutive-debut|Consecutively in early season
constructeur/pole/derniere|Last
constructeur/pole/ecart|Interval between two
constructeur/pole/annee|In a year
constructeur/pole/nb-annee|By number of years
constructeur/pole/annee-consecutive|Consecutive years
constructeur/pole/gp-avant|Grand Prix before
constructeur/pole/grandprix|By Grand Prix
constructeur/pole/grandprix-different|By different Grand Prix
constructeur/pole/circuit|By circuit
constructeur/pole/circuit-different|By different circuit
constructeur/pole/et-victoire|Pole position and win
constructeur/meilleurtour/nombre|By number
constructeur/meilleurtour/chronologie|Chronology
constructeur/meilleurtour/chronologie-record|Chronology of the record
constructeur/meilleurtour/consecutif|Consecutively
constructeur/meilleurtour/ecart|Interval between two
constructeur/meilleurtour/annee|In a year
constructeur/meilleurtour/nb-annee|By number of years
constructeur/meilleurtour/annee-consecutive|Consecutive years
constructeur/meilleurtour/gp-avant|Grand Prix before
constructeur/meilleurtour/grandprix|By Grand Prix
constructeur/meilleurtour/circuit|By circuit
constructeur/point/nombre|By number
constructeur/point/chronologie|Chronology
constructeur/point/consecutif|Consecutively
constructeur/point/ecart|Interval between two
constructeur/point/annee|In a year
constructeur/point/nb-annee|By number of years
constructeur/point/annee-consecutive|Consecutive years
constructeur/point/gp-dans|Grands Prix in the points
constructeur/point/moyenne-saison|Average per season
constructeur/point/sans-victoire|Without win
constructeur/podium/nombre|By number
constructeur/podium/double|By one-two
constructeur/podium/2e|2nd place
constructeur/podium/3e|3rd place
constructeur/podium/2et3e|2nd and 3rd places
constructeur/podium/chronologie|Chronology
constructeur/podium/consecutif|Consecutively
constructeur/podium/consecutive-debut|Consecutively in early season
constructeur/podium/double-consecutif|Consecutive one-twos
constructeur/podium/dernier|Last
constructeur/podium/ecart|Interval between two
constructeur/podium/annee|In a year
constructeur/podium/nb-annee|By number of years
constructeur/podium/double-annee|One-twos in a year
constructeur/podium/annee-consecutive|Consecutive years
constructeur/podium/gp-avant|Grand Prix before
constructeur/podium/sans-victoire|Without win
constructeur/entete/tour|By number of laps
constructeur/entete/kms|By number of km
constructeur/entete/gp|By number of GP
constructeur/entete/chronologie|Chronology
constructeur/entete/gp-consecutif|Consecutively (GP)
constructeur/entete/tour-consecutif|Consecutively (laps)
constructeur/entete/kms-consecutif|Consecutively (km)
constructeur/entete/tour-annee|Laps in a year
constructeur/entete/kms-annee|Km in a year
constructeur/entete/gp-annee|GP in a year
constructeur/entete/nb-annee|By number of years
constructeur/entete/annee-consecutive|Consecutive years
constructeur/entete/gp-avant|Grand Prix before
constructeur/gp/nombre|Number
constructeur/gp/chronologie|Chronology
constructeur/gp/saison|Number of seasons
constructeur/gp/ecart|Interval between two
constructeur/gp/meme-pilote|With the same driver
constructeur/gp/meme-moteur|With the same engine
constructeur/gp/premiere-ligne|Front row
constructeur/gp/premiere-ligne-consecutive|Consecutive front rows
constructeur/gp/premiere-ligne-verouille|Front row lockouts
constructeur/gp/hattrick|Hat tricks
constructeur/gp/chelem|Grand slams
constructeur/gp/different-consecutif|Consecutively different winner
constructeur/gp/championnat|Leads the championship
constructeur/gp/championnat-consecutif|Leads the championship consecutively
constructeur/gp/sans-victoire|Without win
constructeur/gp/sans-pole|Without pole position
constructeur/gp/sans-meilleur-tour|Without fastest lap
constructeur/gp/sans-vicpolmt|Without win, pole or fastest lap
constructeur/gp/sans-point|Without points
constructeur/gp/sans-podium|Without podium
constructeur/gp/non-qualifie|Never qualified
constructeur/sprint/victoire|Wins
constructeur/sprint/pole|Pole positions
constructeur/sprint/meilleur-tour|Fastest laps
constructeur/sprint/point|Points
constructeur/sprint/podium|Podiums
constructeur/sprint/entete-tour|Laps led
constructeur/sprint/entete-km|Km led
moteur/champion/nombre|By number
moteur/champion/chronologie|Chronology
moteur/champion/consecutif|Consecutively
moteur/champion/pilote|Driver titles
moteur/victoire/nombre|By number
moteur/victoire/chronologie|Chronology
moteur/victoire/chronologie-record|Chronology of the record
moteur/victoire/consecutive|Consecutively
moteur/victoire/consecutive-debut|Consecutively in early season
moteur/victoire/ecart|Interval between two
moteur/victoire/annee|In a year
moteur/victoire/nb-annee|By number of years
moteur/victoire/annee-consecutive|Consecutive years
moteur/victoire/gp-avant|Grand Prix before
moteur/victoire/grandprix|By Grand Prix
moteur/victoire/circuit|By circuit
moteur/victoire/type|By type
moteur/pole/nombre|By number
moteur/pole/double|By one-two
moteur/pole/chronologie|Chronology
moteur/pole/chronologie-record|Chronology of the record
moteur/pole/consecutive|Consecutively
moteur/pole/consecutive-debut|Consecutively in early season
moteur/pole/ecart|Interval between two
moteur/pole/annee|In a year
moteur/pole/nb-annee|By number of years
moteur/pole/annee-consecutive|Consecutive years
moteur/pole/gp-avant|Grand Prix before
moteur/pole/grandprix|By Grand Prix
moteur/pole/circuit|By circuit
moteur/pole/type|By type
moteur/meilleurtour/nombre|By number
moteur/meilleurtour/chronologie|Chronology
moteur/meilleurtour/chronologie-record|Chronology of the record
moteur/meilleurtour/consecutif|Consecutively
moteur/meilleurtour/ecart|Interval between two
moteur/meilleurtour/annee|In a year
moteur/meilleurtour/nb-annee|By number of years
moteur/meilleurtour/annee-consecutive|Consecutive years
moteur/meilleurtour/gp-avant|Grand Prix before
moteur/meilleurtour/grandprix|By Grand Prix
moteur/meilleurtour/circuit|By circuit
moteur/meilleurtour/type|By type
moteur/point/nombre|By number
moteur/point/chronologie|Chronology
moteur/point/consecutif|Consecutively
moteur/point/ecart|Interval between two
moteur/point/annee|In a year
moteur/point/nb-annee|By number of years
moteur/point/annee-consecutive|Consecutive years
moteur/point/gp-dans|Grands Prix in the points
moteur/point/moyenne-saison|Average per season
moteur/podium/nombre|By number
moteur/podium/double|By one-two
moteur/podium/2e|2nd place
moteur/podium/3e|3rd place
moteur/podium/2et3e|2nd and 3rd places
moteur/podium/triple|By one-two-three
moteur/podium/chronologie|Chronology
moteur/podium/consecutif|Consecutively
moteur/podium/consecutive-debut|Consecutively in early season
moteur/podium/ecart|Interval between two
moteur/podium/annee|In a year
moteur/podium/nb-annee|By number of years
moteur/podium/annee-consecutive|Consecutive years
moteur/podium/gp-avant|Grand Prix before
moteur/entete/tour|By number of laps
moteur/entete/kms|By number of km
moteur/entete/gp|By number of GP
moteur/entete/chronologie|Chronology
moteur/entete/gp-consecutif|Consecutively (GP)
moteur/entete/tour-consecutif|Consecutively (laps)
moteur/entete/kms-consecutif|Consecutively (km)
moteur/entete/tour-annee|Laps in a year
moteur/entete/kms-annee|Km in a year
moteur/entete/gp-annee|GP in a year
moteur/entete/nb-annee|By number of years
moteur/entete/annee-consecutive|Consecutive years
moteur/entete/gp-avant|Grand Prix before
moteur/gp/nombre|Number
moteur/gp/chronologie|Chronology
moteur/gp/ecart|Interval between two
moteur/gp/saison|Number of seasons
moteur/gp/meme-pilote|With the same driver
moteur/gp/meme-constructeur|With the same constructor
moteur/gp/premiere-ligne|Front row
moteur/gp/premiere-ligne-consecutive|Consecutive front rows
moteur/gp/premiere-ligne-verouille|Front row lockouts
moteur/gp/hattrick|Hat tricks
moteur/gp/chelem|Grand slams
moteur/gp/championnat|Leads the championship
moteur/gp/sans-victoire|Without win
moteur/gp/sans-pole|Without pole position
moteur/gp/sans-meilleur-tour|Without fastest lap
moteur/gp/sans-vicpolmt|Without win, pole or fastest lap
moteur/gp/sans-point|Without points
moteur/gp/sans-podium|Without podium
moteur/sprint/victoire|Wins
moteur/sprint/pole|Pole positions
moteur/sprint/meilleur-tour|Fastest laps
moteur/sprint/point|Points
moteur/sprint/podium|Podiums
moteur/sprint/entete-tour|Laps led
moteur/sprint/entete-km|Km led
nation/champion/nombre|By number
nation/champion/pilote|By world champion
nation/champion/chronologie|Chronology
nation/victoire/nombre|By number
nation/victoire/pilote|By driver
nation/victoire/chronologie|Chronology
nation/victoire/consecutive|Consecutively
nation/victoire/ecart|Interval between two
nation/victoire/annee|In a year
nation/victoire/annee-consecutive|Consecutive years
nation/victoire/gp-avant|Grand Prix before
nation/victoire/national|By a national driver
nation/pole/nombre|By number
nation/pole/pilote|By driver
nation/pole/chronologie|Chronology
nation/pole/consecutive|Consecutively
nation/pole/ecart|Interval between two
nation/pole/annee|In a year
nation/pole/annee-consecutive|Consecutive years
nation/pole/gp-avant|Grand Prix before
nation/pole/national|By a national driver
nation/meilleurtour/nombre|By number
nation/meilleurtour/pilote|By driver
nation/meilleurtour/chronologie|Chronology
nation/meilleurtour/consecutif|Consecutively
nation/meilleurtour/annee|In a year
nation/meilleurtour/annee-consecutive|Consecutive years
nation/meilleurtour/gp-avant|Grand Prix before
nation/meilleurtour/national|By a national driver
nation/point/nombre|By number
nation/point/pilote|By driver
nation/point/chronologie|Chronology
nation/point/consecutif|Consecutively
nation/point/annee|In a year
nation/point/annee-consecutive|Consecutive years
nation/point/gp-avant|Grand Prix before
nation/point/gp-dans|Grands Prix in the points
nation/point/moyenne|Average
nation/podium/nombre|By number
nation/podium/double|By one-two
nation/podium/triple|By one-two-three
nation/podium/pilote|By driver
nation/podium/chronologie|Chronology
nation/podium/consecutif|Consecutively
nation/podium/annee|In a year
nation/podium/annee-consecutive|Consecutive years
nation/podium/gp-avant|Grand Prix before
nation/podium/national|By a national driver
nation/entete/tour|By number of laps
nation/entete/kms|By number of km
nation/entete/gp|By number of GP
nation/entete/deboutenbout|From start to finish
nation/entete/chronologie|Chronology
nation/entete/consecutif|Consecutively (GP)
nation/entete/tour-annee|Laps in a year
nation/entete/kms-annee|Km in a year
nation/entete/gp-annee|GP in a year
nation/entete/annee-consecutive|Consecutive years
nation/entete/gp-avant|Grand Prix before
nation/gp/nombre|Number
nation/gp/saison|Number of seasons
nation/gp/sans-victoire|Without win
nation/gp/sans-pole|Without pole position
nation/gp/sans-meilleur-tour|Without fastest lap
nation/gp/sans-vicpolmt|Without win, pole or fastest lap
nation/gp/sans-point|Without points
nation/gp/sans-podium|Without podium
nation/divers/pole-victoire|Pole position and win
nation/divers/hattrick|Hat tricks
nation/divers/premiere-ligne|Front row
nation/gp/pilote|Drivers
gp/decisif/pilote|Chronology: drivers' championship
gp/decisif/constructeur|Chronology: constructors' championship
gp/decisif/grandprix|By Grand Prix
gp/decisif/circuit|By circuit
gp/tour/lemoins|The fewest
gp/tour/leplus|The most
gp/kms/lemoins|The shortest
gp/kms/leplus|The longest
gp/arrivee/lemoins|The fewest
gp/arrivee/leplus|The most
gp/temps/lemoins|The shortest
gp/temps/leplus|The longest
gp/moyenne/lemoins|The slowest
gp/moyenne/leplus|The fastest
gp/ecart/lemoins|The closest
gp/ecart/leplus|The largest
gp/entete/lemoins|The fewest
gp/entete/leplus|The most
gp/nation/lemoins|The fewest
gp/nation/leplus|The most
gp/divers/endsc|Finished under Safety Car
numero/pilote/pilotes|Drivers
numero/champion/nombre|Number
numero/champion/chronologie|Chronology
numero/victoire/nombre|Number
numero/victoire/chronologie|Chronology
numero/pole/nombre|Number
numero/pole/chronologie|Chronology
numero/meilleurtour/nombre|Number
numero/meilleurtour/chronologie|Chronology
numero/point/nombre|Number
numero/point/chronologie|Chronology
numero/podium/nombre|Number
numero/podium/chronologie|Chronology
`;

/* ------------------------------------------------------------ vocabulary --- */

const SECTION: Record<string, { entity: EntityKind; slug: string; kind?: Kind; subject: string }> = {
	pilote: { entity: "driver", slug: "drivers", kind: "driver", subject: "Driver" },
	constructeur: { entity: "constructor", slug: "constructors", kind: "constructor", subject: "Constructor" },
	moteur: { entity: "engine", slug: "engines", kind: "engine", subject: "Engine" },
	nation: { entity: "nation", slug: "nations", kind: "nation", subject: "Nation" },
	gp: { entity: "grandprix", slug: "grands-prix", subject: "Grand Prix" },
	numero: { entity: "number", slug: "numbers", kind: "number", subject: "Number" },
};

export const FAMILIES: Record<string, { slug: string; label: string; metric?: MetricId; value: string }> = {
	champion: { slug: "titles", label: "Championships", value: "Titles" },
	victoire: { slug: "wins", label: "Wins", metric: "wins", value: "Wins" },
	pole: { slug: "poles", label: "Pole positions", metric: "poles", value: "Poles" },
	meilleurtour: { slug: "fastest-laps", label: "Fastest laps", metric: "fastestLaps", value: "Fastest laps" },
	point: { slug: "points", label: "Points", metric: "points", value: "Points" },
	podium: { slug: "podiums", label: "Podiums", metric: "podiums", value: "Podiums" },
	entete: { slug: "laps-led", label: "Laps led", value: "Laps led" },
	gp: { slug: "grands-prix", label: "Grands Prix", metric: "starts", value: "GPs" },
	divers: { slug: "misc", label: "Miscellaneous", value: "Total" },
	sprint: { slug: "sprint", label: "Sprint", value: "Total" },
	decisif: { slug: "deciders", label: "Title deciders", value: "Titles" },
	tour: { slug: "laps", label: "Race laps", value: "Laps" },
	kms: { slug: "distance", label: "Race distance", value: "Distance" },
	arrivee: { slug: "finishers", label: "Finishers", value: "Finishers" },
	temps: { slug: "duration", label: "Race duration", value: "Time" },
	moyenne: { slug: "average-speed", label: "Average speed", value: "Speed" },
	ecart: { slug: "winning-margin", label: "Winning margin", value: "Margin" },
	nation: { slug: "nationalities", label: "Nationalities on the grid", value: "Nations" },
	numeropilote: { slug: "drivers", label: "Drivers", value: "Drivers" },
};

const LEAF: Record<string, string> = {
	nombre: "by-number", chronologie: "chronology", "chronologie-record": "record-chronology", age: "youngest", doyen: "oldest",
	"jour-anniversaire": "on-birthday", "age-nation": "by-age-and-nation", consecutive: "consecutive", consecutif: "consecutive",
	"consecutive-debut": "consecutive-from-season-start", derniere: "last", dernier: "last", ecart: "interval", interval: "first-to-last",
	annee: "in-a-year", "annee-tous": "in-a-year-all", "nb-annee": "number-of-years", "annee-consecutive": "consecutive-years",
	"gp-avant": "gps-to-first", "saison-avant": "seasons-before-first", "meme-constructeur": "same-constructor",
	"constructeur-different": "different-constructors", "meme-moteur": "same-engine", "moteur-different": "different-engines",
	grandprix: "by-grand-prix", "grandprix-consecutif": "consecutive-by-grand-prix", "grandprix-different": "different-grands-prix",
	circuit: "by-circuit", "circuit-different": "different-circuits", national: "home-grand-prix", grille: "by-grid-position",
	"grille-different": "different-grid-positions", "dernier-tour": "lead-taken-on-last-lap", "sans-etre-champion": "in-a-year-without-title",
	"sans-tour-en-tete": "without-leading", "sans-pole": "without-pole", "avec-meilleur-tour": "with-fastest-lap",
	"different-consecutif": "consecutive-different-winners", "par-annee": "different-per-year", "et-victoire": "pole-and-win",
	"sans-victoire": "without-win", "non-partant": "did-not-start", "consecutif-sans-sprint": "consecutive-without-sprints",
	"gp-dans": "gps-in-the-points", moyenne: "average", "moyenne-saison": "average-per-season", "sans-podium": "without-podium",
	"2e": "second", "3e": "third", "2et3e": "second-and-third", "avant-victoire": "before-first-win", "moyenne-age": "average-age",
	identique: "identical", trio: "trio", duo: "duo", duo12: "first-and-second", tour: "laps", kms: "km", gp: "gps",
	deboutenbout: "start-to-finish", "gp-consecutif": "consecutive-gps", "tour-consecutif": "consecutive-laps",
	"kms-consecutif": "consecutive-km", "tour-annee": "laps-in-a-year", "kms-annee": "km-in-a-year", "gp-annee": "gps-in-a-year",
	"tour-gp": "laps-by-grand-prix", "kms-gp": "km-by-grand-prix", "tour-circuit": "laps-by-circuit", "kms-circuit": "km-by-circuit",
	championnat: "leads-championship", "championnat-age": "leads-championship-youngest",
	"championnat-consecutif": "leads-championship-consecutive", "avec-champion": "with-champion-teammate",
	"avec-vainqueur": "with-winner-teammate", "meme-coequipier": "same-teammate", "sans-meilleur-tour": "without-fastest-lap",
	"sans-vicpolmt": "without-win-pole-fastest-lap", "sans-point": "without-points", saison: "seasons", engagement: "entries",
	hattrick: "hat-tricks", "hattrick-age": "hat-tricks-youngest", chelem: "grand-slams", "chelem-age": "grand-slams-youngest",
	"premiere-ligne": "front-rows", "premiere-ligne-duo": "front-row-duo", "premiere-ligne-age": "front-row-youngest",
	"premiere-ligne-consecutive": "consecutive-front-rows", "premiere-ligne-verouille": "front-row-lockouts",
	"grille-moyenne": "average-grid", qualification: "fastest-in-qualifying", arrivee: "finishes",
	"arrivee-consecutive": "consecutive-finishes", classe: "classified", "classe-consecutif": "consecutive-classified",
	abandon: "retirements", "abandon-consecutif": "consecutive-retirements", "abandon-tour1": "first-lap-retirements",
	"tour-vainqueur": "lead-lap-finishes", position: "positions", gain: "positions-gained", "premier-gp-grille": "debut-grid",
	"premier-gp-classement": "debut-result", "dernier-gp-classement": "final-result", "non-qualifie": "never-qualified",
	disqualifie: "disqualified", "premier-sans-gagner": "first-across-line-not-winner", concurrent: "competitors",
	"troisieme-pilote": "third-driver-only", femmes: "women", famille: "family", decede: "passed-away", victoire: "wins",
	pole: "poles", "meilleur-tour": "fastest-laps", point: "points", podium: "podiums", "entete-tour": "laps-led",
	"entete-km": "km-led", modele: "by-model", double: "one-twos", triple: "one-two-threes", "double-consecutif": "consecutive-one-twos",
	"double-annee": "one-twos-in-a-year", "meme-pilote": "same-driver", type: "by-type", lemoins: "least", leplus: "most",
	endsc: "finished-under-safety-car", "vice-champion": "runner-up", "meilleur-classement": "best-ranking",
	constructeur: "constructor-titles", pilotes: "drivers", "pole-victoire": "pole-and-win",
};

/* -------------------------------------------------------- implementations --- */

type Impl = {
	compute?: (db: Db) => RecordRow[];
	unavailable?: string;
	description: string;
	value?: string;
	subject?: string;
	detail?: string;
	slug?: string;
	coverage?: { label: string; note: string };
};

const SPRINT_FL = {
	label: "From Jolpica",
	note: "F1DB doesn't record sprint fastest laps; they come from Jolpica, which has every sprint since the format began in 2021 (the latest one is added when Jolpica's delayed dump includes it).",
};

/** Lap-leader data (Jolpica) starts in 1996; nothing earlier exists in F1DB or Jolpica. */
const LAPS = {
	label: "Since 1996",
	note: "Who led each lap comes from Jolpica's lap-by-lap data, which starts in 1996. Neither F1DB nor Jolpica has lap leaders for earlier races, so they aren't counted. The latest races are added when Jolpica's delayed dump (about two weeks behind) includes them.",
};
const LAPS_DEBUT = {
	label: "Since 1996",
	note: `${LAPS.note} To keep "first" meaningful, only those whose first Grand Prix was in 1996 or later are listed.`,
};
const SPRINT_LAPS = {
	label: "Sprints since 2024",
	note: "Sprint lap positions come from Jolpica and are complete from 2024 (2021-22 sprints have none and 2023 only some), so earlier sprints aren't counted.",
};

function lapsLedImpl(kind: Kind, leaf: string, who: string): Impl {
	const c = (metric: MetricId) => (db: Db) => ({ db, kind, metric });
	const debut = (rows: (db: Db) => RecordRow[]) => (db: Db) => L.debutInCoverage(db, kind, rows(db));
	const plural = `${who.toLowerCase()}s`;
	const base = { coverage: LAPS };
	switch (leaf) {
		case "tour":
			return { ...base, compute: (db) => A.total(c("lapsLed")(db), { share: false }), description: "Most laps led.", value: "Laps led" };
		case "kms":
			return { ...base, compute: (db) => A.total(c("kmLed")(db), { share: false }), description: "Most kilometres led.", value: "Km led" };
		case "gp":
			return { ...base, compute: (db) => A.total(c("gpsLed")(db), { share: false }), description: "Most Grands Prix with at least one lap led.", value: "GPs led" };
		case "deboutenbout":
			return { ...base, compute: (db) => A.total(c("ledStartToFinish")(db), { share: false }), description: "Most races led from start to finish (every lap).", value: "Races" };
		case "chronologie":
			return { coverage: LAPS_DEBUT, compute: debut((db) => A.chronology(c("gpsLed")(db))), description: `Every ${who.toLowerCase()} in order of the first Grand Prix they led.`, value: "Date" };
		case "age":
			return { coverage: LAPS_DEBUT, compute: debut((db) => A.age(c("gpsLed")(db), "youngest")), description: "Youngest drivers to lead a lap.", value: "Age" };
		case "age-nation":
			return { coverage: LAPS_DEBUT, compute: (db) => A.ageByNation({ db, kind, metric: "gpsLedDebut" }, "youngest"), description: "Youngest driver of each nation to lead a lap.", value: "Age", subject: "Driver / nation" };
		case "doyen":
			return { ...base, compute: (db) => A.age(c("gpsLed")(db), "oldest"), description: "Oldest drivers to lead a lap (age at the last race they led).", value: "Age" };
		case "gp-consecutif":
		case "consecutif":
			return { ...base, compute: (db) => A.streak(c("gpsLed")(db)), description: `Most consecutive Grands Prix leading at least one lap (over the races the ${who.toLowerCase()} started).`, value: "GPs", detail: "Run" };
		case "tour-consecutif":
			return { ...base, compute: (db) => L.consecutiveLaps(db, kind, false), description: "Most consecutive laps led, carried across races when the leader of a race's last lap also led the next one's first.", value: "Laps", detail: "Run" };
		case "kms-consecutif":
			return { ...base, compute: (db) => L.consecutiveLaps(db, kind, true), description: "Most consecutive kilometres led, carried across races when the leader of a race's last lap also led the next one's first.", value: "Km", detail: "Run" };
		case "ecart":
			return { ...base, compute: (db) => A.gapBetween(c("gpsLed")(db)), description: "Longest waits between two Grands Prix led.", value: "Time" };
		case "interval":
			return { coverage: LAPS_DEBUT, compute: debut((db) => A.firstToLast(c("gpsLed")(db))), description: "Longest time between the first and the last Grand Prix led.", value: "Time" };
		case "tour-annee":
			return { ...base, compute: (db) => A.inYear(c("lapsLed")(db)), description: "Most laps led in a season.", value: "Laps led", detail: "Season" };
		case "kms-annee":
			return { ...base, compute: (db) => A.inYear(c("kmLed")(db)), description: "Most kilometres led in a season.", value: "Km led", detail: "Season" };
		case "gp-annee":
			return { ...base, compute: (db) => A.inYear(c("gpsLed")(db)), description: "Most Grands Prix led in a season.", value: "GPs led", detail: "Season" };
		case "nb-annee":
			return { ...base, compute: (db) => A.numberOfYears(c("gpsLed")(db)), description: "Most seasons with at least one lap led.", value: "Seasons" };
		case "annee-consecutive":
			return { ...base, compute: (db) => A.consecutiveYears(c("gpsLed")(db)), description: "Most consecutive seasons with at least one lap led.", value: "Seasons" };
		case "gp-avant":
			return { coverage: LAPS_DEBUT, compute: debut((db) => A.before(c("gpsLed")(db))), description: "Fewest Grands Prix needed to lead a first lap (1 = on debut).", value: "GP #" };
		case "sans-victoire":
			return { ...base, compute: (db) => A.totalWithout(c("lapsLed")(db), ["wins"]), description: `Most laps led by ${plural} that never won a Grand Prix.`, value: "Laps led" };
		case "tour-gp":
			return { ...base, compute: (db) => L.sumByPlace(db, kind, "lapsLed", "gp"), description: "Most laps led at the same Grand Prix.", value: "Laps led" };
		case "kms-gp":
			return { ...base, compute: (db) => L.sumByPlace(db, kind, "kmLed", "gp"), description: "Most kilometres led at the same Grand Prix.", value: "Km led" };
		case "tour-circuit":
			return { ...base, compute: (db) => L.sumByPlace(db, kind, "lapsLed", "circuit"), description: "Most laps led at the same circuit.", value: "Laps led" };
		case "kms-circuit":
			return { ...base, compute: (db) => L.sumByPlace(db, kind, "kmLed", "circuit"), description: "Most kilometres led at the same circuit.", value: "Km led" };
		case "constructeur-different":
			return { ...base, compute: (db) => A.distinctOthers(c("gpsLed")(db), "constructor"), description: "Laps led with the most different constructors.", value: "Constructors" };
		case "moteur-different":
			return { ...base, compute: (db) => A.distinctOthers(c("gpsLed")(db), "engine"), description: "Laps led with the most different engines.", value: "Engines" };
	}
	throw new Error(`No laps-led implementation for ${kind}/${leaf}`);
}

function implFor(section: string, family: string, leaf: string): Impl {
	const s = SECTION[section];
	const fam = FAMILIES[family];

	if (section === "gp") return grandPrixImpl(family, leaf);
	const kind = s.kind!;
	if (family === "entete") return lapsLedImpl(kind, leaf, s.subject);
	if (leaf === "entete-tour")
		return { coverage: SPRINT_LAPS, compute: (db) => A.total({ db, kind, metric: "sprintLapsLed" }, { share: false }), description: "Most sprint laps led.", value: "Laps led" };
	if (leaf === "entete-km")
		return { coverage: SPRINT_LAPS, compute: (db) => A.total({ db, kind, metric: "sprintKmLed" }, { share: false }), description: "Most sprint kilometres led.", value: "Km led" };
	if (leaf === "dernier-tour")
		return { coverage: LAPS, compute: (db) => L.eventsByDriver(db, "winLeadOnLastLap"), description: "Wins taken by leading only the final lap (not leading the lap before).", value: "Wins", detail: "Races" };
	if (leaf === "sans-tour-en-tete" && family === "victoire")
		return { coverage: LAPS, compute: (db) => L.eventsByDriver(db, "winWithoutLeading"), description: "Wins without leading a single lap (the win came after the race, e.g. when the driver first across the line was penalised).", value: "Wins", detail: "Races" };
	if (leaf === "sans-tour-en-tete")
		return { coverage: LAPS_DEBUT, compute: (db) => L.startsWithoutLeading(db), description: "Most Grands Prix started without ever leading a lap.", value: "GPs", detail: "Seasons" };

	const ctx = (metric: MetricId) => ({ kind, metric });
	const g = (metric: MetricId) => (db: Db) => ({ db, ...ctx(metric) });
	const nouns = (m: MetricId) => METRICS[m].noun as [string, string];

	if (family === "champion") return titleImpl(kind, leaf);
	if (section === "numero" && family === "pilote") return { compute: (db) => S.driversOf(db, "number"), description: "Car numbers by the number of different drivers who raced with them.", value: "Drivers" };
	if (family === "sprint") {
		const m: Record<string, MetricId> = { victoire: "sprintWins", pole: "sprintPoles", point: "sprintPoints", podium: "sprintPodiums" };
		if (leaf === "meilleur-tour")
			return {
				coverage: SPRINT_FL,
				compute: (db) => A.total({ db, kind, metric: "sprintFastestLaps" }),
				description: "Most fastest laps in sprint races (from Jolpica; F1DB doesn't record them).",
				value: "Fastest laps",
			};
		const metric = m[leaf];
		return { compute: (db) => A.total(g(metric)(db)), description: `Most ${nouns(metric)[1]} (sprint races since 2021).`, value: FAMILIES[leaf === "meilleur-tour" ? "meilleurtour" : leaf]?.value ?? "Total" };
	}
	if (family === "divers") return miscImpl(kind, leaf);

	const metric = fam.metric!;
	const n = nouns(metric);
	const c = g(metric);
	const who = s.subject.toLowerCase();
	switch (leaf) {
		case "nombre":
			return {
				compute: (db) => A.total(c(db), { share: metric !== "starts" && metric !== "points" }),
				description: metric === "starts" ? `${s.subject}s by Grands Prix started.` : `${s.subject}s by total ${n[1]}.`,
			};
		case "chronologie":
			return {
				compute: (db) => A.chronology(c(db)),
				description: metric === "starts" ? `Every ${who} in order of their first Grand Prix.` : `Every ${who} in order of their first ${n[0]}.`,
				value: "Date",
			};
		case "chronologie-record":
			return { compute: (db) => A.recordChronology(c(db)), description: `Who held the all-time record for ${n[1]}, and when.`, value: "Record" };
		case "age":
			return { compute: (db) => A.age(c(db), "youngest"), description: metric === "starts" ? "Youngest drivers to start a Grand Prix." : `Youngest drivers to score their first ${n[0]}.`, value: "Age" };
		case "doyen":
			return { compute: (db) => A.age(c(db), "oldest"), description: metric === "starts" ? "Oldest drivers to start a Grand Prix (age at their last start)." : `Oldest drivers to score a ${n[0]} (age at their last).`, value: "Age" };
		case "jour-anniversaire":
			return { compute: (db) => A.birthday(c(db)), description: `${cap(n[1])} scored on the driver's birthday.`, value: "Birthday" };
		case "age-nation":
			{
			const which = metric === "poles" || metric === "fastestLaps" ? "oldest" : "youngest";
			return {
				compute: (db) => A.ageByNation(c(db), which),
				description: which === "oldest" ? `Oldest driver of each nation to score a ${n[0]} (age at their last).` : metric === "starts" ? "Youngest driver of each nation to start a Grand Prix." : `Youngest driver of each nation to score a ${n[0]}.`,
				value: "Age",
				subject: "Driver / nation",
			};
		}
		case "consecutive":
		case "consecutif":
			if (metric === "starts")
				return { compute: (db) => startStreak(db, kind), description: `Longest runs of consecutive Grands Prix started.` };
			return { compute: (db) => A.streak(c(db)), description: `Longest runs of consecutive ${n[1]} (over the Grands Prix the ${who} started).`, detail: "Run" };
		case "consecutif-sans-sprint":
			return { compute: (db) => A.streak({ db, kind, metric: "racePoints" }), description: "Longest runs of consecutive Grands Prix in the points, not counting sprint points.", detail: "Run" };
		case "consecutive-debut":
			return { compute: (db) => A.seasonStartStreak(c(db)), description: `Most consecutive ${n[1]} from the opening round of a season.` };
		case "derniere":
		case "dernier":
			return { compute: (db) => A.last(c(db)), description: `Each ${who}'s most recent ${n[0]}, latest first.`, value: "Date" };
		case "ecart":
			if (metric === "starts") return { compute: (db) => A.gapBetween(c(db)), description: `Longest absences between two Grands Prix.`, value: "Time" };
			return { compute: (db) => A.gapBetween(c(db)), description: `Longest waits between two consecutive ${n[1]}.`, value: "Time" };
		case "interval":
			return { compute: (db) => A.firstToLast(c(db)), description: metric === "starts" ? "Longest careers, from first to last Grand Prix." : `Longest time between the first and the last ${n[0]}.`, value: "Time" };
		case "annee":
			if (metric === "points" && (kind === "driver" || kind === "constructor"))
				return { compute: (db) => retainedPoints(db, kind), description: "Most championship points in a season (points retained, after dropped scores and penalties)." };
			return { compute: (db) => A.inYear(c(db)), description: `Most ${n[1]} in a single season.`, detail: "Season" };
		case "annee-tous":
			return { compute: (db) => A.inYear(c(db)), description: "Most points scored in a single season, counting every result (no dropped scores).", detail: "Season" };
		case "nb-annee":
			return { compute: (db) => A.numberOfYears(c(db)), description: `Most seasons with at least one ${n[0]}.`, value: "Seasons" };
		case "annee-consecutive":
			return { compute: (db) => A.consecutiveYears(c(db)), description: `Most consecutive seasons with at least one ${n[0]}.`, value: "Seasons" };
		case "gp-avant":
			return { compute: (db) => A.before(c(db)), description: `Fewest Grands Prix needed for the first ${n[0]} (1 = on debut).`, value: "GP #" };
		case "gp-dans":
			return { compute: (db) => A.racesWith({ db, kind, metric: "racePoints" }), description: "Most Grands Prix finished in the points.", value: "GPs" };
		case "meme-constructeur":
			if (metric === "starts") return { compute: (db) => S.startsWithSame(db, kind, "constructor"), description: "Most Grands Prix with the same constructor." };
			return { compute: (db) => A.withSame(c(db), "constructor"), description: `Most ${n[1]} with the same constructor.` };
		case "meme-moteur":
			if (metric === "starts") return { compute: (db) => S.startsWithSame(db, kind, "engine"), description: "Most Grands Prix with the same engine." };
			return { compute: (db) => A.withSame(c(db), "engine"), description: `Most ${n[1]} with the same engine.` };
		case "meme-pilote":
			return { compute: (db) => S.startsWithSame(db, kind, "driver"), description: "Most Grands Prix with the same driver." };
		case "constructeur-different":
			return { compute: (db) => A.distinctOthers(c(db), "constructor"), description: `${metric === "starts" ? "Grands Prix" : cap(n[1])} with the most different constructors.`, value: "Constructors" };
		case "moteur-different":
			return { compute: (db) => A.distinctOthers(c(db), "engine"), description: `${metric === "starts" ? "Grands Prix" : cap(n[1])} with the most different engines.`, value: "Engines" };
		case "grandprix":
			return { compute: (db) => A.byPlace(c(db), "gp"), description: `Most ${n[1]} at the same Grand Prix.` };
		case "grandprix-consecutif":
			return { compute: (db) => A.placeStreak(c(db)), description: `Most consecutive ${n[1]} at the same Grand Prix.` };
		case "grandprix-different":
			return { compute: (db) => A.distinctPlaces(c(db), "gp"), description: `${cap(n[1])} at the most different Grands Prix.`, value: "Grands Prix" };
		case "circuit":
			return { compute: (db) => A.byPlace(c(db), "circuit"), description: `Most ${n[1]} at the same circuit.` };
		case "circuit-different":
			return { compute: (db) => A.distinctPlaces(c(db), "circuit"), description: `${cap(n[1])} at the most different circuits.`, value: "Circuits" };
		case "national":
			return {
				compute: (db) => A.national(c(db)),
				description: kind === "nation" ? `${cap(n[1])} by a driver at their own country's Grand Prix.` : `Most ${n[1]} at the ${who}'s home Grand Prix.`,
			};
		case "grille":
			return { compute: (db) => A.byGrid(c(db)), description: "Wins by starting grid position, from the furthest back.", subject: "Grid", value: "Wins" };
		case "grille-different":
			return { compute: (db) => A.distinctBy(c(db), (r) => (r.grid && r.grid > 0 ? r.grid : null)), description: "Wins from the most different grid positions.", value: "Positions" };
		case "sans-etre-champion":
			return { compute: (db) => winsWithoutTitle(db), description: "Most wins in a season in which the driver did not become champion.", detail: "Season" };
		case "sans-pole":
			if (family === "victoire") return { compute: (db) => A.total({ db, kind, metric: "winNoPole" }), description: "Most wins not started from pole position." };
			return { compute: (db) => S.startsWithout(db, kind, ["poles"]), description: `Most Grands Prix without a pole position.`, value: "GPs" };
		case "avec-meilleur-tour":
			return { compute: (db) => A.total({ db, kind, metric: "winFastestLap" }), description: "Most wins with the fastest lap." };
		case "different-consecutif":
			return { compute: (db) => A.differentConsecutive(c(db)), description: `Longest runs of Grands Prix each won by a different ${who}.`, subject: "Races", value: "GPs" };
		case "par-annee":
			return { compute: (db) => A.differentPerYear(c(db)), description: `Seasons with the most different drivers scoring ${n[1]}.`, subject: "Season", value: "Drivers" };
		case "et-victoire":
			return { compute: (db) => A.total({ db, kind, metric: "poleWin" }), description: "Most wins from pole position." };
		case "non-partant":
			return { compute: (db) => A.total({ db, kind, metric: "poleNoStart" }), description: "Pole positions where the driver then did not start the race." };
		case "sans-victoire":
			if (family === "pole") return { compute: (db) => A.total({ db, kind, metric: "poleNoWin" }), description: "Most pole positions not converted into a win." };
			if (metric === "starts") return { compute: (db) => S.startsWithout(db, kind, ["wins"]), description: `Most Grands Prix without ever winning.`, value: "GPs" };
			return { compute: (db) => A.totalWithout(c(db), ["wins"]), description: `Most ${n[1]} without ever winning a Grand Prix.` };
		case "sans-podium":
			if (metric === "starts") return { compute: (db) => S.startsWithout(db, kind, ["podiums"]), description: "Most Grands Prix without ever finishing on the podium.", value: "GPs" };
			return { compute: (db) => A.totalWithout(c(db), ["podiums"]), description: `Most ${n[1]} without ever finishing on the podium.` };
		case "sans-meilleur-tour":
			return { compute: (db) => S.startsWithout(db, kind, ["fastestLaps"]), description: "Most Grands Prix without ever setting a fastest lap.", value: "GPs" };
		case "sans-vicpolmt":
			return { compute: (db) => S.startsWithout(db, kind, ["wins", "poles", "fastestLaps"]), description: "Most Grands Prix without a win, a pole position or a fastest lap.", value: "GPs" };
		case "sans-point":
			return { compute: (db) => S.startsWithout(db, kind, ["points"]), description: "Most Grands Prix without ever scoring a point.", value: "GPs" };
		case "moyenne":
			return { compute: (db) => A.average(c(db), 1), description: `Average ${n[1]} per Grand Prix started.`, value: "Average" };
		case "moyenne-saison":
			return { compute: (db) => A.averagePerSeason(c(db), 1), description: `Average ${n[1]} per season contested.`, value: "Average" };
		case "2e":
			return { compute: (db) => A.total({ db, kind, metric: "seconds" }), description: "Most 2nd places.", value: "2nd places" };
		case "3e":
			return { compute: (db) => A.total({ db, kind, metric: "thirds" }), description: "Most 3rd places.", value: "3rd places" };
		case "2et3e":
			return { compute: (db) => A.total({ db, kind, metric: "secondsThirds" }), description: "Most 2nd and 3rd places combined.", value: "2nd + 3rd" };
		case "avant-victoire":
			return { compute: (db) => A.beforeFirst(c(db), "wins"), description: "Podiums before the first win." };
		case "moyenne-age":
			if (metric === "starts") return { compute: (db) => S.averageAge(db, "grid", "asc"), description: "Grands Prix with the youngest field: average age of the starters.", subject: "Race", value: "Average age" };
			return { compute: (db) => S.averageAge(db, "podium", "asc"), description: "Youngest podiums by the average age of the three drivers.", subject: "Race", value: "Average age" };
		case "identique":
			return { compute: (db) => S.combos(db, "identical"), description: "The same three drivers in the same order on the podium.", subject: "1st / 2nd / 3rd", value: "Times" };
		case "trio":
			return { compute: (db) => S.combos(db, "trio"), description: "The same three drivers on the podium, in any order.", subject: "Drivers", value: "Times" };
		case "duo":
			return { compute: (db) => S.combos(db, "duo"), description: "Pairs of drivers most often on the podium together.", subject: "Drivers", value: "Times" };
		case "duo12":
			return { compute: (db) => S.combos(db, "duo12"), description: "Pairs of drivers most often finishing 1st and 2nd.", subject: "Drivers", value: "Times" };
		case "double":
			if (family === "pole") return { compute: (db) => A.total({ db, kind, metric: "poleOneTwos" }), description: "Most qualifying one-twos.", value: "One-twos" };
			return { compute: (db) => A.total({ db, kind, metric: "oneTwos" }), description: "Most one-two finishes.", value: "One-twos" };
		case "triple":
			return { compute: (db) => A.total({ db, kind, metric: "oneTwoThrees" }), description: "Most one-two-three finishes.", value: "1-2-3s" };
		case "double-consecutif":
			return { compute: (db) => A.streak({ db, kind, metric: "oneTwos" }), description: "Most consecutive one-two finishes.", value: "One-twos" };
		case "double-annee":
			return { compute: (db) => A.inYear({ db, kind, metric: "oneTwos" }), description: "Most one-two finishes in a season.", value: "One-twos" };
		case "pilote":
			return { compute: (db) => A.distinctDrivers(c(db)), description: `Nations by the number of different drivers with ${n[1]}.`, value: "Drivers" };
		case "tour":
			return { compute: (db) => A.total({ db, kind, metric: "laps" }), description: "Most laps raced.", value: "Laps" };
		case "kms":
			return { compute: (db) => A.total({ db, kind, metric: "km" }, { share: false }), description: "Most kilometres raced.", value: "Km" };
		case "championnat":
			return { compute: (db) => T.leaderCount(db, kind as "driver" | "constructor"), description: "Most Grands Prix after which the championship was led.", value: "GPs" };
		case "championnat-age":
			return { compute: (db) => T.youngestLeader(db), description: "Youngest drivers to lead the World Championship.", value: "Age" };
		case "championnat-consecutif":
			return { compute: (db) => T.leaderStreak(db, kind as "driver" | "constructor"), description: "Longest runs of consecutive Grands Prix leading the championship.", value: "GPs" };
		case "avec-champion":
			return { compute: (db) => T.fieldWith(db, "champion"), description: "Grands Prix with the most world champions on the grid (drivers already champion at the time).", subject: "Race", value: "Champions", detail: "Champions" };
		case "avec-vainqueur":
			return { compute: (db) => T.fieldWith(db, "winner"), description: "Grands Prix with the most Grand Prix winners on the grid (drivers who had already won).", subject: "Race", value: "Winners", detail: "Winners" };
		case "meme-coequipier":
			return { compute: (db) => S.teammates(db), description: "Teammate pairs by Grands Prix started together.", subject: "Drivers", value: "GPs" };
		case "saison":
			return { compute: (db) => S.seasonsCount(db, kind), description: "Most seasons with at least one Grand Prix start.", value: "Seasons" };
		case "premiere-ligne":
			return { compute: (db) => A.total({ db, kind, metric: "frontRow" }), description: "Most starts from the front row (grid 1 or 2).", value: "Front rows" };
		case "premiere-ligne-consecutive":
			return { compute: (db) => A.streak({ db, kind, metric: "frontRow" }), description: "Most consecutive front-row starts.", value: "Front rows" };
		case "premiere-ligne-verouille":
			return { compute: (db) => A.total({ db, kind, metric: "frontRowLockouts" }), description: "Most front-row lockouts (grid 1 and 2).", value: "Lockouts" };
		case "hattrick":
			return { compute: (db) => A.total({ db, kind, metric: "hatTricks" }), description: "Most hat tricks (pole, win and fastest lap).", value: "Hat tricks" };
		case "chelem":
			return { compute: (db) => A.total({ db, kind, metric: "grandSlams" }), description: "Most grand slams (pole, win, fastest lap, led every lap).", value: "Grand slams" };
		case "non-qualifie":
			return { compute: (db) => S.neverQualified(db, kind as "driver" | "constructor"), description: "Entrants that never started a Grand Prix, by number of attempts.", value: "Entries" };
		case "modele":
			return { unavailable: "Neither F1DB's race results nor Jolpica record which chassis model each car raced with (F1DB only lists a team's chassis per season).", description: "Wins by chassis model." };
		case "type":
			return { unavailable: "Neither F1DB's race results nor Jolpica record the engine model or configuration each car raced with (F1DB only lists a team's engines per season).", description: "By engine type (V8, V10...)." };
	}
	throw new Error(`No implementation for ${section}/${family}/${leaf}`);
}

function titleImpl(kind: Kind, leaf: string): Impl {
	const label = kind === "driver" ? "drivers'" : "constructors'";
	switch (leaf) {
		case "nombre":
			return {
				compute: (db) => T.titleCount(db, kind),
				description:
					kind === "driver"
						? "Most drivers' World Championships."
						: kind === "constructor"
							? "Most constructors' World Championships."
							: kind === "engine"
								? "Most constructors' World Championships won with the engine."
								: kind === "nation"
									? "Drivers' World Championships by nationality."
									: "Drivers' World Championships by the champion's car number.",
				detail: "Seasons",
			};
		case "chronologie":
			return { compute: (db) => T.titleChronology(db, kind), description: `Every ${kind === "engine" || kind === "constructor" ? "constructors'" : "drivers'"} title in order, dated by the race at which it was decided.`, value: "Season" };
		case "age":
			return { compute: (db) => T.titleAge(db), description: "Youngest world champions, by age at the race that decided the title.", value: "Age" };
		case "doyen":
			return { compute: (db) => T.livingChampions(db), description: "Oldest living world champions (age today).", value: "Age" };
		case "consecutif":
			return { compute: (db) => T.titleStreak(db, kind), description: `Most consecutive ${label} titles.`, detail: "Seasons" };
		case "interval":
			return { compute: (db) => T.titleInterval(db, kind), description: `Longest gaps between two ${label} titles.`, value: "Gap" };
		case "gp-avant":
			return { compute: (db) => T.titleBefore(db, "gp"), description: "Fewest Grands Prix started up to the race that decided the first title.", value: "GPs" };
		case "saison-avant":
			return { compute: (db) => T.titleBefore(db, "season"), description: "Fewest seasons contested before the first title season.", value: "Seasons" };
		case "victoire":
			return { compute: (db) => T.titleWins(db, kind as "driver" | "constructor"), description: "Wins in each title-winning season.", value: "Wins" };
		case "ecart":
			return { compute: (db) => T.titleMargin(db, kind as "driver" | "constructor"), description: "Largest points margins between the champion and the runner-up.", value: "Margin" };
		case "constructeur-different":
			return { compute: (db) => T.titleDistinct(db, "constructor"), description: "Champions with titles for the most different constructors.", value: "Constructors" };
		case "moteur-different":
			return { compute: (db) => T.titleDistinct(db, "engine"), description: "Champions with titles with the most different engines.", value: "Engines" };
		case "constructeur":
			return { compute: (db) => T.driverConstructorTitles(db), description: "Seasons in which the driver's team won the constructors' championship.", value: "Titles" };
		case "vice-champion":
			return { compute: (db) => T.championshipPlaces(db, kind as "driver" | "constructor", [2]), description: "Most runner-up finishes in the championship.", value: "Times" };
		case "podium":
			return { compute: (db) => T.championshipPlaces(db, kind as "driver" | "constructor", [1, 2, 3]), description: "Most top-three finishes in the championship.", value: "Times" };
		case "meilleur-classement":
			return { compute: (db) => T.bestRanking(db), description: "Each driver's best final championship position, and how many times.", value: "Best" };
		case "pilote":
			if (kind === "nation") return { compute: (db) => T.nationChampions(db), description: "Nations by number of different world champions.", value: "Champions" };
			return {
				compute: (db) => T.titleCount(db, kind === "engine" ? "driver-of-engine" : "driver-of-constructor"),
				description: `Drivers' World Championships won with the ${kind}.`,
				detail: "Seasons",
			};
	}
	throw new Error(`No title implementation for ${kind}/${leaf}`);
}

function miscImpl(kind: Kind, leaf: string): Impl {
	const tot = (metric: MetricId, description: string, value: string): Impl => ({ compute: (db) => A.total({ db, kind, metric }), description, value });
	const streak = (metric: MetricId, description: string, value: string): Impl => ({ compute: (db) => A.streak({ db, kind, metric }), description, value, detail: "Run" });
	const young = (metric: MetricId, description: string): Impl => ({ compute: (db) => A.age({ db, kind, metric }, "youngest"), description, value: "Age" });
	switch (leaf) {
		case "saison":
			return { compute: (db) => S.seasonsCount(db, kind), description: "Most seasons with at least one Grand Prix start.", value: "Seasons" };
		case "engagement":
			return tot("entries", "Most Grand Prix entries, including non-qualifications and non-starts.", "Entries");
		case "hattrick":
			return tot("hatTricks", "Most hat tricks (pole position, win and fastest lap).", "Hat tricks");
		case "hattrick-age":
			return young("hatTricks", "Youngest drivers to score a hat trick.");
		case "chelem":
			return tot("grandSlams", "Most grand slams (pole, win, fastest lap and led every lap).", "Grand slams");
		case "chelem-age":
			return young("grandSlams", "Youngest drivers to score a grand slam.");
		case "premiere-ligne":
			return tot("frontRow", "Most starts from the front row (grid 1 or 2).", "Front rows");
		case "premiere-ligne-duo":
			return { compute: (db) => S.combos(db, "front-row"), description: "Pairs of drivers most often sharing the front row.", subject: "Drivers", value: "Times" };
		case "premiere-ligne-age":
			return young("frontRow", "Youngest drivers to start from the front row.");
		case "premiere-ligne-consecutive":
			return streak("frontRow", "Most consecutive front-row starts.", "Front rows");
		case "grille-moyenne":
			return { compute: (db) => S.averageGrid(db, 20), description: "Best average starting position (minimum 20 starts).", value: "Average" };
		case "qualification":
			return tot("qualiFastest", "Most times fastest in qualifying (even when a penalty moved them off pole).", "Times");
		case "arrivee":
			return tot("finishes", "Most races finished (classified and running at the end).", "Finishes");
		case "arrivee-consecutive":
			return streak("finishes", "Most consecutive races finished.", "Finishes");
		case "classe":
			return tot("classified", "Most times classified in the results.", "Classified");
		case "classe-consecutif":
			return streak("classified", "Most consecutive classified finishes.", "Classified");
		case "abandon":
			return tot("retirements", "Most retirements.", "Retirements");
		case "abandon-consecutif":
			return streak("retirements", "Most consecutive retirements.", "Retirements");
		case "abandon-tour1":
			return tot("lap1Retirements", "Most retirements on the opening lap.", "Retirements");
		case "tour-vainqueur":
			return tot("leadLap", "Most finishes on the same lap as the winner.", "Finishes");
		case "position":
			return { compute: (db) => S.gridPositions(db), description: "For each starting grid position, the drivers who started there most often (top three).", subject: "Grid position", value: "Starts", detail: "Drivers" };
		case "gain":
			return { compute: (db) => S.positionsGained(db), description: "Most places gained from the grid to the finish in one race.", value: "Gained" };
		case "premier-gp-grille":
			return { compute: (db) => S.debutOrFinal(db, "first", "grid"), description: "Best grid positions on a driver's first Grand Prix.", value: "Grid" };
		case "premier-gp-classement":
			return { compute: (db) => S.debutOrFinal(db, "first", "result"), description: "Best results on a driver's first Grand Prix.", value: "Result" };
		case "dernier-gp-classement":
			return { compute: (db) => S.debutOrFinal(db, "last", "result"), description: "Best results on a driver's last Grand Prix (to date).", value: "Result" };
		case "non-qualifie":
			return { compute: (db) => S.neverQualified(db, "driver"), description: "Drivers who entered but never started a Grand Prix, by number of attempts.", value: "Entries" };
		case "disqualifie":
			return tot("disqualified", "Most disqualifications and exclusions.", "Times");
		case "premier-sans-gagner":
			return {
				coverage: LAPS,
				compute: (db) => L.eventsByDriver(db, "firstAcrossNotWinner", (idx, id) => L.classifiedAs(db, idx, id)),
				description: "Drivers who led the final lap (first across the line) but were not credited with the win, after a penalty or disqualification.",
				value: "Times",
				detail: "Races",
			};
		case "concurrent":
			return { compute: (db) => S.competitors(db), description: "Most different drivers raced against.", value: "Drivers" };
		case "troisieme-pilote":
			return {
				compute: (db) => S.thirdDriversOnly(db),
				description: "Drivers who only ever took part in Grand Prix weekends as Friday test/third drivers, by practice weekends (F1DB records them since 2003).",
				value: "Weekends",
				detail: "Teams / seasons",
			};
		case "femmes":
			return { compute: (db) => S.women(db), description: "Women who entered a World Championship Grand Prix.", value: "Starts", detail: "Entries / points / years" };
		case "famille":
			return { compute: (db) => S.family(db), description: "Family relationships between Grand Prix drivers.", value: "Relationship", detail: "Related driver" };
		case "decede":
			return { compute: (db) => S.passedAway(db), description: "Grand Prix drivers who have passed away, most recent first, with their age (and the race, for those who died at a Grand Prix meeting).", value: "Age", detail: "Date" };
		case "pole-victoire":
			return tot("poleWin", "Most wins from pole position.", "Wins");
	}
	throw new Error(`No misc implementation for ${kind}/${leaf}`);
}

function grandPrixImpl(family: string, leaf: string): Impl {
	if (family === "decisif") {
		switch (leaf) {
			case "pilote":
				return { compute: (db) => T.deciderChronology(db, "driver"), description: "The race at which each drivers' title was mathematically decided.", subject: "Race", value: "Decided", detail: "Champion" };
			case "constructeur":
				return { compute: (db) => T.deciderChronology(db, "constructor"), description: "The race at which each constructors' title was mathematically decided.", subject: "Race", value: "Decided", detail: "Champion" };
			case "grandprix":
				return { compute: (db) => T.deciderPlaces(db, "gp"), description: "Grands Prix at which the most titles (drivers' and constructors') were decided.", value: "Titles", detail: "Seasons" };
			case "circuit":
				return { compute: (db) => T.deciderPlaces(db, "circuit"), description: "Circuits at which the most titles (drivers' and constructors') were decided.", value: "Titles", detail: "Seasons", subject: "Circuit" };
		}
	}
	if (family === "entete")
		return {
			coverage: LAPS,
			compute: (db) => L.raceLeaders(db, leaf === "lemoins" ? "asc" : "desc"),
			description: `Grands Prix with the ${leaf === "lemoins" ? "fewest" : "most"} different leaders.`,
			subject: "Race",
			value: "Leaders",
			detail: "Leaders",
		};
	if (family === "divers" && leaf === "endsc")
		return { unavailable: "Neither F1DB nor Jolpica records safety car periods, so races that finished behind the safety car can't be identified.", description: "Races that finished behind the safety car." };
	const metric: Record<string, RaceMetricId> = { tour: "laps", kms: "distance", arrivee: "finishers", temps: "duration", moyenne: "speed", ecart: "margin", nation: "nations" };
	const words: Record<string, string> = {
		tour: "laps",
		kms: "race distance",
		arrivee: "classified finishers",
		temps: "race duration (winner's time)",
		moyenne: "winner's average speed",
		ecart: "winning margin",
		nation: "nationalities among the starters",
	};
	const m = metric[family];
	const dir = leaf === "lemoins" ? "asc" : "desc";
	return {
		compute: (db) => raceExtremes(db, m, dir),
		description: `Grands Prix with the ${leaf === "lemoins" ? "smallest" : "largest"} ${words[family]}.`,
		subject: "Race",
		detail: "Winner",
	};
}

/* ------------------------------------------------- small bespoke helpers --- */

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function startStreak(db: Db, kind: Kind): RecordRow[] {
	return A.streakOverAllRaces({ db, kind, metric: "starts" });
}

function retainedPoints(db: Db, kind: "driver" | "constructor"): RecordRow[] {
	return A.standingsPoints(db, kind);
}

function winsWithoutTitle(db: Db): RecordRow[] {
	const champ = new Set(T.titles(db, "driver").map((t) => `${t.id}|${t.year}`));
	return rerank(A.inYear({ db, kind: "driver", metric: "wins" }).filter((r) => !champ.has(r.key)));
}

/* -------------------------------------------------------------- catalogue --- */

export function buildCatalogue(): RecordCategory[] {
	const out: RecordCategory[] = [];
	const ids = new Set<string>();
	for (const line of SOURCE.trim().split("\n")) {
		const [path, title] = line.split("|");
		const [section, family, leaf] = path.split("/");
		const s = SECTION[section];
		const famKey = section === "numero" && family === "pilote" ? "numeropilote" : family;
		const fam = FAMILIES[famKey];
		const impl = implFor(section, family, leaf);
		let leafSlug = LEAF[leaf] ?? leaf;
		if (leaf === "pilote") leafSlug = family === "champion" ? (section === "nation" ? "different-champions" : "driver-titles") : section === "nation" && family === "gp" ? "drivers" : "by-driver";
		if (family === "champion" && leaf === "ecart") leafSlug = "margin";
		if (family === "champion" && leaf === "interval") leafSlug = "interval";
		if (section === "gp" && family === "decisif") leafSlug = { pilote: "drivers-chronology", constructeur: "constructors-chronology", grandprix: "by-grand-prix", circuit: "by-circuit" }[leaf]!;
		const id = `${s.slug}/${fam.slug}/${leafSlug}`;
		if (ids.has(id)) throw new Error(`Duplicate record id ${id}`);
		ids.add(id);
		out.push({
			id,
			entity: s.entity,
			family: fam.label,
			title: title.trim(),
			description: impl.description,
			available: !impl.unavailable,
			unavailableReason: impl.unavailable,
			columns: { subject: impl.subject ?? s.subject, value: impl.value ?? fam.value, detail: impl.detail },
			...(impl.coverage ? { coverage: impl.coverage } : {}),
			compute: impl.compute,
		});
	}
	return out;
}

export { fmt };
