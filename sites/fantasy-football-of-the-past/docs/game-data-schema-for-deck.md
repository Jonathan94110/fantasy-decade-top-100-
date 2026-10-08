# Fantasy Football of the Past: data requirements

Current game setup uses version 4 scoring. New solo games and new online leagues disable individual lost-fumble penalties. Existing saved games and seasons retain their recorded scoring contracts; completed results remain recorded. Team-defense fumble recoveries and offensive recovery touchdowns still earn points.

## Offensive formula

```
points = 0.04 × passingYards + 4 × passingTD − 2 × interceptions
       + 0.1 × (rushingYards + receivingYards)
       + 6 × (rushingTD + receivingTD + returnTD + fumbleRecoveryTD)
       + PPR × receptions + 2 × twoPoint
```

PPR is 0, 0.5 or 1. Round the final total to two decimal places. Version 4 assigns zero points to individual lost fumbles. Legacy contracts normally add −2 × fumblesLost; read the saved contract rather than assuming today's settings.

The eleven active offensive inputs are `passingYards`, `passingTD`, `interceptions`, `rushingYards`, `rushingTD`, `receptions`, `receivingYards`, `receivingTD`, `returnTD`, `fumbleRecoveryTD`, and `twoPoint`. A missing active field excludes that game unless a specific independent proof establishes its value. Raw `fumblesLost` may remain null when its penalty is disabled. Unknown is never silently converted to zero.

Passing completions and attempts do not earn points, but help verify participation and source quality. Keep original cells alongside reviewed corrections. Do not count a row as participation solely because it exists or the player started a different game.

## Kickers and team defense

Kickers require their actual offensive inputs plus `fieldGoalsShort`, `fieldGoals40`, `fieldGoals50`, `fieldGoalsMissed`, `fieldGoalsBlocked`, `extraPointsMade`, `extraPointsMissed`, and `extraPointsBlocked`. Made field goals earn 3, 4 or 5 points by distance bin; made extra points earn 1. Missed and blocked attempts each earn −1, without double counting.

Team defense requires `sacks`, `defensiveInterceptions`, `fumbleRecoveries`, `safeties`, `blockedKicks`, `defensiveTD`, `returnTD`, and `pointsAllowed`. Sacks earn 1; interceptions, opponent fumble recoveries, safeties and blocks earn 2 each; defensive and return touchdowns earn 6 each. Points-allowed bonuses are 10, 7, 4, 1, 0, −1 and −4 for 0, 1–6, 7–13, 14–20, 21–27, 28–34 and 35+ points. Use the opponent's complete final score. Defensive and return TD categories must be disjoint; offensive recoveries are not defensive takeaways.

## Required identity and evidence

Keep stable source player/team IDs, date, season, historical team and opponent, home/away, competition, REG/POST, completed-game status, source URLs, snapshot identity, and missing-field provenance. Preserve an actual NFL week separately from a team's game ordinal. Postseason week can remain unavailable. Match player identities explicitly rather than by name alone.

Normal gameplay currently contains 435 entities and 68,519 performances, including 40 kickers. Opening-season eligibility still requires 17 usable games and the existing roster rules. The separate `/historical-game-review` page contains 24 deliberately selected team-shutout QB games across seven identities, with zero normal-gameplay imports. This low-scoring sample is not representative of careers. It cannot supply a fair random performance pool.

## Supplied Sheet labels and access

The RB workbook's observed Notes title is **Fantasy Legends: Running Backs, 1950-1999**:
https://docs.google.com/spreadsheets/d/1W5ZDBUKwS5dL1yv0Z8v4qY1O9uxn8AoRefYDV2yy2pw/edit?gid=1603970957#gid=1603970957

The separately supplied workbook expected to be QB is:
https://docs.google.com/spreadsheets/d/1yaWyUb6dW8GnWDI5C8bZr1aGK6QR3jGum046fqw1a38/edit?gid=1016187214#gid=1016187214
Its unauthenticated XLSX export returned HTTP 401. Its actual title/schema have not been verified. No signed-in Chrome export was performed in this task; do not present the label or access as confirmed.

Sheets and producer CSVs do not update this Site automatically. Data changes require explicit validation and a new built deployment. Current normal archive rows and saved gameplay records were preserved.

No rendered-browser screenshots were captured in this task. Mounted DOM interaction tests are not screenshots or visual QA. Do not illustrate the deck with invented screenshots.
