// Utilidades de interfaz compartidas por todas las vistas.
import { sfx } from "./sound.js";
import { ui } from "./icons.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const h = (html) => { const t = document.createElement("div"); t.innerHTML = html.trim(); return t.firstElementChild; };

let toastTimer;
export function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) { el = h(`<div class="toast" role="status"></div>`); document.body.append(el); }
  el.textContent = msg;
  requestAnimationFrame(() => el.classList.add("in"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("in"), 2600);
}

// Hoja inferior genérica. Devuelve { sheet, close }.
export function openSheet(title, bodyHTML, { onClose } = {}) {
  if (document.querySelector(".sheet")) return null;
  sfx.open();
  const back = h(`<div class="sheet-backdrop"></div>`);
  const sheet = h(`
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grab"></div>
      <div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Cerrar">${ui("x", 20)}</button></div>
      ${bodyHTML}
    </div>`);
  document.body.append(back, sheet);
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => { back.classList.add("in"); sheet.classList.add("in"); });
  const onKey = (e) => { if (e.key === "Escape") close(); };
  let closed = false;
  function close() {
    if (closed) return; closed = true;
    sfx.close(); back.classList.remove("in"); sheet.classList.remove("in");
    document.body.style.overflow = ""; document.removeEventListener("keydown", onKey);
    setTimeout(() => { back.remove(); sheet.remove(); }, 450);
    onClose?.();
  }
  document.addEventListener("keydown", onKey);
  back.onclick = close;
  sheet.querySelector("[data-close]").onclick = close;
  return { sheet, close };
}

// Botón de borrar con doble toque para confirmar
export function armDelete(btn, label, action) {
  let armed = false, t;
  btn.onclick = async () => {
    if (!armed) {
      armed = true; btn.classList.add("confirm"); btn.innerHTML = `${ui("trash-2", 18)} Tocá de nuevo para confirmar`; sfx.arm();
      t = setTimeout(() => { armed = false; btn.classList.remove("confirm"); btn.innerHTML = `${ui("trash-2", 18)} ${label}`; }, 3000);
      return;
    }
    clearTimeout(t); btn.disabled = true;
    try { await action(); } catch (e) { toast("Error: " + e.message); btn.disabled = false; }
  };
}

// Texto del coach → HTML seguro (negritas, cursivas y saltos de línea)
export function richText(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<i>$2</i>")
    .replace(/^\s*[-•]\s+/gm, "• ")
    .replace(/\n/g, "<br>");
}
