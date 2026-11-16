// Utilidades de fecha en hora LOCAL (nada de UTC, para que "hoy" sea tu hoy).
export const pad = (n) => String(n).padStart(2, "0");
export const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
export const todayKey = () => toKey(new Date());
export const addDays = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); };
export const weekday = (k) => fromKey(k).getDay(); // 0 = domingo

export const MONTHS = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
export const WEEKDAYS = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
// Orden de la semana arrancando en lunes, con índice de getDay()
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const WEEK_SHORT = { 1: "L", 2: "M", 3: "M", 4: "J", 5: "V", 6: "S", 0: "D" };

export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export function longDate(k) {
  const d = fromKey(k);
  return `${cap(WEEKDAYS[d.getDay()])} ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}
export function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "Buenas noches";
  if (h < 13) return "Buen día";
  if (h < 20) return "Buenas tardes";
  return "Buenas noches";
}
