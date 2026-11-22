/* ================= polish: terrain, light, focus, timed hazards, true/false lanes =================
   Loaded after engine.js and rooms.js. Everything here is called from the engine at run time. */

/* ---------- colour helpers ---------- */
const _rgbCache = {};
function hexRgb(h) {
  if (_rgbCache[h]) return _rgbCache[h];
  let s = h.replace("#", ""); if (s.length === 3) s = s.split("").map(c => c + c).join("");
  const n = parseInt(s, 16); return (_rgbCache[h] = [n >> 16 & 255, n >> 8 & 255, n & 255]);
}
function mix(a, b, t) { const A = hexRgb(a), B = hexRgb(b); return "rgb(" + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(",") + ")"; }
function shade(c, t) { return t >= 0 ? mix(c, "#ffffff", Math.min(1, t)) : mix(c, "#000000", Math.min(1, -t)); }
function rgba(c, a) { const A = hexRgb(c); return "rgba(" + A[0] + "," + A[1] + "," + A[2] + "," + a + ")"; }

/* ---------- terrain: hand-shaded tiles, pre-rendered into cached chunks ---------- */
const CH = 16, chunkCache = new Map(), chunkPool = [];  // canvases are reused: phones free discarded canvases slowly
let chunkScale = 0;
function markDirty(tx) {
  const ci = Math.floor(tx / CH);
  dropChunk(ci); dropChunk(ci - 1); dropChunk(ci + 1);
}
function dropChunk(ci) { const c = chunkCache.get(ci); if (c) { chunkCache.delete(ci); if (chunkPool.length < 8) chunkPool.push(c); } }
function clearChunks() { for (const ci of [...chunkCache.keys()]) dropChunk(ci); }
function tileAt(tx, ty) {
  if (tx < 0 || tx >= G.W) return 1;
  if (ty < 0) return 0;
  if (ty >= ROWS) return G.tiles[(ROWS - 1) * G.W + tx] ? 1 : 0;
  const v = G.tiles[ty * G.W + tx];
  return v === 5 || v === 6 ? 0 : v;
}
function pathRound(x, y, w, h, tl, tr, br, bl) {
  ctx.beginPath(); ctx.moveTo(x + tl, y); ctx.lineTo(x + w - tr, y); if (tr) ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  ctx.lineTo(x + w, y + h - br); if (br) ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + bl, y + h); if (bl) ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  ctx.lineTo(x, y + tl); if (tl) ctx.quadraticCurveTo(x, y, x + tl, y); ctx.closePath();
}
function drawTile(tx, ty) {
  const v = tileAt(tx, ty); if (!v) return;
  const t = G.t, X = tx * TILE, Y = ty * TILE, S = TILE;
  const up = tileAt(tx, ty - 1), dn = tileAt(tx, ty + 1), lf = tileAt(tx - 1, ty), rt = tileAt(tx + 1, ty);
  if (v === 2) {
    // bevelled stone
    const g = ctx.createLinearGradient(0, Y, 0, Y + S); g.addColorStop(0, shade(t.plat, 0.16)); g.addColorStop(1, shade(t.plat, -0.22));
    ctx.fillStyle = shade(t.plat, -0.45); pathRound(X + 0.5, Y + 1.5, S - 1, S - 1, 6, 6, 6, 6); ctx.fill();
    ctx.fillStyle = g; pathRound(X + 1, Y + 1, S - 2, S - 3.5, 6, 6, 6, 6); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(X + 5, Y + 2.5); ctx.lineTo(X + S - 5, Y + 2.5); ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.moveTo(X + 3, Y + S / 2 + 1); ctx.lineTo(X + S - 3, Y + S / 2 + 1); ctx.moveTo(X + S / 2 + (ty % 2 ? 6 : -6), Y + S / 2 + 1); ctx.lineTo(X + S / 2 + (ty % 2 ? 6 : -6), Y + S - 4); ctx.stroke();
    if (!up) { ctx.fillStyle = t.top; pathRound(X + 1, Y + 0.5, S - 2, 4.5, 4, 4, 1, 1); ctx.fill(); }
    if (h2(tx, ty + 3) > 0.6) { ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.beginPath(); ctx.arc(X + 8 + h2(tx, ty) * 14, Y + 10 + h2(ty, tx) * 6, 2, 0, 6.283); ctx.fill(); }
    return;
  }
  let d = 0; while (d < 5 && tileAt(tx, ty - d - 1)) d++;
  const top = shade(t.ground, 0.05 - d * 0.06), bot = shade(t.ground, -0.04 - d * 0.06);
  const g = ctx.createLinearGradient(0, Y, 0, Y + S); g.addColorStop(0, top); g.addColorStop(1, bot);
  ctx.fillStyle = g;
  pathRound(X, Y, S + 0.7, S + 0.7, !up && !lf ? 9 : 0, !up && !rt ? 9 : 0, !dn && !rt ? 7 : 0, !dn && !lf ? 7 : 0); ctx.fill();
  // strata and pebbles
  if ((ty + (tx >> 2)) % 3 === 0 && d > 0) { ctx.strokeStyle = "rgba(0,0,0,0.12)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X, Y + 12 + h2(tx, ty) * 8); ctx.quadraticCurveTo(X + S / 2, Y + 8 + h2(ty, tx) * 12, X + S, Y + 12 + h2(tx + 1, ty) * 8); ctx.stroke(); }
  for (let k = 0; k < 2; k++) if (h2(tx * 3 + k, ty * 7) > 0.55) {
    const px = X + 5 + h2(tx + k, ty * 3) * (S - 10), py = Y + 6 + h2(tx * 5, ty + k) * (S - 12), r = 1.5 + h2(tx, ty + k * 9) * 2.2;
    ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.beginPath(); ctx.ellipse(px + 0.6, py + 0.8, r, r * 0.8, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = rgba(t.ground, 1); ctx.fillStyle = shade(t.ground, 0.14 - d * 0.04); ctx.beginPath(); ctx.ellipse(px, py, r, r * 0.8, 0, 0, 6.283); ctx.fill();
  }
  // exposed sides
  if (!lf) { const e = ctx.createLinearGradient(X, 0, X + 7, 0); e.addColorStop(0, "rgba(255,255,255,0.10)"); e.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = e; ctx.fillRect(X, Y + (up ? 0 : 6), 7, S - (up ? 0 : 6)); }
  if (!rt) { const e = ctx.createLinearGradient(X + S - 8, 0, X + S, 0); e.addColorStop(0, "rgba(0,0,0,0)"); e.addColorStop(1, "rgba(0,0,0,0.28)"); ctx.fillStyle = e; ctx.fillRect(X + S - 8, Y + (up ? 0 : 6), 8, S - (up ? 0 : 6)); }
  if (!dn) {
    const e = ctx.createLinearGradient(0, Y + S - 10, 0, Y + S); e.addColorStop(0, "rgba(0,0,0,0)"); e.addColorStop(1, "rgba(0,0,0,0.35)"); ctx.fillStyle = e; ctx.fillRect(X + 2, Y + S - 10, S - 4, 10);
    if (h2(tx, ty) > 0.5) { ctx.fillStyle = shade(t.ground, -0.1); ctx.beginPath(); ctx.moveTo(X + 10, Y + S); ctx.quadraticCurveTo(X + 13, Y + S + 7, X + 16, Y + S); ctx.fill(); }
  }
  if (v === 4) {
    ctx.strokeStyle = "rgba(20,10,10,0.55)"; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(X + 4, Y + 9); ctx.lineTo(X + 13, Y + 17); ctx.lineTo(X + 10, Y + 27); ctx.moveTo(X + 13, Y + 17); ctx.lineTo(X + 24, Y + 14); ctx.lineTo(X + 29, Y + 24); ctx.stroke();
  }
  // grass lip and tufts
  if (!up) {
    const lip = ctx.createLinearGradient(0, Y, 0, Y + 9); lip.addColorStop(0, shade(t.top, 0.12)); lip.addColorStop(1, shade(t.top, -0.3));
    ctx.fillStyle = lip; pathRound(X - (lf ? 0.5 : -1), Y - 1, S + (lf ? 0.5 : -1) + (rt ? 0.7 : -1), 9, !lf ? 6 : 0, !rt ? 6 : 0, 3, 3); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(X + (lf ? 0 : 3), Y + 8, S - (lf ? 0 : 3) - (rt ? 0 : 3), 2);
    ctx.fillStyle = shade(t.top, 0.05);
    for (let k = 0; k < 4; k++) { const bx = X + 3 + k * 8 + h2(tx, k) * 4, bh = 3 + h2(tx + k, ty) * 4; ctx.beginPath(); ctx.moveTo(bx - 2, Y + 1); ctx.quadraticCurveTo(bx - 1 + h2(k, tx) * 2, Y - bh, bx + 1.5, Y - bh * 0.7); ctx.lineTo(bx + 2, Y + 1); ctx.fill(); }
    ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(X + (lf ? 0 : 5), Y - 0.5, S - (lf ? 0 : 5) - (rt ? 0 : 5), 1.2);
  }
}
function renderChunk(ci) {
  const k = chunkScale, c = chunkPool.pop() || document.createElement("canvas");
  const w = Math.ceil((CH + 1) * TILE * k), h = Math.ceil((ROWS * TILE + 12) * k);
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const g = c.getContext("2d"); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); g.scale(k, k); g.translate(-ci * CH * TILE, 12);
  const main = ctx; ctx = g;
  try { for (let tx = ci * CH; tx <= Math.min(G.W - 1, ci * CH + CH); tx++) for (let ty = 0; ty < ROWS; ty++) drawTile(tx, ty); }
  finally { ctx = main; }
  return c;
}
function drawTerrain() {
  const k = Math.min(2.4, BASESC * DPR);
  if (Math.abs(k - chunkScale) > 0.01) { chunkCache.clear(); chunkPool.length = 0; chunkScale = k; }
  const span = CH * TILE, c0 = Math.max(0, Math.floor(G.cam / span)), c1 = Math.min(Math.floor((G.W - 1) / CH), Math.floor((G.cam + VW) / span));
  for (let ci = c0; ci <= c1; ci++) {
    let c = chunkCache.get(ci);
    if (!c) c = renderChunk(ci); else chunkCache.delete(ci);
    chunkCache.set(ci, c);
    ctx.drawImage(c, ci * span, -12, (CH + 1) * TILE, ROWS * TILE + 12);
  }
  while (chunkCache.size > 6) dropChunk(chunkCache.keys().next().value);
  // pulsing glow on cracked tiles
  const x0 = Math.max(0, Math.floor(G.cam / TILE)), x1 = Math.min(G.W - 1, Math.ceil((G.cam + VW) / TILE));
  for (let tx = x0; tx <= x1; tx++) for (let ty = 0; ty < ROWS; ty++) if (G.tiles[ty * G.W + tx] === 4) {
    const X = tx * TILE, Y = ty * TILE;
    ctx.strokeStyle = "rgba(255,236,190," + (0.35 + 0.3 * Math.sin(G.time * 3 + tx)) + ")"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(X + 4, Y + 9); ctx.lineTo(X + 13, Y + 17); ctx.lineTo(X + 10, Y + 27); ctx.moveTo(X + 13, Y + 17); ctx.lineTo(X + 24, Y + 14); ctx.lineTo(X + 29, Y + 24); ctx.stroke();
  }
}

/* ---------- light and depth ---------- */
function glow(x, y, r, color, a) {
  if (r <= 0) return;
  ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = a;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
}
function surfaceBelow(x, y) {
  const tx = Math.floor(x / TILE);
  for (let ty = Math.max(0, Math.floor(y / TILE)); ty < ROWS; ty++) if (tileAt(tx, ty)) return ty * TILE;
  for (const pl of G.plats) if (pl.alive && x > pl.x && x < pl.x + pl.w && pl.y >= y - 2 && pl.y < y + 200) return pl.y;
  return null;
}
function drawShadow(x, y, w) {
  const s = surfaceBelow(x, y); if (s == null) return;
  const dist = s - y, k = clamp(1 - dist / 180, 0, 1); if (k <= 0) return;
  ctx.fillStyle = "rgba(0,0,0," + (0.32 * k) + ")"; ctx.beginPath(); ctx.ellipse(x, s + 1, w * (0.6 + 0.4 * k), 3.5 * (0.6 + 0.4 * k), 0, 0, 6.283); ctx.fill();
}
function haze(y0, y1, color, a) {
  const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, rgba(color, 0)); g.addColorStop(1, rgba(color, a));
  ctx.fillStyle = g; ctx.fillRect(0, y0, VW, y1 - y0);
}
function lightRays() {
  if (G.t.skyline === "cave" || RM) return;
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 4; i++) {
    const x = VW * (0.55 + i * 0.12) + Math.sin(G.time * 0.15 + i * 2) * 30, w = 40 + i * 14;
    const g = ctx.createLinearGradient(0, OFFY, 0, OFFY + GR * TILE); g.addColorStop(0, "rgba(255,248,230,0.07)"); g.addColorStop(1, "rgba(255,248,230,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, OFFY); ctx.lineTo(x + w, OFFY); ctx.lineTo(x + w - 160, OFFY + GR * TILE); ctx.lineTo(x - 160 - w * 0.6, OFFY + GR * TILE); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
function groundMist() {
  ctx.save(); ctx.globalAlpha = 0.08;
  for (let i = 0; i < 5; i++) {
    const span = VW + 400, x = ((i * 233 - G.cam * 0.6 + G.time * (8 + i * 3)) % span + span) % span - 200;
    const g = ctx.createRadialGradient(x, GR * TILE - 6, 0, x, GR * TILE - 6, 140); g.addColorStop(0, "#ffffff"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(x - 140, GR * TILE - 60, 280, 80);
  }
  ctx.restore();
}
function foreground() {
  // dark silhouettes that pass in front of the world, for depth
  const t = G.t, par = 1.3, y = OFFY + ROWS * TILE;
  ctx.fillStyle = shade(t.ground, -0.55);
  for (let i = -1; i < 12; i++) {
    const cell = 170, base = Math.floor(G.cam * par / cell), ci = base + i, x = ci * cell - G.cam * par + h2(ci, 31) * 60;
    if (h2(ci, 32) < 0.45) continue;
    const h = 14 + h2(ci, 33) * 26, w = 30 + h2(ci, 34) * 50;
    ctx.beginPath(); ctx.moveTo(x - w / 2, y + 2);
    if (t.skyline === "trees" || t.particles === "leaves") { for (let k = 0; k <= 6; k++) ctx.lineTo(x - w / 2 + k * w / 6, y - (k % 2 ? h : h * 0.35)); }
    else ctx.quadraticCurveTo(x, y - h * 1.6, x + w / 2, y + 2);
    ctx.lineTo(x + w / 2, y + 2); ctx.closePath(); ctx.fill();
  }
}
let vignetteCache = null;
function vignette() {
  const key = Math.round(VW) + "x" + Math.round(VH);
  if (!vignetteCache || vignetteCache.key !== key) {
    const g = ctx.createRadialGradient(VW / 2, VH * 0.55, Math.min(VW, VH) * 0.35, VW / 2, VH * 0.55, Math.hypot(VW, VH) * 0.62);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(6,4,12,0.42)");
    vignetteCache = { key, g };
  }
  ctx.fillStyle = vignetteCache.g; ctx.fillRect(0, 0, VW, VH);
}

/* ---------- sprites with outline and hit flash ---------- */
const off2 = document.createElement("canvas"), off2Ctx = off2.getContext("2d");
function drawSprite(fn, cx, cy, size, flash, fcol, outline) {
  const k = DPR * SC, S = Math.ceil(size * k);
  for (const c of [off, off2]) if (c.width < S || c.height < S) { c.width = Math.max(c.width, S); c.height = Math.max(c.height, S); }
  offCtx.setTransform(1, 0, 0, 1, 0, 0); offCtx.clearRect(0, 0, S, S);
  offCtx.setTransform(k, 0, 0, k, (size / 2 - cx) * k, (size / 2 - cy) * k);
  const main = ctx; ctx = offCtx; try { fn(); } finally { ctx = main; }
  offCtx.setTransform(1, 0, 0, 1, 0, 0);
  if (outline) {
    off2Ctx.setTransform(1, 0, 0, 1, 0, 0); off2Ctx.clearRect(0, 0, S, S);
    off2Ctx.globalCompositeOperation = "source-over"; off2Ctx.drawImage(off, 0, 0);
    off2Ctx.globalCompositeOperation = "source-in"; off2Ctx.fillStyle = outline; off2Ctx.fillRect(0, 0, S, S);
    off2Ctx.globalCompositeOperation = "source-over";
    const o = 1.25, a = ctx.globalAlpha;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) ctx.drawImage(off2, 0, 0, S, S, cx - size / 2 + dx * o, cy - size / 2 + dy * o, size, size);
    ctx.globalAlpha = a;
  }
  if (flash > 0.02) {
    offCtx.globalCompositeOperation = "source-atop"; offCtx.globalAlpha = clamp(flash, 0, 1); offCtx.fillStyle = fcol || "#ffffff"; offCtx.fillRect(0, 0, S, S);
    offCtx.globalCompositeOperation = "source-over"; offCtx.globalAlpha = 1;
  }
  ctx.drawImage(off, 0, 0, S, S, cx - size / 2, cy - size / 2, size, size);
}

/* ---------- timed hazards: pulse spikes and falling rocks ---------- */
function pulseState(pu) { const ph = ((G.time + pu.ph) % pu.per) / pu.per; return ph < 0.42 ? "down" : ph < 0.56 ? "warn" : "up"; }
function updateHazards(dt) {
  const p = G.player;
  for (const pu of G.pulses) if (pulseState(pu) === "up" && overlap(p, { x: pu.x + 2, y: pu.y, w: pu.w - 4, h: pu.h })) hurt(p.x + p.w / 2 + (p.vx >= 0 ? -10 : 10), true);
  for (const dr of G.droppers) {
    dr.t += dt;
    if (dr.state === "hang" && Math.abs(p.x + p.w / 2 - dr.x) < 46 && p.y > dr.y) { dr.state = "shake"; dr.t = 0; }
    else if (dr.state === "shake" && dr.t > 0.42) { dr.state = "fall"; dr.vy = 0; }
    else if (dr.state === "fall") {
      dr.vy = Math.min(dr.vy + 2000 * dt, 1100); dr.y += dr.vy * dt;
      if (Math.abs(p.x + p.w / 2 - dr.x) < 16 && p.y < dr.y + 12 && p.y + p.h > dr.y - 12) { hurt(dr.x, true); }
      const ty = Math.floor((dr.y + 12) / TILE);
      if (ty >= ROWS || tileAt(Math.floor(dr.x / TILE), ty)) { dr.state = "gone"; dr.t = 0; G.shake = Math.max(G.shake, 0.15); burst(dr.x, dr.y, "#9a8f86", 14, { size: 3 }); dust(dr.x, Math.min(dr.y + 10, ROWS * TILE), 6); }
    }
    else if (dr.state === "gone" && dr.t > 3.5) { dr.state = "hang"; dr.y = dr.y0; dr.t = 0; }
  }
}
function drawHazards() {
  for (const pu of G.pulses) {
    if (pu.x + pu.w < G.cam - 20 || pu.x > G.cam + VW + 20) continue;
    const st = pulseState(pu);
    ctx.fillStyle = "#2a2434"; rr(pu.x, pu.y + pu.h - 4, pu.w, 5, 2); ctx.fill();
    for (let x = pu.x + 2; x < pu.x + pu.w - 4; x += 8) { ctx.fillStyle = st === "warn" ? "#ff8f80" : "#4a4458"; ctx.fillRect(x + 3, pu.y + pu.h - 3, 2, 2); }
    if (st === "down") continue;
    const h = st === "up" ? pu.h : pu.h * 0.3 + Math.sin(G.time * 40) * 1.5;
    if (st === "warn") glow(pu.x + pu.w / 2, pu.y + pu.h, pu.w * 0.6, "rgba(255,90,80,0.7)", 0.6);
    ctx.fillStyle = st === "up" ? "#e8e0f0" : "#ff9a8e"; ctx.beginPath();
    for (let x = pu.x + 2; x < pu.x + pu.w - 4; x += 8) { ctx.moveTo(x, pu.y + pu.h); ctx.lineTo(x + 4, pu.y + pu.h - h); ctx.lineTo(x + 8, pu.y + pu.h); }
    ctx.fill();
  }
  for (const dr of G.droppers) {
    if (dr.x < G.cam - 30 || dr.x > G.cam + VW + 30) continue;
    if (dr.state === "gone") continue;
    const jx = dr.state === "shake" ? Math.sin(G.time * 70) * 2 : 0;
    if (dr.state !== "fall") { ctx.strokeStyle = "rgba(160,150,140,0.6)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(dr.x, 0); ctx.lineTo(dr.x + jx, dr.y - 10); ctx.stroke(); }
    else { ctx.fillStyle = "rgba(0,0,0,0.25)"; const s = surfaceBelow(dr.x, dr.y); if (s != null) { ctx.beginPath(); ctx.ellipse(dr.x, s, 12, 3, 0, 0, 6.283); ctx.fill(); } }
    const g = ctx.createRadialGradient(dr.x - 4 + jx, dr.y - 4, 2, dr.x + jx, dr.y, 14); g.addColorStop(0, "#b8ada4"); g.addColorStop(1, "#5a524c");
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(dr.x - 12 + jx, dr.y - 6); ctx.lineTo(dr.x - 4 + jx, dr.y - 13); ctx.lineTo(dr.x + 10 + jx, dr.y - 9); ctx.lineTo(dr.x + 13 + jx, dr.y + 4); ctx.lineTo(dr.x + jx, dr.y + 13); ctx.lineTo(dr.x - 11 + jx, dr.y + 6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 1; ctx.stroke();
    if (dr.state === "shake") label("!", dr.x, dr.y - 22, "#ff8f80", 11);
  }
}

/* ---------- true/false lanes inside chases ---------- */
let forkShown = null;
function forkLane(f) { const p = G.player; return p.y + p.h <= (GR - 4) * TILE + 3 ? "upper" : "lower"; }
function updateForks() {
  const p = G.player; let active = null;
  for (const f of G.forks) {
    if (f.resolved) continue;
    if (p.x > f.x0 - 6 * TILE && p.x < f.vx + TILE) active = f;
    const lane = forkLane(f), right = f.tf[1] ? lane === "upper" : lane === "lower";
    if (p.x + p.w >= f.vx - 2 && p.x <= f.vx + TILE) {
      if (!right && !f.wrong) {
        f.wrong = true; f.flash = 1;
        knowledgeHit((f.tf[1] ? "It's TRUE" : "It's FALSE") + ". " + f.tf[2] + " Go back and take the other lane!");
      }
    }
    if (p.x > f.vx + TILE + 4) {
      f.resolved = true;
      if (!f.wrong) { rightAnswer(p.x, p.y - 20); gainXP(20, p.x, p.y - 50); toast((f.tf[1] ? "TRUE. " : "FALSE. ") + f.tf[2], "good", 5000); burst(f.vx + 16, p.y, G.t.accent, 20); }
    }
  }
  if (active !== forkShown) {
    forkShown = active;
    if (!leapShown) { $("leapCard").hidden = !active; $("stage").classList.toggle("leaping", !!active); if (active) renderForkCard(active); }
  }
}
function renderForkCard(f) {
  const card = $("leapCard"); card.textContent = "";
  card.append(el("div", { class: "lrow" }, el("span", { text: "True or false · " + G.chase.name + " is behind you" })),
    el("div", { class: "lq", text: "“" + f.tf[0] + "”" }),
    el("ol", {}, el("li", {}, el("b", { text: "↑" }), el("span", { text: "TRUE: climb to the high road" })), el("li", {}, el("b", { text: "↓" }), el("span", { text: "FALSE: stay on the low road" }))));
}
function drawForks() {
  for (const f of G.forks) {
    if (f.vx < G.cam - 80 || f.x0 > G.cam + VW + 80) continue;
    f.flash = Math.max(0, (f.flash || 0) - 1 / 60);
    const lanes = [["upper", 0, (GR - 4) * TILE], ["lower", (GR - 3) * TILE, GR * TILE]];
    for (const [ln, y0, y1] of lanes) {
      const passable = (ln === "upper") === !!f.tf[1];
      const revealed = f.resolved || f.wrong;
      const col = revealed ? (passable ? "143,230,160" : "255,110,100") : "200,190,255";
      const g = ctx.createLinearGradient(f.vx, 0, f.vx + TILE, 0); g.addColorStop(0, "rgba(" + col + ",0.05)"); g.addColorStop(0.5, "rgba(" + col + "," + (revealed && passable ? 0.12 : 0.42 + (ln === "lower" ? 0 : 0) + (f.flash && !passable ? 0.4 : 0)) + ")"); g.addColorStop(1, "rgba(" + col + ",0.05)");
      ctx.fillStyle = g; ctx.fillRect(f.vx + 2, y0, TILE - 4, y1 - y0);
      for (let i = 0; i < 4; i++) { const yy = y0 + ((G.time * 50 + i * 37) % Math.max(10, y1 - y0)); ctx.fillStyle = "rgba(" + col + ",0.6)"; ctx.fillRect(f.vx + 8 + (i % 3) * 6, yy, 2, 7); }
    }
    const lx = (f.x0 + 4) * 1;
    bigText("TRUE ↑", lx * 1 + TILE * 3, (GR - 4) * TILE - 26, 16, "rgba(190,255,200,0.9)");
    bigText("FALSE ↓", lx * 1 + TILE * 3, (GR - 1) * TILE + 6, 14, "rgba(255,200,190,0.9)");
  }
}
