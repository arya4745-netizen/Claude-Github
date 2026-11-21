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
- **Signs and scrolls** teach a concept (scrolls hold the sequences: IVF steps, DRSABCD, the ureter's course, bowel-injury response). The next **gates** ask about it in a dialog: multiple choice, results interpretation, pick-all.
- **Leap of Judgement**: the question hangs above lettered platforms. Jump up onto your answer; wrong platforms shatter under you (a heart and a slip), the right one opens the veil and shows the explanation.
- **Orb fields**: gather the right items and avoid the wrong ones, each with an explanation.
- **Pearls** (3 per realm, hidden under cracked floors, on high ledges, over wide gaps) each hold a high-yield fact the guardian may ask.
- **Insight** (up to 3) fills with right answers and pearls; spend it to clear a wrong option at a gate or leap.
- Missed questions return at the **Echo Gate** before the guardian, then in the **Review Shrine** on a 1, 3, 7, 28-day ladder.
- **Guardians** ask open recall (OSCE Recall Drill plus station notes), typed or dictated and marked out of 2 by Claude. At half health they enrage: a spike crown that only a ground pound breaks, shockwaves or shot rings.
- Where the 2023 deck is out of date (letrozole first line, tamoxifen 20 mg, danazol, evening primrose oil, egg-collection timing, MHT window, empirical endometriosis treatment), the game teaches current guidance and shows what the notes said.

## Moves and level pieces
Double jump, wall slide and wall jump, air dash, ground pound. Wall-jump shafts, moving platforms, crumbling bridges, springs, spikes, turrets, hoppers, fliers, remedies (+1 heart), and a themed **chase** in every realm (the Crimson Flood, Rising Glycine, the Hot Flush and others). Score, answer streaks and a rank (S needs 3 stars and all 3 pearls).

## Files
- `src/content.js` – all study content (levels, questions, explanations, custom recall).
- `src/game.html` – page markup and styles.
- `src/engine.js` – level generator, physics, rendering, dialogs and progress.
- `drill-week1.json` – week-one questions extracted from the OSCE Recall Drill (`tools/extract-drill.mjs`).
- `index.html` – built single-file game: `node tools/build.mjs`.

Open `index.html` in any browser. Controls: arrow keys or A/D to move, Space/W/↑ to jump, Shift or X to dash, ↓ or S to ground-pound, H to spend Insight at a leap, E to reread a sign; on-screen buttons on phones.
