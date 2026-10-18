/* Hoops Teddy: the game's own sounds, built on Kit.sound.tone / hiss (Web Audio, no files). Exposes HT.sfx(name, arg).
   Kit sounds are played through the same call: HT.sfx('swish'), HT.sfx('coin', streak) ... */
(function () {
  'use strict';
  const S = Kit.sound;
  const { tone, hiss } = S;
  const OWN = {
    // the ball clanking on the rim: a short metallic ring, louder for harder hits
    rim(speed) {
      const v = Math.min(1, (speed || 1) / 4);
      tone({ type: 'square', f: 1180, to: 980, dur: 0.09, vol: 0.05 * v + 0.02, lp: 5000 });
      tone({ type: 'triangle', f: 1870, dur: 0.3, vol: 0.08 * v + 0.03 });
      tone({ type: 'sine', f: 2650, dur: 0.22, vol: 0.04 * v });
    },
    // the backboard: a hollow thud with a bit of rattle
    board(speed) {
      const v = Math.min(1, (speed || 1) / 5);
      tone({ f: 190, to: 120, dur: 0.14, vol: 0.25 * v + 0.08 });
      hiss({ filter: 'bandpass', f: 900, q: 3, dur: 0.12, vol: 0.12 * v });
    },
    // a bounce on the padded ramp or the floor
    bounce(speed) {
      const v = Math.min(1, (speed || 1) / 5);
      tone({ f: 120, to: 70, dur: 0.1, vol: 0.22 * v + 0.04 });
      hiss({ filter: 'lowpass', f: 700, dur: 0.05, vol: 0.06 * v });
    },
    // the side netting of the cage
    cage() { hiss({ filter: 'bandpass', f: 1600, q: 1.5, dur: 0.12, vol: 0.06 }); },
    // the ball rolling back down the ramp into the tray
    roll() { hiss({ filter: 'lowpass', f: 300, to: 180, dur: 0.35, vol: 0.06 }); },
    // the swish plus a soft "whump" of the net
    net() {
      S.swish();
      tone({ f: 330, to: 220, dur: 0.12, vol: 0.05 });
    },
    // the shot leaving the hands
    shoot() { hiss({ f: 700, to: 1800, dur: 0.16, vol: 0.07, q: 0.8 }); },
    // catching a ball (shooter or buddy)
    catch() { tone({ f: 260, to: 180, dur: 0.07, vol: 0.12 }); hiss({ filter: 'lowpass', f: 1200, dur: 0.05, vol: 0.06 }); },
    // the buddy's little cheer when he passes the ball back
    cheer(high) {
      const k = high ? 1.25 : 1;
      [523, 659, 784].forEach((f, i) => tone({ type: 'triangle', f: f * k, at: i * 0.05, dur: 0.12, vol: 0.08 }));
      hiss({ filter: 'bandpass', f: 2400, q: 0.8, dur: 0.3, vol: 0.05, attack: 0.05 });
    },
    // the crowd: a burst of filtered noise that swells and fades
    crowd(big) {
      hiss({ filter: 'bandpass', f: 1100, to: 1500, q: 0.6, dur: big ? 1.4 : 0.8, vol: big ? 0.16 : 0.09, attack: 0.15 });
      hiss({ filter: 'bandpass', f: 2600, q: 1.2, dur: big ? 1.1 : 0.6, vol: 0.05, attack: 0.1 });
    },
    // ON FIRE: a whoosh up and a rising arpeggio
    fire() {
      hiss({ filter: 'lowpass', f: 400, to: 4000, dur: 0.6, vol: 0.22, attack: 0.08 });
      [392, 523, 659, 784, 1047].forEach((f, i) => tone({ type: 'sawtooth', f, at: 0.05 + i * 0.06, dur: 0.16, vol: 0.05, lp: 2600 }));
    },
    // a flaming ball's crackle as it flies
    flame() { hiss({ filter: 'bandpass', f: 500, to: 300, q: 0.7, dur: 0.5, vol: 0.08, attack: 0.05 }); },
    // the countdown beeps and the final buzzer
    beep(hi) { tone({ type: 'square', f: hi ? 1046 : 660, dur: hi ? 0.35 : 0.14, vol: 0.07, lp: 3000 }); },
    buzzer() {
      [196, 199].forEach((f) => tone({ type: 'sawtooth', f, dur: 1.0, vol: 0.08, attack: 0.01, lp: 1500 }));
      tone({ type: 'square', f: 98, dur: 1.0, vol: 0.05, lp: 800 });
    },
    // a short tick for the last seconds
    tick() { tone({ type: 'square', f: 1500, dur: 0.03, vol: 0.04 }); },
    // round cleared: a happy fanfare
    fanfare() {
      [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.4]].forEach(([f, at]) => tone({ type: 'triangle', f, at, dur: at > 0.3 ? 0.5 : 0.14, vol: 0.14 }));
      [[262, 0.4], [330, 0.4], [392, 0.4]].forEach(([f, at]) => tone({ type: 'sawtooth', f, at, dur: 0.5, vol: 0.04, lp: 1800 }));
    },
    // time's up without reaching the goal: a gentle "aww", never a raspberry
    aww() { tone({ type: 'triangle', f: 523, to: 392, dur: 0.5, vol: 0.1 }); tone({ type: 'triangle', f: 392, to: 330, at: 0.45, dur: 0.6, vol: 0.09 }); },
    // the treat landing on the shelf
    treat() { [988, 1319, 1568].forEach((f, i) => tone({ type: 'sine', f, at: i * 0.07, dur: 0.18, vol: 0.09 })); },
    // a "boing" for a ball that hops out of the machine and is put back
    poof() { tone({ f: 300, to: 900, dur: 0.18, vol: 0.06 }); hiss({ f: 2000, dur: 0.15, vol: 0.05 }); },
  };
  window.HT = window.HT || {};
  HT.sfx = function (name, arg) {
    if (OWN[name]) return OWN[name](arg);
    if (typeof S[name] === 'function') return S[name](arg);
  };
})();
