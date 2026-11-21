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
}
function save() {
  P.updated = Date.now();
  const body = { stars: P.stars, clears: P.clears, best: P.best, pearls: P.pearls, srs: P.srs, updated: P.updated };
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
  if (!C || !C.use) { renderStoreNote(); renderMap(); return; }
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
  renderStoreNote(); renderMap();
}
function renderStoreNote() {
  $("storeNote").textContent = storeMode === "cloud" ? "Your stars, pearls and review schedule are saved privately to your account, so they follow you to your phone."
    : storeMode === "local" ? "Your progress is saved in this browser only." : "Progress won't be kept after you close this page.";
}

/* spaced review */
function srsMiss(id) { const s = P.srs[id] || { box: 0, misses: 0 }; s.box = 0; s.misses = (s.misses || 0) + 1; s.due = Date.now() + DAY; s.at = Date.now(); P.srs[id] = s; save(); }
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
      el("p", { class: "muted" }, "Guardian: " + L.boss.name + ". Chase: " + L.chase.name + ". ",
        el("span", { class: "kbd", text: "← →" }), " move, ", el("span", { class: "kbd", text: "Space" }), " jump (twice for a double jump, against a wall to wall-jump), ",
        el("span", { class: "kbd", text: "Shift" }), " or ", el("span", { class: "kbd", text: "X" }), " dash, ", el("span", { class: "kbd", text: "↓" }), " ground pound, ",
        el("span", { class: "kbd", text: "H" }), " spend Insight at a leap, ", el("span", { class: "kbd", text: "E" }), " reread a sign. On a phone, use the buttons under the game and turn it sideways."),
      el("div", { class: "actions" },
        el("button", { type: "button", class: "btn primary", text: "Enter the realm", onclick: () => { closeModal(); startLevel(L); } }),
        el("button", { type: "button", class: "btn", text: "Read the scrolls", onclick: () => openCodex(L, () => openBriefing(L)) }),
        el("button", { type: "button", class: "btn quiet", text: "Back", onclick: closeModal })));
  });
}
function openCodex(L, back) {
  showModal(p => {
    const list = el("div", { class: "codex" });
    for (const s of L.segs) if (s.t === "sign") list.append(el("article", {}, el("h3", { text: s.title }), s.steps ? el("ol", { class: "steps" }, ...s.steps.map(x => el("li", { text: x[1] }))) : null, el("p", { class: s.steps ? "muted" : null, text: s.text }), noteEl(s.note)));
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
      function finish(sel) {
        const ok = sel.size === ans.size && [...sel].every(x => ans.has(x));
        btns.forEach((b, n) => {
          const oi = order[n]; b.disabled = true;
          if (ans.has(oi) && sel.has(oi)) b.classList.add("right");
          else if (ans.has(oi)) b.classList.add(multi ? "missed" : "right");
          else if (sel.has(oi)) b.classList.add("wrong");
        });
        tail.remove();
        const why = el("div", { class: "why " + (ok ? "good" : "bad") },
          el("span", { class: "verdict " + (ok ? "good" : "bad"), text: ok ? "Correct. The way opens." : "Not quite. You lose a heart." }),
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
    if (ok) { srsHit(it.id); right++; } else srsMiss(it.id);
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
  const B = { plats: [], ev: [], spawns: [], springs: [], spikes: [], pearls: [], potions: [], tips: [] };
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
      case "pocket": { flat(2); const s = X(); for (let k = 0; k < 3; k++) { const c = col(GR); c[GR] = 4; c[GR + 1] = 0; } flat(2); B.pearls.push({ x: (s + 1) * TILE + 16, y: (GR + 1) * TILE + 16 }); tip(s, "pocket", "Cracked floor: jump, then press down to ground-pound through it. Something glints below."); break; }
      case "high": { flat(8); block(x + 1, GR - 3, 3); block(x + 5, GR - 6, 2); B.pearls.push({ x: (x + 6) * TILE, y: (GR - 7) * TILE + 6 }); tip(x, "high", "A pearl sits high above. Double jump from the ledge."); break; }
      case "gap": { flat(1); const s = X(); pit(7); oneway(s + 3, GR - 1, 1, "crumble"); B.pearls.push({ x: (s + 3) * TILE + 16, y: (GR - 4) * TILE }); flat(2); tip(s, "gap", "Wide gap: double jump and dash (Shift or X) to cross. The pearl hangs over the middle."); break; }
    }
  }
  function filler(len) {
    fillerN++;
    const start = X();
    const pearlKinds = { 2: "pocket", 4: "high", 7: "gap" };
    if (pearlKinds[fillerN] && mode !== "chase") feature(pearlKinds[fillerN]);
    const pool = mode === "calm" ? ["flat", "flat", "step", "floats"]
      : mode === "chase" ? ["pit", "crumble", "spikes", "floats", "spring", "flat", "step", "pit", "spikes"]
      : ["flat", "pit", "step", "floats", "mover", "crumble", "spikes", "spring", "chimney", "flat", "step"];
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
    mode = "chase"; filler(44); mode = "normal";
    flat(2); const x1 = X();
    B.ev.push({ type: "chase", x0, x1 });
    B.ev.push({ type: "check", x: X() }); flat(3);
  }

  flat(3); B.ev.push({ type: "check", x: 1, start: true }); flat(4);
  L.segs.forEach((s, i) => {
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
  return { W, tiles, ...B, arena: { x0: ax, x1: endX } };
}

/* ================= game state ================= */
let G = null;
function startLevel(L) {
  const B = buildLevel(L);
  const R = rng(hashStr(L.id + "pearls"));
  const pearlFacts = shuffle(L.boss.recall.filter(id => QB[id]), R);
  G = {
    L, t: L.theme, W: B.W, tiles: B.tiles, dyn: new Uint8Array(B.W), arena: B.arena,
    player: { x: 1.2 * TILE, y: 0, w: 18, h: 28, vx: 0, vy: 0, face: 1, ground: false, coyote: 0, buf: 0, inv: 0, anim: 0, jumps: 1, wall: 0, lock: 0, dash: 0, dashReady: true, dashCd: 0, pound: 0, hang: 0, onPlat: null, squash: 0 },
    hearts: MAXH, insight: 1, score: 0, streak: 0, bestStreak: 0, pearlsGot: 0,
    enemies: [], doors: [], signs: [], orbs: [], flags: [], zones: {}, shots: [], waves: [], fx: [], pops: [], trail: [],
    plats: B.plats.map(p => ({ ...p, x0: p.x, y0: p.y, t: 0, dx: 0 })), springs: B.springs, spikes: B.spikes, tips: B.tips,
    pearls: B.pearls.map((p, i) => ({ ...p, taken: false, fact: pearlFacts[i % pearlFacts.length] })), potions: B.potions,
    boss: null, portal: null, chase: null, check: null, cam: 0, time: 0, shake: 0,
    slips: 0, missed: [], recall: [], recallPool: shuffle(L.boss.recall.filter(id => QB[id])), recallIdx: 0,
    startX: 0, bossStarted: false, done: false
  };
  G.player.y = GR * TILE - G.player.h;
  for (const e of B.ev) {
    if (e.type === "check") G.flags.push({ x: e.x * TILE + 8, y: GR * TILE, on: !!e.start });
    else if (e.type === "sign") G.signs.push({ x: e.x * TILE + 4, y: GR * TILE - 34, w: 26, h: 34, seg: e.seg, read: false });
    else if (e.type === "door") {
      const d = { col: e.x, kind: e.kind, seg: e.seg, gid: e.gid, open: e.kind === "arena", fade: 0 };
      G.doors.push(d); if (!d.open) G.dyn[e.x] = 1;
      if (e.gid) G.zones[e.gid].door = d;
    }
    else if (e.type === "zone") G.zones[e.gid] = { gid: e.gid, seg: e.seg, kind: e.kind, x0: e.x0 * TILE, x1: e.x1 * TILE, intro: false, got: 0, total: e.kind === "pick" ? e.seg.good.length : 1, done: false, wrong: false };
    else if (e.type === "orb") G.orbs.push({ x: e.x * TILE + 16, y: e.row * TILE - 30, r: 11, gid: e.gid, ...e.item, taken: false, ph: Math.random() * 6 });
    else if (e.type === "chase") G.chase = { x0: e.x0 * TILE, x1: e.x1 * TILE, wx: (e.x0 - 8) * TILE, active: false, done: false, ...L.chase };
    else if (e.type === "boss") G.bossX = e.x * TILE;
  }
  G.check = G.flags[0];
  for (const s of B.spawns) {
    const base = { alive: true, t: Math.random() * 6 };
    if (s.kind === "walk") G.enemies.push({ ...base, kind: "walk", x: s.x * TILE + 4, y: s.row * TILE - 22, w: 24, h: 22, vx: -48, vy: 0 });
    else if (s.kind === "hopper") G.enemies.push({ ...base, kind: "hopper", x: s.x * TILE + 4, y: s.row * TILE - 20, w: 22, h: 20, vx: 0, vy: 0, jt: 1 + Math.random(), grounded: false });
    else if (s.kind === "turret") G.enemies.push({ ...base, kind: "turret", x: s.x * TILE + 4, y: s.row * TILE - 22, w: 24, h: 22, cd: 1.5 + Math.random() });
    else G.enemies.push({ ...base, kind: "fly", x: s.x * TILE, y: (s.row - 3.2) * TILE, w: 22, h: 18, bx: s.x * TILE, by: (s.row - 3.2) * TILE });
  }
  G.startX = G.player.x; G.arenaX = G.arena.x0 * TILE;
  $("mapScreen").hidden = true; $("gameScreen").hidden = false;
  $("lvlChip").textContent = L.name; $("toasts").textContent = "";
  $("bossbar").hidden = true; $("meterChip").hidden = !L.meter; $("leapCard").hidden = true; leapShown = null;
  renderHearts(); renderSlips(); renderInsight(); renderScore(); resize();
  lastFrame = performance.now();
  toast(L.station + ". Read the signs: the gates and leaps ask about them.");
}
function quitToMap() { G = null; closeModal(); $("gameScreen").hidden = true; $("mapScreen").hidden = false; renderMap(); }

/* ================= HUD ================= */
const HEART_FULL = '<svg viewBox="0 0 24 24"><path fill="#ff7a8a" stroke="#2a0a10" stroke-width="1.2" d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.5h2c.7-1.3 2.2-2.5 4.3-2.5 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>';
const HEART_EMPTY = '<svg viewBox="0 0 24 24"><path fill="none" stroke="#7a6a8a" stroke-width="1.6" d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.5h2c.7-1.3 2.2-2.5 4.3-2.5 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>';
function renderHearts() { $("hearts").innerHTML = Array.from({ length: MAXH }, (_, i) => i < G.hearts ? HEART_FULL : HEART_EMPTY).join(""); $("hearts").setAttribute("aria-label", G.hearts + " of " + MAXH + " hearts"); }
function renderSlips() { $("slipChip").textContent = "Slips " + G.slips; }
function renderInsight() { const c = $("insightChip"); c.textContent = ""; c.append("Insight ", el("span", { class: "pips" }, "◆".repeat(G.insight), el("i", { text: "◇".repeat(MAXI - G.insight) }))); c.setAttribute("aria-label", "Insight " + G.insight + " of " + MAXI); if (leapShown) renderLeapCard(leapShown); }
function renderScore() { $("scoreChip").textContent = G.score.toLocaleString() + (G.streak >= 2 ? "  ×" + G.streak : ""); }
function addScore(n, x, y) { G.score += n; renderScore(); if (x != null) G.pops.push({ x, y, text: "+" + n, life: 1 }); }
function gainInsight(n) { const before = G.insight; G.insight = Math.min(MAXI, G.insight + n); if (G.insight > before) renderInsight(); }
function rightAnswer(x, y) { G.streak++; G.bestStreak = Math.max(G.bestStreak, G.streak); gainInsight(1); addScore(100 + 25 * (G.streak - 1), x, y); }
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
    el("p", { class: "muted", text: "Score " + G.score.toLocaleString() + ". Slips " + G.slips + ". Pearls " + G.pearlsGot + " of 3. Hearts " + G.hearts + " of " + MAXH + "." }),
    el("div", { class: "actions" },
      el("button", { type: "button", class: "btn primary", text: "Resume", onclick: closeModal }),
      el("button", { type: "button", class: "btn", text: "Read the scrolls", onclick: () => openCodex(G.L, () => { closeModal(); openPause(); }) }),
      el("button", { type: "button", class: "btn", text: "Back to the last banner", onclick: () => { closeModal(); respawn(); } }),
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
  G.shake = 0.25;
  burst(G.player.x + 9, G.player.y + 10, "#ff7a8a", 14);
  if (msg) toast(msg, "bad", 5200);
  if (G.hearts <= 0) faint();
}
function openDoor(d) {
  d.open = true; d.fade = 0.0001; G.dyn[d.col] = 0;
  burst(d.col * TILE + 16, GR * TILE - 48, G.t.accent, 22);
}
async function triggerDoor(d) {
  if (d.busy || d.open) return;
  if (d.kind === "barrier") {
    const z = G.zones[d.gid];
    if (!d.nag || G.time - d.nag > 4) { d.nag = G.time; toast(z.kind === "leap" ? "The veil holds. Land on the right answer first." : "The veil holds. Gather every right orb first."); }
    return;
  }
  d.busy = true;
  if (d.kind === "gate") {
    const it = QB[d.seg.id];
    const ok = await askGate(it, "Gate · " + G.L.station);
    if (!G) return;
    if (ok) { srsHit(it.id); rightAnswer(d.col * TILE, GR * TILE - 110); } else { srsMiss(it.id); G.missed.push(it.id); }
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
        if (ok) addScore(60); else { knowledgeHit(); if (G.hearts <= 0) break; }
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
    z.got++; burst(o.x, o.y, G.t.accent, 14); addScore(50, o.x, o.y - 20);
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
  pr.taken = true; G.pearlsGot++; gainInsight(1); addScore(300, pr.x, pr.y - 20);
  burst(pr.x, pr.y, "#ffffff", 26); burst(pr.x, pr.y, "#8fd3ff", 16);
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
  toast(B.name + " blocks the way. Stomp it to make it answer.");
}
function updateBossBar() { $("bossHp").style.width = Math.max(0, G.boss.hp / G.boss.max * 100) + "%"; $("bossName").textContent = G.L.boss.name + (G.boss.phase === 2 ? " · enraged" : ""); }
async function bossRecall(heavy) {
  const b = G.boss;
  if (G.recallIdx >= G.recallPool.length) { G.recallPool = shuffle(G.recallPool); G.recallIdx = 0; }
  const it = QB[G.recallPool[G.recallIdx++]];
  const s = await askRecall(it, G.L.boss.name + " asks · " + it.src + (heavy ? " · crown broken" : ""));
  if (!G) return;
  G.recall.push(s);
  if (s === 2) { srsHit(it.id); G.streak++; G.bestStreak = Math.max(G.bestStreak, G.streak); gainInsight(1); } else { srsMiss(it.id); G.missed.push(it.id); }
  addScore(s * 200, b.x + b.w / 2, b.y - 10);
  b.hp -= s; b.inv = 1.4; updateBossBar();
  if (s > 0) burst(b.x + b.w / 2, b.y + 10, G.t.accent, 24);
  if (s === 0) knowledgeHit();
  if (!G) return;
  if (b.hp <= 0) {
    b.dead = true; G.shake = 0.6; burst(b.x + b.w / 2, b.y + b.h / 2, G.t.accent, 60); burst(b.x + b.w / 2, b.y + b.h / 2, "#ffffff", 30);
    G.shots = []; G.waves = []; $("bossbar").hidden = true; addScore(500);
    G.portal = { x: G.arena.x1 * TILE - 3 * TILE, y: GR * TILE - 56 };
    const d = G.doors.find(x => x.kind === "arena"); d.open = true; G.dyn[d.col] = 0;
    toast(G.L.boss.name + " falls. A portal opens.", "good");
  } else if (b.phase === 1 && b.hp <= b.max / 2) {
    b.phase = 2; b.spike = "down"; b.spikeT = 1.5; updateBossBar(); G.shake = 0.4;
    toast(G.L.boss.name + " enrages and grows a spike crown. When the spikes are up, only a ground pound breaks through.", "bad", 6500);
  }
}
function rankOf(stars, pearls) { return stars === 3 && pearls === 3 ? "S" : stars === 3 ? "A" : stars === 2 ? "B" : "C"; }
function finishLevel() {
  G.done = true;
  const L = G.L, avg = G.recall.length ? G.recall.reduce((a, b) => a + b, 0) / G.recall.length : 0;
  const stars = 1 + (G.slips <= 2 ? 1 : 0) + (avg >= 1.5 ? 1 : 0);
  const heartBonus = G.hearts * 100; G.score += heartBonus;
  const newBest = G.score > (P.best[L.id] || 0);
  P.stars[L.id] = Math.max(P.stars[L.id] || 0, stars); P.clears[L.id] = (P.clears[L.id] || 0) + 1;
  P.best[L.id] = Math.max(P.best[L.id] || 0, G.score); P.pearls[L.id] = Math.max(P.pearls[L.id] || 0, G.pearlsGot); save();
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
        el("span", { text: "Guardian recall average" }), el("span", { text: avg.toFixed(1) + " / 2 over " + G.recall.length })));
    if (missed.length) p.append(el("h3", { text: "Sent to the Review Shrine" }), el("ul", { class: "missed-list" }, ...missed.map(id => { const it = QB[id]; return el("li", {}, el("div", { text: it.q }), el("div", { class: "a", text: answerText(it) })); })));
    else p.append(el("p", { class: "lore", text: "A clean run. Nothing goes to the shrine from this realm." }));
    p.append(el("div", { class: "actions" },
      el("button", { type: "button", class: "btn primary", text: "Back to the map", onclick: quitToMap }),
      el("button", { type: "button", class: "btn", text: "Play again", onclick: () => { closeModal(); startLevel(L); } })));
  });
}

/* ================= physics ================= */
function solid(tx, ty) {
  if (tx < 0 || tx >= G.W) return true;
  if (G.dyn[tx] && ty < GR) return true;
  if (ty < 0 || ty >= ROWS) return false;
  return G.tiles[ty * G.W + tx] > 0;
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
  G.hearts--; renderHearts(); p.inv = 1.3; p.pound = 0; G.shake = 0.2;
  p.vx = (p.x + p.w / 2 < fromX ? -1 : 1) * 260; p.vy = up ? -480 : -320;
  burst(p.x + 9, p.y + 10, "#ff7a8a", 10);
  if (G.hearts <= 0) faint();
}
function respawn() {
  const p = G.player, c = G.check;
  Object.assign(p, { x: c.x - 4, y: GR * TILE - p.h - 1, vx: 0, vy: 0, inv: 1, dash: 0, pound: 0, onPlat: null, jumps: 1, dashReady: true });
  if (G.boss && !G.boss.dead) { const d = G.doors.find(x => x.kind === "arena"); d.open = true; G.dyn[d.col] = 0; G.bossStarted = false; G.shots = []; G.waves = []; $("bossbar").hidden = true; }
  const ch = G.chase;
  if (ch && !ch.done && c.x < ch.x1) { ch.active = false; ch.wx = ch.x0 - 8 * TILE; }
}
function faint() {
  G.hearts = 0; renderHearts();
  showModal(p => {
    const cont = el("button", { type: "button", class: "btn primary", text: "Rise again", onclick: () => { closeModal(); G.hearts = MAXH; renderHearts(); respawn(); } });
    p.append(el("span", { class: "kicker", text: G.L.station }), el("h2", { text: "You fainted" }),
      el("p", { class: "lore", text: "You wake at the last banner with full hearts. Opened gates stay open, and your missed questions are waiting at the Echo Gate." }), el("div", { class: "actions" }, cont,
        el("button", { type: "button", class: "btn quiet", text: "Leave the realm", onclick: quitToMap })));
    modalKeys = e => { if (e.key === "Enter") { cont.click(); return true; } return false; };
  });
}
function burst(x, y, color, n) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = 60 + Math.random() * 220; G.fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: 0.5 + Math.random() * 0.5, c: color }); } }
function ring(x, y, color) { G.fx.push({ ring: true, x, y, r: 6, life: 0.4, c: color }); }
function breakCracked(tx, ty) {
  if (tx < 0 || tx >= G.W || G.tiles[ty * G.W + tx] !== 4) return;
  G.tiles[ty * G.W + tx] = 0;
  burst(tx * TILE + 16, ty * TILE + 10, G.t.top, 10);
  breakCracked(tx - 1, ty); breakCracked(tx + 1, ty);
}

function updatePlayer(dt) {
  const p = G.player;
  // ride moving platforms
  if (p.onPlat && p.onPlat.alive && p.onPlat.dx) moveX(p, p.onPlat.dx);
  p.inv -= dt; p.lock -= dt; p.dashCd -= dt; p.buf -= dt; p.coyote -= dt;
  const dir = p.lock > 0 ? 0 : (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  if (pressed.jump) { p.buf = 0.13; pressed.jump = false; }
  // dash
  if (pressed.dash) {
    pressed.dash = false;
    if (p.dashReady && p.dashCd <= 0 && !p.pound) { p.dash = 0.15; p.dashCd = 0.32; if (!p.ground) p.dashReady = false; if (dir) p.face = dir; ring(p.x + 9, p.y + 14, "#8fd3ff"); }
  }
  // ground pound
  if (pressed.down) {
    pressed.down = false;
    if (!p.ground && !p.pound && p.dash <= 0) { p.pound = 1; p.hang = 0.1; p.vx = 0; p.vy = 0; }
  }
  if (p.dash > 0) {
    p.dash -= dt; p.vx = p.face * 520; p.vy = 0;
    G.trail.push({ x: p.x, y: p.y, f: p.face, life: 0.25 });
  } else if (p.pound === 1) {
    p.hang -= dt; p.vx = 0; p.vy = 0; if (p.hang <= 0) { p.pound = 2; p.vy = 1050; }
  } else if (p.pound === 2) {
    p.vx = 0; p.vy = 1050;
  } else {
    if (dir) { p.vx += dir * 2000 * dt; p.vx = clamp(p.vx, -205, 205); p.face = dir; }
    else if (p.lock <= 0) { const f = (p.ground ? 2200 : 900) * dt; p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f; }
    p.vy += 1900 * dt; if (!keys.jump && p.vy < -240) p.vy += 2400 * dt; p.vy = Math.min(p.vy, 900);
  }
  // wall slide
  p.wall = 0;
  if (!p.ground && p.dash <= 0 && !p.pound && dir && p.vy > -50) {
    const probe = dir > 0 ? p.x + p.w + 0.5 : p.x - 1.5;
    if (rectSolid(probe, p.y + 4, 1, p.h - 10)) { p.wall = dir; if (p.vy > 110) p.vy = 110; p.jumps = 1; p.dashReady = true; if (Math.random() < 0.2) G.fx.push({ x: dir > 0 ? p.x + p.w : p.x, y: p.y + p.h - 4, vx: -dir * 20, vy: -20, life: 0.3, c: "#d8d0e8" }); }
  }
  // jumps
  if (p.buf > 0 && !p.pound) {
    if (p.coyote > 0) { p.vy = -655; p.buf = 0; p.coyote = 0; p.squash = 0.12; }
    else if (p.wall) { p.vy = -620; p.vx = -p.wall * 255; p.face = -p.wall; p.lock = 0.14; p.buf = 0; ring(p.x + 9, p.y + 14, "#d8d0e8"); }
    else if (p.jumps > 0) { p.vy = -575; p.jumps--; p.buf = 0; p.dash = 0; ring(p.x + 9, p.y + p.h, G.t.accent); }
  }
  const wasPound = p.pound === 2, prevBottom = p.y + p.h;
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
    p.coyote = 0.1; p.jumps = 1; p.dashReady = true;
    if (!wasGround) p.squash = 0.12;
    if (wasPound) poundLand();
  }
  p.x = clamp(p.x, 0, G.W * TILE - p.w);
  p.anim += Math.abs(p.vx) * dt; p.squash -= dt;
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
  for (const e of G.enemies) if (e.alive && Math.abs(e.x + e.w / 2 - (p.x + 9)) < 70 && Math.abs(e.y + e.h - (p.y + p.h)) < 40) { e.alive = false; burst(e.x + e.w / 2, e.y + e.h / 2, G.t.enemy, 14); addScore(50, e.x, e.y - 10); }
}

function update(dt) {
  G.time += dt; G.shake = Math.max(0, G.shake - dt);
  // platforms first, so riders move with them
  for (const pl of G.plats) {
    if (pl.kind === "move") { const nx = pl.ax + (pl.bx - pl.ax) * (0.5 - 0.5 * Math.cos(G.time * pl.sp + pl.ph)); pl.dx = nx - pl.x; pl.x = nx; }
    else if (pl.kind === "crumble" && pl.t) {
      pl.t += dt;
      if (pl.alive && pl.t > 0.45) { pl.alive = false; pl.fall = 0.01; }
      if (pl.t > 3.2) { pl.alive = true; pl.t = 0; pl.fall = 0; pl.y = pl.y0; }
    }
    if (!pl.alive && pl.fall) { pl.fall += dt; pl.y = pl.y0 + pl.fall * pl.fall * 400; }
  }
  updatePlayer(dt);
  const p = G.player;
  if (p.y > ROWS * TILE + 40) {
    G.hearts--; renderHearts(); G.streak = 0; renderScore(); toast("You fell. Back to the last banner.", "bad");
    if (G.hearts <= 0) { faint(); return; } respawn();
  }
  // tips
  for (const tp of G.tips) if (!TIPS_SEEN.has(tp.key) && p.x > tp.x - 5 * TILE) { TIPS_SEEN.add(tp.key); toast(tp.text, null, 6500); }
  // checkpoints
  for (const f of G.flags) if (p.x > f.x - 8 && f.x > G.check.x) { if (!f.on) { f.on = true; toast("Banner raised. You'll return here if you fall.", "good"); } G.check = f; }
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
  for (const po of G.potions) if (!po.taken && Math.hypot(p.x + p.w / 2 - po.x, p.y + p.h / 2 - po.y) < 20) { po.taken = true; if (G.hearts < MAXH) { G.hearts++; renderHearts(); toast("A remedy restores a heart.", "good"); } else addScore(100, po.x, po.y); burst(po.x, po.y, "#ff7a8a", 12); }
  // springs and spikes
  for (const sp of G.springs) { sp.t -= dt; if (p.vy > 0 && overlap(p, sp) && p.y + p.h - sp.y < 14) { p.vy = -1000; p.pound = 0; p.jumps = 1; p.dashReady = true; sp.t = 0.25; p.y = sp.y - p.h; ring(sp.x + 12, sp.y, G.t.accent); } }
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
    if (!e.alive) continue; e.t += dt;
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
      if (e.cd <= 0 && Math.abs(p.x - e.x) < 9 * TILE) { e.cd = 2.3; const dirx = Math.sign(p.x - e.x) || -1; G.shots.push({ x: e.x + e.w / 2 + dirx * 12, y: e.y + 8, vx: dirx * 180, vy: 0, life: 3.5 }); }
    } else { e.x = e.bx + Math.sin(e.t * 0.9) * 70; e.y = e.by + Math.sin(e.t * 2.2) * 18; }
    if (e.y > ROWS * TILE) e.alive = false;
    if (overlap(p, e)) {
      if (p.dash > 0) continue;
      if ((p.vy > 60 || p.pound) && p.y + p.h - e.y < 18) { e.alive = false; if (!p.pound) p.vy = keys.jump ? -560 : -430; p.jumps = 1; p.dashReady = true; burst(e.x + e.w / 2, e.y + e.h / 2, G.t.enemy, 14); addScore(50, e.x, e.y - 10); }
      else hurt(e.x + e.w / 2);
    }
  }
  // boss
  if (!G.bossStarted && p.x > G.arenaX + 2.5 * TILE && !(G.boss && G.boss.dead)) startBoss();
  const b = G.boss;
  if (b && !b.dead && G.bossStarted) {
    b.t += dt; b.inv -= dt;
    const cx = p.x + p.w / 2, bx = b.x + b.w / 2, fast = b.phase === 2 ? 1.45 : 1;
    b.face = cx < bx ? -1 : 1;
    if (b.phase === 2 && b.inv < 98) {
      b.spikeT -= dt;
      if (b.spikeT <= 0) { if (b.spike === "down") { b.spike = "warn"; b.spikeT = 0.7; } else if (b.spike === "warn") { b.spike = "up"; b.spikeT = 2.4; } else { b.spike = "down"; b.spikeT = 2.2; } }
    }
    const ax0 = (G.arena.x0 + 1) * TILE, ax1 = (G.arena.x1 - 1) * TILE - b.w;
    if (b.flying) {
      b.x += clamp(cx - bx, -1, 1) * 60 * fast * dt; b.x = clamp(b.x, ax0, ax1);
      b.y = GR * TILE - b.h - 34 + Math.sin(b.t * 1.6 * fast) * 24;
    } else {
      b.vx = b.face * (b.inv > 0 ? 20 : 68 * fast);
      const fallV = b.vy;
      b.vy = Math.min(b.vy + 1900 * dt, 900);
      moveX(b, b.vx * dt); b.x = clamp(b.x, ax0, ax1);
      if (moveY(b, b.vy * dt)) { if (fallV > 300 && b.phase === 2) { G.waves.push({ x: bx - 30, dir: -1, life: 2.2 }, { x: bx + 30, dir: 1, life: 2.2 }); G.shake = 0.3; } b.vy = 0; }
    }
    b.trail.unshift({ x: bx, y: b.y + b.h * 0.6 }); if (b.trail.length > 40) b.trail.pop();
    b.act -= dt;
    if (b.act <= 0 && b.inv <= 0) {
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
          p.vy = -560; p.pound = 0; p.jumps = 1; p.dashReady = true; b.inv = 99; bossRecall(pounding && b.phase === 2); return;
        }
      } else if (b.inv < 98) hurt(bx);
    }
  }
  for (const w of G.waves) { w.x += w.dir * 270 * dt; w.life -= dt; if (Math.abs(w.x - (p.x + p.w / 2)) < 14 && p.y + p.h > GR * TILE - 18) hurt(w.x, true); }
  G.waves = G.waves.filter(w => w.life > 0);
  for (const s of G.shots) {
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    if (Math.hypot(s.x - (p.x + p.w / 2), s.y - (p.y + p.h / 2)) < 14) { s.life = 0; hurt(s.x); }
    if (solid(Math.floor(s.x / TILE), Math.floor(s.y / TILE))) s.life = 0;
  }
  G.shots = G.shots.filter(s => s.life > 0);
  if (G.portal && !G.done && Math.hypot(p.x + p.w / 2 - G.portal.x, p.y + p.h / 2 - G.portal.y) < 30) { finishLevel(); return; }
  for (const f of G.fx) { if (f.ring) { f.r += 160 * dt; } else { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 600 * dt; } f.life -= dt; }
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
const cv = $("cv"), ctx = cv.getContext("2d");
let VW = 480, VH = 384, SC = 1, OFFY = 0, DPR = 1;
function resize() {
  const r = $("stage").getBoundingClientRect();
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.max(1, Math.round(r.width * DPR)); cv.height = Math.max(1, Math.round(r.height * DPR));
  SC = Math.min(r.height / (ROWS * TILE), r.width / (11 * TILE));
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
  ctx.save(); ctx.translate(0, OFFY);
  drawSkyline(ctx, t, G.cam, W, GR * TILE - 60, 0.2, t.far, 1.4);
  drawSkyline(ctx, t, G.cam, W, GR * TILE - 10, 0.45, t.near, 1);
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
  const t = G.t, x0 = Math.max(0, Math.floor(G.cam / TILE)), x1 = Math.min(G.W - 1, Math.ceil((G.cam + VW) / TILE));
  for (let tx = x0; tx <= x1; tx++) for (let ty = 0; ty < ROWS; ty++) {
    const v = G.tiles[ty * G.W + tx]; if (!v) continue;
    const X = tx * TILE, Y = ty * TILE;
    const topOpen = ty === 0 || !G.tiles[(ty - 1) * G.W + tx];
    if (v === 1 || v === 4) {
      ctx.fillStyle = t.ground; ctx.fillRect(X, Y, TILE + 0.5, TILE + 0.5);
      if (h2(tx, ty) > 0.55) { ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.fillRect(X + h2(tx, ty + 9) * 24, Y + h2(tx + 4, ty) * 24, 5, 3); }
      if (topOpen) { ctx.fillStyle = t.top; ctx.fillRect(X, Y, TILE + 0.5, 6); ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(X, Y + 6, TILE + 0.5, 2); }
      if (v === 4) {
        ctx.strokeStyle = "rgba(255,240,200," + (0.45 + 0.25 * Math.sin(G.time * 3 + tx)) + ")"; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(X + 4, Y + 9); ctx.lineTo(X + 13, Y + 17); ctx.lineTo(X + 10, Y + 27); ctx.moveTo(X + 13, Y + 17); ctx.lineTo(X + 24, Y + 14); ctx.lineTo(X + 29, Y + 24); ctx.stroke();
      }
    } else {
      ctx.fillStyle = t.plat; rr(X + 1, Y + 2, TILE - 2, TILE - 4, 5); ctx.fill(); ctx.fillStyle = t.top; ctx.fillRect(X + 3, Y + 2, TILE - 6, 3);
      ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(X + 4, Y + 18, TILE - 8, 2);
    }
  }
  if (G.t.water) {
    const prog = clamp((G.player.x - G.startX) / (G.arenaX - G.startX), 0, 1), wy = ROWS * TILE - 40 - prog * 150;
    ctx.fillStyle = "rgba(60,200,220,0.16)"; ctx.fillRect(G.cam, wy, VW, ROWS * TILE - wy + 40);
    ctx.fillStyle = "rgba(200,255,255,0.35)"; for (let x = Math.floor(G.cam / 24) * 24; x < G.cam + VW; x += 24) ctx.fillRect(x + Math.sin(G.time * 2 + x) * 3, wy + Math.sin(G.time * 1.5 + x * 0.1) * 2, 12, 2);
  }
}
function drawPlat(pl) {
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
function drawPlayer() {
  const p = G.player;
  for (const tr of G.trail) { ctx.globalAlpha = tr.life * 2; ctx.fillStyle = "#8fd3ff"; rr(tr.x, tr.y + 6, p.w, p.h - 8, 5); ctx.fill(); }
  ctx.globalAlpha = 1;
  if (p.inv > 0 && Math.floor(p.inv * 12) % 2) return;
  const x = p.x, y = p.y, f = p.face, step = p.ground ? Math.sin(p.anim * 0.12) * 3 : 2;
  const sq = p.squash > 0 ? 1 + p.squash * 1.5 : p.pound === 2 ? 0.85 : 1;
  ctx.save(); ctx.translate(x + p.w / 2, y + p.h); ctx.scale(f * sq, 1 / sq); ctx.translate(0, -p.h);
  if (p.wall) ctx.rotate(0.06 * -p.wall * f);
  ctx.fillStyle = "#a8324a"; ctx.beginPath(); ctx.moveTo(-6, 8); ctx.lineTo(-13 - Math.abs(p.vx) * 0.02, 24 + Math.sin(G.time * 8) * 1.5 - (p.vy < 0 ? 6 : 0)); ctx.lineTo(-2, 22); ctx.fill();
  ctx.fillStyle = "#2b2440"; ctx.fillRect(-5, 22, 4, 6 + step * 0.5); ctx.fillRect(2, 22, 4, 6 - step * 0.5);
  ctx.fillStyle = "#f3f1ea"; rr(-7, 9, 15, 15, 3); ctx.fill();
  ctx.fillStyle = "#5b7bd6"; ctx.fillRect(-2, 10, 4, 12);
  ctx.strokeStyle = "#8a93a6"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 12, 4.5, 0.2, 3); ctx.stroke(); ctx.fillStyle = "#c9d0dc"; ctx.beginPath(); ctx.arc(3.5, 17, 1.8, 0, 6.283); ctx.fill();
  ctx.fillStyle = "#e9bf98"; ctx.beginPath(); ctx.arc(1, 4, 6, 0, 6.283); ctx.fill();
  ctx.fillStyle = "#3b2418"; ctx.beginPath(); ctx.arc(0, 2, 6.2, 3.3, 6.1); ctx.fill(); ctx.fillRect(-6, 0, 3, 6);
  ctx.fillStyle = "#1a1220"; ctx.fillRect(4, 3, 1.8, 2.2);
  ctx.restore();
}
function drawEnemy(e) {
  const t = G.t;
  if (e.kind === "walk" || e.kind === "hopper") {
    const hop = e.kind === "hopper", bob = hop ? 0 : Math.abs(Math.sin(e.t * 8)) * 2, cx = e.x + e.w / 2, dir = Math.sign(e.vx) || (G.player.x > e.x ? 1 : -1);
    const stretch = hop ? (e.grounded ? 1 - Math.max(0, 0.3 - e.jt) : 1.15) : 1;
    ctx.save(); ctx.translate(cx, e.y + e.h); ctx.scale(1 / stretch, stretch); ctx.translate(-cx, -(e.y + e.h));
    ctx.fillStyle = hop ? t.enemy2 : t.enemy; ctx.beginPath(); ctx.ellipse(cx, e.y + e.h - 9 - bob, 12, 10 + bob * 0.3, 0, 3.14, 6.283); ctx.fill(); ctx.fillRect(e.x, e.y + e.h - 10 - bob, e.w, 8);
    if (hop) { ctx.fillStyle = t.enemy; ctx.beginPath(); ctx.moveTo(cx - 7, e.y + 2); ctx.lineTo(cx - 3, e.y - 6); ctx.lineTo(cx, e.y + 2); ctx.moveTo(cx + 1, e.y + 2); ctx.lineTo(cx + 5, e.y - 6); ctx.lineTo(cx + 8, e.y + 2); ctx.fill(); }
    ctx.fillStyle = t.enemy2; ctx.fillRect(e.x + 3, e.y + e.h - 3, 6, 3); ctx.fillRect(e.x + e.w - 9, e.y + e.h - 3, 6, 3);
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx - 4 + dir * 2, e.y + 8 - bob, 3.4, 0, 6.283); ctx.arc(cx + 4 + dir * 2, e.y + 8 - bob, 3.4, 0, 6.283); ctx.fill();
    ctx.fillStyle = "#14101c"; ctx.beginPath(); ctx.arc(cx - 3 + dir * 3, e.y + 8.5 - bob, 1.6, 0, 6.283); ctx.arc(cx + 5 + dir * 3, e.y + 8.5 - bob, 1.6, 0, 6.283); ctx.fill();
    ctx.restore();
  } else if (e.kind === "turret") {
    const cx = e.x + e.w / 2, dir = G.player.x > e.x ? 1 : -1, charge = e.cd < 0.5 ? 1 - e.cd * 2 : 0;
    ctx.fillStyle = t.enemy2; rr(e.x, e.y + 8, e.w, e.h - 8, 5); ctx.fill();
    ctx.fillStyle = t.enemy; ctx.beginPath(); ctx.arc(cx, e.y + 10, 10, 3.14, 6.283); ctx.fill();
    ctx.fillStyle = "#14101c"; ctx.fillRect(cx + dir * 4, e.y + 5, dir * 10, 6);
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
  const tint = d.kind === "arena" ? "255,120,110" : d.kind === "echo" ? "200,170,255" : d.kind === "barrier" ? "255,220,150" : "255,236,200";
  const vg = ctx.createLinearGradient(0, 0, 0, gy); vg.addColorStop(0, "rgba(" + tint + ",0)"); vg.addColorStop(1, "rgba(" + tint + ",0.32)");
  ctx.fillStyle = vg; ctx.fillRect(X + 4, 0, TILE - 8, gy);
  for (let i = 0; i < 5; i++) { const yy = (G.time * 40 + i * 60) % gy; ctx.fillStyle = "rgba(" + tint + ",0.5)"; ctx.fillRect(X + 8 + (i % 3) * 6, gy - yy, 2, 8); }
  ctx.fillStyle = "#4a4458"; ctx.fillRect(X - 6, gy - 96, 10, 96); ctx.fillRect(X + TILE - 4, gy - 96, 10, 96);
  ctx.fillStyle = "#5d566e"; rr(X - 10, gy - 108, TILE + 20, 14, 4); ctx.fill();
  ctx.fillStyle = "#373244"; ctx.fillRect(X - 6, gy - 96, 3, 96); ctx.fillRect(X + TILE + 3, gy - 96, 3, 96);
  const glow = 0.6 + 0.4 * Math.sin(G.time * 3);
  ctx.fillStyle = "rgba(" + tint + "," + glow + ")"; ctx.font = "700 22px Cinzel, Georgia, serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const glyph = d.kind === "gate" ? "?" : d.kind === "echo" ? "↺" : d.kind === "arena" ? "✕" : "◆";
  ctx.fillText(glyph, X + TILE / 2, gy - 52);
  ctx.restore();
  if (!d.open && d.kind !== "arena") label(d.kind === "gate" ? "Gate" : d.kind === "echo" ? "Echo Gate" : "Veil", X + TILE / 2, gy - 118, t.accent);
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
  const y = o.y + Math.sin(G.time * 2 + o.ph) * 4;
  const rg = ctx.createRadialGradient(o.x - 3, y - 3, 1, o.x, y, o.r + 6); rg.addColorStop(0, "#ffffff"); rg.addColorStop(0.35, G.t.accent); rg.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(o.x, y, o.r + 6, 0, 6.283); ctx.fill();
  ctx.strokeStyle = G.t.top; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(o.x, y, o.r, 0, 6.283); ctx.stroke();
  label(o.short, o.x, y - o.r - 6);
}
function drawPearl(pr) {
  if (pr.taken) return;
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
  if (b.inv > 0 && b.inv < 98 && Math.floor(b.inv * 10) % 2) return;
  const S = G.L.boss.shape, col = G.t.boss, x = b.x, y = b.y, w = b.w, h = b.h, cx = x + w / 2, f = b.face, t = G.time;
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
  if (b.inv >= 98) { ctx.fillStyle = "#ffe9a8"; for (let i = 0; i < 3; i++) { const a = t * 4 + i * 2.09; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 20, y - 10 + Math.sin(a) * 5, 3, 0, 6.283); ctx.fill(); } }
}
function render() {
  ctx.setTransform(DPR * SC, 0, 0, DPR * SC, 0, 0);
  const p = G.player;
  const target = p.x + p.w / 2 - VW * 0.4 + p.face * 30;
  G.cam += (clamp(target, 0, Math.max(0, G.W * TILE - VW)) - G.cam) * 0.1;
  drawBackground();
  const sx = G.shake > 0 ? (Math.random() - 0.5) * 8 * G.shake / 0.3 : 0, sy = G.shake > 0 ? (Math.random() - 0.5) * 6 * G.shake / 0.3 : 0;
  ctx.save(); ctx.translate(-Math.round(G.cam * 10) / 10 + sx, OFFY + sy);
  drawTiles();
  for (const pl of G.plats) drawPlat(pl);
  for (const sk of G.spikes) if (sk.x + sk.w > G.cam && sk.x < G.cam + VW) drawSpikes(sk);
  for (const sp of G.springs) drawSpring(sp);
  for (const f of G.flags) drawFlag(f);
  for (const s of G.signs) drawSign(s);
  for (const d of G.doors) drawDoor(d);
  for (const o of G.orbs) drawOrb(o);
  for (const pr of G.pearls) drawPearl(pr);
  for (const po of G.potions) drawPotion(po);
  for (const e of G.enemies) if (e.alive && e.x > G.cam - 60 && e.x < G.cam + VW + 60) drawEnemy(e);
  if (G.boss) drawBoss(G.boss);
  for (const w of G.waves) { ctx.fillStyle = G.t.top; ctx.beginPath(); ctx.moveTo(w.x - 12, GR * TILE); ctx.quadraticCurveTo(w.x, GR * TILE - 30, w.x + 12, GR * TILE); ctx.fill(); }
  for (const s of G.shots) { const rg = ctx.createRadialGradient(s.x, s.y, 1, s.x, s.y, 9); rg.addColorStop(0, "#fff"); rg.addColorStop(0.5, G.t.enemy); rg.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(s.x, s.y, 9, 0, 6.283); ctx.fill(); }
  if (G.portal) { const q = G.portal; ctx.save(); ctx.translate(q.x, q.y); for (let i = 0; i < 3; i++) { ctx.strokeStyle = i === 1 ? G.t.top : G.t.accent; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, 0, 18 - i * 4, 30 - i * 6, 0, G.time * (2 + i), G.time * (2 + i) + 4.5); ctx.stroke(); } ctx.restore(); label("Portal", q.x, q.y - 40, G.t.accent); }
  drawPlayer();
  drawChase(G.chase);
  for (const f of G.fx) {
    ctx.globalAlpha = clamp(f.life * 2, 0, 1);
    if (f.ring) { ctx.strokeStyle = f.c; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.45, 0, 0, 6.283); ctx.stroke(); }
    else { ctx.fillStyle = f.c; ctx.fillRect(f.x - 2, f.y - 2, 4, 4); }
  }
  ctx.globalAlpha = 1;
  for (const q of G.pops) { ctx.globalAlpha = clamp(q.life * 1.5, 0, 1); ctx.font = "700 12px 'IBM Plex Mono', monospace"; ctx.textAlign = "center"; ctx.fillStyle = "#ffe9a8"; ctx.fillText(q.text, q.x, q.y); }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/* ================= loop ================= */
let lastFrame = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  if (!G || $("gameScreen").hidden) return;
  const dt = Math.min((now - lastFrame) / 1000, 1 / 30); lastFrame = now;
  if (!modalOpen && !G.done) update(dt);
  else { pressed.jump = pressed.dash = pressed.down = false; }
  if (G) render();
}
requestAnimationFrame(frame);
renderMap(); renderStoreNote(); initCaps();
