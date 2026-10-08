# Decade Top 100 bot

Ranks the top 100 **QBs, RBs, WRs, kickers and team defenses (D/ST)** of every NFL decade by fantasy points, and writes static JSON your fantasy site can use.

- `index.html`: browse the rankings.
- `bot.html`: run the bot and change scoring from the browser.

Data sources:

- **1999 to now:** weekly stats from [nflverse](https://github.com/nflverse/nflverse-data) (free, CC-BY 4.0), covering players, kickers, team defense and schedules.
- **Before 1999:** loaded by `bot/legacy.py`. The sources for this are still being chosen and checked, and until then the lists start at 1999.

## How ranking works

- **Players** are ranked on regular-season fantasy points scored *inside the decade*. A career that spans two decades is ranked in both. FBs count as RBs.
- **Team defenses** are ranked as team-seasons (for example the 2000 Ravens). A decade has only about 30 franchises, so 100 franchise-decades isn't possible.
- Lists are shorter than 100 when fewer players exist. A decade typically has only about 90 kickers who kicked at all.

## Run it from the browser (`bot.html`)

1. **Open the page.**
   - **With GitHub Pages:** open https://jonathan94110.github.io/fantasy-decade-top-100-/bot.html. Turn Pages on once under **Settings → Pages → Source: GitHub Actions**. (If you make the repo private later, Pages needs a paid GitHub plan.)
   - **Without Pages:** download the repo (**Code → Download ZIP**) and open `bot.html` from the folder.
2. **Connect.** Make a [fine-grained GitHub token](https://github.com/settings/personal-access-tokens/new) with access to only this repository. Set **Actions** and **Contents** to **Read and write**. Paste it into the page. It stays in your browser (for this tab only, unless you tick "Remember on this device") and is sent only to GitHub.
3. **Run now** starts the bot and shows each step live.
4. **Scoring & list size** edits `bot/scoring.json` in the repo. **Save & run** applies it right away. The weekly runs use the same settings.

`index.html` reads the rankings from the Pages site. When it can't (no Pages, or opened from disk), it reads them through GitHub using the token you connected in `bot.html`.

## Run it on your computer

```sh
pip install -r bot/requirements.txt
python bot/fetch_stats.py            # every decade, list_size from scoring.json
python bot/fetch_stats.py --top 50   # shorter lists
python bot/fetch_stats.py --force    # re-download everything
```

Downloads are cached in `.cache/` (gitignored). The `Fantasy stats bot` GitHub Action (`.github/workflows/fantasy-stats.yml`) reruns this every Tuesday from September through February. It commits changes and redeploys Pages. You can also run it from the Actions tab.

## Output (`data/top100/`)

| File | Contents |
| --- | --- |
| `index.json` | Decades, list sizes, scoring, coverage notes |
| `<decade>.json` (e.g. `1980s.json`) | `positions.QB / RB / WR / K / DEF`: ranked lists. Players include decade totals, all three scoring formats, best season and `season_lines` |
| `games/<decade>.json` | Game logs (regular season and playoffs) for the ranked players and defenses, stored column-wise as `{columns, rows}` |

```js
const { positions } = await (await fetch("data/top100/2000s.json")).json();
positions.RB[0].name; // "LaDainian Tomlinson"

const logs = await (await fetch("data/top100/games/2000s.json")).json();
const { columns, rows } = logs.RB;
const games = rows.map(r => Object.fromEntries(columns.map((c, i) => [c, r[i]])));
```

## Scoring (`bot/scoring.json`)

Edit it here or on `bot.html`, then rerun the bot to rescore and re-rank everything. `list_size` sets how many make each list. `rank_by` picks the offensive format used for ranking: `ppr`, `half_ppr` or `standard`.

| Position | Default scoring |
| --- | --- |
| Offense | 25 passing yards = 1 point. Passing TD = 4. Interception = −2. 10 rushing/receiving yards = 1 point. Rushing/receiving TD = 6. Fumble lost = −2. 2-point conversion = 2 |
| Kickers | Field goal: 3 points under 40 yards, 4 for 40–49, 5 for 50+. Missed FG = −1. Extra point = 1. Missed extra point = −1 |
| D/ST | Sack = 1. Interception = 2. Fumble recovery = 2. Defensive or return TD = 6. Safety = 2. Blocked kick = 2. Points allowed per game: 0 = +10, 1–6 = +7, 7–13 = +4, 14–20 = +1, 21–27 = 0, 28–34 = −1, 35+ = −4 |
