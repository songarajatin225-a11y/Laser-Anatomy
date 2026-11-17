import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "/root/.cache/anatomy-skill/1482e8469b0a9e0d8cc18ea2740a01423d29ae80/kit/iso-kit.mjs";
import * as G from "/root/.cache/anatomy-skill/1482e8469b0a9e0d8cc18ea2740a01423d29ae80/kit/lathe.mjs";
import { tubePieces, tubeSvg, crossingsOf } from "/root/.cache/anatomy-skill/1482e8469b0a9e0d8cc18ea2740a01423d29ae80/kit/tube.mjs";
import * as A from "/root/.cache/anatomy-skill/1482e8469b0a9e0d8cc18ea2740a01423d29ae80/kit/audit.mjs";
import { glCamera } from "/root/.cache/anatomy-skill/1482e8469b0a9e0d8cc18ea2740a01423d29ae80/kit/gl.mjs";
import { kitScript, glScript } from "/root/.cache/anatomy-skill/1482e8469b0a9e0d8cc18ea2740a01423d29ae80/scripts/inline-kit.mjs";
import { MODEL, DIAL, jobPath, jobTotals, pulseEnergy, peakPower, spot, spacing, fluence } from "./model.mjs";

const KITDIR = "/root/.cache/anatomy-skill/1482e8469b0a9e0d8cc18ea2740a01423d29ae80/kit";
const HERE = dirname(fileURLToPath(import.meta.url));
const THEME = process.argv.includes("--light") ? "light" : "dark";

const W = 600;
const H = 720;
const AZIMUTH = 60;

// ---------- world layout (mm, z up, bench top at z = 0) ----------
const PLATE = { x: -310, y: -140, w: 420, d: 560, r: 12 };
const PLATE_H = 12;
const FOOT_H = 6;
const TABLE = { x: -245, y: -115, w: 320, d: 230, r: 6 };
const ZT = 34; // T-slot table top
const JIG = { x: -55, y: -55, w: 110, d: 110, r: 4 };
const ZJ = 41; // jig top
const DISC_R = 35;
const ZW = 44; // work surface (top of the blank)
const LENS_BOT = ZW + MODEL.wd; // 232
const ZF = 280; // head floor underside
const ZB = 322; // beam height in the head
const M1 = [-24, 0, ZB];
const M2 = [0, 0, ZB];
const COL = { x: -232, y: -28, w: 56, d: 56, r: 3 };
const CX = COL.x + COL.w / 2;
const CAR = { z0: 310, z1: 370 };
const BOX = { x0: -290, x1: 40, y0: 180, y1: 400, z0: 8 };

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [CX, 0, 540], [CX + 36, 0, 540], [CX - 36, 0, 540], [44, -46, 367], [-24, 0, 432]],
  W,
  H,
  { pad: 30, azimuth: AZIMUTH },
);
const V = G.viewOf(P);
const KS = G.scaleOf(P);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);
const Faded = (list, style) => k.fadedSvg(list, style);
const path3 = (points, closed = false) => k.pathOf(points.map(at), closed);
const f2 = (v) => Math.round(v * 100) / 100;
const Fz = (x, y, z) => G.frameOf([x, y, z], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
const Fx = (x, y, z, sign = 1) => G.frameOf([x, y, z], [sign, 0, 0], [0, 1, 0], [0, 0, 1]);
const Fy = (x, y, z, sign = 1) => G.frameOf([x, y, z], [0, sign, 0], [0, 0, 1], [1, 0, 0]);

// ---------- recorder and helpers ----------
const R = A.recorder(P);
const record = R.solid;
function put(name, ref, svg, shapes = [], { bias = 0, ...rest } = {}) {
  return R.put({ name, at: ref, bias, svg, shapes, piece: "rig", ...rest });
}
function box(name, [x0, y0, z0], [x1, y1, z1], style = {}, { r = 0.6, steps = 2, bevel = 0, extra = "", inner = "", bias = 0, owner, attrs } = {}) {
  const plan = { x: x0, y: y0, w: x1 - x0, d: y1 - y0, r };
  const shape = record(A.slab(plan, z0, z1 - z0, { name, owner }, steps));
  put(name, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], S(k.slabOf(plan, z0, z1 - z0, P, steps, bevel), { tone: "mid", ...style, inner }) + extra, [shape], { bias, attrs });
  return shape;
}
function turned(name, F, profile, style = {}, { extra = "", inner = "", bias = 0, smooth, steps, bevel = 0, owner, attrs } = {}) {
  const opts = { bevel, ...(smooth !== undefined ? { smooth } : {}), ...(steps ? { steps } : {}) };
  const paths = G.solidOf(profile, F, P, opts);
  const mid = (profile[0][0] + profile[profile.length - 1][0]) / 2;
  const shape = record(A.solid(F, profile, { name, owner, radius: smooth && smooth.radius ? smooth.radius : null }));
  put(name, G.add3(F.o, G.mul3(F.a, mid)), S(paths, { tone: "mid", ...style, inner }) + extra, [shape], { bias, attrs });
  return shape;
}
function disc(name, F, s0, s1, r, style = {}, options = {}) {
  return turned(name, F, [[s0, r], [s1, r]], style, options);
}
function prism(name, F, poly, s0, s1, style = {}, { extra = "", inner = "", bias = 0, ref, attrs, owner } = {}) {
  const shape = record(A.prism(F, poly, s0, s1, { name, owner }));
  const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length;
  const cy = poly.reduce((a, p) => a + p[1], 0) / poly.length;
  const centre = G.add3(G.add3(G.add3(F.o, G.mul3(F.a, (s0 + s1) / 2)), G.mul3(F.u, cx)), G.mul3(F.v, cy));
  put(name, ref ?? centre, S(G.prismOf(F, poly, s0, s1, P), { tone: "mid", ...style, inner }) + extra, [shape], { bias, attrs });
  return shape;
}
const rect = (u0, u1, v0, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
function ball(name, c, r, style = {}, { bias = 0, extra = "" } = {}) {
  const shape = record(A.ball(c, r, { name }));
  put(name, c, S(G.sphereOf(c, r, P, { steps: 32 }), { tone: "mid", ...style }) + extra, [shape], { bias });
  return shape;
}
function planeMatrix(o, ex, ey) {
  const p0 = at(o);
  const px = at(G.add3(o, ex));
  const py = at(G.add3(o, ey));
  const v = (x) => x.toFixed(4);
  return `matrix(${v(px[0] - p0[0])} ${v(px[1] - p0[1])} ${v(py[0] - p0[0])} ${v(py[1] - p0[1])} ${p0[0].toFixed(2)} ${p0[1].toFixed(2)})`;
}
const ribsX = (F, s0, s1, r, n) => Faded(G.ribsOf(F, s0, s1, r, n, P, { fade: [0.1, 0.55], seams: true }), { tone: "lo" });

const CABLES = [];
function cable(name, points, r = 0.5, { tone = "mid", bend = 3, ends = [true, true], gaps: extraGaps = [], rings, maxLength = 18, bias = 0.05, limp = true, touch, bundle, clamps = [] } = {}) {
  const route = G.fillet(points, Math.max(bend, r * 2.6), 10, { P, tube: r });
  const total = G.pathLength(route);
  const gaps = [...extraGaps];
  for (const c of clamps) {
    const s = crossingsOf(route, c.at, c.axis, c.r + 1);
    for (const x of s) gaps.push([x - c.t / 2, x + c.t / 2]);
  }
  R.route(name, route, r, { gaps, limp, touch, bundle, piece: "rig" });
  CABLES.push(name);
  tubePieces(route, r, P, { maxLength, spacing: Math.max(0.6, Math.min(1.6, r)), gaps, ...(rings ? { rings } : {}) }).forEach((piece, index) =>
    put(`${name}:${index}`, piece.mid, tubeSvg(piece, { tone }), [A.tube(piece.points, piece.radii)], { bias, route: name, chunk: index, attrs: ` data-route="${name}" data-chunk="${index}"` }),
  );
  [0, 1].forEach((index) => {
    if (!ends[index]) return;
    const end = index ? route[route.length - 1] : route[0];
    const size = Math.max(0.45, r * KS * 0.9);
    put(`${name}.end${index}`, end, Dots([at(end)], { size, tone: "hi" }), [A.ball(end, size / KS, { name: `${name}.end${index}`, owner: name })], { bias: bias + 0.15 });
  });
  return route;
}
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

// ---------- the bench plate (back layer, ground) ----------
const back = [];
back.push(`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`);
for (const [x, y] of byDepth(k.corners(PLATE, 26))) {
  back.push(S(k.cylinder(x, y, 8, -PLATE_H - FOOT_H, 1.8, P, 28), { tone: "lo" }));
  back.push(S(k.cylinder(x, y, 6.2, -PLATE_H - FOOT_H + 1.8, FOOT_H - 1.8, P, 28), { tone: "mid" }));
}
back.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid", inner: Ln(k.sideSeam(PLATE, -5, P, 8), { tone: "faint" }) }));
back.push(Ln(k.planOutline(k.insetPlan(PLATE, 6), 0, P), { tone: "lo" }));
const plateScrews = k.corners(PLATE, 12);
back.push(Ln(plateScrews.map(([x, y]) => k.ring(x, y, 2.4, 0, P, 16)).join(""), { tone: "lo" }));
back.push(Dots(plateScrews.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
record(A.slab(PLATE, -PLATE_H, PLATE_H, { name: "stand.plate", ground: true }, 8));
{
  const STRIP = { x: 88, y: -110, w: 7, d: 270, r: 1 };
  back.push(S(k.slabOf(STRIP, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const t = k.topTicks(STRIP.y + 4, STRIP.y + STRIP.d - 4, 5, 10, STRIP.x, 0.6, [2, 3.8], P, "y");
  back.push(Ln(t.minor, { tone: "lo" }), Ln(t.major, { tone: "mid" }));
  back.push(Dots([at([STRIP.x + 4.6, STRIP.y + 2, 0.6]), at([STRIP.x + 4.6, STRIP.y + STRIP.d - 2, 0.6])], { size: 0.45 }));
  const LABEL = { x: 56, y: 352, w: 40, d: 26, r: 1.4 };
  back.push(S(k.slabOf(LABEL, 0, 0.8, P, 3), { tone: "lo", crease: "none" }));
  back.push(Ln(k.planOutline(k.insetPlan(LABEL, 1.6), 0.8, P, 3), { tone: "faint" }));
  back.push(Ln([26, 18, 22].map((w, i) => k.lineOnTop([LABEL.x + 5 + i * 5, LABEL.y + 5], [LABEL.x + 5 + i * 5, LABEL.y + 5 + w * 0.7], 0.8, P)).join(""), { tone: "lo", free: true }));
  back.push(Dots([at([LABEL.x + LABEL.w - 3, LABEL.y + 3, 0.8]), at([LABEL.x + LABEL.w - 3, LABEL.y + LABEL.d - 3, 0.8])], { size: 0.45 }));
}

// ---------- T-slot table on levelling feet ----------
back.push(`<path class="iso-halo" d="${k.haloOf(TABLE, 0, 10, P)}" style="opacity:.55"/>`);
for (const [x, y] of k.corners(TABLE, 20)) {
  const F = Fz(x, y, 0);
  disc("table.foot.pad", F, 0, 3, 10, { tone: "lo" });
  disc("table.foot.nut", F, 3, 7, 7, { tone: "mid" }, { steps: 6 });
  disc("table.foot.stem", F, 7, 10, 3.6, { tone: "mid" });
}
{
  const slots = [-78, -26, 26, 78].map((y) => k.planOutline({ x: -160, y: y - 4, w: 222, d: 8, r: 4 }, ZT, P, 6)).join("");
  const tableScrews = k.corners(TABLE, 9);
  const t = k.topTicks(TABLE.y + 30, TABLE.y + TABLE.d - 30, 5, 10, TABLE.x + TABLE.w - 9, ZT + 0.5, [1.6, 3.2], P, "y");
  const strip = { x: TABLE.x + TABLE.w - 9.5, y: TABLE.y + 26, w: 6, d: TABLE.d - 52, r: 0.8 };
  const extra =
    Ln(slots, { tone: "lo" }) +
    Ln(tableScrews.map(([x, y]) => k.ring(x, y, 2.2, ZT, P, 16)).join(""), { tone: "lo" }) +
    Dots(tableScrews.map(([x, y]) => at([x, y, ZT])), { size: 0.5 }) +
    S(k.slabOf(strip, ZT, 0.5, P, 3), { tone: "lo", crease: "none" }) +
    Ln(t.minor, { tone: "lo" }) +
    Ln(t.major, { tone: "mid" });
  box("table", [TABLE.x, TABLE.y, 10], [TABLE.x + TABLE.w, TABLE.y + TABLE.d, ZT], { tone: "mid" }, { r: TABLE.r, steps: 6, bevel: 1.2, extra, inner: Ln(k.sideSeam(TABLE, 18, P, 6), { tone: "faint" }), bias: -50 });
}

// ---------- jig, blank, pins and strap clamp ----------
{
  const pocket = k.ring(0, 0, DISC_R + 1.4, ZJ, P, 96);
  const holes = [[-44, 44], [44, -44], [44, 44]];
  const extra = Ln(pocket, { tone: "lo" }) + Ln(k.planOutline(k.insetPlan(JIG, 4), ZJ, P, 4), { tone: "faint" }) + Ln(holes.map(([x, y]) => k.ring(x, y, 2.2, ZJ, P, 16)).join(""), { tone: "lo" }) + Dots(holes.map(([x, y]) => at([x, y, ZJ])), { size: 0.5 });
  box("jig", [JIG.x, JIG.y, ZT], [JIG.x + JIG.w, JIG.y + JIG.d, ZJ], { tone: "mid" }, { r: JIG.r, steps: 4, bevel: 0.8, extra });
  const bore = k.circleRing(0, 0, 4, 32).map(([x, y]) => at([x, y, ZW]));
  const extraD =
    `<path class="iso-shade" data-shade="0" d="${k.pathOf(bore, true)}"/>` +
    Ln(k.ring(0, 0, 4, ZW, P, 32), { tone: "mid" }) +
    Ln(k.ring(0, 0, 6.5, ZW, P, 40), { tone: "faint" }) +
    Ln(k.ring(0, 0, DISC_R - 1.2, ZW, P, 120), { tone: "faint" });
  turned("blank", Fz(0, 0, ZJ), [[0, DISC_R], [ZW - ZJ, DISC_R]], { tone: "hi" }, { extra: extraD, bevel: 0.6 });
  for (const a of [120, 240]) {
    const r = a * (Math.PI / 180);
    const x = (DISC_R + 2.6) * Math.cos(r);
    const y = (DISC_R + 2.6) * Math.sin(r);
    disc("jig.pin", Fz(x, y, ZJ), 0, 6, 2.4, { tone: "mid" }, { extra: Ln(k.ring(x, y, 1.2, ZJ + 6, P, 12), { tone: "lo" }) });
  }
  box("clamp.riser", [-55, -5, ZJ], [-47, 5, ZW], { tone: "lo" });
  box("clamp.strap", [-55, -5, ZW], [-29, 5, ZW + 3.4], { tone: "mid" }, { r: 1, steps: 3, bevel: 0.3 });
  const SF = Fz(-42, 0, ZW + 3.4);
  disc("clamp.washer", SF, 0, 0.8, 4.6, { tone: "lo" });
  turned("clamp.nut", SF, [[0.8, 4.4], [5, 4.4], [5.6, 3.6]], { tone: "mid" }, { extra: ribsX(SF, 1.2, 4.6, 4.4, 28) });
  disc("clamp.stud", SF, 5.6, 10, 1.8, { tone: "mid" });
}

// ---------- a stack of blanks waiting on the table ----------
for (let i = 0; i < 4; i++) {
  const F = Fz(-112, 58, ZT + i * 3);
  turned("stack.blank", F, [[0, DISC_R], [3, DISC_R]], { tone: "mid" }, { bevel: 0.4, extra: i === 3 ? Ln(k.ring(-112, 58, 4, ZT + 12, P, 32), { tone: "mid" }) + `<path class="iso-shade" data-shade="0" d="${k.pathOf(k.circleRing(-112, 58, 4, 32).map(([x, y]) => at([x, y, ZT + 12])), true)}"/>` : "" });
}

// ---------- column, Z carriage, handwheel, arm ----------
{
  const base = { x: COL.x - 10, y: COL.y - 12, w: COL.w + 20, d: COL.d + 24, r: 4 };
  const bolts = k.corners(base, 6);
  box("column.flange", [base.x, base.y, ZT], [base.x + base.w, base.y + base.d, ZT + 10], { tone: "mid" }, {
    r: 4,
    steps: 4,
    bevel: 0.8,
    extra: Ln(bolts.map(([x, y]) => k.ring(x, y, 3, ZT + 10, P, 16)).join(""), { tone: "lo" }) + Dots(bolts.map(([x, y]) => at([x, y, ZT + 10])), { size: 0.55, tone: "hi" }),
  });
  const faceSlots = (z0, z1) =>
    path3([[COL.x + COL.w + 0.02, -4, z0], [COL.x + COL.w + 0.02, 4, z0], [COL.x + COL.w + 0.02, 4, z1], [COL.x + COL.w + 0.02, -4, z1]], true) +
    path3([[CX - 4, COL.y + COL.d + 0.02, z0], [CX + 4, COL.y + COL.d + 0.02, z0], [CX + 4, COL.y + COL.d + 0.02, z1], [CX - 4, COL.y + COL.d + 0.02, z1]], true);
  for (const [z0, z1, slots] of [[ZT + 10, 58, false], [68, CAR.z0, true], [CAR.z1, 452, true], [464, 496, false]]) {
    box("column", [COL.x, COL.y, z0], [COL.x + COL.w, COL.y + COL.d, z1], { tone: "mid" }, { r: COL.r, steps: 3, extra: slots ? Ln(faceSlots(z0 + 8, z1 - 8), { tone: "faint" }) : "" });
  }
  // Z scale on the +x face of the lower column
  const SX = COL.x + COL.w;
  const scaleZ = [70, 300];
  const scaleY = [8, 20];
  const ticks = [];
  const majors = [];
  for (let z = scaleZ[0] + 5; z <= scaleZ[1] - 5; z += 5) {
    const big = z % 50 === 0;
    (big ? majors : ticks).push(path3([[SX + 0.62, scaleY[0], z], [SX + 0.62, scaleY[0] + (big ? 7 : 3.6), z]]));
  }
  box("column.scale", [SX, scaleY[0], scaleZ[0]], [SX + 0.6, scaleY[1], scaleZ[1]], { tone: "lo" }, { r: 0.2, steps: 1, extra: Ln(ticks.join(""), { tone: "lo" }) + Ln(majors.join(""), { tone: "mid" }) + Dots([at([SX + 0.6, 17, scaleZ[0] + 3]), at([SX + 0.6, 17, scaleZ[1] - 3])], { size: 0.4 }) });
  // carriage
  const CPL = { x: COL.x - 8, y: COL.y - 8, w: COL.w + 16, d: COL.d + 16, r: 4 };
  const gibs = [[CPL.x + CPL.w, -26, CAR.z0 + 8], [CPL.x + CPL.w, 26, CAR.z0 + 8], [CPL.x + CPL.w, -26, CAR.z1 - 8], [CPL.x + CPL.w, 26, CAR.z1 - 8]];
  box("carriage", [CPL.x, CPL.y, CAR.z0], [CPL.x + CPL.w, CPL.y + CPL.d, CAR.z1], { tone: "mid" }, {
    r: 4,
    steps: 4,
    bevel: 0.6,
    inner: Ln(k.sideSeam(CPL, CAR.z0 + 30, P, 4), { tone: "faint" }),
    extra: Dots(gibs.map(at), { size: 0.5, tone: "hi" }) + Dots([at([CPL.x + 6, CPL.y + CPL.d - 6, CAR.z1]), at([CPL.x + CPL.w - 6, CPL.y + CPL.d - 6, CAR.z1])], { size: 0.45 }),
  });
  box("carriage.pointer", [SX, 9, CAR.z0 - 6], [SX + 2.4, 19, CAR.z0], { tone: "hi" }, { r: 0.3, steps: 1 });
  // lock knob on the carriage's +x face
  const KF = Fx(CPL.x + CPL.w, 22, 352);
  disc("carriage.lock.stem", KF, 0, 6, 2.2, { tone: "mid" });
  disc("carriage.lock.knob", KF, 6, 13, 6, { tone: "hi" }, { extra: ribsX(KF, 6, 13, 6, 30) });
  // cap and handwheel
  box("column.cap", [COL.x - 2, COL.y - 2, 496], [COL.x + COL.w + 2, COL.y + COL.d + 2, 502], { tone: "lo" }, { r: 4, steps: 3, bevel: 0.5 });
  const HF = Fz(CX, 0, 502);
  disc("wheel.hub", HF, 0, 8, 10, { tone: "mid" });
  turned("wheel", HF, [[8, 30], [8, 34], [9, 35, 1], [15, 35, 1], [16, 34], [16, 30]], { tone: "mid" }, {
    extra: Ln(G.circleOf(HF, 16, 24, P, 96), { tone: "faint" }) + Ln(G.circleOf(HF, 16, 7, P, 40), { tone: "lo" }) + Dots([0, 1, 2].map((i) => at(G.pointOf(HF, 16, 15, (i / 3) * Math.PI * 2 + 0.6))), { size: 0.5, tone: "hi" }),
  });
  const GF = Fz(CX + 26 * Math.cos(-0.4), 26 * Math.sin(-0.4), 518);
  disc("wheel.grip.stem", GF, 0, 4, 2.2, { tone: "mid" });
  turned("wheel.grip", GF, [[4, 3.4], [5, 4, 1], [17, 4, 1], [19, 3.2, 1], [20, 2.2]], { tone: "hi" });
  // stop collars on the column above and below the carriage travel
  for (const [z0, z1] of [[58, 68], [452, 464]]) {
    const SP = { x: COL.x - 3, y: COL.y - 3, w: COL.w + 6, d: COL.d + 6, r: 3.5 };
    box("column.stop", [SP.x, SP.y, z0], [SP.x + SP.w, SP.y + SP.d, z1], { tone: "lo" }, { r: 3.5, steps: 3, bevel: 0.4, inner: Ln(k.sideSeam(SP, (z0 + z1) / 2, P, 3), { tone: "faint" }), extra: Dots([at([SP.x + SP.w, -14, (z0 + z1) / 2]), at([SP.x + SP.w, 14, (z0 + z1) / 2])], { size: 0.5, tone: "hi" }) });
  }
  // arm from carriage to head
  box("arm", [CPL.x + CPL.w, -34, 328], [-52, -4, 348], { tone: "mid" }, {
    r: 2,
    steps: 3,
    bevel: 0.6,
    inner: Ln(k.sideSeam({ x: CPL.x + CPL.w, y: -34, w: -52 - CPL.x - CPL.w, d: 30, r: 2 }, 338, P, 3), { tone: "faint" }),
    extra: Dots([at([CPL.x + CPL.w + 8, -26, 348]), at([CPL.x + CPL.w + 8, -12, 348]), at([-62, -26, 348]), at([-62, -12, 348])], { size: 0.5, tone: "hi" }),
  });
}

// ---------- galvo head (top front and +y wall cut away) ----------
{
  const HP = { x: -52, y: -46, w: 96, d: 84, r: 4 };
  box("head.floor", [HP.x, HP.y, ZF], [HP.x + HP.w, HP.y + HP.d, ZF + 8], { tone: "mid" }, {
    r: 4,
    steps: 4,
    bevel: 0.6,
    extra: Ln(k.ring(0, 0, 15, ZF + 8, P, 64), { tone: "lo" }) + Ln(k.ring(0, 0, 18.5, ZF + 8, P, 64), { tone: "faint" }) + `<path class="iso-shade" data-shade="0" d="${k.pathOf(k.circleRing(0, 0, 15, 64).map(([x, y]) => at([x, y, ZF + 8])), true)}"/>`,
  });
  box("head.wall.back", [HP.x, HP.y, ZF + 8], [HP.x + 6, HP.y + HP.d, 360], { tone: "mid" }, { r: 1, steps: 2 });
  box("head.wall.left", [HP.x + 6, HP.y, ZF + 8], [44, HP.y + 6, 360], { tone: "mid" }, { r: 1, steps: 2 });
  box("head.wall.right", [38, HP.y + 6, ZF + 8], [44, 38, 360], { tone: "mid" }, {
    r: 1,
    steps: 2,
    extra: Dots([[44, -32, 296], [44, 30, 296], [44, -32, 352], [44, 30, 352]].map(at), { size: 0.5, tone: "hi" }) + Ln(path3([[44.02, -24, 304], [44.02, 22, 304], [44.02, 22, 344], [44.02, -24, 344]], true), { tone: "faint" }),
  });
  box("head.wall.stub", [HP.x + 6, 32, ZF + 8], [38, 38, 300], { tone: "mid" }, { r: 1, steps: 2, extra: Dots([[-30, 38, 294], [6, 38, 294], [30, 38, 294]].map(at), { size: 0.45 }) });
  box("head.post", [-31, 32, 300], [-17, 38, 360], { tone: "mid" }, { r: 1, steps: 2 });
  box("head.top", [HP.x, HP.y, 360], [44, -24, 367], { tone: "mid" }, { r: 2, steps: 3, bevel: 0.5, extra: Dots([[-46, -40, 367], [38, -40, 367], [38, -30, 367]].map(at), { size: 0.45 }) });
  box("head.tongue", [-38, -24, 360], [-10, 10, 367], { tone: "mid" }, { r: 2, steps: 3, bevel: 0.4, extra: Dots([[-34, 6, 367], [-14, 6, 367]].map(at), { size: 0.45 }) });
  // DB15 connector block on the top strip
  box("head.db15", [-50, -44, 367], [-38, -28, 374], { tone: "lo" }, { r: 0.6, extra: Dots([at([-44, -41, 374]), at([-44, -31, 374])], { size: 0.45, tone: "hi" }) });
  // input aperture inside the post
  const IF = Fy(-24, 32, ZB, -1);
  turned("head.aperture", IF, [[0, 7], [8, 7]], { tone: "mid" }, { extra: Ln(G.circleOf(IF, 8, 4.2, P, 40), { tone: "lo" }) });
  // X galvo: vertical motor on the tongue, shaft and mount down to mirror 1
  const XF = Fz(M1[0], M1[1], 367);
  disc("galvo.x.flange", XF, 0, 3, 13, { tone: "lo" }, { extra: Dots(G.dotsOf(XF, 3, 10.5, 4, P, { all: true, phase: 0.4 }), { size: 0.45, tone: "hi" }) });
  turned("galvo.x.body", XF, [[3, 12], [52, 12], [53, 11.4, 1], [54, 10.6]], { tone: "mid" }, { inner: Ln(G.arcOf(XF, 14, 12, P) + G.arcOf(XF, 40, 12, P), { tone: "faint" }) });
  disc("galvo.x.cap", XF, 54, 60, 9, { tone: "lo" });
  disc("galvo.x.gland", XF, 60, 65, 3.6, { tone: "mid" });
  disc("galvo.x.shaft", Fz(M1[0], M1[1], 333), 0, 27, 2.2, { tone: "mid" });
  disc("galvo.x.collar", Fz(M1[0], M1[1], 328), 0, 5, 4.5, { tone: "mid" }, { steps: 24 });
  // Y galvo: horizontal motor through the left (-y) wall, shaft and mount to mirror 2
  const YF = Fy(0, HP.y, ZB, -1);
  disc("galvo.y.flange", YF, 0, 3, 13, { tone: "lo" });
  turned("galvo.y.body", YF, [[3, 12], [50, 12], [51, 11.4, 1], [52, 10.6]], { tone: "mid" });
  disc("galvo.y.shaft", Fy(0, -40, ZB), 0, 27.5, 2.2, { tone: "mid" });
  disc("galvo.y.collar", Fy(0, -12.5, ZB), 0, 4.5, 4.5, { tone: "mid" }, { steps: 24 });
  // combiner block, red aiming diode, isolator and boot on the +y side
  box("head.combiner", [-36, 38, 308], [-12, 58, 336], { tone: "mid" }, { r: 1.6, steps: 3, bevel: 0.4, extra: Dots([[-33, 58, 312], [-15, 58, 312], [-33, 58, 332], [-15, 58, 332]].map(at), { size: 0.45, tone: "hi" }) });
  const RF = Fz(-24, 48, 336);
  turned("head.red", RF, [[0, 5.5], [3, 5.5], [3, 4.6], [16, 4.6], [16, 3.4], [19, 3.4]], { tone: "mid" }, { extra: ribsX(RF, 6, 14, 4.6, 22) });
  const ISO = Fy(-24, 58, ZB);
  turned("isolator", ISO, [[0, 8.5], [3, 8.5], [3, 12], [56, 12], [56, 9], [62, 9], [62, 7.6], [82, 5.2]], { tone: "mid" }, {
    inner: Ln(G.arcOf(ISO, 12, 12, P) + G.arcOf(ISO, 24, 12, P) + G.arcOf(ISO, 46, 12, P), { tone: "faint" }),
    extra: Dots(G.dotsOf(ISO, 35, 12, 6, P, { fade: [0.04, 0.42] }), { size: 0.4, tone: "lo" }) + Dots([at(G.pointOf(ISO, 8, 12, Math.PI * 0.55)), at(G.pointOf(ISO, 8, 12, Math.PI * 0.8))], { size: 0.5, tone: "hi" }),
  });
}

// ---------- the F-theta lens under the head ----------
{
  const LF = G.frameOf([0, 0, ZF], [0, 0, -1], [1, 0, 0], [0, 1, 0]);
  turned("lens", LF, [[0, 36], [6, 36], [6, 32], [16, 32], [16, 33.5], [32, 33.5], [32, 32], [40, 32], [40, 29], [48, 29]], { tone: "mid" }, {
    inner: Ln(G.arcOf(LF, 11, 32, P), { tone: "faint" }),
    extra: Faded(G.ribsOf(LF, 16, 32, 33.5, 80, P, { fade: [0.1, 0.55], seams: true }), { tone: "lo" }) + Dots(G.dotsOf(LF, 3, 36, 8, P, { fade: [0.04, 0.42] }), { size: 0.5, tone: "hi" }),
  });
}

// ---------- mirrors (rebuilt live when they turn) ----------
const MIRROR = {
  m1: { o: M1, a: [0, 0, 1], u: G.unit3([1, -1, 0]), v: G.unit3([1, 1, 0]), w: 7.5, t: 0.8, h: 6 },
  m2: { o: M2, a: [0, 1, 0], u: G.unit3([1, 0, -1]), v: G.unit3([-1, 0, -1]), w: 8, t: 0.8, h: 8 },
};
for (const [name, m] of Object.entries(MIRROR)) {
  const F = G.frameOf(m.o, m.a, m.u, m.v);
  const poly = rect(-m.w, m.w, -m.t, m.t);
  const shape = record(A.prism(F, poly, -m.h, m.h, { name: `mirror.${name}` }));
  put(`mirror.${name}`, m.o, `<g data-part="${name}">${S(G.prismOf(F, poly, -m.h, m.h, P), { tone: "hi", lit: true })}</g>`, [shape], { bias: 0.2 });
}

// ---------- the source and control chassis, covers off ----------
{
  const { x0, x1, y0, y1, z0 } = BOX;
  for (const [x, y] of byDepth([[x0 + 16, y0 + 16], [x1 - 16, y0 + 16], [x0 + 16, y1 - 16], [x1 - 16, y1 - 16]])) disc("box.foot", Fz(x, y, 0), 0, z0, 8, { tone: "lo" });
  back.push(`<path class="iso-halo" d="${k.haloOf({ x: x0, y: y0, w: x1 - x0, d: y1 - y0, r: 3 }, 0, 8, P)}" style="opacity:.55"/>`);
  box("box.floor", [x0, y0, z0], [x1, y1, z0 + 4], { tone: "lo" }, { r: 3, steps: 3, bias: -40 });
  const ZB0 = z0 + 4;
  const ZBT = 116;
  box("box.rear", [x0, y0, ZB0], [x1, y0 + 3, ZBT], { tone: "mid" }, { r: 0.5, steps: 1, bias: -30, extra: Dots([-270, -150, -30, 20].map((x) => at([x, y0 + 3, ZBT - 5])), { size: 0.45 }) });
  box("box.end", [x0, y0 + 3, ZB0], [x0 + 3, y1, ZBT], { tone: "mid" }, { r: 0.5, steps: 1, bias: -30 });
  // front panel (+x end) with key switch, power button, emission lamp, engraved plate and vents
  const vents = Array.from({ length: 9 }, (_, i) => {
    const yc = 214 + i * 9;
    return path3([[x1 + 0.02, yc - 1.4, 24], [x1 + 0.02, yc + 1.4, 24], [x1 + 0.02, yc + 1.4, 46], [x1 + 0.02, yc - 1.4, 46]], true);
  }).join("");
  box("box.front", [x1 - 3, y0 + 3, ZB0], [x1, y1, ZBT], { tone: "mid" }, {
    r: 0.5,
    steps: 1,
    extra: Ln(vents, { tone: "lo" }) + Dots([[x1, 190, 20], [x1, 392, 20], [x1, 190, 108], [x1, 392, 108]].map(at), { size: 0.5, tone: "hi" }),
  });
  const KEY = Fx(x1, 236, 84);
  disc("box.key.bezel", KEY, 0, 2, 8, { tone: "lo" });
  disc("box.key", KEY, 2, 7, 5.5, { tone: "hi" }, { extra: Ln(path3([[x1 + 7.02, 236, 81.4], [x1 + 7.02, 236, 86.6]]), { tone: "lo", free: true }) });
  const PWR = Fx(x1, 266, 84);
  disc("box.power.bezel", PWR, 0, 2, 7.6, { tone: "lo" });
  disc("box.power", PWR, 2, 5, 6, { tone: "hi" }, { extra: Ln(G.circleOf(PWR, 5, 3.4, P, 28), { tone: "lo" }) });
  const LED = Fx(x1, 292, 84);
  disc("box.lamp.bezel", LED, 0, 1.6, 4.4, { tone: "lo" });
  put("box.lamp", [x1 + 2.2, 292, 84], `<g class="fl-lamp" data-part="lamp">${S(G.disc(1.6, 3, 3, LED, P, { steps: 24 }), { tone: "hi" })}</g>`, [record(A.disc(LED, 1.6, 3, 3, { name: "box.lamp" }))], { bias: 0.3 });
  {
    const plate = { y0: 318, y1: 386, z0: 68, z1: 98 };
    const m = planeMatrix([x1 + 0.62, (plate.y0 + plate.y1) / 2, (plate.z0 + plate.z1) / 2], [0, -1, 0], [0, 0, -1]);
    const text = k.faceTextSvg(m, "TEAL", { size: 9.5, tone: "mid", anchor: "middle" }).replace("<text", '<text dy="3.3" font-weight="600"');
    box("box.plate", [x1, plate.y0, plate.z0], [x1 + 0.6, plate.y1, plate.z1], { tone: "lo" }, {
      r: 0.3,
      steps: 1,
      extra: Ln(path3([[x1 + 0.62, plate.y0 + 2, plate.z0 + 2], [x1 + 0.62, plate.y1 - 2, plate.z0 + 2], [x1 + 0.62, plate.y1 - 2, plate.z1 - 2], [x1 + 0.62, plate.y0 + 2, plate.z1 - 2]], true), { tone: "faint" }) + text,
    });
  }
  // lips where the lid and the side panel screw on
  box("box.lip.top", [x0 + 3, y0 + 3, ZBT - 8], [x1 - 3, y0 + 9, ZBT - 4], { tone: "lo" }, { r: 0.3, steps: 1, extra: Dots([-250, -170, -90, -10].map((x) => at([x, y0 + 6, ZBT - 4])), { size: 0.45 }) });
  box("box.lip.side", [x0 + 3, y1 - 6, ZB0], [x1 - 3, y1, ZB0 + 4], { tone: "lo" }, { r: 0.3, steps: 1, extra: Dots([-260, -180, -100, -20].map((x) => at([x, y1 - 3, ZB0 + 4])), { size: 0.45 }) });
  box("box.divider", [-122, 204, ZB0], [-120, y1 - 6, 36], { tone: "lo" }, { r: 0.2, steps: 1 });

  // --- laser side (far end, by the fans): heat-sink plate, pump diodes, combiner, gain-fibre spool, AOM, RF driver ---
  for (const yc of [238, 332]) {
    const F = Fx(x0 + 3, yc, 66);
    prism("fan.frame", F, rect(-30, 30, -30, 30), 0, 8, { tone: "mid" }, { extra: Dots([[-25, -25], [25, -25], [-25, 25], [25, 25]].map(([u, v]) => at([x0 + 11, yc + u, 66 + v])), { size: 0.5, tone: "hi" }) });
    const m = planeMatrix([x0 + 11.05, yc, 66], [0, -1, 0], [0, 0, -1]);
    const blades = Array.from({ length: 7 }, (_, i) => {
      const a = (i / 7) * Math.PI * 2;
      const pt = (r, da) => [r * Math.cos(a + da), r * Math.sin(a + da)].map((v) => f2(v)).join(" ");
      return `M${pt(9, 0)}Q${pt(18, 0.25)} ${pt(25, 0.12)}L${pt(25, 0.62)}Q${pt(17, 0.72)} ${pt(9, 0.7)}Z`;
    }).join("");
    const guard = [27, 19, 11].map((r) => `M${r} 0A${r} ${r} 0 1 1 ${-r} 0A${r} ${r} 0 1 1 ${r} 0Z`).join("");
    const spokes = [0, 1, 2, 3].map((i) => `M${f2(8.6 * Math.cos(i * Math.PI / 2 + 0.785))} ${f2(8.6 * Math.sin(i * Math.PI / 2 + 0.785))}L${f2(27 * Math.cos(i * Math.PI / 2 + 0.785))} ${f2(27 * Math.sin(i * Math.PI / 2 + 0.785))}`).join("");
    put("fan.rotor", [x0 + 11.1, yc, 66], `<g transform="${m}"><circle class="fl-fan-hole" r="28"/><path class="fl-blade" d="${blades}"/><circle class="fl-fan-hub" r="8.6"/><path class="fl-guard" d="${guard}${spokes}"/></g>`, [record(A.disc(F, 8, 8.2, 28, { name: "fan.rotor" }))], { bias: 0.2 });
  }
  const HS = { x: -276, y: 190, w: 148, d: 196, r: 1.5 };
  const hsScrews = k.corners(HS, 5);
  box("heatsink", [HS.x, HS.y, ZB0], [HS.x + HS.w, HS.y + HS.d, 18], { tone: "lo" }, { r: 1.5, steps: 2, bevel: 0.4, extra: Dots(hsScrews.map(([x, y]) => at([x, y, 18])), { size: 0.45, tone: "mid" }) });
  const PUMPS = [304, 320, 336, 352];
  for (const yc of PUMPS) {
    box("pump", [-158, yc - 6.5, 18], [-138, yc + 6.5, 27], { tone: "hi" }, {
      r: 0.8,
      steps: 2,
      bevel: 0.3,
      extra: Ln(k.planOutline({ x: -156, y: yc - 4.5, w: 16, d: 9, r: 0.6 }, 27, P, 2), { tone: "faint" }) + Dots([at([-138, yc - 3, 21]), at([-138, yc + 3, 21])], { size: 0.4, tone: "lo" }),
    });
    disc("pump.boot", Fx(-158, yc, 22, -1), 0, 4, 1.8, { tone: "mid" });
  }
  const CF = Fx(-190, 328, 21.2, -1);
  turned("combiner", CF, [[0, 3.2], [4, 3.2], [4, 2.6], [32, 2.6], [32, 3.2], [36, 3.2]], { tone: "hi" }, { inner: Ln(G.arcOf(CF, 18, 2.6, P), { tone: "faint" }) });
  const SPC = [-184, 264];
  const SPF = Fz(SPC[0], SPC[1], 18);
  turned("spool", SPF, [[0, 34], [1.4, 34], [1.4, 31], [10, 31], [10, 34], [11.4, 34]], { tone: "hi" }, {
    owner: "spool",
    extra: Ln([22, 25, 28].map((r) => G.circleOf(SPF, 11.4, r, P, 96)).join(""), { tone: "faint" }) + Ln(G.circleOf(SPF, 11.4, 14, P, 64), { tone: "lo" }) + Dots(G.dotsOf(SPF, 11.4, 18, 3, P, { all: true, phase: 0.3 }), { size: 0.5, tone: "hi" }),
  });
  put(
    "spool.coil",
    [SPC[0], SPC[1], 23],
    `<g class="fl-coil">${Ln([3, 5, 7, 9].map((s) => G.arcOf(SPF, 1.4 + s * 0.9, 31.05, P)).join(""), { tone: "lo" })}</g>`,
    [record(A.disc(SPF, 1.4, 10, 31.05, { name: "spool.coil", owner: "spool" }))],
    { bias: 0.1 },
  );
  box("aom", [-194, 210, 18], [-174, 222, 30], { tone: "hi" }, { r: 0.8, steps: 2, bevel: 0.3, inner: Ln(k.sideSeam({ x: -194, y: 210, w: 20, d: 12, r: 0.8 }, 26, P, 2), { tone: "faint" }), extra: Dots([at([-191, 220, 30]), at([-177, 220, 30])], { size: 0.4 }) });
  disc("aom.sma", Fz(-184, 216, 30), 0, 4.6, 1.8, { tone: "mid" });
  const RFB = { x0: -272, x1: -218, y0: 196, y1: 246, z: 24 };
  for (const [x, y] of [[RFB.x0 + 4, RFB.y0 + 4], [RFB.x1 - 4, RFB.y0 + 4], [RFB.x0 + 4, RFB.y1 - 4], [RFB.x1 - 4, RFB.y1 - 4]]) disc("rf.standoff", Fz(x, y, 18), 0, RFB.z - 18, 2, { tone: "lo" });
  box("rf.board", [RFB.x0, RFB.y0, RFB.z], [RFB.x1, RFB.y1, RFB.z + 1.6], { tone: "lo" }, { r: 0.6, extra: Ln(path3([[-262, 236, RFB.z + 1.62], [-246, 236, RFB.z + 1.62], [-246, 222, RFB.z + 1.62]]), { tone: "faint" }) + Dots([at([-262, 236, RFB.z + 1.62]), at([-246, 222, RFB.z + 1.62])], { size: 0.32, tone: "lo" }) });
  box("rf.amp", [-258, 204, RFB.z + 1.6], [-240, 220, RFB.z + 6], { tone: "mid" }, { r: 0.4, extra: Dots([at([-256, 206, RFB.z + 6]), at([-242, 218, RFB.z + 6])], { size: 0.4, tone: "hi" }) });
  box("rf.osc", [-268, 228, RFB.z + 1.6], [-260, 238, RFB.z + 4], { tone: "hi" }, { r: 0.3 });
  disc("rf.sma", Fz(-226, 216, RFB.z + 1.6), 0, 4.4, 1.8, { tone: "mid" });

  // --- control side (by the front panel): PSU and control card ---
  {
    const PSU = { x: -80, y: 296, w: 104, d: 86, r: 1 };
    const perf = k.dotGrid(PSU.x + 8, PSU.y + 8, 15, 11, 6, 56, P);
    box("psu", [PSU.x, PSU.y, ZB0], [PSU.x + PSU.w, PSU.y + PSU.d, 56], { tone: "mid" }, {
      r: 1,
      steps: 2,
      bevel: 0.4,
      inner: Ln(k.sideSeam(PSU, 46, P, 2), { tone: "faint" }),
      extra: Dots(perf, { size: 0.4, tone: "lo" }),
    });
    box("psu.terminals", [PSU.x + 20, PSU.y + PSU.d, 18], [PSU.x + 66, PSU.y + PSU.d + 4, 30], { tone: "lo" }, { r: 0.4, extra: Dots([0, 1, 2, 3, 4, 5].map((i) => at([PSU.x + 23.5 + i * 7.6, PSU.y + PSU.d + 4, 24])), { size: 0.5, tone: "hi" }) });
  }
  {
    const CARD = { x0: -112, x1: 20, y0: 206, y1: 286, z: 20 };
    for (const [x, y] of [[CARD.x0 + 5, CARD.y0 + 5], [CARD.x1 - 5, CARD.y0 + 5], [CARD.x0 + 5, CARD.y1 - 5], [CARD.x1 - 5, CARD.y1 - 5]]) disc("card.standoff", Fz(x, y, ZB0), 0, CARD.z - ZB0, 2.4, { tone: "lo" });
    const traces = [];
    const pads = [];
    const lane = (pts) => {
      traces.push(path3(pts.map(([x, y]) => [x, y, CARD.z + 1.62])));
      pads.push(at([...pts[0], CARD.z + 1.62]), at([...pts[pts.length - 1], CARD.z + 1.62]));
    };
    lane([[-76, 240], [-76, 226], [-56, 226]]);
    lane([[-66, 248], [-40, 248], [-40, 232]]);
    lane([[-20, 246], [-4, 246], [-4, 262]]);
    lane([[-86, 262], [-86, 276], [-60, 276]]);
    lane([[-30, 272], [2, 272]]);
    box("card", [CARD.x0, CARD.y0, CARD.z], [CARD.x1, CARD.y1, CARD.z + 1.6], { tone: "lo" }, { r: 0.8, steps: 2, extra: Ln(traces.join(""), { tone: "faint" }) + Dots(pads, { size: 0.32, tone: "lo" }) });
    const chip = (name, x, y, w, d, h = 1.6, tone = "hi") => {
      const pins = [];
      for (let i = 1; i < w - 0.6; i += 1.6) pins.push(at([x + i, y - 0.3, CARD.z + 1.6]), at([x + i, y + d + 0.3, CARD.z + 1.6]));
      box(name, [x, y, CARD.z + 1.6], [x + w, y + d, CARD.z + 1.6 + h], { tone }, { r: 0.3, steps: 1, extra: Dots(pins, { size: 0.24, tone: "lo" }) + Dots([at([x + 1.2, y + 1.2, CARD.z + 1.6 + h])], { size: 0.34, tone: "lo" }) });
    };
    chip("card.fpga", -60, 232, 16, 16, 2.2);
    chip("card.dsp", -100, 252, 10, 10);
    chip("card.dac", -24, 254, 9, 6);
    chip("card.dac", -10, 254, 9, 6);
    chip("card.ram", -100, 232, 12, 6);
    chip("card.driver", -26, 232, 12, 8);
    box("card.header", [-90, 210, CARD.z + 1.6], [-70, 218, CARD.z + 7], { tone: "mid" }, { r: 0.4, extra: Dots([-86, -82, -78, -74].map((x) => at([x, 214, CARD.z + 7])), { size: 0.35, tone: "hi" }) });
    box("card.db25", [-8, 270, CARD.z + 1.6], [14, 282, CARD.z + 8], { tone: "mid" }, { r: 0.5 });
    for (const [x, y, r, h] of [[-44, 270, 2.6, 6], [-36, 270, 2.6, 6], [-104, 278, 2, 4.4], [-104, 216, 1.8, 4]]) disc("card.cap", Fz(x, y, CARD.z + 1.6), 0, h, r, { tone: "hi" }, { extra: Ln(k.ring(x, y, r * 0.6, CARD.z + 1.6 + h, P, 16), { tone: "lo" }) });
    put("card.led", [12, 220, CARD.z + 2], `<g class="fl-lamp" data-part="card-led">${Dots([at([12, 220, CARD.z + 2])], { size: 0.9, tone: "hi" })}</g>`, [record(A.ball([12, 220, CARD.z + 2], 0.6, { name: "card.led" }))], { bias: 0.3 });
  }
  // rear wall, inside: laser-safety plate in the laser bay, DIN rail and terminals in the control bay
  {
    const yw = y0 + 3;
    box("box.warning", [-262, yw, 70], [-212, yw + 0.6, 96], { tone: "lo" }, {
      r: 0.3,
      steps: 1,
      extra: Ln(path3([[-260, yw + 0.62, 72], [-214, yw + 0.62, 72], [-214, yw + 0.62, 94], [-260, yw + 0.62, 94]], true), { tone: "faint" }) + Ln([[-255, 89, 30], [-255, 84, 22], [-255, 79, 26]].map(([x, z, w]) => path3([[x, yw + 0.62, z], [x + w, yw + 0.62, z]])).join(""), { tone: "lo", free: true }),
    });
    box("din.rail", [-104, yw, 74], [16, yw + 3, 80], { tone: "lo" }, { r: 0.3, steps: 1 });
    for (let i = 0; i < 7; i++) {
      const xa = -98 + i * 9;
      box("din.terminal", [xa, yw + 3, 70], [xa + 7, yw + 11, 86], { tone: i === 6 ? "hi" : "mid" }, { r: 0.4, steps: 1, extra: Dots([at([xa + 3.5, yw + 11, 82]), at([xa + 3.5, yw + 11, 74])], { size: 0.4, tone: "hi" }) });
    }
  }
  // bulkhead nuts on the rear wall's inside face
  disc("bulkhead.fiber", Fy(-24, y0 + 3, 24), 0, 3, 6, { tone: "mid" }, { steps: 6 });
  disc("bulkhead.galvo", Fy(-80, y0 + 3, 50), 0, 3, 6, { tone: "mid" }, { steps: 6 });

  // --- fibres and cables inside the chassis ---
  PUMPS.forEach((yc, i) => {
    const o = (i - 1.5) * 1.1;
    cable(`pigtail.${i}`, [[-162, yc, 22], [-170, yc, 22], [-184, 328 + o, 21.2], [-190, 328 + o, 21.2]], 0.5, { tone: "hi", bend: 2.4, ends: [false, false], bundle: "pump" });
  });
  cable("fibre.gain", [[-226, 328, 21.2], [-246, 328, 21.2], [-246, SPC[1], 22.4], [SPC[0] - 31.05, SPC[1], 22.4]], 0.6, { tone: "hi", bend: 7, ends: [false, false] });
  cable("fibre.aom", [[SPC[0], SPC[1] - 31.05, 24], [SPC[0], 222, 24]], 0.6, { tone: "hi", bend: 3, ends: [false, false] });
  cable("fibre.out", [[-184, 210, 24], [-184, 198, 24], [-24, 198, 24], [-24, 186, 24]], 0.6, { tone: "hi", bend: 5.5, ends: [false, false] });
  cable("coax.rf", [[-184, 216, 34.6], [-184, 216, 46], [-226, 216, 46], [-226, 216, RFB.z + 6]], 0.8, { tone: "mid", bend: 5, ends: [false, false] });
  cable("ribbon.galvo", [[-80, 186, 50], [-80, 214, 50], [-80, 214, 27]], 1.2, { tone: "mid", bend: 8, ends: [false, false] });
}

// ---------- outside cables: armoured fibre to the isolator, galvo cable down the column ----------
const ARMOUR = cable("armour", [[-24, 140, ZB], [-24, 166, ZB], [-24, 166, 26], [-24, 180, 26]], 4.2, {
  tone: "mid",
  bend: 12,
  ends: [false, false],
  maxLength: 16,
  rings: { pitch: 2.4, fade: [0.12, 0.6] },
});
const LANE = 48;
const CLAMPS = [140, 230].map((z) => ({ at: [CX, LANE, z], axis: [0, 0, 1], r: 2.6, t: 6, z }));
for (const c of CLAMPS) {
  box("clip.bracket", [CX - 5, COL.y + COL.d, c.z - 3], [CX + 5, LANE - 4.2, c.z + 3], { tone: "lo" }, { r: 0.4, steps: 1 });
  disc("clip", Fz(CX, LANE, c.z - 3), 0, 6, 4.2, { tone: "mid" }, { steps: 24 });
}
cable("galvo.cable", [[-44, -36, 374], [-44, -36, 394], [-150, -36, 394], [-150, LANE, 394], [CX, LANE, 394], [CX, LANE, 50], [CX, 140, 50], [-80, 140, 50], [-80, 180, 50]], 2.4, {
  tone: "mid",
  bend: 9,
  ends: [false, false],
  clamps: CLAMPS.map((c) => ({ at: [CX, LANE, c.z], axis: [0, 0, 1], r: 4.2, t: 6 })),
  touch: ["clip*"],
});

// ---------- order, slots and page ----------
A.settle(R, P);
R.items.sort((a, b) => a.key - b.key);
const indexOf = (name) => R.items.findIndex((item) => item.name === name);
const slots = new Map();
const addSlot = (index, svg) => slots.set(index, (slots.get(index) ?? "") + svg);
addSlot(indexOf("blank"), `<g data-part="mark"></g><g data-part="mark-now"></g>`);
addSlot(indexOf("mirror.m1"), `<g data-part="beam-in"></g>`);
addSlot(indexOf("lens") - 1, `<g data-part="beam-out"></g><g data-part="spot"></g>`);
const groups = R.items.map((item, index) => `<g class="it" data-name="${item.name}"${item.attrs ?? ""}>${item.svg}</g>${slots.get(index) ?? ""}`);

const LABEL_TEXT =
  "A 25 watt pulsed fiber laser marking system on a bench. Left: the source and control chassis with its covers off: four pump diodes, a pump combiner, the coiled ytterbium gain fiber, an acousto-optic Q-switch, its RF driver, the control card, power supply and fans. An armored fiber cable rises to an isolator on the galvo scan head, which hangs from an arm on a Z column with a handwheel. The head is cut open to show two mirrors on galvanometer motors; under it an F-theta lens focuses the beam onto a steel dial blank clamped on a T-slot table, where the beam engraves a dial scale.";
const svg = k.figureSvg({ width: W, height: H, label: LABEL_TEXT, className: "fl-back", body: [...back, `<g class="fl-rig">${groups.join("")}</g>`] });

const job = jobPath();
const totals = jobTotals();
const markPts = job.map((m) => ({ kind: m.kind, len: m.len, pts: m.pts.map(([x, y]) => [f2(x), f2(y)]) }));
const DATA = {
  P,
  V,
  W,
  H,
  camera: glCamera(P),
  model: MODEL,
  spot: spot(),
  zw: ZW,
  lensBot: LENS_BOT,
  zf: ZF + 8,
  m1: M1,
  m2: M2,
  inPort: [-24, 24, ZB],
  mirrors: MIRROR,
  job: markPts,
  totals,
  dial: DIAL,
};

const CSS = readFileSync(join(HERE, "fl.css"), "utf8");
const latheSource = readFileSync(join(KITDIR, "lathe.mjs"), "utf8").replace(/^import [^;]*;$/gm, "").replace(/^export /gm, "");
const latheScript = `const G = (() => {${latheSource}\nreturn { viewOf, frameOf, prismOf, dot3, add3, sub3, mul3, unit3, cross3 };})();\n`;
const modelScript = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const LIVE = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));

const f0 = 40;
const body =
  `<style>${CSS}</style>` +
  k.plateHtml({
    fig: "Fig 1",
    title: "Fiber laser marker · 25 W",
    hint: "Hover: pulse rate · click: mark",
    readout: `ready · ${f0} kHz · ${pulseEnergy(f0).toFixed(2)} mJ`,
    keys: [
      { mark: "lit", label: "Beam path: isolator, two galvo mirrors, F-theta lens, spot" },
      { mark: "red", label: "650 nm aiming diode: traces the job before the laser fires" },
      { mark: "raised", label: "Source: pump diodes, combiner, gain-fiber spool, AOM Q-switch" },
    ],
    caption: `A split-type marker with the covers off. Four 915 nm pump diodes feed a combiner and a coiled ytterbium-doped fiber; an acousto-optic Q-switch dumps the stored energy as ${MODEL.lambda} nm pulses about 100–140 ns long, ${MODEL.power} W on average and ${MODEL.eMax.toFixed(1)} mJ each at ${MODEL.fMin} kHz. The armored cable ends in an isolator that sends a ${MODEL.beam} mm beam into the head. The first mirror steers the spot in X, the second in Y, and the F${MODEL.focal} lens turns each beam angle into a position, x = f·θ, so a mirror turning by δ moves the spot 2f·δ, and a ${(MODEL.field / 2).toFixed(0)} mm move needs about ${((MODEL.field / 2 / MODEL.focal / 2) * (180 / Math.PI)).toFixed(1)}° of mirror. The focused spot is ${(spot() * 1000).toFixed(0)} µm across at ${MODEL.wd} mm working distance. Raising the pulse rate keeps the average power but splits it into smaller, gentler pulses: at ${MODEL.fMin} kHz they ablate (${fluence(MODEL.fMin).toFixed(0)} J/cm², sparks), at ${MODEL.fMax} kHz they mostly heat and darken the steel. The ${DIAL.ticks}-tick dial takes ${totals.seconds.toFixed(2)} s at ${MODEL.vMark} mm/s marking and ${MODEL.vJump} mm/s jumps; it plays here ${MODEL.slow}× slower.`,
    body: `<div class="iso-stage fl-stage" tabindex="0" role="slider" aria-label="Fiber laser marker. Move the pointer across the figure or use the left and right arrow keys to set the pulse rate from ${MODEL.fMin} to ${MODEL.fMax} kilohertz. Click or press Space to run the marking job; Escape stops it." aria-valuemin="${MODEL.fMin}" aria-valuemax="${MODEL.fMax}" aria-valuenow="${f0}" aria-valuetext="${f0} kilohertz, ${pulseEnergy(f0).toFixed(2)} millijoule pulses">${svg}<canvas class="fl-gl" aria-hidden="true"></canvas><span class="fl-sr" role="status" aria-live="polite" data-status></span></div>`,
  });

const page = k.pageHtml({ title: "Fiber laser marker · 25 W", theme: THEME, body, script: kitScript() + glScript() + latheScript + modelScript + LIVE, width: 680 });
const name = THEME === "light" ? "fiber-laser-light.html" : "fiber-laser.html";
writeFileSync(join(HERE, name), page);
console.log("wrote", name, `${(page.length / 1024).toFixed(0)} KB`, `${R.items.length} items`, `scale ${KS.toFixed(3)}`, `${CABLES.length} cables`, `peak ${peakPower(25).toFixed(1)} kW`, `spacing ${spacing(40).toFixed(0)} µm`);

A.auditOrExit(R, P, {});
