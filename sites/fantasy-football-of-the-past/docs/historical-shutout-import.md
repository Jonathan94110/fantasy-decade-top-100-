# Reviewed historical QB extension

This bounded review includes 24 actual QB performances for seven existing historical
profiles: Otto Graham (1), Bobby Layne (2), Norm Van Brocklin (2), Y.A. Tittle (4),
Johnny Unitas (8), Bart Starr (3), and Sonny Jurgensen (4). There are 21 regular-season
and three postseason records. It is not complete-career coverage.

## Source and quality review

The source is zynicide's version-1 NFL Football Player Stats dataset. Its public
Kaggle JSON-LD declares CC0. The downloaded ZIP SHA-256 is
`d75baf50cf201d4efe4eb67af8963927f1f5b8a5877c9c9807eca5233ff84835`, identical to the
previously audited snapshot. The source-use basis is that uploader declaration for
this user-approved owner-private review; this does not assert upstream PFR
clearance or permission to reuse the separate Stathead exports.

A streaming audit inspected all 1,024,164 original game rows and found exactly one
original row for each selected player/date. Every one of the nine supplied active
offense categories was explicitly finite and nonblank in these 24 raw rows. They
match the user's workbook, including its disclosed correction of swapped passing
completions/attempts. The producer's `num(None/empty) -> 0` transformation was
identified and is not used as evidence: the selected originals contain no such
missing required cells. Raw source rows, reviewed identity crosswalks and exact
final-score evidence are retained in `data/historical-import/reviewed-source.json`
and `identity-map.json`.

Official club schedules independently confirm date, home/away, opponent, FINAL
status and a zero final team score for all 24 records. Positive corrected passing
attempts establish participation. Birth/age, passing count/rating and source
arithmetic controls pass. Selected NFL passing/rushing lines corroborate the
source; not every numeric source value is independently corroborated. Provider
numeric assertions remain distinct from independently established values.

The original source lacks lost fumbles, two-point credits and the offensive
recovery-TD split. Their raw values remain null. A credited conversion or recovery
TD adds positive team points, so each verified completed team shutout proves
`twoPoint: 0` and `fumbleRecoveryTD: 0` separately for scoring. This proof never
supplies missing yardage, receptions or lost fumbles. Irrelevant defense fields are
omitted from these offensive records. Negative source yardage is preserved.

Original team-game ordinals stay in `sourceWeek`; independently verified schedule
weeks populate `week`. Postseason numerical weeks remain null and display a
postseason label. The 1950 Baltimore Colts retain a separate franchise identity
from the Colts franchise beginning in 1953. IDs use reviewed source identifiers,
date and historical teams; names are never runtime identity joins.

## Read-only review and selection bias

This is a **shutout-selected, low-scoring sample**, not a representative career
pool. It is exposed only at `/historical-game-review`, with a prominent explanation
of the selection bias and an explicit review-only label. It is excluded from all
normal ATHLETES/PERFORMANCES, catalog eligibility, scouting, drafts, roster moves,
random draws and seasons. Normal playable totals remain 435 entities and 68,519
performances. The existing random sampling rules are unchanged.

The review uses current version 4 scoring to inspect inputs and receipts. Raw lost
fumbles remain null; saved legacy games and completed records remain unchanged.
D/ST fumble recoveries and offensive recovery touchdown credit keep their existing
point values. The review never writes league state or consumes a game.

Each of the seven smaller pools also has fewer than 17 games. The existing 17-game
opening-season requirement remains unchanged; meeting that count later would not
itself resolve this sample's selection bias.

## Other supplied sources

The refreshed WR, TE, RB, K and DEF sources were inspected by column name. Their
completion flags do not themselves establish scorer completeness or participation.
1999 rows already present in the existing archive are not imported again; conflicting
DEF corrections do not overwrite preserved modern records. Unsupported and
incomplete rows stay excluded. The supplied QB Google export returned HTTP 401;
this review instead uses the independently downloaded, pinned original snapshot
matched to the workbook. No access or sharing settings were changed.

The 56 separately staged Starr/Unitas 1966–1967 Stathead records are not included.
Their source-use gate and non-shutout recovery-TD proof requirements remain separate.

## Rebuild

Run `python3 scripts/build-reviewed-shutout-import.py`. It validates retained
source rows and verified final-zero premises before emitting the two review JSON
files. It uses no network and does not modify live league state. Source archives
and the user's full workbook are not bundled with the Site.
