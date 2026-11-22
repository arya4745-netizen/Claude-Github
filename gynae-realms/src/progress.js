/* ================= character progression: XP from learning, stats, equipment, riddle chests, fact wisps =================
   Loaded last. Character data lives in P.char and is saved with the rest of your progress. */

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

function charData() {
  if (!P.char) P.char = { xp: 0, level: 1, points: 3, stats: { vit: 2, agi: 0, mig: 0, wis: 0 }, items: [], equip: {} };
  return P.char;
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
  const mb = $("charBtn"); if (mb) mb.textContent = "Character · Lv " + c.level + (c.points ? " · " + c.points + " point" + (c.points > 1 ? "s" : "") + " to spend" : "");
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
    p.append(el("span", { class: "kicker", text: "Character" }), el("h2", { text: "Registrar · Level " + c.level }), xpbar,
      el("p", { class: "muted small", text: "XP comes mostly from learning: right answers, solved rooms, pearls, guardian recall, true fact wisps, and the Review Shrine." }),
      el("h3", { text: c.points ? c.points + " stat point" + (c.points > 1 ? "s" : "") + " to spend" : "Stats" }), rows, eff,
      el("h3", { text: "Equipped" }), slots,
      el("h3", { text: "Collection · " + found + " of " + total }), inv,
      el("div", { class: "actions" }, el("button", { type: "button", class: "btn primary", text: "Done", onclick: () => back ? back() : closeModal() })));
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
  const all = G.L.segs.filter(s => (s.t === "gate" || s.t === "leap") && s.q.k !== "multi").map(s => s.id);
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
