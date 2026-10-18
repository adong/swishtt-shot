/* Hoops Teddy: the game. Rounds, the shooting input (drag / swipe up, or hold Space and aim with the arrows), the
   aim help, scoring with swishes, streaks and ON FIRE, the HUD and screens, and window.game for testing.
   Load order: kit, title.js, physics.js, sfx.js, arena.js, players.js, buddy.js, then this. */
(function () {
  'use strict';
  const T = THREE, Kit = window.Kit, HT = window.HT, P = HT.Phys, A = HT.arena, S = Kit.sound;
  const sfx = HT.sfx, shooter = HT.shooter, buddy = HT.buddy;

  // ---------------------------------------------------------------- tuning
  const BALLS = 3; // balls in the machine
  const ROUND_TIME = 60;
  const SHOT_DELAY = 0.2; // from the start of the jump to the ball leaving his hands
  const FIRE_AT = 3; // makes in a row to be ON FIRE
  const BUZZER_GRACE = 2.5; // balls already in the air when the buzzer goes still count for this long
  const GOALS = { easy: [10, 12, 14, 16, 18], normal: [20, 22, 24, 26, 28] }; // points needed in each round (+2 after)
  // the hoop's slide in each round: [amplitude m, period s]; easy slides a bit less, and slower
  const SLIDES = [[0, 0], [0.6, 9], [0.9, 8], [1.1, 7], [1.25, 6.5], [1.35, 6]];
  // aim help: errors inside the window are pulled toward the perfect shot (k = how much error is left at the centre)
  const ASSIST = {
    easy: { yawWin: 16, yawK: 0.15, powWin: 0.3, powK: 0.2, guide: 1 },
    normal: { yawWin: 7, yawK: 0.55, powWin: 0.1, powK: 0.6, guide: 0.3 },
  };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const store = {
    get(k, d) { try { const v = localStorage.getItem('hoopsTeddy.' + k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('hoopsTeddy.' + k, String(v)); } catch (e) { /* storage blocked */ } },
  };

  // ---------------------------------------------------------------- state
  const G = {
    state: 'loading', // title | countdown | playing | buzzer | roundEnd | over | paused
    prev: 'title', level: 'normal', player: null, round: 1, time: ROUND_TIME, score: 0, roundScore: 0,
    streak: 0, bestStreak: 0, fire: false, made: 0, swishes: 0, shots: 0, cleared: 0, stateT: 0, clock: 0,
    attractT: 2, lastInput: -10, hinted: false, held: false, autoPause: true, best: 0,
  };
  let world, ROSTER, thumbs = {};
  const ballVis = [];
  let holding = null, grab = null, pending = null, incoming = null, buffered = null;

  // ---------------------------------------------------------------- DOM
  const $ = (id) => document.getElementById(id);
  const show = (id, on) => $(id).classList.toggle('hidden', !on);
  const ui = {};

  function toast(text, cls) {
    if (G.state === 'title' && cls !== 'buddy') return;
    const el = document.createElement('div');
    el.className = 'toast' + (cls ? ' ' + cls : '');
    el.textContent = text;
    ui.toasts.appendChild(el);
    setTimeout(() => el.remove(), 1450);
    while (ui.toasts.children.length > 3) ui.toasts.firstChild.remove();
  }

  function popAt(text, cls, x, y, z) {
    const p = A.project(x, y, z);
    const el = document.createElement('div');
    el.className = 'pop' + (cls ? ' ' + cls : '');
    el.textContent = text;
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  function banner(html, ms) {
    ui.banner.innerHTML = html;
    show('banner', true);
    clearTimeout(banner.t);
    if (ms) banner.t = setTimeout(() => show('banner', false), ms);
  }

  // ---------------------------------------------------------------- boot
  function boot() {
    A.init($('game'));
    world = P.create({ rimR: P.RIM_R.normal });
    for (let i = 0; i < BALLS; i++) {
      const b = P.addBall(world);
      P.placeOnRamp(world, b, (i - 1) * 0.3, -0.85 - i * 0.28);
      ballVis.push(A.addBall());
    }
    shooter.init(A.scene);
    buddy.init({
      scene: A.scene, world, arena: A,
      hooks: {
        toast, sfx,
        canReceive: () => !holding && !grab && !pending && !incoming && !shooter.shooting() && G.state !== 'over',
        expect: (b) => { incoming = b; },
        handSpot: (out) => shooter.ballSpot(out),
        receive: (b) => {
          if (incoming === b) incoming = null;
          if (holding || grab || pending || shooter.shooting()) return false;
          takeBall(b);
          sfx('catch');
          return true;
        },
        resolveMiss: (b) => { b.shot.resolved = true; onMiss(b); },
      },
    });
    ROSTER = Kit.roster.list;
    thumbs = Kit.portraits(ROSTER);
    ui.toasts = $('toasts');
    ui.banner = $('banner');
    ui.fx = $('fx');
    ui.fxg = ui.fx.getContext('2d');
    buildLogo();
    buildPicker();
    wireUI();
    const saved = store.get('player', 'teddy');
    setPlayer(Kit.roster.get(saved) ? saved : 'teddy');
    resize();
    window.addEventListener('resize', resize);
    G.state = 'title';
    show('loading', false);
    S.music('title');
    requestAnimationFrame(loop);
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    if (!w || !h) return;
    A.fit(w, h);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ui.fx.width = Math.round(w * dpr);
    ui.fx.height = Math.round(h * dpr);
    ui.fxg.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function buildLogo() {
    const t = window.HT_TITLE || 'Hoops';
    const i = t.indexOf(' ');
    const l1 = i > 0 ? t.slice(0, i) : t, l2 = i > 0 ? t.slice(i + 1) : '';
    const tt = (s) => s.toUpperCase().replace(/TT/g, '<em>T</em><em>T</em>');
    $('logo').innerHTML = `<span class="l1">${tt(l1)}</span>` + (l2 ? `<span class="l2">${tt(l2)}</span>` : '');
  }

  function buildPicker() {
    const row = $('picker');
    ROSTER.forEach((c, i) => {
      if (i === 2) row.appendChild(Object.assign(document.createElement('span'), { className: 'brk' }));
      const b = document.createElement('button');
      b.className = 'avatar' + (i < 2 ? ' hero' : '');
      b.dataset.id = c.id;
      b.setAttribute('role', 'radio');
      b.innerHTML = `<img alt="" src="${thumbs[c.id]}"><span class="nm">${c.name}</span><span class="bs">BEST ${bestOf(c.id)}</span>`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        S.init();
        sfx('click');
        setPlayer(c.id);
        b.blur();
      });
      row.appendChild(b);
    });
    const b = document.createElement('button');
    b.className = 'avatar buddy';
    b.id = 'buddyCard';
    b.innerHTML = `<img alt=""><span class="nm"></span><span class="bs">TAP ME!</span>`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      S.init();
      sfx('click');
      callBuddy();
      b.blur();
    });
    row.appendChild(b);
  }

  const bestOf = (id) => +store.get('best.' + id, 0) || 0;

  function setPlayer(id) {
    const entry = Kit.roster.get(id);
    G.player = entry;
    store.set('player', id);
    shooter.setEntry(entry);
    const bid = Kit.roster.buddyFor(id);
    const be = Kit.roster.get(bid);
    buddy.setEntry(be);
    const nice = be.name[0] + be.name.slice(1).toLowerCase();
    const card = $('buddyCard');
    card.querySelector('img').src = thumbs[bid];
    card.querySelector('.nm').textContent = be.name;
    $('buddyFace').src = $('pwBuddyFace').src = thumbs[bid];
    $('buddyName').textContent = be.name;
    $('buddyKeyName').textContent = nice;
    $('buddyBtn').title = `Call ${nice} to rebound (T)`;
    document.querySelectorAll('#picker .avatar[data-id]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.id === id)));
    $('bestName').textContent = entry.name;
    G.best = bestOf(id);
    $('bestTitle').textContent = G.best;
    setLevel(store.get('level.' + id, id === 'tommy' ? 'easy' : 'normal'), true);
    if (holding) dropHeld();
  }

  function setLevel(level, quiet) {
    G.level = level === 'easy' ? 'easy' : 'normal';
    if (!quiet && G.player) store.set('level.' + G.player.id, G.level);
    document.querySelectorAll('.level button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.level === G.level)));
    world.rimR = P.RIM_R[G.level];
    A.setRim(world.rimR);
  }

  function wireUI() {
    const tap = (id, fn) => $(id).addEventListener('click', (e) => { e.stopPropagation(); S.init(); sfx('click'); fn(); e.currentTarget.blur(); });
    tap('playBtn', () => startGame());
    tap('againBtn', () => startGame());
    tap('menuBtn', () => toTitle());
    tap('resumeBtn', () => resume());
    tap('quitBtn', () => toTitle());
    tap('pauseBtn', () => pause());
    tap('muteBtn', () => toggleMute());
    $('buddyBtn').addEventListener('pointerdown', (e) => e.stopPropagation());
    tap('buddyBtn', () => callBuddy());
    document.querySelectorAll('.level button').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      S.init();
      sfx('click');
      setLevel(b.dataset.level);
      b.blur();
    }));
    $('muteBtn').textContent = S.isMuted() ? '🔇' : '🔊';
    const cv = $('game');
    cv.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (G.autoPause && (G.state === 'playing' || G.state === 'countdown')) pause();
        S.suspend();
      } else S.resume();
    });
    window.addEventListener('blur', () => { key.charge = false; key.left = key.right = false; });
  }

  function toggleMute() {
    const m = S.toggleMute();
    $('muteBtn').textContent = m ? '🔇' : '🔊';
  }

  // ---------------------------------------------------------------- game flow

  function resetBalls() {
    if (holding) holding = null;
    grab = pending = incoming = buffered = null;
    buddy.dismiss();
    world.balls.forEach((b, i) => {
      b.shot = null;
      P.placeOnRamp(world, b, (i - 1) * 0.3, -0.85 - i * 0.28);
      A.setFire(i, false);
    });
  }

  function startGame() {
    S.init();
    Object.assign(G, { round: 1, score: 0, streak: 0, bestStreak: 0, fire: false, made: 0, swishes: 0, shots: 0, cleared: 0, hinted: false });
    G.best = bestOf(G.player.id);
    A.clearTreats();
    resetBalls();
    shooter.stopCelebrating();
    show('title', false);
    show('over', false);
    show('pause', false);
    show('hud', true);
    setFire(false);
    startRound();
  }

  function startRound() {
    G.time = ROUND_TIME;
    G.roundScore = 0;
    const s = SLIDES[Math.min(G.round - 1, SLIDES.length - 1)];
    const extra = Math.max(0, G.round - SLIDES.length);
    const easy = G.level === 'easy';
    G.slide = [s[0] * (easy ? 0.85 : 1), Math.max(4.5, s[1] - extra * 0.25) * (easy ? 1.3 : 1)];
    P.setMotion(world, 0);
    const goals = GOALS[G.level];
    G.goal = goals[G.round - 1] || goals[goals.length - 1] + 2 * (G.round - goals.length);
    setState('countdown');
    const msg = G.round === 1 ? 'GET READY!' : s[0] ? 'THE HOOP IS MOVING!' : 'HERE WE GO!';
    banner(`<div class="big">ROUND ${G.round}</div><div class="sub">${msg} &nbsp; GOAL <b>${G.goal}</b> POINTS</div>`);
    A.setLights('idle');
    S.music('play');
    updateHud(true);
  }

  function setState(s) {
    G.state = s;
    G.stateT = 0;
  }

  function endRound() {
    setState('roundEnd');
    const ok = G.roundScore >= G.goal;
    if (ok) {
      G.cleared++;
      sfx('fanfare');
      sfx('crowd', true);
      A.setLights('win');
      banner(`<div class="big">ROUND CLEAR!</div><div class="sub">${G.roundScore} POINTS · NEXT: ROUND <b>${G.round + 1}</b></div>`);
      shooter.celebrate(2.8, true);
      confetti();
    } else {
      sfx('aww');
      const close = G.goal - G.roundScore <= 4;
      banner(`<div class="big">TIME'S UP!</div><div class="sub">${close ? 'SO CLOSE! ' : ''}${G.roundScore} OF <b>${G.goal}</b> POINTS</div>`);
    }
    G.roundOk = ok;
    P.setMotion(world, 0);
  }

  function gameOver() {
    setState('over');
    show('banner', false);
    show('hud', false);
    setFire(false);
    const id = G.player.id;
    const prevBest = bestOf(id);
    const isBest = G.score > prevBest;
    if (isBest) store.set('best.' + id, G.score);
    G.best = Math.max(prevBest, G.score);
    $('ovTitle').textContent = G.cleared >= 3 ? 'SUPERSTAR!' : G.score >= 40 ? 'GREAT SHOOTING!' : G.score > 0 ? 'NICE SHOOTING!' : 'GOOD TRY!';
    $('ovScore').textContent = G.score;
    $('ovRounds').textContent = G.cleared;
    $('ovMade').textContent = G.made;
    $('ovSwish').textContent = G.swishes;
    $('ovStreak').textContent = G.bestStreak;
    $('ovBestLabel').textContent = `${G.player.name}'S BEST`;
    $('ovBest').textContent = G.best;
    $('newBest').classList.toggle('on', isBest && G.score > 0);
    document.querySelectorAll('#picker .avatar[data-id]').forEach((b) => { b.querySelector('.bs').textContent = 'BEST ' + bestOf(b.dataset.id); });
    $('bestTitle').textContent = G.best;
    show('over', true);
    S.music('over');
    if (isBest && G.score > 0) { confetti(); shooter.celebrate(3, true); }
  }

  function toTitle() {
    resetBalls();
    setFire(false);
    P.setMotion(world, 0);
    show('over', false);
    show('pause', false);
    show('hud', false);
    show('banner', false);
    show('title', true);
    setState('title');
    G.attractT = 1.5;
    S.music('title');
  }

  function pause() {
    if (G.state !== 'playing' && G.state !== 'countdown' && G.state !== 'buzzer') return;
    G.prev = G.state;
    G.state = 'paused';
    endDrag();
    key.charge = false;
    show('pause', true);
    S.music('pause');
  }

  function resume() {
    if (G.state !== 'paused') return;
    G.state = G.prev;
    show('pause', false);
    S.music('play');
  }

  function callBuddy() {
    if (G.state === 'over' || G.state === 'paused' || G.state === 'loading') return;
    buddy.call();
  }

  // ---------------------------------------------------------------- balls in hands

  function takeBall(b) {
    b.mode = 'held';
    b.shot = null;
    holding = b;
    A.setFire(world.balls.indexOf(b), false);
  }

  function dropHeld() {
    if (!holding) return;
    P.placeOnRamp(world, holding, 0, -0.9);
    holding = null;
  }

  const _v = new T.Vector3();
  function updateHands(dt) {
    shooter.holding = !!(holding || pending);
    // pick up the next ball from the tray (not mid-jump, mid-celebration, or with a pass on its way)
    if (!holding && !grab && !pending && !incoming && !shooter.busy() && G.state !== 'over' && G.state !== 'roundEnd') {
      let best = null;
      for (const b of world.balls) if (P.inTray(b) && (!best || b.p.z > best.p.z)) best = b;
      if (best) {
        best.mode = 'carry';
        grab = { ball: best, from: new T.Vector3(best.p.x, best.p.y, best.p.z), u: 0 };
        shooter.stopCelebrating();
      }
    }
    if (grab) {
      grab.u += dt / 0.2;
      shooter.ballSpot(_v);
      const k = Math.min(1, grab.u), b = grab.ball;
      b.p.x = grab.from.x + (_v.x - grab.from.x) * k;
      b.p.y = grab.from.y + (_v.y - grab.from.y) * k + Math.sin(k * Math.PI) * 0.25;
      b.p.z = grab.from.z + (_v.z - grab.from.z) * k;
      if (k >= 1) {
        takeBall(b);
        grab = null;
        sfx('catch');
      }
    }
    if (holding || pending) {
      const b = holding || pending.ball;
      shooter.ballSpot(_v);
      if (pending) _v.y += Math.min(1, pending.t / SHOT_DELAY) * 0.12; // rolls up onto his fingertips for the shot
      b.p.x = _v.x; b.p.y = _v.y; b.p.z = _v.z;
    }
    // a shot asked for while empty-handed goes as soon as a ball is in hand
    if (buffered) {
      buffered.t -= dt;
      if (holding && !shooter.busy()) {
        const s = buffered;
        buffered = null;
        shoot(s.yaw, s.power, s.raw);
      } else if (buffered.t <= 0) buffered = null;
    }
    // release
    if (pending) {
      pending.t += dt;
      if (pending.t >= SHOT_DELAY) {
        const b = pending.ball, i = world.balls.indexOf(b);
        const shot = P.launch(world, b, pending.yaw, pending.power);
        shot.fire = G.fire;
        shot.counts = G.state === 'playing';
        A.spin(i, b.v);
        A.setFire(i, G.fire);
        sfx('shoot');
        if (G.fire) sfx('flame');
        pending = null;
        if (shot.counts) G.shots++;
      }
    }
  }

  // ---------------------------------------------------------------- shooting

  const canShoot = () => G.state === 'playing' || G.state === 'title';

  // Shoot: yaw in degrees (0 = straight ahead, + = right), power 0..1. raw skips the aim help.
  function shoot(yaw, power, raw) {
    if (!canShoot()) return false;
    shooter.stopCelebrating();
    if (!holding || shooter.shooting()) {
      buffered = { yaw, power, raw, t: 0.7 };
      return false;
    }
    if (!raw) ({ yaw, power } = assist(yaw, power));
    pending = { ball: holding, yaw, power, t: 0 };
    holding = null;
    shooter.shoot();
    return true;
  }

  function assist(yaw, power) {
    const id = P.ideal(world, SHOT_DELAY), a = ASSIST[G.level];
    const pull = (d, win, k) => (Math.abs(d) < win ? d * (k + (1 - k) * (d / win) * (d / win)) : d);
    return { yaw: id.yaw + pull(yaw - id.yaw, a.yawWin, a.yawK), power: id.power + pull(power - id.power, a.powWin, a.powK) };
  }

  // Swipe -> shot. Straight up goes straight down the machine. Leaning the swipe aims it: it points at a spot on
  // the rim's line as if the swipe had started right below the hoop's middle (a bit less, so it's forgiving).
  // Its length is the power.
  const SWIPE_SIDE = 0.8;
  function aimFromSwipe(dx, dy) {
    const R = P.RELEASE;
    const b = A.project(R.x, R.y, R.z), h0 = A.project(0, P.RIM.y, P.RIM.z), h1 = A.project(1, P.RIM.y, P.RIM.z);
    const up = Math.min(dy, -1);
    const xs = (SWIPE_SIDE * dx * (h0.y - b.y)) / up;
    const xw = xs / ((h1.x - h0.x) || 1);
    const yaw = (Math.atan2(xw - R.x, R.z - P.RIM.z) * 180) / Math.PI;
    const ref = clamp(window.innerHeight * 0.5, 170, 460);
    return { yaw: clamp(yaw, -40, 40), power: clamp(Math.hypot(dx, dy) / ref, 0, 1.1) };
  }

  // ---------------------------------------------------------------- input: drag / swipe

  let drag = null;
  function onDown(e) {
    if (e.button !== undefined && e.button > 0) return;
    S.init();
    if (drag || !canShoot()) return;
    try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
    G.lastInput = G.clock;
    shooter.stopCelebrating();
    $('game').classList.add('aiming');
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    const dx = drag.x - drag.x0, dy = drag.y - drag.y0;
    endDrag();
    G.lastInput = G.clock;
    if (dy < -24 && Math.hypot(dx, dy) > 36) {
      const a = aimFromSwipe(dx, dy);
      shoot(a.yaw, a.power);
    }
  }
  function onCancel(e) { if (drag && e.pointerId === drag.id) endDrag(); }
  function endDrag() {
    drag = null;
    $('game').classList.remove('aiming');
  }

  // ---------------------------------------------------------------- input: keyboard

  const key = { left: false, right: false, charge: false, chargeT: 0, aimX: 0, showT: 0 };
  function onKey(e) {
    const k = e.key;
    if (k === 't' || k === 'T') { S.init(); callBuddy(); return; }
    if (k === 'm' || k === 'M') { toggleMute(); return; }
    if (G.state === 'title') {
      if (k === 'Enter' || (k === ' ' && !e.repeat)) { e.preventDefault(); S.init(); startGame(); return; }
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        const ids = ROSTER.map((c) => c.id), i = ids.indexOf(G.player.id);
        setPlayer(ids[(i + (k === 'ArrowLeft' ? ids.length - 1 : 1)) % ids.length]);
        sfx('click');
        return;
      }
      if (k === 'e' || k === 'E') { setLevel(G.level === 'easy' ? 'normal' : 'easy'); sfx('click'); return; }
    }
    if (G.state === 'over' && (k === 'Enter' || (k === ' ' && G.stateT > 1 && !e.repeat))) { e.preventDefault(); startGame(); return; }
    if (k === 'p' || k === 'P' || k === 'Escape') { G.state === 'paused' ? resume() : pause(); return; }
    if (G.state === 'paused' && (k === 'Enter' || k === ' ')) { e.preventDefault(); resume(); return; }
    if (k === 'ArrowLeft') { key.left = true; key.showT = 1.2; e.preventDefault(); }
    if (k === 'ArrowRight') { key.right = true; key.showT = 1.2; e.preventDefault(); }
    if (k === ' ' && G.state === 'playing') {
      e.preventDefault();
      if (!key.charge && !e.repeat) { S.init(); key.charge = true; key.chargeT = 0; shooter.stopCelebrating(); G.lastInput = G.clock; }
    }
  }
  function onKeyUp(e) {
    const k = e.key;
    if (k === 'ArrowLeft') key.left = false;
    if (k === 'ArrowRight') key.right = false;
    if (k === ' ' && key.charge) {
      key.charge = false;
      G.lastInput = G.clock;
      const a = keyAim();
      shoot(a.yaw, a.power);
    }
  }
  // Space charges the power up and back down (so holding too long isn't a disaster); arrows move the aim.
  // On easy the aim rides along with a sliding hoop; on normal you follow it yourself.
  function keyPower() {
    const u = (key.chargeT / 1.25) % 2;
    return u < 1 ? u : 2 - u;
  }
  function keyAim() {
    const R = P.RELEASE;
    const x = (G.level === 'easy' ? world.hx : 0) + key.aimX;
    return { yaw: (Math.atan2(x - R.x, R.z - P.RIM.z) * 180) / Math.PI, power: keyPower() };
  }
  function updateKeys(dt) {
    if (key.left) key.aimX -= dt * 1.3;
    if (key.right) key.aimX += dt * 1.3;
    key.aimX = clamp(key.aimX, -1.9, 1.9);
    if (key.charge) key.chargeT += dt;
    key.showT = Math.max(0, key.showT - dt);
  }

  // ---------------------------------------------------------------- the aim guide and the drag arrow

  function aimNow() {
    if (drag) {
      const dx = drag.x - drag.x0, dy = drag.y - drag.y0;
      if (dy < -10) return aimFromSwipe(dx, dy);
      return null;
    }
    if (key.charge || key.showT > 0) {
      const a = keyAim();
      if (!key.charge) a.power = P.ideal(world, SHOT_DELAY).power; // just aiming: show where it would go
      return a;
    }
    return null;
  }

  function updateGuide() {
    shooter.aiming = !!(drag || key.charge);
    const a = canShoot() && G.state === 'playing' ? aimNow() : null;
    if (!a) { A.showGuide(null); return; }
    const s = assist(a.yaw, a.power), lvl = ASSIST[G.level];
    const pts = P.preview(s.yaw, s.power, 0.04, 1.6);
    const n = Math.max(3, Math.round(pts.length * lvl.guide));
    // on easy the whole arc shows, and it turns green when it's going in: let go!
    const id = P.ideal(world, SHOT_DELAY);
    const onTarget = lvl.guide >= 1 && Math.abs(s.yaw - id.yaw) < 2 && Math.abs(s.power - id.power) < 0.045;
    A.showGuide(pts.slice(0, n), onTarget ? '#7dff6a' : G.fire ? '#ffb02e' : '#ffffff');
  }

  function drawOverlay() {
    const g = ui.fxg, w = window.innerWidth, h = window.innerHeight;
    g.clearRect(0, 0, w, h);
    let p = null, x0, y0, x1, y1;
    if (drag) {
      x0 = drag.x0; y0 = drag.y0; x1 = drag.x; y1 = drag.y;
      if (y1 - y0 < -6) p = aimFromSwipe(x1 - x0, y1 - y0).power;
    } else if (key.charge) {
      p = keyPower();
      x0 = w / 2; y0 = h * 0.86; x1 = x0; y1 = y0 - 40 - p * h * 0.3;
    }
    if (p === null) return;
    const col = p < 0.35 ? '#7be37a' : p < 0.7 ? '#ffd400' : '#ff6a3d';
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(20,18,31,0.55)';
    g.lineWidth = 16;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.strokeStyle = col;
    g.lineWidth = 9;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    const ang = Math.atan2(y1 - y0, x1 - x0);
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(x1 + Math.cos(ang) * 16, y1 + Math.sin(ang) * 16);
    g.lineTo(x1 + Math.cos(ang + 2.4) * 18, y1 + Math.sin(ang + 2.4) * 18);
    g.lineTo(x1 + Math.cos(ang - 2.4) * 18, y1 + Math.sin(ang - 2.4) * 18);
    g.closePath();
    g.fill();
    // a power ring at the start
    g.lineWidth = 7;
    g.strokeStyle = 'rgba(20,18,31,0.55)';
    g.beginPath(); g.arc(x0, y0, 26, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = col;
    g.beginPath(); g.arc(x0, y0, 26, -Math.PI / 2, -Math.PI / 2 + Math.min(1, p) * Math.PI * 2); g.stroke();
  }

  // ---------------------------------------------------------------- scoring

  function setFire(on) {
    G.fire = on;
    $('fire').classList.toggle('on', on);
    A.setLights(on ? 'fire' : G.state === 'roundEnd' && G.roundOk ? 'win' : 'idle');
  }

  function onScore(e) {
    const b = e.ball, s = b.shot, R = P.RIM;
    const counted = s && s.counts && (G.state === 'playing' || G.state === 'buzzer');
    const pts = (e.swish ? 3 : 2) * (s && s.fire ? 2 : 1);
    sfx('net');
    sfx('coin', Math.min(G.streak + 1, 12));
    A.netKick(e.swish ? 1.4 : 1, world.hx);
    const fire = s && s.fire;
    A.particles.burst(world.hx, R.y - 0.15, R.z, fire ? 34 : 20, fire
      ? { speed: 2.2, up: 1.5, life: 0.7, size: 0.16, size2: 0.02, gravity: -1, colors: [[1, 0.8, 0.3], [1, 0.45, 0.05], [1, 0.95, 0.6]] }
      : { speed: 1.8, up: 1.0, life: 0.6, size: 0.08, gravity: 4, colors: [[1, 0.95, 0.6], [0.6, 0.95, 1], [1, 0.6, 0.85]] });
    if (!counted) {
      if (G.state === 'title' && e.swish) shooter.celebrate(1.0);
      return;
    }
    G.score += pts;
    G.roundScore += pts;
    G.made++;
    if (e.swish) G.swishes++;
    G.streak++;
    G.bestStreak = Math.max(G.bestStreak, G.streak);
    bumpScore();
    popAt(`+${pts}`, fire ? 'fire' : e.swish ? 'swish' : '', world.hx, R.y + 0.35, R.z);
    if (G.state === 'buzzer') toast('BUZZER BEATER!', 'big');
    else if (e.swish) toast(fire ? 'FIRE SWISH!' : 'SWISH!', fire ? 'fire' : '');
    if (!G.fire && G.streak >= FIRE_AT) {
      setFire(true);
      sfx('fire');
      sfx('crowd', true);
      toast('🔥 ON FIRE! 🔥', 'fire big');
      A.shake(0.6);
      if (!drag && !key.charge) shooter.celebrate(1.1, true);
    } else if (!drag && !key.charge && !holding && !grab && !pending && !incoming) shooter.celebrate(e.swish ? 1.3 : 1.0);
    if (G.roundScore >= G.goal && G.roundScore - pts < G.goal) {
      toast('GOAL REACHED! KEEP GOING!', 'save');
      sfx('powerup');
    }
    if (e.swish) sfx('crowd', false);
  }

  function onMiss(b) {
    const s = b.shot;
    if (!s || !s.counts || (G.state !== 'playing' && G.state !== 'buzzer')) return;
    if (buddy.guarding()) {
      if (G.streak > 0) {
        toast(`${buddy.entry.name} SAVED YOUR STREAK!`, 'save');
        buddy.cheerT = Math.max(buddy.cheerT, 0.4);
      }
      return;
    }
    if (G.fire) toast('FIRE\'S OUT, KEEP SHOOTING!', 'hint');
    G.streak = 0;
    setFire(false);
  }

  function bumpScore() {
    const el = $('score');
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  function confetti() {
    const cols = [[1, 0.24, 0.5], [0.1, 0.83, 1], [1, 0.83, 0], [0.25, 0.88, 0.69], [0.6, 0.42, 1]];
    for (let i = 0; i < 4; i++) {
      A.particles.burst((i - 1.5) * 0.9, 3.6, -2.4, 30, { speed: 3.2, up: 2.5, life: 1.6, size: 0.1, gravity: 3.5, drag: 1.2, colors: cols });
    }
  }

  const soundGap = new Map();
  function handleEvents(events) {
    for (const e of events) {
      const k = e.type + e.ball.id;
      const last = soundGap.get(k) || -1;
      const ok = G.clock - last > 0.07;
      switch (e.type) {
        case 'score': onScore(e); break;
        case 'miss': onMiss(e.ball); break;
        case 'rim': if (ok) { sfx('rim', e.speed); soundGap.set(k, G.clock); } break;
        case 'board': if (ok) { sfx('board', e.speed); soundGap.set(k, G.clock); } if (e.speed > 4) A.shake(0.25); break;
        case 'bounce': if (ok) { sfx('bounce', e.speed); soundGap.set(k, G.clock); } break;
        case 'cage': if (ok) { sfx('cage'); soundGap.set(k, G.clock); } break;
        case 'recover': {
          sfx('poof');
          const p = e.ball.p;
          A.particles.burst(p.x, p.y, p.z, 12, { speed: 1.2, up: 0.8, life: 0.5, size: 0.12, gravity: 1, color: [1, 1, 1] });
          break;
        }
      }
    }
  }

  // ---------------------------------------------------------------- the title screen: he shoots on his own

  function attract(dt) {
    if (G.clock - G.lastInput < 3) return;
    G.attractT -= dt;
    if (G.attractT > 0 || !holding || shooter.busy()) return;
    G.attractT = 2.2 + Math.random() * 1.2;
    const id = P.ideal(world, SHOT_DELAY);
    const r = Math.random();
    const err = r < 0.55 ? 0 : r < 0.85 ? 0.03 : 0.07;
    shoot(id.yaw + (Math.random() - 0.5) * err * 30, id.power + (Math.random() - 0.5) * err * 1.6, true);
  }

  // ---------------------------------------------------------------- HUD

  const hud = {};
  const setText = (id, v) => {
    if (hud[id] !== v) {
      hud[id] = v;
      $(id).textContent = v;
    }
  };
  function updateHud(force) {
    if (force) for (const k in hud) delete hud[k];
    const t = Math.max(0, Math.ceil(G.time));
    const title = G.state === 'title';
    A.drawHeader({ score: title ? 0 : G.score, time: title ? 60 : t, round: G.round, fire: G.fire, label: title ? 'PLAY ME!' : '' });
    if (title) return;
    setText('score', String(G.score));
    setText('hudBest', String(Math.max(G.best, G.score)));
    setText('clock', String(t));
    setText('round', `ROUND ${G.round}`);
    setText('goalText', `GOAL ${G.goal}`);
    $('clock').classList.toggle('low', t <= 10 && G.state === 'playing');
    $('goalFill').style.transform = `scaleX(${clamp(G.roundScore / G.goal, 0, 1)})`;
    $('goal').classList.toggle('done', G.roundScore >= G.goal);
    const spans = $('streak').children;
    for (let i = 0; i < spans.length; i++) spans[i].classList.toggle('lit', G.fire || G.streak > i);
    $('streak').classList.toggle('fire', G.fire);
    $('onfire').classList.toggle('on', G.fire);
    const guard = buddy.guarding();
    $('pwBuddy').classList.toggle('on', guard);
    $('buddyBtn').classList.toggle('guarding', guard);
    if (guard) $('pwBuddyFill').style.transform = `scaleX(${buddy.guardLeft()})`;
  }

  // ---------------------------------------------------------------- main loop

  function tick(dt) {
    G.clock += dt;
    if (G.state === 'paused' || G.state === 'loading') return;
    G.stateT += dt;
    const st = G.state;
    if (st === 'countdown') {
      const n = 3 - Math.floor(G.stateT / 0.75);
      if (G.stateT > 0.9 && n !== G.cd) {
        G.cd = n;
        if (n > 0 && G.stateT > 0.9) {
          banner(`<div class="big">${n}</div>`);
          sfx('beep', false);
        }
      }
      if (G.stateT >= 0.9 + 2.25) {
        banner('<div class="big">GO!</div>', 650);
        sfx('beep', true);
        G.cd = null;
        setState('playing');
        if (G.slide[0]) P.setMotion(world, G.slide[0], G.slide[1]);
      }
    } else if (st === 'playing') {
      const before = Math.ceil(G.time);
      G.time -= dt;
      const after = Math.ceil(G.time);
      if (after !== before && after <= 5 && after > 0) sfx('tick');
      if (!G.hinted && G.round === 1 && G.stateT > 4 && G.shots === 0) {
        G.hinted = true;
        const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        toast(touch ? 'SWIPE UP TOWARD THE HOOP!' : 'DRAG UP AND LET GO! (OR HOLD SPACE)', 'hint');
      }
      if (G.time <= 0) {
        G.time = 0;
        sfx('buzzer');
        endDrag();
        key.charge = false;
        buffered = null;
        setState('buzzer');
      }
    } else if (st === 'buzzer') {
      const flying = world.balls.some((b) => b.shot && b.shot.counts && !b.shot.resolved) || (pending && pending.ball);
      if (!flying || G.stateT > BUZZER_GRACE) endRound();
    } else if (st === 'roundEnd') {
      if (G.stateT > 3.2) {
        if (G.roundOk) {
          G.round++;
          startRound();
        } else gameOver();
      }
    } else if (st === 'title') attract(dt);

    updateKeys(dt);
    handleEvents(P.step(world, dt));
    updateHands(dt);
    shooter.update(dt, G.clock);
    buddy.update(dt, G.clock);
    A.frame(dt, world);
    A.shelfBounce(G.clock);
    updateGuide();
    updateHud();
  }

  let last = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    if (!G.held) tick(dt); // held by a test: only game.step() moves time, but keep drawing the current moment
    A.render();
    drawOverlay();
  }

  // ---------------------------------------------------------------- testing hooks
  // The Browser pane throttles requestAnimationFrame while hidden, so tests drive time themselves:
  //   game.hold(true); game.autoPause = false; game.start('teddy'); game.step(3.5); game.shoot(...game.idealArgs())
  window.game = {
    get autoPause() { return G.autoPause; },
    set autoPause(v) { G.autoPause = !!v; },
    hold(on) { G.held = on !== false; },
    step(sec) {
      const n = Math.max(1, Math.round((sec || 1 / 60) * 60));
      for (let i = 0; i < n; i++) tick(1 / 60);
      A.render();
      drawOverlay();
      return this.info();
    },
    start(id, opts) {
      if (id) setPlayer(id);
      if (opts && opts.level) setLevel(opts.level);
      startGame();
      return this.info();
    },
    play() { return this.start(); },
    title() { toTitle(); },
    pick(id) { setPlayer(id); },
    level(l) { setLevel(l); },
    // a scripted shot: yaw in degrees (+ right), power 0..1, no aim help. Puts a ball in his hands if needed.
    shoot(angle, power) {
      if (!holding) {
        if (grab) { takeBall(grab.ball); grab = null; }
        else {
          const b = world.balls.find((x) => x.mode === 'free' && (!x.shot || x.shot.resolved)) || world.balls.find((x) => x.mode === 'free');
          if (b) takeBall(b);
        }
      }
      shooter.shotT = -1;
      shooter.stopCelebrating();
      return shoot(angle, power, true);
    },
    ideal() { const i = P.ideal(world, SHOT_DELAY); return { angle: +i.yaw.toFixed(3), power: +i.power.toFixed(4), flight: +i.T.toFixed(3) }; },
    idealArgs() { const i = P.ideal(world, SHOT_DELAY); return [i.yaw, i.power]; },
    // a swipe through the real input path: from (x0, y0) to (x1, y1) in CSS px
    swipe(x0, y0, x1, y1) {
      const cv = $('game');
      const ev = (type, x, y) => new PointerEvent(type, { pointerId: 7, clientX: x, clientY: y, bubbles: true, button: 0, isPrimary: true });
      cv.dispatchEvent(ev('pointerdown', x0, y0));
      window.dispatchEvent(ev('pointermove', (x0 + x1) / 2, (y0 + y1) / 2));
      window.dispatchEvent(ev('pointerup', x1, y1));
      return this.info();
    },
    dragTo(x0, y0, x1, y1) { // start a drag and leave it held (to see the guide); release with game.release()
      drag = { id: 9, x0, y0, x: x1, y: y1 };
      $('game').classList.add('aiming');
    },
    release() {
      if (!drag) return;
      const dx = drag.x - drag.x0, dy = drag.y - drag.y0;
      endDrag();
      const a = aimFromSwipe(dx, dy);
      return shoot(a.yaw, a.power);
    },
    aimFromSwipe,
    buddy() { callBuddy(); return buddy.info(); },
    buddyInfo: () => buddy.info(),
    setRound(n) { G.round = n; startRound(); },
    setTime(s) { G.time = s; },
    setStreak(n) { G.streak = n; if (n >= FIRE_AT) setFire(true); },
    celebrate(s) { shooter.celebrate(s || 1.5, true); },
    world: () => world,
    info() {
      return {
        state: G.state, player: G.player && G.player.id, level: G.level, round: G.round, time: +G.time.toFixed(2), score: G.score,
        roundScore: G.roundScore, goal: G.goal, streak: G.streak, fire: G.fire, made: G.made, swishes: G.swishes, shots: G.shots,
        hoopX: +world.hx.toFixed(3), holding: !!holding, pending: !!pending,
        balls: world.balls.map((b) => ({ mode: b.mode, x: +b.p.x.toFixed(2), y: +b.p.y.toFixed(2), z: +b.p.z.toFixed(2), tray: P.inTray(b), shot: b.shot && { scored: b.shot.scored, swish: b.shot.swish, resolved: b.shot.resolved } })),
        buddy: buddy.info(),
      };
    },
  };

  window.addEventListener('load', boot);
})();
