/* ================= puzzle rooms =================
   One single-screen room per realm, placed after the chase. The camera locks and zooms so the whole room is visible.
   Press ↓ on the ground to pull a lever, pick up an item, or place a carried item in a slot.
   Each ROOM_IMPL: setup(r) once (extra platforms), init(r) -> state, lever(r, lv), place(r, slot, item) -> false to reject,
   take(r, slot, item), onBreak(r, tx, ty), update(r, dt), drawBack(r), drawFront(r), status(r). */
const ROOM_W = 16;
const RT = TILE, FL = GR * TILE;
const LEVELWORD = ["very low", "low", "moderate", "high", "very high"];

const ROOM_GEOM = {
  s1: { top: i => (i >= 5 && i <= 10) ? -1 : GR, blocks: [[1, GR - 3, 3], [4, GR - 5, 1]] },
  s2: { top: i => (i >= 8 && i <= 11) ? GR + 2 : GR, blocks: [[1, GR - 3, 3], [4, GR - 3, 3]] },
  s3: { blocks: [[13, GR - 3, 2], [11, GR - 6, 2]], cracked: [4, 5, 6, 7, 8, 9, 10, 11].map(x => [x, GR]) },
  s4: {},
  s5: { blocks: [[5, GR - 3, 2], [10, GR - 4, 2]] },
  s6: { top: i => i >= 14 ? GR - 7 : GR, blocks: [[7, GR - 3, 2]] },
  s7: { top: i => i >= 14 ? GR - 7 : GR },
  s8: { blocks: [[2, GR - 3, 2]], cracked: [[6, GR - 1], [6, GR - 2], [9, GR - 1], [9, GR - 2], [12, GR - 1], [12, GR - 2]] },
  s9: { blocks: [[6, GR - 3, 2]] }
};

/* ---------- framework ---------- */
function makeRoom(L, x0, x1) {
  const impl = ROOM_IMPL[L.id];
  const r = { id: L.id, impl, text: ROOMS[L.id], x0: x0 * TILE, x1: x1 * TILE, c0: x0, c1: x1, solved: false, entered: false, inside: false, cardText: "", cardT: 0 };
  r.snap = [];
  for (let y = 0; y < ROWS; y++) for (let x = x0; x < x1; x++) r.snap.push(G.tiles[y * G.W + x]);
  if (impl.setup) impl.setup(r);
  r.st = impl.init(r); staggerLabels(r);
  return r;
}
const RX = (r, i) => r.x0 + i * RT + 16;  // centre of room column i
/* Raise every other label where neighbours at the same height would overlap. */
function staggerLabels(r) {
  const st = r.st, all = [...(st.levers || []), ...(st.items || []).filter(i => !i.slot), ...(st.slots || [])];
  all.forEach(o => o.alt = false);
  const rows = {};
  for (const o of all) (rows[Math.round(o.y)] = rows[Math.round(o.y)] || []).push(o);
  for (const row of Object.values(rows)) { row.sort((a, b) => a.x - b.x); for (let i = 1; i < row.length; i++) if (row[i].x - row[i - 1].x < 96 && !row[i - 1].alt) row[i].alt = true; }
}
function lever(id, label, x, y, extra) { return { id, label, x, y, on: false, anim: 0, ...extra }; }
function item(id, label, icon, color, x, y) { return { id, label, icon, color, x, y, home: { x, y }, slot: null }; }
function slot(id, label, x, y) { return { id, label, x, y, item: null }; }
function putIn(it, sl) { sl.item = it; it.slot = sl; }
function sendHome(r, it) { if (it.slot) { it.slot.item = null; it.slot = null; } if (G.carry === it) G.carry = null; it.x = it.home.x; it.y = it.home.y; burst(it.x, it.y - 10, "#ffffff", 8); }
function posOf(o) { return o.slot ? o.slot : o; }

function roomUpdate(r, dt) {
  const p = G.player;
  r.inside = p.x + p.w > r.x0 && p.x < r.x1;
  G.roomLock = p.x + p.w > r.x0 - TILE * 2 && p.x < r.x1 + TILE ? r : null;
  if (r.inside && !r.entered) {
    r.entered = true;
    toast("Puzzle room: " + r.text.title + ". Press ↓ on the ground to pull levers, pick up and place items. R resets the room.", null, 7000);
  }
  for (const lv of r.st.levers || []) { lv.anim = Math.max(0, lv.anim - dt); if (lv.springT > 0) { lv.springT -= dt; if (lv.springT <= 0) lv.on = false; } }
  if (G.carry) { G.carry.x = p.x + p.w / 2; G.carry.y = p.y - 2; }
  r.impl.update(r, dt);
  const show = !!G.roomLock && !r.solved;
  const card = $("roomCard");
  if (card.hidden === show) { card.hidden = !show; $("stage").classList.toggle("carded", show); if (show) renderRoomCard(r, true); }
  r.cardT -= dt; if (show && r.cardT <= 0) { r.cardT = 0.2; renderRoomCard(r); }
}
function renderRoomCard(r, force) {
  const status = r.impl.status ? r.impl.status(r) : "";
  if (!force && status === r.cardText) return;
  r.cardText = status;
  const card = $("roomCard"); card.textContent = "";
  card.append(el("div", { class: "lrow" }, el("span", { text: "Puzzle room · " + G.L.station }), el("button", { type: "button", text: "Reset (R)", onclick: e => { e.currentTarget.blur(); roomReset(r); } })),
    el("div", { class: "lq", text: r.text.title }), el("div", { class: "rgoal", text: r.text.goal }), status ? el("div", { class: "rstat", text: status }) : null);
}
function roomInteract() {
  const r = G.room; if (!r || !r.inside || r.solved) return false;
  const p = G.player, cx = p.x + p.w / 2, cy = p.y + p.h, st = r.st;
  const near = (o, d) => Math.abs(o.x - cx) < (d || 30) && Math.abs(o.y - cy) < 44;
  if (G.carry) {
    const it = G.carry;
    const sl = (st.slots || []).filter(s => !s.item && near(s, 40)).sort((a, b) => Math.abs(a.x - cx) - Math.abs(b.x - cx))[0];
    G.carry = null;
    if (sl) {
      putIn(it, sl); ring(sl.x, sl.y - 12, G.t.accent, 160); burst(sl.x, sl.y - 12, G.t.accent, 10);
      if (r.impl.place(r, sl, it) === false) sendHome(r, it);
    } else { it.x = cx; it.y = cy; dust(cx, cy, 3); }
    return true;
  }
  const lv = (st.levers || []).filter(l => !l.hidden && near(l, 26)).sort((a, b) => Math.abs(a.x - cx) - Math.abs(b.x - cx))[0];
  if (lv) { lv.on = !lv.on; lv.anim = 0.3; if (lv.spring) lv.springT = 0.9; burst(lv.x, lv.y - 20, G.t.accent, 6); r.impl.lever(r, lv); return true; }
  const it = (st.items || []).filter(i => near(posOf(i), 28) && !i.gone).sort((a, b) => Math.abs(posOf(a).x - cx) - Math.abs(posOf(b).x - cx))[0];
  if (it) {
    if (it.slot) { const s = it.slot; s.item = null; it.slot = null; if (r.impl.take) r.impl.take(r, s, it); }
    G.carry = it; toast("Carrying " + it.label + ". Press ↓ beside a slot to place it, or anywhere to drop it.");
    return true;
  }
  return false;
}
function roomReset(r, quiet) {
  if (!r || r.solved) return;
  let k = 0; for (let y = 0; y < ROWS; y++) for (let x = r.c0; x < r.c1; x++) G.tiles[y * G.W + x] = r.snap[k++];
  for (let x = r.c0; x < r.c1; x += 8) markDirty(x); markDirty(r.c1 - 1);
  G.carry = null;
  r.st = r.impl.init(r); staggerLabels(r);
  const p = G.player; p.x = r.x0 + 8; p.y = FL - p.h - 1; p.vx = p.vy = 0; p.cape = null;
  r.cardText = ""; renderRoomCard(r, true);
  if (!quiet) toast("The room resets.");
}
function roomSlip(msg) { knowledgeHit(msg); }
function roomPushBack(r, msg) {
  const p = G.player; hurt(p.x + 80, true);
  p.x = r.x0 + 8; p.y = FL - p.h - 1; p.vx = 0;
  if (msg) toast(msg, "bad");
}
function whenFree(fn) { if (!G) return; if (!modalOpen) fn(); else setTimeout(() => whenFree(fn), 300); }
function solveRoom(r) {
  if (r.solved) return;
  r.solved = true; G.carry = null; gainXP(80, r.x0 + ROOM_W * TILE / 2, 140);
  openDoor(r.door); addScore(400, r.door.col * TILE, GR * TILE - 120); gainInsight(1);
  burst(r.x0 + ROOM_W * TILE / 2, 120, G.t.accent, 40, { size: 3 }); G.shake = 0.3; hitstop(0.1);
  $("roomCard").hidden = true; $("stage").classList.remove("carded");
  setTimeout(() => whenFree(() => showModal(p => {
    const cont = el("button", { type: "button", class: "btn primary", text: "Onward", onclick: closeModal });
    p.append(el("span", { class: "kicker", text: "Puzzle solved · " + G.L.station }), el("h2", { text: r.text.title }),
      el("div", { class: "model" }, el("span", { class: "lbl", text: "Picture it" }), el("p", { text: r.text.picture })),
      el("div", { class: "why good" }, el("span", { class: "verdict good", text: "Remember" }), el("p", { text: r.text.lesson })),
      el("div", { class: "actions" }, cont));
    modalKeys = e => { if (e.key === "Enter") { cont.click(); return true; } return false; };
  })), 800);
}
function roomNear(r, consider) {
  if (!r.inside || r.solved) return;
  const st = r.st;
  if (G.carry) { for (const s of st.slots || []) if (!s.item) consider(s.x, s.y - 14, "↓ Place " + G.carry.label + " in: " + s.label); return; }
  for (const lv of st.levers || []) if (!lv.hidden) consider(lv.x, lv.y - 14, "↓ Lever: " + lv.label + (lv.on && !lv.spring ? " (on)" : ""));
  for (const it of st.items || []) if (!it.gone) { const q = posOf(it); consider(q.x, q.y - 12, "↓ Pick up: " + it.label); }
}

/* ---------- shared drawing ---------- */
function drawLever(lv) {
  const a = (lv.on ? 0.65 : -0.65) * (1 - lv.anim * 2);
  ctx.fillStyle = "#4a4458"; rr(lv.x - 11, lv.y - 7, 22, 7, 2); ctx.fill();
  ctx.save(); ctx.translate(lv.x, lv.y - 5); ctx.rotate(a);
  ctx.strokeStyle = "#cfc6dc"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -20); ctx.stroke();
  ctx.fillStyle = lv.on ? G.t.top : "#ff8f80"; ctx.beginPath(); ctx.arc(0, -21, 4.5, 0, 6.283); ctx.fill();
  ctx.restore();
  if (lv.alt) { ctx.strokeStyle = "rgba(244,236,216,0.25)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lv.x, lv.y - 30); ctx.lineTo(lv.x, lv.y - 42); ctx.stroke(); }
  label(lv.label, lv.x, lv.y - 34 - (lv.alt ? 16 : 0), lv.on ? G.t.accent : "#f4ecd8", 9);
}
function drawItemIcon(it, x, y) {
  const c = it.color;
  ctx.save(); ctx.translate(x, y);
  switch (it.icon) {
    case "crystal": ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(8, -12); ctx.lineTo(0, 0); ctx.lineTo(-8, -12); ctx.closePath(); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(3, -12); ctx.lineTo(0, -2); ctx.fill(); break;
    case "bolt": ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(3, -24); ctx.lineTo(-7, -10); ctx.lineTo(0, -10); ctx.lineTo(-4, 0); ctx.lineTo(8, -14); ctx.lineTo(1, -14); ctx.closePath(); ctx.fill(); break;
    case "T": ctx.strokeStyle = c; ctx.lineWidth = 3.5; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-9, -20); ctx.quadraticCurveTo(0, -26, 9, -20); ctx.moveTo(0, -23); ctx.lineTo(0, -2); ctx.stroke(); ctx.fillStyle = "#e0b25c"; ctx.fillRect(-2, -14, 4, 7); break;
    case "clamp": ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(2, -22); ctx.moveTo(6, 0); ctx.lineTo(-2, -22); ctx.stroke(); ctx.beginPath(); ctx.arc(-7, 2, 3, 0, 6.283); ctx.arc(7, 2, 3, 0, 6.283); ctx.stroke(); break;
    case "syringe": ctx.fillStyle = "#e8eef8"; rr(-4, -22, 8, 16, 2); ctx.fill(); ctx.fillStyle = c; ctx.fillRect(-3, -16, 6, 9); ctx.fillStyle = "#cfc6dc"; ctx.fillRect(-1, -6, 2, 6); ctx.fillRect(-6, -24, 12, 2); break;
    case "sock": ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(-5, -24); ctx.lineTo(5, -24); ctx.lineTo(5, -8); ctx.lineTo(10, -4); ctx.lineTo(10, 0); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill(); ctx.fillStyle = "rgba(0,0,0,0.15)"; ctx.fillRect(-5, -20, 10, 2); ctx.fillRect(-5, -14, 10, 2); break;
    case "pill": ctx.fillStyle = c; rr(-10, -12, 20, 10, 5); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.fillRect(0, -12, 1, 10); break;
    case "ore": ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-7, -14); ctx.lineTo(2, -20); ctx.lineTo(10, -10); ctx.lineTo(8, 0); ctx.closePath(); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.fillRect(-3, -14, 4, 4); break;
    default: ctx.fillStyle = "#e8eef8"; rr(-5, -20, 10, 18, 3); ctx.fill(); ctx.fillStyle = c; ctx.fillRect(-4, -12, 8, 9); ctx.fillStyle = "#8a8496"; ctx.fillRect(-3, -24, 6, 4);
  }
  ctx.restore();
}
function drawRoomItem(it) {
  if (it.gone) return;
  const q = it === G.carry ? { x: it.x, y: it.y } : posOf(it);
  const bob = it === G.carry ? 0 : Math.sin(G.time * 2.5 + q.x) * 1.5;
  const rg = ctx.createRadialGradient(q.x, q.y - 12, 2, q.x, q.y - 12, 22); rg.addColorStop(0, "rgba(255,255,255,0.25)"); rg.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = rg; ctx.fillRect(q.x - 22, q.y - 34, 44, 44);
  drawItemIcon(it, q.x, q.y + bob - (it.slot ? 4 : 0));
  if (it !== G.carry && !it.slot) label(it.label, q.x, q.y - 30 - (it.alt ? 16 : 0), "#f4ecd8", 9);
}
function drawSlot(s) {
  ctx.fillStyle = "#4a4458"; rr(s.x - 14, s.y - 6, 28, 6, 2); ctx.fill();
  ctx.strokeStyle = s.item ? G.t.top : "rgba(255,240,200," + (0.4 + 0.3 * Math.sin(G.time * 4)) + ")"; ctx.lineWidth = 1.5;
  ctx.setLineDash(s.item ? [] : [4, 3]); rr(s.x - 13, s.y - 34, 26, 28, 5); ctx.stroke(); ctx.setLineDash([]);
  label(s.label, s.x, s.y - 40 - (s.alt ? 16 : 0), s.item ? G.t.accent : "#f4ecd8", 9);
}
function drawLiquid(x0, x1, top, bottom, color, alpha) {
  if (top >= bottom) return;
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(x0, bottom);
  for (let x = x0; x <= x1; x += 6) ctx.lineTo(x, top + Math.sin(x * 0.08 + G.time * 3) * 2);
  ctx.lineTo(x1, top); ctx.lineTo(x1, bottom); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = Math.min(1, alpha + 0.2); ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.lineWidth = 1.5; ctx.beginPath();
  for (let x = x0; x <= x1; x += 6) { const y = top + Math.sin(x * 0.08 + G.time * 3) * 2; x === x0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
  ctx.stroke(); ctx.restore();
}
function bigText(text, x, y, size, color) { ctx.font = "700 " + size + "px Cinzel, Georgia, serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = color; ctx.fillText(text, x, y); }
function gauge(x, y, h, frac, color, name) {
  ctx.fillStyle = "rgba(12,10,18,0.7)"; rr(x - 7, y, 14, h, 4); ctx.fill();
  ctx.fillStyle = color; rr(x - 5, y + 2 + (h - 4) * (1 - frac), 10, (h - 4) * frac, 3); ctx.fill();
  label(name, x, y + h + 14, "#f4ecd8", 9);
}
function roomDrawBack(r) { if (r.impl.drawBack) r.impl.drawBack(r); }
function roomDrawFront(r) {
  const st = r.st;
  for (const s of st.slots || []) drawSlot(s);
  for (const lv of st.levers || []) if (!lv.hidden) drawLever(lv);
  if (r.impl.drawFront) r.impl.drawFront(r);
  for (const it of st.items || []) if (it !== G.carry) drawRoomItem(it);
}
function drawCarried() { if (G.carry) drawRoomItem(G.carry); }

/* ---------- the nine rooms ----------
   Each room is randomised per attempt (positions, patients, scenarios) so it tests the concept, not memory. */
const pickN = (arr, n) => shuffle(arr.slice()).slice(0, n);
const leverOn = (r, id) => { const l = r.st.levers.find(x => x.id === id); return !!(l && l.on); };
function roomBlock(r, col, row, w) { for (let k = 0; k < w; k++) G.tiles[row * G.W + r.c0 + col + k] = 2; markDirty(r.c0 + col); }

const ROOM_IMPL = {
  /* PCOS: only three levers can be powered; build six SHBG chains */
  s1: {
    setup(r) { r.chains = []; for (let k = 0; k < 6; k++) { const p = { x: r.x0 + (5 + k) * RT, y: FL, w: RT, kind: "chain", alive: false, hidden: true, x0: r.x0 + (5 + k) * RT, y0: FL, t: 0, dx: 0 }; G.plats.push(p); r.chains.push(p); } },
    defs: { met: ["Metformin", 2, "Metformin lowers hepatic glucose output and insulin: the liver forges more SHBG."], life: ["Diet & exercise", 2, "Weight loss improves insulin sensitivity: insulin falls and SHBG rises."], cocp: ["COCP (oestrogen)", 3, "Oestrogen drives hepatic SHBG production strongly: free testosterone falls."], sugar: ["Sugar binge", -2, "Sugar spikes insulin, which suppresses SHBG."], spiro: ["Spironolactone", 0, "It blocks androgen receptors but doesn't change SHBG. No chains."], pred: ["Prednisolone", -1, "Steroids worsen insulin resistance: fewer chains."] },
    init(r) {
      r.chains.forEach(c => c.alive = false);
      const spots = shuffle([[0, FL], [2, FL], [4, FL], [1, (GR - 3) * RT], [3, (GR - 3) * RT], [4, (GR - 5) * RT]]);
      const levers = Object.keys(this.defs).map((id, k) => { const [c, y] = spots[k]; const lv = lever(id, this.defs[id][0], RX(r, c), y); if (id === "sugar") lv.on = true; return lv; });
      return { levers, items: [], slots: [], chainsShown: 0, ogres: Array.from({ length: 8 }, (_, k) => ({ x: RX(r, 5 + (k % 6)), ph: k * 1.3, k })) };
    },
    count(r) { return r.st.levers.filter(l => l.on).length; },
    chains(r) { let n = 0; for (const l of r.st.levers) if (l.on) n += this.defs[l.id][1]; return clamp(n, 0, 6); },
    lever(r, lv) {
      if (lv.on && this.count(r) > 3) { lv.on = false; toast("Only three levers can be powered at once. Choose the three that raise SHBG most.", "bad"); return; }
      toast((lv.on ? "" : "Off: ") + this.defs[lv.id][2], lv.on ? (this.defs[lv.id][1] > 0 ? "good" : this.defs[lv.id][1] < 0 ? "bad" : null) : null, 5000);
    },
    update(r, dt) {
      const st = r.st, n = this.chains(r);
      st.chainsShown += (n - st.chainsShown) * Math.min(1, dt * 4);
      r.chains.forEach((c, k) => c.alive = k < Math.round(st.chainsShown - 0.2));
      if (n >= 6 && st.chainsShown > 5.8) solveRoom(r);
    },
    status(r) { return "SHBG chains " + this.chains(r) + " of 6 · Levers powered " + this.count(r) + " of 3"; },
    drawBack(r) {
      const st = r.st, x0 = r.x0 - 10, x1 = RX(r, 4) + 6, n = st.chainsShown;
      ctx.fillStyle = "#6e2a2a"; rr(x0, 110, x1 - x0, FL - 110, 18); ctx.fill();
      ctx.fillStyle = "#5a2020"; for (let x = x0 + 6; x < x1 - 10; x += 22) ctx.fillRect(x, 98, 12, 16);
      bigText("LIVER", (x0 + x1) / 2, 128, 20, "#ffd9c8");
      ctx.fillStyle = "rgba(255,170,80," + (0.2 + n / 8) + ")"; rr(x1 - 26, 210, 24, 34, 6); ctx.fill();
      drawLiquid(RX(r, 5) - 16, RX(r, 10) + 16, FL + 8 + n * 12, ROWS * RT, "#e8b931", 0.75);
      const gx = RX(r, 12);
      ctx.fillStyle = "rgba(12,10,18,0.55)"; rr(gx - 22, 110, 120, 120, 10); ctx.fill();
      gauge(gx + 10, 124, 80, n / 6, "#cfd6e6", "SHBG");
      gauge(gx + 62, 124, 80, 1 - n / 6, "#c77dff", "Free T");
    },
    drawFront(r) {
      const n = r.st.chainsShown, free = Math.round((6 - n) * 8 / 6);
      for (const c of r.chains) if (c.alive) for (let k = 0; k < 3; k++) { ctx.strokeStyle = "#cfd6e6"; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(c.x + 6 + k * 10, c.y + 5, 6, 4, 0, 0, 6.283); ctx.stroke(); }
      for (const o of r.st.ogres) {
        const isFree = o.k < free, x = isFree ? o.x + Math.sin(G.time * 1.5 + o.ph) * 20 : r.x0 + 40 + o.k * 9, y = isFree ? FL - 30 - Math.abs(Math.sin(G.time * 3 + o.ph)) * 30 : FL - 14;
        if (!isFree) { ctx.strokeStyle = "#cfd6e6"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(RX(r, 4), 230); ctx.stroke(); }
        ctx.fillStyle = isFree ? "#c77dff" : "#6a4a7a"; ctx.beginPath(); ctx.arc(x, y, 8, 0, 6.283); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.fillRect(x - 4, y - 2, 2.5, 2.5); ctx.fillRect(x + 2, y - 2, 2.5, 2.5);
      }
    }
  },

  /* OHSS: seal the leak (trigger + freeze-all), support the circulation (IV fluids, not diuretics), prevent clots (LMWH) */
  s2: {
    init(r) {
      const st = { items: [item("gnrh", "GnRH agonist", "crystal", "#8fd3ff", RX(r, 0), FL), item("hcg", "hCG", "bolt", "#ffd34d", RX(r, 2), FL), item("nsaid", "Ibuprofen", "pill", "#f4ecd8", RX(r, 1), (GR - 3) * RT), item("lmwh", "Enoxaparin 40 mg", "syringe", "#8fd3ff", RX(r, 3), (GR - 3) * RT)],
        slots: [slot("altar", "Trigger altar", RX(r, 2), FL), slot("vein", "Vein port", RX(r, 2), (GR - 3) * RT)],
        levers: shuffle([lever("freeze", "Freeze all embryos", 0, 0), lever("iv", "IV crystalloid", 0, 0), lever("diur", "Furosemide", 0, 0, { spring: true })]),
        fluid: 298, hct: 0.5, sludge: 0, lmwh: false, drops: [] };
      st.levers.forEach((l, k) => { const [c, y] = [[4, (GR - 3) * RT], [5, FL], [6, (GR - 3) * RT]][k]; l.x = RX(r, c); l.y = y; });
      putIn(st.items[1], st.slots[0]);
      return st;
    },
    leak(r) { const a = r.st.slots[0].item; return !a ? 0.6 : a.id === "hcg" ? 1 : leverOn(r, "freeze") ? 0 : 0.4; },
    lever(r, lv) {
      if (lv.id === "diur") { r.st.sludge = 2.6; roomSlip("Furosemide pulls more water from already-dry vessels: the blood thickens, clots and the kidneys fail. Never diuretics in OHSS."); }
      if (lv.id === "freeze" && lv.on) toast("Freeze-all: no fresh transfer, so no pregnancy hCG to restart the leak (late OHSS).", "good", 5000);
      if (lv.id === "iv") toast(lv.on ? "IV crystalloid supports the intravascular volume: the haematocrit falls." : "IV fluids stopped.", lv.on ? "good" : null);
    },
    place(r, s, it) {
      if (s.id === "altar") {
        if (it.id === "hcg") toast("hCG trigger: the lightning cracks the vessels again (VEGF).", "bad");
        else if (it.id === "gnrh") toast("GnRH agonist trigger: a short LH surge and far less VEGF.", "good");
        else { toast("That isn't a trigger."); return false; }
        return true;
      }
      if (it.id === "lmwh") { r.st.lmwh = true; toast("LMWH: haemoconcentration makes OHSS a big VTE risk.", "good"); return true; }
      if (it.id === "nsaid") { roomSlip("No NSAIDs in OHSS: they add renal injury in a fluid-depleted patient."); return false; }
      toast("That doesn't go in a vein."); return false;
    },
    update(r, dt) {
      const st = r.st, leak = this.leak(r), iv = leverOn(r, "iv");
      const hctT = 0.4 + 0.07 * leak + (iv ? 0 : 0.04) + (st.sludge > 0 ? 0.1 : 0);
      st.hct += (hctT - st.hct) * Math.min(1, dt * 1.2);
      const target = leak >= 1 ? 298 : leak >= 0.6 ? 310 : leak > 0 ? 322 : iv ? 380 : 336;
      st.fluid += (target - st.fluid) * Math.min(1, dt * 0.8);
      st.sludge = Math.max(0, st.sludge - dt);
      if (leak > 0 && Math.random() < dt * 10 * leak) st.drops.push({ x: RX(r, 8 + Math.floor(Math.random() * 4)), y: 104, vy: 0 });
      for (const d of st.drops) { d.vy += 600 * dt; d.y += d.vy * dt; }
      st.drops = st.drops.filter(d => d.y < st.fluid);
      const p = G.player;
      if (p.x + p.w > RX(r, 8) - 16 && p.x < RX(r, 11) + 16 && p.y + p.h > st.fluid + 8) roomPushBack(r, "The ascites is too deep to wade through.");
      if (leak === 0 && iv && st.lmwh && st.fluid > 372 && st.hct < 0.44) solveRoom(r);
    },
    status(r) { const a = r.st.slots[0].item, st = r.st; return "Trigger " + (a ? a.label : "none") + " · Embryos " + (leverOn(r, "freeze") ? "frozen" : "fresh") + " · Hct " + st.hct.toFixed(2) + " · IV " + (leverOn(r, "iv") ? "on" : "off") + " · LMWH " + (st.lmwh ? "given" : "not given"); },
    drawBack(r) {
      const st = r.st, sl = st.sludge > 0, leak = this.leak(r);
      ctx.fillStyle = sl ? "#4a0d16" : st.hct > 0.45 ? "#8a2430" : "#b8323a"; rr(r.x0 - 10, 70, ROOM_W * RT + 20, 32, 14); ctx.fill();
      label("Blood vessel · Hct " + st.hct.toFixed(2) + (st.hct > 0.45 ? " (severe)" : ""), RX(r, 4), 64, st.hct > 0.45 ? "#ff8f80" : "#ffd9d9", 10);
      if (leak > 0) for (const x of [8, 9, 11]) { ctx.strokeStyle = "#ffe9a8"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(RX(r, x) - 6, 100); ctx.lineTo(RX(r, x), 92); ctx.lineTo(RX(r, x) + 4, 101); ctx.stroke(); }
      for (const d of st.drops) { ctx.fillStyle = "rgba(240,220,140,0.9)"; ctx.beginPath(); ctx.ellipse(d.x, d.y, 2.5, 4, 0, 0, 6.283); ctx.fill(); }
    },
    drawFront(r) { drawLiquid(RX(r, 8) - 16, RX(r, 11) + 16, r.st.fluid, (GR + 2) * RT, "#e8d28a", 0.75); label("Ascites", RX(r, 9) + 16, Math.min(r.st.fluid, (GR + 2) * RT) - 10, "#fff3c8", 10); }
  },

  /* Adenomyosis: the right treatment depends on who she is */
  s3: {
    profiles: [
      { who: "42, smoker, previous DVT, sterilised", right: "ius", why: { cocp: "COCP is contraindicated: previous VTE, and a smoker over 35.", txa: "Tranexamic acid needs caution after a DVT, and it won't treat adenomyosis.", hyst: "Try the least invasive effective option first: an LNG-IUS." } },
      { who: "36, migraine with aura, wants contraception", right: "ius", why: { cocp: "COCP is contraindicated with migraine with aura (stroke risk).", txa: "TXA reduces flow but doesn't treat adenomyosis or give contraception.", hyst: "She wants contraception and to keep her options: LNG-IUS first." } },
      { who: "46, family complete, LNG-IUS failed after 12 months, Hb 89", right: "hyst", why: { ius: "She has already failed an LNG-IUS: offer definitive surgery.", cocp: "A COCP won't fix adenomyosis that failed an LNG-IUS.", txa: "TXA won't treat adenomyosis that has failed an LNG-IUS." } }
    ],
    init(r) {
      const pr = this.profiles[Math.floor(Math.random() * this.profiles.length)];
      const spots = shuffle([[RX(r, 11) + 16, (GR - 6) * RT], [RX(r, 1), FL], [RX(r, 13) + 16, (GR - 3) * RT], [RX(r, 14) + 8, FL]]);
      const items = [["ius", "LNG-IUS (Mirena)", "T", "#e6f0ff"], ["cocp", "Combined pill", "pill", "#ffb3d9"], ["txa", "Tranexamic acid", "pill", "#f4ecd8"], ["hyst", "Hysterectomy consent", "vial", "#e0b25c"]].map((d, k) => item(d[0], d[1], d[2], d[3], spots[k][0], spots[k][1]));
      return { profile: pr, items, slots: [slot("cav", "Treatment", RX(r, 8), FL)], levers: [], src: [{ c: 5 }, { c: 7 }, { c: 10 }, { c: 6, deep: true }, { c: 9, deep: true }].map(s => ({ ...s, alive: true })), hb: 110, calm: 0, told: false, scorch: [] };
    },
    place(r, s, it) {
      const st = r.st;
      if (it.id === st.profile.right) { st.calm = 0.001; toast(it.id === "hyst" ? "Hysterectomy: definitive treatment for adenomyosis that failed medical therapy." : "The LNG-IUS releases progestogen into the cavity: surface and deep glands quieten.", "good", 5500); return true; }
      roomSlip(st.profile.why[it.id] || "Not the best choice for her."); return false;
    },
    onBreak(r, tx) {
      const c = tx - r.c0, st = r.st; st.scorch.push(c);
      const s = st.src.find(q => !q.deep && q.c === c && q.alive); if (s) s.alive = false;
      if (!st.told && st.src.every(q => q.deep || !q.alive)) { st.told = true; toast("Ablated the lining, but the deep glands still bleed: ablation reaches only a few millimetres.", "bad", 8000); }
    },
    update(r, dt) {
      const st = r.st;
      if (st.calm > 0) { st.calm += dt; if (st.calm > 1) st.src.forEach(s => s.alive = false); if (st.calm > 1.8) solveRoom(r); }
      st.hb -= st.src.filter(s => s.alive).length * 0.3 * dt;
      if (st.hb <= 70) { st.hb = 110; G.hearts--; renderHearts(); G.player.hflash = 1; toast("Hb 70: she needs a transfusion. Choose a treatment that suits her.", "bad", 6000); if (G.hearts <= 0) faint(); }
    },
    status(r) { const st = r.st; return "Patient: " + st.profile.who + " · Hb " + Math.round(st.hb) + " g/L"; },
    drawBack(r) { ctx.fillStyle = "rgba(255,180,190,0.12)"; ctx.beginPath(); ctx.ellipse(RX(r, 8), FL - 60, 220, 120, 0, Math.PI, 0); ctx.fill(); bigText("UTERUS", RX(r, 8), 130, 22, "rgba(255,210,220,0.35)"); label("Patient: " + r.st.profile.who, RX(r, 8), 96, "#ffe0ea", 11); },
    drawFront(r) { ROOM_DRAW.uterus(r); }
  },

  /* Ureter: stent the tube that wriggles, then clamp the artery close to the cervix (layout mirrors at random) */
  s4: {
    init(r) {
      const m = Math.random() < 0.5, mc = c => m ? ROOM_W - 1 - c : c, mx = x => m ? 2 * r.x0 + ROOM_W * RT - x : x;
      roomBlock(r, mc(3) - (m ? 1 : 0), GR - 3, 2); roomBlock(r, mc(7) - (m ? 1 : 0), GR - 4, 2); roomBlock(r, mc(11) - (m ? 1 : 0), GR - 3, 2);
      const ureterFirst = Math.random() < 0.5;
      const sites = [[3, GR - 3, "far"], [7, GR - 4, "mid"], [11, GR - 3, "near"]].map(([c, row, d]) => ({ x: mx(RX(r, c) + 16), y: row * RT, d }));
      const order = shuffle([0, 1, 2]);
      return { m, mx, ureterFirst,
        items: [item("clamp", "Clamp", "clamp", "#cfd6e6", mx(RX(r, 0)), FL), item("stent", "Ureteric stent", "syringe", "#8fd3ff", mx(RX(r, 2) + 8), FL)],
        slots: [slot("t1", "Tube 1", mx(RX(r, 4)), FL), slot("t2", "Tube 2", mx(RX(r, 6)), FL)].concat(order.map((i, k) => Object.assign(slot("c" + i, "Clamp site", sites[i].x, sites[i].y), { d: sites[i].d }))),
        levers: [], stented: false, dam: 0, damX: 0, kidney: 0, cut: 0 };
    },
    isUreter(r, sid) { return (sid === "t1") === r.st.ureterFirst; },
    place(r, s, it) {
      const st = r.st;
      if (it.id === "stent") {
        if (!s.id.startsWith("t")) { toast("The stent goes in a tube."); return false; }
        if (this.isUreter(r, s.id)) { st.stented = true; toast("Stented: this one wriggles. That's the ureter.", "good"); return true; }
        roomSlip("That tube is still: it's the ovarian vein. The ureter shows peristalsis (it wriggles)."); return false;
      }
      if (!s.id.startsWith("c")) { toast("The clamp goes on the artery."); return false; }
      if (!st.stented) { toast("Identify the ureter first: stent the tube that wriggles."); return false; }
      if (s.d === "near") { st.cut = 0.001; toast("Clamped hugging the cervix, clear of the ureter beneath.", "good"); return true; }
      st.dam = 2.4; st.damX = s.x; roomSlip("Too far from the cervix: the ureter runs right under the artery there. It dams and the kidney swells."); return true;
    },
    update(r, dt) {
      const st = r.st;
      if (st.dam > 0) { st.dam -= dt; st.kidney = Math.min(1, st.kidney + dt * 1.5); if (st.dam <= 0) sendHome(r, st.items[0]); }
      else st.kidney = Math.max(0, st.kidney - dt * 0.6);
      if (st.cut > 0) { st.cut += dt; if (st.cut > 1.4) solveRoom(r); }
    },
    status(r) { return r.st.stented ? (r.st.cut ? "Uterine artery secured" : "Ureter stented. Now clamp the uterine artery at the right spot.") : "Two blue tubes. Stent the ureter (watch which one wriggles), then clamp the artery."; },
    drawBack(r) {
      const st = r.st, mx = st.mx;
      const PU = [[RX(r, 1), 70], [RX(r, 2), 150], [RX(r, 4), 206], [RX(r, 7) + 16, 236], [RX(r, 10), 256], [RX(r, 14), 266]].map(q => [mx(q[0]), q[1]]);
      const PV = [[RX(r, 2) + 10, 20], [RX(r, 5), 120], [RX(r, 6) + 8, 200], [RX(r, 6), FL - 8]].map(q => [mx(q[0]), q[1]]);
      const P1 = st.ureterFirst ? PU : PV, P2 = st.ureterFirst ? PV : PU;
      const stroke = (P, col, w) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath(); P.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke(); };
      const pt = (P, s) => { const f = s * (P.length - 1), i = Math.min(P.length - 2, Math.floor(f)), u = f - i; return [P[i][0] + (P[i + 1][0] - P[i][0]) * u, P[i][1] + (P[i + 1][1] - P[i][1]) * u]; };
      // kidney at the top of the ureter
      const ks = 1 + st.kidney * 0.7; ctx.save(); ctx.translate(PU[0][0], PU[0][1] - 14); ctx.scale(ks, ks); ctx.fillStyle = st.kidney > 0.3 ? "#8a4a8a" : "#b5524a"; ctx.beginPath(); ctx.ellipse(0, 0, 14, 20, 0, 0, 6.283); ctx.fill(); ctx.restore();
      stroke(PV, "#4a6ab0", 8); stroke(PU, "#3a8fd8", 8);
      for (let k = 0; k < 4; k++) { const s = ((st.dam > 0 ? 0 : G.time * 0.22) + k / 4) % 1, q = pt(PU, s); if (st.dam > 0 && (st.m ? q[0] < st.damX : q[0] > st.damX)) continue; ctx.fillStyle = "#8fd3ff"; ctx.beginPath(); ctx.ellipse(q[0], q[1], 7, 6, 0, 0, 6.283); ctx.fill(); }
      label("Tube 1", P1[Math.floor(P1.length / 2)][0], P1[Math.floor(P1.length / 2)][1] - 14, "#cfe8ff", 9);
      label("Tube 2", P2[Math.floor(P2.length / 2)][0], P2[Math.floor(P2.length / 2)][1] - 14, "#cfe8ff", 9);
      for (const [sid, P] of [["t1", P1], ["t2", P2]]) { const sl = st.slots.find(x => x.id === sid); ctx.strokeStyle = "rgba(207,232,255,0.3)"; ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sl.x, sl.y - 30); const q = P[P.length - 2]; ctx.lineTo(q[0], q[1]); ctx.stroke(); ctx.setLineDash([]); }
      ctx.fillStyle = "#d9c56a"; ctx.beginPath(); ctx.ellipse(PU[PU.length - 1][0] + (st.m ? -12 : 12), 270, 20, 14, 0, 0, 6.283); ctx.fill();
      const B = [[RX(r, -1), 140], [RX(r, 3) + 16, 168], [RX(r, 7) + 16, 140], [RX(r, 11) + 16, 168], [RX(r, 13), 180]].map(q => [mx(q[0]), q[1]]);
      stroke(B, "#d83a3a", 9);
      label("Uterine artery", mx(RX(r, 5)), 104, "#ffd0d0", 10);
      const lift = st.cut > 0 ? Math.min(1, st.cut) : 0;
      ctx.save(); ctx.globalAlpha = 1 - lift; ctx.translate(mx(RX(r, 13) + 10), 196 - lift * 80); ctx.fillStyle = "#e88aa0"; ctx.beginPath(); ctx.ellipse(0, -14, 24, 30, 0, 0, 6.283); ctx.fill(); ctx.fillRect(-8, 10, 16, 18); ctx.restore();
      if (lift < 1) label("Uterus · cervix", mx(RX(r, 13) + 10), 118, "#ffe0ea", 9);
    }
  },

  /* VTE: prevention or treatment? Pick the right dose for the scenario */
  s5: {
    init(r) {
      const treat = Math.random() < 0.5;
      const spots = shuffle([[RX(r, 5) + 16, (GR - 3) * RT], [RX(r, 10) + 16, (GR - 4) * RT], [RX(r, 9), FL], [RX(r, 11) + 16, FL]]);
      const defs = [["proph", "Enoxaparin 40 mg daily", "syringe", "#8fd3ff"], ["treat", "Enoxaparin 1.5 mg/kg daily", "syringe", "#ff8f80"], ["asp", "Aspirin", "pill", "#f4ecd8"], ["stock", "Compression stockings", "sock", "#e8e4da"]];
      return { treat, items: defs.map((d, k) => item(d[0], d[1], d[2], d[3], spots[k][0], spots[k][1])),
        slots: [slot("leg", "Her legs", RX(r, 7), FL), slot("vein", "Vein port", RX(r, 13) + 8, FL)], levers: [lever("dd", "Order a D-dimer", RX(r, 4), FL, { spring: true })],
        run: 0, mob: false, stock: false, dose: null, clot: treat ? 1 : 0.15, belt: 0, grow: 0 };
    },
    lever(r, lv) { roomSlip(r.st.treat ? "The PE is already confirmed, and D-dimer is raised after any surgery anyway." : "D-dimer is no screening test after surgery: it's always raised."); },
    place(r, s, it) {
      const st = r.st;
      if (s.id === "leg") { if (it.id !== "stock") { toast("That doesn't go on her legs."); return false; } st.stock = true; toast("Stockings reduce venous stasis.", "good"); return true; }
      if (it.id === "asp") { roomSlip("Aspirin isn't adequate prophylaxis or treatment for VTE after major surgery."); return false; }
      if (it.id === "stock") { toast("That goes on her legs."); return false; }
      if (st.treat && it.id === "proph") { roomSlip("An established PE needs a treatment dose: 1 mg/kg twice daily or 1.5 mg/kg once daily."); return false; }
      if (!st.treat && it.id === "treat") { roomSlip("No clot yet: a treatment dose on day 0 only adds bleeding risk. Prophylaxis is enough."); return false; }
      st.dose = it.id; toast(st.treat ? "Treatment-dose LMWH: the clot stops growing and starts to resolve." : "Prophylactic LMWH: her sticky blood (FVL) is covered.", "good"); return true;
    },
    update(r, dt) {
      const st = r.st, p = G.player;
      st.belt += dt * 120;
      if (p.ground && p.x + p.w / 2 > r.x0 + RT && p.x + p.w / 2 < r.x0 + 4 * RT) { moveX(p, -200 * dt); if (!st.mob && keys.right) { st.run += dt; if (st.run >= 2.5) { st.mob = true; toast("Up and walking: the calf pump beats stasis.", "good"); } } }
      if (st.treat) { const target = st.dose ? (st.mob ? 0 : 0.4) : 1; st.clot += (target - st.clot) * Math.min(1, dt * 1.5); if (st.dose && st.mob && st.clot < 0.05) solveRoom(r); }
      else {
        const prevented = st.dose && st.stock && st.mob;
        if (prevented) { st.clot = Math.max(0, st.clot - dt * 0.5); if (st.clot <= 0.01) solveRoom(r); }
        else { st.clot += dt * 0.025 * (3 - (st.dose ? 1 : 0) - (st.stock ? 1 : 0) - (st.mob ? 1 : 0)); if (st.clot >= 1) { st.clot = 0.15; roomSlip("Too slow: a DVT formed and embolised. Cover all three: mobilise, stockings, LMWH."); } }
      }
    },
    status(r) { const st = r.st; return (st.treat ? "Day 2: PE confirmed on CTPA" : "Day 0 after surgery: heterozygous factor V Leiden, no clot yet") + " · Walking " + (st.mob ? "yes" : "no") + " · Stockings " + (st.stock ? "on" : "off") + " · LMWH " + (st.dose ? "given" : "none"); },
    drawBack(r) { ROOM_DRAW.virchow(r); },
    drawFront(r) { ROOM_DRAW.treadmill(r); ROOM_DRAW.clot(r, r.st.clot); }
  },

  /* Vasovagal: the order of actions matters */
  s6: {
    setup(r) { r.lift = { x: r.x0 + 12 * RT, y: FL - 4, w: 2 * RT, kind: "lift", alive: true, ay: FL - 4, by: (GR - 7) * RT, sp: 1.1, active: false, x0: r.x0 + 12 * RT, y0: FL - 4, t: 0, dx: 0, dy: 0 }; G.plats.push(r.lift); },
    init(r) {
      r.lift.active = false; r.lift.lt = 0; r.lift.y = r.lift.ay;
      const ls = shuffle([lever("help", "Call for help", 0, FL), lever("remove", "Remove instruments", 0, FL), lever("legs", "Lie flat, legs up", 0, FL), lever("sit", "Sit her up", 0, FL, { spring: true })]);
      ls.forEach((l, k) => l.x = RX(r, [1, 3, 5, 7][k]));
      return { levers: ls, items: shuffle([item("atro", "Atropine 600 mcg IV", "vial", "#7fd69a", RX(r, 7) + 16, (GR - 3) * RT), item("adr", "Adrenaline 1 mg IV", "vial", "#ff8f80", RX(r, 9), FL)]), slots: [slot("iv", "IV line", RX(r, 11), FL)], atro: false, hr: 40, dip: 0, beat: 0 };
    },
    target(r) { return Math.min(90, 40 + (leverOn(r, "remove") ? 8 : 0) + (leverOn(r, "legs") ? 8 : 0) + (r.st.atro ? 25 : 0) - (r.st.dip > 0 ? 12 : 0)); },
    lever(r, lv) {
      if (lv.id === "help" && lv.on) toast("Help is on the way (DRSABCD: send for help early).", "good");
      if (lv.id === "remove") toast(lv.on ? "Stimulus removed: the vagal brake eases a little." : "Instruments back in.", lv.on ? "good" : "bad");
      if (lv.id === "legs") toast(lv.on ? "Flat, legs raised: venous return improves." : "Legs down.", lv.on ? "good" : null);
      if (lv.id === "sit") { r.st.dip = 2; roomSlip("Sitting her up pools blood in the legs and deepens the faint."); }
    },
    place(r, s, it) {
      if (it.id === "adr") { roomSlip("IV adrenaline isn't for a vasovagal episode and risks arrhythmia. Adrenaline 0.5 mg IM is for anaphylaxis."); return false; }
      if (!(leverOn(r, "help") && leverOn(r, "remove") && leverOn(r, "legs"))) { roomSlip("Simple measures first: call for help, remove the instruments, lie her flat with legs up. Atropine is for bradycardia that persists."); return false; }
      r.st.atro = true; toast("Atropine blocks the vagus: the brake releases.", "good"); return true;
    },
    update(r, dt) { const st = r.st; st.dip = Math.max(0, st.dip - dt); st.hr += (this.target(r) - st.hr) * Math.min(1, dt * 1.5); st.beat += dt * st.hr / 60; if (st.hr >= 70 && !r.lift.active) { r.lift.active = true; solveRoom(r); } },
    status(r) { return "Heart rate " + Math.round(r.st.hr) + " bpm · Help " + (leverOn(r, "help") ? "called" : "not called") + " · Instruments " + (leverOn(r, "remove") ? "out" : "in") + " · Position " + (leverOn(r, "legs") ? "flat, legs up" : "unchanged"); },
    drawBack(r) { ROOM_DRAW.heart(r); }
  },

  /* Torsion: read the twist, turn the other way, then decide what to do with a dusky ovary */
  s7: {
    setup(r) { r.lift = { x: r.x0 + 11 * RT, y: FL - 4, w: 2 * RT, kind: "lift", alive: false, hidden: true, ay: FL - 4, by: (GR - 7) * RT, sp: 1, active: false, x0: r.x0 + 11 * RT, y0: FL - 4, t: 0, dx: 0, dy: 0 }; G.plats.push(r.lift); },
    init(r) {
      r.lift.alive = false; r.lift.active = false; r.lift.y = r.lift.ay; r.lift.lt = 0;
      const sense = Math.random() < 0.5 ? 1 : -1;
      const ls = shuffle([lever("ccw", "Turn ⟲", 0, FL, { spring: true }), lever("cw", "Turn ⟳", 0, FL, { spring: true }), lever("dop", "Doppler normal: discharge", 0, FL, { spring: true })]);
      ls.forEach((l, k) => l.x = RX(r, [2, 5, 8][k]));
      ls.push(lever("keep", "Conserve the ovary", RX(r, 3), FL, { hidden: true }), lever("rem", "Remove the ovary", RX(r, 6), FL, { hidden: true, spring: true }));
      return { levers: ls, items: [], slots: [], sense, twist: 2 + (Math.random() < 0.5 ? 1 : 0), shown: 2, decided: false };
    },
    lever(r, lv) {
      const st = r.st;
      if (lv.id === "dop") { roomSlip("Normal Doppler doesn't exclude torsion: venous flow stops first and the artery can still pulse. She needs surgery."); return; }
      if (lv.id === "keep") { st.decided = true; r.lift.alive = true; r.lift.active = true; toast("Conserved. A dusky ovary usually recovers after detorsion.", "good", 5000); solveRoom(r); return; }
      if (lv.id === "rem") { roomSlip("Don't remove it for looking dusky: most recover after detorsion. Conserve it."); return; }
      const dir = lv.id === "cw" ? 1 : -1;
      if (dir === st.sense) { st.twist++; if (st.twist >= 5) { roomSlip("Twisted further the same way: the veins clamp shut and it dies. Turn against the twist."); st.twist = 3; } else toast("Tighter! You're turning the same way it's twisted.", "bad"); }
      else { st.twist--; toast(st.twist > 0 ? "One turn undone." : "Untwisted. It's still dusky. What now?", "good"); }
      if (st.twist <= 0) { st.twist = 0; st.levers.forEach(l => { if (l.id === "keep" || l.id === "rem") l.hidden = false; if (["cw", "ccw", "dop"].includes(l.id)) l.hidden = true; }); }
    },
    update(r, dt) { r.st.shown += ((r.st.decided ? -0.6 : r.st.twist) - r.st.shown) * Math.min(1, dt * 2); },
    status(r) { const st = r.st; return st.twist ? "Twisted " + (st.sense > 0 ? "clockwise ⟳" : "anticlockwise ⟲") + " · " + st.twist + " turns · Doppler: flow present" : "Untwisted. The ovary looks dusky. Decide."; },
    drawBack(r) { ROOM_DRAW.ovary(r); }
  },

  /* Glycine: add up the fibroids, know the limits for this patient, choose the medium, or stage it */
  s8: {
    init(r) {
      const keep = r.keep; r.keep = null;
      const sc = keep || (() => {
        const kind = ["gly", "sal", "sal", "stage"][Math.floor(Math.random() * 4)];
        const frail = kind === "stage" ? true : Math.random() < 0.5;
        const lim = frail ? { gly: 750, sal: 1500 } : { gly: 1000, sal: 2500 };
        let d;
        for (let tries = 0; tries < 200; tries++) {
          d = [0, 0, 0].map(() => 250 + 50 * Math.floor(Math.random() * (kind === "stage" ? 8 : 6)));
          const t = d[0] + d[1] + d[2];
          if (kind === "gly" && t <= lim.gly) break;
          if (kind === "sal" && t > lim.gly && t <= lim.sal) break;
          if (kind === "stage" && t > lim.sal) break;
        }
        return { kind, frail, lim, d, who: frail ? "78, heart failure (frail)" : "35, fit and well" };
      })();
      return { sc, levers: [lever("mode", "Glycine · monopolar", RX(r, 4), FL), lever("stage", "Stop and stage it", RX(r, 3) - 8, (GR - 3) * RT + 0, { spring: true })], items: [], slots: [], mode: "gly", cut: new Set(), def: 0, shown: 0, swell: 0, resetT: 0 };
    },
    limit(r) { return r.st.mode === "gly" ? r.st.sc.lim.gly : r.st.sc.lim.sal; },
    lever(r, lv) {
      const st = r.st;
      if (lv.id === "stage") {
        const total = st.sc.d.reduce((a, b) => a + b, 0);
        if (total > st.sc.lim.sal) { toast("Right call: stop safely below the limit and finish at a second procedure.", "good", 5000); solveRoom(r); }
        else roomSlip("You can finish safely today: total " + total + " mL is within the " + (total <= st.sc.lim.gly ? "glycine" : "saline") + " limit for her.");
        return;
      }
      if (st.cut.size > 0) { lv.on = !lv.on; toast("Choose the medium before you start cutting.", "bad"); return; }
      st.mode = lv.on ? "sal" : "gly"; lv.label = st.mode === "gly" ? "Glycine · monopolar" : "Saline · bipolar";
      toast((st.mode === "gly" ? "Glycine (hypotonic), monopolar" : "Saline (isotonic), bipolar") + ": limit " + this.limit(r) + " mL for her.", "good");
    },
    onBreak(r, tx) {
      const st = r.st, c = tx - r.c0, k = [6, 9, 12].indexOf(c);
      if (k < 0 || st.cut.has(c)) return;
      st.cut.add(c); st.def += st.sc.d[k];
      if (st.def > this.limit(r)) { st.swell = 1; st.resetT = 2.6; roomSlip("Deficit " + st.def + " mL is past her " + this.limit(r) + " mL limit: hyponatraemia and fluid overload. Add up the fibroids before you start."); }
      else if (st.cut.size === 3) solveRoom(r);
      else toast("Fibroid out. Deficit " + st.def + " of " + this.limit(r) + " mL.", "good");
    },
    update(r, dt) {
      const st = r.st; st.shown += (st.def - st.shown) * Math.min(1, dt * 3);
      if (st.resetT > 0) { st.resetT -= dt; if (st.resetT <= 0) { r.keep = st.sc; roomReset(r, true); toast("Same patient, same fibroids. Rethink."); } }
    },
    status(r) { const st = r.st; return "Patient " + st.sc.who + " · Limits: glycine " + st.sc.lim.gly + ", saline " + st.sc.lim.sal + " mL · Medium " + (st.mode === "gly" ? "glycine" : "saline") + " · Deficit " + st.def + " mL"; },
    drawBack(r) { ROOM_DRAW.tank(r, this.limit(r)); },
    drawFront(r) {
      r.st.sc.d.forEach((v, k) => {
        const tx = r.c0 + [6, 9, 12][k]; if (G.tiles[(GR - 1) * G.W + tx] !== 4 && G.tiles[(GR - 2) * G.W + tx] !== 4) return;
        const x = tx * RT + 16, y = FL - 32;
        ctx.fillStyle = "#e8dcc8"; ctx.beginPath(); ctx.arc(x, y, 18, 0, 6.283); ctx.fill();
        ctx.strokeStyle = "rgba(140,110,90,0.6)"; ctx.lineWidth = 1.5; for (let j = 1; j < 4; j++) { ctx.beginPath(); ctx.arc(x, y, j * 5, j, j + 4); ctx.stroke(); }
        label("≈" + v + " mL", x, y - 26, "#fff3e0", 10);
      });
    }
  },

  /* Tamoxifen: avoid CYP2D6 inhibitors, cool the flushes safely, then investigate bleeding */
  s9: {
    init(r) {
      const inhib = shuffle(["Paroxetine", "Fluoxetine", "Bupropion"]), safe = pickN(["Venlafaxine", "Desvenlafaxine", "Gabapentin", "Clonidine"], 1)[0];
      const spots = shuffle([[RX(r, 1), FL], [RX(r, 5), FL], [RX(r, 12), FL], [RX(r, 13) + 16, FL], [RX(r, 15), FL]]);
      const items = [item("tam", "Tamoxifen", "ore", "#c9a2ff", spots[0][0], spots[0][1]), item("jam", inhib[0], "pill", "#ff8f80", 0, 0), item("bad", inhib[1], "pill", "#ff8f80", spots[1][0], spots[1][1]),
        item("good", safe, "pill", "#7fd69a", spots[2][0], spots[2][1]), item("oest", "Systemic oestrogen", "vial", "#ffb3d9", spots[3][0], spots[3][1]), item("tib", "Tibolone", "pill", "#e0b25c", spots[4][0], spots[4][1])];
      const st = { items, slots: [slot("forge", "CYP2D6 forge", RX(r, 3), FL), slot("thermo", "Thermostat", RX(r, 6) + 16, (GR - 3) * RT)],
        levers: [lever("reassure", "Reassure: just tamoxifen", RX(r, 2), FL, { hidden: true, spring: true }), lever("hys", "Hysteroscopy + biopsy", RX(r, 4) + 10, FL, { hidden: true })], jetT: 0, bleed: false };
      putIn(items[1], st.slots[0]); items[1].home = { x: RX(r, 0), y: FL };
      return st;
    },
    state(r) { const f = r.st.slots[0].item, t = r.st.slots[1].item; const inhibited = !!((f && (f.id === "jam" || f.id === "bad")) || (t && (t.id === "jam" || t.id === "bad"))); return { inhibited, active: !!(f && f.id === "tam") && !inhibited, cooled: !!(t && ["good", "jam", "bad"].includes(t.id)) }; },
    place(r, s, it) {
      if (s.id === "thermo") {
        if (it.id === "oest") { roomSlip("No systemic oestrogen after breast cancer."); return false; }
        if (it.id === "tib") { roomSlip("Tibolone increased breast cancer recurrence (LIBERATE)."); return false; }
        if (it.id === "tam") { toast("Tamoxifen won't cool flushes; it often causes them."); return false; }
        if (it.id === "good") toast(it.label + " cools the flushes without blocking CYP2D6.", "good");
        else { const f = r.st.slots[0].item; if (f && f.id === "tam") roomSlip(it.label + " cools flushes but strongly inhibits CYP2D6: tamoxifen can't become endoxifen."); else toast(it.label + " is a strong CYP2D6 inhibitor.", "bad"); }
        return true;
      }
      if (it.id === "tam") { toast(this.state(r).inhibited ? "The forge is jammed by a CYP2D6 inhibitor." : "CYP2D6 converts tamoxifen to endoxifen.", this.state(r).inhibited ? "bad" : "good"); return true; }
      if (it.id === "jam" || it.id === "bad") { toast(it.label + " jams the CYP2D6 forge.", "bad"); return true; }
      toast("Only tamoxifen needs the forge."); return false;
    },
    lever(r, lv) {
      if (lv.id === "reassure") { roomSlip("Bleeding on tamoxifen must be investigated: it raises endometrial cancer risk 2–3 times."); return; }
      if (lv.id === "hys") { toast("Right: hysteroscopy and biopsy for bleeding on tamoxifen.", "good"); solveRoom(r); }
    },
    update(r, dt) {
      const st = r.st, S = this.state(r);
      st.jetT += dt; st.jetsOn = !S.cooled && (st.jetT % 2.4) < 1.2;
      const p = G.player;
      if (st.jetsOn && p.x + p.w > RX(r, 9) - 16 && p.x < RX(r, 11) + 16 && p.y + p.h > FL - 100) hurt(p.x + 60);
      if (S.active && S.cooled && !st.bleed) { st.bleed = true; st.levers.forEach(l => l.hidden = false); toast("Shield up. Months later she has vaginal bleeding. What do you do?", "bad", 6000); }
    },
    status(r) { const S = this.state(r); return r.st.bleed ? "She has bleeding on tamoxifen. Decide." : "Forge " + (S.inhibited ? "jammed" : S.active ? "making endoxifen" : "idle") + " · Flushes " + (S.cooled ? "cooled" : "raging") + " · Shield " + (S.active ? "up" : "down"); },
    drawBack(r) { ROOM_DRAW.statue(r, this.state(r)); },
    drawFront(r) { ROOM_DRAW.jets(r); }
  }
};

/* ---------- shared room art ---------- */
const ROOM_DRAW = {
  uterus(r) {
    const st = r.st, x0 = RX(r, 3) + 16, x1 = RX(r, 12) - 16;
    ctx.fillStyle = "rgba(120,40,40,0.55)"; ctx.fillRect(x0, FL + 10, x1 - x0, ROWS * RT - FL - 10);
    for (let c = 4; c <= 11; c++) if (G.tiles[GR * G.W + r.c0 + c] === 4) { ctx.fillStyle = "#f2a0b0"; ctx.fillRect(r.x0 + c * RT, FL, RT + 0.5, 8); }
    for (const c of st.scorch) { ctx.fillStyle = "#2a1414"; ctx.fillRect(r.x0 + c * RT + 2, FL + RT - 4, RT - 4, 4); }
    label("Endometrium (ablation depth)", RX(r, 2) + 8, FL - 8, "#ffd0da", 9);
    label("Myometrium: adenomyosis", RX(r, 2) + 8, FL + 52, "#ffd0da", 9);
    for (const s of st.src) {
      const x = RX(r, s.c), y = s.deep ? FL + 58 : FL + 4;
      if (s.deep) { const pul = 1 + 0.2 * Math.sin(G.time * 6 + s.c); ctx.fillStyle = s.alive ? "#ff3a4a" : "#6a2a32"; ctx.beginPath(); ctx.arc(x, y, 8 * pul, 0, 6.283); ctx.fill(); if (s.alive) glow(x, y, 22, "#ff3a4a", 0.5); }
      else if (s.alive) for (let k = 0; k < 4; k++) { const t = (G.time * 1.6 + k * 0.25) % 1; ctx.fillStyle = "#ff3a4a"; ctx.beginPath(); ctx.arc(x + (k - 1.5) * 4 * t * 3, y - 22 * Math.sin(t * Math.PI), 2.5, 0, 6.283); ctx.fill(); }
    }
    drawLiquid(r.x0, r.x1, FL - (110 - st.hb) / 40 * 22, FL + 1, "#c41e2a", 0.55);
  },
  virchow(r) {
    const st = r.st, A = [RX(r, 7), 30], Bv = [RX(r, 2), 108], Cv = [RX(r, 12) + 8, 108];
    ctx.strokeStyle = "rgba(255,220,200,0.5)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(Bv[0], Bv[1]); ctx.lineTo(Cv[0], Cv[1]); ctx.closePath(); ctx.stroke();
    const corner = (q, name, hot, below) => { ctx.fillStyle = hot ? "#ff4a5a" : "#7fd69a"; ctx.beginPath(); ctx.arc(q[0], q[1], 11, 0, 6.283); ctx.fill(); label(name, q[0], below ? q[1] + 28 : q[1] - 16, "#ffffff", 10); };
    corner(A, "Endothelial injury (surgery)", true, true); corner(Bv, "Stasis", !(st.mob && (st.treat || st.stock))); corner(Cv, "Hypercoagulability", !st.dose);
    bigText("VIRCHOW", RX(r, 7), 92, 16, "rgba(255,230,210,0.35)");
  },
  treadmill(r) {
    const st = r.st, x0 = r.x0 + RT, x1 = r.x0 + 4 * RT;
    ctx.fillStyle = "#3a3448"; rr(x0, FL - 6, x1 - x0, 8, 3); ctx.fill();
    ctx.fillStyle = "#6a6280"; for (let x = x0 + ((-st.belt) % 16 + 16) % 16; x < x1; x += 16) ctx.fillRect(x, FL - 5, 6, 3);
    label(st.mob ? "Mobilised" : "Treadmill: hold right to walk her", (x0 + x1) / 2, FL - 44, st.mob ? G.t.accent : "#f4ecd8", 9);
    if (!st.mob) { ctx.fillStyle = "rgba(12,10,18,0.7)"; rr(x0 + 10, FL - 30, x1 - x0 - 20, 6, 3); ctx.fill(); ctx.fillStyle = G.t.top; rr(x0 + 10, FL - 30, (x1 - x0 - 20) * st.run / 2.5, 6, 3); ctx.fill(); }
  },
  clot(r, s) {
    if (s < 0.03) return;
    const cx = RX(r, 15), cy = FL - 40 * s;
    ctx.fillStyle = "#6a0f1e"; for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.arc(cx + Math.cos(k) * 22 * s, cy + Math.sin(k * 1.7) * 18 * s, 22 * s, 0, 6.283); ctx.fill(); }
    ctx.fillStyle = "#ffcf6a"; ctx.fillRect(cx - 12 * s, cy - 4 * s, 5 * s, 5 * s); ctx.fillRect(cx + 6 * s, cy - 4 * s, 5 * s, 5 * s);
    label("Clot", cx, cy - 46 * s - 4, "#ffb0b8", 10);
  },
  heart(r) {
    const st = r.st, hx = RX(r, 7), hy = 120, ph = st.beat % 1, s = 1 + (ph < 0.15 ? Math.sin(ph / 0.15 * Math.PI) * 0.18 : 0);
    ctx.save(); ctx.translate(hx, hy); ctx.scale(s * 1.6, s * 1.6); ctx.fillStyle = st.hr < 55 ? "#a03040" : "#e0405a"; ctx.beginPath(); ctx.moveTo(0, 18); ctx.bezierCurveTo(-26, 0, -18, -20, 0, -8); ctx.bezierCurveTo(18, -20, 26, 0, 0, 18); ctx.fill(); ctx.restore();
    label("Heart " + Math.round(st.hr) + " bpm", hx, hy - 44, st.hr < 60 ? "#ff8f80" : "#c8ffd8", 12);
    const cx = RX(r, 0), cy = FL - 40, taut = !leverOn(r, "remove");
    ctx.fillStyle = "#e88aa0"; ctx.beginPath(); ctx.ellipse(cx, cy, 12, 16, 0, 0, 6.283); ctx.fill(); label("Cervix", cx, cy - 26, "#ffe0ea", 9);
    if (taut) { ctx.fillStyle = "#cfd6e6"; ctx.fillRect(cx - 2, cy - 4, 24, 5); }
    ctx.strokeStyle = st.atro ? "rgba(255,230,120,0.3)" : "#ffe678"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx, cy - 10);
    if (taut && !st.atro) ctx.lineTo(hx - 30, hy + 10); else ctx.quadraticCurveTo(cx + 40, cy + 30, hx - 30, hy + 10); ctx.stroke();
    label(st.atro ? "Vagus (blocked)" : "Vagus nerve: the brake", (cx + hx) / 2 - 10, (cy + hy) / 2 - 18, "#fff3b0", 9);
    const wx = r.x0 + 13 * RT, wy = 40;
    ctx.strokeStyle = "#8a8496"; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.lineDashOffset = r.lift.active ? -G.time * 40 : 0; ctx.beginPath(); ctx.moveTo(hx + 30, hy - 10); ctx.lineTo(wx, wy); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = "#6a6280"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(wx, wy + 12); ctx.lineTo(wx, r.lift.y); ctx.stroke();
    label(r.lift.active ? "Lift: powered" : "Lift: needs HR 70+", wx, wy - 22, r.lift.active ? "#c8ffd8" : "#f4ecd8", 9);
  },
  ovary(r) {
    const st = r.st, tw = Math.max(0, st.shown), ax = r.x0 + 12 * RT;
    const cols = ["#f2a7c3", "#d79ad0", "#a86bb8", "#6b3b7a", "#2a1430"], ci = clamp(Math.round(tw), 0, 4), rad = 24 + tw * 6;
    const by = r.lift.alive ? r.lift.y - rad - 10 : 120 + Math.sin(G.time * 1.4) * 4, top = by + rad, bot = r.lift.alive ? r.lift.y : FL - 4;
    if (!r.lift.alive) {
      ctx.fillStyle = "#5a4a5a"; rr(ax - 8, FL - 8, 16, 8, 3); ctx.fill();
      for (const off of [0, Math.PI]) { ctx.strokeStyle = off ? "#c84a5a" : "#5a7ad8"; ctx.lineWidth = 3; ctx.beginPath(); for (let y = top; y <= bot; y += 3) { const u = (y - top) / Math.max(1, bot - top), x = ax + Math.sin(st.sense * u * Math.PI * 2 * Math.max(0.3, st.twist) + off) * 6; y === top ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke(); }
      if (st.twist) bigText(st.sense > 0 ? "⟳" : "⟲", ax + 28, (top + bot) / 2, 22, "#ffe9a8");
      label("Pedicle: twisted " + (st.sense > 0 ? "clockwise" : "anticlockwise"), ax - 70, (top + bot) / 2, "#f4ecd8", 9);
    }
    const g = ctx.createRadialGradient(ax - rad * 0.3, by - rad * 0.3, 4, ax, by, rad); g.addColorStop(0, "#ffffff"); g.addColorStop(0.25, cols[ci]); g.addColorStop(1, cols[Math.min(4, ci + 1)]);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(ax, by, rad, rad * 0.86, 0, 0, 6.283); ctx.fill();
    label("Ovary", ax, by - rad - 8, "#ffe0f0", 10);
    if (r.lift.alive) { ctx.fillStyle = "#8a6a40"; rr(r.lift.x, r.lift.y, r.lift.w, 10, 3); ctx.fill(); }
    const dx = RX(r, 1) - 10, dy = 60;
    ctx.fillStyle = "#0e1a14"; rr(dx, dy, 120, 64, 6); ctx.fill(); ctx.strokeStyle = "#7fd69a"; ctx.lineWidth = 2; ctx.beginPath();
    for (let x = 0; x < 110; x += 2) { const ph = (x / 22 + G.time * 2) % 1, y = dy + 44 - (ph < 0.2 ? Math.sin(ph / 0.2 * Math.PI) * 24 : 2); x ? ctx.lineTo(dx + 5 + x, y) : ctx.moveTo(dx + 5, y); }
    ctx.stroke(); label("Doppler: arterial flow present", dx + 60, dy - 6, "#c8ffd8", 9);
  },
  tank(r, lim) {
    const st = r.st, x0 = RX(r, 0) - 14, x1 = RX(r, 2) + 14, top = 70, bot = FL - 8, H = bot - top;
    ctx.fillStyle = "rgba(200,240,255,0.08)"; rr(x0, top, x1 - x0, H, 8); ctx.fill(); ctx.strokeStyle = "rgba(200,240,255,0.5)"; ctx.lineWidth = 2; rr(x0, top, x1 - x0, H, 8); ctx.stroke();
    drawLiquid(x0 + 3, x1 - 3, bot - H * (1 - st.shown / 3000), bot - 2, st.mode === "gly" ? "#9fe8f0" : "#bfe0ff", 0.6);
    const ly = bot - H * (1 - lim / 3000);
    ctx.strokeStyle = "#ff4a5a"; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(x0 - 6, ly); ctx.lineTo(x1 + 6, ly); ctx.stroke(); ctx.setLineDash([]);
    label("Her limit: " + lim + " mL", (x0 + x1) / 2, ly - 6, "#ffb0b8", 9);
    const bx = RX(r, 7) + 16, by = 90, s = 1 + st.swell * 0.35;
    ctx.strokeStyle = "rgba(220,240,255,0.5)"; rr(bx - 34, by - 34, 68, 68, 10); ctx.stroke();
    ctx.save(); ctx.translate(bx, by); ctx.scale(s, s); ctx.fillStyle = "#f2b8c8"; for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.arc(Math.cos(k) * 9, Math.sin(k * 1.3) * 7, 11, 0, 6.283); ctx.fill(); } ctx.restore();
    label(st.swell > 0 ? "Brain swelling!" : "Patient: " + st.sc.who, bx, by - 44, st.swell > 0 ? "#ff8f80" : "#ffe0ea", 9);
  },
  statue(r, S) {
    const sx = RX(r, 9) + 16, sy = 120;
    ctx.fillStyle = "#8fb8e0"; ctx.beginPath(); ctx.arc(sx, sy, 46, Math.PI / 2, Math.PI * 1.5); ctx.fill();
    ctx.fillStyle = "#9ad08a"; ctx.beginPath(); ctx.arc(sx, sy, 46, -Math.PI / 2, Math.PI / 2); ctx.fill();
    ctx.fillStyle = "#1a1220"; ctx.fillRect(sx - 24, sy - 10, 8, 6); ctx.fillRect(sx + 16, sy - 10, 8, 6);
    ctx.fillStyle = S.active ? "rgba(143,211,255,0.85)" : "rgba(143,211,255,0.2)"; ctx.beginPath(); ctx.moveTo(sx - 62, sy - 14); ctx.lineTo(sx - 46, sy - 8); ctx.lineTo(sx - 46, sy + 14); ctx.lineTo(sx - 62, sy + 30); ctx.lineTo(sx - 70, sy + 10); ctx.closePath(); ctx.fill();
    label(S.active ? "Breast: shielded" : "Breast: unshielded", sx - 80, sy - 22, S.active ? "#cfe8ff" : "#ff8f80", 9);
    ctx.fillStyle = r.st.bleed ? "#c41e2a" : "#e88aa0"; ctx.beginPath(); ctx.ellipse(sx + 80, sy + 10, 14, 18, 0, 0, 6.283); ctx.fill();
    if (r.st.bleed) for (let k = 0; k < 3; k++) { ctx.fillStyle = "#ff3a4a"; ctx.beginPath(); ctx.arc(sx + 80 + (k - 1) * 5, sy + 30 + ((G.time * 40 + k * 10) % 30), 2.5, 0, 6.283); ctx.fill(); }
    label(r.st.bleed ? "Womb: bleeding" : "Womb: stimulated", sx + 80, sy - 18, r.st.bleed ? "#ff8f80" : "#d8ffc8", 9);
    bigText("TAMOXIFEN", sx, sy + 66, 13, "rgba(255,240,220,0.6)");
    const fx = RX(r, 3);
    ctx.fillStyle = "#5a3a30"; ctx.beginPath(); ctx.arc(fx, FL - 4, 30, Math.PI, 0); ctx.fill();
    ctx.fillStyle = S.inhibited ? "#3a3440" : S.active ? "rgba(255,180,60,0.95)" : "#6a4a40"; ctx.beginPath(); ctx.arc(fx, FL - 4, 14, Math.PI, 0); ctx.fill();
    if (S.active) { ctx.strokeStyle = "rgba(143,211,255,0.75)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(fx, FL - 34); ctx.lineTo(sx - 60, sy); ctx.stroke(); }
  },
  jets(r) {
    if (!r.st.jetsOn) { label("Hot-flush vents", RX(r, 10), FL - 18, "#ffd2a0", 9); return; }
    for (let c = 9; c <= 11; c++) { const x = RX(r, c); for (let k = 0; k < 5; k++) { const h = 60 + Math.sin(G.time * 20 + k + c) * 20; const g = ctx.createLinearGradient(0, FL - h, 0, FL); g.addColorStop(0, "rgba(255,200,60,0)"); g.addColorStop(1, "rgba(255,110,20,0.85)"); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 10 + k * 4, FL); ctx.quadraticCurveTo(x - 6 + k * 3, FL - h * 0.6, x - 4 + k * 3, FL - h); ctx.quadraticCurveTo(x + k * 2, FL - h * 0.5, x + 2 + k * 3, FL); ctx.fill(); } }
  }
};
