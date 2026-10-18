/* Hoops Teddy: the people. Extra poses on top of Kit.people.pose (holding the ball, aiming, catching, passing), and
   the shooter: he holds the ball at his chest, crouches while you aim, does Teddy's jump shot on every shot and
   celebrates with his signature move (Teddy's Tyson-style boxing, Tommy's Y with peace fingers). Exposes HT.pose,
   HT.makePerson and HT.shooter. */
(function () {
  'use strict';
  const T = THREE, Kit = window.Kit, HT = window.HT, P = HT.Phys;
  const People = Kit.people;

  // Custom poses: targets for legs (x), arms (x, and z: + swings out), lean, twist, head tilt, bob and leg spread.
  const CUSTOM = {
    idle: (ph) => ({ ll: 0, rl: 0, la: 0.12 + Math.sin(ph) * 0.03, ra: 0.12 - Math.sin(ph) * 0.03, laz: 0.12, raz: 0.12, lean: -0.04, head: 0.05, bob: Math.sin(ph * 2) * 0.01 }),
    // ball at the chest, hands either side of it
    hold: (ph) => ({ ll: 0.08, rl: -0.06, la: 1.12, ra: 1.12, laz: -0.34, raz: -0.34, lean: -0.06, head: -0.12, bob: Math.sin(ph * 2) * 0.012, spread: 0.08 }),
    // dip and load up while you drag
    aim: () => ({ ll: 0.22, rl: 0.1, la: 0.98, ra: 0.98, laz: -0.36, raz: -0.36, lean: -0.26, head: -0.32, bob: -0.07, spread: 0.2 }),
    // hands up and forward, ready for a ball
    ready: (ph) => ({ ll: 0.05, rl: -0.05, la: 0.9, ra: 0.9, laz: -0.1, raz: -0.1, lean: -0.12, head: -0.05, bob: Math.abs(Math.sin(ph * 2)) * 0.02, spread: 0.12 }),
    catch: () => ({ ll: 0.2, rl: -0.15, la: 1.7, ra: 1.7, laz: -0.22, raz: -0.22, lean: -0.15, head: -0.2, bob: -0.04, spread: 0.18 }),
    pass: () => ({ ll: 0.35, rl: -0.25, la: 1.5, ra: 1.5, laz: -0.05, raz: -0.05, lean: -0.32, head: 0.05, bob: -0.05, spread: 0.15 }),
    // the bounce of a little cheer: fists up
    yay: (ph) => ({ ll: 0, rl: 0, la: 2.8, ra: 2.8, laz: 0.25 + Math.sin(ph * 3) * 0.1, raz: 0.25 + Math.sin(ph * 3) * 0.1, lean: 0.05, head: -0.15, bob: Math.abs(Math.sin(ph * 3)) * 0.06 }),
  };
  const STANDING = { peace: 1, wave: 1, give: 1, boxing: 0, jumpshot: 0 };

  // Ease a person toward a pose. Kit poses go through Kit.people.pose; `peace`, `wave` and `give` stride like a
  // runner there, so a standing person damps the legs back to almost still.
  function pose(p, ph, mode, k) {
    const c = CUSTOM[mode];
    if (!c) {
      People.pose(p, ph, mode, k);
      if (STANDING[mode]) {
        p.legL.rotation.x *= 0.25;
        p.legR.rotation.x *= 0.25;
        p.hips.position.y = p.hipY + (p.hips.position.y - p.hipY) * 0.3;
      }
      p.legL.rotation.z += (0 - p.legL.rotation.z) * k;
      p.legR.rotation.z += (0 - p.legR.rotation.z) * k;
      return;
    }
    const t = c(ph);
    const to = (o, prop, v) => { o[prop] += (v - o[prop]) * k; };
    to(p.legL.rotation, 'x', t.ll || 0);
    to(p.legR.rotation, 'x', t.rl || 0);
    to(p.legL.rotation, 'z', -(t.spread || 0));
    to(p.legR.rotation, 'z', t.spread || 0);
    to(p.armL.rotation, 'x', t.la || 0);
    to(p.armR.rotation, 'x', t.ra || 0);
    to(p.armL.rotation, 'z', -(t.laz || 0));
    to(p.armR.rotation, 'z', t.raz || 0);
    to(p.hips.rotation, 'x', t.lean || 0);
    to(p.hips.rotation, 'y', t.twist || 0);
    to(p.head.rotation, 'x', t.head || 0);
    p.hips.position.y += (p.hipY + (t.bob || 0) - p.hips.position.y) * k;
    if (p.fingers) for (const f of p.fingers) f.visible = false;
    p.rig.scale.setScalar(p.rig.scale.x + (1 - p.rig.scale.x) * k);
  }

  let shadowTex = null;
  // A roster character with a soft round shadow, in its own group (so the game can move and turn it).
  function makePerson(entry, scale) {
    const g = new T.Group();
    const m = People.build(entry.look);
    m.root.scale.setScalar(scale || 1);
    g.add(m.root);
    if (!shadowTex) shadowTex = Kit.gfx.radialTexture(128, [[0, 'rgba(8,4,24,0.6)'], [0.6, 'rgba(8,4,24,0.25)'], [1, 'rgba(8,4,24,0)']]);
    const sh = new T.Mesh(new T.PlaneGeometry(1.1 * (scale || 1), 0.8 * (scale || 1)), new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.012;
    g.add(sh);
    return { group: g, m, shadow: sh, entry, scale: scale || 1 };
  }

  function disposePerson(person) {
    person.group.traverse((o) => {
      if (o.isMesh || o.isSprite) {
        if (o.geometry) o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((mt) => mt && mt.dispose());
      }
    });
    if (person.group.parent) person.group.parent.remove(person.group);
  }

  // Where a ball held in both hands sits: between the hands, a little in front of them.
  const _l = new T.Vector3(), _r = new T.Vector3(), _f = new T.Vector3();
  function ballSpot(person, out) {
    person.group.updateMatrixWorld(true);
    People.handWorld(person.m, -1, _l);
    People.handWorld(person.m, 1, _r);
    out.copy(_l).add(_r).multiplyScalar(0.5);
    // nudge it out in front (the way he's facing) so it sits between the palms, not inside the wrists
    _f.set(0, 0, -1).applyQuaternion(person.group.quaternion);
    return out.addScaledVector(_f, 0.06 * person.scale);
  }

  // ---------------------------------------------------------------- the shooter

  const SHOT_TIME = 0.56; // the jump: up and down
  const shooter = {
    person: null, entry: null, ph: 0, shotT: -1, celebT: 0, lockT: 0, celebMode: 'wave', turn: 0, aiming: false, holding: false,
    hop: 0, scene: null, x: 0,
  };

  shooter.init = function (scene) { shooter.scene = scene; };

  shooter.setEntry = function (entry) {
    if (shooter.entry && shooter.entry.id === entry.id) return;
    if (shooter.person) disposePerson(shooter.person);
    shooter.entry = entry;
    shooter.person = makePerson(entry, 1);
    shooter.person.group.position.set(0, 0, 0);
    shooter.scene.add(shooter.person.group);
    shooter.shotT = -1;
    shooter.celebT = 0;
  };

  // Start the jump shot. The game releases the ball SHOT_DELAY seconds in, near the top of the jump.
  shooter.shoot = function () {
    shooter.shotT = 0;
    shooter.celebT = 0;
  };
  shooter.shooting = () => shooter.shotT >= 0 && shooter.shotT < SHOT_TIME;
  // too busy to pick up a ball: mid-jump, or in a celebration that's worth waiting for (ON FIRE, round clear)
  shooter.busy = () => shooter.shooting() || shooter.lockT > 0;

  // His signature celebration: Teddy boxes, Tommy does the Y, everyone else waves. He turns toward you for it.
  // An ordinary one stops as soon as there's a ball to pick up; a locked one plays out first.
  shooter.celebrate = function (secs, lock) {
    shooter.celebT = secs || 1.2;
    shooter.lockT = lock ? shooter.celebT : 0;
    shooter.celebMode = Kit.roster.signature(shooter.entry, 'hello');
    if (shooter.entry.id === 'teddy') shooter.celebMode = 'boxing';
  };
  shooter.stopCelebrating = function () { shooter.celebT = shooter.lockT = 0; };

  shooter.update = function (dt, time) {
    const s = shooter, person = s.person;
    if (!person) return;
    s.ph += dt * 3;
    let mode, k = 1 - Math.exp(-18 * dt), ph = s.ph;
    s.hop = 0;
    if (s.shooting()) {
      s.shotT += dt;
      const u = Math.min(1, s.shotT / SHOT_TIME);
      s.hop = Math.sin(u * Math.PI) * 0.42;
      mode = 'jumpshot';
      k = 1 - Math.exp(-38 * dt);
      if (s.shotT >= SHOT_TIME) s.shotT = -1;
    } else if (s.celebT > 0) {
      s.celebT -= dt;
      s.lockT = Math.max(0, s.lockT - dt);
      mode = s.celebMode;
      if (mode === 'boxing') ph = time * 6.5;
      if (mode === 'peace') s.hop = Math.abs(Math.sin(time * 5)) * 0.12;
    } else if (s.holding) mode = s.aiming ? 'aim' : 'hold';
    else mode = 'ready';
    pose(person.m, ph, mode, k);
    const turnTo = s.celebT > 0 ? Math.PI * 0.82 : 0;
    s.turn += (turnTo - s.turn) * (1 - Math.exp(-(turnTo ? 9 : 16) * dt));
    person.group.rotation.y = s.turn;
    person.m.root.position.y = s.hop;
    person.shadow.scale.setScalar(1 - s.hop * 0.6); // the shadow stays on the floor and shrinks while he jumps
  };

  // Where his ball is: in his hands, or tucked at his hip while his hands are busy celebrating.
  shooter.ballSpot = (out) => {
    if (shooter.celebT > 0 && !shooter.shooting()) {
      shooter.person.group.updateMatrixWorld(true);
      return shooter.person.m.root.localToWorld(out.set(0.45, 1.0, -0.12));
    }
    return ballSpot(shooter.person, out);
  };

  HT.pose = pose;
  HT.makePerson = makePerson;
  HT.disposePerson = disposePerson;
  HT.ballSpot = ballSpot;
  HT.shooter = shooter;
  HT.SHOT_TIME = SHOT_TIME;
})();
