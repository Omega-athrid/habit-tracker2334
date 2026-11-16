// Sonidos sintetizados con Web Audio: nada de archivos, pesan 0 KB.
let ctx = null;
let enabled = true;
try { enabled = localStorage.getItem("sound") !== "off"; } catch {}

export const isSoundOn = () => enabled;
export function setSound(on) {
  enabled = on;
  try { localStorage.setItem("sound", on ? "on" : "off"); } catch {}
}

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

// Una nota con envolvente suave
function tone(freq, start, dur, { type = "sine", vol = 0.2, attack = 0.005, glideTo = null } = {}) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

const N = { C5: 523.25, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, C7: 2093 };

export const sfx = {
  // Click mínimo para toques de interfaz
  tap() { if (!enabled) return; tone(1400, 0, 0.04, { vol: 0.05, glideTo: 900 }); },
  // "Clic" cuando el deslizamiento llega al punto de confirmación
  arm() { if (!enabled) return; tone(660, 0, 0.06, { type: "triangle", vol: 0.08, glideTo: 990 }); },
  // Logro: arpegio brillante + destello
  complete() {
    if (!enabled) return;
    [N.G5, N.C6, N.E6, N.G6].forEach((f, i) => {
      tone(f, i * 0.07, 0.35, { type: "triangle", vol: 0.16 });
      tone(f * 2, i * 0.07, 0.2, { vol: 0.03 });
    });
    tone(N.C7, 0.3, 0.6, { vol: 0.05 });
  },
  // Deshacer: dos notas bajando, suavecito
  undo() {
    if (!enabled) return;
    tone(N.E5, 0, 0.14, { type: "triangle", vol: 0.1 });
    tone(N.C5, 0.09, 0.2, { type: "triangle", vol: 0.1 });
  },
  // Día completo: fanfarria corta
  allDone() {
    if (!enabled) return;
    const seq = [[N.C6, 0], [N.E6, 0.1], [N.G6, 0.2], [N.C7, 0.32]];
    seq.forEach(([f, t]) => {
      tone(f, t + 0.25, 0.5, { type: "triangle", vol: 0.13 });
      tone(f / 2, t + 0.25, 0.5, { type: "sine", vol: 0.06 });
    });
    [N.E6, N.G6, N.C7].forEach((f) => tone(f, 0.62, 0.9, { vol: 0.05 }));
  },
  // Abrir algo (hoja, día del calendario)
  open() { if (!enabled) return; tone(520, 0, 0.12, { vol: 0.06, glideTo: 780 }); },
  close() { if (!enabled) return; tone(700, 0, 0.1, { vol: 0.05, glideTo: 470 }); },
  // Mantener apretado
  press() { if (!enabled) return; tone(300, 0, 0.09, { type: "triangle", vol: 0.1, glideTo: 420 }); },
  save() { if (!enabled) return; tone(N.C6, 0, 0.12, { type: "triangle", vol: 0.1 }); tone(N.G6, 0.08, 0.22, { type: "triangle", vol: 0.1 }); },
  remove() { if (!enabled) return; tone(400, 0, 0.25, { type: "triangle", vol: 0.1, glideTo: 160 }); },
};
