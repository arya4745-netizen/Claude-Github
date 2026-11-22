"use strict";
/* Gynae Realms engine: map, dialogs, level generator, physics, rendering. Content lives in content.js. */

/* ================= basics ================= */
const TILE = 32, ROWS = 12, GR = 9, DAY = 864e5, LADDER = [1, 3, 7, 28, 60], MAXH = 5, MAXI = 3;
const $ = id => document.getElementById(id);
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const k of kids) if (k != null && k !== false) n.append(k);
  return n;
}
function shuffle(a, R) { R = R || Math.random; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function h2(x, y) { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const LETTERS = "ABCDEF";
const LEVEL_BY_ID = Object.fromEntries(LEVELS.map(L => [L.id, L]));

/* ================= question bank ================= */
const QB = {};
for (const d of DRILL) QB[d.id] = { kind: "recall", id: d.id, q: d.q, a: d.a, type: d.type, src: "Recall Drill" };
for (const c of CUSTOM_RECALL) QB[c.id] = { kind: "recall", id: c.id, q: c.q, a: c.a, type: c.type, src: "Station notes" };
for (const L of LEVELS) L.segs.forEach((s, i) => { if (s.t === "gate" || s.t === "leap") { s.id = L.id + "-g" + i; QB[s.id] = { kind: "gate", id: s.id, level: L.id, ...s.q }; } });
function answerText(item) {
  if (item.kind === "recall") return item.a;
  if (item.k === "multi") return item.a.map(i => item.opts[i]).join("; ");
  return item.opts[item.a];
}

/* ================= progress store (per-viewer db doc, browser fallback) ================= */
const P = { stars: {}, clears: {}, best: {}, pearls: {}, srs: {}, updated: 0 };
const LS_KEY = "gynae-realms-v1";
let docRef = null, storeMode = "none", writeChain = Promise.resolve(), saveTimer = 0;
function lsRead() { try { return JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch (e) { return null; } }
function lsWrite(v) { try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch (e) {} }
function mergeInto(src) {
  if (!src) return;
  for (const key of ["stars", "clears", "best", "pearls"]) for (const [k, v] of Object.entries(src[key] || {})) P[key][k] = Math.max(P[key][k] || 0, v);
  for (const [k, v] of Object.entries(src.srs || {})) if (!P.srs[k] || (v.at || 0) > (P.srs[k].at || 0)) P.srs[k] = v;
  if (src.gen) { P.gen = Object.assign(P.gen || {}, src.gen); for (const [k, v] of Object.entries(src.gen)) if (!QB[k]) QB[k] = v; }
  if (src.seen) { P.seen = P.seen || {}; for (const [k, v] of Object.entries(src.seen)) if (!P.seen[k] || v.length > P.seen[k].length) P.seen[k] = v; }
  const rank = c => c ? c.level * 1e6 + c.xp + c.items.length : -1;
  if (src.char && !src.chars && !P.chars) P.char = src.char;
  if (src.chars) { P.chars = P.chars || []; for (const c of src.chars) { const i = P.chars.findIndex(x => x.id === c.id); if (i < 0) P.chars.push(c); else if (rank(c) > rank(P.chars[i])) P.chars[i] = c; } }
  if (src.deleted) { P.deleted = Array.from(new Set([...(P.deleted || []), ...src.deleted])); P.chars = (P.chars || []).filter(c => !P.deleted.includes(c.id)); }
  if (src.activeChar && (!P.activeChar || (src.updated || 0) >= (P.updated || 0))) P.activeChar = src.activeChar;
}
function save() {
  P.updated = Date.now();
  const body = { stars: P.stars, clears: P.clears, best: P.best, pearls: P.pearls, srs: P.srs, chars: P.chars || [], activeChar: P.activeChar || null, deleted: P.deleted || [], gen: P.gen || {}, seen: P.seen || {}, updated: P.updated };
  lsWrite(body);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!docRef) return;
    writeChain = writeChain.then(() => docRef.set(body)).catch(() => { docRef = null; storeMode = "local"; renderStoreNote(); });
  }, 600);
}
const CAP = {};
async function initCaps() {
  const local = lsRead(); mergeInto(local); if (local) storeMode = "local";
  const C = window.claude;
  if (!C || !C.use) { renderStoreNote(); renderMap(); renderLevelChip(); return; }
  C.use("sample").then(s => { CAP.sample = s; }).catch(() => { CAP.sample = null; });
  C.use("dictation").then(d => { CAP.dict = d; if (d) wireDictation(d); }).catch(() => { CAP.dict = null; });
  try {
    const [db, user] = await Promise.all([C.use("db"), C.use("user")]);
    const uid = user ? await user.id() : null;
    if (db && uid) {
      docRef = db.doc("data/users/" + uid + "/gynae-realms");
      const snap = await docRef.get();
      if (snap.exists) mergeInto(snap.data());
      storeMode = "cloud";
      save();
    }
  } catch (e) {}
  renderStoreNote(); renderMap(); renderLevelChip();
}
function renderStoreNote() {
  $("storeNote").textContent = storeMode === "cloud" ? "Your stars, pearls and review schedule are saved privately to your account, so they follow you to your phone."
    : storeMode === "local" ? "Your progress is saved in this browser only." : "Progress won't be kept after you close this page.";
}

/* spaced review */
function srsMiss(id) {
  const q = QB[id]; if (q && (q.gen || q.bank)) { P.gen = P.gen || {}; P.gen[id] = q; }
  const s = P.srs[id] || { box: 0, misses: 0 }; s.box = 0; s.misses = (s.misses || 0) + 1; s.due = Date.now() + DAY; s.at = Date.now(); P.srs[id] = s; save(); }
function srsHit(id) { const s = P.srs[id]; if (!s) return; s.box = Math.min((s.box || 0) + 1, LADDER.length - 1); s.due = Date.now() + LADDER[s.box] * DAY; s.at = Date.now(); save(); }
function dueIds() { const now = Date.now(); return Object.entries(P.srs).filter(([id, s]) => QB[id] && s.due <= now).sort((a, b) => a[1].due - b[1].due).map(([id]) => id); }

/* ================= map screen ================= */
function starStr(n) { const s = el("span", { class: "stars", "aria-label": n + " of 3 stars" }); for (let i = 0; i < 3; i++) s.append(i < n ? el("b", { text: "★" }) : "☆"); return s; }
function renderMap() {
  const box = $("realms"); box.textContent = "";
  LEVELS.forEach((L, i) => {
    const notes = L.segs.filter(s => s.note || (s.q && s.q.note)).length;
    const art = el("canvas", { width: "500", height: "148" });
    const best = P.best[L.id];
    const card = el("button", { type: "button", class: "realm", onclick: () => openBriefing(L) },
      el("div", { class: "art" }, art, el("span", { class: "num", text: "Realm " + (i + 1) })),
      el("div", { class: "body" },
        el("span", { class: "name", text: L.name }),
        el("span", { class: "station", text: L.station }),
        notes ? el("span", { class: "notes", text: notes + " update" + (notes > 1 ? "s" : "") + " to your notes" }) : null,
        el("div", { class: "foot" }, starStr(P.stars[L.id] || 0), el("span", { class: "pearls", text: "Pearls " + (P.pearls[L.id] || 0) + "/3" + (best ? " · best " + best.toLocaleString() : "") }))));
    box.append(card);
    paintBanner(art, L);
  });
  const due = dueIds().length, total = Object.keys(P.srs).length;
  $("shrineText").textContent = total === 0 ? "Questions you miss come back here on a 1, 3, 7 and 28-day ladder. Nothing waiting yet."
    : due ? due + " question" + (due > 1 ? "s" : "") + " due now, of " + total + " on your ladder." : "Nothing due right now. " + total + " question" + (total > 1 ? "s" : "") + " on your ladder.";
  $("shrineBtn").disabled = due === 0;
}
function paintBanner(cv, L) {
  const c = cv.getContext("2d"), W = cv.width, H = cv.height, t = L.theme;
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, t.sky[0]); g.addColorStop(1, t.sky[1]); c.fillStyle = g; c.fillRect(0, 0, W, H);
  drawSkyline(c, t, 0, W, H * 0.72, 0.6, t.far, 1.4);
  drawSkyline(c, t, 300, W, H * 0.86, 0.5, t.near, 1.1);
  c.fillStyle = t.ground; c.fillRect(0, H * 0.86, W, H); c.fillStyle = t.top; c.fillRect(0, H * 0.86, W, 5);
}

/* ================= briefing / codex ================= */
function openBriefing(L) {
  if (CAP.sample) prefetchRealm(L);
  const notes = [];
  L.segs.forEach(s => { const n = s.note || (s.q && s.q.note); if (n) notes.push(n); });
  showModal(p => {
    p.append(
      el("span", { class: "kicker", text: L.station }),
      el("h2", { text: L.name }),
      el("p", { class: "lore", text: L.brief }),
      el("h3", { text: "What you'll cover" }),
      el("div", { class: "chunks" }, ...L.chunks.map(c => el("span", { text: c }))),
      notes.length ? el("div", { class: "note" }, el("b", { text: "Updated from your notes: " }), notes.map(n => n.now.split(";")[0]).join(" · ")) : null,
      el("p", { class: "muted" }, "Guardian: " + L.boss.name + ". Chase: " + L.chase.name + ". Puzzle room: " + ROOMS[L.id].title + " (press ↓ on the ground to use levers and carry items). Gates are timed, the chase hides true-or-false lanes, and fact wisps float about: stomp only the true ones. A riddle chest and the guardian each hold equipment (C opens your character). ",
        el("span", { class: "kbd", text: "← →" }), " move, ", el("span", { class: "kbd", text: "Space" }), " jump (twice for a double jump, against a wall to wall-jump), ",
        el("span", { class: "kbd", text: "Shift" }), " or ", el("span", { class: "kbd", text: "X" }), " dash, ", el("span", { class: "kbd", text: "↓" }), " ground pound, ",
        el("span", { class: "kbd", text: "H" }), " spend Insight at a leap, ", el("span", { class: "kbd", text: "E" }), " reread a sign. On a phone, use the buttons under the game and turn it sideways."),
      el("div", { class: "actions" },
        el("button", { type: "button", class: "btn primary", text: "Enter the realm", onclick: () => beginRealm(L) }),
        el("button", { type: "button", class: "btn", text: "Read the scrolls", onclick: () => openCodex(L, () => openBriefing(L)) }),
        el("button", { type: "button", class: "btn quiet", text: "Back", onclick: closeModal })));
  });
}
function openCodex(L, back) {
  showModal(p => {
    const list = el("div", { class: "codex" });
    for (const s of L.segs) if (s.t === "sign") list.append(el("article", {}, el("h3", { text: s.title }), s.steps ? el("ol", { class: "steps" }, ...s.steps.map(x => el("li", { text: x[1] }))) : null, el("p", { class: s.steps ? "muted" : null, text: s.text }), noteEl(s.note)));
    const R = ROOMS[L.id];
    if (R) list.append(el("article", {}, el("h3", { text: "Puzzle room: " + R.title }), el("p", { text: R.picture }), el("p", { class: "muted", text: R.lesson })));
    p.append(el("span", { class: "kicker", text: "Scrolls · " + L.station }), el("h2", { text: L.name }), list,
      el("div", { class: "actions" }, el("button", { type: "button", class: "btn primary", text: "Done", onclick: () => back ? back() : closeModal() })));
  });
}
function noteEl(n) { return n ? el("div", { class: "note" }, el("b", { text: "Your notes said: " }), n.said + ". ", el("b", { text: "Current guidance: " }), n.now + ".") : null; }

/* ================= modal ================= */
let modalOpen = false, modalKeys = null;
function showModal(build) {
  const p = $("panel"); p.textContent = ""; modalKeys = null;
  build(p);
  $("modal").hidden = false; modalOpen = true;
  if (!RM) { p.classList.remove("in"); void p.offsetWidth; p.classList.add("in"); }
  p.scrollTop = 0;
  requestAnimationFrame(() => { const f = p.querySelector("textarea, .btn.primary, .opt"); if (f) f.focus({ preventScroll: true }); });
  for (const k in keys) keys[k] = false;
  document.querySelectorAll(".padbtn.on").forEach(b => b.classList.remove("on"));
}
function closeModal() { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); $("modal").hidden = true; modalOpen = false; modalKeys = null; lastFrame = performance.now(); }

/* ================= question UI ================= */
/* askGate(item, kicker) -> Promise<boolean correct>. Offers Insight to clear a wrong option during a run. */
function askGate(item, kicker) {
  return new Promise(resolve => {
    showModal(p => {
      const order = shuffle(item.opts.map((_, i) => i));
      const multi = item.k === "multi";
      const ans = multi ? new Set(item.a) : new Set([item.a]);
      const picked = new Set(), cleared = new Set();
      p.append(el("span", { class: "kicker", text: kicker }), el("p", { class: "qtext", text: item.q }));
      if (item.panel) {
        const tb = el("table", { class: "labs" });
        for (const [lab, val, f] of item.panel) tb.append(el("tr", {}, el("td", { text: lab }), el("td", { text: val }), el("td", { class: "f" + (f ? " f" + f : ""), text: f })));
        p.append(el("div", { class: "labs-wrap" }, tb));
      }
      if (multi) p.append(el("p", { class: "muted", text: "Pick all that apply, then check." }));
      const box = el("div", { class: "opts" });
      const btns = order.map((oi, n) => {
        const b = el("button", { type: "button", class: "opt", "aria-pressed": "false" }, el("span", { class: "k", text: String(n + 1) }), el("span", { text: item.opts[oi] }));
        b.addEventListener("click", () => {
          if (b.disabled) return;
          if (multi) { picked.has(oi) ? picked.delete(oi) : picked.add(oi); b.setAttribute("aria-pressed", String(picked.has(oi))); checkBtn.disabled = picked.size === 0; }
          else finish(new Set([oi]));
        });
        box.append(b); return b;
      });
      p.append(box);
      const tail = el("div", { class: "actions" });
      const checkBtn = el("button", { type: "button", class: "btn primary", text: "Check", disabled: "", onclick: () => finish(picked) });
      // a countdown during a run: answer before it empties
      let timer = null, tLeft = 0;
      const timed = !!(G && !G.done), tTotal = Math.round((item.panel ? 45 : multi ? 40 : 30) + (G && G.d ? G.d.timer : 0));
      if (timed) {
        const fill = el("i"), secs = el("span", { text: tTotal + "s" }), bar = el("div", { class: "tbar" }, fill, secs);
        p.insertBefore(bar, p.children[1]);
        const t0 = performance.now(); tLeft = tTotal;
        timer = setInterval(() => {
          tLeft = tTotal - (performance.now() - t0) / 1000;
          fill.style.width = Math.max(0, tLeft / tTotal * 100) + "%"; secs.textContent = Math.max(0, Math.ceil(tLeft)) + "s"; bar.classList.toggle("low", tLeft < 7);
          if (tLeft <= 0) finish(multi ? picked : new Set(), true);
        }, 100);
      }
      if (multi) tail.append(checkBtn);
      let hintBtn = null;
      const wrongLeft = () => order.filter(oi => !ans.has(oi) && !cleared.has(oi) && !picked.has(oi));
      if (G && !G.done) {
        hintBtn = el("button", { type: "button", class: "btn quiet" });
        const sync = () => { hintBtn.textContent = "Spend Insight to clear a wrong option (" + G.insight + " left)"; hintBtn.disabled = G.insight <= 0 || wrongLeft().length === 0; };
        hintBtn.addEventListener("click", () => {
          const w = wrongLeft(); if (!w.length || G.insight <= 0) return;
          const oi = w[Math.floor(Math.random() * w.length)]; cleared.add(oi);
          const b = btns[order.indexOf(oi)]; b.disabled = true; b.classList.add("cleared");
          G.insight--; renderInsight(); sync();
        });
        sync(); tail.append(hintBtn);
      }
      p.append(tail);
      modalKeys = e => {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= btns.length) { btns[n - 1].click(); return true; }
        if (e.key === "Enter" && multi && !checkBtn.disabled && checkBtn.isConnected) { checkBtn.click(); return true; }
        if ((e.key === "h" || e.key === "H") && hintBtn && !hintBtn.disabled) { hintBtn.click(); return true; }
        return false;
      };
      function finish(sel, timeout) {
        if (timer) { clearInterval(timer); timer = null; }
        const ok = !timeout && sel.size === ans.size && [...sel].every(x => ans.has(x));
        if (G) G.quick = ok && timed ? Math.max(0, tLeft / tTotal) : 0;
        btns.forEach((b, n) => {
          const oi = order[n]; b.disabled = true;
          if (ans.has(oi) && sel.has(oi)) b.classList.add("right");
          else if (ans.has(oi)) b.classList.add(multi ? "missed" : "right");
          else if (sel.has(oi)) b.classList.add("wrong");
        });
        tail.remove();
        const why = el("div", { class: "why " + (ok ? "good" : "bad") },
          el("span", { class: "verdict " + (ok ? "good" : "bad"), text: ok ? "Correct. The way opens." + (G && G.quick > 0.5 ? " Quick answer!" : "") : timeout ? "Out of time. You lose a heart." : "Not quite. You lose a heart." }),
          multi && !ok ? el("p", { text: "Answer: " + item.a.map(i => item.opts[i]).join("; ") + "." }) : null,
          el("p", { text: item.why }));
        p.append(why);
        const nt = noteEl(item.note); if (nt) p.append(nt);
        const cont = el("button", { type: "button", class: "btn primary", text: "Continue", onclick: () => { closeModal(); resolve(ok); } });
        p.append(el("div", { class: "actions" }, cont));
        modalKeys = e => { if (e.key === "Enter") { cont.click(); return true; } return false; };
        cont.focus({ preventScroll: true });
        p.scrollTop = p.scrollHeight;
      }
    });
  });
}

/* askRecall(item, kicker) -> Promise<score 0..2> */
let dictTarget = null, dictState = "idle", dictBtn = null, dictBase = "";
function wireDictation(d) {
  d.onPartial(({ text }) => { if (dictTarget) dictTarget.value = (dictBase + " " + text).trim(); });
  d.onFinal(({ text }) => { if (dictTarget) { dictBase = (dictBase + " " + text).trim(); dictTarget.value = dictBase; } });
  d.onState(({ state }) => { dictState = state; if (dictBtn) { dictBtn.classList.toggle("on", state === "listening" || state === "starting"); dictBtn.setAttribute("aria-label", state === "listening" ? "Stop dictation" : "Dictate"); } });
}
function markPrompt(item, ans) {
  const rule = { num: "NUMBERS question: key numbers must be right; accept words for numbers, 'about', and overlapping ranges. A clearly wrong number caps the mark at 1.", fact: "FACT question: key fact must be right. For 'name N things', 2 = N correct, 1 = about half.", why: "MECHANISM question: 2 = the core mechanism in any words.", trial: "EVIDENCE question: 2 = result and direction right." }[item.type] || "";
  return "You are marking a FRANZCOG candidate's short recall answer out of 2.\n\nThe answer may have been dictated through speech-to-text: read it as the words most likely SAID, and never mark down spelling or garbled words whose meaning is clear.\n\n"
    + "Question: " + item.q + "\nModel answer: " + item.a + "\n" + rule
    + "\n2 = correct. 1 = partly correct. 0 = wrong or missing. Do not demand wording beyond what the question asks.\n\nCandidate answer: " + ans
    + "\n\nReply with only JSON: {\"score\": 0, 1 or 2, \"fix\": \"what was missing or wrong, under 15 words, or empty string\"}";
}
function askRecall(item, kicker, verbs) {
  verbs = verbs || ["Full strike!", "A glancing blow.", "The guardian strikes back."];
  return new Promise(resolve => {
    showModal(p => {
      const ta = el("textarea", { id: "recallAns", placeholder: "Type your answer, or tap the microphone and say it" });
      dictTarget = ta; dictBase = "";
      ta.addEventListener("input", () => { if (dictState !== "listening") dictBase = ta.value; });
      const row = el("div", { class: "actions" });
      const markBtn = el("button", { type: "button", class: "btn primary", text: CAP.sample ? "Mark it" : "Check my answer" });
      const idkBtn = el("button", { type: "button", class: "btn quiet", text: "I don't know" });
      row.append(markBtn, idkBtn);
      if (CAP.dict) {
        dictBtn = el("button", { type: "button", class: "btn mic", "aria-label": "Dictate" });
        dictBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11z"/></svg>';
        dictBtn.addEventListener("click", () => {
          if (dictState === "listening" || dictState === "starting") { CAP.dict.stop().catch(() => {}); return; }
          dictBase = ta.value;
          CAP.dict.start().catch(e => { if (e && e.code === "not_granted") { CAP.dict = null; dictBtn.remove(); } });
        });
        row.append(dictBtn);
      }
      p.append(el("span", { class: "kicker", text: kicker }), el("p", { class: "qtext", text: item.q }), ta, row);
      modalKeys = e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { markBtn.click(); return true; } return false; };
      const stopDict = () => { if (CAP.dict && (dictState === "listening" || dictState === "starting")) CAP.dict.stop().catch(() => {}); };
      idkBtn.addEventListener("click", () => { stopDict(); reveal(""); });
      markBtn.addEventListener("click", () => { stopDict(); reveal(ta.value.trim()); });

      async function reveal(ans) {
        markBtn.disabled = idkBtn.disabled = true; ta.readOnly = true; if (dictBtn) dictBtn.disabled = true;
        const out = el("div", { class: "why" });
        const verdict = el("span", { class: "verdict", text: ans ? "Marking…" : "Here's the answer." });
        const fix = el("p", { hidden: "" });
        out.append(verdict, fix, el("div", { class: "model" }, el("span", { class: "lbl", text: "Model answer" }), el("p", { text: item.a })));
        p.append(out);
        p.scrollTop = p.scrollHeight;
        const done = s => {
          const cls = s === 2 ? "good" : s === 1 ? "part" : "bad";
          verdict.className = "verdict " + cls; verdict.textContent = verbs[2 - s] + " (" + s + "/2)";
          out.className = "why " + (s === 2 ? "good" : s === 0 ? "bad" : "");
          const cont = el("button", { type: "button", class: "btn primary", text: "Continue", onclick: () => { closeModal(); dictTarget = null; dictBtn = null; resolve(s); } });
          out.append(el("div", { class: "actions" }, cont));
          modalKeys = e => { if (e.key === "Enter") { cont.click(); return true; } return false; };
          cont.focus({ preventScroll: true });
          p.scrollTop = p.scrollHeight;
        };
        const selfMark = msg => {
          verdict.textContent = msg;
          const sm = el("div", { class: "actions" }, el("span", { class: "muted", text: "Mark yourself:" }));
          [[2, "Got it"], [1, "Partly"], [0, "Missed it"]].forEach(([s, lab]) => sm.append(el("button", { type: "button", class: "btn" + (s === 2 ? " primary" : ""), text: lab, onclick: () => { sm.remove(); done(s); } })));
          out.append(sm);
          p.scrollTop = p.scrollHeight;
        };
        if (!ans) { done(0); return; }
        if (!CAP.sample) { selfMark("Compare with the model answer, then mark yourself."); return; }
        try {
          const r = await CAP.sample.json(markPrompt(item, ans), { modelTier: "quick" });
          const s = Number(r && r.score);
          if (![0, 1, 2].includes(s)) throw { code: "invalid_json" };
          if (r.fix && s < 2) { fix.hidden = false; fix.append(el("b", { text: "Missing: " }), String(r.fix)); }
          done(s);
        } catch (e) {
          const code = e && e.code;
          if (["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"].includes(code)) CAP.sample = null;
          selfMark(code === "rate_limited" ? "Marking is busy. Mark yourself this time." : "Claude couldn't mark this one. Mark yourself.");
        }
      }
    });
  });
}

/* ================= review shrine ================= */
async function runShrine() {
  const ids = dueIds().slice(0, 15);
  if (!ids.length) return;
  let right = 0;
  for (let i = 0; i < ids.length; i++) {
    const it = QB[ids[i]], kick = "Review Shrine · " + (i + 1) + " of " + ids.length + (it.level ? " · " + LEVEL_BY_ID[it.level].station : "");
    let ok;
    if (it.kind === "gate") ok = await askGate(it, kick);
    else ok = (await askRecall(it, kick, ["Remembered.", "Partly there.", "Not yet."])) === 2;
    if (ok) { srsHit(it.id); right++; gainXP(30); } else srsMiss(it.id);
  }
  showModal(p => p.append(el("span", { class: "kicker", text: "Review Shrine" }), el("h2", { text: right + " of " + ids.length + " remembered" }),
    el("p", { class: "lore", text: "Remembered questions move up the ladder and come back later. The rest return tomorrow." }),
    el("div", { class: "actions" }, el("button", { type: "button", class: "btn primary", text: "Back to the map", onclick: () => { closeModal(); renderMap(); } }))));
}

/* ================= input ================= */
const keys = { left: false, right: false, jump: false, dash: false, down: false };
const pressed = { jump: false, dash: false, down: false };
const KEYMAP = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowUp: "jump", KeyW: "jump", Space: "jump", KeyZ: "jump", ShiftLeft: "dash", ShiftRight: "dash", KeyX: "dash", KeyK: "dash", ArrowDown: "down", KeyS: "down" };
function press(k) { if (k in pressed && !keys[k]) pressed[k] = true; keys[k] = true; }
addEventListener("keydown", e => {
  if (modalOpen) { if (modalKeys && (e.target.tagName !== "TEXTAREA" || e.metaKey || e.ctrlKey) && modalKeys(e)) e.preventDefault(); return; }
  if (!G) return;
  const k = KEYMAP[e.code];
  if (k) { press(k); e.preventDefault(); }
  if (e.code === "KeyE") { if (nearSign) openSign(nearSign); }
  if (e.code === "KeyH") useLeapInsight();
  if (e.code === "KeyC" && !modalOpen) openCharacter(closeModal);
  if (e.code === "KeyR" && G.room && G.room.inside) roomReset(G.room);
  if (e.code === "Escape" || e.code === "KeyP") openPause();
});
addEventListener("keyup", e => { const k = KEYMAP[e.code]; if (k) keys[k] = false; });
addEventListener("blur", () => { for (const k in keys) keys[k] = false; });
document.querySelectorAll(".padbtn").forEach(b => {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); press(k); b.classList.add("on"); try { b.setPointerCapture(e.pointerId); } catch (x) {} };
  const off = () => { keys[k] = false; b.classList.remove("on"); };
  b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointercancel", off); b.addEventListener("lostpointercapture", off);
  b.addEventListener("contextmenu", e => e.preventDefault());
});

/* ================= level building ================= */
/* Columns are built left to right. Tile codes: 1 ground, 2 stone block, 4 cracked (breaks under a ground pound).
   One-way platforms (moving, crumbling, answer) are entities, not tiles. */
const TIPS_SEEN = new Set();
function buildLevel(L) {
  const R = rng(hashStr(L.id + "realm-v2"));
  const cols = [];
  const B = { plats: [], ev: [], spawns: [], springs: [], spikes: [], pearls: [], potions: [], tips: [], pulses: [], droppers: [], chests: [] };
  const facts = shuffle(((L.run && L.run.wisps) || FACTS[L.id] || []).slice(0, 4), R); let factN = 0;
  let mode = "normal", fillerN = 0, chimneys = 0, potions = 0, checks = 0;
  const X = () => cols.length;
  const col = top => { const c = new Uint8Array(ROWS); if (top >= 0) for (let y = top; y < ROWS; y++) c[y] = 1; cols.push(c); return c; };
  const flat = n => { for (let i = 0; i < n; i++) col(GR); };
  const pit = n => { for (let i = 0; i < n; i++) col(-1); };
  const block = (x, row, w) => { for (let k = 0; k < w; k++) cols[x + k][row] = 2; };
  const oneway = (x, row, w, kind, extra) => { const p = { x: x * TILE, y: row * TILE, w: w * TILE, kind, alive: true, ...extra }; B.plats.push(p); return p; };
  const spawn = (x, row, kind) => B.spawns.push({ x, row, kind });
  const tip = (x, key, text) => B.tips.push({ x: x * TILE, key, text });
  const enemyKind = () => { const r = R(); return r < 0.25 ? "fly" : r < 0.45 ? "hopper" : "walk"; };
  const potion = (x, row) => { if (potions < 3) { potions++; B.potions.push({ x: x * TILE + 16, y: row * TILE - 14, taken: false }); } };

  function feature(kind) {
    const x = X();
    switch (kind) {
      case "flat": { const w = 3 + Math.floor(R() * 3); flat(w); if (mode !== "calm" && w >= 4 && R() < (mode === "chase" ? 0.2 : 0.55)) spawn(X() - 2, GR, enemyKind()); break; }
      case "pit": { pit(2 + Math.floor(R() * 2)); flat(2); break; }
      case "step": { const h = GR - 1 - Math.floor(R() * 2), w = 3 + Math.floor(R() * 3); for (let i = 0; i < w; i++) col(h); if (mode === "normal" && R() < 0.5) spawn(X() - 2, h, R() < 0.55 ? "turret" : "walk"); flat(1); break; }
      case "floats": { flat(6); block(x + 1, GR - 3, 3); if (R() < 0.35) potion(x + 2, GR - 3); if (mode === "normal" && R() < 0.5) spawn(X() - 1, GR, R() < 0.5 ? "fly" : "hopper"); break; }
      case "mover": { flat(1); const s = X(); pit(6); oneway(s, GR - 1, 2, "move", { ax: s * TILE + 4, bx: (s + 4) * TILE - 4, sp: 0.8 + R() * 0.4, ph: R() * 6 }); flat(2); tip(s, "mover", "Moving platforms carry you. Ride it across."); break; }
      case "crumble": { flat(1); const s = X(); pit(6); for (let k = 0; k < 6; k++) oneway(s + k, GR, 1, "crumble"); flat(2); tip(s, "crumble", "Cracked bridge: it crumbles a moment after you step on it. Keep moving."); break; }
      case "spikes": { flat(8); B.spikes.push({ x: (x + 3) * TILE, y: GR * TILE - 12, w: 3 * TILE, h: 12 }); break; }
      case "spring": { flat(2); B.springs.push({ x: (x + 1) * TILE + 4, y: GR * TILE - 12, w: 24, h: 12, t: 0 }); for (let i = 0; i < 4; i++) col(GR - 5); if (R() < 0.5) potion(X() - 2, GR - 5); for (let i = 0; i < 2; i++) col(GR - 2); flat(2); tip(x + 1, "spring", "Springs launch you high. Land on one to bounce."); break; }
      case "chimney": {
        chimneys++; flat(2);
        const c = col(GR); for (let y = GR - 7; y <= GR - 2; y++) c[y] = 1;
        flat(2);
        for (let i = 0; i < 4; i++) col(GR - 7);
        for (let i = 0; i < 2; i++) col(GR - 4);
        flat(2);
        tip(x, "chimney", "Wall jump: slide down a wall, then jump to kick off it. Zig-zag up the shaft, holding towards the next wall.");
        break;
      }
      case "pulse": { flat(8); B.pulses.push({ x: (x + 2) * TILE, y: GR * TILE - 16, w: 4 * TILE, h: 16, per: 1.9, ph: R() * 1.9 }); tip(x, "pulse", "Pulse spikes rise on a rhythm. Watch them, then cross while they're down."); break; }
      case "drop": { flat(8); for (let k = 0; k < 2; k++) B.droppers.push({ x: (x + 2 + k * 3) * TILE + 16, y: 46 + k * 14 }); tip(x, "drop", "Loose rocks shake, then fall when you pass beneath. Keep moving."); break; }
      case "chest": { flat(9); block(x + 1, GR - 3, 2); block(x + 4, GR - 6, 3); B.chests.push({ x: (x + 5) * TILE + 16, y: (GR - 6) * TILE }); tip(x, "chest", "A riddle chest sits up high. Stand beside it and press ↓, then answer to open it."); break; }
      case "pocket": { flat(2); const s = X(); for (let k = 0; k < 3; k++) { const c = col(GR); c[GR] = 4; c[GR + 1] = 0; } flat(2); B.pearls.push({ x: (s + 1) * TILE + 16, y: (GR + 1) * TILE + 16 }); tip(s, "pocket", "Cracked floor: jump, then press down to ground-pound through it. Something glints below."); break; }
      case "high": { flat(8); block(x + 1, GR - 3, 3); block(x + 5, GR - 6, 2); B.pearls.push({ x: (x + 6) * TILE, y: (GR - 7) * TILE + 6 }); tip(x, "high", "A pearl sits high above. Double jump from the ledge."); break; }
      case "gap": { flat(1); const s = X(); pit(7); oneway(s, GR, 2, "move", { ax: s * TILE + 2, bx: (s + 5) * TILE - 2, sp: 0.7, ph: 0 }); B.pearls.push({ x: (s + 3) * TILE + 16, y: (GR - 4) * TILE + 6 }); flat(2); tip(s, "gap", "A pearl hangs over the pit. Step onto the moving platform, ride it under the pearl, then jump straight up."); break; }
    }
  }
  function filler(len) {
    fillerN++;
    const start = X();
    const pearlKinds = { 2: "pocket", 4: "high", 6: "chest", 7: "gap" };
    if (pearlKinds[fillerN] && mode !== "chase") feature(pearlKinds[fillerN]);
    if ([1, 3, 5, 8].includes(fillerN) && mode === "normal" && factN < facts.length) { flat(5); spawn(X() - 3, GR, "fact:" + factN); factN++; }
    const pool = mode === "calm" ? ["flat", "flat", "step", "floats"]
      : mode === "chase" ? ["pit", "crumble", "spikes", "floats", "spring", "flat", "step", "pit", "pulse"]
      : ["flat", "pit", "step", "floats", "mover", "crumble", "spikes", "spring", "chimney", "flat", "step", "pulse", "drop"];
    while (X() - start < len) {
      let k = pool[Math.floor(R() * pool.length)];
      if (k === "chimney" && (chimneys >= 2 || fillerN < 2)) k = "floats";
      feature(k);
    }
    flat(2);
  }
  function chase() {
    flat(3);
    const x0 = X();
    mode = "chase"; filler(10); fork(0); filler(10); fork(1); filler(8); mode = "normal";
    flat(2); const x1 = X();
    B.ev.push({ type: "chase", x0, x1 });
    B.ev.push({ type: "check", x: X() }); flat(3);
    puzzleRoom();
  }
  /* True/false fork: TRUE = high road on stone, FALSE = low road beneath. The wrong lane ends in a solid veil (tile 5), the right one in a passable veil (tile 6). */
  function fork(k) {
    const tf = ((L.run && L.run.forks) || CHASE_TF[L.id] || [])[k]; if (!tf) return;
    flat(3);
    const a = X();
    col(GR);
    const st = col(GR); st[GR - 2] = 2;
    col(GR);
    for (let i = 0; i < 9; i++) { const c = col(GR); c[GR - 4] = 2; }
    const v = col(GR);
    for (let y = 0; y <= GR - 5; y++) v[y] = tf[1] ? 6 : 5;
    v[GR - 4] = 2;
    for (let y = GR - 3; y <= GR - 1; y++) v[y] = tf[1] ? 5 : 6;
    flat(4);
    B.ev.push({ type: "fork", x0: a, vx: a + 12, tf });
  }
  function puzzleRoom() {
    const g = ROOM_GEOM[L.id]; if (!g) return;
    flat(3); B.ev.push({ type: "check", x: X() - 2 });
    const x0 = X();
    for (let i = 0; i < ROOM_W; i++) col(g.top ? g.top(i) : GR);
    (g.blocks || []).forEach(([x, row, w]) => block(x0 + x, row, w));
    (g.cracked || []).forEach(([x, row]) => { cols[x0 + x][row] = 4; });
    B.ev.push({ type: "room", x0, x1: X() });
    B.ev.push({ type: "door", kind: "room", x: X() }); flat(4);
  }

  flat(3); B.ev.push({ type: "check", x: 1, start: true }); flat(4);
  (L.run ? L.run.segs : L.segs).forEach((s, i) => {
    if (s.t === "calm") { mode = s.on ? "calm" : "normal"; return; }
    if (s.t === "chase") return;
    filler(mode === "calm" ? 5 : 9 + Math.floor(R() * 6));
    if (s.t === "sign") { flat(2); B.ev.push({ type: "sign", x: X(), seg: s }); flat(3); }
    else if (s.t === "check") { flat(1); B.ev.push({ type: "check", x: X() }); flat(3); checks++; if (checks === 2 && L.chase) chase(); }
    else if (s.t === "gate") { flat(3); B.ev.push({ type: "door", kind: "gate", x: X(), seg: s }); flat(4); }
    else if (s.t === "leap") {
      flat(3);
      const s0 = X(), n = s.q.opts.length, gid = "grp" + i;
      flat(n * 3 + 2);
      B.ev.push({ type: "zone", kind: "leap", gid, seg: s, x0: s0 - 3, x1: X() });
      const slots = shuffle(s.q.opts.map((_, k) => k), R);
      slots.forEach((oi, k) => {
        const px = s0 + 1 + k * 3;
        oneway(px, GR - 3, 2, "answer", { gid, opt: oi, letter: LETTERS[k], correct: oi === s.q.a });
        if (k < n - 1) B.spikes.push({ x: (px + 2) * TILE + 2, y: GR * TILE - 12, w: TILE - 4, h: 12 });
      });
      B.ev.push({ type: "door", kind: "barrier", gid, x: X() }); flat(4);
    }
    else if (s.t === "pick") {
      const items = [...s.good.map(g => ({ good: true, short: g[0], full: g[1] })), ...s.bad.map(b => ({ good: false, short: b[0], full: b[1], why: b[2] }))];
      const gap = 3, x0 = X() + 2, gid = "grp" + i;
      flat(3 + items.length * gap + 2);
      B.ev.push({ type: "zone", kind: "pick", gid, seg: s, x0: x0 - 2, x1: X() });
      shuffle(items, R).forEach((it, k) => {
        const x = x0 + 1 + k * gap;
        let row = GR;
        if (k % 2 === 1) { oneway(x - 1, GR - 3, 3, "ledge"); row = GR - 3; }
        B.ev.push({ type: "orb", gid, x, row, item: it });
      });
      B.ev.push({ type: "door", kind: "barrier", gid, x: X() }); flat(4);
    }
  });
  if (L.chase && checks < 2) chase();
  filler(10);
  flat(2); B.ev.push({ type: "door", kind: "echo", x: X() }); flat(3);
  B.ev.push({ type: "check", x: X() }); flat(4);
  const ax = X(); flat(30);
  block(ax + 7, GR - 3, 4); block(ax + 19, GR - 3, 4);
  B.ev.push({ type: "door", kind: "arena", x: ax });
  B.ev.push({ type: "boss", x: ax + 16 });
  const endX = X(); flat(2);
  const W = cols.length, tiles = new Uint8Array(W * ROWS);
  cols.forEach((c, x) => { for (let y = 0; y < ROWS; y++) tiles[y * W + x] = c[y]; });
  for (let y = 0; y < ROWS; y++) tiles[y * W + W - 1] = 1;
  return { W, tiles, ...B, facts, arena: { x0: ax, x1: endX } };
}

/* ================= game state ================= */
let G = null;
function startLevel(L) {
  const B = buildLevel(L);
  const R = rng(hashStr(L.id + "pearls"));
  const pearlFacts = shuffle(((L.run && L.run.recall) || L.boss.recall).filter(id => QB[id]), R);
  G = {
    L, t: L.theme, W: B.W, tiles: B.tiles, dyn: new Uint8Array(B.W), arena: B.arena,
    player: { x: 1.2 * TILE, y: 0, w: 18, h: 28, vx: 0, vy: 0, face: 1, ground: false, coyote: 0, buf: 0, inv: 0, anim: 0, jumps: 1, wall: 0, lock: 0, dash: 0, dashes: 1, dashCd: 0, pound: 0, hang: 0, onPlat: null, sq: 0, stepT: 0, blink: 2, spin: 0, cape: null, hflash: 0 },
    hearts: 5, insight: 1, score: 0, streak: 0, bestStreak: 0, pearlsGot: 0,
    pulses: B.pulses, droppers: B.droppers.map(d => ({ ...d, y0: d.y, state: "hang", t: 0, vy: 0 })), forks: [],
    enemies: [], doors: [], signs: [], orbs: [], flags: [], zones: {}, shots: [], waves: [], fx: [], pops: [], trail: [],
    plats: B.plats.map(p => ({ ...p, x0: p.x, y0: p.y, t: 0, dx: 0 })), springs: B.springs, spikes: B.spikes, tips: B.tips,
    pearls: B.pearls.map((p, i) => ({ ...p, taken: false, fact: pearlFacts[i % pearlFacts.length] })), potions: B.potions,
    boss: null, portal: null, chase: null, room: null, carry: null, roomLock: null, zoom: 1, check: null, cam: 0, time: 0, shake: 0, look: 0, hitstop: 0, iris: RM ? 1 : 0, exitT: 0, scoreShown: 0,
    slips: 0, missed: [], recall: [], recallPool: shuffle(((L.run && L.run.recall) || L.boss.recall).filter(id => QB[id])), recallIdx: 0,
    startX: 0, bossStarted: false, done: false
  };
  G.player.y = GR * TILE - G.player.h;
  G.d = derived(); G.maxH = G.d.maxH; G.hearts = G.maxH; G.insight = Math.min(G.d.maxI, G.d.startI); G.wardReady = true;
  G.player.jumps = G.d.airJumps; G.player.dashes = G.d.airDashes;
  G.chests = B.chests.map(c => ({ ...c, state: "locked", t: 0, asked: [] })); G.loot = null;
  for (const e of B.ev) {
    if (e.type === "check") G.flags.push({ x: e.x * TILE + 8, y: GR * TILE, on: !!e.start });
    else if (e.type === "sign") G.signs.push({ x: e.x * TILE + 4, y: GR * TILE - 34, w: 26, h: 34, seg: e.seg, read: false });
    else if (e.type === "door") {
      const d = { col: e.x, kind: e.kind, seg: e.seg, gid: e.gid, open: e.kind === "arena", fade: 0 };
      G.doors.push(d); if (!d.open) G.dyn[e.x] = 1;
      if (e.gid) G.zones[e.gid].door = d;
      if (e.kind === "room" && G.room) G.room.door = d;
    }
    else if (e.type === "room") G.room = makeRoom(L, e.x0, e.x1);
    else if (e.type === "fork") G.forks.push({ x0: e.x0 * TILE, vx: e.vx * TILE, tf: e.tf, resolved: false, wrong: false, flash: 0 });
    else if (e.type === "zone") G.zones[e.gid] = { gid: e.gid, seg: e.seg, kind: e.kind, x0: e.x0 * TILE, x1: e.x1 * TILE, intro: false, got: 0, total: e.kind === "pick" ? e.seg.good.length : 1, done: false, wrong: false };
    else if (e.type === "orb") G.orbs.push({ x: e.x * TILE + 16, y: e.row * TILE - 30, r: 11, gid: e.gid, ...e.item, taken: false, ph: Math.random() * 6 });
    else if (e.type === "chase") G.chase = { x0: e.x0 * TILE, x1: e.x1 * TILE, wx: (e.x0 - 8) * TILE, active: false, done: false, ...L.chase };
    else if (e.type === "boss") G.bossX = e.x * TILE;
  }
  G.check = G.flags[0];
  clearChunks(); forkShown = null; renderLevelChip();
  for (const s of B.spawns) {
    const base = { alive: true, t: Math.random() * 6 };
    if (s.kind === "walk") G.enemies.push({ ...base, kind: "walk", x: s.x * TILE + 4, y: s.row * TILE - 22, w: 24, h: 22, vx: -48, vy: 0 });
    else if (s.kind === "hopper") G.enemies.push({ ...base, kind: "hopper", x: s.x * TILE + 4, y: s.row * TILE - 20, w: 22, h: 20, vx: 0, vy: 0, jt: 1 + Math.random(), grounded: false });
    else if (s.kind === "turret") G.enemies.push({ ...base, kind: "turret", x: s.x * TILE + 4, y: s.row * TILE - 22, w: 24, h: 22, cd: 1.5 + Math.random() });
    else if (s.kind.startsWith("fact:")) { const f = B.facts[+s.kind.slice(5)]; if (f) G.enemies.push({ ...base, kind: "fact", fact: f, x: s.x * TILE, y: (s.row - 2.6) * TILE, w: 26, h: 22, bx: s.x * TILE, by: (s.row - 2.6) * TILE }); }
    else G.enemies.push({ ...base, kind: "fly", x: s.x * TILE, y: (s.row - 3.2) * TILE, w: 22, h: 18, bx: s.x * TILE, by: (s.row - 3.2) * TILE });
  }
  G.startX = G.player.x; G.arenaX = G.arena.x0 * TILE;
  $("mapScreen").hidden = true; $("gameScreen").hidden = false;
  $("lvlChip").textContent = L.name; $("toasts").textContent = "";
  $("bossbar").hidden = true; $("meterChip").hidden = !L.meter; $("leapCard").hidden = true; leapShown = null;
  $("roomCard").hidden = true; $("stage").classList.remove("carded", "leaping");
  heartsShown = G.maxH; renderHearts(); renderSlips(); renderInsight(); renderScore(); resize();
  lastFrame = performance.now();
  toast(L.station + ". Read the signs: the gates and leaps ask about them.");
}
function quitToMap() { G = null; closeModal(); $("gameScreen").hidden = true; $("mapScreen").hidden = false; renderMap(); }

/* ================= HUD ================= */
const HEART_FULL = '<svg viewBox="0 0 24 24"><path fill="#ff7a8a" stroke="#2a0a10" stroke-width="1.2" d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.5h2c.7-1.3 2.2-2.5 4.3-2.5 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>';
const HEART_EMPTY = '<svg viewBox="0 0 24 24"><path fill="none" stroke="#7a6a8a" stroke-width="1.6" d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.5h2c.7-1.3 2.2-2.5 4.3-2.5 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>';
let heartsShown = MAXH;
function renderHearts() {
  const h = $("hearts"), cls = G.hearts < heartsShown ? "hit" : G.hearts > heartsShown ? "gain" : null; heartsShown = G.hearts;
  if (cls && !RM) { h.classList.remove("hit", "gain"); void h.offsetWidth; h.classList.add(cls); }
  $("hearts").innerHTML = Array.from({ length: G.maxH }, (_, i) => i < G.hearts ? HEART_FULL : HEART_EMPTY).join(""); $("hearts").setAttribute("aria-label", G.hearts + " of " + G.maxH + " hearts"); }
function renderSlips() { $("slipChip").textContent = "Slips " + G.slips; }
function renderInsight() { const c = $("insightChip"); c.textContent = ""; c.append("Insight ", el("span", { class: "pips" }, "◆".repeat(G.insight), el("i", { text: "◇".repeat(Math.max(0, G.d.maxI - G.insight)) }))); c.setAttribute("aria-label", "Insight " + G.insight + " of " + G.d.maxI); if (leapShown) renderLeapCard(leapShown); }
function renderScore() { $("scoreChip").textContent = Math.round(G.scoreShown).toLocaleString() + (G.streak >= 2 ? "  ×" + G.streak : ""); }
function addScore(n, x, y) { G.score += n; renderScore(); if (x != null) G.pops.push({ x, y, text: "+" + n, life: 1 }); }
function gainInsight(n) { const before = G.insight; G.insight = Math.min(G.d.maxI, G.insight + n); if (G.insight > before) { renderInsight(); const c = $("insightChip"); if (!RM) { c.classList.remove("pulse"); void c.offsetWidth; c.classList.add("pulse"); } } }
function rightAnswer(x, y) { G.streak++; G.bestStreak = Math.max(G.bestStreak, G.streak); gainInsight(1); addScore(100 + 25 * (G.streak - 1), x, y); gainXP(40, x, y - 16); }
function toast(msg, kind, ms) {
  const t = el("div", { class: "toast" + (kind ? " " + kind : ""), text: msg });
  const box = $("toasts"); box.append(t); while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => t.remove(), ms || 3600);
}
let nearSign = null;
function updateNear() {
  const p = G.player, cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  let best = null, bd = 60;
  const consider = (ox, oy, text, sign) => { const d = Math.hypot(ox - cx, oy - cy); if (d < bd) { bd = d; best = { text, sign }; } };
  for (const s of G.signs) consider(s.x + 13, s.y + 17, (s.seg.steps ? "Scroll: " : "Sign: ") + s.seg.title, s);
  for (const o of G.orbs) if (!o.taken) consider(o.x, o.y, "Orb: " + o.full, null);
  for (const e of G.enemies) if (e.alive && e.kind === "fact") consider(e.x + e.w / 2, e.y + e.h / 2 + 30, "Fact wisp: \u201c" + e.fact[0] + "\u201d. Stomp it if TRUE.", null);
  for (const ch of G.chests) if (ch.state !== "open") consider(ch.x, ch.y - 10, ch.state === "sealed" ? "Riddle chest: resealing…" : "↓ Open the riddle chest (answer a question)", null);
  if (G.room) roomNear(G.room, (x, y, text) => consider(x, y, text, null));
  nearSign = best && best.sign;
  const box = $("near");
  if (!best || leapShown) { box.hidden = true; return; }
  box.hidden = false;
  if ($("nearText").textContent !== best.text) $("nearText").textContent = best.text;
  $("nearBtn").hidden = !best.sign;
}
$("nearBtn").addEventListener("click", () => { if (nearSign) openSign(nearSign); });
$("pauseBtn").addEventListener("click", e => { e.currentTarget.blur(); openPause(); });
$("shrineBtn").addEventListener("click", runShrine);
$("charBtn").addEventListener("click", () => { const back = () => { closeModal(); renderMap(); renderLevelChip(); }; if (hasChars()) openCharacter(back); else openCreator({ after: back }); });

/* Leap of Judgement card */
let leapShown = null;
function renderLeapCard(z) {
  const card = $("leapCard"), q = z.seg.q;
  const plats = G.plats.filter(p => p.gid === z.gid).sort((a, b) => a.x - b.x);
  card.textContent = "";
  const btn = el("button", { type: "button", text: "Spend Insight (" + G.insight + ")", onclick: e => { e.currentTarget.blur(); useLeapInsight(); } });
  if (G.insight <= 0 || !plats.some(p => !p.correct && p.alive)) btn.disabled = true;
  card.append(el("div", { class: "lrow" }, el("span", { text: "Leap of Judgement · jump onto your answer" }), btn),
    el("div", { class: "lq", text: q.q }),
    el("ol", {}, ...plats.map(p => el("li", { class: p.alive ? null : "gone" }, el("b", { text: p.letter }), el("span", { text: q.opts[p.opt] })))));
}
function useLeapInsight() {
  const z = leapShown; if (!z || z.done || G.insight <= 0) return;
  const wrong = G.plats.filter(p => p.gid === z.gid && !p.correct && p.alive);
  if (!wrong.length) return;
  const p = wrong[Math.floor(Math.random() * wrong.length)];
  p.alive = false; p.fall = 0.01; G.insight--; renderInsight();
  burst(p.x + p.w / 2, p.y, "#8fd3ff", 16);
  toast("Insight clears " + p.letter + ".", null);
  renderLeapCard(z);
}

function openPause() {
  if (!G || modalOpen) return;
  showModal(p => p.append(
    el("span", { class: "kicker", text: G.L.station }), el("h2", { text: "Paused" }),
    el("p", { class: "muted", text: "Score " + G.score.toLocaleString() + ". Slips " + G.slips + ". Pearls " + G.pearlsGot + " of 3. Hearts " + G.hearts + " of " + G.maxH + "." }),
    el("div", { class: "actions" },
      el("button", { type: "button", class: "btn primary", text: "Resume", onclick: closeModal }),
      el("button", { type: "button", class: "btn", text: "Character", onclick: () => openCharacter(() => { closeModal(); openPause(); }) }),
      el("button", { type: "button", class: "btn", text: "Read the scrolls", onclick: () => openCodex(G.L, () => { closeModal(); openPause(); }) }),
      el("button", { type: "button", class: "btn", text: "Back to the last banner", onclick: () => { closeModal(); respawn(); } }),
      G.room && G.room.inside && !G.room.solved ? el("button", { type: "button", class: "btn", text: "Reset the puzzle room", onclick: () => { closeModal(); roomReset(G.room); } }) : null,
      el("button", { type: "button", class: "btn quiet", text: "Leave the realm", onclick: quitToMap }))));
}

/* ================= events ================= */
function openSign(s) {
  s.read = true;
  showModal(p => {
    const cont = el("button", { type: "button", class: "btn primary", text: "Continue", onclick: closeModal });
    p.append(el("span", { class: "kicker", text: (s.seg.steps ? "Scroll · " : "Sign · ") + G.L.station }), el("h2", { text: s.seg.title }),
      s.seg.steps ? el("ol", { class: "steps" }, ...s.seg.steps.map(x => el("li", { text: x[1] }))) : null,
      el("p", { class: s.seg.steps ? "muted" : "lore", text: s.seg.text }), noteEl(s.seg.note), el("div", { class: "actions" }, cont));
    modalKeys = e => { if (e.key === "Enter") { cont.click(); return true; } return false; };
  });
}
function knowledgeHit(msg) {
  G.slips++; renderSlips();
  G.streak = 0; renderScore();
  G.hearts--; renderHearts();
  G.shake = 0.25; G.player.hflash = 1; hitstop(0.08);
  burst(G.player.x + 9, G.player.y + 10, "#ff7a8a", 14);
  if (msg) toast(msg, "bad", 5200);
  if (G.hearts <= 0) faint();
}
function openDoor(d) {
  d.open = true; d.fade = 0.0001; G.dyn[d.col] = 0;
  burst(d.col * TILE + 16, GR * TILE - 48, G.t.accent, 22);
  for (let i = 0; i < 14; i++) G.fx.push({ x: d.col * TILE + 6 + Math.random() * 20, y: GR * TILE - Math.random() * 100, vx: 0, vy: -120 - Math.random() * 160, life: 0.8, max: 0.8, c: G.t.accent, r: 1.8, g: 0, drag: 0.5 });
  ring(d.col * TILE + 16, GR * TILE, G.t.accent, 240);
}
async function triggerDoor(d) {
  if (d.busy || d.open) return;
  if (d.kind === "barrier") {
    const z = G.zones[d.gid];
    if (!d.nag || G.time - d.nag > 4) { d.nag = G.time; toast(z.kind === "leap" ? "The veil holds. Land on the right answer first." : "The veil holds. Gather every right orb first."); }
    return;
  }
  if (d.kind === "room") { if (!d.nag || G.time - d.nag > 4) { d.nag = G.time; toast("A seal blocks the way. Solve the puzzle room to open it."); } return; }
  d.busy = true;
  if (d.kind === "gate") {
    const it = QB[d.seg.id];
    const ok = await askGate(it, "Gate · " + G.L.station);
    if (!G) return;
    if (ok) { srsHit(it.id); rightAnswer(d.col * TILE, GR * TILE - 110); const qb = Math.round(150 * (G.quick || 0)); if (qb > 0) addScore(qb, d.col * TILE, GR * TILE - 130); } else { srsMiss(it.id); G.missed.push(it.id); }
    openDoor(d);
    if (!ok) knowledgeHit();
  } else if (d.kind === "echo") {
    const echoes = [...new Set(G.missed.filter(id => QB[id].kind === "gate"))];
    const intro = (title, text, btn) => new Promise(res => showModal(p => p.append(el("span", { class: "kicker", text: "Echo Gate" }), el("h2", { text: title }), el("p", { class: "lore", text }), el("div", { class: "actions" }, el("button", { type: "button", class: "btn primary", text: btn, onclick: () => { closeModal(); res(); } })))));
    if (!echoes.length) await intro("No echoes", "You answered every gate and leap correctly. The guardian waits beyond.", "Continue");
    else {
      await intro(echoes.length + " echo" + (echoes.length > 1 ? "es" : "") + " return", "The questions you missed come back, shuffled. Answering them again now is what makes them stick.", "Face them");
      for (let i = 0; i < echoes.length; i++) {
        const ok = await askGate(QB[echoes[i]], "Echo Gate · " + (i + 1) + " of " + echoes.length);
        if (!G) return;
        if (ok) { addScore(60); gainXP(20); } else { knowledgeHit(); if (G.hearts <= 0) break; }
      }
    }
    if (G) openDoor(d);
  }
  d.busy = false;
}
function enterZone(z) {
  z.intro = true;
  const s = z.seg;
  if (z.kind === "leap") return;
  showModal(p => {
    const cont = el("button", { type: "button", class: "btn primary", text: "Begin", onclick: closeModal });
    p.append(el("span", { class: "kicker", text: "Orb field · " + G.L.station }), el("h2", { text: s.title }), el("p", { class: "lore", text: s.prompt }),
      el("p", { class: "muted", text: s.good.length + " right orbs to gather. A wrong orb costs a heart and tells you why. Stand near one to read it in full." }),
      el("div", { class: "actions" }, cont));
    modalKeys = e => { if (e.key === "Enter") { cont.click(); return true; } return false; };
  });
}
function zoneComplete(z) {
  z.done = true; openDoor(z.door);
  const s = z.seg;
  if (!z.wrong) addScore(200, z.door.col * TILE, GR * TILE - 110);
  gainXP(z.wrong ? 10 : 30);
  showModal(p => {
    const cont = el("button", { type: "button", class: "btn primary", text: "Onward", onclick: closeModal });
    p.append(el("span", { class: "kicker", text: "Complete · " + s.title }), el("h2", { text: "What you gathered" }), el("ul", { class: "list" }, ...s.good.map(x => el("li", { text: x[1] }))),
      el("h3", { text: "And why the others were wrong" }), el("ul", { class: "list" }, ...s.bad.map(x => el("li", {}, el("b", { text: x[1] + ": " }), x[2]))),
      el("p", { class: "muted", text: s.why }), el("div", { class: "actions" }, cont));
    modalKeys = e => { if (e.key === "Enter") { cont.click(); return true; } return false; };
  });
}
function touchOrb(o) {
  const z = G.zones[o.gid];
  if (o.taken || z.done) return;
  o.taken = true;
  if (o.good) {
    z.got++; burst(o.x, o.y, G.t.accent, 14); ring(o.x, o.y, G.t.accent, 200); gainXP(10, o.x, o.y - 36); addScore(50, o.x, o.y - 20);
    toast("Gathered " + z.got + " of " + z.total + ": " + o.full, "good");
    if (z.got === z.total) setTimeout(() => G && zoneComplete(z), 250);
  } else { z.wrong = true; burst(o.x, o.y, "#ff7a8a", 16); knowledgeHit(o.full + ": " + o.why); }
}
function landAnswer(pl) {
  const z = G.zones[pl.gid];
  if (z.done || !pl.alive) return;
  const item = QB[z.seg.id];
  if (pl.correct) {
    z.done = true; leapShown = null; $("leapCard").hidden = true; $("stage").classList.remove("leaping");
    for (const o of G.plats) if (o.gid === pl.gid && o !== pl && o.alive) { o.alive = false; o.fall = 0.01; }
    pl.lit = true; openDoor(z.door);
    burst(pl.x + pl.w / 2, pl.y, G.t.accent, 30);
    if (!z.wrong) { srsHit(item.id); rightAnswer(pl.x + pl.w / 2, pl.y - 30); }
    showModal(p => {
      const cont = el("button", { type: "button", class: "btn primary", text: "Onward", onclick: closeModal });
      p.append(el("span", { class: "kicker", text: "Leap of Judgement · " + G.L.station }), el("p", { class: "qtext", text: item.q }),
        el("div", { class: "why good" }, el("span", { class: "verdict good", text: (z.wrong ? "Found it: " : "Right first time: ") + item.opts[item.a] }), el("p", { text: item.why })),
        noteEl(item.note), el("div", { class: "actions" }, cont));
      modalKeys = e => { if (e.key === "Enter") { cont.click(); return true; } return false; };
    });
  } else {
    pl.alive = false; pl.fall = 0.01;
    burst(pl.x + pl.w / 2, pl.y, "#ff7a8a", 22);
    if (!z.wrong) { z.wrong = true; srsMiss(item.id); G.missed.push(item.id); }
    knowledgeHit(pl.letter + " shatters: “" + item.opts[pl.opt] + "” isn't it.");
    renderLeapCard(z);
  }
}
function takePearl(pr) {
  pr.taken = true; G.pearlsGot++; gainInsight(1); gainXP(50, pr.x, pr.y - 38); addScore(300, pr.x, pr.y - 20);
  burst(pr.x, pr.y, "#ffffff", 26); burst(pr.x, pr.y, "#8fd3ff", 16); ring(pr.x, pr.y, "#d9c8ff", 260); hitstop(0.05);
  const it = QB[pr.fact];
  showModal(p => {
    const cont = el("button", { type: "button", class: "btn primary", text: "Keep it", onclick: closeModal });
    p.append(el("span", { class: "kicker", text: "Pearl " + G.pearlsGot + " of 3 · +1 Insight" }), el("h2", { text: "A pearl of knowledge" }),
      el("p", { class: "qtext", text: it.q }), el("div", { class: "model" }, el("span", { class: "lbl", text: "Pearl" }), el("p", { text: it.a })),
      el("p", { class: "muted", text: "The guardian may ask this one." }), el("div", { class: "actions" }, cont));
    modalKeys = e => { if (e.key === "Enter") { cont.click(); return true; } return false; };
  });
}

/* ================= boss ================= */
function startBoss() {
  G.bossStarted = true;
  const d = G.doors.find(x => x.kind === "arena"); d.open = false; d.fade = 0; G.dyn[d.col] = 1;
  const B = G.L.boss, flying = ["wraith", "shade", "oracle"].includes(B.shape);
  const prev = G.boss;
  G.boss = { x: G.bossX, y: GR * TILE - 70, w: 70, h: 70, vx: 0, vy: 0, hp: prev ? prev.hp : B.hp, max: B.hp, t: 0, act: 1.6, inv: 0, face: -1, flying, trail: [], dead: false,
    phase: prev ? prev.phase : 1, spike: "down", spikeT: 2.5, attacks: 0 };
  $("bossbar").hidden = false; $("bossName").textContent = B.name; updateBossBar();
  toast(B.name + " blocks the way. Stomp it to make it answer. Dash into its shots to reflect them.", null, 6000);
}
function updateBossBar() { $("bossHp").style.width = Math.max(0, G.boss.hp / G.boss.max * 100) + "%"; $("bossName").textContent = G.L.boss.name + (G.boss.phase === 2 ? " · enraged" : ""); }
async function bossRecall(heavy) {
  const b = G.boss;
  if (G.recallIdx >= G.recallPool.length) { G.recallPool = shuffle(G.recallPool); G.recallIdx = 0; }
  const it = QB[G.recallPool[G.recallIdx++]];
  const s = await askRecall(it, G.L.boss.name + " asks · " + it.src + (heavy ? " · crown broken" : ""));
  if (!G) return;
  G.recall.push(s);
  if (s > 0) gainXP(s === 2 ? 40 : 15, b.x + b.w / 2, b.y - 30);
  if (s === 2) { srsHit(it.id); G.streak++; G.bestStreak = Math.max(G.bestStreak, G.streak); gainInsight(1); } else { srsMiss(it.id); G.missed.push(it.id); }
  addScore(s * 200, b.x + b.w / 2, b.y - 10);
  const dmg = s + (s === 2 && G.d.bonusHit ? 1 : 0); if (dmg > s) toast("Might: a double strike!", "good");
  b.hp -= dmg; b.inv = 1.4; updateBossBar(); if (s > 0) { b.flash = 1; G.shake = Math.max(G.shake, 0.25 * s); }
  if (s > 0) burst(b.x + b.w / 2, b.y + 10, G.t.accent, 24);
  if (s === 0) knowledgeHit();
  if (!G) return;
  if (b.hp <= 0) { b.dying = 1.6; b.inv = 99; G.shots = []; G.waves = []; } else if (b.phase === 1 && b.hp <= b.max / 2) {
    b.phase = 2; b.spike = "down"; b.spikeT = 1.5; updateBossBar(); G.shake = 0.4;
    toast(G.L.boss.name + " enrages and grows a spike crown. When the spikes are up, only a ground pound breaks through.", "bad", 6500);
  }
}
function staggerBoss() {
  const b = G.boss; if (!b || b.dead || b.dying) return;
  b.stagger = G.d.stagger; b.spike = "down"; b.spikeT = G.d.stagger; b.flash = 1; b.vx = 0; G.shake = 0.35; hitstop(0.1);
  burst(b.x + b.w / 2, b.y + b.h / 2, "#8fd3ff", 30); gainXP(5);
  toast("Staggered! The guardian is open. Stomp it now.", "good", 3500);
}
function finalizeBoss() {
  const b = G.boss;
  b.dead = true; b.dying = 0; G.shake = 0.6; hitstop(0.12);
  burst(b.x + b.w / 2, b.y + b.h / 2, G.t.accent, 60, { size: 3.2 }); burst(b.x + b.w / 2, b.y + b.h / 2, "#ffffff", 30, { size: 3 });
  ring(b.x + b.w / 2, b.y + b.h, "#ffffff", 420); ring(b.x + b.w / 2, b.y + b.h, G.t.accent, 280);
  $("bossbar").hidden = true; addScore(500); gainXP(100);
  G.loot = { id: itemFor(G.L.id, "boss"), x: G.arena.x1 * TILE - 7 * TILE, y: GR * TILE - 30, t: 0, taken: false };
  G.portal = { x: G.arena.x1 * TILE - 3 * TILE, y: GR * TILE - 56, born: G.time };
  const d = G.doors.find(x => x.kind === "arena"); d.open = true; G.dyn[d.col] = 0;
  toast(G.L.boss.name + " falls. A portal opens.", "good");
}
function rankOf(stars, pearls) { return stars === 3 && pearls === 3 ? "S" : stars === 3 ? "A" : stars === 2 ? "B" : "C"; }
function finishLevel() {
  if (G.finished) return; G.finished = true; G.done = true;
  const L = G.L, avg = G.recall.length ? G.recall.reduce((a, b) => a + b, 0) / G.recall.length : 0;
  const stars = 1 + (G.slips <= 2 ? 1 : 0) + (avg >= 1.5 ? 1 : 0);
  const heartBonus = G.hearts * 100; G.score += heartBonus;
  const newBest = G.score > (P.best[L.id] || 0);
  P.stars[L.id] = Math.max(P.stars[L.id] || 0, stars); P.clears[L.id] = (P.clears[L.id] || 0) + 1;
  P.best[L.id] = Math.max(P.best[L.id] || 0, G.score); P.pearls[L.id] = Math.max(P.pearls[L.id] || 0, G.pearlsGot); save();
  gainXP(100);
  const missed = [...new Set(G.missed)];
  showModal(p => {
    const bs = el("div", { class: "bigstars", "aria-label": stars + " of 3 stars" }); for (let i = 0; i < 3; i++) bs.append(i < stars ? el("b", { text: "★" }) : "☆");
    p.append(el("span", { class: "kicker", text: "Realm cleared · " + L.station }), el("h2", { text: L.name }),
      el("div", { class: "actions" }, el("span", { class: "rank", text: rankOf(stars, G.pearlsGot) }), bs),
      el("div", { class: "stat" },
        el("span", { text: "Score" + (newBest ? " (new best)" : "") }), el("span", { text: G.score.toLocaleString() }),
        el("span", { text: "Including hearts left" }), el("span", { text: "+" + heartBonus }),
        el("span", { text: "Pearls" }), el("span", { text: G.pearlsGot + " / 3" }),
        el("span", { text: "Best answer streak" }), el("span", { text: String(G.bestStreak) }),
        el("span", { text: "Knowledge slips" }), el("span", { text: String(G.slips) }),
        el("span", { text: "Character level" }), el("span", { text: String(charData().level) }),
        el("span", { text: "Guardian recall average" }), el("span", { text: avg.toFixed(1) + " / 2 over " + G.recall.length })));
    if (missed.length) p.append(el("h3", { text: "Sent to the Review Shrine" }), el("ul", { class: "missed-list" }, ...missed.map(id => { const it = QB[id]; return el("li", {}, el("div", { text: it.q }), el("div", { class: "a", text: answerText(it) })); })));
    else p.append(el("p", { class: "lore", text: "A clean run. Nothing goes to the shrine from this realm." }));
    p.append(el("div", { class: "actions" },
      el("button", { type: "button", class: "btn primary", text: "Back to the map", onclick: quitToMap }),
      el("button", { type: "button", class: "btn", text: "Play again", onclick: () => beginRealm(L) })));
  });
}

/* ================= physics ================= */
function solid(tx, ty) {
  if (tx < 0 || tx >= G.W) return true;
  if (G.dyn[tx] && ty < GR) return true;
  if (ty < 0) return G.tiles[tx] === 5;
  if (ty >= ROWS) return false;
  const v = G.tiles[ty * G.W + tx];
  return v > 0 && v !== 6;
}
function rectSolid(x, y, w, h) {
  const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.01) / TILE), y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 0.01) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solid(tx, ty)) return true;
  return false;
}
function moveX(e, dx) {
  e.x += dx;
  if (rectSolid(e.x, e.y, e.w, e.h)) { e.x = dx > 0 ? Math.floor((e.x + e.w) / TILE) * TILE - e.w - 0.01 : (Math.floor(e.x / TILE) + 1) * TILE + 0.01; return true; }
  return false;
}
function moveY(e, dy) {
  e.y += dy;
  if (rectSolid(e.x, e.y, e.w, e.h)) { e.y = dy > 0 ? Math.floor((e.y + e.h) / TILE) * TILE - e.h - 0.01 : (Math.floor(e.y / TILE) + 1) * TILE + 0.01; return true; }
  return false;
}
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function hurt(fromX, up) {
  const p = G.player; if (p.inv > 0 || p.dash > 0) return;
  if (G.d.ward && G.wardReady) { G.wardReady = false; p.inv = 1; ring(p.x + p.w / 2, p.y + p.h / 2, "#8fd3ff", 220); toast("Your Slime-proof Gloves absorb the hit. The ward returns at the next banner.", "good"); return; }
  G.hearts--; renderHearts(); p.inv = 1.3; p.pound = 0; G.shake = 0.2; p.hflash = 1; hitstop(0.09);
  p.vx = (p.x + p.w / 2 < fromX ? -1 : 1) * 260; p.vy = up ? -480 : -320;
  burst(p.x + 9, p.y + 10, "#ff7a8a", 10);
  if (G.hearts <= 0) faint();
}
function respawn() {
  const p = G.player, c = G.check;
  Object.assign(p, { x: c.x - 4, y: GR * TILE - p.h - 1, vx: 0, vy: 0, inv: 1, dash: 0, pound: 0, onPlat: null, jumps: G.d.airJumps, dashes: G.d.airDashes, cape: null, sq: 0 });
  ring(p.x + p.w / 2, p.y + p.h, G.t.accent, 220); burst(p.x + p.w / 2, p.y + p.h / 2, G.t.accent, 16, { g: -100 });
  if (G.boss && !G.boss.dead) { const d = G.doors.find(x => x.kind === "arena"); d.open = true; G.dyn[d.col] = 0; G.bossStarted = false; G.shots = []; G.waves = []; $("bossbar").hidden = true; }
  const ch = G.chase;
  if (ch && !ch.done && c.x < ch.x1) { ch.active = false; ch.wx = ch.x0 - 8 * TILE; }
  G.carry = null;
  const rm = G.room; if (rm && !rm.solved && c.x >= rm.x0 - 6 * TILE && c.x <= rm.x1) roomReset(rm, true);
}
function faint() {
  G.hearts = 0; renderHearts();
  showModal(p => {
    const cont = el("button", { type: "button", class: "btn primary", text: "Rise again", onclick: () => { closeModal(); G.hearts = G.maxH; renderHearts(); respawn(); } });
    p.append(el("span", { class: "kicker", text: G.L.station }), el("h2", { text: "You fainted" }),
      el("p", { class: "lore", text: "You wake at the last banner with full hearts. Opened gates stay open, and your missed questions are waiting at the Echo Gate." }), el("div", { class: "actions" }, cont,
        el("button", { type: "button", class: "btn quiet", text: "Leave the realm", onclick: quitToMap })));
    modalKeys = e => { if (e.key === "Enter") { cont.click(); return true; } return false; };
  });
}
function burst(x, y, color, n, opt) {
  opt = opt || {};
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, sp = (opt.speed || 1) * (60 + Math.random() * 220), life = 0.45 + Math.random() * 0.5;
    G.fx.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, life, max: life, c: color, r: (opt.size || 2.4) * (0.6 + Math.random() * 0.8), g: opt.g != null ? opt.g : 600, drag: 1.2 });
  }
}
/* soft puffs that drift up and grow as they fade */
function dust(x, y, n, dir, color) {
  for (let i = 0; i < n; i++) {
    const life = 0.35 + Math.random() * 0.35;
    G.fx.push({ x: x + (Math.random() - 0.5) * 10, y: y - Math.random() * 3, vx: (dir != null ? dir : (Math.random() - 0.5) * 2) * (30 + Math.random() * 70), vy: -15 - Math.random() * 35, life, max: life, c: color || "rgba(232,224,244,0.5)", r: 2.5 + Math.random() * 3, g: -30, drag: 4, grow: true });
  }
}
function ring(x, y, color, speed) { G.fx.push({ ring: true, x, y, r: 6, life: 0.4, max: 0.4, c: color, speed: speed || 160 }); }
function hitstop(t) { G.hitstop = Math.max(G.hitstop || 0, t); }
function killEnemy(e, how) {
  e.alive = false;
  e.dead = { t: 0, how, vx: (G.player.x < e.x ? 1 : -1) * (80 + Math.random() * 80), vy: how === "squash" ? 0 : -340, rot: 0 };
  burst(e.x + e.w / 2, e.y + e.h / 2, G.t.enemy, how === "squash" ? 8 : 14);
  dust(e.x + e.w / 2, e.y + e.h, 4);
}
function breakCracked(tx, ty) {
  if (tx < 0 || tx >= G.W || G.tiles[ty * G.W + tx] !== 4) return;
  G.tiles[ty * G.W + tx] = 0;
  burst(tx * TILE + 16, ty * TILE + 10, G.t.top, 10);
  markDirty(tx);
  if (G.room && G.room.impl.onBreak && tx >= G.room.c0 && tx < G.room.c1) G.room.impl.onBreak(G.room, tx, ty);
  breakCracked(tx - 1, ty); breakCracked(tx + 1, ty);
  if (ty > 0) breakCracked(tx, ty - 1);
  if (ty < ROWS - 1) breakCracked(tx, ty + 1);
}

function updatePlayer(dt) {
  const p = G.player;
  // ride moving platforms
  if (p.onPlat && p.onPlat.alive && p.onPlat.dx) moveX(p, p.onPlat.dx);
  if (p.onPlat && p.onPlat.alive && p.onPlat.dy) p.y += p.onPlat.dy;
  p.inv -= dt; p.lock -= dt; p.dashCd -= dt; p.buf -= dt; p.coyote -= dt;
  const dir = p.lock > 0 ? 0 : (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  if (pressed.jump) { p.buf = 0.13; pressed.jump = false; }
  // dash
  if (pressed.dash) {
    pressed.dash = false;
    if (p.dashes > 0 && p.dashCd <= 0 && !p.pound) { p.dash = 0.15; p.dashCd = G.d.dashCd; if (!p.ground) p.dashes--; if (dir) p.face = dir; ring(p.x + 9, p.y + 14, "#8fd3ff"); }
  }
  // ground pound
  if (pressed.down) {
    pressed.down = false;
    if (p.ground) { if (!roomInteract()) chestInteract(); }
    else if (!p.pound && p.dash <= 0) { p.pound = 1; p.hang = 0.1; p.vx = 0; p.vy = 0; }
  }
  if (p.dash > 0) {
    p.dash -= dt; p.vx = p.face * G.d.dashSpeed; p.vy = 0;
    G.trail.push({ x: p.x, y: p.y, f: p.face, life: 0.25 });
  } else if (p.pound === 1) {
    p.hang -= dt; p.vx = 0; p.vy = 0; if (p.hang <= 0) { p.pound = 2; p.vy = 1050; }
  } else if (p.pound === 2) {
    p.vx = 0; p.vy = 1050;
  } else {
    if (dir) { p.vx += dir * 2000 * dt; p.vx = clamp(p.vx, -G.d.speed, G.d.speed); p.face = dir; }
    else if (p.lock <= 0) { const f = (p.ground ? 2200 : 900) * dt; p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f; }
    p.vy += 1900 * dt; if (!keys.jump && p.vy < -240) p.vy += 2400 * dt; p.vy = Math.min(p.vy, 900);
  }
  // wall slide
  p.wall = 0;
  if (!p.ground && p.dash <= 0 && !p.pound && dir && p.vy > -50) {
    const probe = dir > 0 ? p.x + p.w + 0.5 : p.x - 1.5;
    if (rectSolid(probe, p.y + 4, 1, p.h - 10)) { p.wall = dir; if (p.vy > 110) p.vy = 110; p.jumps = G.d.airJumps; p.dashes = G.d.airDashes; if (Math.random() < 0.2) G.fx.push({ x: dir > 0 ? p.x + p.w : p.x, y: p.y + p.h - 4, vx: -dir * 20, vy: -20, life: 0.3, c: "#d8d0e8" }); }
  }
  // jumps
  if (p.buf > 0 && !p.pound) {
    if (p.coyote > 0) { p.vy = -655; p.buf = 0; p.coyote = 0; p.sq = 0.28; dust(p.x + p.w / 2, p.y + p.h, 4); }
    else if (p.wall) { const w = p.wall; p.vy = -620; p.vx = -w * 255; p.face = -w; p.lock = 0.14; p.buf = 0; p.sq = 0.2; dust(w > 0 ? p.x + p.w : p.x, p.y + p.h / 2, 4, -w); }
    else if (p.jumps > 0) { p.vy = -575; p.jumps--; p.buf = 0; p.dash = 0; p.sq = 0.22; p.flip = 1; ring(p.x + 9, p.y + p.h, G.t.accent); dust(p.x + p.w / 2, p.y + p.h, 3); }
  }
  const wasPound = p.pound === 2, prevBottom = p.y + p.h, vyBefore = p.vy;
  if (moveX(p, p.vx * dt)) { if (p.dash > 0) p.dash = 0; p.vx = 0; }
  const wasGround = p.ground;
  p.ground = false; p.onPlat = null;
  if (moveY(p, p.vy * dt)) { if (p.vy > 0) p.ground = true; p.vy = 0; }
  // one-way platforms
  if (!p.ground && p.vy >= 0) {
    for (const pl of G.plats) {
      if (!pl.alive) continue;
      if (prevBottom <= pl.y + 2 && p.y + p.h >= pl.y && p.x + p.w > pl.x + 2 && p.x < pl.x + pl.w - 2) {
        p.y = pl.y - p.h; p.vy = 0; p.ground = true; p.onPlat = pl;
        if (pl.kind === "crumble" && !pl.t) pl.t = 0.0001;
        if (pl.kind === "answer") landAnswer(pl);
        break;
      }
    }
  }
  if (p.ground) {
    p.coyote = 0.1; p.jumps = G.d.airJumps; p.dashes = G.d.airDashes;
    if (!wasGround && vyBefore > 120) { const k = clamp(vyBefore / 900, 0.15, 1); p.sq = -0.34 * k; if (vyBefore > 300) { dust(p.x + 2, p.y + p.h, 2 + Math.round(k * 3), -1); dust(p.x + p.w - 2, p.y + p.h, 2 + Math.round(k * 3), 1); } }
    if (wasPound) poundLand();
  }
  p.x = clamp(p.x, 0, G.W * TILE - p.w);
  p.anim += Math.abs(p.vx) * dt;
  // animation state: squash/stretch spring, footsteps, blink, flips, cape
  const tgt = p.ground ? 0 : clamp(Math.abs(p.vy) / 4200, 0, 0.12);
  p.sq += (tgt - p.sq) * Math.min(1, dt * 11);
  if (p.ground && Math.abs(p.vx) > 110 && p.dash <= 0) { p.stepT -= dt; if (p.stepT <= 0) { p.stepT = 0.21; dust(p.x + p.w / 2 - p.face * 6, p.y + p.h, 1, -p.face * 0.7); } }
  if (p.wall && Math.random() < 0.35) dust(p.wall > 0 ? p.x + p.w : p.x, p.y + p.h - 6, 1, -p.wall * 0.3);
  p.blink -= dt; if (p.blink < -0.12) p.blink = 2 + Math.random() * 3;
  p.spin = p.pound === 1 ? p.spin + dt * 46 : 0;
  if (p.flip) { p.flip += dt * 3.2; if (p.flip >= 2 || p.ground || p.wall) p.flip = 0; }
  p.hflash = Math.max(0, p.hflash - dt * 3);
  updateCape(p, dt);
  G.look += ((p.face * 34 + p.vx * 0.12) - G.look) * Math.min(1, dt * 2.5);
}
function updateCape(p, dt) {
  const ax = p.x + p.w / 2 - p.face * 3, ay = p.y + 11;
  if (!p.cape) p.cape = Array.from({ length: 7 }, (_, i) => ({ x: ax - p.face * i * 3, y: ay + i * 2.5, px: ax - p.face * i * 3, py: ay + i * 2.5 }));
  const c = p.cape, wind = Math.sin(G.time * 6.5) * 14 + Math.sin(G.time * 11) * 6;
  c[0].x = c[0].px = ax; c[0].y = c[0].py = ay;
  for (let i = 1; i < c.length; i++) {
    const q = c[i], vx = (q.x - q.px) * 0.84, vy = (q.y - q.py) * 0.86;
    q.px = q.x; q.py = q.y;
    q.x += vx + (-p.face * 28 + wind * (i / c.length)) * dt; q.y += vy + 760 * dt * dt;
  }
  for (let k = 0; k < 3; k++) for (let i = 1; i < c.length; i++) {
    const a = c[i - 1], b = c[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, f = (d - 3.2) / d;
    b.x -= dx * f; b.y -= dy * f;
  }
}
function poundLand() {
  const p = G.player;
  const row = Math.floor((p.y + p.h + 2) / TILE);
  const x0 = Math.floor(p.x / TILE), x1 = Math.floor((p.x + p.w - 0.01) / TILE);
  let broke = false;
  for (let tx = x0; tx <= x1; tx++) if (G.tiles[row * G.W + tx] === 4) { breakCracked(tx, row); broke = true; }
  if (broke) { p.ground = false; p.pound = 2; G.shake = 0.25; return; }
  p.pound = 0; G.shake = 0.18;
  ring(p.x + 9, p.y + p.h, G.t.top); burst(p.x + 9, p.y + p.h, G.t.top, 10);
  dust(p.x + 2, p.y + p.h, 5, -1.4); dust(p.x + p.w - 2, p.y + p.h, 5, 1.4); hitstop(0.05);
  for (const e of G.enemies) if (e.alive && e.kind !== "fact" && Math.abs(e.x + e.w / 2 - (p.x + 9)) < G.d.poundR && Math.abs(e.y + e.h - (p.y + p.h)) < 40) { killEnemy(e, "fly"); gainXP(3); addScore(50, e.x, e.y - 10); }
}

function update(dt) {
  G.time += dt; G.shake = Math.max(0, G.shake - dt);
  // platforms first, so riders move with them
  for (const pl of G.plats) {
    if (pl.kind === "lift") { const ny = pl.active ? pl.ay + (pl.by - pl.ay) * (0.5 - 0.5 * Math.cos((pl.lt = (pl.lt || 0) + dt) * pl.sp)) : pl.ay; pl.dy = ny - pl.y; pl.y = ny; }
    else if (pl.kind === "move") { const nx = pl.ax + (pl.bx - pl.ax) * (0.5 - 0.5 * Math.cos(G.time * pl.sp + pl.ph)); pl.dx = nx - pl.x; pl.x = nx; }
    else if (pl.kind === "crumble" && pl.t) {
      pl.t += dt;
      if (pl.alive && pl.t > 0.45) { pl.alive = false; pl.fall = 0.01; }
      if (pl.t > 3.2) { pl.alive = true; pl.t = 0; pl.fall = 0; pl.y = pl.y0; }
    }
    if (!pl.alive && pl.fall) { pl.fall += dt; pl.y = pl.y0 + pl.fall * pl.fall * 400; }
  }
  updatePlayer(dt);
  updateChests(dt);
  updateHazards(dt);
  if (G.forks.length) updateForks();
  if (modalOpen || !G) return;
  const p = G.player;
  if (p.y > ROWS * TILE + 40) {
    G.hearts--; renderHearts(); G.streak = 0; renderScore(); toast("You fell. Back to the last banner.", "bad");
    if (G.hearts <= 0) { faint(); return; } respawn();
  }
  // tips
  for (const tp of G.tips) if (!TIPS_SEEN.has(tp.key) && p.x > tp.x - 5 * TILE) { TIPS_SEEN.add(tp.key); toast(tp.text, null, 6500); }
  if (G.room) { roomUpdate(G.room, dt); if (modalOpen || !G) return; }
  // checkpoints
  for (const f of G.flags) if (p.x > f.x - 8 && f.x > G.check.x) { if (!f.on) { f.on = true; toast("Banner raised. You'll return here if you fall.", "good"); G.wardReady = true; if (G.d.regen && G.hearts < G.maxH) { G.hearts++; renderHearts(); toast("Iron Tonic: a heart restored.", "good"); } } G.check = f; }
  // signs, zones
  for (const s of G.signs) if (!s.read && overlap(p, s)) { openSign(s); return; }
  let inLeap = null;
  for (const z of Object.values(G.zones)) {
    const inside = p.x + p.w > z.x0 && p.x < z.x1;
    if (inside && !z.intro) { enterZone(z); if (modalOpen) return; }
    if (inside && z.kind === "leap" && !z.done) inLeap = z;
  }
  if (inLeap !== leapShown) { leapShown = inLeap; $("leapCard").hidden = !inLeap; $("stage").classList.toggle("leaping", !!inLeap); if (inLeap) renderLeapCard(inLeap); }
  for (const o of G.orbs) if (!o.taken && Math.hypot(p.x + p.w / 2 - o.x, p.y + p.h / 2 - (o.y + Math.sin(G.time * 2 + o.ph) * 4)) < o.r + 12) touchOrb(o);
  if (modalOpen) return;
  // pickups
  for (const pr of G.pearls) if (!pr.taken && Math.hypot(p.x + p.w / 2 - pr.x, p.y + p.h / 2 - pr.y) < 22) { takePearl(pr); return; }
  for (const po of G.potions) if (!po.taken && Math.hypot(p.x + p.w / 2 - po.x, p.y + p.h / 2 - po.y) < 20) { po.taken = true; if (G.hearts < G.maxH) { G.hearts++; renderHearts(); toast("A remedy restores a heart.", "good"); } else addScore(100, po.x, po.y); burst(po.x, po.y, "#ff7a8a", 12); }
  // springs and spikes
  for (const sp of G.springs) { sp.t -= dt; if (p.vy > 0 && overlap(p, sp) && p.y + p.h - sp.y < 14) { p.vy = -1000; p.pound = 0; p.jumps = G.d.airJumps; p.dashes = G.d.airDashes; sp.t = 0.25; p.y = sp.y - p.h; ring(sp.x + 12, sp.y, G.t.accent); } }
  for (const sk of G.spikes) if (overlap(p, sk)) hurt(p.x + p.w / 2 + (p.vx > 0 ? 10 : -10), true);
  // doors
  for (const d of G.doors) {
    if (d.fade > 0) d.fade += dt * 2;
    if (!d.open && !d.busy) { const dx = d.col * TILE; if (p.x + p.w >= dx - 3 && p.x <= dx + TILE + 3 && p.y + p.h > GR * TILE - 3 * TILE) { triggerDoor(d); if (modalOpen) return; } }
  }
  // chase
  const ch = G.chase;
  if (ch && !ch.done) {
    if (!ch.active && p.x > ch.x0) { ch.active = true; toast(ch.name + " is coming. Run!", "bad", 4000); G.shake = 0.3; }
    if (ch.active) {
      ch.wx += (110 + Math.min(60, (p.x - ch.wx) < 200 ? 0 : 30)) * dt;
      if (p.x < ch.wx) { hurt(p.x - 100); p.x = ch.wx + 6; p.vx = 260; }
      if (p.x > ch.x1) { ch.done = true; ch.active = false; toast("You outran " + ch.name.replace(/^The /, "the ") + ".", "good"); addScore(250, p.x, p.y - 20); }
    }
  }
  // enemies
  for (const e of G.enemies) {
    if (!e.alive) {
      const d = e.dead; if (d && d.t < 0.9) { d.t += dt; if (d.how !== "squash") { d.vy += 1500 * dt; e.x += d.vx * dt; e.y += d.vy * dt; d.rot += dt * 11 * Math.sign(d.vx); } }
      continue;
    }
    e.t += dt; e.recoil = Math.max(0, (e.recoil || 0) - dt);
    if (e.kind === "walk") {
      e.vy = Math.min(e.vy + 1900 * dt, 900);
      if (moveX(e, e.vx * dt)) e.vx = -e.vx;
      const ahead = e.vx > 0 ? e.x + e.w + 2 : e.x - 2;
      if (!solid(Math.floor(ahead / TILE), Math.floor((e.y + e.h + 4) / TILE))) e.vx = -e.vx;
      if (moveY(e, e.vy * dt)) e.vy = 0;
    } else if (e.kind === "hopper") {
      e.vy = Math.min(e.vy + 1900 * dt, 900);
      if (e.grounded) { e.vx = 0; e.jt -= dt; if (e.jt <= 0 && Math.abs(p.x - e.x) < 10 * TILE) { e.vy = -560; e.vx = Math.sign(p.x - e.x) * 90; e.jt = 1.1 + Math.random() * 0.8; } }
      if (moveX(e, e.vx * dt)) e.vx = -e.vx;
      e.grounded = false; if (moveY(e, e.vy * dt)) { if (e.vy > 0) e.grounded = true; e.vy = 0; }
    } else if (e.kind === "turret") {
      e.cd -= dt;
      if (e.cd <= 0 && Math.abs(p.x - e.x) < 9 * TILE) { e.cd = 2.3; e.recoil = 0.18; const dirx = Math.sign(p.x - e.x) || -1; G.shots.push({ x: e.x + e.w / 2 + dirx * 12, y: e.y + 8, vx: dirx * 180, vy: 0, life: 3.5 }); }
    } else if (e.kind === "fact") { e.x = e.bx + Math.sin(e.t * 0.6) * 36; e.y = e.by + Math.sin(e.t * 1.6) * 10; }
    else { e.x = e.bx + Math.sin(e.t * 0.9) * 70; e.y = e.by + Math.sin(e.t * 2.2) * 18; }
    if (e.y > ROWS * TILE) e.alive = false;
    if (e.kind === "fact") { if (overlap(p, e) && (p.vy > 60 || p.pound) && p.y + p.h - e.y < 18) { stompFact(e); p.vy = -460; p.jumps = G.d.airJumps; p.dashes = G.d.airDashes; } continue; }
    if (overlap(p, e)) {
      if (p.dash > 0) continue;
      if ((p.vy > 60 || p.pound) && p.y + p.h - e.y < 18) { killEnemy(e, p.pound ? "fly" : "squash"); if (!p.pound) { p.vy = keys.jump ? -560 : -430; p.sq = 0.2; } p.jumps = G.d.airJumps; p.dashes = G.d.airDashes; hitstop(0.06); gainXP(3); addScore(50, e.x, e.y - 10); }
      else hurt(e.x + e.w / 2);
    }
  }
  // boss
  if (!G.bossStarted && p.x > G.arenaX + 2.5 * TILE && !(G.boss && (G.boss.dead || G.boss.dying))) startBoss();
  const b = G.boss;
  if (b && b.dying) {
    b.dying -= dt; b.t += dt; b.flash = Math.floor(b.dying * 12) % 2 ? 0.85 : 0; G.shake = Math.max(G.shake, 0.22);
    if (Math.random() < dt * 14) burst(b.x + Math.random() * b.w, b.y + Math.random() * b.h, Math.random() < 0.5 ? "#ffffff" : G.t.accent, 8, { size: 3 });
    if (b.dying <= 0) finalizeBoss();
  }
  if (b) b.flash = Math.max(0, (b.flash || 0) - dt * (b.dying ? 0 : 3.5));
  if (b && !b.dead && !b.dying && G.bossStarted) {
    b.t += dt; b.inv -= dt;
    const stag = b.stagger > 0; if (stag) b.stagger -= dt;
    const cx = p.x + p.w / 2, bx = b.x + b.w / 2, fast = b.phase === 2 ? 1.45 : 1;
    b.face = cx < bx ? -1 : 1;
    if (b.phase === 2 && b.inv < 98 && !stag) {
      b.spikeT -= dt;
      if (b.spikeT <= 0) { if (b.spike === "down") { b.spike = "warn"; b.spikeT = 0.7; } else if (b.spike === "warn") { b.spike = "up"; b.spikeT = 2.4; } else { b.spike = "down"; b.spikeT = 2.2; } }
    }
    const ax0 = (G.arena.x0 + 1) * TILE, ax1 = (G.arena.x1 - 1) * TILE - b.w;
    if (b.flying) {
      if (!stag) b.x += clamp(cx - bx, -1, 1) * 60 * fast * dt; b.x = clamp(b.x, ax0, ax1);
      b.y = GR * TILE - b.h - 34 + Math.sin(b.t * 1.6 * fast) * 24;
    } else {
      b.vx = stag ? 0 : b.face * (b.inv > 0 ? 20 : 68 * fast);
      const fallV = b.vy;
      b.vy = Math.min(b.vy + 1900 * dt, 900);
      moveX(b, b.vx * dt); b.x = clamp(b.x, ax0, ax1);
      if (moveY(b, b.vy * dt)) { if (fallV > 300) { dust(b.x + 6, b.y + b.h, 5, -1.2); dust(b.x + b.w - 6, b.y + b.h, 5, 1.2); b.land = 0.25; } if (fallV > 300 && b.phase === 2) { G.waves.push({ x: bx - 30, dir: -1, life: 2.2 }, { x: bx + 30, dir: 1, life: 2.2 }); G.shake = 0.3; } b.vy = 0; }
    }
    b.trail.unshift({ x: bx, y: b.y + b.h * 0.6 }); if (b.trail.length > 40) b.trail.pop();
    b.act -= dt;
    if (b.act <= 0 && b.inv <= 0 && !stag) {
      b.act = (1.6 + Math.random() * 1.2) / fast; b.attacks++;
      if (!b.flying && Math.random() < (b.phase === 2 ? 0.55 : 0.4)) b.vy = -640;
      else if (b.flying && b.phase === 2 && b.attacks % 2 === 0) {
        for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283 + b.t; G.shots.push({ x: bx, y: b.y + b.h / 2, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, life: 4 }); }
      } else {
        const n = b.phase === 2 ? 3 : Math.random() < 0.5 ? 1 : 3;
        for (let i = 0; i < n; i++) { const ang = Math.atan2((p.y + p.h / 2) - (b.y + b.h / 2), cx - bx) + (i - (n - 1) / 2) * 0.28; G.shots.push({ x: bx, y: b.y + b.h / 2, vx: Math.cos(ang) * 210 * (b.phase === 2 ? 1.15 : 1), vy: Math.sin(ang) * 210, life: 4 }); }
      }
    }
    if (overlap(p, b)) {
      const topHit = (p.vy > 40 || p.pound === 2) && p.y + p.h - b.y < 24;
      if (topHit && b.inv <= 0) {
        const pounding = p.pound === 2;
        if (b.spike === "up" && !pounding) { hurt(bx, true); toast("Spikes up: ground-pound to break through.", "bad"); }
        else {
          if (pounding) { b.spike = "down"; b.spikeT = 2.2; G.shake = 0.35; burst(bx, b.y, "#ffffff", 20); }
          p.vy = -560; p.pound = 0; p.jumps = G.d.airJumps; p.dashes = G.d.airDashes; b.inv = 99; bossRecall(pounding && b.phase === 2); return;
        }
      } else if (b.inv < 98) hurt(bx);
    }
  }
  for (const w of G.waves) { w.x += w.dir * 270 * dt; w.life -= dt; if (Math.abs(w.x - (p.x + p.w / 2)) < 14 && p.y + p.h > GR * TILE - 18) hurt(w.x, true); }
  G.waves = G.waves.filter(w => w.life > 0);
  for (const s of G.shots) {
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    if (s.friendly) {
      const bb = G.boss;
      if (bb && !bb.dead && !bb.dying && s.x > bb.x && s.x < bb.x + bb.w && s.y > bb.y && s.y < bb.y + bb.h) { s.life = 0; staggerBoss(); }
      for (const e of G.enemies) if (e.alive && e.kind !== "fact" && Math.abs(s.x - (e.x + e.w / 2)) < 16 && Math.abs(s.y - (e.y + e.h / 2)) < 16) { s.life = 0; killEnemy(e, "fly"); addScore(50, e.x, e.y - 10); }
    }
    else if (Math.hypot(s.x - (p.x + p.w / 2), s.y - (p.y + p.h / 2)) < (p.dash > 0 ? 20 : 14)) {
      if (p.dash > 0) {
        const bb = G.boss, tx = bb && !bb.dead ? bb.x + bb.w / 2 : s.x - s.vx, ty = bb && !bb.dead ? bb.y + bb.h / 2 : s.y - s.vy;
        const a = Math.atan2(ty - s.y, tx - s.x), sp = Math.hypot(s.vx, s.vy) * 1.6;
        s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp; s.friendly = true; s.life = 3;
        ring(s.x, s.y, "#8fd3ff", 200); burst(s.x, s.y, "#8fd3ff", 10); hitstop(0.05); gainXP(5); addScore(40, s.x, s.y - 10);
        if (!G.toldReflect) { G.toldReflect = true; toast("Reflected! Dashing into a shot sends it back.", "good"); }
      } else { s.life = 0; hurt(s.x); }
    }
    if (solid(Math.floor(s.x / TILE), Math.floor(s.y / TILE))) s.life = 0;
  }
  G.shots = G.shots.filter(s => s.life > 0);
  if (G.portal && !G.done && Math.hypot(p.x + p.w / 2 - G.portal.x, p.y + p.h / 2 - G.portal.y) < 30) { G.done = true; G.exitT = 0.001; G.exitFrom = { x: p.x, y: p.y }; ring(G.portal.x, G.portal.y, G.t.accent, 300); return; }
  for (const f of G.fx) {
    if (f.ring) f.r += f.speed * dt;
    else { const k = 1 / (1 + f.drag * dt); f.vx *= k; f.vy *= k; f.vy += f.g * dt; f.x += f.vx * dt; f.y += f.vy * dt; }
    f.life -= dt;
  }
  G.fx = G.fx.filter(f => f.life > 0);
  for (const t of G.trail) t.life -= dt; G.trail = G.trail.filter(t => t.life > 0);
  for (const q of G.pops) { q.y -= 30 * dt; q.life -= dt; } G.pops = G.pops.filter(q => q.life > 0);
  updateNear();
  if (G.L.meter) {
    const m = G.L.meter, prog = clamp((p.x - G.startX) / (G.arenaX - G.startX), 0, 1);
    const v = Math.round(m.from + (m.to - m.from) * prog), chip = $("meterChip");
    chip.textContent = m.label + " " + v + " " + m.unit;
    chip.classList.toggle("warn", (m.warnAbove != null && v > m.warnAbove) || (m.warnBelow != null && v < m.warnBelow));
  }
}

/* ================= rendering ================= */
const cv = $("cv");
let ctx = cv.getContext("2d");
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const off = document.createElement("canvas"), offCtx = off.getContext("2d");
/* Draw fn into an offscreen buffer, tint it (hit flash), then composite it back in world space. */
function drawFlash(fn, cx, cy, size, flash, color) {
  if (!(flash > 0.02)) { fn(); return; }
  const k = DPR * SC, S = Math.ceil(size * k);
  if (off.width < S || off.height < S) { off.width = Math.max(off.width, S); off.height = Math.max(off.height, S); }
  offCtx.setTransform(1, 0, 0, 1, 0, 0); offCtx.clearRect(0, 0, S, S);
  offCtx.setTransform(k, 0, 0, k, (size / 2 - cx) * k, (size / 2 - cy) * k);
  const main = ctx; ctx = offCtx; try { fn(); } finally { ctx = main; }
  offCtx.setTransform(1, 0, 0, 1, 0, 0);
  offCtx.globalCompositeOperation = "source-atop"; offCtx.globalAlpha = clamp(flash, 0, 1); offCtx.fillStyle = color || "#ffffff"; offCtx.fillRect(0, 0, S, S);
  offCtx.globalCompositeOperation = "source-over"; offCtx.globalAlpha = 1;
  ctx.drawImage(off, 0, 0, S, S, cx - size / 2, cy - size / 2, size, size);
}
let VW = 480, VH = 384, SC = 1, OFFY = 0, DPR = 1, STW = 480, STH = 384, BASESC = 1;
function resize() {
  const r = $("stage").getBoundingClientRect();
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.max(1, Math.round(r.width * DPR)); cv.height = Math.max(1, Math.round(r.height * DPR));
  SC = Math.min(r.height / (ROWS * TILE), r.width / (11 * TILE));
  STW = r.width; STH = r.height; BASESC = SC;
  VW = r.width / SC; VH = r.height / SC; OFFY = Math.max(0, VH - ROWS * TILE);
}
addEventListener("resize", () => { if (G) resize(); });

function skyY(type, x, base, amp) {
  switch (type) {
    case "hills": return base - (Math.sin(x * 0.006) * 26 + Math.sin(x * 0.017 + 1) * 12 + 20) * amp;
    case "trees": { const c = Math.floor(x / 26), f = (x % 26) / 26, h = 40 + h2(c, 3) * 60; return base - (h * (1 - Math.abs(f - 0.5) * 2)) * amp; }
    case "spires": { const c = Math.floor(x / 44), f = (x % 44) / 44, h = 30 + h2(c, 5) * 120; return base - Math.max(0, h * (1 - Math.abs(f - 0.5) * 2.6)) * amp; }
    case "towers": { const c = Math.floor(x / 52), f = (x % 52) / 52; if (f < 0.18) return base - 10 * amp; const h = 40 + h2(c, 7) * 110; return base - (f > 0.42 && f < 0.62 && h2(c, 2) > 0.5 ? h + 16 : h) * amp; }
    case "temple": { const c = Math.floor(x / 70), f = (x % 70) / 70, h = 50 + h2(c, 9) * 70; if (f < 0.1) return base - 8 * amp; return base - (h + Math.max(0, 22 - Math.abs(f - 0.55) * 60)) * amp; }
    case "cave": { const c = Math.floor(x / 30), f = (x % 30) / 30; return base - (20 + h2(c, 4) * 40) * (1 - Math.abs(f - 0.5) * 1.4) * amp; }
  }
  return base;
}
function drawSkyline(c, t, scroll, W, base, par, color, amp) {
  c.fillStyle = color; c.beginPath(); c.moveTo(0, c.canvas.height * 4);
  const step = 4;
  for (let sx = 0; sx <= W + step; sx += step) c.lineTo(sx, skyY(t.skyline, sx + scroll * par + 1000, base, amp));
  c.lineTo(W + step, c.canvas.height * 4); c.closePath(); c.fill();
  if (t.skyline === "cave") {
    c.beginPath(); c.moveTo(0, -10);
    for (let sx = 0; sx <= W + step; sx += step) { const x = sx + scroll * par + 500, cc = Math.floor(x / 34), f = (x % 34) / 34; c.lineTo(sx, (10 + h2(cc, 8) * 60) * Math.max(0, 1 - Math.abs(f - 0.5) * 2.2) * amp); }
    c.lineTo(W + step, -10); c.closePath(); c.fill();
  }
}
function drawBackground() {
  const t = G.t, W = VW, H = VH;
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, t.sky[0]); g.addColorStop(1, t.sky[1]); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (t.moons) {
    for (let i = 0; i < 4; i++) {
      const mx = ((i * 211 + 90) - G.cam * 0.04) % (W + 200); const x = mx < -100 ? mx + W + 200 : mx, y = OFFY + 40 + i * 22 + Math.sin(G.time * 0.2 + i) * 6, r = 9 + i * 3;
      ctx.fillStyle = "#f3e9ff"; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
      ctx.fillStyle = t.sky[0]; ctx.beginPath(); ctx.arc(x + r * (0.3 + i * 0.35), y - 2, r, 0, 6.283); ctx.fill();
    }
  } else if (t.particles === "embers" || t.particles === "drops") {
    ctx.fillStyle = "rgba(255,200,150,0.18)"; ctx.beginPath(); ctx.arc(W * 0.78, OFFY + 70, 46, 0, 6.283); ctx.fill();
  } else if (t.particles !== "dust" && t.skyline !== "cave") {
    ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.beginPath(); ctx.arc(W * 0.8, OFFY + 60, 20, 0, 6.283); ctx.fill();
  }
  if (t.skyline !== "cave") {
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    for (let i = 0; i < 6; i++) {
      const span = W + 300, cx0 = ((h2(i, 21) * span - G.cam * 0.08 - G.time * (6 + i * 2)) % span + span) % span - 150, cy0 = OFFY + 30 + h2(i, 22) * 110;
      ctx.beginPath(); ctx.ellipse(cx0, cy0, 60 + h2(i, 23) * 50, 9 + h2(i, 24) * 6, 0, 0, 6.283); ctx.ellipse(cx0 + 30, cy0 - 6, 34, 8, 0, 0, 6.283); ctx.fill();
    }
  }
  lightRays();
  ctx.save(); ctx.translate(0, OFFY);
  drawSkyline(ctx, t, G.cam + 7000, W, GR * TILE - 96, 0.1, mix(t.far, t.sky[1], 0.5), 1.7);
  haze(40, GR * TILE, t.sky[1], 0.28);
  drawSkyline(ctx, t, G.cam, W, GR * TILE - 60, 0.2, t.far, 1.4);
  haze(110, GR * TILE, t.sky[1], 0.22);
  drawSkyline(ctx, t, G.cam, W, GR * TILE - 10, 0.45, t.near, 1);
  groundMist();
  if (t.river) { ctx.fillStyle = "rgba(90,170,230,0.35)"; ctx.fillRect(0, GR * TILE - 22, W, 14); ctx.fillStyle = "rgba(200,235,255,0.35)"; for (let i = 0; i < 12; i++) { const x = ((i * 97 - G.cam * 0.6 + G.time * 30) % (W + 40) + W + 40) % (W + 40) - 20; ctx.fillRect(x, GR * TILE - 17, 16, 2); } }
  if (t.torches) for (let i = 0; i < 8; i++) { const x = ((i * 260 - G.cam * 0.7) % (W + 260) + W + 260) % (W + 260) - 60, y = GR * TILE - 90; ctx.fillStyle = "#3a3040"; ctx.fillRect(x - 2, y, 4, 18); const fl = 6 + Math.sin(G.time * 12 + i) * 2; const rg = ctx.createRadialGradient(x, y - 4, 1, x, y - 4, 40); rg.addColorStop(0, "rgba(255,190,90,0.55)"); rg.addColorStop(1, "rgba(255,190,90,0)"); ctx.fillStyle = rg; ctx.fillRect(x - 40, y - 44, 80, 80); ctx.fillStyle = "#ffcf6a"; ctx.beginPath(); ctx.ellipse(x, y - 4, 3.5, fl, 0, 0, 6.283); ctx.fill(); }
  ctx.restore();
  const N = 34;
  for (let i = 0; i < N; i++) {
    const sx = h2(i, 1), sy = h2(i, 2), sp = 0.4 + h2(i, 3);
    let x = sx * W - G.cam * 0.3 * sp, y = sy * H;
    const tt = G.time * sp;
    switch (t.particles) {
      case "stars": ctx.fillStyle = "rgba(255,255,255," + (0.3 + 0.5 * Math.abs(Math.sin(tt * 2 + i))) + ")"; y = sy * H * 0.6; break;
      case "bubbles": y = H - ((sy * H + tt * 30) % (H + 20)); x += Math.sin(tt * 2 + i) * 6; ctx.fillStyle = "rgba(210,255,250,0.35)"; break;
      case "drops": y = (sy * H + tt * 120) % (H + 20); ctx.fillStyle = "rgba(255,140,120,0.35)"; break;
      case "leaves": y = (sy * H + tt * 22) % (H + 20); x += Math.sin(tt + i) * 20; ctx.fillStyle = "rgba(170,210,120,0.5)"; break;
      case "dust": x += Math.sin(tt * 0.5 + i) * 14; y += Math.cos(tt * 0.4 + i) * 10; ctx.fillStyle = "rgba(220,210,240,0.22)"; break;
      case "snow": y = (sy * H + tt * 34) % (H + 20); x += Math.sin(tt + i) * 10; ctx.fillStyle = "rgba(235,245,255,0.7)"; break;
      case "petals": y = (sy * H + tt * 18) % (H + 20); x += Math.sin(tt * 1.3 + i) * 24; ctx.fillStyle = "rgba(255,190,225,0.5)"; break;
      case "embers": y = H - ((sy * H + tt * 40) % (H + 20)); x += Math.sin(tt * 3 + i) * 5; ctx.fillStyle = "rgba(255," + (140 + (i % 5) * 20) + ",60,0.7)"; break;
    }
    x = ((x % (W + 20)) + W + 20) % (W + 20) - 10;
    const r = t.particles === "bubbles" ? 2 + sp * 2 : t.particles === "drops" ? 1.2 : 1.4 + sp;
    if (t.particles === "drops") ctx.fillRect(x, y, 1.5, 7); else { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); }
  }
}
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function label(text, x, y, color, size) {
  ctx.font = "600 " + (size || 10) + "px 'Atkinson Hyperlegible', sans-serif"; const w = ctx.measureText(text).width + 8;
  const h = (size || 10) + 3;
  ctx.fillStyle = "rgba(12,10,18,0.78)"; rr(x - w / 2, y - h + 4, w, h, 4); ctx.fill();
  ctx.fillStyle = color || "#f4ecd8"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, x, y - h / 2 + 4);
}
function drawTiles() {
  drawTerrain();
  if (G.t.water) {
    const prog = clamp((G.player.x - G.startX) / (G.arenaX - G.startX), 0, 1), wy = ROWS * TILE - 40 - prog * 150;
    ctx.fillStyle = "rgba(60,200,220,0.16)"; ctx.fillRect(G.cam, wy, VW, ROWS * TILE - wy + 40);
    ctx.fillStyle = "rgba(200,255,255,0.35)"; for (let x = Math.floor(G.cam / 24) * 24; x < G.cam + VW; x += 24) ctx.fillRect(x + Math.sin(G.time * 2 + x) * 3, wy + Math.sin(G.time * 1.5 + x * 0.1) * 2, 12, 2);
  }
}
function drawPlat(pl) {
  if (pl.hidden) return;
  if (pl.x + pl.w < G.cam - 40 || pl.x > G.cam + VW + 40) return;
  if (!pl.alive && (!pl.fall || pl.fall > 1)) return;
  const t = G.t, a = pl.alive ? 1 : clamp(1 - pl.fall, 0, 1);
  ctx.save(); ctx.globalAlpha = a;
  let x = pl.x, y = pl.y;
  if (pl.kind === "crumble" && pl.t && pl.alive) x += Math.sin(G.time * 60) * 1.5;
  if (pl.kind === "answer") {
    const glow = pl.lit ? 1 : 0.5 + 0.3 * Math.sin(G.time * 3 + pl.x);
    ctx.fillStyle = pl.lit ? t.top : "#5a5470"; rr(x + 2, y, pl.w - 4, 14, 5); ctx.fill();
    ctx.fillStyle = "rgba(255,240,200," + (0.25 * glow) + ")"; ctx.fillRect(x + 6, y + 2, pl.w - 12, 3);
    ctx.fillStyle = pl.lit ? "#14101c" : t.accent; ctx.font = "700 20px Cinzel, Georgia, serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (pl.alive || pl.lit) { ctx.fillStyle = pl.lit ? t.top : t.accent; ctx.fillText(pl.letter, x + pl.w / 2, y - 26 + Math.sin(G.time * 2 + pl.x) * 2); }
  } else if (pl.kind === "move") {
    ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.moveTo(pl.ax + pl.w / 2, y + 7); ctx.lineTo(pl.bx + pl.w / 2, y + 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = t.plat; rr(x, y, pl.w, 14, 5); ctx.fill(); ctx.fillStyle = t.top; ctx.fillRect(x + 3, y, pl.w - 6, 3);
    ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.beginPath(); ctx.arc(x + 10, y + 8, 2.5, 0, 6.283); ctx.arc(x + pl.w - 10, y + 8, 2.5, 0, 6.283); ctx.fill();
  } else if (pl.kind === "crumble") {
    ctx.fillStyle = t.plat; rr(x + 1, y, pl.w - 2, 12, 3); ctx.fill(); ctx.fillStyle = t.top; ctx.fillRect(x + 2, y, pl.w - 4, 3);
    ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 8, y + 3); ctx.lineTo(x + 14, y + 9); ctx.lineTo(x + 22, y + 5); ctx.stroke();
  } else {
    ctx.fillStyle = t.plat; rr(x, y, pl.w, 12, 4); ctx.fill(); ctx.fillStyle = t.top; ctx.fillRect(x + 2, y, pl.w - 4, 3);
  }
  ctx.restore();
}
function limb(x, y, len, ang, w, col, end) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-ang);
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, len); ctx.stroke();
  if (end) { ctx.fillStyle = end; ctx.beginPath(); ctx.arc(0, len + 0.5, w * 0.62, 0, 6.283); ctx.fill(); }
  ctx.restore();
}
function drawCape(p, look) {
  const c = p.cape; if (!c) return;
  look = look || heroLook();
  ctx.fillStyle = look.cape;
  ctx.beginPath();
  for (let i = 0; i < c.length; i++) { const w = 3.6 - i * 0.35; ctx.lineTo(c[i].x, c[i].y - w); }
  for (let i = c.length - 1; i >= 0; i--) { const w = 3.6 - i * 0.35; ctx.lineTo(c[i].x, c[i].y + w); }
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = shade(look.cape, -0.3); ctx.lineWidth = 1; ctx.beginPath(); c.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.stroke();
}
/* Draws the registrar. p: body state (position, velocity, pose); look: appearance; time: animation clock. */
function drawHero(p, look, time) {
  p = p || G.player; look = look || heroLook();
  const T = time != null ? time : G.time;
  drawCape(p, look);
  const run = p.ground && Math.abs(p.vx) > 20, ph = p.anim * 0.075, sw = Math.sin(ph);
  const bob = run ? -Math.abs(Math.cos(ph)) * 1.8 : p.ground ? Math.sin(T * 3) * 0.5 : 0;
  let sx = 1 - p.sq * 0.7, sy = 1 + p.sq, lean = 0;
  let fl = 0, bl = 0, fa = 0.08 * Math.sin(T * 3), ba = -0.08 * Math.sin(T * 3);
  if (p.dash > 0) { fl = -0.7; bl = -1.1; fa = -1.4; ba = -1.1; lean = 0.32; sx = 1.18; sy = 0.86; }
  else if (p.pound) { fl = 1.5; bl = 1.3; fa = 2.7; ba = 2.5; }
  else if (p.wall) { fl = 0.55; bl = 0.15; fa = 2.0; ba = 1.5; lean = -0.1; }
  else if (!p.ground && p.vy < 0) { fl = 0.95; bl = -0.25; fa = 2.5; ba = -0.7; }
  else if (!p.ground) { fl = 0.3; bl = -0.4; fa = 2.1 + Math.sin(T * 18) * 0.2; ba = 1.8 - Math.sin(T * 18) * 0.2; }
  else if (run) { fl = sw * 0.95; bl = -sw * 0.95; fa = -sw * 0.85; ba = sw * 0.85; lean = clamp(Math.abs(p.vx) / 205, 0, 1) * 0.12; }
  const O = OUTFITS[look.outfit] || OUTFITS.coat;
  const body = O.body === "scrub" ? look.scrub : O.body, sleeve = O.sleeve === "scrub" ? look.scrub : O.sleeve === "skin" ? look.skin : O.sleeve;
  const legs = O.legs === "scrub" ? shade(look.scrub, -0.15) : O.legs;
  ctx.save();
  ctx.translate(p.x + p.w / 2, p.y + p.h);
  ctx.scale(p.face * sx, sy);
  if (p.pound === 1) { ctx.translate(0, -14); ctx.rotate(p.spin); ctx.translate(0, 14); }
  if (p.flip) { ctx.translate(0, -14); ctx.rotate(p.flip * Math.PI); ctx.translate(0, 14); }
  ctx.rotate(lean);
  ctx.translate(0, -p.h + bob);
  const hip = 21, sh = 12, hb = run ? Math.sin(ph * 2) * 0.4 : 0;
  const hairFlow = clamp(-p.vy / 600, -1, 1) * 1.5 + (run ? Math.abs(sw) : 0);
  // hair behind the head
  ctx.fillStyle = look.hair;
  if (look.hairStyle === "long") { rr(-8 - hairFlow * 0.4, 1 + hb, 6, 13, 3); ctx.fill(); }
  if (look.hairStyle === "ponytail") { ctx.beginPath(); ctx.ellipse(-9 - hairFlow, 5 + hb + Math.sin(T * 6) * 0.8, 2.6, 5, 0.5 + hairFlow * 0.2, 0, 6.283); ctx.fill(); }
  if (look.hairStyle === "bun") { ctx.beginPath(); ctx.arc(-5.5, -2 + hb, 3.6, 0, 6.283); ctx.fill(); }
  limb(-1, hip, 7, bl, 4, shade(legs, -0.2), "#151020");
  limb(-1, sh, 7, ba, 3.2, shade(sleeve, -0.12), shade(look.skin, -0.08));
  ctx.fillStyle = body; rr(-7, 9, 15, 14, 4); ctx.fill();
  ctx.fillStyle = shade(body, -0.08); ctx.fillRect(-7, 19, 15, 4);
  if (O.tie) { ctx.fillStyle = look.accent; ctx.beginPath(); ctx.moveTo(-1, 10); ctx.lineTo(2, 10); ctx.lineTo(1.6, 19); ctx.lineTo(0.5, 21); ctx.lineTo(-0.6, 19); ctx.fill(); }
  if (O.vneck) { ctx.fillStyle = look.skin; ctx.beginPath(); ctx.moveTo(-2, 9.5); ctx.lineTo(3, 9.5); ctx.lineTo(0.5, 13.5); ctx.fill(); ctx.fillStyle = shade(body, 0.15); ctx.fillRect(-6, 15, 4, 3); }
  if (O.gown) { ctx.strokeStyle = shade(body, -0.25); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-6, 13); ctx.lineTo(7, 13); ctx.moveTo(-6, 17); ctx.lineTo(7, 17); ctx.stroke(); }
  ctx.strokeStyle = "#8a93a6"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0.5, 11.5, 4.5, 0.25, 2.9); ctx.stroke();
  ctx.fillStyle = "#c9d0dc"; ctx.beginPath(); ctx.arc(4, 16.5 + Math.sin(ph) * (run ? 0.8 : 0), 1.8, 0, 6.283); ctx.fill();
  limb(2, hip, 7, fl, 4, legs, "#151020");
  // head
  ctx.fillStyle = look.skin; ctx.beginPath(); ctx.arc(1, 4 + hb, 6, 0, 6.283); ctx.fill();
  ctx.fillStyle = look.hair;
  if (look.hairStyle === "buzz") { ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(0.5, 3 + hb, 6.1, 3.4, 5.9); ctx.fill(); ctx.globalAlpha = 1; }
  else if (look.hairStyle === "curly") { for (let k = 0; k < 7; k++) { const a = 3.2 + k * 0.45; ctx.beginPath(); ctx.arc(0.5 + Math.cos(a) * 5.6, 3 + hb + Math.sin(a) * 5.6, 2.6, 0, 6.283); ctx.fill(); } }
  else {
    ctx.beginPath(); ctx.arc(0, 2 + hb, 6.2, 3.3, 6.1); ctx.fill(); ctx.fillRect(-6, hb, 3, 6);
    if (look.hairStyle === "short") { ctx.beginPath(); ctx.moveTo(-5, -1 + hb); ctx.lineTo(-9 - hairFlow, 1 + hb); ctx.lineTo(-5, 3 + hb); ctx.fill(); }
  }
  // headwear
  if (look.hat === "cap") { ctx.fillStyle = look.capCol; rr(-6, -3 + hb, 13, 5.5, 2.5); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,0.45)"; for (let k = 0; k < 4; k++) ctx.fillRect(-4 + k * 3, -1.5 + hb, 1, 1); }
  if (look.hat === "band") { ctx.strokeStyle = look.capCol; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(0.6, 3.5 + hb, 6, 3.6, 5.8); ctx.stroke(); }
  // face
  ctx.fillStyle = "#1a1220";
  if (p.hflash > 0.4) { ctx.fillRect(3.4, 2.6 + hb, 2.4, 2.4); ctx.fillRect(2.8, 7 + hb, 2, 1.6); }
  else ctx.fillRect(4, 3 + hb + (p.blink < 0 ? 1 : 0), 1.8, p.blink < 0 ? 0.6 : 2.2);
  if (look.glasses !== "none") {
    ctx.strokeStyle = "#2a2a34"; ctx.lineWidth = 0.9;
    if (look.glasses === "round") { ctx.beginPath(); ctx.arc(4.9, 4 + hb, 2.3, 0, 6.283); ctx.stroke(); }
    else { ctx.strokeRect(2.6, 2.4 + hb, 4.6, 3.4); }
    ctx.beginPath(); ctx.moveTo(2.6, 4 + hb); ctx.lineTo(-2.5, 3.5 + hb); ctx.stroke();
  }
  limb(1, sh, 7, fa, 3.2, sleeve, look.skin);
  ctx.restore();
}
function drawPlayer() {
  const p = G.player;
  for (const tr of G.trail) {
    ctx.globalAlpha = tr.life * 1.8; ctx.fillStyle = "#8fd3ff"; rr(tr.x + 1, tr.y + 4, p.w - 2, p.h - 6, 6); ctx.fill();
    ctx.globalAlpha = tr.life * 2.4; ctx.fillStyle = "#e8f6ff"; ctx.fillRect(tr.x - tr.f * 12, tr.y + 8 + (tr.life * 40 % 12), 10, 1.5);
  }
  ctx.globalAlpha = 1;
  if (G.exitT > 0) {
    const k = G.exitT, e = 1 - (1 - k) * (1 - k), q = G.portal;
    ctx.save(); ctx.translate(G.exitFrom.x + (q.x - 9 - G.exitFrom.x) * e + p.w / 2, G.exitFrom.y + (q.y - 14 - G.exitFrom.y) * e + p.h / 2);
    ctx.rotate(k * 9); ctx.scale(1 - k, 1 - k); ctx.translate(-(p.x + p.w / 2), -(p.y + p.h / 2));
    drawHero(); ctx.restore(); return;
  }
  const flick = p.inv > 0 && p.inv < 1.1 && Math.floor(p.inv * 14) % 2;
  if (flick) ctx.globalAlpha = 0.4;
  drawSprite(() => drawHero(), p.x + p.w / 2, p.y + p.h / 2, 90, p.hflash, "#ffb3bd", "rgba(10,6,18,0.85)");
  ctx.globalAlpha = 1;
}
function drawEnemyAnimated(e) {
  if (e.kind === "fact") { if (e.alive) drawFact(e); return; }
  const d = e.dead;
  if (!d) { drawEnemy(e); return; }
  const k = d.t / 0.9; if (k >= 1) return;
  ctx.save(); ctx.globalAlpha = 1 - k;
  if (d.how === "squash") { const bx = e.x + e.w / 2, by = e.y + e.h; ctx.translate(bx, by); ctx.scale(1 + Math.min(1, k * 8) * 0.5, Math.max(0.2, 1 - k * 7)); ctx.translate(-bx, -by); }
  else { const cx = e.x + e.w / 2, cy = e.y + e.h / 2; ctx.translate(cx, cy); ctx.rotate(d.rot); ctx.scale(1, -1); ctx.translate(-cx, -cy); }
  drawEnemy(e); ctx.restore();
}
function drawEnemy(e) {
  const t = G.t;
  if (e.kind === "walk" || e.kind === "hopper") {
    const hop = e.kind === "hopper", bob = hop ? 0 : Math.abs(Math.sin(e.t * 8)) * 2, cx = e.x + e.w / 2, dir = Math.sign(e.vx) || (G.player.x > e.x ? 1 : -1);
    const stretch = hop ? (e.grounded ? 1 - Math.max(0, 0.3 - e.jt) : 1.15) : 1;
    ctx.save(); ctx.translate(cx, e.y + e.h); ctx.scale(1 / stretch, stretch); ctx.translate(-cx, -(e.y + e.h));
    ctx.fillStyle = hop ? t.enemy2 : t.enemy; ctx.beginPath(); ctx.ellipse(cx, e.y + e.h - 9 - bob, 12, 10 + bob * 0.3, 0, 3.14, 6.283); ctx.fill(); ctx.fillRect(e.x, e.y + e.h - 10 - bob, e.w, 8);
    if (hop) { ctx.fillStyle = t.enemy; ctx.beginPath(); ctx.moveTo(cx - 7, e.y + 2); ctx.lineTo(cx - 3, e.y - 6); ctx.lineTo(cx, e.y + 2); ctx.moveTo(cx + 1, e.y + 2); ctx.lineTo(cx + 5, e.y - 6); ctx.lineTo(cx + 8, e.y + 2); ctx.fill(); }
    const st = hop || e.dead ? 0 : Math.sin(e.t * 12) * 2;
    ctx.fillStyle = t.enemy2; ctx.fillRect(e.x + 3 + st, e.y + e.h - 3 - Math.max(0, st) * 0.6, 6, 3); ctx.fillRect(e.x + e.w - 9 - st, e.y + e.h - 3 - Math.max(0, -st) * 0.6, 6, 3);
    const blink = !e.dead && (e.t % 3.4) < 0.11;
    ctx.fillStyle = "#fff"; ctx.beginPath();
    if (blink) { ctx.rect(cx - 7 + dir * 2, e.y + 8 - bob, 6, 1.2); ctx.rect(cx + 1 + dir * 2, e.y + 8 - bob, 6, 1.2); }
    else { ctx.arc(cx - 4 + dir * 2, e.y + 8 - bob, 3.4, 0, 6.283); ctx.arc(cx + 4 + dir * 2, e.y + 8 - bob, 3.4, 0, 6.283); }
    ctx.fill();
    if (e.dead) { ctx.strokeStyle = "#14101c"; ctx.lineWidth = 1.2; for (const ex of [cx - 4 + dir * 2, cx + 4 + dir * 2]) { ctx.beginPath(); ctx.moveTo(ex - 2, e.y + 6 - bob); ctx.lineTo(ex + 2, e.y + 10 - bob); ctx.moveTo(ex + 2, e.y + 6 - bob); ctx.lineTo(ex - 2, e.y + 10 - bob); ctx.stroke(); } ctx.restore(); return; }
    if (!blink) {
    ctx.fillStyle = "#14101c"; ctx.beginPath(); ctx.arc(cx - 3 + dir * 3, e.y + 8.5 - bob, 1.6, 0, 6.283); ctx.arc(cx + 5 + dir * 3, e.y + 8.5 - bob, 1.6, 0, 6.283); ctx.fill();
    }
    ctx.restore();
  } else if (e.kind === "turret") {
    const cx = e.x + e.w / 2, dir = G.player.x > e.x ? 1 : -1, charge = e.cd < 0.5 ? 1 - e.cd * 2 : 0;
    ctx.fillStyle = t.enemy2; rr(e.x, e.y + 8, e.w, e.h - 8, 5); ctx.fill();
    ctx.fillStyle = t.enemy; ctx.beginPath(); ctx.arc(cx, e.y + 10, 10, 3.14, 6.283); ctx.fill();
    const rc = (e.recoil || 0) * 30;
    ctx.fillStyle = "#14101c"; ctx.fillRect(cx + dir * (4 - rc), e.y + 5, dir * 10, 6);
    if (e.recoil > 0.1) { ctx.fillStyle = "rgba(255,240,200,0.8)"; ctx.beginPath(); ctx.arc(cx + dir * (16 - rc), e.y + 8, 4 * (e.recoil / 0.18), 0, 6.283); ctx.fill(); }
    ctx.fillStyle = "rgba(255,240,200," + (0.3 + charge * 0.7) + ")"; ctx.beginPath(); ctx.arc(cx, e.y + 8, 3, 0, 6.283); ctx.fill();
  } else {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2, fl = Math.sin(e.t * 14) * 5;
    ctx.fillStyle = t.enemy2; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.moveTo(cx - 4, cy); ctx.lineTo(cx - 15, cy - 6 - fl); ctx.lineTo(cx - 9, cy + 3); ctx.moveTo(cx + 4, cy); ctx.lineTo(cx + 15, cy - 6 - fl); ctx.lineTo(cx + 9, cy + 3); ctx.fill(); ctx.globalAlpha = 1;
    const rg = ctx.createRadialGradient(cx, cy, 1, cx, cy, 11); rg.addColorStop(0, "#ffffff"); rg.addColorStop(0.4, t.enemy); rg.addColorStop(1, t.enemy2); ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, 8, 0, 6.283); ctx.fill();
    ctx.fillStyle = "#14101c"; ctx.fillRect(cx - 4, cy - 2, 2, 3); ctx.fillRect(cx + 2, cy - 2, 2, 3);
  }
}
function drawDoor(d) {
  if (d.open && (d.fade === 0 || d.fade >= 1)) return;
  const a = d.open ? 1 - d.fade : 1, X = d.col * TILE, gy = GR * TILE, t = G.t;
  ctx.save(); ctx.globalAlpha = a;
  const tint = d.kind === "arena" ? "255,120,110" : d.kind === "echo" ? "200,170,255" : d.kind === "barrier" ? "255,220,150" : d.kind === "room" ? "143,211,255" : "255,236,200";
  const vg = ctx.createLinearGradient(0, 0, 0, gy); vg.addColorStop(0, "rgba(" + tint + ",0)"); vg.addColorStop(1, "rgba(" + tint + ",0.32)");
  ctx.fillStyle = vg; ctx.fillRect(X + 4, 0, TILE - 8, gy);
  for (let i = 0; i < 5; i++) { const yy = (G.time * 40 + i * 60) % gy; ctx.fillStyle = "rgba(" + tint + ",0.5)"; ctx.fillRect(X + 8 + (i % 3) * 6, gy - yy, 2, 8); }
  ctx.fillStyle = "#4a4458"; ctx.fillRect(X - 6, gy - 96, 10, 96); ctx.fillRect(X + TILE - 4, gy - 96, 10, 96);
  ctx.fillStyle = "#5d566e"; rr(X - 10, gy - 108, TILE + 20, 14, 4); ctx.fill();
  ctx.fillStyle = "#373244"; ctx.fillRect(X - 6, gy - 96, 3, 96); ctx.fillRect(X + TILE + 3, gy - 96, 3, 96);
  const glow = 0.6 + 0.4 * Math.sin(G.time * 3);
  ctx.fillStyle = "rgba(" + tint + "," + glow + ")"; ctx.font = "700 22px Cinzel, Georgia, serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const glyph = d.kind === "gate" ? "?" : d.kind === "echo" ? "↺" : d.kind === "arena" ? "✕" : d.kind === "room" ? "✦" : "◆";
  ctx.fillText(glyph, X + TILE / 2, gy - 52);
  ctx.restore();
  if (!d.open && d.kind !== "arena") label(d.kind === "gate" ? "Gate" : d.kind === "echo" ? "Echo Gate" : d.kind === "room" ? "Seal" : "Veil", X + TILE / 2, gy - 118, t.accent);
}
function drawSign(s) {
  ctx.fillStyle = "#6b4a2e"; ctx.fillRect(s.x + 11, s.y + 12, 4, 22);
  ctx.fillStyle = s.seg.steps ? "#e4cf9e" : "#c9a26a"; rr(s.x, s.y, 26, 16, 3); ctx.fill(); ctx.fillStyle = "#8a6a40"; ctx.fillRect(s.x + 4, s.y + 5, 18, 1.5); ctx.fillRect(s.x + 4, s.y + 9, 14, 1.5);
  if (s.seg.steps) { ctx.fillStyle = "#b08a50"; ctx.beginPath(); ctx.arc(s.x, s.y + 8, 4, 0, 6.283); ctx.arc(s.x + 26, s.y + 8, 4, 0, 6.283); ctx.fill(); }
  if (!s.read) { ctx.fillStyle = G.t.accent; ctx.font = "700 16px Cinzel, serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillText("!", s.x + 13, s.y - 6 + Math.sin(G.time * 4) * 3); }
}
function drawFlag(f) {
  ctx.fillStyle = "#8a8496"; ctx.fillRect(f.x, f.y - 52, 3, 52);
  const w = Math.sin(G.time * 5 + f.x) * 3;
  ctx.fillStyle = f.on ? G.t.top : "#55506a"; ctx.beginPath(); ctx.moveTo(f.x + 3, f.y - 52); ctx.lineTo(f.x + 24 + w, f.y - 45); ctx.lineTo(f.x + 3, f.y - 37); ctx.fill();
}
function drawOrb(o) {
  if (o.taken) return;
  glow(o.x, o.y, 34, G.t.accent, 0.35);
  const y = o.y + Math.sin(G.time * 2 + o.ph) * 4;
  const rg = ctx.createRadialGradient(o.x - 3, y - 3, 1, o.x, y, o.r + 6); rg.addColorStop(0, "#ffffff"); rg.addColorStop(0.35, G.t.accent); rg.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(o.x, y, o.r + 6, 0, 6.283); ctx.fill();
  ctx.strokeStyle = G.t.top; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(o.x, y, o.r, 0, 6.283); ctx.stroke();
  label(o.short, o.x, y - o.r - 6);
}
function drawPearl(pr) {
  if (pr.taken) return;
  glow(pr.x, pr.y, 40, "#cfe8ff", 0.4 + 0.15 * Math.sin(G.time * 3 + pr.x));
  const y = pr.y + Math.sin(G.time * 2.5 + pr.x) * 3;
  const rg = ctx.createRadialGradient(pr.x, y, 2, pr.x, y, 22); rg.addColorStop(0, "rgba(220,240,255,0.6)"); rg.addColorStop(1, "rgba(220,240,255,0)"); ctx.fillStyle = rg; ctx.fillRect(pr.x - 22, y - 22, 44, 44);
  const g = ctx.createLinearGradient(pr.x - 8, y - 8, pr.x + 8, y + 8); g.addColorStop(0, "#ffffff"); g.addColorStop(0.5, "#d9c8ff"); g.addColorStop(1, "#9fe8ff");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(pr.x, y, 7.5, 0, 6.283); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(pr.x - 2.5, y - 2.5, 2, 0, 6.283); ctx.fill();
  const s = (G.time * 2 + pr.x) % 3; if (s < 0.4) { ctx.fillStyle = "rgba(255,255,255," + (1 - s * 2.5) + ")"; ctx.fillRect(pr.x + 6, y - 10, 2, 7); ctx.fillRect(pr.x + 3.5, y - 7.5, 7, 2); }
}
function drawPotion(po) {
  if (po.taken) return;
  const y = po.y + Math.sin(G.time * 3 + po.x) * 2;
  ctx.fillStyle = "#cfd6e6"; ctx.fillRect(po.x - 2, y - 11, 4, 4);
  ctx.fillStyle = "#e0566a"; ctx.beginPath(); ctx.arc(po.x, y, 7, 0, 6.283); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.fillRect(po.x - 4, y - 3, 2, 4);
}
function drawSpring(sp) {
  const c = sp.t > 0 ? 0.5 : 1;
  ctx.fillStyle = "#8a8496"; for (let i = 0; i < 3; i++) ctx.fillRect(sp.x + 4, sp.y + 12 - (i + 1) * 4 * c, sp.w - 8, 2);
  ctx.fillStyle = G.t.top; rr(sp.x, sp.y + 12 - 14 * c, sp.w, 5, 2); ctx.fill();
}
function drawSpikes(sk) {
  ctx.fillStyle = "#cfc6dc"; ctx.beginPath();
  for (let x = sk.x; x < sk.x + sk.w - 1; x += 8) { ctx.moveTo(x, sk.y + sk.h); ctx.lineTo(x + 4, sk.y); ctx.lineTo(x + 8, sk.y + sk.h); }
  ctx.fill(); ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(sk.x, sk.y + sk.h - 2, sk.w, 2);
}
function drawChase(ch) {
  if (!ch || ch.done) return;
  const x = ch.wx; if (x < G.cam - 60) return;
  const g = ctx.createLinearGradient(x - 260, 0, x, 0); g.addColorStop(0, ch.color + "00"); g.addColorStop(1, ch.color + "e6");
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 260, -20);
  for (let y = -20; y <= ROWS * TILE + 20; y += 12) ctx.lineTo(x + Math.sin(y * 0.05 + G.time * 6) * 10 + Math.sin(y * 0.13 - G.time * 9) * 5, y);
  ctx.lineTo(x - 260, ROWS * TILE + 20); ctx.closePath(); ctx.fill();
  for (let i = 0; i < 6; i++) { const yy = (h2(i, 9) * ROWS * TILE + G.time * 60 * (i % 2 ? 1 : -1)) % (ROWS * TILE); ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.beginPath(); ctx.arc(x + 4 + h2(i, 4) * 14, (yy + ROWS * TILE) % (ROWS * TILE), 2 + i % 3, 0, 6.283); ctx.fill(); }
  if (ch.active) label(ch.name, Math.max(x - 60, G.cam + 70), 60, "#ffffff", 12);
}
function drawBoss(b) {
  if (b.dead) return;
  const S = G.L.boss.shape, col = G.t.boss, x = b.x, y = b.y, w = b.w, h = b.h, cx = x + w / 2, f = b.face, t = G.time;
  const wind = !b.dying && b.inv <= 0 && b.act < 0.45 ? (0.45 - b.act) / 0.45 : 0;
  const breathe = b.flying ? 0 : Math.sin(t * 3.2) * 0.025, land = b.land > 0 ? b.land * 1.2 : 0;
  ctx.save();
  ctx.translate(cx, y + h);
  if (b.dying) ctx.translate((Math.random() - 0.5) * 6, 0);
  ctx.rotate(-f * 0.12 * wind);
  ctx.scale(1 + breathe + land * 0.4 + (b.dying ? (1.6 - b.dying) * 0.08 : 0), 1 - breathe - land * 0.35);
  ctx.translate(-cx, -(y + h));
  if (wind > 0) { ctx.save(); ctx.globalAlpha = wind * 0.5; const rg = ctx.createRadialGradient(cx, y + h / 2, 4, cx, y + h / 2, w * 0.9); rg.addColorStop(0, G.t.enemy); rg.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = rg; ctx.fillRect(x - w, y - h / 2, w * 3, h * 2); ctx.restore(); }
  const eyes = (ey, sp, r) => {
    ctx.fillStyle = b.phase === 2 ? "#ffd0c8" : "#fff"; ctx.beginPath(); ctx.arc(cx - sp + f * 3, ey, r, 0, 6.283); ctx.arc(cx + sp + f * 3, ey, r, 0, 6.283); ctx.fill();
    ctx.fillStyle = "#14101c"; ctx.beginPath(); ctx.arc(cx - sp + f * 5, ey + 1, r * 0.45, 0, 6.283); ctx.arc(cx + sp + f * 5, ey + 1, r * 0.45, 0, 6.283); ctx.fill();
    ctx.strokeStyle = "#14101c"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx - sp - r, ey - r - 2); ctx.lineTo(cx - sp + r, ey - r + 2); ctx.moveTo(cx + sp + r, ey - r - 2); ctx.lineTo(cx + sp - r, ey - r + 2); ctx.stroke();
  };
  if (b.phase === 2) { const rg = ctx.createRadialGradient(cx, y + h / 2, 10, cx, y + h / 2, w); rg.addColorStop(0, "rgba(255,90,70,0.25)"); rg.addColorStop(1, "rgba(255,90,70,0)"); ctx.fillStyle = rg; ctx.fillRect(x - w / 2, y - h / 2, w * 2, h * 2); }
  if (S === "wyrm" || S === "serpent") {
    for (let i = b.trail.length - 1; i > 0; i -= 4) { const s = b.trail[i]; const r = 14 - i * 0.2; ctx.fillStyle = i % 8 === 0 && S === "serpent" ? G.t.enemy : col; ctx.beginPath(); ctx.arc(s.x - f * i * 2.2, s.y + Math.sin(t * 4 + i * 0.3) * 6, Math.max(5, r), 0, 6.283); ctx.fill(); }
    ctx.fillStyle = col; rr(x + 6, y + 10, w - 12, h - 14, 22); ctx.fill();
    if (S === "wyrm") { ctx.fillStyle = "rgba(255,255,255,0.18)"; for (let i = 0; i < 3; i++) ctx.fillRect(x + 16 + i * 14, y + 40, 8, 8); }
    else { ctx.strokeStyle = G.t.enemy; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, y + 44, 12, t * 2, t * 2 + 5); ctx.stroke(); }
    eyes(y + 26, 12, 6);
    ctx.fillStyle = "#ff5a6a"; ctx.fillRect(cx + f * 26, y + 40 + Math.sin(t * 9) * 2, f * 12, 2.5);
  } else if (S === "wraith" || S === "shade") {
    ctx.globalAlpha = 0.9; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y + h * 0.45); ctx.arc(cx, y + h * 0.45, w / 2, 3.14, 0);
    for (let i = 0; i <= 6; i++) ctx.lineTo(x + w - i * (w / 6), y + h - (i % 2 ? 12 : 0) + Math.sin(t * 6 + i) * 4);
    ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = S === "wraith" ? "#2a0a12" : "#0a1a2e"; ctx.beginPath(); ctx.ellipse(cx - 12 + f * 3, y + 28, 6, 9, 0, 0, 6.283); ctx.ellipse(cx + 12 + f * 3, y + 28, 6, 9, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = S === "wraith" ? "#ff4a5a" : "#9fd3ff"; ctx.beginPath(); ctx.arc(cx - 12 + f * 5, y + 30, 2.4, 0, 6.283); ctx.arc(cx + 12 + f * 5, y + 30, 2.4, 0, 6.283); ctx.fill();
  } else if (S === "oracle") {
    ctx.strokeStyle = G.t.top; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, y + h / 2, w * 0.7, h * 0.25, Math.sin(t) * 0.3, 0, 6.283); ctx.stroke();
    ctx.fillStyle = G.t.accent; ctx.font = "700 10px Cinzel, serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const runes = "BRCA1·RRSO·"; for (let i = 0; i < runes.length; i++) { const a = t * 0.8 + i / runes.length * 6.283; ctx.fillText(runes[i], cx + Math.cos(a) * w * 0.7, y + h / 2 + Math.sin(a) * h * 0.25); }
    const rg = ctx.createRadialGradient(cx, y + h / 2, 4, cx, y + h / 2, w / 2); rg.addColorStop(0, "#fff8ea"); rg.addColorStop(1, "#e8c9a0"); ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, y + h / 2, w / 2 - 4, 0, 6.283); ctx.fill();
    const px = clamp((G.player.x - cx) / 40, -1, 1) * 10, py = clamp((G.player.y - y) / 60, -1, 1) * 8;
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx + px, y + h / 2 + py, 15, 0, 6.283); ctx.fill(); ctx.fillStyle = "#140a04"; ctx.beginPath(); ctx.arc(cx + px, y + h / 2 + py, 7, 0, 6.283); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx + px - 4, y + h / 2 + py - 4, 2.5, 0, 6.283); ctx.fill();
  } else if (S === "golem") {
    ctx.fillStyle = col; rr(x + 8, y + 26, w - 16, h - 26, 6); ctx.fill(); rr(x + 16, y + 2, w - 32, 28, 6); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.25)"; rr(x - 2, y + 30, 14, 26, 4); ctx.fill(); rr(x + w - 12, y + 30, 14, 26, 4); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 20, y + 40); ctx.lineTo(x + 30, y + 50); ctx.lineTo(x + 26, y + 62); ctx.stroke();
    ctx.fillStyle = "#ffb070"; ctx.fillRect(cx - 12 + f * 3, y + 12, 7, 5); ctx.fillRect(cx + 5 + f * 3, y + 12, 7, 5);
  } else {
    ctx.fillStyle = col;
    if (S === "slime") { ctx.beginPath(); ctx.moveTo(x, y + h); ctx.quadraticCurveTo(x - 4, y + 4 + Math.sin(t * 3) * 4, cx, y + Math.sin(t * 3) * 4); ctx.quadraticCurveTo(x + w + 4, y + 4 + Math.sin(t * 3) * 4, x + w, y + h); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.beginPath(); ctx.ellipse(cx - 14, y + 18, 6, 9, -0.4, 0, 6.283); ctx.fill(); for (let i = 0; i < 3; i++) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x + 14 + i * 20, y + h + 3 + Math.sin(t * 4 + i) * 2, 4, 0, 6.283); ctx.fill(); } }
    else if (S === "leviathan") { ctx.beginPath(); ctx.ellipse(cx, y + h * 0.55, w / 2, h * 0.45, 0, 0, 6.283); ctx.fill(); ctx.beginPath(); ctx.moveTo(cx - 10, y + 10); ctx.lineTo(cx, y - 14 + Math.sin(t * 4) * 3); ctx.lineTo(cx + 12, y + 10); ctx.fill(); ctx.beginPath(); ctx.moveTo(x + 4, y + h * 0.6); ctx.lineTo(x - 14, y + h * 0.4 + Math.sin(t * 5) * 5); ctx.lineTo(x + 6, y + h * 0.8); ctx.fill(); ctx.beginPath(); ctx.moveTo(x + w - 4, y + h * 0.6); ctx.lineTo(x + w + 14, y + h * 0.4 + Math.sin(t * 5) * 5); ctx.lineTo(x + w - 6, y + h * 0.8); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,0.2)"; for (let i = 0; i < 4; i++) ctx.fillRect(x + 14 + i * 12, y + h * 0.7, 6, 4); }
    else { rr(x + 4, y + 8, w - 8, h - 8, 16); ctx.fill(); ctx.fillStyle = "#e8dcc0"; ctx.beginPath(); ctx.moveTo(x + 12, y + 14); ctx.lineTo(x + 4, y - 8); ctx.lineTo(x + 22, y + 10); ctx.moveTo(x + w - 12, y + 14); ctx.lineTo(x + w - 4, y - 8); ctx.lineTo(x + w - 22, y + 10); ctx.fill(); ctx.fillStyle = "#fff"; ctx.fillRect(cx - 12, y + 48, 4, 7); ctx.fillRect(cx + 8, y + 48, 4, 7); ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(cx - 14, y + 46, 28, 3); }
    eyes(y + (S === "leviathan" ? 34 : 28), 13, 7);
  }
  // spike crown (phase 2)
  if (b.phase === 2 && b.spike !== "down") {
    const up = b.spike === "up", ht = up ? 16 : 6 + Math.sin(t * 30) * 2;
    ctx.fillStyle = up ? "#f4ecd8" : "rgba(255,120,110,0.9)";
    ctx.beginPath(); for (let i = 0; i < 5; i++) { const sx = x + 8 + i * (w - 16) / 4; ctx.moveTo(sx - 6, y + 4); ctx.lineTo(sx, y + 4 - ht); ctx.lineTo(sx + 6, y + 4); } ctx.fill();
  }
  if (b.inv >= 98 && !b.dying) { ctx.fillStyle = "#ffe9a8"; for (let i = 0; i < 3; i++) { const a = t * 4 + i * 2.09; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 20, y - 10 + Math.sin(a) * 5, 3, 0, 6.283); ctx.fill(); } }
  ctx.restore();
}
function render() {
  // puzzle rooms: zoom out until the whole room fits, and centre on it
  const zt = G.roomLock ? Math.min(1, STW / ((ROOM_W + 2.5) * TILE * BASESC)) : 1;
  G.zoom += (zt - G.zoom) * (1 - Math.exp(-FRAME_DT * 5)); if (Math.abs(zt - G.zoom) < 0.002) G.zoom = zt;
  SC = BASESC * G.zoom; VW = STW / SC; VH = STH / SC; OFFY = Math.max(0, VH - ROWS * TILE);
  ctx.setTransform(DPR * SC, 0, 0, DPR * SC, 0, 0);
  const p = G.player;
  const target = G.roomLock ? G.roomLock.x0 + ROOM_W * TILE / 2 - VW / 2 : p.x + p.w / 2 - VW * 0.42 + G.look;
  G.cam += (clamp(target, 0, Math.max(0, G.W * TILE - VW)) - G.cam) * (1 - Math.exp(-FRAME_DT * 6.5));
  drawBackground();
  const shk = RM ? 0 : G.shake, sx = shk > 0 ? (Math.random() - 0.5) * 8 * shk / 0.3 : 0, sy = shk > 0 ? (Math.random() - 0.5) * 6 * shk / 0.3 : 0;
  ctx.save(); ctx.translate(-G.cam + sx, OFFY + sy);
  if (G.room) roomDrawBack(G.room);
  drawTiles();
  for (const pl of G.plats) drawPlat(pl);
  for (const sk of G.spikes) if (sk.x + sk.w > G.cam && sk.x < G.cam + VW) drawSpikes(sk);
  drawHazards(); drawForks(); drawChests();
  for (const sp of G.springs) drawSpring(sp);
  for (const f of G.flags) drawFlag(f);
  for (const s of G.signs) drawSign(s);
  for (const d of G.doors) drawDoor(d);
  if (G.room) roomDrawFront(G.room);
  for (const o of G.orbs) drawOrb(o);
  for (const pr of G.pearls) drawPearl(pr);
  for (const po of G.potions) drawPotion(po);
  for (const e of G.enemies) if (e.alive && e.x > G.cam - 60 && e.x < G.cam + VW + 60 && e.kind !== "fly") drawShadow(e.x + e.w / 2, e.y + e.h, e.w * 0.55);
  for (const e of G.enemies) if ((e.alive || (e.dead && e.dead.t < 0.9)) && e.x > G.cam - 60 && e.x < G.cam + VW + 60) drawEnemyAnimated(e);
  if (G.boss && !G.boss.dead) {
    const b = G.boss; if (b.land > 0) b.land -= FRAME_DT;
    drawShadow(b.x + b.w / 2, b.y + b.h, b.w * 0.5);
    const long = ["wyrm", "serpent"].includes(G.L.boss.shape);
    drawSprite(() => drawBoss(b), b.x + b.w / 2, b.y + b.h / 2 - 10, long ? 380 : 240, b.flash + (b.act < 0.45 && b.inv <= 0 && !b.dying && !(b.stagger > 0) ? 0.15 * (1 + Math.sin(G.time * 30)) : 0), "#ffffff", "rgba(10,6,18,0.8)");
    if (b.stagger > 0) { for (let i = 0; i < 4; i++) { const a = G.time * 5 + i * 1.57; bigText("✦", b.x + b.w / 2 + Math.cos(a) * 26, b.y - 12 + Math.sin(a) * 6, 12, "#ffe9a8"); } }
  }
  for (const w of G.waves) { ctx.fillStyle = G.t.top; ctx.beginPath(); ctx.moveTo(w.x - 12, GR * TILE); ctx.quadraticCurveTo(w.x, GR * TILE - 30, w.x + 12, GR * TILE); ctx.fill(); }
  for (const s of G.shots) {
    const c = s.friendly ? "#8fd3ff" : G.t.enemy;
    glow(s.x, s.y, 22, c, 0.5);
    const rg = ctx.createRadialGradient(s.x, s.y, 1, s.x, s.y, 9); rg.addColorStop(0, "#fff"); rg.addColorStop(0.5, c); rg.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(s.x, s.y, 9, 0, 6.283); ctx.fill();
    ctx.strokeStyle = rgba(s.friendly ? "#8fd3ff" : G.t.enemy, 0.35); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.05, s.y - s.vy * 0.05); ctx.stroke();
  }
  if (G.portal) glow(G.portal.x, G.portal.y, 70, G.t.accent, 0.5);
  if (G.portal) { const q = G.portal, grow = clamp((G.time - (q.born || 0)) * 2, 0, 1); ctx.save(); ctx.translate(q.x, q.y); ctx.scale(grow, grow); const pg = ctx.createRadialGradient(0, 0, 2, 0, 0, 40); pg.addColorStop(0, "rgba(255,255,255,0.55)"); pg.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = pg; ctx.fillRect(-40, -40, 80, 80); for (let i = 0; i < 3; i++) { ctx.strokeStyle = i === 1 ? G.t.top : G.t.accent; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, 0, 18 - i * 4, 30 - i * 6, 0, G.time * (2 + i), G.time * (2 + i) + 4.5); ctx.stroke(); } ctx.restore(); label("Portal", q.x, q.y - 40, G.t.accent); }
  if (!G.exitT) drawShadow(p.x + p.w / 2, p.y + p.h, 11);
  drawPlayer();
  drawCarried();
  drawChase(G.chase);
  for (const f of G.fx) {
    const k = clamp(f.life / f.max, 0, 1);
    if (f.ring) { ctx.globalAlpha = k; ctx.strokeStyle = f.c; ctx.lineWidth = 1 + 2 * k; ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.45, 0, 0, 6.283); ctx.stroke(); continue; }
    ctx.globalAlpha = f.grow ? k * 0.85 : clamp(k * 1.6, 0, 1);
    ctx.fillStyle = f.c; ctx.beginPath(); ctx.arc(f.x, f.y, Math.max(0.3, f.grow ? f.r * (1.6 - k * 0.6) : f.r * (0.4 + k * 0.6)), 0, 6.283); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const q of G.pops) { ctx.globalAlpha = clamp(q.life * 1.5, 0, 1); ctx.font = "700 12px 'IBM Plex Mono', monospace"; ctx.textAlign = "center"; ctx.fillStyle = q.xp ? "#b8e6ff" : "#ffe9a8"; ctx.fillText(q.text, q.x, q.y); }
  ctx.globalAlpha = 1;
  ctx.restore();
  foreground();
  vignette();
  // iris wipe in (level start) and out (portal)
  const irisOpen = G.exitT > 0 ? 1 - G.exitT * G.exitT : 1 - Math.pow(1 - G.iris, 3);
  if (irisOpen < 1) {
    const fx = G.exitT > 0 && G.portal ? G.portal.x : p.x + p.w / 2, fy = G.exitT > 0 && G.portal ? G.portal.y : p.y + p.h / 2;
    const r = Math.hypot(VW, VH) * irisOpen;
    ctx.fillStyle = "#0b0910"; const icx = fx - G.cam, icy = fy + OFFY, ir = Math.max(0.5, r);
    const M = Math.hypot(VW, VH) * 2;
    ctx.strokeStyle = "#0b0910"; ctx.lineWidth = M * 2; ctx.beginPath(); ctx.arc(icx, icy, ir + M, 0, 6.283); ctx.stroke();
    ctx.strokeStyle = "rgba(224,178,92,0.6)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(icx, icy, ir, 0, 6.283); ctx.stroke();
  }
}

/* ================= loop ================= */
let lastFrame = performance.now(), FRAME_DT = 1 / 60;
function frame(now) {
  requestAnimationFrame(frame);
  if (!G || $("gameScreen").hidden) return;
  const dt = clamp((now - lastFrame) / 1000, 0, 1 / 30); lastFrame = now; FRAME_DT = dt || 1 / 60;
  if (G.hitstop > 0 && !modalOpen) { G.hitstop -= dt; G.shake = Math.max(0, G.shake - dt * 0.5); }
  else if (!modalOpen && !G.done) {
    let rem = dt;
    while (rem > 1e-6 && G && !modalOpen && !G.done && !(G.hitstop > 0)) { const h = Math.min(rem, 1 / 120); update(h); rem -= h; }
  }
  else { pressed.jump = pressed.dash = pressed.down = false; }
  if (!G) return;
  G.iris = Math.min(1, G.iris + dt * 1.5);
  if (G.exitT > 0 && !G.finished) {
    G.exitT = Math.min(1, G.exitT + dt * (RM ? 4 : 1.3)); G.time += dt;
    for (const f of G.fx) { if (f.ring) f.r += f.speed * dt; else { f.x += f.vx * dt; f.y += f.vy * dt; } f.life -= dt; } G.fx = G.fx.filter(f => f.life > 0);
    if (G.exitT >= 1) finishLevel();
  }
  if (G.scoreShown !== G.score) { G.scoreShown += (G.score - G.scoreShown) * Math.min(1, dt * 8); if (Math.abs(G.score - G.scoreShown) < 1) G.scoreShown = G.score; renderScore(); }
  render();
}
requestAnimationFrame(frame);
setTimeout(() => { renderMap(); renderStoreNote(); initCaps(); }, 0);  // after every script has loaded
