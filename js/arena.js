/* Hoops Teddy: everything you see except the people. The arcade room, the shooting machine (ramp, cage, lights,
   scoreboard), the sliding backboard with its rim and a verlet net that wobbles, the balls with their shadows and
   flames, particles, the aim guide and the treat shelf. Exposes HT.arena. Positions come from HT.Phys. */
(function () {
  'use strict';
  const T = THREE, Kit = window.Kit, HT = window.HT, P = HT.Phys;
  const { makeCanvas, toTexture, std, roundRect, FONT, radialTexture } = Kit.gfx;

  const A = (HT.arena = {});
  const tr = (en) => (Kit.lang ? Kit.lang.t(en) : en); // canvas text in 中文 too (Kit.lang)
  let renderer, scene, camera;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const slope = P.RAMP.slope;

  // a plain mesh helper that also takes receiveShadow-free flat panels
  function box(w, h, d, mat, x, y, z, parent) {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    (parent || scene).add(m);
    return m;
  }
  function plane(w, h, mat, parent) {
    const m = new T.Mesh(new T.PlaneGeometry(w, h), mat);
    (parent || scene).add(m);
    return m;
  }
  const basic = (o) => new T.MeshBasicMaterial(o);

  // ---------------------------------------------------------------- textures (all painted on canvases)

  function carpetTexture() {
    const [c, g] = makeCanvas(256, 256);
    g.fillStyle = '#1b1442';
    g.fillRect(0, 0, 256, 256);
    const cols = ['#ff3d7f', '#18d4ff', '#ffd400', '#3fe0b0', '#9b6bff'];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.lineWidth = 5;
    g.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const x = rnd() * 256, y = rnd() * 256, k = Math.floor(rnd() * 3);
      g.strokeStyle = g.fillStyle = cols[i % cols.length];
      g.globalAlpha = 0.8;
      if (k === 0) { g.beginPath(); g.arc(x, y, 6 + rnd() * 6, 0, Math.PI * 2); g.stroke(); }
      else if (k === 1) {
        g.beginPath(); g.moveTo(x, y - 9); g.lineTo(x + 9, y + 7); g.lineTo(x - 9, y + 7); g.closePath(); g.fill();
      } else {
        g.beginPath(); g.moveTo(x - 14, y);
        for (let j = 1; j <= 4; j++) g.lineTo(x - 14 + j * 7, y + (j % 2 ? -6 : 6));
        g.stroke();
      }
    }
    g.globalAlpha = 1;
    const t = toTexture(c, true);
    t.repeat.set(7, 7);
    return t;
  }

  function wallTexture() {
    const [c, g] = makeCanvas(512, 256);
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#120a2a');
    gr.addColorStop(1, '#2a1650');
    g.fillStyle = gr;
    g.fillRect(0, 0, 512, 256);
    // neon stripes
    for (const [y, col] of [[176, '#ff3d7f'], [190, '#18d4ff']]) {
      g.shadowColor = col;
      g.shadowBlur = 14;
      g.fillStyle = col;
      g.fillRect(0, y, 512, 5);
    }
    g.shadowBlur = 0;
    // stars
    g.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 40; i++) g.fillRect((i * 97) % 512, (i * 53) % 150, 2, 2);
    const t = toTexture(c, true);
    t.repeat.set(3, 1);
    return t;
  }

  function rampTexture() {
    const [c, g] = makeCanvas(256, 512);
    g.fillStyle = '#2346b8';
    g.fillRect(0, 0, 256, 512);
    // padded strips
    for (let x = 0; x < 256; x += 64) {
      g.fillStyle = 'rgba(255,255,255,0.06)';
      g.fillRect(x + 2, 0, 28, 512);
    }
    // yellow chevrons pointing down the ramp, toward the shooter (the bottom of the texture)
    g.strokeStyle = 'rgba(255, 212, 0, 0.55)';
    g.lineWidth = 12;
    g.lineJoin = 'round';
    for (let y = 40; y < 512; y += 110) {
      g.beginPath(); g.moveTo(78, y); g.lineTo(128, y + 40); g.lineTo(178, y); g.stroke();
    }
    // edge stripes
    g.fillStyle = '#ffd400';
    g.fillRect(0, 0, 10, 512);
    g.fillRect(246, 0, 10, 512);
    return toTexture(c);
  }

  function frontTexture() {
    const [c, g] = makeCanvas(1024, 200);
    const gr = g.createLinearGradient(0, 0, 0, 200);
    gr.addColorStop(0, '#ff5a1f');
    gr.addColorStop(1, '#d4241e');
    g.fillStyle = gr;
    g.fillRect(0, 0, 1024, 200);
    g.fillStyle = '#ffd400';
    g.fillRect(0, 0, 1024, 14);
    // stars and balls
    g.font = `64px ${Kit.gfx.EMOJI_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 0; i < 8; i++) {
      const x = 64 + i * 128;
      if (i === 3 || i === 4) continue;
      g.fillText(i % 2 ? '⭐' : '🏀', x, 110);
    }
    g.font = `76px ${FONT}`;
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#14121f';
    g.lineWidth = 10;
    g.strokeText(tr('SHOOT!'), 512, 112);
    g.fillText(tr('SHOOT!'), 512, 112);
    return toTexture(c);
  }

  function skirtTexture() {
    const [c, g] = makeCanvas(256, 64);
    g.fillStyle = '#5b2bb5';
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#ffd400';
    g.fillRect(0, 52, 256, 6);
    return toTexture(c, true);
  }

  function netTexture() {
    const [c, g] = makeCanvas(64, 64);
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(64, 64);
    g.moveTo(64, 0); g.lineTo(0, 64);
    g.stroke();
    return toTexture(c, true);
  }

  function burstTexture() {
    const [c, g] = makeCanvas(512, 512);
    g.fillStyle = '#16207a';
    g.fillRect(0, 0, 512, 512);
    g.translate(256, 300);
    for (let i = 0; i < 24; i++) {
      g.rotate((Math.PI * 2) / 24);
      g.fillStyle = i % 2 ? '#1f2fa0' : '#2a43c9';
      g.beginPath(); g.moveTo(0, 0); g.lineTo(-70, -480); g.lineTo(70, -480); g.closePath(); g.fill();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    const gr = g.createRadialGradient(256, 300, 10, 256, 300, 300);
    gr.addColorStop(0, 'rgba(120,200,255,0.55)');
    gr.addColorStop(1, 'rgba(120,200,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 512, 512);
    return toTexture(c);
  }

  function boardTexture() {
    const W = 512, H = 336, ppm = H / P.BOARD.h;
    const [c, g] = makeCanvas(W, H);
    g.fillStyle = '#fbfbff';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#ff6a13';
    g.lineWidth = 16;
    g.strokeRect(8, 8, W - 16, H - 16);
    // the shooter's square, its bottom edge level with the rim
    const sw = 0.59 * ppm, sh = 0.45 * ppm, sb = H - (P.RIM.y - P.BOARD.bottom) * ppm;
    g.lineWidth = 11;
    g.strokeRect(W / 2 - sw / 2, sb - sh, sw, sh);
    // a little star of our own at the top
    g.fillStyle = '#18a4ff';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 9 : 22, a = -Math.PI / 2 + (i * Math.PI) / 5;
      g.lineTo(W / 2 + Math.cos(a) * r, 46 + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    return toTexture(c);
  }

  function ballTexture() {
    const [c, g] = makeCanvas(512, 256);
    g.fillStyle = '#e8701f';
    g.fillRect(0, 0, 512, 256);
    // pebbly grain
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,190,120,0.18)' : 'rgba(120,40,0,0.16)';
      g.fillRect(Math.random() * 512, Math.random() * 256, 2, 2);
    }
    g.strokeStyle = '#1e0f06';
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(0, 128); g.lineTo(512, 128); // equator
    for (const x of [128, 384]) { g.moveTo(x, 0); g.lineTo(x, 256); } // meridians
    // the two curved seams
    g.moveTo(256, 0); g.bezierCurveTo(176, 70, 176, 186, 256, 256);
    g.moveTo(0, 0); g.bezierCurveTo(80, 70, 80, 186, 0, 256);
    g.moveTo(512, 0); g.bezierCurveTo(432, 70, 432, 186, 512, 256);
    g.stroke();
    return toTexture(c);
  }

  // ---------------------------------------------------------------- the room

  function buildRoom() {
    const floor = plane(40, 40, std('#ffffff', { map: carpetTexture(), roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    const wall = plane(40, 14, std('#ffffff', { map: wallTexture(), roughness: 1 }));
    wall.position.set(0, 7, -9);
    for (const s of [-1, 1]) {
      const side = plane(30, 14, std('#ffffff', { map: wallTexture(), roughness: 1 }));
      side.position.set(s * 11, 7, 2);
      side.rotation.y = -s * Math.PI / 2;
    }
    // other arcade machines around the room, just shapes with glowing screens and marquees
    const cols = ['#ff3d7f', '#18d4ff', '#ffd400', '#3fe0b0', '#9b6bff', '#ff8a1f'];
    const spots = [[-4.4, -6.6, 0.3], [-6.2, -5.2, 0.6], [-7.6, -2.6, 1.0], [4.4, -6.6, -0.3], [6.2, -5.2, -0.6], [7.6, -2.6, -1.0]];
    spots.forEach(([x, z, ry], i) => {
      const g = new T.Group();
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      scene.add(g);
      const col = cols[i % cols.length];
      box(1.1, 2.1, 0.9, std('#2b1d52', { roughness: 0.6 }), 0, 1.05, 0, g);
      box(1.12, 0.35, 0.92, basic({ color: col }), 0, 2.05, 0, g);
      const scr = box(0.85, 0.65, 0.05, basic({ color: Kit.gfx.shade(cols[(i + 2) % cols.length], -0.25) }), 0, 1.45, 0.45, g);
      scr.rotation.x = -0.15;
      box(0.9, 0.12, 0.35, std('#14121f'), 0, 0.98, 0.55, g);
    });
  }

  // ---------------------------------------------------------------- the machine

  const bulbs = { mesh: null, n: 0, col: new T.Color(), mode: 'idle', t: 0 };
  const header = { canvas: null, ctx: null, tex: null, key: '' };

  function buildMachine() {
    const W = P.CAGE.x * 2, front = P.LIP.min.z, back = P.CAGE.back;
    const L = (front - back) / Math.cos(slope);
    // the ramp
    const ramp = plane(W, L, std('#ffffff', { map: rampTexture(), roughness: 0.85 }));
    ramp.rotation.x = -Math.PI / 2 + slope;
    const zm = (front + back) / 2;
    ramp.position.set(0, P.rampY(zm) - 0.003, zm);
    A.rampMesh = ramp;
    // the cabinet sides under the ramp
    const shape = new T.Shape();
    const hb = P.rampY(back) + 0.08;
    shape.moveTo(-P.CAGE.front, 0);
    shape.lineTo(-back, 0);
    shape.lineTo(-back, hb);
    shape.lineTo(-P.CAGE.front, P.LIP.max.y);
    shape.closePath();
    const skirtGeo = new T.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false });
    const skirtMat = std('#5b2bb5', { roughness: 0.6 });
    for (const s of [-1, 1]) {
      const m = new T.Mesh(skirtGeo, skirtMat);
      m.rotation.y = Math.PI / 2;
      m.position.set(s > 0 ? P.CAGE.x : -P.CAGE.x - 0.14, 0, 0);
      scene.add(m);
    }
    // the front (the tray's lip) with a chrome rail on top
    const fm = std('#ffffff', { map: frontTexture(), roughness: 0.5 });
    if (Kit.lang) Kit.lang.onChange(() => { fm.map.dispose(); fm.map = frontTexture(); fm.needsUpdate = true; });
    const side = std('#d4241e', { roughness: 0.5 });
    const fh = P.LIP.max.y, fd = P.LIP.max.z - P.LIP.min.z;
    box(W + 0.28, fh, fd, [side, side, side, side, fm, side], 0, fh / 2, (P.LIP.min.z + P.LIP.max.z) / 2);
    const chrome = std('#dfe6f0', { metalness: 0.8, roughness: 0.25 });
    const rail = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, W + 0.28, 12), chrome);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(0, fh + 0.02, P.LIP.max.z - 0.05);
    scene.add(rail);
    // the tray floor between the lip and the ramp (dark, so the balls stand out)
    // the cage: posts, top rails and side nets
    const postMat = std('#ffd400', { roughness: 0.4, metalness: 0.2 });
    const top = P.CAGE.top + 0.05;
    for (const sx of [-1, 1]) {
      for (const z of [P.CAGE.front - 0.08, back]) {
        const post = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, top, 10), postMat);
        post.position.set(sx * (P.CAGE.x + 0.07), top / 2, z);
        scene.add(post);
      }
      const railTop = new T.Mesh(new T.CylinderGeometry(0.045, 0.045, front - back, 8), postMat);
      railTop.rotation.x = Math.PI / 2;
      railTop.position.set(sx * (P.CAGE.x + 0.07), top, (front + back) / 2);
      scene.add(railTop);
      const nt = netTexture();
      nt.repeat.set((front - back) / 0.22, (top - fh) / 0.22);
      const net = plane(front - back, top - fh, basic({ map: nt, transparent: true, opacity: 0.35, side: T.DoubleSide, depthWrite: false }));
      net.rotation.y = Math.PI / 2;
      net.position.set(sx * P.CAGE.x, (top + fh) / 2, (front + back) / 2);
    }
    // the top net (faint)
    const tt = netTexture();
    tt.repeat.set(W / 0.22, (front - back) / 0.22);
    const tnet = plane(W, front - back, basic({ map: tt, transparent: true, opacity: 0.18, side: T.DoubleSide, depthWrite: false }));
    tnet.rotation.x = Math.PI / 2;
    tnet.position.set(0, top, (front + back) / 2);
    // the back panel, the rail the backboard slides on, and the header with the scoreboard
    const by = P.rampY(back);
    const bp = plane(W, top - by, basic({ map: burstTexture() }));
    bp.position.set(0, (top + by) / 2, back + 0.02);
    const slideRail = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, W, 12), chrome);
    slideRail.rotation.z = Math.PI / 2;
    slideRail.position.set(0, 3.35, back + 0.12);
    scene.add(slideRail);
    const hy = 4.48, hh = top - hy;
    [header.canvas, header.ctx] = makeCanvas(1024, Math.round((1024 * hh) / W));
    header.tex = toTexture(header.canvas);
    const hm = basic({ map: header.tex });
    box(W, hh, 0.2, [std('#14121f'), std('#14121f'), std('#14121f'), std('#14121f'), hm, std('#14121f')], 0, hy + hh / 2, back + 0.15);
    // light bulbs: along the header and up the front posts
    const spots = [];
    for (let i = 0; i <= 20; i++) {
      const x = -P.CAGE.x + 0.1 + (i * (W - 0.2)) / 20;
      spots.push([x, hy - 0.03, back + 0.27], [x, top + 0.02, back + 0.27]);
    }
    for (const sx of [-1, 1]) for (let i = 0; i < 14; i++) spots.push([sx * (P.CAGE.x + 0.07), 1.0 + i * 0.3, P.CAGE.front - 0.16]);
    bulbs.n = spots.length;
    bulbs.mesh = new T.InstancedMesh(new T.SphereGeometry(0.045, 8, 6), basic({ color: '#ffffff' }), spots.length);
    const m4 = new T.Matrix4();
    spots.forEach((s, i) => {
      bulbs.mesh.setMatrixAt(i, m4.makeTranslation(s[0], s[1], s[2]));
      bulbs.mesh.setColorAt(i, bulbs.col.set('#ffd400'));
    });
    bulbs.spots = spots;
    scene.add(bulbs.mesh);
  }

  // Scoreboard on the header: SCORE on the left, the title and round in the middle, TIME on the right.
  A.drawHeader = function (o) {
    const key = `${o.score}|${o.time}|${o.round}|${o.fire}|${o.label || ''}|${Kit.lang ? Kit.lang.get() : ''}`;
    if (key === header.key) return;
    header.key = key;
    const c = header.canvas, g = header.ctx, W = c.width, H = c.height;
    g.fillStyle = '#0b0718';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = o.fire ? '#ff8a1f' : '#ff3d7f';
    g.lineWidth = 8;
    roundRect(g, 6, 6, W - 12, H - 12, 18);
    g.stroke();
    const led = (text, x, y, size, col) => {
      g.font = `${size}px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.shadowColor = col;
      g.shadowBlur = 18;
      g.fillStyle = col;
      g.fillText(text, x, y);
      g.shadowBlur = 0;
    };
    const lab = (text, x) => {
      g.font = `22px ${FONT}`;
      g.textAlign = 'center';
      g.fillStyle = '#c9c3e6';
      g.fillText(text, x, H * 0.24);
    };
    lab(tr('SCORE'), 150);
    led(String(o.score).padStart(3, '0'), 150, H * 0.62, Math.round(H * 0.5), '#ff4a4a');
    lab(tr('TIME'), W - 150);
    led(String(o.time).padStart(2, '0'), W - 150, H * 0.62, Math.round(H * 0.5), '#4aff7a');
    const title = (window.HT_TITLE || 'HOOPS').toUpperCase();
    led(title, W / 2, H * 0.42, Math.min(Math.round(H * 0.34), Math.floor(560 / Math.max(6, title.length) * 1.5)), o.fire ? '#ffb02e' : '#ffd400');
    led(tr(o.label || `ROUND ${o.round}`), W / 2, H * 0.78, Math.round(H * 0.18), '#18d4ff');
    header.tex.needsUpdate = true;
  };

  A.setLights = (mode) => { bulbs.mode = mode; };
  function updateBulbs(dt) {
    bulbs.t += dt;
    const t = bulbs.t, n = bulbs.n;
    for (let i = 0; i < n; i++) {
      let h, l;
      if (bulbs.mode === 'fire') { h = 0.02 + 0.08 * ((Math.sin(i * 1.7 + t * 18) + 1) / 2); l = (i + Math.floor(t * 14)) % 3 ? 0.55 : 0.25; }
      else if (bulbs.mode === 'win') { h = 0.13; l = Math.floor(t * 8 + i) % 2 ? 0.6 : 0.3; }
      else { h = ((i * 0.07 + t * 0.15) % 1); l = (i + Math.floor(t * 5)) % 4 ? 0.5 : 0.22; }
      bulbs.mesh.setColorAt(i, bulbs.col.setHSL(h, 1, l));
    }
    bulbs.mesh.instanceColor.needsUpdate = true;
  }

  // ---------------------------------------------------------------- the hoop: backboard, rim, net (slides with hx)

  const hoop = { group: null, rim: null, R: 0 };

  function buildHoop() {
    hoop.group = new T.Group();
    scene.add(hoop.group);
    const B = P.BOARD;
    const edge = std('#ff6a13', { roughness: 0.5 });
    const face = std('#ffffff', { map: boardTexture(), roughness: 0.35 });
    box(B.w, B.h, B.d, [edge, edge, edge, edge, face, edge], 0, B.bottom + B.h / 2, B.z - B.d / 2, hoop.group);
    box(B.w + 0.02, 0.08, B.d + 0.06, std('#18a4ff', { roughness: 0.8 }), 0, B.bottom - 0.03, B.z - B.d / 2, hoop.group); // bottom pad
    // the arm back to the slide rail
    const chrome = std('#c9d2de', { metalness: 0.8, roughness: 0.3 });
    const armLen = B.z - B.d - (P.CAGE.back + 0.12);
    box(0.14, 0.14, armLen, chrome, 0, 3.35, B.z - B.d - armLen / 2, hoop.group);
    box(0.3, 0.3, 0.2, std('#14121f', { roughness: 0.5 }), 0, 3.35, P.CAGE.back + 0.2, hoop.group);
    hoop.bracket = box(0.13, 0.06, 0.2, std('#ff5a1f', { metalness: 0.3, roughness: 0.4 }), 0, P.RIM.y - 0.03, 0, hoop.group);
  }

  A.setRim = function (R) {
    if (hoop.R === R) return;
    hoop.R = R;
    if (hoop.rim) { hoop.group.remove(hoop.rim); hoop.rim.geometry.dispose(); }
    hoop.rim = new T.Mesh(new T.TorusGeometry(R, P.RIM.tube, 12, 48), std('#ff4d1a', { metalness: 0.35, roughness: 0.35, emissive: '#5a1200' }));
    hoop.rim.rotation.x = Math.PI / 2;
    hoop.rim.position.set(0, P.RIM.y, P.RIM.z);
    hoop.group.add(hoop.rim);
    const back = P.RIM.z - R - P.RIM.tube, len = back - P.BOARD.z;
    hoop.bracket.scale.z = Math.max(0.05, -len) / 0.2;
    hoop.bracket.position.z = (back + P.BOARD.z) / 2;
    buildNet(R);
  };

  // The net: rings of points joined in a diamond mesh, simulated with verlet integration. The top ring hangs on the
  // rim; each point is pulled softly back toward its resting shape, so it swings, stretches when a ball drops
  // through, and settles. Drawn as thin instanced cylinders.
  const NET = { N: 12, M: 6, len: 0.46, pts: [], links: [], draw: [], mesh: null, acc: 0 };
  function buildNet(R) {
    const { N, M } = NET;
    NET.pts = [];
    NET.links = [];
    NET.draw = [];
    for (let j = 0; j < M; j++) {
      const r = R * (1 - (0.4 * j) / (M - 1)), y = (-NET.len * j) / (M - 1);
      for (let i = 0; i < N; i++) {
        const a = ((i + (j % 2) * 0.5) * Math.PI * 2) / N;
        const rest = { x: Math.cos(a) * r, y, z: Math.sin(a) * r };
        NET.pts.push({ rest, p: { x: rest.x, y: P.RIM.y + y, z: P.RIM.z + rest.z }, o: null, pin: j === 0, a });
      }
    }
    for (const q of NET.pts) q.o = { x: q.p.x, y: q.p.y, z: q.p.z };
    const id = (i, j) => j * N + ((i % N) + N) % N;
    const link = (a, b, drawn) => {
      const pa = NET.pts[a].rest, pb = NET.pts[b].rest;
      const l = { a, b, len: Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z) };
      NET.links.push(l);
      if (drawn) NET.draw.push(l);
    };
    for (let j = 0; j < M - 1; j++) {
      for (let i = 0; i < N; i++) {
        // diamond: each point ties to the two nearest points in the row below
        if (j % 2 === 0) { link(id(i, j), id(i, j + 1), true); link(id(i, j), id(i - 1, j + 1), true); }
        else { link(id(i, j), id(i, j + 1), true); link(id(i, j), id(i + 1, j + 1), true); }
        link(id(i, j), id(i + 1, j), false); // rings keep it round
        if (j < M - 2) link(id(i, j), id(i, j + 2), false);
      }
    }
    for (let i = 0; i < N; i++) link(id(i, M - 1), id(i + 1, M - 1), false);
    if (NET.mesh) { scene.remove(NET.mesh); NET.mesh.geometry.dispose(); }
    const geo = new T.CylinderGeometry(0.0105, 0.0105, 1, 5, 1, true).translate(0, 0.5, 0);
    NET.mesh = new T.InstancedMesh(geo, basic({ color: '#f4f4ff' }), NET.draw.length);
    NET.mesh.frustumCulled = false;
    scene.add(NET.mesh);
  }

  const _a = new T.Vector3(), _b = new T.Vector3(), _q = new T.Quaternion(), _s = new T.Vector3(), _m = new T.Matrix4(), UP = new T.Vector3(0, 1, 0);
  function updateNet(dt, hx, balls) {
    NET.acc = Math.min(NET.acc + dt, 0.1);
    const h = 1 / 120, BR = P.BALL_R + 0.022, K = 400 * h * h;
    while (NET.acc >= h) {
      NET.acc -= h;
      for (const q of NET.pts) {
        if (q.pin) {
          q.p.x = hx + q.rest.x; q.p.y = P.RIM.y; q.p.z = P.RIM.z + q.rest.z;
          q.o.x = q.p.x; q.o.y = q.p.y; q.o.z = q.p.z;
          continue;
        }
        const tx = hx + q.rest.x, ty = P.RIM.y + q.rest.y, tz = P.RIM.z + q.rest.z;
        const vx = (q.p.x - q.o.x) * 0.985, vy = (q.p.y - q.o.y) * 0.985, vz = (q.p.z - q.o.z) * 0.985;
        q.o.x = q.p.x; q.o.y = q.p.y; q.o.z = q.p.z;
        // soft pull back to the resting shape, plus a little gravity
        q.p.x += vx + (tx - q.p.x) * K;
        q.p.y += vy + (ty - q.p.y) * K - 2.0 * h * h;
        q.p.z += vz + (tz - q.p.z) * K;
      }
      for (let it = 0; it < 3; it++) {
        for (const l of NET.links) {
          const a = NET.pts[l.a], b = NET.pts[l.b];
          const dx = b.p.x - a.p.x, dy = b.p.y - a.p.y, dz = b.p.z - a.p.z;
          const d = Math.hypot(dx, dy, dz) || 1e-6;
          if (d <= l.len) continue; // cords pull but don't push
          const k = (d - l.len) / d * 0.5;
          const wa = a.pin ? 0 : b.pin ? 1 : 0.5, wb = b.pin ? 0 : a.pin ? 1 : 0.5;
          a.p.x += dx * k * wa * 2; a.p.y += dy * k * wa * 2; a.p.z += dz * k * wa * 2;
          b.p.x -= dx * k * wb * 2; b.p.y -= dy * k * wb * 2; b.p.z -= dz * k * wb * 2;
        }
        // balls push the cords aside
        for (const bp of balls) {
          for (const q of NET.pts) {
            if (q.pin) continue;
            const dx = q.p.x - bp.x, dy = q.p.y - bp.y, dz = q.p.z - bp.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= BR * BR || d2 < 1e-10) continue;
            const d = Math.sqrt(d2), k = (BR - d) / d;
            q.p.x += dx * k; q.p.y += dy * k; q.p.z += dz * k;
          }
        }
      }
    }
    NET.draw.forEach((l, i) => {
      const a = NET.pts[l.a].p, b = NET.pts[l.b].p;
      _a.set(a.x, a.y, a.z);
      _b.set(b.x - a.x, b.y - a.y, b.z - a.z);
      const len = _b.length() || 1e-4;
      _q.setFromUnitVectors(UP, _b.multiplyScalar(1 / len));
      _m.compose(_a, _q, _s.set(1, len, 1));
      NET.mesh.setMatrixAt(i, _m);
    });
    NET.mesh.instanceMatrix.needsUpdate = true;
  }
  // a kick for the net when a ball swishes through (on top of what the ball itself pushes)
  A.netKick = function (strength, hx) {
    for (const q of NET.pts) {
      if (q.pin) continue;
      const depth = -q.rest.y / NET.len;
      q.o.y += strength * 0.012 * depth;
      q.o.x -= (q.p.x - hx) * strength * 0.03 * depth;
      q.o.z -= (q.p.z - P.RIM.z) * strength * 0.03 * depth;
    }
  };

  // ---------------------------------------------------------------- balls

  const balls = [];
  let ballTex = null, shadowTex = null, glowTex = null;

  A.addBall = function () {
    if (!ballTex) {
      ballTex = ballTexture();
      shadowTex = radialTexture(128, [[0, 'rgba(8,4,24,0.75)'], [0.55, 'rgba(8,4,24,0.35)'], [1, 'rgba(8,4,24,0)']]);
      glowTex = Kit.gfx.glowTexture();
    }
    const mat = std('#ffffff', { map: ballTex, roughness: 0.6, emissive: '#000000' });
    const m = new T.Mesh(new T.SphereGeometry(P.BALL_R, 28, 20), mat);
    scene.add(m);
    const sh = new T.Mesh(new T.PlaneGeometry(0.42, 0.42), basic({ map: shadowTex, transparent: true, depthWrite: false }));
    scene.add(sh);
    const glow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: '#ff7a1a', blending: T.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.scale.setScalar(0.75);
    glow.visible = false;
    m.add(glow);
    const b = { mesh: m, shadow: sh, glow, spin: new T.Vector3(), fire: 0 };
    balls.push(b);
    return b;
  };

  // backspin for a shot just released with this velocity
  A.spin = function (i, v) {
    balls[i].spin.set(v.z, 0, -v.x).multiplyScalar(-0.6 / P.BALL_R);
  };
  A.setFire = function (i, on) { balls[i].fire = on ? 1 : 0; };

  const _dq = new T.Quaternion(), _ax = new T.Vector3();
  function syncBalls(dt, world) {
    world.balls.forEach((pb, i) => {
      const b = balls[i];
      if (!b) return;
      b.mesh.position.set(pb.p.x, pb.p.y, pb.p.z);
      if (pb.mode === 'free' && pb.support) b.spin.set(pb.v.z, 0, -pb.v.x).multiplyScalar(1 / P.BALL_R); // rolling
      else if (pb.mode !== 'free') b.spin.multiplyScalar(Math.max(0, 1 - 6 * dt));
      const w = b.spin.length();
      if (w > 1e-3) {
        _dq.setFromAxisAngle(_ax.copy(b.spin).multiplyScalar(1 / w), w * dt);
        b.mesh.quaternion.premultiply(_dq);
      }
      // shadow on whatever is underneath: the ramp inside the machine, the floor outside
      const onRamp = pb.p.z < P.CAGE.front && pb.p.z > P.CAGE.back && Math.abs(pb.p.x) < P.CAGE.x;
      const gy = onRamp ? P.rampY(pb.p.z) : pb.p.z < P.LIP.max.z + 0.01 && pb.p.z > P.LIP.min.z ? P.LIP.max.y : 0;
      const hgt = Math.max(0, pb.p.y - P.BALL_R - gy);
      b.shadow.position.set(pb.p.x, gy + 0.012, pb.p.z);
      b.shadow.rotation.set(onRamp ? -Math.PI / 2 + slope : -Math.PI / 2, 0, 0);
      b.shadow.scale.setScalar(1 + hgt * 0.35);
      b.shadow.material.opacity = clamp(0.9 - hgt * 0.28, 0.12, 0.9);
      // flames
      const fire = b.fire && pb.mode !== 'held';
      b.glow.visible = !!fire;
      b.mesh.material.emissive.set(fire ? '#7a2400' : '#000000');
      if (fire) {
        b.glow.material.opacity = 0.35 + Math.random() * 0.2;
        b.glow.scale.setScalar(0.5 + Math.random() * 0.15);
        const n = pb.mode === 'free' && !pb.support ? 3 : 1;
        for (let k = 0; k < n; k++) {
          A.particles.emit(pb.p.x + (Math.random() - 0.5) * 0.14, pb.p.y + (Math.random() - 0.5) * 0.14, pb.p.z + (Math.random() - 0.5) * 0.14, {
            vx: -pb.v.x * 0.2 + (Math.random() - 0.5) * 0.4, vy: 0.8 + Math.random() * 0.6, vz: -pb.v.z * 0.2 + (Math.random() - 0.5) * 0.4,
            life: 0.3 + Math.random() * 0.25, size: 0.15 + Math.random() * 0.08, size2: 0.03,
            color: [0.85, 0.42, 0.06], color2: [0.45, 0.04, 0.0], gravity: -1.5,
          });
        }
      }
    });
  }

  // ---------------------------------------------------------------- particles (additive glowing dots)

  function makeParticles(n) {
    const geo = new T.BufferGeometry();
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('pcolor', new T.BufferAttribute(col, 3));
    geo.setAttribute('psize', new T.BufferAttribute(size, 1));
    const mat = new T.ShaderMaterial({
      uniforms: { map: { value: Kit.gfx.dotTexture() }, scale: { value: 500 } },
      vertexShader: `attribute vec3 pcolor; attribute float psize; varying vec3 vC; uniform float scale;
        void main() { vC = pcolor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = psize * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC;
        void main() { float a = texture2D(map, gl_PointCoord).a; gl_FragColor = vec4(vC, a); }`,
      blending: T.AdditiveBlending, depthWrite: false, transparent: true,
    });
    const pts = new T.Points(geo, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    const ps = [];
    for (let i = 0; i < n; i++) ps.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s1: 0.1, s2: 0.1, c1: [1, 1, 1], c2: [1, 1, 1], g: 0, drag: 0 });
    let next = 0;
    return {
      mat,
      emit(x, y, z, o) {
        const p = ps[next];
        next = (next + 1) % n;
        Object.assign(p, { x, y, z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, life: o.life || 0.6, max: o.life || 0.6,
          s1: o.size || 0.1, s2: o.size2 !== undefined ? o.size2 : o.size || 0.1, c1: o.color || [1, 1, 1], c2: o.color2 || o.color || [1, 1, 1],
          g: o.gravity !== undefined ? o.gravity : 6, drag: o.drag || 0.5 });
      },
      burst(x, y, z, count, o) {
        for (let i = 0; i < count; i++) {
          const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = (o.speed || 2) * (0.4 + Math.random() * 0.6);
          const r = Math.sqrt(1 - u * u);
          const c = o.colors ? o.colors[i % o.colors.length] : o.color;
          this.emit(x, y, z, Object.assign({}, o, { vx: Math.cos(a) * r * s, vy: u * s + (o.up || 0), vz: Math.sin(a) * r * s, color: c, color2: o.color2 || c.map((v) => v * 0.3), life: (o.life || 0.8) * (0.6 + Math.random() * 0.4) }));
        }
      },
      update(dt) {
        for (let i = 0; i < n; i++) {
          const p = ps[i];
          if (p.life > 0) {
            p.life -= dt;
            p.vy -= p.g * dt;
            const k = Math.max(0, 1 - p.drag * dt);
            p.vx *= k; p.vy *= k; p.vz *= k;
            p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          }
          const u = p.life > 0 ? 1 - p.life / p.max : 1;
          pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
          const fade = p.life > 0 ? Math.min(1, p.life / (p.max * 0.4)) : 0;
          for (let c = 0; c < 3; c++) col[i * 3 + c] = (p.c1[c] + (p.c2[c] - p.c1[c]) * u) * fade;
          size[i] = p.life > 0 ? p.s1 + (p.s2 - p.s1) * u : 0;
        }
        geo.attributes.position.needsUpdate = true;
        geo.attributes.pcolor.needsUpdate = true;
        geo.attributes.psize.needsUpdate = true;
      },
    };
  }

  // ---------------------------------------------------------------- the aim guide (faint dots along the arc)

  const guide = { pts: null, max: 48 };
  function buildGuide() {
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(new Float32Array(guide.max * 3), 3));
    guide.pts = new T.Points(geo, new T.PointsMaterial({ size: 0.13, map: Kit.gfx.dotTexture(), transparent: true, opacity: 0.8, depthWrite: false, color: '#ffffff' }));
    guide.pts.frustumCulled = false;
    guide.pts.visible = false;
    scene.add(guide.pts);
  }
  A.showGuide = function (points, color) {
    if (!points) { guide.pts.visible = false; return; }
    const arr = guide.pts.geometry.attributes.position.array, n = Math.min(points.length, guide.max);
    for (let i = 0; i < n; i++) { arr[i * 3] = points[i].x; arr[i * 3 + 1] = points[i].y; arr[i * 3 + 2] = points[i].z; }
    guide.pts.geometry.setDrawRange(0, n);
    guide.pts.geometry.attributes.position.needsUpdate = true;
    guide.pts.material.color.set(color || '#ffffff');
    guide.pts.visible = true;
  };

  // ---------------------------------------------------------------- treats the buddy brought, lined up on the front

  const shelf = [];
  A.addTreat = function (emoji) {
    const s = new T.Sprite(new T.SpriteMaterial({ map: Kit.gfx.emojiTexture(emoji), depthWrite: false }));
    s.scale.setScalar(0.34);
    scene.add(s);
    shelf.push(s);
    while (shelf.length > 10) scene.remove(shelf.shift());
    shelf.forEach((t, i) => {
      const side = i % 2 ? -1 : 1, k = Math.floor(i / 2);
      t.position.set(side * (0.75 + k * 0.3), P.LIP.max.y + 0.17, P.LIP.max.z - 0.08);
    });
    return s.position;
  };
  A.lastTreat = () => shelf[shelf.length - 1];
  A.clearTreats = function () { while (shelf.length) scene.remove(shelf.pop()); };
  A.shelfBounce = function (t) {
    shelf.forEach((s, i) => { s.scale.setScalar(0.34 + Math.max(0, Math.sin(t * 6 + i)) * 0.04); });
  };

  // ---------------------------------------------------------------- camera, setup, frame

  const cam = { shake: 0, x: 0, base: null };
  // the camera: behind and above the shooter, a little over his right shoulder, looking at the hoop
  A.camTune = { x: 1.0, y: 3.95, z: 4.6, ly: 2.2, lz: -3.6 };
  A.fit = function (w, h) {
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.aspect = aspect;
    // keep the whole machine in view (its width at the hoop), and from the shooter's knees up to the scoreboard
    const halfW = 2.35, dist = 9.4;
    const hfov = 2 * Math.atan(halfW / dist);
    let vfov = (2 * Math.atan(Math.tan(hfov / 2) / aspect) * 180) / Math.PI;
    // wide, short screens (a phone on its side): zoom in a little so the hoop isn't tiny
    const wide = clamp((aspect - 1.4) / 0.8, 0, 1);
    vfov = Math.max(vfov, 50 - wide * 10);
    camera.fov = vfov;
    // tall screens: step back and up a little so the shooter isn't cut off at the waist
    const tall = clamp((1.1 - aspect) / 0.6, 0, 1);
    const c = A.camTune;
    cam.base = { x: c.x, y: c.y + tall * 0.6, z: c.z + tall * 1.2, ly: c.ly - tall * 0.2 + wide * 0.35, lz: c.lz };
    camera.updateProjectionMatrix();
    A.particles.mat.uniforms.scale.value = h / (2 * Math.tan((vfov * Math.PI) / 360));
  };
  A.shake = (s) => { cam.shake = Math.max(cam.shake, s); };

  function placeCamera(dt, hx) {
    cam.x += (hx * 0.18 - cam.x) * Math.min(1, dt * 3);
    cam.shake = Math.max(0, cam.shake - dt * 2.5);
    const s = cam.shake * cam.shake * 0.12;
    const b = cam.base;
    camera.position.set(b.x + cam.x + (Math.random() - 0.5) * s, b.y + (Math.random() - 0.5) * s, b.z);
    camera.lookAt(cam.x * 1.4, b.ly, b.lz);
    camera.updateMatrixWorld();
  }

  // world point -> CSS pixels
  const _p = new T.Vector3();
  A.project = function (x, y, z) {
    _p.set(x, y, z).project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: (_p.x * 0.5 + 0.5) * r.width, y: (-_p.y * 0.5 + 0.5) * r.height, behind: _p.z > 1 };
  };

  A.init = function (canvas) {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding;
    scene = new T.Scene();
    scene.background = new T.Color('#1b1033');
    scene.fog = new T.Fog('#1b1033', 16, 34);
    camera = new T.PerspectiveCamera(50, 1, 0.1, 80);
    scene.add(new T.HemisphereLight('#fff6ea', '#5a4a8a', 0.75));
    const key = new T.DirectionalLight('#fff2dc', 0.75);
    key.position.set(2.5, 9, 6);
    scene.add(key);
    const spot = new T.PointLight('#bfe4ff', 0.7, 9, 1.6);
    spot.position.set(0, 4.6, -2.6);
    scene.add(spot);
    A.particles = makeParticles(700);
    buildRoom();
    buildMachine();
    buildHoop();
    buildGuide();
    A.renderer = renderer;
    A.scene = scene;
    A.camera = camera;
    A.hoop = hoop;
    return A;
  };

  // one frame of visuals: follow the physics world, simulate the net, lights and particles, then draw
  A.frame = function (dt, world) {
    hoop.group.position.x = world.hx;
    syncBalls(dt, world);
    const bp = world.balls.map((b) => b.p);
    updateNet(dt, world.hx, bp);
    updateBulbs(dt);
    A.particles.update(dt);
    placeCamera(dt, world.hx);
  };
  A.render = function () { renderer.render(scene, camera); };
})();
