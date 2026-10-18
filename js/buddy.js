/* Hoops Teddy: the buddy (Tommy, or Teddy when Tommy shoots) comes in as the rebounder.
   Tap his button or press T and he hops into the machine under the hoop for about 10 s, with a name tag. He says hi
   with his signature move, throws you a treat (it lands on the shelf on the front of the machine), then catches the
   balls as they come down and passes them straight back into your hands with a little cheer, about twice as fast as
   the ramp would. While he's there a miss doesn't break your streak. Then he says bye and hops out.
   Exposes HT.buddy. It's modelled on the buddy in Metro Surfer (js/game.js there). */
(function () {
  'use strict';
  const T = THREE, Kit = window.Kit, HT = window.HT, P = HT.Phys;

  const TREATS = [['🍦', 'ICE CREAM'], ['💧', 'WATER'], ['🧃', 'JUICE BOX'], ['🍪', 'COOKIE'], ['🍉', 'WATERMELON'], ['🍌', 'BANANA']];
  const GUARD_UNTIL = 9.6; // he rebounds and saves your streak until here
  const BYE_UNTIL = 10.8; // then says bye
  const GONE = 12.0; // and hops out
  const ENTER_X = P.CAGE.x + 1.1;
  const HOME_Z = -2.95; // where he waits, on the ramp just in front of the hoop
  const PASS_T = 0.5; // a pass takes this long; the ramp takes about 2 s
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const damp = (r, dt) => 1 - Math.exp(-r * dt);

  const B = {
    entry: null, person: null, tag: null, on: false, t: 0, x: ENTER_X, z: HOME_Z, face: Math.PI,
    given: false, extra: 0, holding: null, holdT: 0, cheerT: 0, mode: '', poseT: 0, ph: 0, passes: 0, catches: 0,
  };
  let ctx = null; // { scene, world, arena, hooks: { toast, sfx, canReceive, receive, resolveMiss, handSpot } }
  const flights = []; // passes in the air: { ball, from, to, u, hands }
  const treatFly = { sprite: null, u: -1, from: new T.Vector3(), to: new T.Vector3(), slot: null };

  B.init = function (c) {
    ctx = c;
    treatFly.sprite = new T.Sprite(new T.SpriteMaterial({ depthWrite: false }));
    treatFly.sprite.visible = false;
    ctx.scene.add(treatFly.sprite);
  };

  // Swap in a different buddy (the shooter changed).
  B.setEntry = function (entry) {
    if (B.entry && B.entry.id === entry.id) return;
    if (B.person) {
      B.dismiss();
      HT.disposePerson(B.person);
    }
    B.entry = entry;
    B.person = HT.makePerson(entry, entry.buddyScale || 0.8);
    B.tag = Kit.gfx.nameTag(entry.name, entry.tag || '#ffb02e');
    B.tag.position.y = 2.7;
    B.person.m.root.add(B.tag);
    B.person.group.visible = false;
    ctx.scene.add(B.person.group);
  };

  const nice = () => B.entry.name[0] + B.entry.name.slice(1).toLowerCase();
  B.guarding = () => B.on && B.t < GUARD_UNTIL;
  B.guardLeft = () => clamp(1 - B.t / GUARD_UNTIL, 0, 1);

  // Every tap brings him. Tapping again once he's handed over his treat makes him say hi again with another one;
  // tapping before that adds an extra treat; tapping while he's leaving brings him straight back.
  B.call = function () {
    if (!B.on) {
      Object.assign(B, { on: true, t: 0, x: ENTER_X, z: HOME_Z, given: false, extra: 0, holding: null, holdT: 0, cheerT: 0, mode: '', poseT: 0 });
      B.person.group.visible = true;
      ctx.hooks.toast(`${B.entry.name} IS HERE TO REBOUND!`, 'buddy');
      return;
    }
    if (B.t >= GUARD_UNTIL) {
      B.t = 1.0;
      B.given = false;
      ctx.hooks.toast(`${B.entry.name} IS BACK!`, 'buddy');
    } else if (B.given) {
      B.t = 1.0;
      B.given = false;
    } else B.extra++;
  };

  B.dismiss = function () {
    if (B.holding) dropToTray(B.holding);
    B.holding = null;
    for (const f of flights.splice(0)) dropToTray(f.ball);
    B.on = false;
    if (B.person) B.person.group.visible = false;
  };

  function dropToTray(ball) {
    P.placeOnRamp(ctx.world, ball, (Math.random() - 0.5) * 0.4, -1.05);
    ball.v.z = 0.8;
  }

  function throwTreat() {
    const [emoji, label] = Kit.gfx.pick(TREATS);
    treatFly.sprite.material.map = Kit.gfx.emojiTexture(emoji);
    treatFly.sprite.material.needsUpdate = true;
    treatFly.sprite.visible = true;
    treatFly.sprite.scale.setScalar(0.4);
    B.person.group.updateMatrixWorld(true);
    Kit.people.handWorld(B.person.m, 1, treatFly.from);
    treatFly.to.copy(ctx.arena.addTreat(emoji));
    treatFly.slot = ctx.arena.lastTreat();
    treatFly.slot.visible = false;
    treatFly.u = 0;
    treatFly.emoji = emoji;
    ctx.hooks.toast(`${emoji} ${label} FROM ${B.entry.name}!`, 'buddy');
    ctx.hooks.sfx('powerup');
  }

  function updateTreat(dt) {
    if (treatFly.u < 0) return;
    treatFly.u += dt / 0.8;
    const k = Math.min(1, treatFly.u);
    treatFly.sprite.position.lerpVectors(treatFly.from, treatFly.to, k);
    treatFly.sprite.position.y += Math.sin(k * Math.PI) * 1.4;
    treatFly.sprite.material.rotation = k * 6.3;
    if (k >= 1) {
      treatFly.u = -1;
      treatFly.sprite.visible = false;
      if (treatFly.slot) treatFly.slot.visible = true;
      const p = treatFly.to;
      ctx.arena.particles.burst(p.x, p.y, p.z, 18, { speed: 1.6, up: 1.2, life: 0.6, size: 0.09, gravity: 3, colors: [[1, 0.95, 0.6], [1, 0.6, 0.85], [0.6, 0.95, 1]] });
      ctx.hooks.sfx('treat');
    }
  }

  // A ball he could catch: on its way down below the rim (or already rolling back), within reach of his hands.
  function catchable(ball, gy) {
    if (ball.mode !== 'free') return false;
    if (ball.p.z > -1.7 || ball.p.z < -4.6) return false;
    if (!(ball.shot ? ball.shot.resolved || ball.v.y < 0 : true)) return false;
    if (ball.p.y > P.RIM.y - 0.35) return false;
    const reach = 2.0 * B.person.scale + 0.3;
    if (ball.p.y < gy + 0.18 || ball.p.y > gy + reach) return false;
    return true;
  }

  function startPass(ball) {
    const hands = ctx.hooks.canReceive();
    const from = new T.Vector3(ball.p.x, ball.p.y, ball.p.z);
    const to = new T.Vector3();
    if (hands) {
      ctx.hooks.expect(ball);
      ctx.hooks.handSpot(to);
    } else to.set((Math.random() - 0.5) * 0.4, P.rampY(-0.95) + P.BALL_R, -0.95);
    flights.push({ ball, from, to, u: 0, hands });
    B.passes++;
    B.cheerT = 0.45;
    ctx.hooks.sfx('cheer', B.entry.id === 'tommy');
    ctx.hooks.sfx('swipe');
  }

  function updateFlights(dt) {
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i];
      f.u += dt / PASS_T;
      if (f.hands) ctx.hooks.handSpot(f.to); // home in on his hands as they move
      const k = Math.min(1, f.u);
      const b = f.ball;
      b.p.x = f.from.x + (f.to.x - f.from.x) * k;
      b.p.y = f.from.y + (f.to.y - f.from.y) * k + Math.sin(k * Math.PI) * 0.7;
      b.p.z = f.from.z + (f.to.z - f.from.z) * k;
      b.v.x = (f.to.x - f.from.x) / PASS_T;
      b.v.z = (f.to.z - f.from.z) / PASS_T;
      b.v.y = 0;
      if (k >= 1) {
        flights.splice(i, 1);
        if (!(f.hands && ctx.hooks.receive(b))) dropToTray(b);
      }
    }
  }

  const _hand = new T.Vector3();
  B.update = function (dt, time) {
    updateTreat(dt);
    updateFlights(dt);
    if (!B.on) return;
    const world = ctx.world;
    B.t += dt;
    const t = B.t;
    B.ph += dt * 9;

    // where he wants to be: under the hoop, or under a ball that's coming down
    let tx = clamp(world.hx + 0.5, -1.4, 1.5), tz = HOME_Z, target = null;
    const leaving = t >= BYE_UNTIL;
    const working = t > 0.6 && t < GUARD_UNTIL;
    const gy = P.rampY(B.z);
    if (working && !B.holding) {
      let best = null;
      for (const b of world.balls) {
        if (b.mode !== 'free' || b.p.z > -1.6) continue;
        const falling = b.p.y < P.RIM.y + 0.2 && (b.v.y < 0.5 || b.support) && b.p.z < -2.0;
        if (!falling) continue;
        if (!best || b.p.y < best.p.y) best = b;
      }
      if (best) {
        target = best;
        tx = clamp(best.p.x, -1.6, 1.6);
        tz = clamp(best.p.z + 0.35, -3.75, -2.2);
      }
    }
    if (leaving) tx = ENTER_X;
    const speed = t < 1 ? 4.5 : leaving ? 4.0 : 5.0;
    const dx = tx - B.x, dz = tz - B.z, dist = Math.hypot(dx, dz);
    const moving = dist > 0.05;
    if (moving) {
      const step = Math.min(dist, speed * dt);
      B.x += (dx / dist) * step;
      B.z += (dz / dist) * step;
    }
    // catch
    if (working && !B.holding && target && catchable(target, gy)) {
      const hx = B.x, hz = B.z + 0.35;
      if (Math.hypot(target.p.x - hx, target.p.z - hz) < 0.75) {
        target.mode = 'carry';
        target.v.x = target.v.y = target.v.z = 0;
        if (target.shot && !target.shot.resolved) ctx.hooks.resolveMiss(target);
        B.holding = target;
        B.holdT = 0;
        B.catches++;
        ctx.hooks.sfx('catch');
      }
    }
    if (B.holding) {
      B.holdT += dt;
      if (B.holdT > 0.3) {
        const ball = B.holding;
        B.holding = null;
        startPass(ball);
      }
    }
    // treats
    if (!B.given && t > 2.4 && t < GUARD_UNTIL) {
      B.given = true;
      throwTreat();
    } else if (B.given && B.extra > 0 && treatFly.u < 0 && t < GUARD_UNTIL) {
      B.extra--;
      throwTreat();
    }

    // pose: hello and bye with his signature move; catching, passing and cheering in between
    const hello = t > 0.9 && t < 2.2, giving = t > 2.2 && t < 2.8, bye = t >= GUARD_UNTIL && t < BYE_UNTIL;
    let mode;
    if (B.holding) mode = B.holdT < 0.2 ? 'catch' : 'pass';
    else if (B.cheerT > 0) mode = B.cheerT > 0.3 ? 'pass' : Kit.roster.signature(B.entry, 'hello') === 'peace' ? 'peace' : 'yay';
    else if (t < 1 || leaving) mode = 'run';
    else if (moving && dist > 0.25) mode = 'run';
    else if (hello) mode = Kit.roster.signature(B.entry, 'hello');
    else if (giving) mode = 'give';
    else if (bye) mode = Kit.roster.signature(B.entry, 'goodbye');
    else if (target) mode = 'catch';
    else mode = 'ready';
    B.cheerT = Math.max(0, B.cheerT - dt);
    B.poseT = mode === B.mode ? B.poseT + dt : 0;
    B.mode = mode;
    HT.pose(B.person.m, mode === 'boxing' ? time * 6.5 : B.ph, mode, damp(20, dt));

    // height: the arcade floor outside the machine, the ramp inside, and a hop over the side to get in and out
    const out = clamp((B.x - (P.CAGE.x - 0.3)) / 0.9, 0, 1);
    const ground = P.rampY(B.z) * (1 - out);
    const hop = Math.sin(out * Math.PI) * 0.75;
    let jump = 0;
    if (mode === 'jumpshot') jump = Math.max(0, Math.sin(Math.min(1, B.poseT / 0.6) * Math.PI)) * 0.45;
    if (mode === 'peace' || mode === 'yay') jump = Math.abs(Math.sin(time * 6)) * 0.08;
    B.person.group.position.set(B.x, ground + hop, B.z);
    B.person.m.root.position.y = jump;
    // face where he's running, otherwise face the shooter
    const faceTo = mode === 'run' && moving ? Math.atan2(-dx, -dz) : Math.PI;
    let d = faceTo - B.face;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    B.face += d * damp(12, dt);
    B.person.group.rotation.y = B.face;
    B.person.shadow.rotation.x = -Math.PI / 2 + (out < 1 ? P.RAMP.slope : 0);
    B.person.shadow.visible = hop < 0.2;

    // a ball he's holding sits in his hands
    if (B.holding) {
      HT.ballSpot(B.person, _hand);
      const b = B.holding, k = Math.min(1, B.holdT / 0.08);
      b.p.x += (_hand.x - b.p.x) * k;
      b.p.y += (_hand.y - b.p.y) * k;
      b.p.z += (_hand.z - b.p.z) * k;
    }
    if (t > GONE) B.dismiss();
  };

  B.info = () => ({
    who: B.entry && B.entry.id, on: B.on, t: +B.t.toFixed(2), guarding: B.guarding(), mode: B.mode, holding: !!B.holding,
    passes: B.passes, catches: B.catches, x: +B.x.toFixed(2), z: +B.z.toFixed(2), flights: flights.length,
  });

  HT.buddy = B;
  HT.TREATS = TREATS;
})();
