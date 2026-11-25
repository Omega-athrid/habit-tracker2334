import { store } from "./store.js";
import { sfx, isSoundOn, setSound } from "./sound.js";
import { ui, habitIcon, HABIT_ICONS } from "./icons.js";
import { esc, h, toast } from "./kit.js";
import { renderGoals, refreshGoals } from "./goals.js";
import { renderCoach } from "./coach.js";
import { stopSpeaking, stopListening } from "./voice.js";
import {
  toKey, fromKey, todayKey, addDays, weekday, longDate, greeting, cap,
  MONTHS, WEEK_ORDER, WEEK_SHORT,
} from "./dates.js";

// ═══ Estado ═══════════════════════════════════════════════════════════
const S = {
  user: null,
  habits: [],
  done: new Set(),          // "habitId|YYYY-MM-DD"
  goals: [],
  tasks: [],
  view: "today",
  cal: { y: new Date().getFullYear(), m: new Date().getMonth() },
  calSel: null,
};
const $app = document.getElementById("app");
const k = (hid, day) => `${hid}|${day}`;

// ═══ Lógica de hábitos ════════════════════════════════════════════════
const isScheduled = (hb, day) => day >= hb.start_date && (!hb.days || hb.days.includes(weekday(day)));
const isDone = (hb, day) => S.done.has(k(hb.id, day));
const habitsFor = (day) => S.habits.filter((hb) => isScheduled(hb, day));
function progress(day) {
  const list = habitsFor(day);
  return { total: list.length, done: list.filter((hb) => isDone(hb, day)).length };
}
// Racha: días programados consecutivos cumplidos. Si hoy todavía no lo hiciste, no corta la racha.
function streak(hb) {
  const today = todayKey();
  let d = today, n = 0;
  for (let i = 0; i < 3650 && d >= hb.start_date; i++, d = addDays(d, -1)) {
    if (!isScheduled(hb, d)) continue;
    if (isDone(hb, d)) n++;
    else if (d !== today) break;
  }
  return n;
}
function daysLabel(hb) {
  if (!hb.days) return "Todos los días";
  const s = [...hb.days].sort().join(",");
  if (s === "1,2,3,4,5") return "Lunes a viernes";
  if (s === "0,6") return "Fines de semana";
  return WEEK_ORDER.filter((d) => hb.days.includes(d)).map((d) => WEEK_SHORT[d]).join(" · ");
}
function luminance(hex) {
  const m = hex.replace("#", "").match(/.{2}/g); if (!m) return 0.5;
  const [r, g, b] = m.map((x) => { const c = parseInt(x, 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const bestInk = (hex) => (luminance(hex) > 0.42 ? "black" : "white");

// ═══ Tema ═════════════════════════════════════════════════════════════
const getTheme = () => { try { return localStorage.getItem("theme") || "auto"; } catch { return "auto"; } };
function applyTheme(t) {
  try { localStorage.setItem("theme", t); } catch {}
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
  const dark = t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]').setAttribute("content", dark ? "#262624" : "#F5F4EE");
}
applyTheme(getTheme());
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyTheme(getTheme()));


// ═══ Arranque ═════════════════════════════════════════════════════════
async function boot() {
  store.onAuthChange((user) => {
    if (user && !S.user) { S.user = user; loadAndShow(); }
    else if (!user && S.user) { S.user = null; S.habits = []; S.done = new Set(); S.goals = []; S.tasks = []; S.chat = null; S.analyses = null; renderAuth(); }
  });
  S.user = await store.getUser().catch(() => null);
  if (S.user) await loadAndShow(); else renderAuth();
  const splash = document.querySelector(".splash");
  splash.classList.add("out"); setTimeout(() => splash.remove(), 450);
}

async function loadData() {
  const [habits, comps, goals, tasks] = await Promise.all([
    store.listHabits(), store.listCompletions(),
    // Si todavía no corriste el SQL v2, metas y pendientes quedan vacíos sin romper nada
    store.listGoals().catch(() => []), store.listTasks().catch(() => []),
  ]);
  S.habits = habits;
  S.done = new Set(comps.map((c) => k(c.habit_id, c.day)));
  S.goals = goals; S.tasks = tasks;
}
async function loadAndShow() {
  try { await loadData(); } catch (e) { toast(e.message); }
  renderShell();
}

// Lo que las vistas de Metas y Coach necesitan de acá
const ctx = {
  S, store,
  // Recarga todo (p. ej. después de que el coach creó una tarea) y repinta lo que haga falta
  async reload() { try { await loadData(); } catch (e) { toast(e.message); } if (S.view !== "coach") go(S.view); },
  refresh: () => refresh(),
  // Cumplimiento de un hábito en los últimos N días
  habitRate(hb, n = 7) {
    const today = todayKey(); let done = 0, total = 0;
    for (let i = 0; i < n; i++) { const d = addDays(today, -i); if (!isScheduled(hb, d)) continue; total++; if (isDone(hb, d)) done++; }
    return { done, total };
  },
  async addHabit({ name, emoji, frequency, goal_id }) {
    const FREQ = { "diario": null, "lunes a viernes": [1, 2, 3, 4, 5], "3 veces por semana": [1, 3, 5], "fines de semana": [0, 6] };
    const color = COLORS[S.habits.length % 10];
    const created = await store.createHabit({
      name: String(name).slice(0, 60), icon_type: "emoji", icon: emoji || "✨", icon_color: bestInk(color), color,
      days: FREQ[frequency] ?? null, start_date: todayKey(), goal_id: goal_id || null,
    });
    S.habits.push(created);
    return created;
  },
};

// ═══ Login ════════════════════════════════════════════════════════════
const MARK = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="19" rx="6" fill="currentColor"/><path d="M7.5 12.3l3 3 6-6.3" fill="none" stroke="var(--bg, #F5F4EE)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function renderAuth() {
  document.querySelectorAll(".tabbar,.fab,.composer").forEach((e) => e.remove());
  const local = store.mode === "local";
  $app.innerHTML = "";
  const el = h(`
    <section class="auth">
      <div class="auth-mark">${MARK}</div>
      <h1>Pequeños hábitos,<br>grandes cambios.</h1>
      <p class="lead">Registrá tu día a día y mirá cómo se acumulan las rachas.</p>
      ${local ? `
        <button class="btn btn-primary" data-local>Empezar</button>
        <div class="auth-local">Estás en <b>modo local</b>: los datos quedan solo en este dispositivo. Configurá Supabase en <code>js/config.js</code> para tener cuenta y sincronización.</div>
      ` : `
      <div class="auth-tabs" data-tab="in"><span class="pill"></span>
        <button class="on" data-t="in">Ingresar</button><button data-t="up">Crear cuenta</button>
      </div>
      <form novalidate>
        <label class="field">${ui("mail", 20)}<input type="email" name="email" placeholder="tu@email.com" autocomplete="email" required></label>
        <label class="field">${ui("lock", 20)}<input type="password" name="password" placeholder="Contraseña" autocomplete="current-password" minlength="6" required></label>
        <div class="auth-error"></div>
        <button class="btn btn-primary" type="submit">Ingresar</button>
      </form>
      <p class="auth-note">Tus datos se guardan en la nube y los ves desde cualquier dispositivo.</p>`}
    </section>`);
  $app.append(el);

  if (local) {
    el.querySelector("[data-local]").onclick = async () => { sfx.save(); S.user = await store.signIn(); loadAndShow(); };
    return;
  }
  let tab = "in";
  const tabs = el.querySelector(".auth-tabs"), form = el.querySelector("form");
  const btn = form.querySelector("button"), errEl = el.querySelector(".auth-error");
  tabs.querySelectorAll("button").forEach((b) => b.onclick = () => {
    tab = b.dataset.t; tabs.dataset.tab = tab; sfx.tap();
    tabs.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    btn.textContent = tab === "in" ? "Ingresar" : "Crear cuenta";
    form.password.autocomplete = tab === "in" ? "current-password" : "new-password";
    errEl.textContent = "";
  });
  form.onsubmit = async (e) => {
    e.preventDefault(); errEl.textContent = "";
    const email = form.email.value.trim(), password = form.password.value;
    if (!email || !password) { errEl.textContent = "Completá email y contraseña."; return; }
    btn.disabled = true; const label = btn.textContent; btn.textContent = "Un momento…";
    try {
      if (tab === "in") { S.user = await store.signIn(email, password); await loadAndShow(); }
      else {
        const r = await store.signUp(email, password);
        if (r.needsConfirm) { errEl.style.color = "var(--success)"; errEl.textContent = "¡Listo! Te mandamos un mail para confirmar la cuenta."; }
        else { S.user = r.user; await loadAndShow(); }
      }
    } catch (err) { errEl.style.color = ""; errEl.textContent = err.message; }
    btn.disabled = false; btn.textContent = label;
  };
}

// ═══ Estructura (pestañas) ════════════════════════════════════════════
function renderShell() {
  $app.innerHTML = `<main id="view"></main>`;
  document.querySelectorAll(".tabbar,.fab,.composer").forEach((e) => e.remove());
  const bar = h(`
    <nav class="tabbar">
      <button class="tab" data-v="today">${ui("list-checks", 23)}Hoy</button>
      <button class="tab" data-v="goals">${ui("target", 23)}Metas</button>
      <button class="tab" data-v="coach">${ui("sparkles", 23)}Coach</button>
      <button class="tab" data-v="calendar">${ui("calendar-days", 23)}Calendario</button>
      <button class="tab" data-v="settings">${ui("settings", 23)}Ajustes</button>
    </nav>`);
  bar.querySelectorAll(".tab").forEach((b) => b.onclick = () => { if (S.view !== b.dataset.v) { sfx.tap(); go(b.dataset.v); } });
  document.body.append(bar);
  go(S.view);
}

function go(view) {
  S.view = view;
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("on", b.dataset.v === view));
  document.querySelectorAll(".fab,.composer").forEach((e) => e.remove());
  stopSpeaking(); stopListening();
  const main = document.getElementById("view");
  main.innerHTML = ""; main.className = "view";
  void main.offsetWidth; // reinicia la animación de entrada
  main.style.animation = "none"; requestAnimationFrame(() => (main.style.animation = ""));
  if (view === "today") renderToday(main);
  else if (view === "calendar") renderCalendar(main);
  else if (view === "goals") renderGoals(main, ctx);
  else if (view === "coach") renderCoach(main, ctx);
  else renderSettings(main);
  window.scrollTo({ top: 0 });
}

// Refresca la vista actual sin rearmarla (para que las animaciones fluyan)
function refresh() {
  if (S.view === "today") refreshToday();
  else if (S.view === "calendar") refreshCalendar();
  else if (S.view === "goals") refreshGoals(ctx);
}

// ═══ Anillo de progreso ═══════════════════════════════════════════════
function ringSVG(r, stroke) {
  const c = 2 * Math.PI * r;
  return `<svg viewBox="0 0 ${2 * r + stroke * 2} ${2 * r + stroke * 2}"><circle class="track" cx="${r + stroke}" cy="${r + stroke}" r="${r}"/><circle class="bar" cx="${r + stroke}" cy="${r + stroke}" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c}"/></svg>`;
}
function setRing(svgEl, frac) {
  const bar = svgEl.querySelector(".bar");
  const c = parseFloat(bar.getAttribute("stroke-dasharray"));
  bar.style.strokeDashoffset = String(c * (1 - Math.max(0, Math.min(1, frac))));
}

// ═══ Fila de hábito ═══════════════════════════════════════════════════
function iconHTML(hb) {
  return hb.icon_type === "icon" ? habitIcon(hb.icon, 24, 2) : esc(hb.icon);
}
function rowHTML(hb) {
  return `
    <div class="habit" data-key="${hb.id}">
      <div class="habit-track"><span class="track-label"></span></div>
      <div class="habit-card">
        <div class="habit-icon"></div>
        <div class="habit-text"><div class="habit-name"></div><div class="habit-meta"></div></div>
        <div class="habit-check">${ui("check", 16, 3)}</div>
      </div>
    </div>`;
}
function updateRow(el, item) {
  const { hb, day, locked } = item;
  el._item = item;
  const done = isDone(hb, day);
  el.classList.toggle("done", done);
  el.classList.toggle("locked", !!locked);
  const icon = el.querySelector(".habit-icon");
  icon.style.setProperty("--c", hb.color);
  icon.className = `habit-icon ink-${hb.icon_color}`;
  const sig = hb.icon_type + hb.icon;
  if (icon.dataset.sig !== sig) { icon.innerHTML = iconHTML(hb); icon.dataset.sig = sig; }
  el.querySelector(".habit-name").textContent = hb.name;
  const s = streak(hb);
  const meta = el.querySelector(".habit-meta");
  const metaHTML = item.showDays
    ? `<span>${esc(daysLabel(hb))}</span>`
    : `<span class="streak ${s ? "" : "zero"}">${habitIcon("flame", 13, 2.4)} ${s} ${s === 1 ? "día" : "días"}</span>${hb.days ? `<span>· ${esc(daysLabel(hb))}</span>` : ""}`;
  if (meta.innerHTML !== metaHTML) {
    const old = meta.querySelector(".streak")?.textContent;
    meta.innerHTML = metaHTML;
    const st = meta.querySelector(".streak");
    if (st && old !== undefined && old !== st.textContent) st.classList.add("bump");
  }
  el.querySelector(".track-label").innerHTML = done ? `${ui("undo-2", 18, 2.4)} Deshacer` : `${ui("check", 20, 3)} Cumplido`;
}
function createRow(item) {
  const el = h(rowHTML(item.hb));
  updateRow(el, item);
  attachGestures(el);
  return el;
}

// Reconciliación con animación FLIP: los elementos se deslizan a su nueva posición
function reconcile(container, items) {
  const prev = new Map();
  [...container.children].forEach((el) => { if (el.dataset.key) prev.set(el.dataset.key, { el, top: el.getBoundingClientRect().top }); });
  const keep = new Set();
  items.forEach((it, i) => {
    let el = prev.get(it.hb.id)?.el;
    const isNew = !el;
    if (el) updateRow(el, it); else el = createRow(it);
    keep.add(it.hb.id);
    if (container.children[i] !== el) container.insertBefore(el, container.children[i] || null);
    // Animar recién después de insertar (si no, queda atado al documento del <template> y nunca corre)
    if (isNew) el.animate([{ opacity: 0, transform: "translateY(10px) scale(.98)" }, { opacity: 1, transform: "none" }], { duration: 380, delay: Math.min(i, 8) * 40, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" });
  });
  prev.forEach(({ el }, key) => { if (!keep.has(key)) el.remove(); });
  items.forEach((it) => {
    const p = prev.get(it.hb.id); if (!p) return;
    const dy = p.top - p.el.getBoundingClientRect().top;
    if (Math.abs(dy) > 1) p.el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 520, easing: "cubic-bezier(.2,.8,.2,1)" });
  });
}

// Pendientes arriba, cumplidos abajo (manteniendo el orden de creación)
const sortForDay = (list, day) => [...list].sort((a, b) => isDone(a, day) - isDone(b, day));

// ═══ Gestos: deslizar → cumplir, mantener apretado → editar ══════════
function attachGestures(el) {
  const card = el.querySelector(".habit-card");
  let sx = 0, sy = 0, dx = 0, axis = null, active = false, lp = null, longFired = false, armed = false, pid = null;

  const reset = () => {
    clearTimeout(lp); active = false; axis = null;
    el.classList.remove("pressing", "dragging", "armed");
  };
  card.addEventListener("contextmenu", (e) => e.preventDefault());
  card.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || document.querySelector(".sheet")) return;
    sx = e.clientX; sy = e.clientY; dx = 0; axis = null; active = true; longFired = false; armed = false; pid = e.pointerId;
    el.classList.add("pressing");
    lp = setTimeout(() => {
      if (!active || axis) return;
      longFired = true; el.classList.remove("pressing"); el.classList.add("pressed");
      sfx.press(); navigator.vibrate?.(12);
      setTimeout(() => el.classList.remove("pressed"), 300);
      reset();
      openEditor(el._item.hb);
    }, 480);
  });
  card.addEventListener("pointermove", (e) => {
    if (!active) return;
    const mx = e.clientX - sx, my = e.clientY - sy;
    if (!axis && Math.hypot(mx, my) > 8) {
      axis = Math.abs(mx) > Math.abs(my) ? "x" : "y";
      clearTimeout(lp); el.classList.remove("pressing");
      if (axis === "y" || el._item.locked) { active = false; if (el._item.locked && axis === "x") nudge(el, true); return; }
      el.classList.add("dragging");
      try { card.setPointerCapture(pid); } catch {}
    }
    if (axis !== "x") return;
    const width = card.offsetWidth, th = Math.min(130, width * 0.34);
    dx = mx > 0 ? (mx < th ? mx : th + (mx - th) * 0.45) : mx * 0.15; // resistencia elástica
    card.style.transform = `translateX(${dx}px)`;
    el.style.setProperty("--p", Math.max(0, Math.min(1, dx / th)).toFixed(3));
    const nowArmed = dx >= th;
    if (nowArmed !== armed) { armed = nowArmed; el.classList.toggle("armed", armed); if (armed) { sfx.arm(); navigator.vibrate?.(8); } }
  });
  const end = () => {
    if (!active && !axis) { reset(); return; }
    const wasX = axis === "x", wasArmed = armed, tapped = !axis && !longFired;
    reset();
    card.style.transform = "";
    if (wasX) {
      el.style.setProperty("--p", wasArmed ? "1" : "0");
      if (wasArmed) toggleHabit(el);
      setTimeout(() => el.style.setProperty("--p", "0"), wasArmed ? 380 : 0);
    } else if (tapped) {
      nudge(el, el._item.locked);
    }
  };
  card.addEventListener("pointerup", end);
  card.addEventListener("pointercancel", () => { reset(); card.style.transform = ""; el.style.setProperty("--p", "0"); });
}

// Un toque simple: un empujoncito para enseñar el gesto
function nudge(el, locked) {
  const card = el.querySelector(".habit-card");
  const frames = locked
    ? [{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(5px)" }, { transform: "translateX(-3px)" }, { transform: "translateX(0)" }]
    : [{ transform: "translateX(0)" }, { transform: "translateX(18px)" }, { transform: "translateX(0)" }];
  card.animate(frames, { duration: locked ? 320 : 420, easing: "cubic-bezier(.2,.8,.2,1)" });
  if (locked && el._item.day > todayKey()) toast("Ese día todavía no llegó ⏳");
}

// ═══ Cumplir / deshacer ═══════════════════════════════════════════════
let reorderTimer;
async function toggleHabit(el) {
  const { hb, day } = el._item;
  if (day > todayKey()) return;
  const key = k(hb.id, day);
  const nowDone = !S.done.has(key);
  const before = progress(day);
  nowDone ? S.done.add(key) : S.done.delete(key);

  // Feedback inmediato
  updateRow(el, el._item);
  if (nowDone) {
    el.classList.add("just-done"); setTimeout(() => el.classList.remove("just-done"), 600);
    sfx.complete(); burst(el.querySelector(".habit-icon"), hb.color); navigator.vibrate?.(15);
  } else sfx.undo();

  const after = progress(day);
  if (nowDone && after.total && after.done === after.total && before.done < before.total && day === todayKey()) {
    setTimeout(() => { sfx.allDone(); confetti(); toast("¡Día completo! Bien ahí 🎉"); }, 450);
  }
  updateHeaders();

  // Reordenar con un pequeño delay, esperando que no haya otro gesto en curso
  clearTimeout(reorderTimer);
  const doReorder = () => { if (document.querySelector(".habit.dragging")) reorderTimer = setTimeout(doReorder, 300); else refresh(); };
  reorderTimer = setTimeout(doReorder, 520);

  try { await store.setCompletion(hb.id, day, nowDone); }
  catch (e) {
    nowDone ? S.done.delete(key) : S.done.add(key);
    toast("No se pudo guardar: " + e.message); refresh();
  }
}

function updateHeaders() {
  if (S.view === "today") {
    const p = progress(todayKey());
    const ring = document.querySelector(".head .ring");
    if (ring) {
      setRing(ring, p.total ? p.done / p.total : 0);
      ring.querySelector(".label").textContent = `${p.done}/${p.total}`;
      const full = p.total > 0 && p.done === p.total;
      if (full && !ring.classList.contains("full")) { ring.classList.remove("bump"); void ring.offsetWidth; ring.classList.add("bump"); }
      ring.classList.toggle("full", full);
    }
  } else if (S.view === "calendar") {
    updateCalendarCells(); updatePanelHead(); updateStats();
  }
}

// ═══ Partículas y confeti ═════════════════════════════════════════════
function burst(target, color) {
  const r = target.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const colors = [color, "#D97757", "#E8B04B", color];
  for (let i = 0; i < 14; i++) {
    const a = (Math.PI * 2 * i) / 14 + Math.random() * 0.4, dist = 30 + Math.random() * 34;
    const p = document.createElement("i");
    p.className = "spark";
    p.style.cssText = `left:${cx - 3}px;top:${cy - 3}px;background:${colors[i % colors.length]};--dx:${Math.cos(a) * dist}px;--dy:${Math.sin(a) * dist}px;--r:${Math.random() * 360}deg;border-radius:${i % 2 ? "50%" : "2px"}`;
    document.body.append(p); setTimeout(() => p.remove(), 750);
  }
}
function confetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = document.createElement("canvas"); c.id = "confetti"; document.body.append(c);
  const dpr = window.devicePixelRatio || 1, W = innerWidth, H = innerHeight;
  c.width = W * dpr; c.height = H * dpr; const ctx = c.getContext("2d"); ctx.scale(dpr, dpr);
  const cols = ["#D97757", "#E8B04B", "#8DA48A", "#7FA7C9", "#C98BB0", "#F3F1EA"];
  const ps = Array.from({ length: 140 }, () => ({
    x: W / 2 + (Math.random() - 0.5) * 60, y: H * 0.35, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4,
    w: 6 + Math.random() * 6, h: 4 + Math.random() * 4, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, c: cols[(Math.random() * cols.length) | 0],
  }));
  const t0 = performance.now();
  (function frame(t) {
    const el = t - t0; ctx.clearRect(0, 0, W, H);
    ps.forEach((p) => {
      p.vy += 0.38; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - el / 2400); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    });
    if (el < 2400) requestAnimationFrame(frame); else c.remove();
  })(t0);
}

// ═══ Vista: HOY (página principal) ════════════════════════════════════
function renderToday(main) {
  const today = todayKey();
  const p = progress(today);
  main.append(h(`
    <header class="head">
      <div><div class="eyebrow">${greeting()}</div><h1 class="title">${longDate(today)}</h1></div>
      <div class="ring ${p.total && p.done === p.total ? "full" : ""}">${ringSVG(26, 6)}<div class="label">${p.done}/${p.total}</div></div>
    </header>`));
  const body = h(`<div class="today-body"></div>`);
  main.append(body);
  requestAnimationFrame(() => requestAnimationFrame(() => setRing(main.querySelector(".ring"), p.total ? p.done / p.total : 0)));

  const fab = h(`<button class="fab" aria-label="Nuevo hábito">${ui("plus", 28, 2.4)}</button>`);
  fab.onclick = () => { openEditor(null); };
  document.body.append(fab);
  refreshToday();
}

function refreshToday() {
  const body = document.querySelector(".today-body"); if (!body) return;
  const today = todayKey();
  if (!S.habits.length) {
    if (!body.querySelector(".empty")) {
      body.innerHTML = "";
      const e = h(`<div class="empty"><div class="empty-mark">🌱</div><h3>Empezá con uno</h3><p>Creá tu primer hábito. Chiquito, que lo puedas sostener.</p><button class="btn btn-primary">${ui("plus", 20, 2.4)} Nuevo hábito</button></div>`);
      e.querySelector("button").onclick = () => openEditor(null);
      body.append(e);
    }
    updateHeaders(); return;
  }
  body.querySelector(".empty")?.remove();
  if (!body.querySelector(".list-today")) {
    body.innerHTML = `
      <div class="list list-today"></div>
      <div class="rest-day" hidden>Hoy no tenés nada programado. Descansá 😌</div>
      <p class="hint" hidden><span class="swipe-demo"></span>Deslizá para cumplir · Mantené apretado para editar</p>
      <div class="others" hidden><div class="section-label">No toca hoy</div><div class="list list-others"></div></div>`;
  }
  const todays = sortForDay(habitsFor(today), today);
  const others = S.habits.filter((hb) => !isScheduled(hb, today));
  reconcile(body.querySelector(".list-today"), todays.map((hb) => ({ hb, day: today })));
  reconcile(body.querySelector(".list-others"), others.map((hb) => ({ hb, day: today, locked: true, showDays: true })));
  body.querySelector(".rest-day").hidden = todays.length > 0;
  body.querySelector(".hint").hidden = !todays.some((hb) => !isDone(hb, today));
  body.querySelector(".others").hidden = !others.length;
  updateHeaders();
}

// ═══ Vista: CALENDARIO ════════════════════════════════════════════════
function renderCalendar(main) {
  main.append(h(`
    <header class="head">
      <div><div class="eyebrow cal-year"></div><h1 class="title cal-title"></h1></div>
      <div class="cal-nav">
        <button class="cal-today-btn" hidden>Hoy</button>
        <button class="icon-btn" data-d="-1" aria-label="Mes anterior">${ui("chevron-left", 20)}</button>
        <button class="icon-btn" data-d="1" aria-label="Mes siguiente">${ui("chevron-right", 20)}</button>
      </div>
    </header>`));
  main.append(h(`
    <div class="cal">
      <div class="cal-week-head">${WEEK_ORDER.map((d) => `<span>${WEEK_SHORT[d]}</span>`).join("")}</div>
      <div class="cal-grid"></div>
    </div>`));
  main.append(h(`<div class="legend"><span><i style="background:var(--accent)"></i>Día completo</span><span><i style="border:2.5px solid var(--accent);border-right-color:var(--ring-track);border-bottom-color:var(--ring-track)"></i>Parcial</span><span><i style="border:2px solid var(--ring-track)"></i>Sin cumplir</span></div>`));
  main.append(h(`<div class="stats"></div>`));

  main.querySelectorAll("[data-d]").forEach((b) => b.onclick = () => { sfx.tap(); shiftMonth(+b.dataset.d); });
  main.querySelector(".cal-today-btn").onclick = () => {
    sfx.tap(); const n = new Date();
    const dir = n.getFullYear() * 12 + n.getMonth() > S.cal.y * 12 + S.cal.m ? 1 : -1;
    S.cal = { y: n.getFullYear(), m: n.getMonth() }; S.calSel = null; buildMonth(dir);
  };
  buildMonth(0);
  // Si volvés al calendario con un día abierto, lo reabrimos
  if (S.calSel) { const sel = S.calSel; S.calSel = null; selectDay(sel, true); }
}

function shiftMonth(d) {
  let { y, m } = S.cal; m += d;
  if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
  S.cal = { y, m }; S.calSel = null; buildMonth(d);
}

function buildMonth(dir) {
  const { y, m } = S.cal;
  document.querySelector(".cal-year").textContent = y;
  document.querySelector(".cal-title").textContent = cap(MONTHS[m]);
  const n = new Date();
  document.querySelector(".cal-today-btn").hidden = n.getFullYear() === y && n.getMonth() === m;

  const grid = document.querySelector(".cal-grid");
  grid.innerHTML = "";
  grid.classList.remove("slide-l", "slide-r"); void grid.offsetWidth;
  if (dir) grid.classList.add(dir > 0 ? "slide-l" : "slide-r");

  const first = new Date(y, m, 1), offset = (first.getDay() + 6) % 7;
  const daysIn = new Date(y, m + 1, 0).getDate();
  const cells = Math.ceil((offset + daysIn) / 7) * 7;
  for (let i = 0; i < cells; i++) {
    const dn = i - offset + 1;
    if (dn < 1 || dn > daysIn) { grid.append(h(`<div class="day other"></div>`)); continue; }
    const key = toKey(new Date(y, m, dn));
    const cell = h(`<button class="day" data-day="${key}" aria-label="${longDate(key)}"><span class="day-ring">${ringSVG(15, 2.5)}</span><span class="day-num">${dn}</span></button>`);
    cell.onclick = () => selectDay(key);
    grid.append(cell);
  }
  requestAnimationFrame(() => updateCalendarCells());
  updateStats();
}

function updateCalendarCells() {
  const today = todayKey();
  document.querySelectorAll(".day[data-day]").forEach((cell) => {
    const day = cell.dataset.day, p = progress(day), future = day > today;
    cell.classList.toggle("today", day === today);
    cell.classList.toggle("future", future);
    cell.classList.toggle("full", !future && p.total > 0 && p.done === p.total);
    cell.classList.toggle("sel", day === S.calSel);
    const ring = cell.querySelector(".day-ring");
    ring.style.visibility = p.total ? "visible" : "hidden";
    setRing(ring, future ? 0 : p.total ? p.done / p.total : 0);
  });
}

function selectDay(day, instant = false) {
  const grid = document.querySelector(".cal-grid");
  const old = grid.querySelector(".day-panel:not(.closing)");
  const same = S.calSel === day;
  if (old) closePanel(old);
  if (same) { S.calSel = null; sfx.close(); updateCalendarCells(); return; }
  S.calSel = day; sfx.open();
  updateCalendarCells();

  // El panel va justo después de la fila (semana) del día tocado
  const all = [...grid.children].filter((c) => !c.classList.contains("day-panel"));
  const idx = all.findIndex((c) => c.dataset.day === day);
  const rowEnd = all[Math.floor(idx / 7) * 7 + 6];
  const panel = h(`<div class="day-panel"><div class="day-panel-inner"><div class="day-panel-head"><h3></h3><span></span></div><div class="list list-day"></div><div class="future-note" hidden>Este día todavía no llegó ⏳</div><div class="rest-day" hidden>Sin hábitos este día</div></div></div>`);
  rowEnd.after(panel);
  fillPanel(panel);
  const inner = panel.firstElementChild;
  if (instant) { panel.style.height = "auto"; return; }
  requestAnimationFrame(() => {
    panel.style.height = inner.offsetHeight + "px";
    const done = (e) => { if (e.target === panel && S.calSel === day) { panel.style.height = "auto"; } panel.removeEventListener("transitionend", done); };
    panel.addEventListener("transitionend", done);
    setTimeout(() => {
      const r = panel.getBoundingClientRect(), bottom = innerHeight - 90;
      if (r.bottom > bottom) window.scrollBy({ top: Math.min(r.bottom - bottom, r.top - 80), behavior: "smooth" });
    }, 200);
  });
}

function closePanel(panel) {
  panel.style.height = panel.offsetHeight + "px";
  void panel.offsetHeight;
  panel.style.height = "0px";
  panel.classList.add("closing");
  setTimeout(() => panel.remove(), 450);
}

function fillPanel(panel) {
  const day = S.calSel, today = todayKey(), future = day > today;
  const list = sortForDay(habitsFor(day), day);
  panel.querySelector("h3").textContent = longDate(day) + (day === today ? " · hoy" : "");
  reconcile(panel.querySelector(".list-day"), list.map((hb) => ({ hb, day, locked: future })));
  panel.querySelector(".future-note").hidden = !(future && list.length);
  panel.querySelector(".rest-day").hidden = list.length > 0;
  updatePanelHead();
}
function updatePanelHead() {
  const panel = document.querySelector(".day-panel:not(.closing)"); if (!panel || !S.calSel) return;
  const p = progress(S.calSel);
  panel.querySelector(".day-panel-head span").textContent = p.total ? `${p.done}/${p.total}` : "";
}

function refreshCalendar() {
  updateCalendarCells();
  const panel = document.querySelector(".day-panel:not(.closing)");
  if (panel) fillPanel(panel);
  updateStats();
}

function updateStats() {
  const box = document.querySelector(".stats"); if (!box) return;
  const { y, m } = S.cal, today = todayKey();
  const daysIn = new Date(y, m + 1, 0).getDate();
  let perfect = 0, done = 0, total = 0;
  for (let d = 1; d <= daysIn; d++) {
    const key = toKey(new Date(y, m, d)); if (key > today) break;
    const p = progress(key); done += p.done; total += p.total;
    if (p.total && p.done === p.total) perfect++;
  }
  const best = S.habits.reduce((mx, hb) => Math.max(mx, streak(hb)), 0);
  box.innerHTML = `
    <div class="stat"><b>${perfect}</b><span>días perfectos</span></div>
    <div class="stat"><b>${total ? Math.round((done / total) * 100) : 0}%</b><span>cumplido del mes</span></div>
    <div class="stat"><b>${best}</b><span>racha más larga activa</span></div>`;
}

// ═══ Vista: AJUSTES ═══════════════════════════════════════════════════
function renderSettings(main) {
  const theme = getTheme();
  main.append(h(`<header class="head"><div><div class="eyebrow">Tu cuenta</div><h1 class="title">Ajustes</h1></div></header>`));
  const card = h(`
    <div class="card">
      <div class="row">${ui("mail", 20)}<div class="grow"><b>${esc(S.user?.email || "")}</b><small>${store.mode === "local" ? "Datos guardados en este dispositivo" : "Sincronizado en la nube"}</small></div></div>
      <div class="row">${ui("sun-moon", 20)}<div class="grow">Tema</div>
        <div class="seg" data-theme-seg>${[["auto", "Auto"], ["light", "Claro"], ["dark", "Oscuro"]].map(([v, l]) => `<button data-v="${v}" class="${theme === v ? "on" : ""}">${l}</button>`).join("")}</div></div>
      <button class="row" data-sound>${ui(isSoundOn() ? "volume-2" : "volume-x", 20)}<div class="grow">Sonidos</div><span class="switch ${isSoundOn() ? "on" : ""}"></span></button>
    </div>`);
  main.append(card);

  // Lo que el coach sabe de vos
  const prof = h(`
    <div class="card about-card" style="margin-top:14px">
      <div class="row">${ui("user-round", 20)}<div class="grow"><b>Sobre vos</b><small>Lo usa el coach para conocerte. Opcional.</small></div></div>
      <div class="about-body">
        <input class="about-name" maxlength="40" placeholder="¿Cómo te llamo?">
        <textarea class="about-text" maxlength="1500" rows="5" placeholder="Ej: 27 años, trabajo de herrero. Quiero tener mi propia herrería, ganar más plata y mudarme a EE.UU. Me cuesta sostener rutinas, ya me quemé otras veces…"></textarea>
        <button class="btn btn-ghost" data-save-about>Guardar</button>
      </div>
    </div>`);
  main.append(prof);
  store.getProfile().then((p) => { prof.querySelector(".about-name").value = p.name || ""; prof.querySelector(".about-text").value = p.about || ""; }).catch(() => {});
  prof.querySelector("[data-save-about]").onclick = async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try {
      await store.saveProfile({ name: prof.querySelector(".about-name").value.trim(), about: prof.querySelector(".about-text").value.trim() });
      sfx.save(); toast("Guardado. El coach ya lo sabe 🧠");
    } catch (err) { toast("Error: " + err.message); }
    b.disabled = false;
  };

  const card2 = h(`<div class="card" style="margin-top:14px"><button class="row" data-out>${ui("log-out", 20)}<div class="grow">Cerrar sesión</div></button></div>`);
  main.append(card2);
  main.append(h(`<p class="foot">Hábitos · ${S.habits.length} ${S.habits.length === 1 ? "hábito" : "hábitos"} · ${S.done.size} registros</p>`));

  card.querySelectorAll("[data-theme-seg] button").forEach((b) => b.onclick = () => {
    sfx.tap(); applyTheme(b.dataset.v);
    card.querySelectorAll("[data-theme-seg] button").forEach((x) => x.classList.toggle("on", x === b));
  });
  const sb = card.querySelector("[data-sound]");
  sb.onclick = () => {
    const on = !isSoundOn(); setSound(on); if (on) sfx.save();
    sb.querySelector(".switch").classList.toggle("on", on);
    sb.querySelector("svg").outerHTML = ui(on ? "volume-2" : "volume-x", 20);
  };
  card2.querySelector("[data-out]").onclick = async () => { sfx.close(); S.view = "today"; await store.signOut(); S.user = null; renderAuth(); };
}

// ═══ Editor de hábito (hoja inferior) ═════════════════════════════════
const COLORS = ["#D97757", "#E8A15A", "#E3C565", "#8DA48A", "#5E8C6A", "#7FA7C9", "#4F6D8F", "#9B7BA6", "#D9899B", "#B5835A", "#3D3D3A", "#E8E1D3", "#FFFFFF"];
const EMOJIS = ["💧", "📚", "🏃", "💪", "🧘", "😴", "🥗", "🍎", "✍️", "🎸", "💻", "☕", "🚭", "📵", "🌱", "🧠", "🔨", "🇺🇸", "💰", "🦷", "🚿", "🙏", "🎯", "🌅"];

function openEditor(habit) {
  if (document.querySelector(".sheet")) return;
  sfx.open();
  const editing = !!habit;
  const d = habit ? { ...habit, days: habit.days ? [...habit.days] : null }
    : { name: "", icon_type: "emoji", icon: "✨", color: COLORS[0], icon_color: "white", days: null };
  let inkTouched = editing;

  const back = h(`<div class="sheet-backdrop"></div>`);
  const sh = h(`
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${editing ? "Editar hábito" : "Nuevo hábito"}">
      <div class="sheet-grab"></div>
      <div class="sheet-head"><h2>${editing ? "Editar hábito" : "Nuevo hábito"}</h2><button class="icon-btn" data-close aria-label="Cerrar">${ui("x", 20)}</button></div>
      <div class="preview"><div class="habit-icon"></div><input maxlength="60" placeholder="Nombre del hábito" enterkeyhint="done"></div>

      <div class="lbl">Color</div>
      <div class="swatches">
        ${COLORS.map((c) => `<button class="swatch" data-c="${c}" style="--c:${c}" aria-label="Color ${c}"></button>`).join("")}
        <label class="swatch custom" aria-label="Color personalizado"><input type="color"></label>
      </div>

      <div class="lbl"><span>Ícono</span>
        <div class="seg" data-ink><button data-v="white">Blanco</button><button data-v="black">Negro</button></div>
      </div>
      <div class="seg icon-tabs" data-type><button data-v="emoji">Emoji</button><button data-v="icon">Ícono</button></div>
      <div data-pane="emoji">
        <div class="emoji-input"><input maxlength="8" aria-label="Emoji"><span>Escribí cualquier emoji o elegí uno</span></div>
        <div class="glyphs">${EMOJIS.map((e) => `<button class="glyph" data-e="${e}">${e}</button>`).join("")}</div>
      </div>
      <div data-pane="icon" hidden>
        <div class="glyphs">${Object.keys(HABIT_ICONS).map((n) => `<button class="glyph" data-i="${n}" aria-label="${n}">${habitIcon(n, 21)}</button>`).join("")}</div>
      </div>

      <div class="lbl"><span>Días</span><button class="row" data-daily style="width:auto;padding:0;gap:10px"><span style="font-size:13px;text-transform:none;letter-spacing:0;color:var(--text-2);font-weight:500">Todos los días</span><span class="switch"></span></button></div>
      <div class="days">${WEEK_ORDER.map((wd) => `<button class="dchip" data-wd="${wd}">${WEEK_SHORT[wd]}</button>`).join("")}</div>

      <div class="lbl"><span>Desde</span><input type="date" class="date-in" data-start></div>
      <p class="start-note">Elegí una fecha anterior si querés cargar días pasados.</p>

      <div class="sheet-actions">
        <button class="btn btn-primary" data-save>${editing ? "Guardar cambios" : "Crear hábito"}</button>
        ${editing ? `<button class="btn btn-danger" data-del>${ui("trash-2", 18)} Eliminar hábito</button>` : ""}
      </div>
    </div>`);
  document.body.append(back, sh);
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => { back.classList.add("in"); sh.classList.add("in"); });

  const icon = sh.querySelector(".preview .habit-icon");
  const nameIn = sh.querySelector(".preview input");
  const emojiIn = sh.querySelector(".emoji-input input");
  nameIn.value = d.name;
  const startIn = sh.querySelector("[data-start]");
  startIn.max = todayKey(); startIn.value = d.start_date || todayKey();
  if (d.icon_type === "emoji") emojiIn.value = d.icon;

  const paint = (pop) => {
    icon.style.setProperty("--c", d.color);
    icon.className = `habit-icon ink-${d.icon_color}`;
    icon.innerHTML = d.icon_type === "icon" ? habitIcon(d.icon, 28, 2) : esc(d.icon);
    if (pop) { void icon.offsetWidth; icon.classList.add("changed"); }
    sh.querySelectorAll(".swatch[data-c]").forEach((s) => s.classList.toggle("on", s.dataset.c.toLowerCase() === d.color.toLowerCase()));
    const custom = sh.querySelector(".swatch.custom");
    const isCustom = !COLORS.some((c) => c.toLowerCase() === d.color.toLowerCase());
    custom.classList.toggle("on", isCustom); if (isCustom) custom.style.setProperty("--c", d.color);
    sh.querySelectorAll("[data-ink] button").forEach((b) => b.classList.toggle("on", b.dataset.v === d.icon_color));
    sh.querySelectorAll("[data-type] button").forEach((b) => b.classList.toggle("on", b.dataset.v === d.icon_type));
    sh.querySelector('[data-pane="emoji"]').hidden = d.icon_type !== "emoji";
    sh.querySelector('[data-pane="icon"]').hidden = d.icon_type !== "icon";
    sh.querySelectorAll(".glyph[data-e]").forEach((g) => g.classList.toggle("on", d.icon_type === "emoji" && g.dataset.e === d.icon));
    sh.querySelectorAll(".glyph[data-i]").forEach((g) => g.classList.toggle("on", d.icon_type === "icon" && g.dataset.i === d.icon));
    const daily = !d.days;
    sh.querySelector("[data-daily] .switch").classList.toggle("on", daily);
    sh.querySelector(".days").classList.toggle("off", daily);
    sh.querySelectorAll(".dchip").forEach((c) => c.classList.toggle("on", daily || d.days.includes(+c.dataset.wd)));
  };
  paint(false);

  const setColor = (c) => { d.color = c; if (!inkTouched) d.icon_color = bestInk(c); sfx.tap(); paint(true); };
  sh.querySelectorAll(".swatch[data-c]").forEach((s) => s.onclick = () => setColor(s.dataset.c));
  const picker = sh.querySelector(".swatch.custom input");
  picker.value = d.color; picker.oninput = () => setColor(picker.value);
  sh.querySelectorAll("[data-ink] button").forEach((b) => b.onclick = () => { inkTouched = true; d.icon_color = b.dataset.v; sfx.tap(); paint(true); });
  sh.querySelectorAll("[data-type] button").forEach((b) => b.onclick = () => {
    if (d.icon_type === b.dataset.v) return;
    d.icon_type = b.dataset.v; sfx.tap();
    d.icon = d.icon_type === "icon" ? (HABIT_ICONS[d.icon] ? d.icon : "sparkles") : (emojiIn.value || "✨");
    paint(true);
  });
  sh.querySelectorAll(".glyph[data-e]").forEach((g) => g.onclick = () => { d.icon_type = "emoji"; d.icon = g.dataset.e; emojiIn.value = d.icon; sfx.tap(); paint(true); });
  sh.querySelectorAll(".glyph[data-i]").forEach((g) => g.onclick = () => { d.icon_type = "icon"; d.icon = g.dataset.i; sfx.tap(); paint(true); });
  emojiIn.oninput = () => {
    const v = emojiIn.value.trim(); if (!v) return;
    const seg = window.Intl?.Segmenter ? [...new Intl.Segmenter("es", { granularity: "grapheme" }).segment(v)].map((s) => s.segment) : [...v];
    const g = seg[seg.length - 1];
    emojiIn.value = g; d.icon_type = "emoji"; d.icon = g; paint(true);
  };
  sh.querySelector("[data-daily]").onclick = () => {
    sfx.tap(); d.days = d.days ? null : [1, 2, 3, 4, 5]; paint(false);
  };
  sh.querySelectorAll(".dchip").forEach((c) => c.onclick = () => {
    sfx.tap(); const wd = +c.dataset.wd;
    let days = d.days ? [...d.days] : [0, 1, 2, 3, 4, 5, 6];
    days = days.includes(wd) ? days.filter((x) => x !== wd) : [...days, wd];
    if (!days.length) { toast("Elegí al menos un día"); return; }
    d.days = days.length === 7 ? null : days.sort();
    c.animate([{ transform: "scale(.85)" }, { transform: "scale(1)" }], { duration: 300, easing: "cubic-bezier(.34,1.56,.64,1)" });
    paint(false);
  });

  const close = () => {
    sfx.close(); back.classList.remove("in"); sh.classList.remove("in");
    document.body.style.overflow = ""; document.removeEventListener("keydown", onKey);
    setTimeout(() => { back.remove(); sh.remove(); }, 450);
  };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  back.onclick = close;
  sh.querySelector("[data-close]").onclick = close;
  nameIn.onkeydown = (e) => { if (e.key === "Enter") nameIn.blur(); };

  const saveBtn = sh.querySelector("[data-save]");
  saveBtn.onclick = async () => {
    d.name = nameIn.value.trim();
    if (!d.name) {
      nameIn.focus();
      nameIn.parentElement.animate([{ transform: "translateX(0)" }, { transform: "translateX(-8px)" }, { transform: "translateX(7px)" }, { transform: "translateX(-4px)" }, { transform: "translateX(0)" }], { duration: 360 });
      return;
    }
    saveBtn.disabled = true;
    const start = /^\d{4}-\d{2}-\d{2}$/.test(startIn.value) && startIn.value <= todayKey() ? startIn.value : todayKey();
    const payload = { name: d.name, icon_type: d.icon_type, icon: d.icon, icon_color: d.icon_color, color: d.color, days: d.days, start_date: start };
    try {
      if (editing) {
        const upd = await store.updateHabit(habit.id, payload);
        S.habits = S.habits.map((x) => (x.id === upd.id ? { ...upd, goal_id: x.goal_id } : x));
        toast("Cambios guardados");
      } else {
        const created = await store.createHabit(payload);
        S.habits.push(created);
        toast(`“${created.name}” creado ✨`);
      }
      sfx.save(); close(); refresh();
    } catch (e) { toast("Error: " + e.message); saveBtn.disabled = false; }
  };

  const delBtn = sh.querySelector("[data-del]");
  if (delBtn) {
    let armedDel = false, t;
    delBtn.onclick = async () => {
      if (!armedDel) {
        armedDel = true; delBtn.classList.add("confirm"); delBtn.innerHTML = `${ui("trash-2", 18)} Tocá de nuevo para confirmar`; sfx.arm();
        t = setTimeout(() => { armedDel = false; delBtn.classList.remove("confirm"); delBtn.innerHTML = `${ui("trash-2", 18)} Eliminar hábito`; }, 3000);
        return;
      }
      clearTimeout(t); delBtn.disabled = true;
      try {
        await store.deleteHabit(habit.id);
        S.habits = S.habits.filter((x) => x.id !== habit.id);
        S.done = new Set([...S.done].filter((x) => !x.startsWith(habit.id + "|")));
        sfx.remove(); close(); toast("Hábito eliminado");
        const row = document.querySelector(`.habit[data-key="${habit.id}"]`);
        if (row) {
          const a = row.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(-40px) scale(.96)" }], { duration: 280, easing: "ease-in", fill: "forwards" });
          a.onfinish = () => refresh();
        } else refresh();
      } catch (e) { toast("Error: " + e.message); delBtn.disabled = false; }
    };
  }
  if (!editing) setTimeout(() => nameIn.focus(), 350);
}

boot();
