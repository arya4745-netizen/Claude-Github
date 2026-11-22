/* ================= fresh questions every run =================
   When a realm's briefing opens, Claude writes a new set of questions from that station's material.
   Starting the realm waits for them (or lets you skip). Without Claude, the bank is used least-recently-seen first,
   topped up with MCQs built from the Recall Drill. Stems you've seen are remembered so they aren't asked again soon. */

const GEN = {};
const SEEN_MAX = 120;
const stemKey = q => String(q).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 90);
function seenList(id) { P.seen = P.seen || {}; return (P.seen[id] = P.seen[id] || []); }
function markSeen(id, stems) { const s = seenList(id); for (const t of stems) { const i = s.indexOf(t); if (i >= 0) s.splice(i, 1); s.push(t); } while (s.length > SEEN_MAX) s.shift(); save(); }
const genId = () => "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function materialFor(L) {
  const out = ["STATION: " + L.station + " (" + L.topic + ")", "CASE: " + L.brief, "TOPICS: " + L.chunks.join("; ")];
  for (const s of L.segs) {
    if (s.t === "sign") out.push("TEACHING: " + s.title + ": " + (s.steps ? s.steps.map((x, i) => (i + 1) + ") " + x[1]).join(" ") + " " : "") + (s.text || ""));
    if (s.note) out.push("UPDATE: old notes said " + s.note.said + "; current guidance: " + s.note.now + ".");
    if ((s.t === "gate" || s.t === "leap") && s.q) {
      const q = s.q;
      out.push("FACT: " + q.q + " Answer: " + (q.k === "multi" ? q.a.map(i => q.opts[i]).join("; ") : q.opts[q.a]) + ". " + q.why);
      if (q.panel) out.push("RESULTS for that question: " + q.panel.map(r => r[0] + " " + r[1]).join(", "));
      if (q.note) out.push("UPDATE: old notes said " + q.note.said + "; current guidance: " + q.note.now + ".");
    }
    if (s.t === "pick") out.push("FACT: " + s.prompt + " Correct: " + s.good.map(g => g[1]).join("; ") + ". Not: " + s.bad.map(b => b[1] + " (" + b[2] + ")").join("; ") + ".");
  }
  const R = ROOMS[L.id]; if (R) out.push("KEY POINT: " + R.lesson);
  for (const f of (FACTS[L.id] || []).concat(CHASE_TF[L.id] || [])) out.push("FACT: “" + f[0] + "” is " + (f[1] ? "true" : "false") + ". " + f[2]);
  for (const id of L.boss.recall) { const it = QB[id]; if (it) out.push("FACT: " + it.q + " " + it.a); }
  return out.join("\n");
}
function promptHead(L) {
  return "You write revision questions for a candidate preparing for the RANZCOG OSCE (Australian practice).\n"
    + "Rules: use ONLY facts stated in the MATERIAL; never invent doses, numbers, trials or claims. Where MATERIAL gives an UPDATE, follow the current guidance. "
    + "Write NEW items that test understanding from fresh angles (clinical vignettes, next best step, mechanisms, contraindications, interpreting findings, numbers). "
    + "Do not copy the wording of FACT lines and do not repeat anything in the RECENT list. Use plain, precise clinical English.\n\n"
    + "MATERIAL:\n" + materialFor(L) + "\n\nRECENT (do not repeat):\n" + (seenList(L.id).slice(-50).join("\n") || "(none)") + "\n\n";
}
const TAIL_MCQ = "Return only JSON: {\"mcq\": [10 items], \"multi\": [2 items]}. "
  + "mcq item: {\"q\": question under 220 characters, \"opts\": exactly 4 distinct options each under 90 characters, \"a\": index 0-3 of the single best answer (vary the position), \"why\": explanation under 240 characters}. "
  + "multi item: {\"q\": question under 200 characters, \"opts\": 5 or 6 options each under 60 characters, \"a\": array of the indices of ALL correct options (2 to 4 of them), \"why\": under 240 characters}. "
  + "Distractors must be plausible but clearly wrong according to the MATERIAL.";
const TAIL_TF = "Return only JSON: {\"wisps\": [6 items], \"forks\": [3 items]}. "
  + "wisp: {\"s\": a statement under 48 characters, \"t\": true or false, \"why\": correction or confirmation under 120 characters}. "
  + "fork: {\"s\": a statement under 90 characters, \"t\": true or false, \"why\": under 140 characters}. "
  + "Make about half false; false statements should be tempting misconceptions that the MATERIAL contradicts.";
const TAIL_RECALL = "Return only JSON: {\"recall\": [10 items]}. Each: {\"q\": a short open question under 150 characters, \"a\": a model answer under 170 characters, \"type\": \"num\" | \"fact\" | \"why\"}.";

const okStr = (s, max, min) => typeof s === "string" && s.trim().length >= (min == null ? 4 : min) && s.length <= max;
function validMcq(x) { return x && okStr(x.q, 260) && Array.isArray(x.opts) && x.opts.length === 4 && x.opts.every(o => okStr(o, 120, 1)) && new Set(x.opts.map(o => o.trim().toLowerCase())).size === 4 && Number.isInteger(x.a) && x.a >= 0 && x.a < 4 && okStr(x.why, 320); }
function validMulti(x) { return x && okStr(x.q, 240) && Array.isArray(x.opts) && x.opts.length >= 5 && x.opts.length <= 6 && x.opts.every(o => okStr(o, 80, 1)) && new Set(x.opts).size === x.opts.length && Array.isArray(x.a) && x.a.length >= 2 && x.a.length <= 4 && new Set(x.a).size === x.a.length && x.a.every(i => Number.isInteger(i) && i >= 0 && i < x.opts.length) && okStr(x.why, 320); }
function validTF(x, max) { return x && okStr(x.s, max) && typeof x.t === "boolean" && okStr(x.why, 200); }
function validRecall(x) { return x && okStr(x.q, 200) && okStr(x.a, 240); }

function prefetchRealm(L) {
  const g = GEN[L.id];
  if (g && (g.status === "loading" || g.status === "ready")) return g.promise;
  if (!CAP.sample) { GEN[L.id] = { status: "off" }; return Promise.resolve(null); }
  const head = promptHead(L);
  const call = tail => CAP.sample.json(head + tail, { modelTier: "default" }).catch(e => { if (e && ["not_granted", "sampling_disabled", "capability_disabled"].includes(e.code)) CAP.sample = null; return null; });
  const entry = { status: "loading" };
  entry.promise = Promise.all([call(TAIL_MCQ), call(TAIL_TF), call(TAIL_RECALL)]).then(([a, b, c]) => {
    const pack = {
      mcq: ((a && a.mcq) || []).filter(validMcq), multi: ((a && a.multi) || []).filter(validMulti),
      wisps: ((b && b.wisps) || []).filter(x => validTF(x, 60)), forks: ((b && b.forks) || []).filter(x => validTF(x, 110)),
      recall: ((c && c.recall) || []).filter(validRecall)
    };
    const ok = pack.mcq.length >= 4 || pack.recall.length >= 4 || pack.wisps.length >= 4;
    entry.status = ok ? "ready" : "failed"; entry.pack = ok ? pack : null;
    return entry.pack;
  });
  GEN[L.id] = entry;
  return entry.promise;
}

/* Bank items for a realm: the authored gates and leaps, plus MCQs built from its Recall Drill items. */
function bankMcqIds(L) {
  const ids = L.segs.filter(s => (s.t === "gate" || s.t === "leap")).map(s => s.id);
  const pool = L.boss.recall.map(id => QB[id]).filter(Boolean);
  for (const it of pool) {
    const did = "d:" + it.id;
    if (!QB[did]) {
      const others = shuffle(pool.filter(o => o !== it && o.a !== it.a).sort((x, y) => (y.type === it.type) - (x.type === it.type)).slice(0, 6)).slice(0, 3);
      if (others.length < 3) continue;
      const opts = shuffle([it.a, ...others.map(o => o.a)]);
      QB[did] = { kind: "gate", id: did, level: L.id, k: "mcq", q: it.q, opts, a: opts.indexOf(it.a), why: it.a, bank: true };
    }
    ids.push(did);
  }
  return ids;
}
function freshestFirst(L, ids, stemOf) {
  const seen = seenList(L.id);
  return shuffle(ids.slice()).sort((a, b) => seen.indexOf(stemKey(stemOf(a))) - seen.indexOf(stemKey(stemOf(b))));
}

/* Build this run: questions for every gate and leap, wisps, lanes, guardian recall, and a chest pool. */
function buildRun(L, pack) {
  const stems = [];
  const mk = (x, multi) => {
    const id = genId();
    QB[id] = { kind: "gate", id, level: L.id, k: multi ? "multi" : "mcq", q: x.q.trim(), opts: x.opts.map(o => o.trim()), a: multi ? x.a.slice() : x.a, why: x.why.trim(), gen: true };
    return id;
  };
  const mcqs = shuffle(((pack && pack.mcq) || []).slice()), multis = shuffle(((pack && pack.multi) || []).slice());
  const bank = freshestFirst(L, bankMcqIds(L), id => QB[id].q);
  const takeBank = (allowMulti) => { const i = bank.findIndex(id => allowMulti || QB[id].k !== "multi"); return i >= 0 ? bank.splice(i, 1)[0] : null; };
  const segs = L.segs.map(s => {
    if (s.t !== "gate" && s.t !== "leap") return s;
    let id = null;
    if (s.t === "gate" && s.q.k === "multi" && multis.length) id = mk(multis.pop(), true);
    else if (mcqs.length) {
      let i = 0;
      if (s.t === "leap") { let best = 1e9; mcqs.forEach((m, k) => { const len = m.opts.reduce((n, o) => n + o.length, 0); if (len < best) { best = len; i = k; } }); }
      id = mk(mcqs.splice(i, 1)[0], false);
    }
    if (!id) id = takeBank(s.t === "gate");
    if (!id) id = s.id;
    stems.push(stemKey(QB[id].q));
    return { ...s, id, q: QB[id] };
  });
  const chest = mcqs.map(x => mk(x, false)).concat(bank.filter(id => QB[id].k !== "multi").slice(0, 6));
  // wisps and fork statements
  const tf = (arr, max) => arr.map(x => [x.s.trim(), x.t, x.why.trim()]).filter(x => x[0].length <= max);
  let wisps = pack ? tf(pack.wisps, 60) : [];
  if (wisps.length < 4) wisps = wisps.concat(freshestFirst(L, (FACTS[L.id] || []).map((_, i) => i), i => FACTS[L.id][i][0]).map(i => FACTS[L.id][i])).slice(0, Math.max(4, wisps.length));
  let forks = pack ? tf(pack.forks, 110) : [];
  if (forks.length < 2) forks = forks.concat(shuffle((CHASE_TF[L.id] || []).slice())).slice(0, 2);
  wisps.slice(0, 4).forEach(w => stems.push(stemKey(w[0]))); forks.slice(0, 2).forEach(f => stems.push(stemKey(f[0])));
  // guardian recall: fresh items first, then unseen drill items
  const recall = ((pack && pack.recall) || []).map(x => { const id = genId(); QB[id] = { kind: "recall", id, q: x.q.trim(), a: x.a.trim(), type: ["num", "fact", "why"].includes(x.type) ? x.type : "fact", src: "Fresh question", level: L.id, gen: true }; return id; });
  const drill = freshestFirst(L, L.boss.recall.filter(id => QB[id]), id => QB[id].q);
  const recallPool = recall.concat(drill.slice(0, Math.max(3, 9 - recall.length)));
  recallPool.slice(0, 6).forEach(id => stems.push(stemKey(QB[id].q)));
  markSeen(L.id, stems);
  return { segs, chest, wisps, forks, recall: recallPool, fresh: !!pack };
}

/* Starting a realm: wait for fresh questions (or skip), then build the run. */
async function beginRealm(L) {
  closeModal();
  if (!hasChars()) { openCreator({ after: () => beginRealm(L) }); return; }
  let pack = null, skipped = false;
  const go = pk => { if (GEN[L.id]) GEN[L.id].status = "used"; L.run = buildRun(L, pk); startLevel(L); if (pk) toast("Fresh questions: this run's gates, leaps, wisps, lanes and guardian questions were written just now.", "good", 5500); else toast("Playing from the question bank, least-recently-seen first.", null, 4500); };
  if (CAP.sample) {
    const g = GEN[L.id];
    if (!g || !["loading", "ready"].includes(g.status)) prefetchRealm(L);
    if (GEN[L.id].status === "loading") {
      showModal(p => p.append(el("span", { class: "kicker", text: "Preparing · " + L.name }), el("h2", { text: "Writing fresh questions" }),
        el("p", { class: "lore", text: "Claude is writing a new set of questions from your Week 1 material, so this run doesn't repeat earlier ones. It usually takes 10–30 seconds." }),
        el("div", { class: "spinner", "aria-hidden": "true" }),
        el("div", { class: "actions" }, el("button", { type: "button", class: "btn quiet", text: "Play now with the question bank", onclick: () => { skipped = true; closeModal(); go(null); } }))));
      const res = await Promise.race([GEN[L.id].promise, new Promise(r => setTimeout(() => r(null), 60000))]);
      if (skipped) return;
      closeModal();
      pack = res;
    } else pack = GEN[L.id].pack || null;
  }
  go(pack);
}
