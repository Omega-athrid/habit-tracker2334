# Hábitos 🌱

PWA de hábitos con estética cálida y minimalista: lista del día, calendario con progreso y rachas.

## Qué hace

- **Hoy** (página principal): tus hábitos del día. **Deslizá a la derecha** para marcarlos como cumplidos (se ponen grises y bajan al final). Deslizá de nuevo para deshacer. **Mantené apretado** para editar o eliminar.
- **Calendario**: cada día tiene un anillo que se llena según lo que cumpliste (lleno en naranja = día perfecto). Tocá un día y se despliega su lista; podés corregir días pasados, los futuros son solo lectura.
- **Rachas** 🔥 por hábito, sonidos sintetizados tipo "logro", confeti cuando completás el día, modo claro/oscuro/automático.
- Hábitos **diarios** por defecto o en **días específicos** (L M M J V S D), con fecha de inicio editable.
- Íconos: cuadrado redondeado de color + emoji o ícono en blanco/negro.

## Puesta en marcha

### 1. Supabase (login + base de datos, gratis)

1. Creá una cuenta en [supabase.com](https://supabase.com) → **New project**.
2. En el proyecto: **SQL Editor → New query**, pegá todo `supabase/schema.sql` y dale **Run**.
3. **Project Settings → API**: copiá la **Project URL** y la **anon public key** en `js/config.js`.
4. (Opcional, recomendado para uso personal) **Authentication → Sign In / Providers → Email**: desactivá *Confirm email* para entrar sin confirmar por mail.
5. Cuando tengas la URL pública (paso 2), cargala en **Authentication → URL Configuration → Site URL**.

> Sin configurar Supabase la app funciona en **modo local** (datos solo en ese dispositivo).

### 2. Publicarla (GitHub Pages)

En el repo: **Settings → Pages → Source: Deploy from a branch**, elegí la rama y la carpeta `/ (root)`. En un minuto queda en `https://<usuario>.github.io/<repo>/`.

### 3. Instalarla en el celu (Android)

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
| `js/store.js` | Datos: Supabase o localStorage |
| `js/sound.js` | Sonidos con Web Audio |
| `js/icons.js` | Íconos [Lucide](https://lucide.dev) (ISC) |
| `supabase/schema.sql` | Tablas + seguridad por usuario (RLS) |
