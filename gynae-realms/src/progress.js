/* ================= character progression: XP from learning, stats, equipment, riddle chests, fact wisps =================
   Character data lives in P.chars (one entry per registrar; P.activeChar is the one playing) and is saved with the rest of your progress. */

const STATS = [
  ["vit", "Vitality", "More hearts: +1 heart for every 2 points."],
  ["agi", "Agility", "Run faster, dash further and recover your dash sooner."],
  ["mig", "Might", "Wider ground pound, longer staggers. At 5+, a full-marks recall strike hits the guardian twice."],
  ["wis", "Wisdom", "+1.5 s on every gate timer, and +1 Insight capacity for every 4 points."]
];
const SLOTS = [["head", "Head"], ["body", "Body"], ["hands", "Hands"], ["feet", "Feet"], ["charm", "Charm"], ["tool", "Tool"]];
const PERKS = {
  triple: "Triple jump: one extra jump in the air.",
  dash2: "Two air dashes before landing.",
  ward: "Hazard ward: the first hit after each banner is absorbed.",
  regen: "Each new banner restores a heart.",
  insight: "+1 Insight capacity.",
  timer: "+10 s on every gate timer.",
  startI: "Start each realm with +1 Insight.",
  reflect: "Reflected shots stagger the guardian for longer."
};
/* Two pieces per realm: one in its riddle chest, one dropped by its guardian. */
const ITEMS = {
  moonBoots:   { name: "Moonsilver Boots", slot: "feet", stats: { agi: 2 }, realm: "s1", src: "chest" },
  ogreCoat:    { name: "Ogre-hide Coat", slot: "body", stats: { vit: 2 }, realm: "s1", src: "boss" },
  monocle:     { name: "Alchemist's Monocle", slot: "head", stats: { wis: 2 }, realm: "s2", src: "chest" },
  slimeGloves: { name: "Slime-proof Gloves", slot: "hands", stats: { vit: 1 }, perk: "ward", realm: "s2", src: "boss" },
  ironTonic:   { name: "Iron Tonic", slot: "charm", stats: { vit: 1 }, perk: "regen", realm: "s3", src: "chest" },
  golemFists:  { name: "Golem Gauntlets", slot: "hands", stats: { mig: 2 }, realm: "s3", src: "boss" },
  thornBoots:  { name: "Thornwalker Boots", slot: "feet", stats: { agi: 1 }, perk: "triple", realm: "s4", src: "chest" },
  wyrmCoat:    { name: "Wyrm-scale Coat", slot: "body", stats: { vit: 1, mig: 1 }, realm: "s4", src: "boss" },
  loupe:       { name: "Surgeon's Loupe", slot: "head", stats: { wis: 1 }, perk: "timer", realm: "s5", src: "chest" },
  clotHammer:  { name: "Clot-breaker Hammer", slot: "tool", stats: { mig: 2 }, realm: "s5", src: "boss" },
  feather:     { name: "Feather Pendant", slot: "charm", stats: { agi: 1, wis: 1 }, realm: "s6", src: "chest" },
  spireCape:   { name: "Spire Cape", slot: "body", stats: { agi: 1, vit: 1 }, realm: "s6", src: "boss" },
  ribbon:      { name: "Twister Ribbon", slot: "charm", stats: { wis: 1 }, perk: "startI", realm: "s7", src: "chest" },
  fang:        { name: "Serpent-fang Scalpel", slot: "tool", stats: { mig: 1 }, perk: "reflect", realm: "s7", src: "boss" },
  diverHelm:   { name: "Diver's Helm", slot: "head", stats: { vit: 1, wis: 1 }, realm: "s8", src: "chest" },
  finBoots:    { name: "Leviathan Fins", slot: "feet", stats: { agi: 2 }, perk: "dash2", realm: "s8", src: "boss" },
  emberCrown:  { name: "Ember Crown", slot: "head", stats: { wis: 2, mig: 1 }, realm: "s9", src: "chest" },
  oracleEye:   { name: "Oracle's Eye", slot: "charm", stats: { wis: 2 }, perk: "insight", realm: "s9", src: "boss" }
};
const itemFor = (realm, src) => Object.keys(ITEMS).find(id => ITEMS[id].realm === realm && ITEMS[id].src === src);

/* ---------- characters: roster, appearance, specialty ---------- */
const OUTFITS = {
  coat: { body: "#f3f1ea", sleeve: "#f3f1ea", legs: "#2b2440", tie: true },
  scrubs: { body: "scrub", sleeve: "skin", legs: "scrub", vneck: true },
  gown: { body: "scrub", sleeve: "scrub", legs: "#2b3440", gown: true }
};
const LOOK_OPTS = {
  skin: ["#f6d4b8", "#e9bf98", "#d19a6a", "#a86f45", "#7a4a2a", "#4e2e1b"],
  hair: ["#1e1410", "#3b2418", "#7a4a24", "#c48a3a", "#e8d08a", "#b8b8c0", "#a83a2a", "#5a6ad0"],
  hairStyle: [["short", "Short"], ["long", "Long"], ["ponytail", "Ponytail"], ["bun", "Bun"], ["curly", "Curly"], ["buzz", "Cropped"]],
  outfit: [["coat", "White coat"], ["scrubs", "Scrubs"], ["gown", "Theatre gown"]],
  scrub: ["#3a7ab0", "#2a8a7a", "#6a4a9a", "#a83a5a", "#4a5a6a", "#5aa8a0"],
  accent: ["#5b7bd6", "#c0392b", "#2a8a5a", "#e0b25c", "#8a4ab0"],
  cape: ["#a8324a", "#2f6fa8", "#3a8a5a", "#6a3a9a", "#c98a2a", "#2a2a3a", "#e8e4da"],
  glasses: [["none", "None"], ["round", "Round"], ["square", "Square"]],
  hat: [["none", "None"], ["cap", "Theatre cap"], ["band", "Headband"]],
  capCol: ["#3a7ab0", "#e8e4da", "#c0392b", "#e0b25c", "#2a8a5a"]
};
const DEFAULT_LOOK = { skin: "#e9bf98", hair: "#3b2418", hairStyle: "short", outfit: "coat", scrub: "#3a7ab0", accent: "#5b7bd6", cape: "#a8324a", glasses: "none", hat: "none", capCol: "#3a7ab0" };
const SPECIALTIES = [
  ["gen", "Generalist", "Balanced: +1 Vitality, +1 Wisdom.", { vit: 1, wis: 1 }],
  ["theatre", "Theatre registrar", "Steady under pressure: +2 Might.", { mig: 2 }],
  ["birth", "Birth suite registrar", "Always running: +2 Agility.", { agi: 2 }],
  ["clinic", "Clinic registrar", "Reads everything: +2 Wisdom.", { wis: 2 }],
  ["ward", "Ward registrar", "Hard to knock down: +2 Vitality.", { vit: 2 }]
];
const specOf = id => SPECIALTIES.find(s => s[0] === id) || SPECIALTIES[0];
function randomLook() { const pick = a => a[Math.floor(Math.random() * a.length)]; const o = {}; for (const [k, v] of Object.entries(LOOK_OPTS)) o[k] = Array.isArray(v[0]) ? pick(v)[0] : pick(v); return o; }

const TEMP_CHAR = { id: "temp", name: "Registrar", look: { ...DEFAULT_LOOK }, spec: "gen", xp: 0, level: 1, points: 3, stats: { vit: 2, agi: 0, mig: 0, wis: 0 }, items: [], equip: {} };
function migrateChar() {
  P.chars = P.chars || [];
  if (P.char && !P.chars.length) { P.chars.push({ ...P.char, id: "c0", name: "Registrar", look: { ...DEFAULT_LOOK }, spec: "gen" }); P.activeChar = "c0"; }
  delete P.char;
}
function hasChars() { migrateChar(); return P.chars.length > 0; }
function charData() {
  migrateChar();
  const c = P.chars.find(x => x.id === P.activeChar) || P.chars[0];
  if (!c) return TEMP_CHAR;
  if (P.activeChar !== c.id) P.activeChar = c.id;
  c.look = { ...DEFAULT_LOOK, ...(c.look || {}) };
  return c;
}
function heroLook() { return charData().look; }
function newCharacter(name, look, spec) {
  const base = { vit: 2, agi: 0, mig: 0, wis: 0 };
  for (const [k, v] of Object.entries(specOf(spec)[3])) base[k] += v;
  const c = { id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, look, spec, xp: 0, level: 1, points: 3, stats: base, items: [], equip: {}, created: Date.now() };
  migrateChar(); P.chars.push(c); P.activeChar = c.id; save(); renderLevelChip();
  return c;
}

/* animated preview of a look */
function heroPreview(cv, getLook) {
  const pc = cv.getContext("2d"), t0 = performance.now();
  const p = { x: -9, y: -28, w: 18, h: 28, face: 1, ground: true, vx: 0, vy: 0, sq: 0, pound: 0, dash: 0, wall: 0, flip: 0, blink: 2, hflash: 0, spin: 0, anim: 0, cape: null };
  function frame(now) {
    if (!cv.isConnected) return;
    const t = (now - t0) / 1000, running = (t % 6) > 3, dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(cv.clientWidth * dpr), H = Math.round(cv.clientHeight * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    pc.setTransform(1, 0, 0, 1, 0, 0);
    const g = pc.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#2b2140"); g.addColorStop(1, "#1a1424"); pc.fillStyle = g; pc.fillRect(0, 0, W, H);
    pc.fillStyle = "#3a3050"; pc.fillRect(0, H * 0.84, W, H * 0.16); pc.fillStyle = "#8f7fd6"; pc.fillRect(0, H * 0.84, W, 3 * dpr);
    const S = H / 46;
    pc.setTransform(S, 0, 0, S, W / 2, H * 0.84);
    p.vx = running ? 150 : 0; p.anim = running ? t * 150 : 0; p.blink = (t % 3.1) < 0.12 ? -1 : 1;
    p.cape = Array.from({ length: 7 }, (_, i) => ({ x: -3 - i * (running ? 3.1 : 0.9), y: -17 + i * (running ? 0.9 : 2.5) + Math.sin(t * 7 + i * 0.9) * i * (running ? 0.35 : 0.12) }));
    const main = ctx; ctx = pc;
    try { drawHero(p, { ...DEFAULT_LOOK, ...getLook() }, t); } finally { ctx = main; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* the creator: new character, or edit an existing look */
function openCreator(opts) {
  opts = opts || {};
  const editing = opts.edit ? charData() : null;
  const st = { name: editing ? editing.name : "", spec: editing ? editing.spec : "gen", look: { ...(editing ? editing.look : DEFAULT_LOOK) } };
  let built = false;
  const build = () => { const sc = built ? $("panel").scrollTop : 0; showBuilt(); if (built) { $("panel").classList.remove("in"); $("panel").scrollTop = sc; } built = true; };
  const showBuilt = () => showModal(p => {
    const cv = el("canvas", { class: "preview", "aria-label": "Preview of your registrar" });
    const nameIn = el("input", { id: "charName", type: "text", maxlength: "20", placeholder: "Dr …", value: st.name, autocomplete: "off" });
    nameIn.addEventListener("input", () => { st.name = nameIn.value; });
    const row = (title, key, list) => {
      const box = el("div", { class: "swrow" });
      for (const v of list) {
        const val = Array.isArray(v) ? v[0] : v, txt = Array.isArray(v) ? v[1] : null, on = st.look[key] === val;
        const b = el("button", { type: "button", class: "sw" + (txt ? " txt" : "") + (on ? " on" : ""), "aria-pressed": String(on), "aria-label": title + " " + (txt || val), style: txt ? null : "background:" + val }, txt);
        b.addEventListener("click", () => { st.look[key] = val; st.name = nameIn.value; build(); });
        box.append(b);
      }
      return el("div", { class: "optrow" }, el("span", { class: "lbl", text: title }), box);
    };
    const specs = el("div", { class: "specs" });
    if (!editing) for (const [id, name, desc] of SPECIALTIES) {
      const b = el("button", { type: "button", class: "spec" + (st.spec === id ? " on" : ""), "aria-pressed": String(st.spec === id) }, el("b", { text: name }), el("span", { text: desc }));
      b.addEventListener("click", () => { st.spec = id; st.name = nameIn.value; build(); });
      specs.append(b);
    }
    const looks = el("div", { class: "looks" },
      row("Skin", "skin", LOOK_OPTS.skin), row("Hair", "hair", LOOK_OPTS.hair), row("Hairstyle", "hairStyle", LOOK_OPTS.hairStyle),
      row("Outfit", "outfit", LOOK_OPTS.outfit), st.look.outfit !== "coat" ? row("Outfit colour", "scrub", LOOK_OPTS.scrub) : row("Tie", "accent", LOOK_OPTS.accent),
      row("Cape", "cape", LOOK_OPTS.cape), row("Glasses", "glasses", LOOK_OPTS.glasses), row("Headwear", "hat", LOOK_OPTS.hat),
      st.look.hat !== "none" ? row("Headwear colour", "capCol", LOOK_OPTS.capCol) : null);
    const err = el("p", { class: "muted small", hidden: "" });
    const done = el("button", { type: "button", class: "btn primary", text: editing ? "Save look" : "Create registrar", onclick: () => {
      const name = (nameIn.value || "").trim();
      if (!name) { err.hidden = false; err.textContent = "Give your registrar a name."; nameIn.focus(); return; }
      if (editing) { editing.name = name; editing.look = { ...st.look }; save(); renderLevelChip(); }
      else { newCharacter(name, { ...st.look }, st.spec); toast("Welcome, " + name + ".", "good"); }
      closeModal(); if (opts.after) opts.after();
    } });
    p.append(el("span", { class: "kicker", text: editing ? "Character · change look" : "New character" }), el("h2", { text: editing ? "Change " + editing.name + "'s look" : "Create your registrar" }),
      el("div", { class: "creator" }, el("div", { class: "pv" }, cv, el("button", { type: "button", class: "btn quiet", text: "Randomise look", onclick: () => { st.look = randomLook(); st.name = nameIn.value; build(); } })),
        el("div", { class: "copts" }, el("label", { class: "lbl", for: "charName", text: "Name" }), nameIn,
          editing ? null : el("span", { class: "lbl", text: "Specialty (sets your starting stats)" }), editing ? null : specs, looks)),
      err, el("div", { class: "actions" }, done, el("button", { type: "button", class: "btn quiet", text: "Cancel", onclick: () => { closeModal(); if (opts.cancel) opts.cancel(); } })));
    heroPreview(cv, () => st.look);
    modalKeys = e => { if (e.key === "Enter" && e.target === nameIn) { done.click(); return true; } return false; };
  });
  build();
}

/* the roster: switch, create, change look, delete */
function openRoster(back) {
  migrateChar();
  showModal(p => {
    const list = el("div", { class: "roster" });
    for (const c of P.chars) {
      const cv = el("canvas", { class: "mini", "aria-hidden": "true" });
      const active = c.id === P.activeChar;
      const del = el("button", { type: "button", class: "btn quiet", text: "Delete" });
      del.addEventListener("click", () => {
        if (del.dataset.armed !== "1") { del.dataset.armed = "1"; del.textContent = "Tap again to delete " + c.name; return; }
        P.deleted = [...(P.deleted || []), c.id]; P.chars = P.chars.filter(x => x.id !== c.id);
        if (P.activeChar === c.id) P.activeChar = P.chars[0] ? P.chars[0].id : null;
        save(); renderLevelChip(); renderMap(); openRoster(back);
      });
      list.append(el("div", { class: "rosterrow" + (active ? " on" : "") }, cv,
        el("div", { class: "rinfo" }, el("b", { text: c.name + (active ? " · playing" : "") }), el("span", { class: "muted small", text: "Level " + c.level + " · " + specOf(c.spec)[1] + " · " + c.items.length + " of " + Object.keys(ITEMS).length + " items" })),
        el("div", { class: "actions" }, active ? null : el("button", { type: "button", class: "btn", text: "Play as " + c.name, onclick: () => { P.activeChar = c.id; save(); renderLevelChip(); renderMap(); openRoster(back); } }), del)));
      heroPreview(cv, () => c.look || DEFAULT_LOOK);
    }
    if (!P.chars.length) list.append(el("p", { class: "muted", text: "No characters yet." }));
    p.append(el("span", { class: "kicker", text: "Characters" }), el("h2", { text: "Your registrars" }),
      el("p", { class: "muted small", text: "Each registrar has their own level, stats and equipment. Stars, pearls and your review schedule are shared, because they track your learning." }), list,
      el("div", { class: "actions" }, el("button", { type: "button", class: "btn primary", text: "New character", onclick: () => openCreator({ after: () => openRoster(back), cancel: () => openRoster(back) }) }),
        el("button", { type: "button", class: "btn quiet", text: "Done", onclick: () => back ? back() : closeModal() })));
  });
}

const xpNeed = lv => 120 + 80 * (lv - 1);
function totalStats() {
  const c = charData(), s = { ...c.stats };
  for (const id of Object.values(c.equip)) { const it = ITEMS[id]; if (it) for (const k in it.stats) s[k] += it.stats[k]; }
  return s;
}
function perkSet() { const c = charData(), p = new Set(); for (const id of Object.values(c.equip)) if (ITEMS[id] && ITEMS[id].perk) p.add(ITEMS[id].perk); return p; }
function derived() {
  const s = totalStats(), pk = perkSet();
  return {
    maxH: clamp(4 + Math.floor(s.vit / 2), 3, 10), speed: 195 + 5 * s.agi, dashSpeed: 500 + 12 * s.agi, dashCd: Math.max(0.16, 0.34 - 0.012 * s.agi),
    airJumps: pk.has("triple") ? 2 : 1, airDashes: pk.has("dash2") ? 2 : 1, poundR: 60 + 8 * s.mig, bonusHit: s.mig >= 5,
    stagger: 2.2 + 0.15 * s.mig + (pk.has("reflect") ? 1 : 0), maxI: 3 + Math.floor(s.wis / 4) + (pk.has("insight") ? 1 : 0),
    timer: 1.5 * s.wis + (pk.has("timer") ? 10 : 0), startI: 1 + (pk.has("startI") ? 1 : 0), ward: pk.has("ward"), regen: pk.has("regen")
  };
}
function applyDerived() {
  if (!G) return;
  const before = G.maxH || 0;
  G.d = derived(); G.maxH = G.d.maxH;
  if (before && G.maxH > before) G.hearts = Math.min(G.maxH, G.hearts + (G.maxH - before));
  G.hearts = Math.min(G.hearts, G.maxH); G.insight = Math.min(G.insight, G.d.maxI);
  heartsShown = G.hearts; renderHearts(); renderInsight();
}
function statText(stats) { return Object.entries(stats || {}).map(([k, v]) => "+" + v + " " + STATS.find(s => s[0] === k)[1]).join(", "); }

/* XP: most of it comes from learning */
function gainXP(n, x, y) {
  const c = charData(); c.xp += n;
  if (G && x != null) G.pops.push({ x, y, text: "+" + n + " XP", life: 1.3, xp: true });
  let up = 0; while (c.xp >= xpNeed(c.level)) { c.xp -= xpNeed(c.level); c.level++; c.points++; up++; }
  if (up) {
    toast("Level " + c.level + "! You have " + c.points + " stat point" + (c.points > 1 ? "s" : "") + " to spend. Press C or open Character.", "good", 5000);
    if (G) { const p = G.player; ring(p.x + p.w / 2, p.y + p.h / 2, "#ffe9a8", 300); burst(p.x + p.w / 2, p.y + p.h / 2, "#ffe9a8", 30); }
  }
  save(); renderLevelChip();
}
function renderLevelChip() {
  const c = charData();
  const chip = $("levelChip"); if (chip) { chip.querySelector("b").textContent = "Lv " + c.level + (c.points ? " +" + c.points : ""); chip.querySelector("i").style.width = (c.xp / xpNeed(c.level) * 100) + "%"; chip.classList.toggle("hot", c.points > 0); }
  const mb = $("charBtn"); if (mb) mb.textContent = hasChars() ? c.name + " · Lv " + c.level + (c.points ? " · " + c.points + " point" + (c.points > 1 ? "s" : "") + " to spend" : "") : "Create your registrar";
}

/* equipment */
function giveItem(id) {
  const c = charData(), it = ITEMS[id];
  if (c.items.includes(id)) { gainXP(60); if (G && G.hearts < G.maxH) { G.hearts++; renderHearts(); } toast("You already own the " + it.name + ". +60 XP instead.", "good"); return; }
  c.items.push(id);
  const empty = !c.equip[it.slot];
  if (empty) c.equip[it.slot] = id;
  save(); applyDerived(); renderLevelChip();
  whenFree(() => showModal(p => {
    const cont = el("button", { type: "button", class: "btn primary", text: "Onward", onclick: closeModal });
    p.append(el("span", { class: "kicker", text: "New equipment · " + SLOTS.find(s => s[0] === it.slot)[1] }), el("h2", { text: it.name }),
      el("div", { class: "model" }, el("span", { class: "lbl", text: "Gives" }), el("p", { text: [statText(it.stats), it.perk ? PERKS[it.perk] : null].filter(Boolean).join(". ") })),
      el("p", { class: "muted", text: empty ? "Equipped automatically." : "Your " + SLOTS.find(s => s[0] === it.slot)[1].toLowerCase() + " slot is taken. Swap it in from the character sheet." }),
      el("div", { class: "actions" }, cont, el("button", { type: "button", class: "btn", text: "Character sheet", onclick: () => openCharacter(closeModal) })));
    modalKeys = e => { if (e.key === "Enter") { cont.click(); return true; } return false; };
  }));
}

/* character sheet */
function openCharacter(back) {
  const c = charData();
  showModal(p => {
    const s = totalStats(), d = derived();
    const xpbar = el("div", { class: "tbar" }, el("i", { style: "width:" + (c.xp / xpNeed(c.level) * 100) + "%" }), el("span", { text: c.xp + " / " + xpNeed(c.level) + " XP" }));
    const rows = el("div", { class: "statrows" });
    for (const [k, name, desc] of STATS) {
      const bonus = s[k] - c.stats[k];
      const plus = el("button", { type: "button", class: "btn", text: "+", "aria-label": "Add a point to " + name, onclick: () => { if (c.points <= 0) return; c.points--; c.stats[k]++; save(); applyDerived(); renderLevelChip(); openCharacter(back); } });
      if (c.points <= 0) plus.disabled = true;
      rows.append(el("div", { class: "statrow" }, el("div", {}, el("b", { text: name + " " + s[k] }), bonus ? el("span", { class: "muted", text: " (" + c.stats[k] + " + " + bonus + " from gear)" }) : null, el("div", { class: "muted small", text: desc })), plus));
    }
    const eff = el("p", { class: "muted small", text: "Now: " + d.maxH + " hearts · speed " + d.speed + " · dash " + d.dashSpeed + " · pound radius " + d.poundR + " · Insight " + d.maxI + " · gate timers +" + d.timer.toFixed(1) + " s" + (d.bonusHit ? " · double strikes" : "") });
    const slots = el("div", { class: "slots" });
    for (const [sk, sname] of SLOTS) {
      const id = c.equip[sk], it = ITEMS[id];
      slots.append(el("div", { class: "slot" + (it ? " full" : "") }, el("span", { class: "lbl", text: sname }), el("b", { text: it ? it.name : "Empty" }), it ? el("span", { class: "muted small", text: [statText(it.stats), it.perk ? PERKS[it.perk] : null].filter(Boolean).join(". ") }) : null));
    }
    const inv = el("div", { class: "inv" });
    const owned = Object.keys(ITEMS).filter(id => c.items.includes(id));
    if (!owned.length) inv.append(el("p", { class: "muted", text: "No equipment yet. Open riddle chests and defeat guardians to find it." }));
    for (const id of owned) {
      const it = ITEMS[id], on = c.equip[it.slot] === id;
      inv.append(el("div", { class: "invrow" }, el("div", {}, el("b", { text: it.name }), el("span", { class: "muted small", text: " · " + SLOTS.find(x => x[0] === it.slot)[1] + " · " + [statText(it.stats), it.perk ? PERKS[it.perk] : null].filter(Boolean).join(". ") })),
        el("button", { type: "button", class: "btn" + (on ? " quiet" : ""), text: on ? "Unequip" : "Equip", onclick: () => { if (on) delete c.equip[it.slot]; else c.equip[it.slot] = id; save(); applyDerived(); openCharacter(back); } })));
    }
    const found = owned.length, total = Object.keys(ITEMS).length;
    const head = el("div", { class: "sheethead" }, el("canvas", { class: "mini big", "aria-hidden": "true" }), el("div", {}, el("span", { class: "kicker", text: "Character · " + specOf(c.spec)[1] }), el("h2", { text: c.name + " · Level " + c.level })));
    p.append(head, el("div", { class: "actions" },
        el("button", { type: "button", class: "btn", text: "Change look", onclick: () => openCreator({ edit: true, after: () => openCharacter(back), cancel: () => openCharacter(back) }) }),
        G ? null : el("button", { type: "button", class: "btn", text: "Switch or new character", onclick: () => openRoster(() => openCharacter(back)) })), xpbar,
      el("p", { class: "muted small", text: "XP comes mostly from learning: right answers, solved rooms, pearls, guardian recall, true fact wisps, and the Review Shrine." }),
      el("h3", { text: c.points ? c.points + " stat point" + (c.points > 1 ? "s" : "") + " to spend" : "Stats" }), rows, eff,
      el("h3", { text: "Equipped" }), slots,
      el("h3", { text: "Collection · " + found + " of " + total }), inv,
      el("div", { class: "actions" }, el("button", { type: "button", class: "btn primary", text: "Done", onclick: () => back ? back() : closeModal() })));
    heroPreview(head.querySelector("canvas"), () => c.look);
  });
}

/* riddle chests: answer to open */
function chestInteract() {
  if (!G || !G.chests) return false;
  const p = G.player, cx = p.x + p.w / 2;
  const ch = G.chests.find(c => Math.abs(c.x - cx) < 34 && Math.abs(c.y - (p.y + p.h)) < 40);
  if (!ch) return false;
  if (ch.state === "open") return true;
  if (ch.state === "sealed") { toast("The lock is reshuffling. Try again in a moment."); return true; }
  const all = (G.L.run && G.L.run.chest.length ? G.L.run.chest : G.L.segs.filter(s => (s.t === "gate" || s.t === "leap") && s.q.k !== "multi").map(s => s.id)).filter(id => QB[id]);
  const fresh = all.filter(id => !ch.asked.includes(id)), pick = fresh.length ? fresh : all;
  const id = pick[Math.floor(Math.random() * pick.length)];
  ch.asked.push(id); ch.busy = true;
  askGate(QB[id], "Riddle chest · answer to open it").then(ok => {
    if (!G) return;
    ch.busy = false;
    if (ok) { srsHit(id); ch.state = "open"; ch.t = 0; burst(ch.x, ch.y - 14, "#ffe9a8", 30); ring(ch.x, ch.y - 10, "#ffe9a8", 240); gainXP(40, ch.x, ch.y - 40); giveItem(itemFor(G.L.id, "chest")); }
    else { srsMiss(id); G.missed.push(id); ch.state = "sealed"; ch.t = 0; knowledgeHit("The riddle lock snaps shut. It will reshuffle in a few seconds."); }
  });
  return true;
}
function updateChests(dt) {
  for (const ch of G.chests) { ch.t += dt; if (ch.state === "sealed" && ch.t > 6) { ch.state = "locked"; toast("A riddle chest has a new lock."); } }
  const l = G.loot;
  if (l && !l.taken) { const p = G.player; l.t += dt; if (Math.hypot(p.x + p.w / 2 - l.x, p.y + p.h / 2 - l.y) < 26) { l.taken = true; burst(l.x, l.y, "#ffe9a8", 30); giveItem(l.id); } }
}
function drawChests() {
  for (const ch of G.chests) {
    if (ch.x < G.cam - 40 || ch.x > G.cam + VW + 40) continue;
    const x = ch.x, y = ch.y, open = ch.state === "open";
    if (!open) glow(x, y - 12, 40, ch.state === "sealed" ? "#ff6a5a" : "#ffd27a", 0.35 + 0.1 * Math.sin(G.time * 3));
    ctx.fillStyle = "#5a3a22"; rr(x - 15, y - 18, 30, 18, 3); ctx.fill();
    ctx.fillStyle = "#c9a26a"; ctx.fillRect(x - 15, y - 12, 30, 3); ctx.fillRect(x - 2, y - 18, 4, 18);
    ctx.save(); ctx.translate(x - 15, y - 18); if (open) ctx.rotate(-0.9);
    ctx.fillStyle = "#6e4a2c"; rr(0, -10, 30, 11, 5); ctx.fill(); ctx.fillStyle = "#c9a26a"; ctx.fillRect(13, -10, 4, 11); ctx.restore();
    if (!open) { ctx.fillStyle = ch.state === "sealed" ? "#ff8f80" : "#ffe9a8"; rr(x - 4, y - 14, 8, 7, 2); ctx.fill(); }
    label(open ? "Opened" : ch.state === "sealed" ? "Sealed" : "Riddle chest · ↓", x, y - 34, open ? "#b9ad95" : "#ffe9a8", 9);
  }
  const l = G.loot;
  if (l && !l.taken) {
    const y = l.y + Math.sin(G.time * 3) * 4;
    glow(l.x, y, 46, "#ffe9a8", 0.55);
    ctx.save(); ctx.translate(l.x, y); ctx.rotate(Math.sin(G.time * 2) * 0.2);
    ctx.fillStyle = "#ffe9a8"; ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283, r = i % 2 ? 6 : 14; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); ctx.restore();
    label(ITEMS[l.id].name, l.x, y - 26, "#ffe9a8", 10);
  }
}

/* fact wisps: stomp the true ones */
function drawFact(e) {
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2, b = Math.sin(e.t * 2) * 2;
  glow(cx, cy, 30, "#cfc8ff", 0.4);
  ctx.fillStyle = "#e8e2ff"; rr(cx - 11, cy - 8 + b, 22, 16, 4); ctx.fill();
  ctx.fillStyle = "#b8aee8"; ctx.beginPath(); ctx.arc(cx - 11, cy + b, 4, 0, 6.283); ctx.arc(cx + 11, cy + b, 4, 0, 6.283); ctx.fill();
  ctx.fillStyle = "#4a3a7a"; ctx.font = "700 12px Cinzel, Georgia, serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("?", cx, cy + b + 1);
  const words = e.fact[0];
  label(words, cx, cy - 18 + b, "#ece6ff", 9);
}
function stompFact(e) {
  e.alive = false; e.dead = { t: 0.9, how: "squash" };
  const [s, isTrue, why] = e.fact;
  if (isTrue) { burst(e.x + e.w / 2, e.y, "#cfc8ff", 20); rightAnswer(e.x, e.y - 20); gainXP(15, e.x, e.y - 40); toast("True. " + why, "good", 5000); }
  else { burst(e.x + e.w / 2, e.y, "#ff8f80", 16); knowledgeHit("False: “" + s + "”. " + why); }
}
