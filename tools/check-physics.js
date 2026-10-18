#!/usr/bin/env node
/* Headless check of the shooting machine's physics (js/physics.js), no browser needed:
     node tools/check-physics.js
   1. A well-aimed shot (Phys.ideal) scores, on both rim sizes, with the hoop still and sliding.
   2. No ball ever gets stuck: a sweep of thousands of shots (every aim x every power x hoop positions), plus balls
      dropped right on top of the rim, wedged against the backboard and left on top of it, must all end up back in
      the tray, and none may sit near the rim for more than 2 s.
   Exits with code 1 if anything fails. The page runs the same checks with game.check(). */
'use strict';
const path = require('path');
const Phys = require(path.join(__dirname, '..', 'js', 'physics.js'));

const results = [];
const ok = (name, pass, info) => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`);
};

// Run one ball until it's back in the tray (or timeout). Returns what happened.
function run(w, b, maxT) {
  const out = { scored: false, swish: false, missed: false, tray: false, t: 0, nearRim: 0, maxNearRim: 0, nudges: 0, recovers: 0 };
  const dt = 1 / 60;
  for (let t = 0; t < maxT; t += dt) {
    for (const e of Phys.step(w, dt)) {
      if (e.ball !== b) continue;
      if (e.type === 'score') { out.scored = true; out.swish = e.swish; }
      if (e.type === 'miss') out.missed = true;
      if (e.type === 'nudge') out.nudges++;
      if (e.type === 'recover') out.recovers++;
    }
    const near = Math.hypot(b.p.x - w.hx, b.p.y - Phys.RIM.y, b.p.z - Phys.RIM.z) < w.rimR + 0.35;
    out.nearRim = near ? out.nearRim + dt : 0;
    out.maxNearRim = Math.max(out.maxNearRim, out.nearRim);
    if (b.shot && b.shot.resolved && Phys.inTray(b)) {
      out.tray = true;
      out.t = t;
      break;
    }
    if (!b.shot && Phys.inTray(b)) {
      out.tray = true;
      out.t = t;
      break;
    }
  }
  return out;
}

function world(diff, amp, period, t0) {
  const w = Phys.create({ rimR: Phys.RIM_R[diff] });
  w.t = t0 || 0;
  if (amp) Phys.setMotion(w, amp, period);
  if (t0) w.t += t0;
  w.hx = Phys.hoopXAt(w, w.t);
  return w;
}

// 1. well-aimed shots score
for (const diff of ['easy', 'normal']) {
  const w = world(diff);
  const b = Phys.addBall(w);
  const id = Phys.ideal(w, 0);
  Phys.launch(w, b, id.yaw, id.power);
  const r = run(w, b, 8);
  ok(`ideal shot swishes (${diff}, hoop still)`, r.scored && r.swish, `yaw ${id.yaw.toFixed(2)}° power ${id.power.toFixed(3)} flight ${id.T.toFixed(2)} s, back in tray after ${r.t.toFixed(2)} s`);
  ok(`ball returns to the tray (${diff})`, r.tray && r.t < 4, `${r.t.toFixed(2)} s`);
}
for (const diff of ['easy', 'normal']) {
  let made = 0, swish = 0, n = 0;
  for (const [amp, period] of [[0.7, 7], [1.1, 5.5], [1.3, 4.5], [1.4, 3.6]]) {
    for (let k = 0; k < 12; k++) {
      const w = world(diff, amp, period, (k / 12) * period);
      const b = Phys.addBall(w);
      const id = Phys.ideal(w, 0);
      Phys.launch(w, b, id.yaw, id.power);
      const r = run(w, b, 8);
      n++;
      if (r.scored) made++;
      if (r.swish) swish++;
    }
  }
  ok(`ideal shot scores at a sliding hoop (${diff})`, made === n, `${made}/${n} in, ${swish} swishes`);
}

// a nearly right shot still has a chance: a little short or long rattles in sometimes
{
  const w = world('normal');
  const id = Phys.ideal(w, 0);
  let made = 0, n = 0;
  for (let dp = -0.04; dp <= 0.0401; dp += 0.01) {
    for (let dy = -1.5; dy <= 1.51; dy += 0.75) {
      const w2 = world('normal');
      const b = Phys.addBall(w2);
      Phys.launch(w2, b, id.yaw + dy, id.power + dp);
      const r = run(w2, b, 8);
      n++;
      if (r.scored) made++;
    }
  }
  ok('near misses of the ideal shot sometimes go in (normal)', made > n * 0.3 && made < n, `${made}/${n}`);
}

// 2. nothing gets stuck: the big sweep
const t0 = Date.now();
for (const diff of ['easy', 'normal']) {
  let shots = 0, made = 0, swishes = 0, worstNear = 0, worstT = 0, notBack = 0, nudged = 0, recovered = 0;
  const bad = [];
  for (const hx of [-1.3, -0.6, 0, 0.6, 1.3]) {
    for (let yaw = -30; yaw <= 30; yaw += 1.5) {
      for (let p = 0; p <= 1.0001; p += 0.02) {
        const w = world(diff);
        w.hx = hx;
        const b = Phys.addBall(w);
        Phys.launch(w, b, yaw, p);
        const r = run(w, b, 12);
        shots++;
        if (r.scored) made++;
        if (r.swish) swishes++;
        if (r.nudges) nudged++;
        if (r.recovers) recovered++;
        worstNear = Math.max(worstNear, r.maxNearRim);
        if (!r.tray) { notBack++; if (bad.length < 5) bad.push({ hx, yaw, p: +p.toFixed(2), at: b.p }); }
        else worstT = Math.max(worstT, r.t);
      }
    }
  }
  ok(`every ball comes back to the tray (${diff}, ${shots} shots)`, notBack === 0, `slowest ${worstT.toFixed(1)} s; ${made} in (${swishes} swishes); nudged ${nudged}, rescued ${recovered}` + (bad.length ? ' ' + JSON.stringify(bad) : ''));
  ok(`no ball sits by the rim for 2 s (${diff})`, worstNear < 2, `longest ${worstNear.toFixed(2)} s`);
}

// balls placed in the worst spots: on top of the rim, wedged against the board, on top of the board
for (const diff of ['easy', 'normal']) {
  const spots = [];
  const R = Phys.RIM_R[diff];
  for (let a = 0; a < 360; a += 15) {
    const r = (a * Math.PI) / 180;
    spots.push({ name: `on the rim at ${a}°`, x: Math.cos(r) * R, y: Phys.RIM.y + Phys.BALL_R + Phys.RIM.tube - 0.001, z: Phys.RIM.z + Math.sin(r) * R });
  }
  spots.push({ name: 'wedged between rim and board', x: 0, y: Phys.RIM.y + 0.1, z: Phys.BOARD.z + Phys.BALL_R + 0.005 });
  spots.push({ name: 'on top of the board', x: 0.3, y: Phys.BOARD.bottom + Phys.BOARD.h + Phys.BALL_R, z: Phys.BOARD.z - Phys.BOARD.d / 2 });
  spots.push({ name: 'on the bracket', x: 0, y: Phys.RIM.y + Phys.BALL_R + 0.006, z: Phys.RIM.z - R - 0.08 });
  let worst = 0, fails = [];
  for (const s of spots) {
    const w = world(diff);
    const b = Phys.addBall(w);
    b.p = { x: s.x, y: s.y, z: s.z };
    b.v = { x: 0, y: 0, z: 0 };
    const r = run(w, b, 10);
    worst = Math.max(worst, r.maxNearRim);
    if (!r.tray || r.maxNearRim >= 2.5) fails.push(s.name);
  }
  ok(`balls left on the rim / board roll off (${diff}, ${spots.length} spots)`, fails.length === 0, `longest by the rim ${worst.toFixed(2)} s` + (fails.length ? ' stuck: ' + fails.join(', ') : ''));
}

// several balls at once, quick fire, with the hoop sliding: they all come back and queue up in the tray
{
  let worst = 0, lost = 0;
  for (let trial = 0; trial < 40; trial++) {
    const w = world(trial % 2 ? 'easy' : 'normal', trial % 3 ? 1.2 : 0, 4.5);
    const balls = [0, 1, 2, 3].map(() => Phys.addBall(w));
    balls.forEach((b, i) => Phys.placeOnRamp(w, b, 0, -1 - i * 0.3));
    let t = 0;
    for (let i = 0; i < balls.length; i++) {
      Phys.launch(w, balls[i], (Math.random() - 0.5) * 30, Math.random());
      for (let k = 0; k < 30; k++) Phys.step(w, 1 / 60);
      t += 0.5;
    }
    let all = false;
    for (let k = 0; k < 60 * 10 && !all; k++) {
      Phys.step(w, 1 / 60);
      t += 1 / 60;
      all = balls.every((b) => Phys.inTray(b) || (b.p.z > -2.2 && b.support && Math.hypot(b.v.x, b.v.y, b.v.z) < 0.3));
    }
    if (!all) lost++;
    worst = Math.max(worst, t);
  }
  ok('quick-fire volleys of 4 balls all come back', lost === 0, `${40 - lost}/40 volleys, slowest ${worst.toFixed(1)} s`);
}

console.log(`\n${results.filter((r) => r.pass).length}/${results.length} checks passed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
