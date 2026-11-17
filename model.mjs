// The 25 W pulsed fiber marker as numbers. Every readout, motion and caption figure comes from here.
export const MODEL = {
  power: 25, // W average, Q-switched Yb fiber laser
  eMax: 1.0, // mJ, pulse energy cap (reached at 25 kHz)
  fMin: 25, // kHz
  fMax: 100, // kHz
  lambda: 1064, // nm
  m2: 1.3, // beam quality
  beam: 7, // mm, collimated beam diameter out of the isolator
  focal: 160, // mm, F-theta lens focal length
  field: 110, // mm, square marking field of the F160 lens
  wd: 188, // mm, lens shoulder to work surface
  vMark: 1000, // mm/s marking speed
  vJump: 4000, // mm/s galvo jump speed
  slow: 20, // the figure plays the job this many times slower than real time
  pumps: 4, // multimode pump diodes, 915 nm
};

export const pulseEnergy = (f) => Math.min(MODEL.eMax, MODEL.power / f); // mJ (W / kHz = mJ)
export const pulseWidth = (f) => 100 + (40 * (f - MODEL.fMin)) / (MODEL.fMax - MODEL.fMin); // ns, Q-switched pulses lengthen as f rises
export const peakPower = (f) => (pulseEnergy(f) * 1e-3) / (pulseWidth(f) * 1e-9) / 1000; // kW
export const spot = () => (4 * MODEL.m2 * MODEL.lambda * 1e-6 * MODEL.focal) / (Math.PI * MODEL.beam); // mm, 1/e² diameter
export const fluence = (f) => (pulseEnergy(f) * 1e-3) / (Math.PI * (spot() / 20) ** 2); // J/cm², mean over the 1/e² spot
export const spacing = (f) => (MODEL.vMark / (f * 1000)) * 1000; // µm between pulse centres

// The job: a dial scale engraved on a steel blank, in work-plane mm about the lens axis.
export const DIAL = { outer: 30, inner: 21, ticks: 60 };
export function tickLength(i) {
  return i % 15 === 0 ? 7 : i % 5 === 0 ? 5 : 2.5;
}
const circle = (r, a0, n = 96) => Array.from({ length: n + 1 }, (_, i) => {
  const a = a0 + (i / n) * Math.PI * 2;
  return [r * Math.cos(a), r * Math.sin(a)];
});
const tickAngle = (i) => Math.PI / 2 - (i / DIAL.ticks) * Math.PI * 2;

export function jobPath() {
  const moves = [];
  const add = (kind, pts, tone = 0) => moves.push({ kind, pts, tone });
  let at = [0, 0];
  const jumpTo = (p) => {
    if (Math.hypot(p[0] - at[0], p[1] - at[1]) > 1e-6) add("jump", [at, p]);
    at = p;
  };
  const mark = (pts) => {
    jumpTo(pts[0]);
    add("mark", pts);
    at = pts[pts.length - 1];
  };
  mark(circle(DIAL.outer, tickAngle(0)));
  for (let i = 0; i < DIAL.ticks; i++) {
    const a = tickAngle(i);
    const r0 = DIAL.outer;
    const r1 = DIAL.outer - tickLength(i);
    const p0 = [r0 * Math.cos(a), r0 * Math.sin(a)];
    const p1 = [r1 * Math.cos(a), r1 * Math.sin(a)];
    mark(i % 2 ? [p1, p0] : [p0, p1]);
  }
  mark(circle(DIAL.inner, tickAngle(0), 72));
  jumpTo([0, 0]);
  for (const m of moves) {
    m.len = 0;
    for (let i = 1; i < m.pts.length; i++) m.len += Math.hypot(m.pts[i][0] - m.pts[i - 1][0], m.pts[i][1] - m.pts[i - 1][1]);
  }
  return moves;
}

export function jobTotals() {
  const moves = jobPath();
  const mark = moves.filter((m) => m.kind === "mark").reduce((a, m) => a + m.len, 0);
  const jump = moves.filter((m) => m.kind === "jump").reduce((a, m) => a + m.len, 0);
  const delays = moves.length * 150e-6; // jump and laser on/off delays, ~150 µs per move
  return { mark, jump, seconds: mark / MODEL.vMark + jump / MODEL.vJump + delays, moves: moves.length };
}
