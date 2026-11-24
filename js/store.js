// Capa de datos: Supabase si está configurado, si no localStorage ("modo local").
// Ambos backends exponen la misma API para que la app no sepa cuál usa.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { todayKey } from "./dates.js";

const uid = () => (crypto.randomUUID ? crypto.randomUUID() :
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  }));

const HABIT_FIELDS = "id,name,icon_type,icon,icon_color,color,days,start_date,created_at";
const GOAL_FIELDS = "id,title,why,area,target_date,status,created_at";
const TASK_FIELDS = "id,goal_id,title,due_date,done,done_at,created_at";
const ANALYSIS_FIELDS = "id,created_at,notes,result,photo_paths";

function normalizeHabit(h) {
  return {
    id: h.id,
    name: h.name,
    icon_type: h.icon_type || "emoji",
    icon: h.icon || "✨",
    icon_color: h.icon_color || "white",
    color: h.color || "#D97757",
    days: Array.isArray(h.days) && h.days.length && h.days.length < 7 ? h.days.map(Number) : null,
    start_date: h.start_date || todayKey(),
    goal_id: h.goal_id || null,
    created_at: h.created_at || new Date().toISOString(),
  };
}
const normalizeGoal = (g) => ({ id: g.id, title: g.title, why: g.why || "", area: g.area || "otro", target_date: g.target_date || null, status: g.status || "active", created_at: g.created_at || new Date().toISOString() });
const normalizeTask = (t) => ({ id: t.id, goal_id: t.goal_id || null, title: t.title, due_date: t.due_date || null, done: !!t.done, done_at: t.done_at || null, created_at: t.created_at || new Date().toISOString() });
const NEEDS_CLOUD = "El coach con IA necesita una cuenta (Supabase configurado).";

// ─── Supabase ───────────────────────────────────────────────────────────
function supabaseStore() {
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  const err = (e) => { if (e) throw new Error(translateAuthError(e.message)); };

  return {
    mode: "supabase",
    async getUser() { const { data } = await sb.auth.getSession(); return data.session?.user ?? null; },
    onAuthChange(cb) { sb.auth.onAuthStateChange((_ev, session) => cb(session?.user ?? null)); },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password }); err(error); return data.user;
    },
    async signUp(email, password) {
      const { data, error } = await sb.auth.signUp({ email, password }); err(error);
      return { user: data.session ? data.user : null, needsConfirm: !data.session };
    },
    async signOut() { await sb.auth.signOut(); },

    // Si todavía no corriste el SQL v2 (sin columna goal_id), igual funciona
    async listHabits() {
      let { data, error } = await sb.from("habits").select(HABIT_FIELDS + ",goal_id").order("created_at");
      if (error) ({ data, error } = await sb.from("habits").select(HABIT_FIELDS).order("created_at"));
      err(error);
      return data.map(normalizeHabit);
    },
    async createHabit(h) {
      const row = { ...h }; if (!row.goal_id) delete row.goal_id;
      const { data, error } = await sb.from("habits").insert(row).select(HABIT_FIELDS).single(); err(error);
      return normalizeHabit(data);
    },
    async updateHabit(id, patch) {
      const { data, error } = await sb.from("habits").update(patch).eq("id", id).select(HABIT_FIELDS).single(); err(error);
      return normalizeHabit(data);
    },
    async deleteHabit(id) { const { error } = await sb.from("habits").delete().eq("id", id); err(error); },

    // Trae TODO el historial paginando (Supabase devuelve máx. 1000 filas por request)
    async listCompletions() {
      const out = []; const page = 1000;
      for (let from = 0; ; from += page) {
        const { data, error } = await sb.from("completions").select("habit_id,day").order("day").range(from, from + page - 1);
        err(error); out.push(...data);
        if (data.length < page) break;
      }
      return out;
    },
    async setCompletion(habit_id, day, done) {
      if (done) {
        const { error } = await sb.from("completions").upsert({ habit_id, day }, { onConflict: "habit_id,day", ignoreDuplicates: true }); err(error);
      } else {
        const { error } = await sb.from("completions").delete().eq("habit_id", habit_id).eq("day", day); err(error);
      }
    },

    // ── Metas y pendientes ──
    async listGoals() { const { data, error } = await sb.from("goals").select(GOAL_FIELDS).order("created_at"); err(error); return data.map(normalizeGoal); },
    async createGoal(g) { const { data, error } = await sb.from("goals").insert(g).select(GOAL_FIELDS).single(); err(error); return normalizeGoal(data); },
    async updateGoal(id, patch) { const { data, error } = await sb.from("goals").update(patch).eq("id", id).select(GOAL_FIELDS).single(); err(error); return normalizeGoal(data); },
    async deleteGoal(id) { const { error } = await sb.from("goals").delete().eq("id", id); err(error); },
    async listTasks() { const { data, error } = await sb.from("tasks").select(TASK_FIELDS).order("created_at"); err(error); return data.map(normalizeTask); },
    async createTask(t) { const { data, error } = await sb.from("tasks").insert(t).select(TASK_FIELDS).single(); err(error); return normalizeTask(data); },
    async updateTask(id, patch) { const { data, error } = await sb.from("tasks").update(patch).eq("id", id).select(TASK_FIELDS).single(); err(error); return normalizeTask(data); },
    async deleteTask(id) { const { error } = await sb.from("tasks").delete().eq("id", id); err(error); },

    // ── Perfil ("sobre mí" para el coach) ──
    async getProfile() { const { data, error } = await sb.from("profiles").select("name,about").maybeSingle(); err(error); return data || { name: "", about: "" }; },
    async saveProfile(p) { const { error } = await sb.from("profiles").upsert({ ...p, updated_at: new Date().toISOString() }); err(error); },

    // ── Coach con IA ──
    aiEnabled: true,
    async coach(body) {
      const { data, error } = await sb.functions.invoke("coach", { body: { ...body, today: todayKey() } });
      if (error) {
        let msg = error.message, status = error.context?.status;
        try { const j = await error.context.json(); if (j?.error) msg = j.error; } catch {}
        if (status === 404) msg = "La función del coach todavía no está publicada (ver README → Coach con IA).";
        else if (/failed to send|fetch/i.test(msg)) msg = "No se pudo conectar con el coach. Revisá tu internet.";
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      return data;
    },
    async listCoachMessages() {
      const { data, error } = await sb.from("coach_messages").select("id,role,content,created_at").order("created_at", { ascending: false }).limit(60); err(error);
      return data.reverse();
    },
    async clearCoachMessages() {
      const { data } = await sb.auth.getSession();
      const { error } = await sb.from("coach_messages").delete().eq("user_id", data.session.user.id); err(error);
    },
    async listAnalyses() { const { data, error } = await sb.from("analyses").select(ANALYSIS_FIELDS).order("created_at", { ascending: false }); err(error); return data; },
    async deleteAnalysis(a) {
      if (a.photo_paths?.length) await sb.storage.from("photos").remove(a.photo_paths);
      const { error } = await sb.from("analyses").delete().eq("id", a.id); err(error);
    },
    async uploadPhoto(blob) {
      const { data } = await sb.auth.getSession();
      const path = `${data.session.user.id}/${Date.now()}-${uid().slice(0, 8)}.jpg`;
      const { error } = await sb.storage.from("photos").upload(path, blob, { contentType: "image/jpeg" }); err(error);
      return path;
    },
    async photoUrls(paths) {
      if (!paths?.length) return [];
      const { data, error } = await sb.storage.from("photos").createSignedUrls(paths, 3600); err(error);
      return data.map((d) => d.signedUrl);
    },
  };
}

function translateAuthError(msg = "") {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "Email o contraseña incorrectos.";
  if (m.includes("email not confirmed")) return "Todavía no confirmaste tu email. Revisá tu bandeja de entrada.";
  if (m.includes("already registered")) return "Ese email ya tiene cuenta. Probá iniciar sesión.";
  if (m.includes("password should be")) return "La contraseña tiene que tener al menos 6 caracteres.";
  if (m.includes("rate limit")) return "Demasiados intentos. Esperá un ratito y probá de nuevo.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Sin conexión. Revisá tu internet.";
  return msg || "Algo salió mal.";
}

// ─── Local (localStorage) ───────────────────────────────────────────────
function localStore() {
  const KEY = "habitos-local-v1";
  const empty = () => ({ habits: [], completions: [], goals: [], tasks: [], profile: { name: "", about: "" }, user: null });
  const read = () => { try { return { ...empty(), ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return empty(); } };
  const write = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };
  let authCb = () => {};

  return {
    mode: "local",
    async getUser() { return read().user; },
    onAuthChange(cb) { authCb = cb; },
    async signIn() { const s = read(); s.user = { id: "local", email: "modo local" }; write(s); authCb(s.user); return s.user; },
    async signUp() { return { user: await this.signIn(), needsConfirm: false }; },
    async signOut() { const s = read(); s.user = null; write(s); authCb(null); },

    async listHabits() { return read().habits.map(normalizeHabit); },
    async createHabit(h) {
      const s = read(); const habit = normalizeHabit({ ...h, id: uid(), created_at: new Date().toISOString() });
      s.habits.push(habit); write(s); return habit;
    },
    async updateHabit(id, patch) {
      const s = read(); const i = s.habits.findIndex((h) => h.id === id);
      s.habits[i] = normalizeHabit({ ...s.habits[i], ...patch }); write(s); return s.habits[i];
    },
    async deleteHabit(id) {
      const s = read(); s.habits = s.habits.filter((h) => h.id !== id);
      s.completions = s.completions.filter((c) => c.habit_id !== id); write(s);
    },
    async listCompletions() { return read().completions; },
    async setCompletion(habit_id, day, done) {
      const s = read();
      s.completions = s.completions.filter((c) => !(c.habit_id === habit_id && c.day === day));
      if (done) s.completions.push({ habit_id, day });
      write(s);
    },

    async listGoals() { return read().goals.map(normalizeGoal); },
    async createGoal(g) { const s = read(); const x = normalizeGoal({ ...g, id: uid() }); s.goals.push(x); write(s); return x; },
    async updateGoal(id, patch) { const s = read(); const i = s.goals.findIndex((g) => g.id === id); s.goals[i] = normalizeGoal({ ...s.goals[i], ...patch }); write(s); return s.goals[i]; },
    async deleteGoal(id) {
      const s = read(); s.goals = s.goals.filter((g) => g.id !== id);
      s.tasks.forEach((t) => { if (t.goal_id === id) t.goal_id = null; });
      s.habits.forEach((hb) => { if (hb.goal_id === id) hb.goal_id = null; }); write(s);
    },
    async listTasks() { return read().tasks.map(normalizeTask); },
    async createTask(t) { const s = read(); const x = normalizeTask({ ...t, id: uid() }); s.tasks.push(x); write(s); return x; },
    async updateTask(id, patch) { const s = read(); const i = s.tasks.findIndex((t) => t.id === id); s.tasks[i] = normalizeTask({ ...s.tasks[i], ...patch }); write(s); return s.tasks[i]; },
    async deleteTask(id) { const s = read(); s.tasks = s.tasks.filter((t) => t.id !== id); write(s); },
    async getProfile() { return read().profile; },
    async saveProfile(p) { const s = read(); s.profile = { ...s.profile, ...p }; write(s); },

    aiEnabled: false,
    async coach() { throw new Error(NEEDS_CLOUD); },
    async listCoachMessages() { return []; },
    async clearCoachMessages() {},
    async listAnalyses() { return []; },
    async deleteAnalysis() {},
    async uploadPhoto() { throw new Error(NEEDS_CLOUD); },
    async photoUrls() { return []; },
  };
}

export const store = (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) ? supabaseStore() : localStore();
