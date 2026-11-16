// Capa de datos: Supabase si está configurado, si no localStorage ("modo local").
// Ambos backends exponen la misma API para que la app no sepa cuál usa.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { todayKey } from "./dates.js";

const uid = () => (crypto.randomUUID ? crypto.randomUUID() :
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  }));

const HABIT_FIELDS = "id,name,icon_type,icon,icon_color,color,days,start_date,created_at";

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
    created_at: h.created_at || new Date().toISOString(),
  };
}

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

    async listHabits() {
      const { data, error } = await sb.from("habits").select(HABIT_FIELDS).order("created_at"); err(error);
      return data.map(normalizeHabit);
    },
    async createHabit(h) {
      const { data, error } = await sb.from("habits").insert(h).select(HABIT_FIELDS).single(); err(error);
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
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { habits: [], completions: [], user: null }; } catch { return { habits: [], completions: [], user: null }; } };
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
  };
}

export const store = (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) ? supabaseStore() : localStore();
