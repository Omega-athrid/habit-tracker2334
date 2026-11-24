# Hábitos 🌱

PWA de desarrollo personal: hábitos con calendario y rachas, metas y pendientes, y un **coach con IA (Claude)** que te conoce, te habla y analiza tus fotos para armarte un plan de mejora.

## Qué hace

- **Hoy** (página principal): tus hábitos del día. **Deslizá a la derecha** para marcarlos como cumplidos (se ponen grises y bajan al final). Deslizá de nuevo para deshacer. **Mantené apretado** para editar o eliminar.
- **Calendario**: cada día tiene un anillo que se llena según lo que cumpliste (lleno en naranja = día perfecto). Tocá un día y se despliega su lista; podés corregir días pasados, los futuros son solo lectura.
- **Rachas** 🔥 por hábito, sonidos sintetizados tipo "logro", confeti cuando completás el día, modo claro/oscuro/automático.
- Hábitos **diarios** por defecto o en **días específicos** (L M M J V S D), con fecha de inicio editable.
- Íconos: cuadrado redondeado de color + emoji o ícono en blanco/negro.
- **Metas**: pendientes con fecha (anotá rápido arriba, tocá el círculo para tacharlos) y metas por área con progreso (tareas + constancia de los hábitos asociados).
- **Coach** ✨:
  - **Charla**: conoce tus hábitos, rachas, metas y pendientes. Le podés pedir “anotame que mañana tengo que…”, “armame un plan para mi meta” o “¿cómo vengo?”, y **crea las tareas, metas y hábitos solo**. El botón ☀️ *Buen día* arranca la charla de la mañana.
  - **Análisis**: subís hasta 4 fotos (cara y cuerpo) y te devuelve tu punto de partida, qué mejorar ordenado por impacto, cómo hacerlo, en cuánto tiempo se nota, mitos a evitar y hábitos para sumar con un toque. Sin puntajes de “atractivo”. Las fotos solo se guardan si lo activás (en un bucket privado).
- **Ajustes → Sobre vos**: lo que le contás acá lo usa el coach para conocerte.

## Puesta en marcha

### 1. Supabase (login + base de datos, gratis)

1. Creá una cuenta en [supabase.com](https://supabase.com) → **New project**.
2. En el proyecto: **SQL Editor → New query**, pegá todo `supabase/schema.sql` y dale **Run**.
3. **Project Settings → API**: copiá la **Project URL** y la **anon public key** en `js/config.js`.
4. (Opcional, recomendado para uso personal) **Authentication → Sign In / Providers → Email**: desactivá *Confirm email* para entrar sin confirmar por mail.
5. Cuando tengas la URL pública (paso 2), cargala en **Authentication → URL Configuration → Site URL**.

> Sin configurar Supabase la app funciona en **modo local** (datos solo en ese dispositivo).

> **¿Ya tenías la app andando?** Volvé a correr **todo** `supabase/schema.sql` (es seguro: no borra nada). Agrega las tablas de metas, pendientes, coach y el bucket privado de fotos.

### 2. Coach con IA (Claude)

La IA corre en una **Edge Function** de Supabase, así la API key nunca llega al celular.

1. Sacá una API key en [console.anthropic.com](https://console.anthropic.com) → **API Keys**. Ya que estás, en **Billing → Limits** poné un límite de gasto mensual (ej. USD 10).
2. En Supabase: **Edge Functions → Secrets** → agregá:
   - `ANTHROPIC_API_KEY` = tu key.
   - `ALLOWED_EMAILS` = los emails que pueden usar el coach, separados por coma (ej. `vos@mail.com,amigo@mail.com`). **Recomendado**: si no lo ponés, cualquiera que cree una cuenta en tu app gasta tus créditos.
   - (Opcional) `COACH_MODEL` para cambiar de modelo. Por defecto usa `claude-opus-5-5`.
3. **Edge Functions → Deploy a new function → Via Editor**. Nombre: `coach`. Pegá todo `supabase/functions/coach/index.ts` y deployá.
4. En la función → **Details / Settings**: desactivá **Verify JWT** (la función ya valida la sesión del usuario por su cuenta).

Con la CLI es lo mismo en dos comandos:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-... ALLOWED_EMAILS=vos@mail.com
supabase functions deploy coach --no-verify-jwt
```

**Costo aproximado** (Opus 5.5): una charla corta, unos pocos centavos de dólar; un análisis de 4 fotos, alrededor de USD 0,10.

### 3. Publicarla (GitHub Pages)

En el repo: **Settings → Pages → Source: Deploy from a branch**, elegí la rama y la carpeta `/ (root)`. En un minuto queda en `https://<usuario>.github.io/<repo>/`.

### 4. Instalarla en el celu (Android)

Abrí la URL en Chrome → menú ⋮ → **Instalar app** / **Agregar a la pantalla principal**.

## Desarrollo

Sin build: HTML + CSS + JS (módulos ES). Para probar local:

```bash
python3 -m http.server 8000
# abrir http://localhost:8000
```

Si cambiás archivos, subí `VERSION` en `sw.js` para que los celulares bajen la versión nueva.

| Archivo | Qué tiene |
|---|---|
| `js/app.js` | Vistas, gestos, calendario, editor |
| `js/goals.js` | Metas y pendientes |
| `js/coach.js` | Charla con el coach y análisis de fotos |
| `js/kit.js` | Utilidades de interfaz compartidas |
| `js/store.js` | Datos: Supabase o localStorage |
| `supabase/functions/coach/index.ts` | Edge Function con Claude (chat + análisis) |
| `js/sound.js` | Sonidos con Web Audio |
| `js/icons.js` | Íconos [Lucide](https://lucide.dev) (ISC) |
| `supabase/schema.sql` | Tablas + seguridad por usuario (RLS) |
