// Voz del coach: hablar (texto → voz) y escuchar (voz → texto) con lo que trae el navegador.
// Gratis y sin API keys. En Android anda con Chrome.

const synth = window.speechSynthesis;
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const canSpeak = !!synth;
export const canListen = !!Recognition;

// Preferencia "leer todas las respuestas en voz alta"
export const isAutoVoice = () => { try { return localStorage.getItem("coach-voice") === "on"; } catch { return false; } };
export const setAutoVoice = (on) => { try { localStorage.setItem("coach-voice", on ? "on" : "off"); } catch {} };

// Elegimos la mejor voz en español disponible (prioridad: Argentina → Latinoamérica → cualquiera)
let voice = null;
function pickVoice() {
  const vs = synth?.getVoices() || [];
  const es = vs.filter((v) => v.lang?.toLowerCase().startsWith("es"));
  const rank = (v) => {
    const l = v.lang.toLowerCase().replace("_", "-");
    let s = { "es-ar": 50, "es-419": 40, "es-us": 35, "es-mx": 30, "es-uy": 45, "es-cl": 25, "es-co": 25 }[l] ?? 10;
    if (/google|natural|neural|online/i.test(v.name)) s += 8; // voces más naturales
    if (v.localService === false) s += 2;
    return s;
  };
  voice = es.sort((a, b) => rank(b) - rank(a))[0] || null;
}
if (synth) { pickVoice(); synth.addEventListener?.("voiceschanged", pickVoice); }

// Limpia el texto para que no lea asteriscos, emojis ni símbolos raros
function clean(text) {
  return String(text)
    .replace(/\*\*|__|[*_`#>]/g, "")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

let speakingCb = null;
export function stopSpeaking() { if (synth) synth.cancel(); speakingCb?.(false); speakingCb = null; }
export const isSpeaking = () => !!synth?.speaking;

// Habla el texto. Lo partimos en oraciones: Chrome corta los textos largos a los ~15 segundos.
export function speak(text, onState) {
  if (!synth) return;
  stopSpeaking();
  const parts = clean(text).match(/[^.!?¿¡]+[.!?]*|[¿¡][^?!]+[?!]/g)?.map((s) => s.trim()).filter(Boolean) || [];
  if (!parts.length) return;
  speakingCb = onState || null;
  speakingCb?.(true);
  parts.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p);
    if (voice) u.voice = voice;
    u.lang = voice?.lang || "es-AR";
    u.rate = 1.03; u.pitch = 1;
    if (i === parts.length - 1) { u.onend = () => { speakingCb?.(false); speakingCb = null; }; u.onerror = u.onend; }
    synth.speak(u);
  });
}

// Escucha una frase y devuelve el texto. onPartial recibe lo que va entendiendo.
let rec = null;
export function listen({ onPartial, onEnd, onError }) {
  if (!Recognition) { onError?.("Tu navegador no soporta dictado por voz. Probá con Chrome."); return; }
  stopSpeaking();
  rec?.abort();
  rec = new Recognition();
  rec.lang = "es-AR";
  rec.interimResults = true;
  rec.continuous = false;
  let finalText = "";
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t; else interim += t;
    }
    onPartial?.((finalText + interim).trim());
  };
  rec.onerror = (e) => {
    const msg = e.error === "not-allowed" ? "Dale permiso al micrófono para hablarle al coach."
      : e.error === "no-speech" ? "No te escuché. Probá de nuevo."
      : e.error === "network" ? "El dictado necesita internet." : null;
    if (msg) onError?.(msg);
  };
  rec.onend = () => { rec = null; onEnd?.(finalText.trim()); };
  rec.start();
}
export function stopListening() { rec?.stop(); }
