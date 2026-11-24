// Vista "Metas": pendientes (tareas) arriba, metas abajo.
import { esc, h, toast, openSheet, armDelete } from "./kit.js";
import { sfx } from "./sound.js";
import { ui } from "./icons.js";
import { todayKey, addDays, fromKey, MONTHS, WEEKDAYS } from "./dates.js";

export const AREAS = {
  cuerpo: { e: "💪", l: "Cuerpo" }, cara: { e: "🪞", l: "Imagen" }, mente: { e: "🧠", l: "Mente" },
  plata: { e: "💰", l: "Plata" }, trabajo: { e: "🔨", l: "Trabajo" }, otro: { e: "🎯", l: "Otro" },
};
const AREA_COLOR = { cuerpo: "#D97757", cara: "#9B7BA6", mente: "#7FA7C9", plata: "#8DA48A", trabajo: "#B5835A", otro: "#E8A15A" };

const shortDate = (k) => { const d = fromKey(k); return `${WEEKDAYS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`; };
function dueLabel(due) {
  if (!due) return "";
  const t = todayKey();
  if (due < t) return `<span class="due late">venció ${shortDate(due)}</span>`;
  if (due === t) return `<span class="due today">hoy</span>`;
  if (due === addDays(t, 1)) return `<span class="due">mañana</span>`;
  return `<span class="due">${shortDate(due)}</span>`;
}
function daysLeft(target) {
  if (!target) return "";
  const n = Math.round((fromKey(target) - fromKey(todayKey())) / 864e5);
  if (n < 0) return "fecha pasada";
  if (n === 0) return "es hoy";
  if (n < 60) return `faltan ${n} días`;
  return `faltan ${Math.round(n / 30)} meses`;
}

// ═══ Render ════════════════════════════════════════════════════════════
export function renderGoals(main, ctx) {
  const pending = ctx.S.tasks.filter((t) => !t.done).length;
  main.append(h(`
    <header class="head">
      <div><div class="eyebrow">Lo que importa</div><h1 class="title">Metas</h1></div>
      <div class="head-count"><b>${pending}</b><span>${pending === 1 ? "pendiente" : "pendientes"}</span></div>
    </header>`));

  const add = h(`
    <form class="quick-add" autocomplete="off">
      <input name="t" maxlength="120" placeholder="Anotá un pendiente…" enterkeyhint="done">
      <button type="submit" aria-label="Agregar">${ui("plus", 22, 2.4)}</button>
    </form>`);
  main.append(add);
  add.onsubmit = async (e) => {
    e.preventDefault();
    const title = add.t.value.trim(); if (!title) return;
    add.t.value = "";
    try {
      const t = await ctx.store.createTask({ title });
      ctx.S.tasks.push(t); sfx.save(); refreshGoals(ctx, t.id);
    } catch (err) { toast("Error: " + err.message); add.t.value = title; }
  };

  main.append(h(`<div class="goals-body"></div>`));

  const fab = h(`<button class="fab" aria-label="Nueva meta">${ui("plus", 28, 2.4)}</button>`);
  fab.onclick = () => openGoal(ctx, null);
  document.body.append(fab);
  refreshGoals(ctx);
}

export function refreshGoals(ctx, newId) {
  const body = document.querySelector(".goals-body"); if (!body) return;
  const { S } = ctx, today = todayKey();
  const head = document.querySelector(".head-count");
  const pending = S.tasks.filter((t) => !t.done);
  if (head) head.innerHTML = `<b>${pending.length}</b><span>${pending.length === 1 ? "pendiente" : "pendientes"}</span>`;

  // Pendientes: vencidos/hoy primero, después por fecha, los sin fecha al final
  const order = (t) => (t.due_date ? t.due_date : "9999");
  pending.sort((a, b) => order(a).localeCompare(order(b)) || a.created_at.localeCompare(b.created_at));
  const recentDone = S.tasks.filter((t) => t.done && t.done_at && t.done_at.slice(0, 10) >= addDays(today, -2))
    .sort((a, b) => b.done_at.localeCompare(a.done_at)).slice(0, 5);
  const active = S.goals.filter((g) => g.status === "active");
  const achieved = S.goals.filter((g) => g.status === "done");

  body.innerHTML = `
    <div class="section-label">Pendientes</div>
    <div class="tasks">
      ${pending.length ? pending.map((t) => taskHTML(t, S)).join("") : `<div class="soft-empty">Nada pendiente. Disfrutalo 😌</div>`}
    </div>
    ${recentDone.length ? `<div class="section-label">Hechos recién</div><div class="tasks">${recentDone.map((t) => taskHTML(t, S)).join("")}</div>` : ""}

    <div class="section-label">Metas</div>
    ${active.length ? `<div class="goal-list">${active.map((g) => goalHTML(g, ctx)).join("")}</div>` : `
      <div class="empty goal-empty">
        <div class="empty-mark">🎯</div>
        <h3>¿A dónde vas?</h3>
        <p>Definí entre 1 y 3 metas. Más que eso es la receta del burnout.</p>
        <button class="btn btn-primary" data-new-goal>${ui("plus", 20, 2.4)} Nueva meta</button>
      </div>`}
    ${active.length >= 4 ? `<p class="gentle-warn">Tenés ${active.length} metas activas. ¿Seguro que podés empujar todas a la vez? 🤔</p>` : ""}
    ${achieved.length ? `<div class="section-label">Logradas 🏆</div><div class="goal-list done">${achieved.map((g) => goalHTML(g, ctx)).join("")}</div>` : ""}`;

  body.querySelector("[data-new-goal]")?.addEventListener("click", () => openGoal(ctx, null));
  body.querySelectorAll(".task").forEach((el) => {
    const t = S.tasks.find((x) => x.id === el.dataset.id);
    el.querySelector(".task-check").onclick = () => toggleTask(ctx, t, el);
    el.querySelector(".task-text").onclick = () => openTask(ctx, t);
    if (t.id === newId) el.animate([{ opacity: 0, transform: "translateY(-8px)" }, { opacity: 1, transform: "none" }], { duration: 350, easing: "cubic-bezier(.2,.8,.2,1)" });
  });
  body.querySelectorAll(".goal").forEach((el) => {
    el.onclick = () => openGoal(ctx, S.goals.find((g) => g.id === el.dataset.id));
  });
  requestAnimationFrame(() => body.querySelectorAll(".bar-fill").forEach((b) => (b.style.width = b.dataset.w)));
}

function taskHTML(t, S) {
  const goal = t.goal_id && S.goals.find((g) => g.id === t.goal_id);
  const meta = [dueLabel(t.due_date), goal ? `<span>${AREAS[goal.area]?.e || "🎯"} ${esc(goal.title)}</span>` : ""].filter(Boolean).join(" · ");
  return `
    <div class="task ${t.done ? "done" : ""}" data-id="${t.id}">
      <button class="task-check" aria-label="${t.done ? "Desmarcar" : "Marcar como hecho"}">${ui("check", 15, 3)}</button>
      <button class="task-text"><span class="task-title">${esc(t.title)}</span>${meta ? `<span class="task-meta">${meta}</span>` : ""}</button>
    </div>`;
}

function goalStats(g, ctx) {
  const tasks = ctx.S.tasks.filter((t) => t.goal_id === g.id);
  const habits = ctx.S.habits.filter((hb) => hb.goal_id === g.id);
  let hd = 0, ht = 0;
  habits.forEach((hb) => { const r = ctx.habitRate(hb, 7); hd += r.done; ht += r.total; });
  const tDone = tasks.filter((t) => t.done).length;
  // Progreso: mitad tareas, mitad constancia de hábitos (si hay de ambos)
  const parts = [];
  if (tasks.length) parts.push(tDone / tasks.length);
  if (ht) parts.push(hd / ht);
  const pct = parts.length ? Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100) : 0;
  return { tasks, habits, tDone, hd, ht, pct };
}

function goalHTML(g, ctx) {
  const st = goalStats(g, ctx);
  const a = AREAS[g.area] || AREAS.otro;
  const bits = [];
  if (st.tasks.length) bits.push(`${st.tDone}/${st.tasks.length} tareas`);
  if (st.habits.length) bits.push(`hábitos ${st.ht ? Math.round((st.hd / st.ht) * 100) : 0}% esta semana`);
  if (g.target_date && g.status === "active") bits.push(daysLeft(g.target_date));
  return `
    <button class="goal" data-id="${g.id}">
      <div class="goal-top">
        <div class="habit-icon" style="--c:${AREA_COLOR[g.area] || AREA_COLOR.otro}">${a.e}</div>
        <div class="goal-text"><div class="goal-title">${esc(g.title)}</div><div class="goal-meta">${esc(bits.join(" · ") || "Sumale tareas o hábitos para ver el progreso")}</div></div>
        ${g.status === "done" ? `<span class="goal-badge">✓</span>` : `<span class="goal-pct">${st.pct}%</span>`}
      </div>
      ${g.status === "active" ? `<div class="bar"><div class="bar-fill" data-w="${st.pct}%"></div></div>` : ""}
    </button>`;
}

// ═══ Acciones ══════════════════════════════════════════════════════════
async function toggleTask(ctx, t, el) {
  const done = !t.done;
  const prev = { done: t.done, done_at: t.done_at };
  Object.assign(t, { done, done_at: done ? new Date().toISOString() : null });
  el.classList.toggle("done", done);
  if (done) { sfx.complete(); navigator.vibrate?.(15); el.classList.add("just-done"); } else sfx.undo();
  setTimeout(() => refreshGoals(ctx), 650);
  try { await ctx.store.updateTask(t.id, { done, done_at: t.done_at }); }
  catch (e) { Object.assign(t, prev); toast("No se pudo guardar: " + e.message); refreshGoals(ctx); }
}

function goalOptions(ctx, selected) {
  return `<option value="">Sin meta</option>` + ctx.S.goals.filter((g) => g.status === "active" || g.id === selected)
    .map((g) => `<option value="${g.id}" ${g.id === selected ? "selected" : ""}>${AREAS[g.area]?.e || ""} ${esc(g.title)}</option>`).join("");
}

function openTask(ctx, t) {
  const s = openSheet("Pendiente", `
    <div class="form">
      <label class="lbl">Qué</label>
      <input class="input" data-title maxlength="120" value="${esc(t.title)}">
      <label class="lbl"><span>Para cuándo</span><button class="link" data-nodate>Sin fecha</button></label>
      <input type="date" class="input" data-due value="${t.due_date || ""}">
      <label class="lbl">Meta</label>
      <select class="input" data-goal>${goalOptions(ctx, t.goal_id)}</select>
    </div>
    <div class="sheet-actions">
      <button class="btn btn-primary" data-save>Guardar</button>
      <button class="btn btn-danger" data-del>${ui("trash-2", 18)} Eliminar</button>
    </div>`);
  if (!s) return;
  const { sheet, close } = s;
  sheet.querySelector("[data-nodate]").onclick = () => { sheet.querySelector("[data-due]").value = ""; };
  sheet.querySelector("[data-save]").onclick = async (e) => {
    const title = sheet.querySelector("[data-title]").value.trim(); if (!title) return;
    e.currentTarget.disabled = true;
    try {
      const upd = await ctx.store.updateTask(t.id, { title, due_date: sheet.querySelector("[data-due]").value || null, goal_id: sheet.querySelector("[data-goal]").value || null });
      Object.assign(t, upd); sfx.save(); close(); refreshGoals(ctx);
    } catch (err) { toast("Error: " + err.message); e.currentTarget.disabled = false; }
  };
  armDelete(sheet.querySelector("[data-del]"), "Eliminar", async () => {
    await ctx.store.deleteTask(t.id);
    ctx.S.tasks = ctx.S.tasks.filter((x) => x.id !== t.id);
    sfx.remove(); close(); refreshGoals(ctx);
  });
}

function openGoal(ctx, goal) {
  const editing = !!goal;
  const g = goal ? { ...goal } : { title: "", why: "", area: "otro", target_date: null, status: "active" };
  const st = editing ? goalStats(goal, ctx) : null;
  const s = openSheet(editing ? "Meta" : "Nueva meta", `
    <div class="form">
      <input class="input big" data-title maxlength="80" placeholder="Ej: Bajar a 15% de grasa" value="${esc(g.title)}">
      <label class="lbl">Área</label>
      <div class="area-chips">${Object.entries(AREAS).map(([k, a]) => `<button class="chip ${g.area === k ? "on" : ""}" data-area="${k}">${a.e} ${a.l}</button>`).join("")}</div>
      <label class="lbl">¿Por qué te importa?</label>
      <textarea class="input" data-why maxlength="500" rows="3" placeholder="El motivo real. Te va a servir los días que no tengas ganas.">${esc(g.why)}</textarea>
      <label class="lbl"><span>Fecha objetivo</span><button class="link" data-nodate>Sin fecha</button></label>
      <input type="date" class="input" data-date value="${g.target_date || ""}">
      ${editing ? `
        <label class="lbl">Lo que empuja esta meta</label>
        <div class="linked">
          ${st.habits.map((hb) => `<div>🔁 ${esc(hb.name)}</div>`).join("")}
          ${st.tasks.map((t) => `<div class="${t.done ? "muted" : ""}">${t.done ? "✓" : "○"} ${esc(t.title)}</div>`).join("")}
          ${!st.habits.length && !st.tasks.length ? `<div class="muted">Todavía nada. Asigná pendientes a esta meta, o pedile al coach que te arme un plan.</div>` : ""}
        </div>` : ""}
    </div>
    <div class="sheet-actions">
      <button class="btn btn-primary" data-save>${editing ? "Guardar" : "Crear meta"}</button>
      ${editing ? `<button class="btn btn-ghost" data-status>${g.status === "active" ? "🏆 Marcar como lograda" : "Reactivar meta"}</button>
      <button class="btn btn-danger" data-del>${ui("trash-2", 18)} Eliminar meta</button>` : ""}
    </div>`);
  if (!s) return;
  const { sheet, close } = s;
  sheet.querySelectorAll("[data-area]").forEach((b) => b.onclick = () => {
    g.area = b.dataset.area; sfx.tap();
    sheet.querySelectorAll("[data-area]").forEach((x) => x.classList.toggle("on", x === b));
  });
  sheet.querySelector("[data-nodate]").onclick = () => { sheet.querySelector("[data-date]").value = ""; };
  const payload = () => ({
    title: sheet.querySelector("[data-title]").value.trim(), why: sheet.querySelector("[data-why]").value.trim(),
    area: g.area, target_date: sheet.querySelector("[data-date]").value || null,
  });
  sheet.querySelector("[data-save]").onclick = async (e) => {
    const p = payload();
    if (!p.title) { sheet.querySelector("[data-title]").focus(); return; }
    e.currentTarget.disabled = true;
    try {
      if (editing) Object.assign(goal, await ctx.store.updateGoal(goal.id, p));
      else ctx.S.goals.push(await ctx.store.createGoal(p));
      sfx.save(); close(); toast(editing ? "Meta guardada" : "Meta creada 🎯"); refreshGoals(ctx);
    } catch (err) { toast("Error: " + err.message); e.currentTarget.disabled = false; }
  };
  sheet.querySelector("[data-status]")?.addEventListener("click", async () => {
    const status = goal.status === "active" ? "done" : "active";
    try {
      Object.assign(goal, await ctx.store.updateGoal(goal.id, { status }));
      close();
      if (status === "done") { sfx.allDone(); toast("¡Meta lograda! Eso es avanzar de verdad 🏆"); } else sfx.save();
      refreshGoals(ctx);
    } catch (err) { toast("Error: " + err.message); }
  });
  const del = sheet.querySelector("[data-del]");
  if (del) armDelete(del, "Eliminar meta", async () => {
    await ctx.store.deleteGoal(goal.id);
    ctx.S.goals = ctx.S.goals.filter((x) => x.id !== goal.id);
    ctx.S.tasks.forEach((t) => { if (t.goal_id === goal.id) t.goal_id = null; });
    ctx.S.habits.forEach((hb) => { if (hb.goal_id === goal.id) hb.goal_id = null; });
    sfx.remove(); close(); toast("Meta eliminada"); refreshGoals(ctx);
  });
  if (!editing) setTimeout(() => sheet.querySelector("[data-title]").focus(), 350);
}
