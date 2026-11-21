# Gynae Realms

A browser platformer for studying **Week 1: General Gynae** (RANZCOG OSCE practice deck, 9 stations). Each station is a fantasy realm:

| Realm | Station |
|---|---|
| Realm of Wandering Moons | 1 · PCOS |
| The Alchemist's Hatchery | 2 · Subfertility, IVF, OHSS |
| The Crimson Floodlands | 3 · Heavy menstrual bleeding / adenomyosis |
| The Thornwood Labyrinth | 4 · Endometriosis and the ureter |
| The Dungeon of Complications | 5 · Ovarian cystectomy, bowel injury, PE, thrombophilia |
| The Fainting Spire | 6 · Collapse at IUD insertion |
| The Twisted Tower | 7 · Adnexal mass in pregnancy, torsion, mid-trimester loss |
| The Sunken Grotto | 8 · Submucosal fibroid, glycine overload, MHT |
| The Ember Sanctum | 9 · Tamoxifen, atypical hyperplasia, BRCA1 |

## How playing teaches
- **Signs** teach a concept; the next **gates** ask about it (multiple choice, results interpretation, pick-all).
- **Step tablets** must be touched in order (IVF steps, DRSABCD, ureter course, bowel-injury response).
- **Orb fields**: gather the right items and avoid the wrong ones, each with an explanation.
- A wrong answer costs a heart and shows the explanation; missed questions return at the **Echo Gate** before the boss.
- **Guardians** ask open recall questions (from the OSCE Recall Drill plus station notes); answers are typed or dictated and marked out of 2 by Claude, with self-marking as a fallback.
- The **Review Shrine** brings missed questions back on a 1, 3, 7, 28-day ladder.
- Where the 2023 deck is out of date (letrozole first line, tamoxifen 20 mg, danazol, evening primrose oil, egg-collection timing, MHT window), the game teaches current guidance and shows what the notes said.

## Files
- `src/content.js` – all study content (levels, questions, explanations, custom recall).
- `src/game.html` – engine and UI.
- `drill-week1.json` – week-one questions extracted from the OSCE Recall Drill (`tools/extract-drill.mjs`).
- `index.html` – built single-file game: `node tools/build.mjs`.

Open `index.html` in any browser. Controls: arrow keys or A/D to move, Space/W/↑ to jump, E to reread a sign; on-screen buttons on phones.
