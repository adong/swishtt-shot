/* Hoops Teddy: the shooting machine's ball physics. There's no Three.js in here, so the same file runs in the page
   and headless in Node (tools/check-physics.js). Units are metres and seconds. +y is up, the shooter stands at the
   origin facing -z, and the hoop is straight ahead at RIM.z. Exposes window.HT.Phys (module.exports in Node).

   The machine: a rim (a torus) on a backboard that can slide left and right, a ramp under the hoop that tilts down
   toward the shooter and rolls every ball back into a tray at his feet, and a net cage (sides, back, top) so no
   ball gets lost. A ball that does bounce out over the tray is put back on the ramp. */
(function (root) {
  'use strict';

  const G = 9.81;
  const BALL_R = 0.12;
  const RIM = { y: 3.05, z: -3.8, tube: 0.022 };
  const RIM_R = { easy: 0.31, normal: 0.26 }; // inner radius to the middle of the tube (a real one is 0.23)
  const BOARD = { z: RIM.z - 0.46, w: 1.6, h: 1.05, d: 0.06, bottom: 2.88 }; // z is the front face
  const RELEASE = { x: 0, y: 2.6, z: -0.44 }; // where the ball leaves the shooter's hands, at the top of his jump
  const ELEV = (55 * Math.PI) / 180; // every shot leaves at this angle: aim sets the direction, power the speed
  const SPEED = [4.3, 8.1]; // m/s at power 0 and power 1
  const RAMP = { z0: -0.62, y0: 0.5, slope: (8 * Math.PI) / 180, push: 3.0, funnel: 1.6 };
  const CAGE = { x: 2.0, back: -5.8, top: 5.2, front: -0.42 };
  const LIP = { min: { x: -CAGE.x, y: 0, z: -0.62 }, max: { x: CAGE.x, y: 0.78, z: CAGE.front } };
  const TRAY_Z = -1.25; // a slow ball nearer the shooter than this is in the tray, ready to grab
  const SUB = 1 / 240; // physics substep

  const tanA = Math.tan(RAMP.slope), cosA = Math.cos(RAMP.slope), sinA = Math.sin(RAMP.slope);
  const rampY = (z) => RAMP.y0 + (RAMP.z0 - z) * tanA;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function create(opts) {
    opts = opts || {};
    return {
      t: 0,
      rimR: opts.rimR || RIM_R.normal,
      hx: 0, hvx: 0, // the hoop's sideways position and speed
      amp: 0, period: 6, t0: 0, // its slide: hx = amp * sin(2π (t - t0) / period)
      balls: [],
      events: [],
      shots: 0,
    };
  }

  function addBall(w) {
    const b = {
      id: w.balls.length,
      p: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0, z: 0 },
      mode: 'free', // 'free' (physics), or 'held' / 'carry' (the game moves it: in hands, in a pass)
      shot: null, // the shot it's on: { id, touched, board, scored, swish, resolved, t }
      stuckT: 0, nudges: 0, outT: 0, netT: 0, rimT: 0, support: false, rolling: false,
    };
    w.balls.push(b);
    return b;
  }

  // Start (or stop, amp = 0) the hoop sliding. A new slide starts from the middle, where a stopped hoop eases back to.
  function setMotion(w, amp, period) {
    w.amp = amp;
    w.period = period || 6;
    w.t0 = w.t;
  }
  const hoopXAt = (w, t) => (w.amp ? w.amp * Math.sin((2 * Math.PI * (t - w.t0)) / w.period) : w.hx);

  // Put a ball in the tray (used at the start and to rescue a ball that bounced out of the machine).
  function placeOnRamp(w, b, x, z) {
    b.mode = 'free';
    b.p.x = x; b.p.z = z; b.p.y = rampY(z) + BALL_R / cosA + 0.01;
    b.v.x = b.v.y = b.v.z = 0;
    b.stuckT = b.outT = b.netT = b.rimT = 0;
    b.nudges = 0;
  }

  // ---------------------------------------------------------------- shooting

  const speedFor = (power) => SPEED[0] + clamp(power, 0, 1.15) * (SPEED[1] - SPEED[0]);
  const powerFor = (speed) => (speed - SPEED[0]) / (SPEED[1] - SPEED[0]);

  // Launch a ball from the release point. yaw in degrees (0 = straight at the middle, + = right), power 0..1.
  function launch(w, b, yaw, power, from) {
    from = from || RELEASE;
    const a = (yaw * Math.PI) / 180, s = speedFor(power);
    b.mode = 'free';
    b.p.x = from.x; b.p.y = from.y; b.p.z = from.z;
    b.v.x = Math.sin(a) * Math.cos(ELEV) * s;
    b.v.z = -Math.cos(a) * Math.cos(ELEV) * s;
    b.v.y = Math.sin(ELEV) * s;
    b.stuckT = b.outT = b.netT = b.rimT = 0;
    b.nudges = 0;
    b.shot = { id: ++w.shots, touched: false, board: false, scored: false, swish: false, resolved: false, t: 0, yaw, power };
    return b.shot;
  }

  // The shot that drops through the middle of the rim (a swish), leading a sliding hoop. Released at w.t + delay.
  // Returns { yaw, power, T } where T is the flight time to the rim.
  function ideal(w, delay, from) {
    from = from || RELEASE;
    const t1 = w.t + (delay || 0);
    let hx = hoopXAt(w, t1), yaw = 0, v = 6, T = 1;
    for (let i = 0; i < 8; i++) {
      const dx = hx - from.x, dz = RIM.z + 0.02 - from.z; // aim a touch past the middle
      const dist = Math.hypot(dx, dz), dy = RIM.y - from.y;
      yaw = Math.atan2(dx, -dz);
      v = Math.sqrt((G * dist * dist) / (2 * Math.cos(ELEV) ** 2 * (dist * Math.tan(ELEV) - dy)));
      T = dist / (v * Math.cos(ELEV));
      hx = hoopXAt(w, t1 + T);
    }
    return { yaw: (yaw * 180) / Math.PI, power: powerFor(v), T };
  }

  // Where a shot would go, ignoring collisions: points every dt seconds until it drops below the rim (for the guide).
  function preview(yaw, power, dt, maxT, from) {
    from = from || RELEASE;
    const a = (yaw * Math.PI) / 180, s = speedFor(power);
    const vx = Math.sin(a) * Math.cos(ELEV) * s, vz = -Math.cos(a) * Math.cos(ELEV) * s, vy = Math.sin(ELEV) * s;
    const out = [];
    for (let t = 0; t <= maxT; t += dt) {
      const y = from.y + vy * t - 0.5 * G * t * t;
      out.push({ x: from.x + vx * t, y, z: from.z + vz * t });
      if (vy - G * t < 0 && y < RIM.y - 0.25) break;
    }
    return out;
  }

  // ---------------------------------------------------------------- collisions

  const ev = (w, type, b, extra) => w.events.push(Object.assign({ type, ball: b }, extra));

  // Reflect the ball's velocity (relative to a surface moving sideways at vx) off normal n.
  // Hard hits bounce with restitution e and lose `muHit` of their sliding speed; gentle contacts don't bounce and
  // slow by muRoll per second, so balls settle and roll instead of jittering.
  function respond(b, nx, ny, nz, e, muHit, muRoll, h, vx) {
    const rx = b.v.x - vx, ry = b.v.y, rz = b.v.z;
    const vn = rx * nx + ry * ny + rz * nz;
    if (vn >= 0) return 0;
    const tx = rx - vn * nx, ty = ry - vn * ny, tz = rz - vn * nz;
    const hard = -vn > 0.45;
    const k = hard ? 1 - muHit : Math.max(0, 1 - muRoll * h);
    const en = hard ? e : 0;
    b.v.x = tx * k - en * vn * nx + vx;
    b.v.y = ty * k - en * vn * ny;
    b.v.z = tz * k - en * vn * nz;
    return -vn;
  }

  function hitRim(w, b, h) {
    const cx = w.hx, dx = b.p.x - cx, dz = b.p.z - RIM.z;
    const L = Math.hypot(dx, dz) || 1e-6;
    const qx = cx + (dx / L) * w.rimR, qz = RIM.z + (dz / L) * w.rimR;
    let nx = b.p.x - qx, ny = b.p.y - RIM.y, nz = b.p.z - qz;
    const d = Math.hypot(nx, ny, nz), rr = BALL_R + RIM.tube;
    if (d >= rr || d < 1e-9) return 0;
    nx /= d; ny /= d; nz /= d;
    const pen = rr - d;
    b.p.x += nx * pen; b.p.y += ny * pen; b.p.z += nz * pen;
    return respond(b, nx, ny, nz, 0.5, 0.1, 1.2, h, w.hvx) || 1e-3;
  }

  // Sphere against an axis-aligned box. Returns the impact speed (or a tiny number for resting contact), 0 if apart.
  function hitBox(b, min, max, e, muHit, muRoll, h, vx) {
    const qx = clamp(b.p.x, min.x, max.x), qy = clamp(b.p.y, min.y, max.y), qz = clamp(b.p.z, min.z, max.z);
    let nx = b.p.x - qx, ny = b.p.y - qy, nz = b.p.z - qz;
    const d2 = nx * nx + ny * ny + nz * nz;
    if (d2 >= BALL_R * BALL_R) return 0;
    let pen;
    const d = Math.sqrt(d2);
    if (d > 1e-6) {
      nx /= d; ny /= d; nz /= d;
      pen = BALL_R - d;
    } else {
      // the centre got inside (a very fast ball): push out through the nearest face
      const faces = [
        [b.p.x - min.x, -1, 0, 0], [max.x - b.p.x, 1, 0, 0],
        [b.p.y - min.y, 0, -1, 0], [max.y - b.p.y, 0, 1, 0],
        [b.p.z - min.z, 0, 0, -1], [max.z - b.p.z, 0, 0, 1],
      ].sort((a, c) => a[0] - c[0])[0];
      [, nx, ny, nz] = faces;
      pen = faces[0] + BALL_R;
    }
    b.p.x += nx * pen; b.p.y += ny * pen; b.p.z += nz * pen;
    return respond(b, nx, ny, nz, e, muHit, muRoll, h, vx) || 1e-3;
  }

  // Sphere against a plane through point (px, py, pz) with unit normal n.
  function hitPlane(b, px, py, pz, nx, ny, nz, e, muHit, muRoll, h) {
    const s = (b.p.x - px) * nx + (b.p.y - py) * ny + (b.p.z - pz) * nz - BALL_R;
    if (s >= 0) return 0;
    b.p.x -= nx * s; b.p.y -= ny * s; b.p.z -= nz * s;
    return respond(b, nx, ny, nz, e, muHit, muRoll, h, 0) || 1e-3;
  }

  const boardBox = (w) => ({
    min: { x: w.hx - BOARD.w / 2, y: BOARD.bottom, z: BOARD.z - BOARD.d },
    max: { x: w.hx + BOARD.w / 2, y: BOARD.bottom + BOARD.h, z: BOARD.z },
  });
  const bracketBox = (w) => ({
    min: { x: w.hx - 0.07, y: RIM.y - 0.06, z: BOARD.z },
    max: { x: w.hx + 0.07, y: RIM.y + 0.005, z: RIM.z - w.rimR - RIM.tube },
  });

  function substep(w, b, h) {
    const prevY = b.p.y;
    b.v.y -= G * h;
    b.p.x += b.v.x * h; b.p.y += b.v.y * h; b.p.z += b.v.z * h;
    if (b.shot) b.shot.t += h;

    // scored: the centre drops through the rim plane inside the ring
    const dx = b.p.x - w.hx, dz = b.p.z - RIM.z;
    if (prevY >= RIM.y && b.p.y < RIM.y && b.v.y < 0 && dx * dx + dz * dz < (w.rimR - 0.02) ** 2) {
      b.netT = 0.5;
      const s = b.shot;
      if (s && !s.resolved && !s.scored) {
        s.scored = true;
        s.swish = !s.touched;
        ev(w, 'score', b, { swish: s.swish, bank: s.board });
      }
      ev(w, 'net', b, { speed: -b.v.y });
    }
    // the net catches a ball that went in: it slows the drop and steers it out of the bottom
    if (b.netT > 0) {
      b.netT -= h;
      if (b.p.y < RIM.y && b.p.y > RIM.y - 0.55) {
        b.v.x += ((w.hx - b.p.x) * 60 - (b.v.x - w.hvx) * 12) * h;
        b.v.z += ((RIM.z - b.p.z) * 60 - b.v.z * 12) * h;
        b.v.y *= 1 - 3 * h;
      }
    }

    let perch = 0, support = 0, imp;
    const touch = (kind, speed) => {
      if (b.shot && !b.shot.resolved) {
        b.shot.touched = true;
        if (kind === 'board') b.shot.board = true;
      }
      if (speed > 0.35) ev(w, kind, b, { speed });
    };
    if ((imp = hitRim(w, b, h))) { perch = 1; b.rimT += h; touch('rim', imp); }
    const bb = boardBox(w), br = bracketBox(w);
    if ((imp = hitBox(b, br.min, br.max, 0.45, 0.1, 1.2, h, w.hvx))) { perch = 1; touch('rim', imp); }
    if ((imp = hitBox(b, bb.min, bb.max, 0.62, 0.08, 0.6, h, w.hvx))) { perch = 1; touch('board', imp); }

    const inside = b.p.z < CAGE.front;
    if (inside) {
      // the ramp, rolling balls down toward the tray and in toward the middle
      if ((imp = hitPlane(b, 0, RAMP.y0, RAMP.z0, 0, cosA, sinA, 0.3, 0.12, 0.25, h))) {
        support = 1;
        b.v.y -= sinA * RAMP.push * h;
        b.v.z += cosA * RAMP.push * h;
        b.v.x -= clamp(b.p.x, -1, 1) * RAMP.funnel * h;
        if (imp > 0.35) ev(w, 'bounce', b, { speed: imp });
      }
      // the net cage: sides, back and top
      if ((imp = hitPlane(b, -CAGE.x, 0, 0, 1, 0, 0, 0.3, 0.2, 1, h))) { perch = 1; if (imp > 0.6) ev(w, 'cage', b, { speed: imp }); }
      if ((imp = hitPlane(b, CAGE.x, 0, 0, -1, 0, 0, 0.3, 0.2, 1, h))) { perch = 1; if (imp > 0.6) ev(w, 'cage', b, { speed: imp }); }
      if ((imp = hitPlane(b, 0, 0, CAGE.back, 0, 0, 1, 0.3, 0.2, 1, h))) { perch = 1; if (imp > 0.6) ev(w, 'cage', b, { speed: imp }); }
      if ((imp = hitPlane(b, 0, CAGE.top, 0, 0, -1, 0, 0.3, 0.2, 1, h))) { perch = 1; if (imp > 0.6) ev(w, 'cage', b, { speed: imp }); }
    }
    // the front of the machine (the tray's lip), and the arcade floor outside it
    if ((imp = hitBox(b, LIP.min, LIP.max, 0.4, 0.15, 1.5, h, 0))) { support = 1; if (imp > 0.35) ev(w, 'bounce', b, { speed: imp }); }
    if ((imp = hitPlane(b, 0, 0, 0, 0, 1, 0, 0.5, 0.15, 1.5, h))) { support = 1; if (imp > 0.35) ev(w, 'bounce', b, { speed: imp }); }

    // a shot that reaches the ramp or the floor without going in is a miss
    if (support && b.shot && !b.shot.resolved) {
      b.shot.resolved = true;
      if (!b.shot.scored) ev(w, 'miss', b, {});
    }
    b.support = !!support;

    // Never stuck: a slow ball held up by the rim, backboard or cage (not the ramp) gets a nudge toward the middle
    // of the hoop after a moment, so it drops in or rolls off. Three nudges and it's put back in the tray.
    const sp = Math.hypot(b.v.x - (perch ? w.hvx : 0), b.v.y, b.v.z);
    if (perch && !support && sp < 0.7) b.stuckT += h;
    else if (!perch) b.stuckT = Math.max(0, b.stuckT - h * 2);
    if (b.stuckT > 0.6) {
      b.stuckT = 0;
      b.nudges++;
      if (b.nudges > 3) {
        placeOnRamp(w, b, 0, -1.8);
        ev(w, 'recover', b, {});
      } else {
        const ddx = w.hx - b.p.x, ddz = RIM.z - b.p.z, L = Math.hypot(ddx, ddz) || 1;
        const toward = b.p.y > BOARD.bottom + BOARD.h - 0.05 ? 1.4 : 0.9; // off the top of the board: a bigger push
        b.v.x += (ddx / L) * toward;
        b.v.z += (ddz / L) * toward + (L < 0.05 ? 0.5 : 0);
        b.v.y += 0.8;
        ev(w, 'nudge', b, {});
      }
    }

    // a ball that bounced out over the tray: put it back on the ramp once it's down
    if (!inside && b.p.y < 0.6) {
      b.outT += h;
      if (b.outT > 0.5) {
        if (b.shot && !b.shot.resolved) { b.shot.resolved = true; if (!b.shot.scored) ev(w, 'miss', b, {}); }
        placeOnRamp(w, b, clamp(b.p.x, -1, 1), -1.9);
        ev(w, 'recover', b, {});
      }
    } else b.outT = 0;
    // and anything that went somewhere impossible (it shouldn't)
    if (!(Math.abs(b.p.x) < 6 && b.p.y > -1 && b.p.y < 9 && b.p.z > -9 && b.p.z < 6)) {
      if (b.shot && !b.shot.resolved) { b.shot.resolved = true; if (!b.shot.scored) ev(w, 'miss', b, {}); }
      placeOnRamp(w, b, 0, -1.9);
      ev(w, 'recover', b, {});
    }
    // a shot that's been going for ages counts as a miss (it's rolling back by now anyway)
    if (b.shot && !b.shot.resolved && b.shot.t > 6) {
      b.shot.resolved = true;
      if (!b.shot.scored) ev(w, 'miss', b, {});
    }
  }

  function collideBalls(w) {
    const bs = w.balls, D = BALL_R * 2;
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i];
      if (a.mode !== 'free') continue;
      for (let j = i + 1; j < bs.length; j++) {
        const c = bs[j];
        if (c.mode !== 'free') continue;
        let nx = c.p.x - a.p.x, ny = c.p.y - a.p.y, nz = c.p.z - a.p.z;
        const d2 = nx * nx + ny * ny + nz * nz;
        if (d2 >= D * D || d2 < 1e-12) continue;
        const d = Math.sqrt(d2);
        nx /= d; ny /= d; nz /= d;
        const pen = (D - d) / 2;
        a.p.x -= nx * pen; a.p.y -= ny * pen; a.p.z -= nz * pen;
        c.p.x += nx * pen; c.p.y += ny * pen; c.p.z += nz * pen;
        const rel = (c.v.x - a.v.x) * nx + (c.v.y - a.v.y) * ny + (c.v.z - a.v.z) * nz;
        if (rel < 0) {
          const j2 = (-(1 + 0.35) * rel) / 2;
          a.v.x -= nx * j2; a.v.y -= ny * j2; a.v.z -= nz * j2;
          c.v.x += nx * j2; c.v.y += ny * j2; c.v.z += nz * j2;
        }
      }
    }
  }

  // Advance the world by dt seconds. Returns the events since the last step:
  // score {swish, bank}, miss, net, rim, board, bounce, cage, nudge, recover (each with .ball, most with .speed).
  function step(w, dt) {
    w.events = [];
    let left = Math.min(dt, 0.1);
    while (left > 1e-9) {
      const h = Math.min(SUB, left);
      left -= h;
      w.t += h;
      const ox = w.hx;
      if (w.amp) w.hx = hoopXAt(w, w.t);
      else w.hx += (0 - w.hx) * Math.min(1, 3 * h);
      w.hvx = (w.hx - ox) / h;
      for (const b of w.balls) if (b.mode === 'free') substep(w, b, h);
      collideBalls(w);
    }
    for (const b of w.balls) {
      const sp = Math.hypot(b.v.x, b.v.y, b.v.z);
      b.rolling = b.support && sp > 0.15;
    }
    return w.events;
  }

  // Is this ball resting in the tray, ready for the shooter to pick up?
  const inTray = (b) => b.mode === 'free' && b.p.z > TRAY_Z && b.p.z < CAGE.front && Math.hypot(b.v.x, b.v.y, b.v.z) < 1.2 && b.p.y < 1.0;

  const Phys = {
    G, BALL_R, RIM, RIM_R, BOARD, RELEASE, ELEV, SPEED, RAMP, CAGE, LIP, TRAY_Z,
    rampY, create, addBall, setMotion, hoopXAt, placeOnRamp, launch, ideal, preview, step, inTray, speedFor, powerFor,
  };
  root.HT = root.HT || {};
  root.HT.Phys = Phys;
  if (typeof module === 'object' && module.exports) module.exports = Phys;
})(typeof window !== 'undefined' ? window : globalThis);
