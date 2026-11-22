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

## Fresh questions every run
Opening a realm's briefing asks Claude to write a new set of questions from that station's material (teaching signs, cases, updates to the notes, the Recall Drill): gate and leap MCQs (including pick-all-that-apply), true/false wisps and chase lanes, and guardian recall questions. It's told to use only facts in the material, to follow the current guidance where the notes are outdated, and to avoid the stems you've seen recently (remembered per realm). Starting the realm waits for the set, with an option to skip. Without Claude, runs use the question bank least-recently-seen first, topped up with MCQs built from the Recall Drill, so consecutive runs don't repeat. Missed questions, including generated ones, go to the Review Shrine for spaced review.

## Thinking while you play
- **Fact wisps** float through each realm carrying a short statement. Stomp the TRUE ones (XP, Insight); stomping a FALSE one costs a heart and shows the correction.
- **True-or-false lanes** inside every chase: a statement appears, and you climb to the high road for TRUE or stay low for FALSE. The wrong lane is a dead end while the chase closes in.
- **Timed gates** (longer with Wisdom), plus timed hazards (pulse spikes, falling rocks) and parrying: dash into a guardian's shot to reflect it and stagger the guardian.

## Characters
Create as many registrars as you like: a name, a starting specialty (Generalist, Theatre, Birth suite, Clinic or Ward registrar, each with its own stat bonus), and a look (skin tone, hair colour and style, white coat, scrubs or theatre gown with colour, cape, glasses, headwear), with a live animated preview and a Randomise button. Switch between registrars, change a look later, or delete one (tap twice). Each registrar has their own level, stats and equipment; stars, pearls and the review schedule are shared because they track your learning. An older save becomes "Registrar".

## Character development
XP comes mostly from learning: right answers, solved rooms, pearls, guardian recall, true wisps, and the Review Shrine. Each level gives a stat point:
- **Vitality**: +1 heart per 2 points. **Agility**: run speed, dash speed and recovery. **Might**: pound radius, stagger length, and at 5+ a full-marks recall strike hits twice. **Wisdom**: longer gate timers and more Insight.

Eighteen pieces of equipment across six slots (head, body, hands, feet, charm, tool), two per realm: one in a riddle chest you open by answering a question, one dropped by the guardian. Some carry perks (triple jump, two air dashes, a hazard ward, heart regeneration at banners, extra Insight). Press C or open Character from the map to spend points and swap gear. Character data is saved with your progress.

## Puzzle rooms
One single-screen room per realm, after the chase. The camera locks and zooms so the whole puzzle fits. Press ↓ on the ground to pull levers, pick up and place items; R resets. Each room turns one fact into a machine, and wrong moves play out their consequence:

Every room is randomised per attempt (positions, patients, scenarios), so it tests the concept rather than memory:

| Realm | Room | What it tests |
|---|---|---|
| PCOS | The Liver's Chains | Only three levers can be powered: choose the three that raise SHBG (COCP, metformin, lifestyle) |
| IVF/OHSS | The Leaking Vessels | Seal the leak (GnRH agonist trigger, freeze-all), IV fluids not diuretics, LMWH not NSAIDs |
| HMB | Too Deep to Burn | A random patient decides the treatment (LNG-IUS vs hysterectomy; COCP contraindications); ablation fails deep disease |
| Endometriosis | Water Under the Bridge | Mirrored layout: stent the tube that wriggles, then clamp the artery hugging the cervix |
| Cystectomy | Virchow's Triangle | Prevent or treat? Prophylactic vs treatment-dose LMWH, stockings, mobilisation; D-dimer and aspirin traps |
| Collapse | The Vagal Brake | Order matters: help, stop, position, then atropine; IV adrenaline and sitting up are traps |
| Torsion | Untwist the Ovary | Read the twist and turn against it; don't trust a normal Doppler; conserve the dusky ovary |
| Fibroid | The Glycine Tank | Add up fibroid deficits, know a frail vs fit patient's limits, choose glycine or saline, or stage it |
| Tamoxifen | Two Faces of Tamoxifen | Random CYP2D6 inhibitors vs safe alternatives; no oestrogen or tibolone; investigate bleeding |

Room text lives in `src/content.js` (`ROOMS`); room machines in `src/rooms.js`.

## Moves and level pieces
Double jump, wall slide and wall jump, air dash, ground pound. Wall-jump shafts, moving platforms, crumbling bridges, springs, spikes, turrets, hoppers, fliers, remedies (+1 heart), and a themed **chase** in every realm (the Crimson Flood, Rising Glycine, the Hot Flush and others). Score, answer streaks and a rank (S needs 3 stars and all 3 pearls).

## Files
- `src/content.js` – all study content (levels, questions, explanations, custom recall).
- `src/game.html` – page markup and styles.
- `src/engine.js` – level generator, physics, rendering, dialogs and progress.
- `src/rooms.js` – the puzzle-room framework and the nine room machines.
- `src/polish.js` – terrain rendering (cached chunks), lighting and depth, sprite outlines, timed hazards, true/false lanes.
- `src/progress.js` – XP, levels, stats, equipment, riddle chests, guardian loot, fact wisps and the character sheet.
- `src/questions.js` – fresh question generation per run, validation, seen-stem tracking and the bank fallback.
- `drill-week1.json` – week-one questions extracted from the OSCE Recall Drill (`tools/extract-drill.mjs`).
- `index.html` – built single-file game: `node tools/build.mjs`.

Open `index.html` in any browser. Controls: arrow keys or A/D to move, Space/W/↑ to jump, Shift or X to dash, ↓ or S to ground-pound in the air (or use levers, items and chests on the ground), H to spend Insight at a leap, E to reread a sign, C for the character sheet, R to reset a puzzle room; on-screen buttons on phones.
