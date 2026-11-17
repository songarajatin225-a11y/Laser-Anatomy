const D = __DATA__;
const P = D.P;
const M = D.model;
const stage = document.querySelector(".fl-stage");
const svg = stage.querySelector("svg");
const $ = (sel) => svg.querySelector(sel);
const readout = document.querySelector("[data-readout]");
const status = document.querySelector("[data-status]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const LIGHT = (stage.closest("[data-theme]")?.getAttribute("data-theme") ?? "dark") === "light" ? 1 : 0;
const at = (p) => iso(p, P);
const KS = P.scale;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmt = (v, n = 2) => v.toFixed(n);
const sgn = (v, n = 1) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(n);

const el = {
  m1: $('[data-part="m1"]'),
  m2: $('[data-part="m2"]'),
  beamIn: $('[data-part="beam-in"]'),
  beamOut: $('[data-part="beam-out"]'),
  spot: $('[data-part="spot"]'),
  mark: $('[data-part="mark"]'),
  markNow: $('[data-part="mark-now"]'),
};
const NS = "http://www.w3.org/2000/svg";
const mk = (tag, attrs, parent) => {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  parent.appendChild(node);
  return node;
};
// static nodes for the beam, cone, aiming beam and spot
const beamInPath = mk("path", { class: "fl-beam", d: "" }, el.beamIn);
const redInPath = mk("path", { class: "fl-red-beam", d: "" }, el.beamIn);
const beamEnds = mk("g", { class: "fl-beam-ends" }, el.beamIn);
const endA = mk("circle", { class: "fl-beam-dot", r: "0.8" }, beamEnds);
const endB = mk("circle", { class: "fl-beam-dot", r: "0.8" }, beamEnds);
const cone = mk("path", { class: "fl-cone", d: "" }, el.beamOut);
const coneEdges = mk("path", { class: "fl-beam-edge", d: "" }, el.beamOut);
const redOut = mk("path", { class: "fl-red-beam", d: "" }, el.beamOut);
const spotDot = mk("circle", { class: "fl-spot", r: "1.1", cx: "0", cy: "0" }, el.spot);
const redDot = mk("circle", { class: "fl-red-dot", r: "0.9", cx: "0", cy: "0" }, el.spot);

// ---------- the job timeline ----------
const PREVIEW_LAPS = 2;
const PREVIEW_SPEED = 160; // figure mm/s for the aiming laps
const moves = D.job.map((m) => {
  const cum = [0];
  for (let i = 1; i < m.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(m.pts[i][0] - m.pts[i - 1][0], m.pts[i][1] - m.pts[i - 1][1]));
  const speed = (m.kind === "mark" ? M.vMark : M.vJump) / M.slow;
  return { ...m, cum, dur: m.len / speed };
});
const outerLen = 2 * Math.PI * D.dial.outer;
const previewDur = (PREVIEW_LAPS * outerLen) / PREVIEW_SPEED;
let t0 = 0;
for (const m of moves) {
  m.t0 = t0;
  t0 += m.dur;
}
const markDur = t0;
const markMoves = moves.filter((m) => m.kind === "mark");
const pointOnMove = (m, s) => {
  const d = clamp(s, 0, m.len);
  let i = 1;
  while (i < m.cum.length - 1 && m.cum[i] < d) i++;
  const a = m.pts[i - 1];
  const b = m.pts[i];
  const span = m.cum[i] - m.cum[i - 1] || 1;
  const u = (d - m.cum[i - 1]) / span;
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, i];
};
const previewAt = (t) => {
  const a = Math.PI / 2 + ((t * PREVIEW_SPEED) / D.dial.outer);
  return [D.dial.outer * Math.cos(a), D.dial.outer * Math.sin(a)];
};

// ---------- state ----------
const freq = { x: 40, v: 0 };
let fTarget = 40;
const job = { phase: "idle", t: 0, moveIndex: -1, done: 0, markedFreq: [] };
let spotXY = [0, 0];
let laserOn = false;
let redOn = false;
const emit = { x: 0, v: 0 };
const red = { x: 0, v: 0 };
let touring = !still.matches;
let tour = { step: 0, wait: 1.4, phase: "wait" };
let idleTimer = 0;
let frame = 0;
let last = 0;
let clock = 0;
let visible = false;

const mirrorFrame = (m, angle) => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rot = m.a[2] === 1 ? (v) => [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]] : (v) => [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
  return G.frameOf(m.o, m.a, rot(m.u), rot(m.v));
};
const rectPoly = (w, t) => [[-w, -t], [w, -t], [w, t], [-w, t]];
let lastMirror = "";
function drawMirrors(d1, d2) {
  const key = d1.toFixed(4) + "," + d2.toFixed(4);
  if (key === lastMirror) return;
  lastMirror = key;
  for (const [node, m, d] of [[el.m1, D.mirrors.m1, d1], [el.m2, D.mirrors.m2, d2]]) {
    node.innerHTML = solidSvg(G.prismOf(mirrorFrame(m, d), rectPoly(m.w, m.t), -m.h, m.h, P), { tone: "hi", lit: true });
  }
}

const pathOfPts = (pts) => "M" + pts.map((p) => at(p).map((v) => v.toFixed(2)).join(" ")).join("L");
function drawBeam(x, y, on, aim) {
  const th1 = y / M.focal; // optical scan angles, radians (F-theta: position = f·θ)
  const th2 = x / M.focal;
  const d1 = th1 / 2;
  const d2 = -th2 / 2;
  drawMirrors(d1, d2);
  const show = on || aim;
  el.beamIn.style.opacity = show ? 1 : 0;
  el.beamOut.style.opacity = show ? 1 : 0;
  el.spot.style.opacity = show ? 1 : 0;
  if (!show) return;
  const hit = [D.m2[0], D.m2[1] + (D.m2[0] - D.m1[0]) * Math.tan(2 * d1), D.m2[2]];
  const floor = [hit[0] + th2 * (D.m2[2] - D.zf), hit[1] + th1 * (D.m2[2] - D.zf), D.zf];
  const inner = pathOfPts([D.inPort, D.m1, hit, floor]);
  beamInPath.setAttribute("d", on ? inner : "");
  redInPath.setAttribute("d", aim && !on ? inner : "");
  const pa = at(D.inPort);
  const pb = at(floor);
  endA.setAttribute("cx", pa[0].toFixed(2));
  endA.setAttribute("cy", pa[1].toFixed(2));
  endB.setAttribute("cx", pb[0].toFixed(2));
  endB.setAttribute("cy", pb[1].toFixed(2));
  beamEnds.setAttribute("data-red", aim && !on ? "1" : "0");
  const exit = [th2 * (D.m2[2] - D.lensBot) * 0.62, th1 * (D.m2[2] - D.lensBot) * 0.62, D.lensBot];
  const target = [x, y, D.zw + 0.05];
  const A = at(exit);
  const B = at(target);
  if (on) {
    const half = (M.beam / 2) * KS;
    const a1 = [A[0] - half, A[1]];
    const a2 = [A[0] + half, A[1]];
    const f = (p) => p.map((v) => v.toFixed(2)).join(" ");
    cone.setAttribute("d", `M${f(a1)}L${f(B)}L${f(a2)}Z`);
    coneEdges.setAttribute("d", `M${f(a1)}L${f(B)}M${f(a2)}L${f(B)}`);
    redOut.setAttribute("d", "");
  } else {
    cone.setAttribute("d", "");
    coneEdges.setAttribute("d", "");
    redOut.setAttribute("d", `M${A[0].toFixed(2)} ${A[1].toFixed(2)}L${B[0].toFixed(2)} ${B[1].toFixed(2)}`);
  }
  spotDot.setAttribute("cx", B[0].toFixed(2));
  spotDot.setAttribute("cy", B[1].toFixed(2));
  spotDot.style.opacity = on ? 1 : 0;
  redDot.setAttribute("cx", B[0].toFixed(2));
  redDot.setAttribute("cy", B[1].toFixed(2));
  redDot.style.opacity = aim && !on ? 1 : 0;
}

// ---------- the mark ----------
const markTone = (f) => {
  const share = clamp((f - M.fMin) / (M.fMax - M.fMin), 0, 1);
  return `stroke:color-mix(in srgb, var(--fl-mark-dark) ${(35 + 65 * share).toFixed(0)}%, var(--fl-mark-light))`;
};
const markD = (pts) => pathOfPts(pts.map(([x, y]) => [x, y, D.zw + 0.05]));
let markNowPath = mk("path", { class: "fl-mark", "data-free": "", d: "" }, el.markNow);
function commitMove(m, f) {
  mk("path", { class: "fl-mark", "data-free": "", d: markD(m.pts), style: markTone(f) }, el.mark);
}
function clearMark() {
  el.mark.replaceChildren();
  markNowPath.setAttribute("d", "");
  el.mark.style.opacity = 1;
  el.mark.classList.remove("fl-mark-fade");
}

// ---------- the readout ----------
let lastText = "";
const say = (text) => {
  if (text !== lastText) {
    readout.textContent = text;
    lastText = text;
  }
};
const announce = (text) => {
  status.textContent = text;
};
const describe = () => {
  const f = Math.round(fTarget);
  stage.setAttribute("aria-valuenow", String(f));
  stage.setAttribute("aria-valuetext", `${f} kilohertz, ${fmt(pulseEnergy(f))} millijoule pulses, ${fmt(peakPower(f), 1)} kilowatt peak`);
};
function readoutText() {
  const f = Math.round(freq.x);
  const base = `${f} kHz · ${fmt(pulseEnergy(f))} mJ`;
  if (job.phase === "preview") return `aiming · 650 nm diode traces the dial`;
  if (job.phase === "mark") {
    const d1 = ((spotXY[1] / M.focal / 2) * 180) / Math.PI;
    const d2 = ((-spotXY[0] / M.focal / 2) * 180) / Math.PI;
    return laserOn ? `marking · ${base} · X ${sgn(d1)}° Y ${sgn(d2)}°` : `jump · laser off · X ${sgn(d1)}° Y ${sgn(d2)}°`;
  }
  if (job.phase === "done") {
    const pulses = Math.round((D.totals.mark / M.vMark) * job.doneFreq * 1000);
    return `done · ${D.dial.ticks} ticks in ${fmt(D.totals.seconds)} s · ${pulses.toLocaleString("en-US")} pulses`;
  }
  return `ready · ${base} · ${fmt(peakPower(f), 1)} kW peak`;
}

// ---------- WebGL: plasma plume, surface heat and sparks at the spot ----------
const SPARKS = 24;
const FRAG = `
uniform vec3 uSpot;
uniform float uEmit;
uniform float uAbl;
uniform float uLight;
uniform vec4 uSh[${SPARKS}];
uniform vec4 uSt[${SPARKS}];
float segT(vec2 p, vec2 a, vec2 b){vec2 ab=b-a;return clamp(dot(p-a,ab)/max(dot(ab,ab),1e-6),0.,1.);}
vec4 over(vec4 top, vec4 under){return top+under*(1.-top.a);}
vec4 inkFor(vec3 seen,float cover){vec3 absorbed=1.-seen;float a=max(max(absorbed.r,max(absorbed.g,absorbed.b)),cover);return vec4(vec3(a)-absorbed,a);}
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  float px=pixelOf();
  float flick=.82+.18*noise2(vec2(uTime*31.,uSpot.x*.3));
  // plume: a short glowing column above the spot
  vec2 s0=project(uSpot);
  vec2 s1=project(uSpot+vec3(0.,0.,7.));
  float h=segT(vb,s0,s1);
  vec2 q=mix(s0,s1,h);
  float d=length(vb-q)/uK;
  float r=mix(1.,2.6+2.*uAbl,h);
  float core=exp(-pow(length(vb-s0)/uK/(1.05+.45*uAbl),2.));
  float plume=exp(-pow(d/r,2.))*pow(1.-h,1.6)*smoothstep(0.,.08,h+.04);
  float ep=uEmit*flick*(core*(1.1+.9*uAbl)+plume*(.25+1.1*uAbl));
  // heat on the steel around the spot
  vec3 fp=onFloor(vb,uSpot.z);
  float rr=length(fp.xy-uSpot.xy);
  float heat=uEmit*exp(-pow(rr/(1.6+1.2*uAbl),2.))*(.55+.25*uAbl);
  // sparks: streaks from tail to head, hottest at the head
  float es=0.;
  for(int i=0;i<${SPARKS};i++){
    float alive=uSt[i].w;
    if(alive<.001) continue;
    vec2 a=project(uSt[i].xyz);
    vec2 b=project(uSh[i].xyz);
    float t=segT(vb,a,b);
    float dd=length(vb-mix(a,b,t))/uK;
    float w=max(.18,.65*px);
    es+=alive*uSh[i].w*exp(-pow(dd/w,2.))*(.25+.75*t*t);
  }
  vec3 dark=vec3(.62,.48,1.)*ep*1.6+vec3(1.,.95,1.)*core*uEmit*1.4+vec3(1.,.5,.12)*heat*1.1+vec3(1.,.62,.22)*es*1.5;
  dark=tonemap(dark,1.15);
  float m=max(dark.r,max(dark.g,dark.b));
  vec4 darkOut=vec4(dark,m);
  // paper: one ink per kind of light, composited back to front
  float eh=1.-exp(-2.2*heat);
  vec4 heatInk=inkFor(mix(vec3(1.),vec3(1.,.62,.32),eh),0.)*min(1.,eh*1.2)*.75;
  float e=1.-exp(-2.4*ep);
  vec3 seen=mix(vec3(1.),vec3(.46,.3,.96),smoothstep(.04,.45,e));
  seen=mix(seen,vec3(.97,.95,1.),smoothstep(.55,.92,e));
  vec4 plumeInk=inkFor(seen,.9*smoothstep(.6,.92,e))*smoothstep(0.,.06,e);
  float ek=1.-exp(-2.*es);
  vec4 sparkInk=vec4(vec3(.95,.45,.08)*ek*.85,ek*.85);
  vec4 lightOut=over(sparkInk,over(plumeInk,heatInk));
  lightOut.rgb=min(lightOut.rgb,vec3(lightOut.a));
  vec4 o=mix(darkOut,lightOut,uLight);
  float n=(hash12(gl_FragCoord.xy+fract(uTime*.61)*91.)+hash12(gl_FragCoord.yx*1.37+fract(uTime*.37)*57.)-1.)/255.;
  o=max(o+n*smoothstep(0.,1.5/255.,o.a),0.);
  o.rgb=min(o.rgb,vec3(o.a));
  gl_FragColor=o;
}`;
const canvas = stage.querySelector(".fl-gl");
const layer = glLayer({ canvas, fragment: FRAG, view: [D.W, D.H], camera: D.camera, uniforms: ["uSpot", "uEmit", "uAbl", "uSh", "uSt"], fixed: { uLight: LIGHT } });
if (layer) stage.setAttribute("data-gl", "");
const sparks = Array.from({ length: SPARKS }, () => ({ alive: 0, p: [0, 0, 0], v: [0, 0, 0], age: 0, life: 1 }));
const sh = new Float32Array(SPARKS * 4);
const st = new Float32Array(SPARKS * 4);
let spawnDebt = 0;
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const ablation = (f) => clamp((fluence(f) - 20) / 55, 0, 1); // 0 at 100 kHz (20 J/cm²), 1 at 25 kHz (79 J/cm²)
function stepSparks(dt, calm) {
  const abl = ablation(freq.x);
  if (laserOn && !calm) {
    spawnDebt += dt * (6 + 70 * abl * abl);
    while (spawnDebt >= 1) {
      spawnDebt -= 1;
      const s = sparks.find((x) => x.alive <= 0);
      if (!s) break;
      const az = rnd() * Math.PI * 2;
      const el2 = 0.35 + rnd() * 0.9;
      const speed = 45 + rnd() * (60 + 90 * abl);
      s.p = [spotXY[0], spotXY[1], D.zw + 0.2];
      s.v = [Math.cos(az) * Math.cos(el2) * speed, Math.sin(az) * Math.cos(el2) * speed, Math.sin(el2) * speed];
      s.age = 0;
      s.life = 0.25 + rnd() * (0.3 + 0.35 * abl);
      s.alive = 1;
    }
  }
  let any = false;
  sparks.forEach((s, i) => {
    if (s.alive > 0) {
      s.age += dt;
      s.v[2] -= 25 * dt;
      s.p = [s.p[0] + s.v[0] * dt, s.p[1] + s.v[1] * dt, s.p[2] + s.v[2] * dt];
      const u = s.age / s.life;
      s.alive = u >= 1 || s.p[2] < D.zw ? 0 : smooth(0, 0.08, u) * (1 - smooth(0.6, 1, u));
      if (s.alive > 0) any = true;
    }
    const tail = 0.05;
    sh.set([s.p[0], s.p[1], s.p[2], 1 - 0.5 * clamp(s.age / s.life, 0, 1)], i * 4);
    st.set([s.p[0] - s.v[0] * tail, s.p[1] - s.v[1] * tail, s.p[2] - s.v[2] * tail, Math.max(0, s.alive)], i * 4);
  });
  return any;
}

// ---------- job control ----------
function startJob() {
  clearMark();
  job.phase = still.matches ? "done" : "preview";
  job.t = 0;
  job.moveIndex = -1;
  job.doneFreq = Math.round(freq.x);
  stage.setAttribute("data-run", "");
  announce("aiming");
  if (still.matches) finishJob();
  run();
}
function finishJob() {
  for (let i = job.moveIndex + 1; i < moves.length; i++) if (moves[i].kind === "mark") commitMove(moves[i], freq.x);
  markNowPath.setAttribute("d", "");
  job.phase = "done";
  job.doneFreq = Math.round(freq.x);
  laserOn = false;
  redOn = false;
  spotXY = [0, 0];
  stage.removeAttribute("data-emit");
  stage.removeAttribute("data-run");
  announce("done");
}
function stopJob() {
  job.phase = "idle";
  laserOn = false;
  redOn = false;
  spotXY = [0, 0];
  markNowPath.setAttribute("d", "");
  stage.removeAttribute("data-emit");
  stage.removeAttribute("data-run");
  announce("stopped");
}
function stepJob(dt) {
  if (job.phase === "preview") {
    job.t += dt;
    redOn = true;
    laserOn = false;
    spotXY = previewAt(job.t);
    if (job.t >= previewDur) {
      job.phase = "mark";
      job.t = 0;
      spotXY = previewAt(previewDur);
      stage.setAttribute("data-emit", "");
      announce("marking");
    }
    return;
  }
  if (job.phase !== "mark") return;
  job.t += dt;
  redOn = false;
  while (job.moveIndex + 1 < moves.length && moves[job.moveIndex + 1].t0 <= job.t) {
    if (job.moveIndex >= 0 && moves[job.moveIndex].kind === "mark") commitMove(moves[job.moveIndex], job.moveFreq ?? freq.x);
    job.moveIndex++;
    job.moveFreq = freq.x;
  }
  if (job.t >= markDur) {
    finishJob();
    return;
  }
  const m = moves[job.moveIndex];
  const s = ((job.t - m.t0) / m.dur) * m.len;
  const [x, y, i] = pointOnMove(m, s);
  spotXY = [x, y];
  laserOn = m.kind === "mark";
  if (laserOn) {
    markNowPath.setAttribute("d", markD([...m.pts.slice(0, i), [x, y]]));
    markNowPath.setAttribute("style", markTone(job.moveFreq));
  } else markNowPath.setAttribute("d", "");
}

// ---------- the idle tour: mark at a low pulse rate, then at a high one ----------
const TOUR_F = [28, 80];
function stepTour(dt) {
  if (!touring) return;
  tour.wait -= dt;
  if (tour.phase === "wait" && tour.wait <= 0) {
    fTarget = TOUR_F[tour.step % TOUR_F.length];
    describe();
    tour.phase = "settle";
    tour.wait = 0.9;
  } else if (tour.phase === "settle" && tour.wait <= 0) {
    startJob();
    tour.phase = "job";
  } else if (tour.phase === "job" && job.phase === "done") {
    tour.phase = "hold";
    tour.wait = 2.6;
  } else if (tour.phase === "hold" && tour.wait <= 0) {
    el.mark.classList.add("fl-mark-fade");
    el.mark.style.opacity = 0;
    tour.phase = "fade";
    tour.wait = 1;
  } else if (tour.phase === "fade" && tour.wait <= 0) {
    clearMark();
    job.phase = "idle";
    tour.step++;
    tour.phase = "wait";
    tour.wait = 0.6;
  }
}
function takeOver() {
  if (touring) {
    touring = false;
    if (tour.phase === "fade") clearMark();
    if (tour.phase === "fade" || tour.phase === "hold") el.mark.style.opacity = 1;
  }
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (still.matches) return;
    touring = true;
    tour = { step: tour.step + 1, wait: 0.6, phase: job.phase === "done" ? "hold" : job.phase === "idle" ? "wait" : "job" };
    run();
  }, 6000);
}

// ---------- loop ----------
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  clock += dt;
  const calm = still.matches;
  stepTour(dt);
  const moving = settle(freq, fTarget, dt, 0.25, calm);
  stepJob(dt);
  settle(emit, laserOn ? 1 : 0, dt, 0.03, calm);
  settle(red, redOn ? 1 : 0, dt, 0.05, calm);
  drawBeam(spotXY[0], spotXY[1], laserOn, redOn);
  const sparking = stepSparks(dt, calm);
  if (layer) {
    if (emit.x > 1e-3 || sparking) {
      // the effect is local: scissor the draw to a box round the spot and the live sparks
      const pts = [at([spotXY[0], spotXY[1], D.zw]), at([spotXY[0], spotXY[1], D.zw + 9])];
      sparks.forEach((s) => s.alive > 0 && pts.push(at(s.p), at([s.p[0] - s.v[0] * 0.05, s.p[1] - s.v[1] * 0.05, s.p[2] - s.v[2] * 0.05])));
      const pad = 9 * KS;
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const fx = canvas.width / D.W;
      const fy = canvas.height / D.H;
      const x0 = Math.max(0, Math.floor((Math.min(...xs) - pad) * fx));
      const x1 = Math.min(canvas.width, Math.ceil((Math.max(...xs) + pad) * fx));
      const y0 = Math.max(0, Math.floor((Math.min(...ys) - pad) * fy));
      const y1 = Math.min(canvas.height, Math.ceil((Math.max(...ys) + pad) * fy));
      const g = layer.gl;
      g.enable(g.SCISSOR_TEST);
      g.scissor(x0, canvas.height - y1, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
      layer.draw({ uSpot: [spotXY[0], spotXY[1], D.zw + 0.05], uEmit: emit.x, uAbl: ablation(freq.x), uSh: sh, uSt: st }, calm ? 0.8 : clock);
    } else {
      layer.gl.disable(layer.gl.SCISSOR_TEST);
      layer.clear();
    }
  }
  say(readoutText());
  const busy = touring || moving || job.phase === "preview" || job.phase === "mark" || emit.x > 1e-3 || sparking;
  frame = visible && busy ? requestAnimationFrame(tick) : 0;
}
const run = () => {
  if (!frame && visible) {
    last = 0;
    frame = requestAnimationFrame(tick);
  }
};
new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible) run();
}, { rootMargin: "120px 0px" }).observe(stage);

// ---------- input ----------
const setFreq = (f) => {
  fTarget = clamp(Math.round(f), M.fMin, M.fMax);
  describe();
  run();
};
stage.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch") return;
  const box = svg.getBoundingClientRect();
  const share = clamp(((event.clientX - box.left) / box.width - 0.12) / 0.76, 0, 1);
  takeOver();
  setFreq(M.fMin + share * (M.fMax - M.fMin));
});
stage.addEventListener("click", (event) => {
  takeOver();
  if (event.pointerType === "touch" || event.detail === 0) {
    const box = svg.getBoundingClientRect();
    const share = clamp(((event.clientX - box.left) / box.width - 0.12) / 0.76, 0, 1);
    if (event.pointerType === "touch") setFreq(M.fMin + share * (M.fMax - M.fMin));
  }
  if (job.phase === "preview" || job.phase === "mark") return;
  startJob();
});
stage.addEventListener("keydown", (event) => {
  const step = event.shiftKey ? 25 : 5;
  let handled = true;
  if (event.key === "ArrowRight" || event.key === "ArrowUp") setFreq(fTarget + step);
  else if (event.key === "ArrowLeft" || event.key === "ArrowDown") setFreq(fTarget - step);
  else if (event.key === "Home") setFreq(M.fMin);
  else if (event.key === "End") setFreq(M.fMax);
  else if (event.key === " " || event.key === "Enter") {
    if (job.phase !== "preview" && job.phase !== "mark") startJob();
  } else if (event.key === "Escape") stopJob();
  else handled = false;
  if (!handled) return;
  event.preventDefault();
  takeOver();
  run();
});
stage.addEventListener("focus", () => announce(readoutText()));
addEventListener("resize", () => run());
if (still.matches) touring = false;
describe();
drawBeam(0, 0, false, false);
