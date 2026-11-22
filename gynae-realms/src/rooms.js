/* ================= puzzle rooms =================
   One single-screen room per realm, placed after the chase. The camera locks and zooms so the whole room is visible.
   Press ↓ on the ground to pull a lever, pick up an item, or place a carried item in a slot.
   Each ROOM_IMPL: setup(r) once (extra platforms), init(r) -> state, lever(r, lv), place(r, slot, item) -> false to reject,
   take(r, slot, item), onBreak(r, tx, ty), update(r, dt), drawBack(r), drawFront(r), status(r). */
const ROOM_W = 16;
const RT = TILE, FL = GR * TILE;
const LEVELWORD = ["very low", "low", "moderate", "high", "very high"];

const ROOM_GEOM = {
  s1: { top: i => (i >= 5 && i <= 10) ? -1 : GR, blocks: [[1, GR - 3, 3]] },
  s2: { top: i => (i >= 4 && i <= 11) ? GR + 2 : GR, blocks: [[1, GR - 3, 3]] },
  s3: { blocks: [[13, GR - 3, 2], [11, GR - 6, 2]], cracked: [4, 5, 6, 7, 8, 9, 10, 11].map(x => [x, GR]) },
  s4: { blocks: [[3, GR - 3, 2], [7, GR - 4, 2], [11, GR - 3, 2]] },
  s5: { blocks: [[5, GR - 3, 2], [10, GR - 4, 2]] },
  s6: { top: i => i >= 14 ? GR - 7 : GR, blocks: [[7, GR - 3, 2]] },
  s7: { top: i => i >= 14 ? GR - 7 : GR },
  s8: { cracked: [[6, GR - 1], [6, GR - 2], [9, GR - 1], [9, GR - 2], [12, GR - 1], [12, GR - 2]] },
  s9: { blocks: [[6, GR - 3, 2]] }
};

/* ---------- framework ---------- */
function makeRoom(L, x0, x1) {
  const impl = ROOM_IMPL[L.id];
  const r = { id: L.id, impl, text: ROOMS[L.id], x0: x0 * TILE, x1: x1 * TILE, c0: x0, c1: x1, solved: false, entered: false, inside: false, cardText: "", cardT: 0 };
  r.snap = [];
  for (let y = 0; y < ROWS; y++) for (let x = x0; x < x1; x++) r.snap.push(G.tiles[y * G.W + x]);
  if (impl.setup) impl.setup(r);
  r.st = impl.init(r);
  return r;
}
const RX = (r, i) => r.x0 + i * RT + 16;  // centre of room column i
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
  const lv = (st.levers || []).filter(l => near(l, 26)).sort((a, b) => Math.abs(a.x - cx) - Math.abs(b.x - cx))[0];
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
  r.st = r.impl.init(r);
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
  for (const lv of st.levers || []) consider(lv.x, lv.y - 14, "↓ Lever: " + lv.label + (lv.on && !lv.spring ? " (on)" : ""));
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
  label(lv.label, lv.x, lv.y - 34, lv.on ? G.t.accent : "#f4ecd8", 9);
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
  if (it !== G.carry && !it.slot) label(it.label, q.x, q.y - 30, "#f4ecd8", 9);
}
function drawSlot(s) {
  ctx.fillStyle = "#4a4458"; rr(s.x - 14, s.y - 6, 28, 6, 2); ctx.fill();
  ctx.strokeStyle = s.item ? G.t.top : "rgba(255,240,200," + (0.4 + 0.3 * Math.sin(G.time * 4)) + ")"; ctx.lineWidth = 1.5;
  ctx.setLineDash(s.item ? [] : [4, 3]); rr(s.x - 13, s.y - 34, 26, 28, 5); ctx.stroke(); ctx.setLineDash([]);
  label(s.label, s.x, s.y - 40, s.item ? G.t.accent : "#f4ecd8", 9);
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
  for (const lv of st.levers || []) drawLever(lv);
  if (r.impl.drawFront) r.impl.drawFront(r);
  for (const it of st.items || []) if (it !== G.carry) drawRoomItem(it);
}
function drawCarried() { if (G.carry) drawRoomItem(G.carry); }

/* ---------- the nine rooms ---------- */
const ROOM_IMPL = {
  /* PCOS: insulin syrup stops the liver forging SHBG chains */
  s1: {
    setup(r) { r.chains = []; for (let k = 0; k < 6; k++) { const p = { x: r.x0 + (5 + k) * RT, y: FL, w: RT, kind: "chain", alive: false, hidden: true, x0: r.x0 + (5 + k) * RT, y0: FL, t: 0, dx: 0 }; G.plats.push(p); r.chains.push(p); } },
    init(r) {
      r.chains.forEach(c => c.alive = false);
      const sugar = lever("sugar", "Sugar binge", RX(r, 1), (GR - 3) * RT); sugar.on = true;
      return { levers: [lever("met", "Metformin", RX(r, 0), FL), sugar, lever("spiro", "Spironolactone", RX(r, 3), (GR - 3) * RT), lever("life", "Diet & exercise", RX(r, 3), FL)],
        items: [], slots: [], I: 4, Is: 4, forge: 0,
        ogres: Array.from({ length: 8 }, (_, k) => ({ x: RX(r, 5 + (k % 6)), ph: k * 1.3, k })) };
    },
    lever(r, lv) {
      const on = lv.on;
      if (lv.id === "met") toast(on ? "Metformin: the liver makes less glucose and insulin falls." : "Metformin stopped: insulin creeps back up.", on ? "good" : null);
      if (lv.id === "life") toast(on ? "Weight loss and exercise make her tissues insulin-sensitive: insulin falls." : "Old habits: insulin rises.", on ? "good" : null);
      if (lv.id === "sugar") toast(on ? "A sugar spike floods the liver with insulin: the SHBG forge stalls." : "No more sugar spikes.", on ? "bad" : "good");
      if (lv.id === "spiro") toast("Spironolactone blocks androgen receptors, but insulin and SHBG don't change. The ogres are still free.", null, 5500);
    },
    update(r, dt) {
      const st = r.st, on = id => st.levers.find(l => l.id === id).on ? 1 : 0;
      st.I = clamp(3 - on("met") - on("life") + on("sugar"), 0, 4);
      st.Is += (st.I - st.Is) * Math.min(1, dt * 2);
      if (st.I <= 1) { st.forge = Math.min(6, st.forge + dt * 5); }
      else if (!r.solved) st.forge = Math.max(0, st.forge - dt * 8);
      r.chains.forEach((c, k) => c.alive = k < Math.floor(st.forge));
      if (st.forge >= 6) solveRoom(r);
    },
    status(r) { const I = r.st.I; return "Insulin " + LEVELWORD[I] + " · SHBG chains " + (I <= 1 ? "forging" : "not made") + " · Free testosterone " + LEVELWORD[I]; },
    drawBack(r) {
      const st = r.st, x0 = r.x0 - 10, x1 = RX(r, 4) + 6;
      // the liver fortress
      ctx.fillStyle = "#6e2a2a"; rr(x0, 110, x1 - x0, FL - 110, 18); ctx.fill();
      ctx.fillStyle = "#5a2020"; for (let x = x0 + 6; x < x1 - 10; x += 22) ctx.fillRect(x, 98, 12, 16);
      ctx.fillStyle = "rgba(255,200,150,0.15)"; ctx.beginPath(); ctx.ellipse((x0 + x1) / 2, 170, 50, 24, 0, 0, 6.283); ctx.fill();
      bigText("LIVER", (x0 + x1) / 2, 128, 20, "#ffd9c8");
      const glow = st.I <= 1 ? 0.8 + 0.2 * Math.sin(G.time * 8) : 0.15;
      ctx.fillStyle = "rgba(255,170,80," + glow + ")"; rr(x1 - 26, 210, 24, 34, 6); ctx.fill();

      // insulin syrup in the pit
      const top = FL + 4 + (4 - st.Is) * 21;
      drawLiquid(RX(r, 5) - 16, RX(r, 10) + 16, top, ROWS * RT, "#e8b931", 0.8);
      if (top < ROWS * RT - 10) label("Insulin syrup", RX(r, 7) + 16, Math.min(top + 26, ROWS * RT - 6), "#3a2600", 10);
      // gauges
      const gx = RX(r, 12);
      ctx.fillStyle = "rgba(12,10,18,0.55)"; rr(gx - 22, 110, 120, 120, 10); ctx.fill();
      gauge(gx, 124, 80, st.Is / 4, "#e8b931", "Insulin");
      gauge(gx + 38, 124, 80, (4 - st.Is) / 4, "#cfd6e6", "SHBG");
      gauge(gx + 76, 124, 80, st.Is / 4, "#c77dff", "Free T");
    },
    drawFront(r) {
      const st = r.st, free = Math.round(st.Is * 2);
      // chain bridge
      for (const c of r.chains) if (c.alive) for (let k = 0; k < 3; k++) { ctx.strokeStyle = "#cfd6e6"; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(c.x + 6 + k * 10, c.y + 5, 6, 4, 0, 0, 6.283); ctx.stroke(); }
      // testosterone ogres: free ones bounce over the syrup, bound ones are chained to the liver
      for (const o of st.ogres) {
        const isFree = o.k < free;
        const x = isFree ? o.x + Math.sin(G.time * 1.5 + o.ph) * 20 : r.x0 + 40 + o.k * 9, y = isFree ? FL - 30 - Math.abs(Math.sin(G.time * 3 + o.ph)) * 30 : FL - 14;
        if (!isFree) { ctx.strokeStyle = "#cfd6e6"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(RX(r, 4), 230); ctx.stroke(); }
        ctx.fillStyle = isFree ? "#c77dff" : "#6a4a7a"; ctx.beginPath(); ctx.arc(x, y, 8, 0, 6.283); ctx.fill();
        ctx.fillStyle = "#e8dcc0"; ctx.beginPath(); ctx.moveTo(x - 6, y - 5); ctx.lineTo(x - 8, y - 12); ctx.lineTo(x - 3, y - 7); ctx.moveTo(x + 6, y - 5); ctx.lineTo(x + 8, y - 12); ctx.lineTo(x + 3, y - 7); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.fillRect(x - 4, y - 2, 2.5, 2.5); ctx.fillRect(x + 2, y - 2, 2.5, 2.5);
      }
      if (free > 0) label("Free testosterone", RX(r, 7) + 16, FL - 84, "#e8c9ff", 10);
    }
  },

  /* OHSS: hCG cracks the vessels, plasma floods the belly, blood thickens */
  s2: {
    init(r) {
      const st = { items: [item("gnrh", "GnRH agonist", "crystal", "#8fd3ff", RX(r, 0), FL), item("hcg", "hCG", "bolt", "#ffd34d", RX(r, 2), FL)],
        slots: [slot("altar", "Trigger altar", RX(r, 2), FL)],
        levers: [lever("diur", "Furosemide", RX(r, 3), (GR - 3) * RT, { spring: true }), lever("freeze", "Freeze all", RX(r, 1), (GR - 3) * RT)],
        fluid: 298, sludge: 0, drops: [] };
      putIn(st.items[1], st.slots[0]);
      return st;
    },
    leak(r) { const a = r.st.slots[0].item, f = r.st.levers[1].on; return !a ? 0.6 : a.id === "hcg" ? 1 : f ? 0 : 0.4; },
    lever(r, lv) {
      if (lv.id === "diur") { r.st.sludge = 2.6; roomSlip("Furosemide pulls more water out of already-dry vessels: the blood thickens (Hct over 0.55), clots and the kidneys fail. Never diuretics in OHSS."); }
      if (lv.id === "freeze") {
        const trig = r.st.slots[0].item;
        if (lv.on) toast(trig && trig.id === "hcg" ? "Freeze-all avoids pregnancy hCG, but the hCG trigger is still cracking the vessels." : "Freeze-all: no fresh transfer, so no pregnancy hCG to restart the leak (late OHSS).", "good", 5500);
      }
    },
    place(r, s, it) {
      if (it.id === "hcg") toast("hCG trigger: the lightning cracks the vessels again (VEGF).", "bad");
      else toast(r.st.levers[1].on ? "GnRH agonist trigger with freeze-all: the leak seals." : "GnRH agonist trigger: a short LH surge and far less VEGF. Now stop late OHSS from a pregnancy.", "good", 5500);
    },
    update(r, dt) {
      const st = r.st, leak = this.leak(r);
      const target = leak >= 1 ? 298 : leak >= 0.6 ? 310 : leak > 0 ? 322 : 380;
      st.fluid += (target - st.fluid) * Math.min(1, dt * (leak === 0 ? 0.9 : 0.6));
      st.sludge = Math.max(0, st.sludge - dt);
      if (leak > 0 && Math.random() < dt * 10 * leak) st.drops.push({ x: RX(r, 5 + Math.floor(Math.random() * 6)) + (Math.random() - 0.5) * 20, y: 104, vy: 0 });
      if (leak === 0 && st.fluid < 370 && Math.random() < dt * 12) st.drops.push({ x: RX(r, 5 + Math.floor(Math.random() * 6)), y: st.fluid, vy: -160, up: true });
      for (const d of st.drops) { d.vy += (d.up ? -200 : 600) * dt; d.y += d.vy * dt; }
      st.drops = st.drops.filter(d => d.up ? d.y > 100 : d.y < st.fluid);
      const p = G.player;
      if (p.x + p.w > RX(r, 4) - 16 && p.x < RX(r, 11) + 16 && p.y + p.h > st.fluid + 8) roomPushBack(r, "The ascites is too deep to wade through. Seal the leak.");
      if (leak === 0 && st.fluid > 372) solveRoom(r);
    },
    status(r) {
      const a = r.st.slots[0].item, leak = this.leak(r);
      return "Trigger: " + (a ? (a.id === "hcg" ? "hCG" : "GnRH agonist") : "none") + " · Embryos: " + (r.st.levers[1].on ? "frozen" : "fresh transfer") + " · Leak: " + (leak >= 1 ? "pouring" : leak > 0 ? "slow" : "sealed");
    },
    drawBack(r) {
      const st = r.st, sl = st.sludge > 0, leak = this.leak(r);
      const vcol = sl ? "#4a0d16" : "#b8323a";
      ctx.fillStyle = vcol; rr(r.x0 - 10, 70, ROOM_W * RT + 20, 32, 14); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(r.x0 - 4, 76, ROOM_W * RT + 8, 4);
      if (!sl) for (let i = 0; i < 14; i++) { const x = r.x0 + ((i * 47 + G.time * 60) % (ROOM_W * RT)); ctx.fillStyle = "#e05a62"; ctx.beginPath(); ctx.ellipse(x, 86, 6, 4, 0, 0, 6.283); ctx.fill(); }
      label(sl ? "Blood vessel: thick sludge, Hct 0.55" : "Blood vessel · Hct " + (leak >= 1 ? "0.48" : leak > 0 ? "0.46" : "0.40"), RX(r, 3), 64, sl ? "#ff8f80" : "#ffd9d9", 10);
      if (leak > 0) for (const x of [5, 7, 9, 10]) { ctx.strokeStyle = "#ffe9a8"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(RX(r, x) - 6, 100); ctx.lineTo(RX(r, x), 92); ctx.lineTo(RX(r, x) + 4, 101); ctx.stroke(); }
      if (leak > 0) label("VEGF cracks", RX(r, 8), 116, "#ffe9a8", 9);
      for (const d of st.drops) { ctx.fillStyle = "rgba(240,220,140,0.9)"; ctx.beginPath(); ctx.ellipse(d.x, d.y, 2.5, 4, 0, 0, 6.283); ctx.fill(); }
      const a = st.slots[0].item;
      if (a && a.id === "hcg" && Math.sin(G.time * 9) > 0.6) { ctx.strokeStyle = "#ffd34d"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(RX(r, 2) + 20, FL - 40); ctx.lineTo(RX(r, 4), 170); ctx.lineTo(RX(r, 3) + 20, 150); ctx.lineTo(RX(r, 5), 102); ctx.stroke(); }
    },
    drawFront(r) {
      const st = r.st;
      drawLiquid(RX(r, 4) - 16, RX(r, 11) + 16, st.fluid, (GR + 2) * RT, "#e8d28a", 0.75);
      label("Abdomen: ascites (third space)", RX(r, 7) + 16, Math.min(st.fluid, (GR + 2) * RT) - 10, "#fff3c8", 10);
    }
  },

  /* Adenomyosis: ablation burns the surface, the deep glands keep bleeding */
  s3: {
    init(r) {
      return { items: [item("ius", "LNG-IUS (Mirena)", "T", "#e6f0ff", RX(r, 11) + 16, (GR - 6) * RT)], slots: [slot("cav", "Uterine cavity", RX(r, 8), FL)], levers: [],
        src: [{ c: 5, deep: false }, { c: 7, deep: false }, { c: 10, deep: false }, { c: 6, deep: true }, { c: 9, deep: true }].map(s => ({ ...s, alive: true })),
        hb: 110, calm: 0, told: false, scorch: [] };
    },
    place(r, s, it) { if (it.id !== "ius") return false; r.st.calm = 0.001; toast("The LNG-IUS releases progestogen into the cavity: surface and deep glands quieten.", "good", 5500); },
    onBreak(r, tx, ty) {
      const c = tx - r.c0, st = r.st; st.scorch.push(c);
      const s = st.src.find(q => !q.deep && q.c === c && q.alive);
      if (s) { s.alive = false; toast("Ablated: that surface bleeder stops.", "good"); }
      if (!st.told && st.src.every(q => q.deep || !q.alive)) { st.told = true; toast("The deep glands are still bleeding. Ablation burns only the top few millimetres; adenomyosis is buried in the muscle.", "bad", 8000); }
    },
    update(r, dt) {
      const st = r.st;
      if (st.calm > 0) { st.calm += dt; if (st.calm > 1) st.src.forEach(s => s.alive = false); if (st.calm > 1.8) solveRoom(r); }
      const active = st.src.filter(s => s.alive).length;
      st.hb -= active * 0.32 * dt;
      if (st.hb <= 70) { st.hb = 110; G.hearts--; renderHearts(); G.player.hflash = 1; toast("Hb 70: she needs a transfusion. Find a treatment that reaches the deep glands.", "bad", 6000); if (G.hearts <= 0) faint(); }
    },
    status(r) { const st = r.st; return "Hb " + Math.round(st.hb) + " g/L · Bleeding: " + st.src.filter(s => s.alive && !s.deep).length + " surface, " + st.src.filter(s => s.alive && s.deep).length + " deep"; },
    drawBack(r) {
      ctx.fillStyle = "rgba(255,180,190,0.12)"; ctx.beginPath(); ctx.ellipse(RX(r, 8), FL - 60, 220, 120, 0, Math.PI, 0); ctx.fill();
      bigText("UTERUS", RX(r, 8), 130, 22, "rgba(255,210,220,0.35)");
    },
    drawFront(r) {
      const st = r.st, x0 = RX(r, 3) + 16, x1 = RX(r, 12) - 16;
      ctx.fillStyle = "rgba(120,40,40,0.55)"; ctx.fillRect(x0, FL + 10, x1 - x0, ROWS * RT - FL - 10);
      for (let c = 4; c <= 11; c++) if (G.tiles[GR * G.W + r.c0 + c] === 4) { ctx.fillStyle = "#f2a0b0"; ctx.fillRect(r.x0 + c * RT, FL, RT + 0.5, 8); }
      for (const c of st.scorch) { ctx.fillStyle = "#2a1414"; ctx.fillRect(r.x0 + c * RT + 2, FL + RT - 4, RT - 4, 4); }
      label("Endometrium: ablation depth", RX(r, 2) + 8, FL - 8, "#ffd0da", 9);
      label("Myometrium: adenomyosis", RX(r, 2) + 8, FL + 52, "#ffd0da", 9);
      for (const s of st.src) {
        const x = RX(r, s.c), y = s.deep ? FL + 58 : FL + 4;
        if (s.deep) { const pul = 1 + 0.2 * Math.sin(G.time * 6 + s.c); ctx.fillStyle = s.alive ? "#ff3a4a" : "#6a2a32"; ctx.beginPath(); ctx.arc(x, y, 8 * pul, 0, 6.283); ctx.fill(); if (s.alive) { ctx.fillStyle = "rgba(255,60,70,0.4)"; ctx.beginPath(); ctx.arc(x, y, 14 * pul, 0, 6.283); ctx.fill(); for (let k = 0; k < 3; k++) { const yy = y - ((G.time * 40 + k * 20) % 60); ctx.fillStyle = "#ff5a64"; ctx.beginPath(); ctx.arc(x + Math.sin(G.time * 3 + k) * 3, yy, 2.5, 0, 6.283); ctx.fill(); } } }
        else if (s.alive) { for (let k = 0; k < 4; k++) { const t = (G.time * 1.6 + k * 0.25) % 1; ctx.fillStyle = "#ff3a4a"; ctx.beginPath(); ctx.arc(x + (k - 1.5) * 4 * t * 3, y - 22 * Math.sin(t * Math.PI), 2.5, 0, 6.283); ctx.fill(); } }
      }
      const pool = (110 - st.hb) / 40 * 22;
      drawLiquid(r.x0, r.x1, FL - pool, FL + 1, "#c41e2a", 0.55);
    }
  },

  /* Ureter: water under the bridge */
  s4: {
    init(r) {
      return { items: [item("clamp", "Clamp", "clamp", "#cfd6e6", RX(r, 1), FL)],
        slots: [slot("A", "At the sidewall", RX(r, 3) + 16, (GR - 3) * RT), slot("B", "Over the river", RX(r, 7) + 16, (GR - 4) * RT), slot("C", "Hugging the cervix", RX(r, 11) + 16, (GR - 3) * RT)],
        levers: [], dam: 0, damX: 0, kidney: 0, cut: 0 };
    },
    place(r, s, it) {
      const st = r.st;
      if (s.id === "C") { st.cut = 0.001; toast("Clamped close to the cervix, 1.5–2 cm clear of the ureter.", "good", 5000); return true; }
      st.dam = 2.4; st.damX = s.x;
      roomSlip(s.id === "A" ? "Clamped out at the sidewall: the ureter runs right under there. The river dams and the kidney swells (hydronephrosis)." : "Clamped where the bridge crosses the river: the ureter is caught. The river dams and the kidney swells.");
      return true;
    },
    update(r, dt) {
      const st = r.st;
      if (st.dam > 0) { st.dam -= dt; st.kidney = Math.min(1, st.kidney + dt * 1.5); if (st.dam <= 0) { const it = st.items[0]; sendHome(r, it); } }
      else st.kidney = Math.max(0, st.kidney - dt * 0.6);
      if (st.cut > 0) { st.cut += dt; if (st.cut > 1.4) solveRoom(r); }
    },
    status(r) { return r.st.dam > 0 ? "Ureter dammed: kidney swelling" : r.st.cut > 0 ? "Uterine artery secured" : "Carry the clamp to a spot on the uterine artery. Watch which blue line wriggles."; },
    path(r) { return [[RX(r, 1), 66], [RX(r, 2), 150], [RX(r, 4), 206], [RX(r, 7) + 16, 236], [RX(r, 10), 256], [RX(r, 14), 266]]; },
    drawBack(r) {
      const st = r.st, P = this.path(r);
      // kidney
      const ks = 1 + st.kidney * 0.7;
      ctx.save(); ctx.translate(RX(r, 1) + 4, 52); ctx.scale(ks, ks);
      ctx.fillStyle = st.kidney > 0.3 ? "#8a4a8a" : "#b5524a"; ctx.beginPath(); ctx.ellipse(0, 0, 14, 20, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(8, 2, 5, 7, 0, 0, 6.283); ctx.fill(); ctx.restore();
      label(st.kidney > 0.3 ? "Kidney: hydronephrosis!" : "Kidney", RX(r, 1) + 30, 26, st.kidney > 0.3 ? "#ff8f80" : "#f4ecd8", 9);
      // ureter river with peristaltic waves (dry below a dam)
      const pt = s => { const f = s * (P.length - 1), i = Math.min(P.length - 2, Math.floor(f)), u = f - i; return [P[i][0] + (P[i + 1][0] - P[i][0]) * u, P[i][1] + (P[i + 1][1] - P[i][1]) * u]; };
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.strokeStyle = "#3a8fd8"; ctx.lineWidth = 8; ctx.beginPath(); P.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke();
      for (let k = 0; k < 4; k++) {
        const s = (((st.dam > 0 ? 0 : G.time * 0.22) + k / 4) % 1 + 1) % 1, q = pt(s);
        if (st.dam > 0 && q[0] > st.damX) continue;
        ctx.fillStyle = "#8fd3ff"; ctx.beginPath(); ctx.ellipse(q[0], q[1], 7, 6, 0, 0, 6.283); ctx.fill();
      }
      if (st.dam > 0) { ctx.strokeStyle = "#5a4a3a"; ctx.lineWidth = 8; ctx.beginPath(); P.forEach((q, i) => { if (q[0] > st.damX) ctx.lineTo(q[0], q[1]); else if (i === 0 || P[i + 1] && P[i + 1][0] > st.damX) ctx.moveTo(q[0], q[1]); }); ctx.stroke(); }
      label("Ureter: the wriggling river", RX(r, 5), 252, "#cfe8ff", 10);
      // bladder
      ctx.fillStyle = "#d9c56a"; ctx.beginPath(); ctx.ellipse(RX(r, 14) + 12, 270, 20, 14, 0, 0, 6.283); ctx.fill(); label("Bladder", RX(r, 14) + 12, 252, "#fff3c8", 9);
      // uterine artery: the bridge
      const B = [[r.x0 - 10, 140], [RX(r, 3) + 16, 168], [RX(r, 7) + 16, 140], [RX(r, 11) + 16, 168], [RX(r, 13), 180]];
      const lift = st.cut > 0 ? Math.min(1, st.cut) : 0;
      ctx.strokeStyle = "#d83a3a"; ctx.lineWidth = 9; ctx.beginPath(); B.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke();
      ctx.strokeStyle = "#ff8a80"; ctx.lineWidth = 2; ctx.beginPath(); B.forEach((q, i) => i ? ctx.lineTo(q[0], q[1] - 2) : ctx.moveTo(q[0], q[1] - 2)); ctx.stroke();
      label("Uterine artery: the bridge", RX(r, 5), 128, "#ffd0d0", 10);
      // uterus
      ctx.save(); ctx.globalAlpha = 1 - lift; ctx.translate(RX(r, 13) + 10, 196 - lift * 80);
      ctx.fillStyle = "#e88aa0"; ctx.beginPath(); ctx.ellipse(0, -14, 24, 30, 0, 0, 6.283); ctx.fill(); ctx.fillRect(-8, 10, 16, 18);
      ctx.restore();
      if (lift < 1) label("Uterus", RX(r, 13) + 10, 118 - lift * 80, "#ffe0ea", 9);
    }
  },

  /* VTE: Virchow's triangle */
  s5: {
    init(r) {
      return { items: [item("stock", "Compression stockings", "sock", "#e8e4da", RX(r, 5) + 16, (GR - 3) * RT), item("lmwh", "Enoxaparin (LMWH)", "syringe", "#8fd3ff", RX(r, 10) + 16, (GR - 4) * RT), item("asp", "Aspirin", "pill", "#f4ecd8", RX(r, 8), FL)],
        slots: [slot("leg", "Her legs", RX(r, 7), FL), slot("vein", "Vein port", RX(r, 12), FL)], levers: [],
        run: 0, mob: false, stock: false, lmwh: false, clot: 1, belt: 0 };
    },
    place(r, s, it) {
      const st = r.st;
      if (s.id === "leg") { if (it.id !== "stock") { toast("That doesn't go on her legs."); return false; } st.stock = true; toast("Compression squeezes the calf veins: less pooling (stasis).", "good"); return true; }
      if (it.id === "lmwh") { st.lmwh = true; toast("LMWH makes the blood less sticky (hypercoagulability).", "good"); return true; }
      if (it.id === "asp") { roomSlip("Aspirin isn't adequate VTE prophylaxis or treatment after major surgery. Use LMWH."); return false; }
      toast("That doesn't go in a vein."); return false;
    },
    update(r, dt) {
      const st = r.st, p = G.player;
      st.belt += dt * 120;
      if (p.ground && p.x + p.w / 2 > r.x0 + RT && p.x + p.w / 2 < r.x0 + 5 * RT) {
        moveX(p, -200 * dt);
        if (!st.mob && keys.right) { st.run += dt; if (st.run >= 2.5) { st.mob = true; toast("She's up and walking: the calf-muscle pump moves the blood (stasis beaten).", "good", 5000); } }
      }
      const fixes = (st.mob ? 1 : 0) + (st.stock ? 1 : 0) + (st.lmwh ? 1 : 0);
      st.clot += ((1 - fixes / 3) - st.clot) * Math.min(1, dt * 2);
      if (fixes === 3 && st.clot < 0.05) solveRoom(r);
    },
    status(r) { const st = r.st; return "Stasis: " + (st.mob ? "walking" : "bed-bound") + ", " + (st.stock ? "stockings on" : "no stockings") + " · Blood: " + (st.lmwh ? "LMWH on board" : "sticky (factor V Leiden)") + " · Injury: from surgery"; },
    drawBack(r) {
      const st = r.st, A = [RX(r, 7), 30], Bv = [RX(r, 2), 108], Cv = [RX(r, 12) + 8, 108];
      ctx.strokeStyle = "rgba(255,220,200,0.5)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(Bv[0], Bv[1]); ctx.lineTo(Cv[0], Cv[1]); ctx.closePath(); ctx.stroke();
      const corner = (q, name, hot, half, below) => {
        ctx.fillStyle = hot ? (half ? "#e0a050" : "#ff4a5a") : "#7fd69a"; ctx.beginPath(); ctx.arc(q[0], q[1], 11 + (hot ? Math.sin(G.time * 6) * 2 : 0), 0, 6.283); ctx.fill();
        label(name, q[0], below ? q[1] + 28 : q[1] - 16, "#ffffff", 10);
      };
      const stasisHot = !(st.mob && st.stock), half = st.mob !== st.stock;
      corner(A, "Endothelial injury (surgery)", true, true, true);
      corner(Bv, "Stasis", stasisHot, half);
      corner(Cv, "Hypercoagulability", !st.lmwh, false);
      bigText("VIRCHOW", RX(r, 7), 92, 16, "rgba(255,230,210,0.35)");
      // the leg
      ctx.fillStyle = "#e9bf98"; ctx.beginPath(); ctx.moveTo(RX(r, 6) + 4, 190); ctx.lineTo(RX(r, 7) + 6, 190); ctx.lineTo(RX(r, 7) + 2, FL - 30); ctx.lineTo(RX(r, 7) + 14, FL - 8); ctx.lineTo(RX(r, 6), FL - 8); ctx.closePath(); ctx.fill();
      if (st.stock) { ctx.fillStyle = "#e8e4da"; ctx.fillRect(RX(r, 6) + 2, 220, 26, FL - 230); }
      ctx.strokeStyle = "#5a7ad8"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(RX(r, 6) + 16, 194); ctx.quadraticCurveTo(RX(r, 6) + 10, 240, RX(r, 6) + 18, FL - 14); ctx.stroke();
    },
    drawFront(r) {
      const st = r.st, x0 = r.x0 + RT, x1 = r.x0 + 5 * RT;
      ctx.fillStyle = "#3a3448"; rr(x0, FL - 6, x1 - x0, 8, 3); ctx.fill();
      ctx.fillStyle = "#6a6280"; for (let x = x0 + ((-st.belt) % 16 + 16) % 16; x < x1; x += 16) ctx.fillRect(x, FL - 5, 6, 3);
      label(st.mob ? "Mobilised" : "Treadmill: hold right to walk her", (x0 + x1) / 2, FL - 44, st.mob ? G.t.accent : "#f4ecd8", 9);
      if (!st.mob) { ctx.fillStyle = "rgba(12,10,18,0.7)"; rr(x0 + 10, FL - 30, x1 - x0 - 20, 6, 3); ctx.fill(); ctx.fillStyle = G.t.top; rr(x0 + 10, FL - 30, (x1 - x0 - 20) * st.run / 2.5, 6, 3); ctx.fill(); }
      // the clot blocking the exit
      if (st.clot > 0.03) {
        const s = st.clot, cx = RX(r, 14) + 16, cy = FL - 40 * s;
        ctx.fillStyle = "#6a0f1e"; for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.arc(cx + Math.cos(k) * 22 * s, cy + Math.sin(k * 1.7) * 18 * s, 22 * s, 0, 6.283); ctx.fill(); }
        ctx.fillStyle = "#a01e2e"; ctx.beginPath(); ctx.arc(cx - 6 * s, cy - 8 * s, 12 * s, 0, 6.283); ctx.fill();
        ctx.fillStyle = "#ffcf6a"; ctx.fillRect(cx - 12 * s, cy - 4 * s, 5 * s, 5 * s); ctx.fillRect(cx + 6 * s, cy - 4 * s, 5 * s, 5 * s);
        label("Clot", cx, cy - 46 * s, "#ffb0b8", 10);
      }
    }
  },

  /* Vasovagal: the cervix is wired to a brake on the heart */
  s6: {
    setup(r) { r.lift = { x: r.x0 + 12 * RT, y: FL - 4, w: 2 * RT, kind: "lift", alive: true, ay: FL - 4, by: (GR - 7) * RT, sp: 1.1, active: false, x0: r.x0 + 12 * RT, y0: FL - 4, t: 0, dx: 0, dy: 0 }; G.plats.push(r.lift); },
    init(r) {
      r.lift.active = false; r.lift.lt = 0; r.lift.y = r.lift.ay;
      return { levers: [lever("remove", "Remove instruments", RX(r, 1), FL), lever("legs", "Lie flat, legs up", RX(r, 4), FL), lever("sit", "Sit her up", RX(r, 7), FL, { spring: true })],
        items: [item("atro", "Atropine 600 mcg IV", "vial", "#7fd69a", RX(r, 7) + 16, (GR - 3) * RT), item("adr", "Adrenaline 1 mg IV", "vial", "#ff8f80", RX(r, 9), FL)],
        slots: [slot("iv", "IV line", RX(r, 11), FL)], atro: false, hr: 40, dip: 0, beat: 0 };
    },
    target(r) { const st = r.st, on = id => st.levers.find(l => l.id === id).on ? 1 : 0; return Math.min(90, 40 + 10 * on("remove") + 10 * on("legs") + (st.atro ? 25 : 0) - (st.dip > 0 ? 12 : 0)); },
    lever(r, lv) {
      if (lv.id === "remove") toast(lv.on ? "Instruments out: the cervix stops pulling the vagal brake." : "Instruments back in: the brake tightens.", lv.on ? "good" : "bad");
      if (lv.id === "legs") toast(lv.on ? "Flat with legs raised: blood returns to the heart." : "Legs down.", lv.on ? "good" : null);
      if (lv.id === "sit") { r.st.dip = 2; roomSlip("Sitting her up pools blood in the legs: less returns to the heart and she faints deeper. Lie her flat, legs up."); }
    },
    place(r, s, it) {
      if (it.id === "atro") { r.st.atro = true; toast("Atropine blocks the vagus: the brake releases.", "good"); return true; }
      roomSlip("IV adrenaline isn't for a vasovagal faint and risks arrhythmia. Adrenaline 0.5 mg IM is for anaphylaxis."); return false;
    },
    update(r, dt) {
      const st = r.st; st.dip = Math.max(0, st.dip - dt);
      st.hr += (this.target(r) - st.hr) * Math.min(1, dt * 1.5);
      st.beat += dt * st.hr / 60;
      if (st.hr >= 70 && !r.lift.active) { r.lift.active = true; solveRoom(r); }
    },
    status(r) { const st = r.st, on = id => st.levers.find(l => l.id === id).on; return "Heart rate " + Math.round(st.hr) + " bpm · Stimulus " + (on("remove") ? "removed" : "on the cervix") + " · " + (on("legs") ? "Flat, legs up" : "Lying") + " · Atropine " + (st.atro ? "given" : "not given"); },
    drawBack(r) {
      const st = r.st, hx = RX(r, 7), hy = 120, beatPh = st.beat % 1, s = 1 + (beatPh < 0.15 ? Math.sin(beatPh / 0.15 * Math.PI) * 0.18 : 0);
      ctx.save(); ctx.translate(hx, hy); ctx.scale(s * 1.6, s * 1.6);
      ctx.fillStyle = st.hr < 55 ? "#a03040" : "#e0405a"; ctx.beginPath(); ctx.moveTo(0, 18); ctx.bezierCurveTo(-26, 0, -18, -20, 0, -8); ctx.bezierCurveTo(18, -20, 26, 0, 0, 18); ctx.fill();
      ctx.restore();
      label("Heart " + Math.round(st.hr) + " bpm", hx, hy - 44, st.hr < 60 ? "#ff8f80" : "#c8ffd8", 12);
      // vagus nerve from the cervix to a brake on the heart
      const cx = RX(r, 0), cy = FL - 40, taut = !st.levers[0].on;
      ctx.fillStyle = "#e88aa0"; ctx.beginPath(); ctx.ellipse(cx, cy, 12, 16, 0, 0, 6.283); ctx.fill(); label("Cervix", cx, cy - 26, "#ffe0ea", 9);
      if (taut) { ctx.fillStyle = "#cfd6e6"; ctx.fillRect(cx - 2, cy - 4, 24, 5); }
      ctx.strokeStyle = st.atro ? "rgba(255,230,120,0.3)" : "#ffe678"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx, cy - 10);
      if (taut && !st.atro) ctx.lineTo(hx - 30, hy + 10); else ctx.quadraticCurveTo(cx + 40, cy + 30, hx - 30, hy + 10);
      ctx.stroke();
      label(st.atro ? "Vagus (blocked)" : "Vagus nerve: the brake", (cx + hx) / 2 - 10, (cy + hy) / 2 - 18, "#fff3b0", 9);
      if (!st.atro) { ctx.fillStyle = "#8a8496"; rr(hx - 36, hy - 4, 14, 22, 3); ctx.fill(); }
      // belt to the lift wheel
      const wx = r.x0 + 13 * RT, wy = 40;
      ctx.strokeStyle = "#8a8496"; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.lineDashOffset = r.lift.active ? -G.time * 40 : 0; ctx.beginPath(); ctx.moveTo(hx + 30, hy - 10); ctx.lineTo(wx, wy); ctx.stroke(); ctx.setLineDash([]);
      ctx.save(); ctx.translate(wx, wy); ctx.rotate(r.lift.active ? G.time * 3 : 0); ctx.strokeStyle = "#cfc6dc"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 12, 0, 6.283); ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.moveTo(0, -12); ctx.lineTo(0, 12); ctx.stroke(); ctx.restore();
      ctx.strokeStyle = "#6a6280"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(wx, wy + 12); ctx.lineTo(wx, r.lift.y); ctx.stroke();
      label(r.lift.active ? "Lift: powered" : "Lift: needs HR 70+", wx, wy - 22, r.lift.active ? "#c8ffd8" : "#f4ecd8", 9);
      // patient position
      const lx = RX(r, 4), on = st.levers[1].on;
      ctx.strokeStyle = "#e9bf98"; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(lx - 22, FL - 58); ctx.lineTo(lx + 4, FL - 58); ctx.lineTo(lx + 18, on ? FL - 76 : FL - 58); ctx.stroke();
      ctx.fillStyle = "#e9bf98"; ctx.beginPath(); ctx.arc(lx - 26, FL - 60, 5, 0, 6.283); ctx.fill();
    }
  },

  /* Torsion: the balloon on a twisted string */
  s7: {
    setup(r) { r.lift = { x: r.x0 + 11 * RT, y: FL - 4, w: 2 * RT, kind: "lift", alive: false, hidden: true, ay: FL - 4, by: (GR - 7) * RT, sp: 1, active: false, x0: r.x0 + 11 * RT, y0: FL - 4, t: 0, dx: 0, dy: 0 }; G.plats.push(r.lift); },
    init(r) {
      r.lift.alive = false; r.lift.active = false; r.lift.y = r.lift.ay; r.lift.lt = 0;
      return { levers: [lever("ccw", "Turn ⟲", RX(r, 4), FL, { spring: true }), lever("cw", "Turn ⟳", RX(r, 7), FL, { spring: true })], items: [], slots: [], twist: 2, shown: 2, rise: 0 };
    },
    lever(r, lv) {
      const st = r.st;
      if (lv.id === "ccw") { st.twist--; toast(st.twist > 0 ? "One turn undone: the veins open a little and the ovary pinks up." : "Untwisted. Blood flows in and out again.", "good"); }
      else {
        st.twist++;
        if (st.twist >= 4) { roomSlip("Twisted further: the veins clamp shut, the ovary swells black and dies. Turn the other way."); st.twist = 2; }
        else toast("Tighter: the soft veins clamp before the artery, so the ovary swells and darkens.", "bad");
      }
      if (st.twist <= 0) { st.twist = 0; r.lift.alive = true; r.lift.active = true; solveRoom(r); }
    },
    update(r, dt) { const st = r.st; st.shown += (st.twist - st.shown) * Math.min(1, dt * 3); },
    status(r) { const t = r.st.twist; return "Twists: " + t + " · Ovary: " + ["pink and healthy", "dusky", "swollen and purple", "near-black"][Math.min(3, t)] + " · Doppler: flow present"; },
    drawBack(r) {
      const st = r.st, tw = st.shown, ax = r.x0 + 12 * RT;
      const cols = ["#f2a7c3", "#d79ad0", "#a86bb8", "#6b3b7a", "#2a1430"];
      const ci = clamp(Math.round(tw), 0, 4), rad = 24 + tw * 6;
      const by = r.lift.alive ? r.lift.y - rad - 10 : 120 + Math.sin(G.time * 1.4) * 4;
      // pedicle: twisted rope from the floor anchor
      const top = by + rad, bot = r.lift.alive ? r.lift.y : FL - 4;
      if (!r.lift.alive) {
        ctx.fillStyle = "#5a4a5a"; rr(ax - 8, FL - 8, 16, 8, 3); ctx.fill();
        for (const off of [0, Math.PI]) { ctx.strokeStyle = off ? "#c84a5a" : "#5a7ad8"; ctx.lineWidth = 3; ctx.beginPath(); for (let y = top; y <= bot; y += 3) { const u = (y - top) / Math.max(1, bot - top), x = ax + Math.sin(u * Math.PI * 2 * Math.max(0.3, tw) + off) * 6; y === top ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke(); }
        label("Pedicle: " + st.twist + " twist" + (st.twist === 1 ? "" : "s"), ax - 58, (top + bot) / 2, "#f4ecd8", 9);
      }
      const g = ctx.createRadialGradient(ax - rad * 0.3, by - rad * 0.3, 4, ax, by, rad); g.addColorStop(0, "#ffffff"); g.addColorStop(0.25, cols[ci]); g.addColorStop(1, cols[Math.min(4, ci + 1)]);
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(ax, by, rad, rad * 0.86, 0, 0, 6.283); ctx.fill();
      if (tw > 0.6) { ctx.strokeStyle = "rgba(40,10,40,0.6)"; ctx.lineWidth = 1.5; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(ax - rad * 0.6 + k * 10, by + rad * 0.5); ctx.quadraticCurveTo(ax - rad * 0.4 + k * 12, by, ax - rad * 0.5 + k * 14, by - rad * 0.5); ctx.stroke(); } }
      label("Ovary", ax, by - rad - 8, "#ffe0f0", 10);
      if (r.lift.alive) { ctx.strokeStyle = "#cfc6dc"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ax - 20, by + rad * 0.7); ctx.lineTo(r.lift.x + 4, r.lift.y); ctx.moveTo(ax + 20, by + rad * 0.7); ctx.lineTo(r.lift.x + r.lift.w - 4, r.lift.y); ctx.stroke(); ctx.fillStyle = "#8a6a40"; rr(r.lift.x, r.lift.y, r.lift.w, 10, 3); ctx.fill(); }
      // Doppler screen
      const dx = RX(r, 1) - 10, dy = 60;
      ctx.fillStyle = "#0e1a14"; rr(dx, dy, 120, 64, 6); ctx.fill(); ctx.strokeStyle = "#4a6a5a"; ctx.lineWidth = 2; rr(dx, dy, 120, 64, 6); ctx.stroke();
      ctx.strokeStyle = "#7fd69a"; ctx.lineWidth = 2; ctx.beginPath();
      for (let x = 0; x < 110; x += 2) { const ph = (x / 22 + G.time * 2) % 1, y = dy + 44 - (ph < 0.2 ? Math.sin(ph / 0.2 * Math.PI) * 24 : 2); x ? ctx.lineTo(dx + 5 + x, y) : ctx.moveTo(dx + 5, y); }
      ctx.stroke();
      label("Doppler: flow present", dx + 60, dy - 6, "#c8ffd8", 9);
      label("…doesn't exclude torsion", dx + 60, dy + 80, "#ffd27a", 9);
    }
  },

  /* Hysteroscopy: the glycine tank */
  s8: {
    init(r) { return { levers: [lever("mode", "Glycine · monopolar", RX(r, 4), FL)], items: [], slots: [], mode: "gly", cut: new Set(), def: 0, shown: 0, swell: 0, resetT: 0 }; },
    limit(r) { return r.st.mode === "gly" ? 1000 : 2500; },
    lever(r, lv) {
      const st = r.st;
      if (st.cut.size > 0) { lv.on = !lv.on; toast("Choose the distension medium before you start cutting.", "bad"); return; }
      st.mode = lv.on ? "sal" : "gly"; lv.label = st.mode === "gly" ? "Glycine · monopolar" : "Saline · bipolar";
      toast(st.mode === "gly" ? "Glycine (hypotonic) for monopolar: deficit limit 1000 mL." : "Saline (isotonic) for bipolar: deficit limit 2500 mL.", "good");
    },
    onBreak(r, tx, ty) {
      const st = r.st, c = tx - r.c0;
      if (![6, 9, 12].includes(c) || st.cut.has(c)) return;
      st.cut.add(c); st.def += 450;
      if (st.def > this.limit(r)) {
        st.swell = 1; st.resetT = 2.6;
        roomSlip("Glycine deficit " + st.def + " mL: past 1000 mL the hypotonic fluid drops her sodium and her brain swells. Stop at 1000 mL, or use bipolar with saline (limit 2500 mL).");
      } else if (st.cut.size === 3) solveRoom(r);
      else toast("Fibroid resected. Deficit " + st.def + " mL of " + this.limit(r) + ".", st.mode === "gly" && st.def > 700 ? "bad" : "good");
    },
    update(r, dt) {
      const st = r.st;
      st.shown += (st.def - st.shown) * Math.min(1, dt * 3);
      if (st.resetT > 0) { st.resetT -= dt; if (st.resetT <= 0) { const mode = st.mode, lab = st.levers[0].label, on = st.levers[0].on; roomReset(r, true); r.st.mode = mode; r.st.levers[0].label = lab; r.st.levers[0].on = on; toast("Procedure abandoned and the room reset. Rethink the fluid."); } }
    },
    status(r) { const st = r.st; return "Medium: " + (st.mode === "gly" ? "glycine" : "saline") + " (limit " + this.limit(r) + " mL) · Deficit " + st.def + " mL · Fibroids left " + (3 - st.cut.size); },
    drawBack(r) {
      const st = r.st, x0 = RX(r, 0) - 14, x1 = RX(r, 2) + 14, top = 70, bot = FL - 8, H = bot - top;
      ctx.fillStyle = "rgba(200,240,255,0.08)"; rr(x0, top, x1 - x0, H, 8); ctx.fill(); ctx.strokeStyle = "rgba(200,240,255,0.5)"; ctx.lineWidth = 2; rr(x0, top, x1 - x0, H, 8); ctx.stroke();
      const lvl = bot - H * (1 - st.shown / 3000);
      drawLiquid(x0 + 3, x1 - 3, lvl, bot - 2, st.mode === "gly" ? "#9fe8f0" : "#bfe0ff", 0.6);
      const lim = this.limit(r), ly = bot - H * (1 - lim / 3000);
      ctx.strokeStyle = "#ff4a5a"; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(x0 - 6, ly); ctx.lineTo(x1 + 6, ly); ctx.stroke(); ctx.setLineDash([]);
      label("Stop: " + lim + " mL deficit", (x0 + x1) / 2, ly - 6, "#ffb0b8", 9);
      label((st.mode === "gly" ? "Glycine" : "Saline") + " · used " + Math.round(st.shown) + " mL", (x0 + x1) / 2, top - 8, "#dff8ff", 10);
      // brain in a jar
      const bx = RX(r, 7) + 16, by = 90, s = 1 + st.swell * 0.35 + (st.mode === "gly" ? Math.max(0, st.shown - 700) / 3000 : 0);
      ctx.strokeStyle = "rgba(220,240,255,0.5)"; ctx.lineWidth = 2; rr(bx - 34, by - 34, 68, 68, 10); ctx.stroke();
      ctx.save(); ctx.translate(bx, by); ctx.scale(s, s);
      ctx.fillStyle = st.swell > 0 ? "#f0a0b8" : "#f2b8c8"; for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.arc(Math.cos(k) * 9, Math.sin(k * 1.3) * 7, 11, 0, 6.283); ctx.fill(); }
      ctx.strokeStyle = "rgba(150,60,90,0.6)"; ctx.lineWidth = 1.2; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(-6 + k * 5, 0, 7, 0.3, 2.6); ctx.stroke(); }
      ctx.restore();
      label(st.swell > 0 ? "Na 118: brain swelling!" : "Brain · Na " + (st.mode === "gly" ? Math.round(140 - st.shown / 60) : 140), bx, by - 44, st.swell > 0 ? "#ff8f80" : "#ffe0ea", 9);
    },
    drawFront(r) {
      for (const c of [6, 9, 12]) {
        const tx = r.c0 + c; if (G.tiles[(GR - 1) * G.W + tx] !== 4 && G.tiles[(GR - 2) * G.W + tx] !== 4) continue;
        const x = tx * RT + 16, y = FL - 32;
        ctx.fillStyle = "#e8dcc8"; ctx.beginPath(); ctx.arc(x, y, 18, 0, 6.283); ctx.fill();
        ctx.strokeStyle = "rgba(140,110,90,0.6)"; ctx.lineWidth = 1.5; for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.arc(x, y, k * 5, k, k + 4); ctx.stroke(); }
        label("Fibroid", x, y - 26, "#fff3e0", 9);
      }
    }
  },

  /* Tamoxifen: two faces and a CYP2D6 forge */
  s9: {
    init(r) {
      const st = { items: [item("tam", "Tamoxifen", "ore", "#c9a2ff", RX(r, 1), FL), item("par", "Paroxetine", "pill", "#ff8f80", RX(r, 3), FL), item("oest", "Systemic oestrogen", "vial", "#ffb3d9", RX(r, 5), FL), item("venla", "Venlafaxine", "pill", "#7fd69a", RX(r, 14), FL)],
        slots: [slot("forge", "CYP2D6 forge", RX(r, 3), FL), slot("thermo", "Thermostat", RX(r, 6) + 16, (GR - 3) * RT)], levers: [], jetT: 0 };
      putIn(st.items[1], st.slots[0]);
      return st;
    },
    state(r) {
      const f = r.st.slots[0].item, t = r.st.slots[1].item;
      const inhibited = (f && f.id === "par") || (t && t.id === "par");
      return { inhibited, active: !!(f && f.id === "tam") && !inhibited, cooled: !!(t && (t.id === "venla" || t.id === "par")) };
    },
    place(r, s, it) {
      if (s.id === "thermo") {
        if (it.id === "oest") { roomSlip("No systemic oestrogen after breast cancer: it feeds oestrogen-receptor-positive tumours."); return false; }
        if (it.id === "venla") toast("Venlafaxine cools the hot flushes without touching CYP2D6.", "good");
        else if (it.id === "par") { const f = r.st.slots[0].item; if (f && f.id === "tam") roomSlip("Paroxetine cools the flushes but blocks CYP2D6: tamoxifen can't become endoxifen and the breast shield fails."); else toast("Paroxetine cools the flushes, but it is a strong CYP2D6 inhibitor.", "bad"); }
        else if (it.id === "tam") { toast("Tamoxifen won't cool flushes. Often it causes them."); return false; }
        return true;
      }
      if (it.id === "tam") toast(this.state(r).inhibited ? "The forge is jammed: paroxetine blocks CYP2D6." : "The liver's CYP2D6 forge turns tamoxifen into endoxifen.", this.state(r).inhibited ? "bad" : "good");
      else if (it.id === "par") toast("Paroxetine jams the CYP2D6 forge.", "bad");
      else { toast("Only tamoxifen needs the forge."); return false; }
      return true;
    },
    take(r, s, it) { if (it.id === "par" && s.id === "forge") toast("Paroxetine removed: the forge can work.", "good"); },
    update(r, dt) {
      const st = r.st, S = this.state(r);
      st.jetT += dt;
      const on = !S.cooled && (st.jetT % 2.4) < 1.2;
      st.jetsOn = on;
      const p = G.player;
      if (on && p.x + p.w > RX(r, 9) - 16 && p.x < RX(r, 11) + 16 && p.y + p.h > FL - 100) hurt(p.x + 60);
      if (S.active && S.cooled) solveRoom(r);
    },
    status(r) { const S = this.state(r); return "Forge: " + (S.inhibited ? "jammed by paroxetine" : S.active ? "making endoxifen" : "idle") + " · Flushes: " + (S.cooled ? "cooled" : "raging") + " · Breast shield: " + (S.active ? "up" : "down"); },
    drawBack(r) {
      const S = this.state(r), sx = RX(r, 9) + 16, sy = 120;
      // the two-faced statue
      ctx.fillStyle = "#8fb8e0"; ctx.beginPath(); ctx.arc(sx, sy, 46, Math.PI / 2, Math.PI * 1.5); ctx.fill();
      ctx.fillStyle = "#9ad08a"; ctx.beginPath(); ctx.arc(sx, sy, 46, -Math.PI / 2, Math.PI / 2); ctx.fill();
      ctx.fillStyle = "#1a1220"; ctx.fillRect(sx - 24, sy - 10, 8, 6); ctx.fillRect(sx + 16, sy - 10, 8, 6);
      ctx.strokeStyle = "#1a1220"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, sy - 46); ctx.lineTo(sx, sy + 46); ctx.stroke();
      // breast with a shield / womb with a watering can
      ctx.fillStyle = "#f2c0a8"; ctx.beginPath(); ctx.arc(sx - 80, sy + 10, 18, 0, 6.283); ctx.fill();
      ctx.fillStyle = S.active ? "rgba(143,211,255,0.85)" : "rgba(143,211,255,0.2)"; ctx.beginPath(); ctx.moveTo(sx - 62, sy - 14); ctx.lineTo(sx - 46, sy - 8); ctx.lineTo(sx - 46, sy + 14); ctx.lineTo(sx - 62, sy + 30); ctx.lineTo(sx - 70, sy + 10); ctx.closePath(); ctx.fill();
      label(S.active ? "Breast: oestrogen blocked" : "Breast: unshielded", sx - 80, sy - 22, S.active ? "#cfe8ff" : "#ff8f80", 9);
      ctx.fillStyle = "#e88aa0"; ctx.beginPath(); ctx.ellipse(sx + 80, sy + 10, 14, 18, 0, 0, 6.283); ctx.fill();
      ctx.strokeStyle = "#5fbf3f"; ctx.lineWidth = 2; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(sx + 72 + k * 8, sy + 2); ctx.quadraticCurveTo(sx + 64 + k * 10, sy - 18 - Math.sin(G.time * 2 + k) * 4, sx + 70 + k * 9, sy - 26); ctx.stroke(); }
      for (let k = 0; k < 3; k++) { ctx.fillStyle = "rgba(143,211,255,0.8)"; ctx.fillRect(sx + 58 + k * 6, sy - 40 + ((G.time * 50 + k * 9) % 22), 2, 5); }
      label("Womb: stimulated (polyps, hyperplasia)", sx + 80, sy - 50, "#d8ffc8", 9);
      bigText("TAMOXIFEN", sx, sy + 66, 13, "rgba(255,240,220,0.6)");
      // forge
      const fx = RX(r, 3), fy = FL;
      ctx.fillStyle = "#5a3a30"; ctx.beginPath(); ctx.arc(fx, fy - 4, 30, Math.PI, 0); ctx.fill();
      ctx.fillStyle = S.inhibited ? "#3a3440" : S.active ? "rgba(255," + (150 + Math.sin(G.time * 10) * 40) + ",60,0.95)" : "#6a4a40"; ctx.beginPath(); ctx.arc(fx, fy - 4, 14, Math.PI, 0); ctx.fill();
      label("Liver", fx, fy - 70, "#ffd9c8", 9);
      // endoxifen beam to the shield gate
      if (S.active) { ctx.strokeStyle = "rgba(143,211,255," + (0.6 + 0.3 * Math.sin(G.time * 12)) + ")"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(fx, fy - 34); ctx.lineTo(r.x1 + 16, FL - 60); ctx.stroke(); label("Endoxifen", (fx + r.x1) / 2, FL - 60, "#cfe8ff", 9); }
    },
    drawFront(r) {
      if (!r.st.jetsOn) { for (let c = 9; c <= 11; c++) { ctx.fillStyle = "#5a3a30"; rr(RX(r, c) - 8, FL - 6, 16, 6, 2); ctx.fill(); } label("Hot-flush vents", RX(r, 10), FL - 18, "#ffd2a0", 9); return; }
      for (let c = 9; c <= 11; c++) {
        const x = RX(r, c);
        for (let k = 0; k < 5; k++) { const h = 60 + Math.sin(G.time * 20 + k + c) * 20; const g = ctx.createLinearGradient(0, FL - h, 0, FL); g.addColorStop(0, "rgba(255,200,60,0)"); g.addColorStop(1, "rgba(255,110,20,0.85)"); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 10 + k * 4, FL); ctx.quadraticCurveTo(x - 6 + k * 3, FL - h * 0.6, x - 4 + k * 3 + Math.sin(G.time * 15 + k) * 3, FL - h); ctx.quadraticCurveTo(x + k * 2, FL - h * 0.5, x + 2 + k * 3, FL); ctx.fill(); }
      }
      label("Hot flush!", RX(r, 10), FL - 100, "#ffd2a0", 10);
    }
  }
};
