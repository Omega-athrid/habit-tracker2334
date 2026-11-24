// Vista "Coach": charla con la IA + análisis de fotos.
import { esc, h, toast, armDelete, richText } from "./kit.js";
import { sfx } from "./sound.js";
import { ui } from "./icons.js";
import { longDate } from "./dates.js";
import { AREAS } from "./goals.js";

export function renderCoach(main, ctx) {
  const { S } = ctx;
  S.coachTab ||= "chat";
  main.classList.add("coach-view");
  main.append(h(`
    <header class="head">
      <div><div class="eyebrow">Tu socio de progreso</div><h1 class="title">Coach</h1></div>
      <div class="seg coach-seg">
        <button data-t="chat" class="${S.coachTab === "chat" ? "on" : ""}">Charla</button>
        <button data-t="analysis" class="${S.coachTab === "analysis" ? "on" : ""}">Análisis</button>
      </div>
    </header>`));
  const body = h(`<div class="coach-body"></div>`);
  main.append(body);
  main.querySelectorAll(".coach-seg button").forEach((b) => b.onclick = () => {
    if (S.coachTab === b.dataset.t) return;
    sfx.tap(); S.coachTab = b.dataset.t; S.viewingAnalysis = null;
    main.querySelectorAll(".coach-seg button").forEach((x) => x.classList.toggle("on", x === b));
    show();
  });

  function show() {
    document.querySelector(".composer")?.remove();
    body.innerHTML = "";
    if (!ctx.store.aiEnabled) {
      body.append(h(`<div class="empty"><div class="empty-mark">✨</div><h3>El coach necesita la nube</h3><p>Estás en modo local. Configurá Supabase (ver README) para usar la IA.</p></div>`));
      return;
    }
    if (S.coachTab === "chat") renderChat(body, ctx);
    else if (S.viewingAnalysis) renderAnalysis(body, ctx, S.viewingAnalysis, show);
    else renderAnalysisHome(body, ctx, show);
  }
  show();
}

// ═══ CHARLA ════════════════════════════════════════════════════════════
const STARTERS = [
  ["☀️ Arrancá mi día", { morning: true }],
  ["¿En qué me enfoco hoy?", "¿En qué me conviene enfocarme hoy?"],
  ["¿Cómo vengo?", "¿Cómo vengo con mis hábitos estas dos semanas? Sé honesto."],
  ["Armame un plan", "Ayudame a armar un plan para mi meta principal: bajala a pasos concretos y anotalos."],
];

function renderChat(body, ctx) {
  const { S } = ctx;
  const list = h(`<div class="chat"></div>`);
  body.append(list);

  const composer = h(`
    <form class="composer" autocomplete="off">
      <textarea rows="1" maxlength="4000" placeholder="Escribile a tu coach…" enterkeyhint="send"></textarea>
      <button type="submit" aria-label="Enviar">${ui("send", 20, 2.2)}</button>
    </form>`);
  document.body.append(composer);
  const ta = composer.querySelector("textarea"), sendBtn = composer.querySelector("button");
  const grow = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 140) + "px"; };
  ta.oninput = grow;
  ta.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey && matchMedia("(pointer: fine)").matches) { e.preventDefault(); composer.requestSubmit(); } };

  let busy = false;
  const scrollEnd = () => requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));
  const bubble = (role, text, animate = true) => {
    const el = h(`<div class="msg ${role}"><div class="bubble">${role === "assistant" ? richText(text) : esc(text).replace(/\n/g, "<br>")}</div></div>`);
    list.append(el);
    if (animate) el.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 300, easing: "cubic-bezier(.2,.8,.2,1)" });
    return el;
  };

  function paint() {
    list.innerHTML = "";
    if (!S.chat.length) {
      const intro = h(`
        <div class="chat-intro">
          <div class="coach-avatar">✨</div>
          <p>Soy tu coach. Conozco tus hábitos, metas y pendientes, así que podés pedirme cosas concretas: <i>“anotame que mañana tengo que llamar al proveedor”</i>, <i>“armame un plan para mi meta”</i> o simplemente contarme cómo estás.</p>
          <p class="muted small">Tip: en Ajustes → <b>Sobre vos</b> contale quién sos y a dónde vas. Mientras más sepa, mejor te ayuda.</p>
          <div class="starters">${STARTERS.map(([l], i) => `<button class="chip" data-i="${i}">${l}</button>`).join("")}</div>
        </div>`);
      intro.querySelectorAll("[data-i]").forEach((b) => b.onclick = () => {
        const v = STARTERS[+b.dataset.i][1];
        typeof v === "string" ? send(v) : send("", true);
      });
      list.append(intro);
    } else {
      S.chat.forEach((m) => bubble(m.role, m.content, false));
      const tools = h(`<div class="chat-tools"><button class="chip" data-morning>☀️ Buen día</button><button class="chip ghost" data-clear>${ui("rotate-ccw", 14)} Nueva charla</button></div>`);
      tools.querySelector("[data-morning]").onclick = () => send("", true);
      const clear = tools.querySelector("[data-clear]");
      armDelete(clear, "Nueva charla", async () => {
        await ctx.store.clearCoachMessages(); S.chat = []; sfx.remove(); paint();
      });
      list.prepend(tools);
    }
    window.scrollTo({ top: document.body.scrollHeight });
  }

  async function send(text, morning = false) {
    if (busy) return;
    text = (text || "").trim();
    if (!text && !morning) return;
    busy = true; sendBtn.disabled = true;
    if (!S.chat.length) list.innerHTML = "";
    const shown = morning ? "☀️ Buen día" : text;
    S.chat.push({ role: "user", content: shown });
    bubble("user", shown); sfx.tap();
    const typing = h(`<div class="msg assistant"><div class="bubble typing"><i></i><i></i><i></i></div></div>`);
    list.append(typing); scrollEnd();
    try {
      const r = await ctx.store.coach({ action: "chat", message: text, morning });
      typing.remove();
      S.chat.push({ role: "assistant", content: r.reply });
      bubble("assistant", r.reply); sfx.open();
      if (r.changed) { await ctx.reload(); toast("Actualicé tus datos ✓"); }
    } catch (e) {
      typing.remove(); S.chat.pop(); list.lastElementChild?.remove();
      if (!morning) { ta.value = text; grow(); }
      if (!S.chat.length) paint();
      toast(e.message);
    }
    busy = false; sendBtn.disabled = false; scrollEnd();
  }

  composer.onsubmit = (e) => { e.preventDefault(); const v = ta.value; ta.value = ""; grow(); send(v); };

  if (S.chat) paint();
  else {
    list.innerHTML = `<div class="loading-line">Cargando charla…</div>`;
    ctx.store.listCoachMessages().then((m) => { S.chat = m; paint(); }).catch((e) => { S.chat = []; paint(); toast(e.message); });
  }
}

// ═══ ANÁLISIS DE FOTOS ═════════════════════════════════════════════════
const SLOTS = [
  ["Cara de frente", "🙂"], ["Cara de perfil", "👤"], ["Cuerpo de frente", "🧍"], ["Cuerpo de costado", "🚶"],
];

// Achica la foto en el celular antes de mandarla (más rápido y más barato)
async function toJpeg(file, max = 1280) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("No pude leer esa imagen")); i.src = url; });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob(res, "image/jpeg", 0.85));
  } finally { URL.revokeObjectURL(url); }
}
const toBase64 = (blob) => new Promise((res, rej) => {
  const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(blob);
});

function renderAnalysisHome(body, ctx, show) {
  const { S } = ctx;
  S.photoDraft ||= { blobs: [null, null, null, null], notes: "", save: false };
  const d = S.photoDraft;
  const card = h(`
    <div class="analysis-new">
      <p class="analysis-lead">Sacate unas fotos y te armo un <b>plan de mejora</b>: qué cambiar, cómo, en cuánto tiempo se nota y qué impacto tiene. Sin puntajes, sin humo.</p>
      <div class="slots">
        ${SLOTS.map(([l, e], i) => `
          <label class="slot" data-i="${i}">
            <input type="file" accept="image/*" hidden>
            <span class="slot-empty"><span class="slot-emoji">${e}</span>${l}</span>
            <img alt="${l}" hidden>
            <button class="slot-x" type="button" aria-label="Quitar" hidden>${ui("x", 14, 2.6)}</button>
          </label>`).join("")}
      </div>
      <p class="muted small">Con 1 foto alcanza; con 4 es mucho mejor. Luz de frente (ventana), sin filtro, cara relajada. Para el cuerpo, ropa ajustada o short.</p>
      <textarea class="input" rows="3" maxlength="1000" placeholder="Contame algo (opcional): edad, altura, peso, si entrenás, qué te gustaría mejorar…"></textarea>
      <button class="row save-toggle" type="button">${ui("shield-check", 20)}<div class="grow">Guardar fotos para ver mi progreso<small>Quedan privadas en tu cuenta. Si no, se analizan y no se guardan.</small></div><span class="switch ${d.save ? "on" : ""}"></span></button>
      <button class="btn btn-primary" data-go disabled>${ui("sparkles", 20)} Analizar</button>
    </div>`);
  body.append(card);

  const ta = card.querySelector("textarea"); ta.value = d.notes; ta.oninput = () => (d.notes = ta.value);
  const go = card.querySelector("[data-go]");
  const sync = () => { go.disabled = !d.blobs.some(Boolean); };
  card.querySelectorAll(".slot").forEach((slot) => {
    const i = +slot.dataset.i, input = slot.querySelector("input"), img = slot.querySelector("img"), x = slot.querySelector(".slot-x");
    const paintSlot = () => {
      const b = d.blobs[i];
      if (img.src) URL.revokeObjectURL(img.src);
      img.hidden = !b; x.hidden = !b; slot.classList.toggle("filled", !!b);
      if (b) img.src = URL.createObjectURL(b); else img.removeAttribute("src");
      sync();
    };
    input.onchange = async () => {
      const f = input.files[0]; input.value = ""; if (!f) return;
      try { d.blobs[i] = await toJpeg(f); sfx.tap(); paintSlot(); } catch (e) { toast(e.message); }
    };
    x.onclick = (e) => { e.preventDefault(); d.blobs[i] = null; sfx.undo(); paintSlot(); };
    paintSlot();
  });
  const tog = card.querySelector(".save-toggle");
  tog.onclick = () => { d.save = !d.save; sfx.tap(); tog.querySelector(".switch").classList.toggle("on", d.save); };

  go.onclick = async () => {
    const picked = d.blobs.map((b, i) => [b, SLOTS[i][0]]).filter(([b]) => b);
    go.disabled = true;
    const loading = h(`<div class="analyzing"><div class="scan"></div><b>Analizando tus fotos…</b><span>Puede tardar hasta un minuto. No cierres la app.</span></div>`);
    card.replaceWith(loading);
    try {
      const images = await Promise.all(picked.map(async ([b, label]) => ({ label, data: await toBase64(b) })));
      const photo_paths = d.save ? await Promise.all(picked.map(([b]) => ctx.store.uploadPhoto(b))) : [];
      const { analysis } = await ctx.store.coach({ action: "analyze", images, notes: d.notes, photo_paths });
      S.analyses = [analysis, ...(S.analyses || [])];
      S.photoDraft = null; S.viewingAnalysis = analysis;
      sfx.allDone(); show(); window.scrollTo({ top: 0 });
    } catch (e) {
      toast(e.message); show();
    }
  };

  // Historial
  const hist = h(`<div class="analysis-history"></div>`);
  body.append(hist);
  const paintHist = () => {
    const list = S.analyses || [];
    hist.innerHTML = list.length ? `<div class="section-label">Análisis anteriores</div>` + list.map((a, i) => `
      <button class="hist-item" data-i="${i}">
        <div><b>${longDate(a.created_at.slice(0, 10))}</b><span>${esc((a.result?.summary || "").slice(0, 110))}…</span></div>
        ${ui("chevron-right", 18)}
      </button>`).join("") : "";
    hist.querySelectorAll(".hist-item").forEach((b) => b.onclick = () => { sfx.open(); S.viewingAnalysis = S.analyses[+b.dataset.i]; show(); window.scrollTo({ top: 0 }); });
  };
  if (S.analyses) paintHist();
  else ctx.store.listAnalyses().then((a) => { S.analyses = a; paintHist(); }).catch(() => {});
}

const IMPACT = { alto: "Impacto alto", medio: "Impacto medio", bajo: "Impacto bajo" };
const EFFORT = { bajo: "esfuerzo bajo", medio: "esfuerzo medio", alto: "esfuerzo alto" };
const AREA_TO_GOAL = { piel: "cara", pelo: "cara", cara: "cara", estilo: "cara", cuerpo: "cuerpo", postura: "cuerpo", salud: "cuerpo" };

function renderAnalysis(body, ctx, a, show) {
  const { S } = ctx;
  const r = a.result || {};
  const habitExists = (name) => S.habits.some((hb) => hb.name.toLowerCase() === String(name).toLowerCase());
  const el = h(`
    <div class="analysis">
      <button class="back" data-back>${ui("arrow-left", 18)} Volver</button>
      <div class="an-date">${longDate(a.created_at.slice(0, 10))}</div>
      <div class="an-photos"></div>
      <div class="card an-card"><div class="an-label">Tu punto de partida</div><p>${esc(r.summary)}</p>
        ${r.progress_note ? `<p class="an-progress">📈 ${esc(r.progress_note)}</p>` : ""}
        ${r.strengths?.length ? `<div class="an-strengths">${r.strengths.map((s) => `<span class="chip static">✓ ${esc(s)}</span>`).join("")}</div>` : ""}
      </div>
      <div class="section-label">Qué mejorar · de más a menos impacto</div>
      ${(r.priorities || []).map((p, i) => `
        <div class="card prio" data-i="${i}">
          <div class="prio-head"><span class="prio-n">${i + 1}</span><h3>${esc(p.title)}</h3></div>
          <div class="prio-tags"><span class="tag imp-${p.impact}">${IMPACT[p.impact] || p.impact}</span><span class="tag">${EFFORT[p.effort] || p.effort}</span><span class="tag">⏱ ${esc(p.timeframe)}</span></div>
          <p class="prio-why">${esc(p.why)}</p>
          <ol class="prio-how">${(p.how || []).map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
          ${p.habits?.length ? `<div class="prio-habits">${p.habits.map((hb, j) => `
            <button class="habit-sug ${habitExists(hb.name) ? "added" : ""}" data-j="${j}">
              <span class="sug-emoji">${esc(hb.emoji)}</span><span class="grow">${esc(hb.name)}<small>${esc(hb.frequency)}</small></span>
              <span class="sug-act">${habitExists(hb.name) ? "✓ En tus hábitos" : `${ui("circle-plus", 18)} Sumar`}</span>
            </button>`).join("")}</div>` : ""}
          <button class="link prio-goal" data-goal>🎯 Convertir en meta</button>
        </div>`).join("")}
      ${r.myths?.length ? `<div class="card an-card warn"><div class="an-label">Lo que no te conviene</div><ul>${r.myths.map((m) => `<li>${esc(m)}</li>`).join("")}</ul></div>` : ""}
      ${r.see_professional?.length ? `<div class="card an-card"><div class="an-label">Consultá con un profesional</div><ul>${r.see_professional.map((m) => `<li>${esc(m)}</li>`).join("")}</ul></div>` : ""}
      ${r.photo_tips ? `<p class="muted small an-tip">📸 Para la próxima: ${esc(r.photo_tips)}</p>` : ""}
      <p class="muted small an-tip">Repetí el análisis cada 6-8 semanas con fotos parecidas para comparar. Mirarte todos los días no sirve: los cambios son lentos.</p>
      <button class="btn btn-danger" data-del>${ui("trash-2", 18)} Borrar este análisis</button>
    </div>`);
  body.append(el);

  el.querySelector("[data-back]").onclick = () => { sfx.close(); S.viewingAnalysis = null; show(); };

  if (a.photo_paths?.length) {
    ctx.store.photoUrls(a.photo_paths).then((urls) => {
      el.querySelector(".an-photos").innerHTML = urls.map((u) => `<img src="${esc(u)}" alt="">`).join("");
    }).catch(() => {});
  }

  el.querySelectorAll(".prio").forEach((card) => {
    const p = r.priorities[+card.dataset.i];
    card.querySelectorAll(".habit-sug").forEach((b) => b.onclick = async () => {
      if (b.classList.contains("added")) return;
      const sug = p.habits[+b.dataset.j];
      b.disabled = true;
      try {
        await ctx.addHabit(sug);
        b.classList.add("added"); b.querySelector(".sug-act").textContent = "✓ En tus hábitos";
        sfx.complete(); toast(`“${sug.name}” sumado a tus hábitos`);
      } catch (e) { toast("Error: " + e.message); }
      b.disabled = false;
    });
    card.querySelector("[data-goal]").onclick = async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      try {
        const goal = await ctx.store.createGoal({ title: p.title.slice(0, 80), why: p.why.slice(0, 500), area: AREA_TO_GOAL[p.area] || "otro" });
        S.goals.push(goal);
        for (const sug of p.habits || []) {
          const ex = S.habits.find((hb) => hb.name.toLowerCase() === sug.name.toLowerCase());
          if (!ex) await ctx.addHabit({ ...sug, goal_id: goal.id });
        }
        btn.textContent = `✓ Meta creada ${AREAS[goal.area]?.e || ""}`;
        card.querySelectorAll(".habit-sug").forEach((x) => { x.classList.add("added"); x.querySelector(".sug-act").textContent = "✓ En tus hábitos"; });
        sfx.save(); toast("Meta creada con sus hábitos 🎯");
      } catch (err) { toast("Error: " + err.message); btn.disabled = false; }
    };
  });

  armDelete(el.querySelector("[data-del]"), "Borrar este análisis", async () => {
    await ctx.store.deleteAnalysis(a);
    S.analyses = (S.analyses || []).filter((x) => x.id !== a.id);
    S.viewingAnalysis = null; sfx.remove(); toast("Análisis borrado"); show();
  });
}
