# La radio de Margarita

Página web que recomienda una canción según cómo te sientes y la abre directo en Spotify. Hecha con [Astro](https://astro.build).

## Qué hace

- **Estado de ánimo:** eliges uno de 10 ánimos o lo escribes con tus palabras ("me siento exhausta", "ando ladilla") y te sale una canción de Ariana Grande o Taylor Swift con un botón para abrirla en Spotify.
- **Primera vez:** un swipe de artistas parecidos (derecha = me gusta, izquierda = paso) para armar tu lista.
- **Tus artistas:** puedes agregar o quitar artistas; sus canciones entran en las recomendaciones.
- **Artistas según el ánimo:** sugerencias de artistas que encajan con cómo te sientes.
- **Historial:** guarda los ánimos y las canciones que abres, y evita repetir las últimas.
- **Modo noche:** rosados oscuros con una transición animada.

Todo lo que la persona elige se guarda en `localStorage` de su navegador. No hay servidor ni base de datos.

### Recomendaciones con IA

Los botones "✨ Recomiéndame más" y "✨ Buscar otros para este ánimo" piden artistas nuevos a Claude:

- **En Vercel:** la página llama a la función `api/recommend.js`, que usa la API de Claude con la key guardada en el servidor.
- **Dentro de claude.ai:** usa la cuenta de Claude de quien abre la página.
- **En GitHub Pages:** no hay servidor, así que esos botones no aparecen y el resto de la página funciona igual.

Las instrucciones que recibe la IA están en `src/lib/prompts.js`. La función solo acepta listas cortas de nombres (nunca texto libre) y limita cuántas veces se puede usar por minuto, para que nadie la use como una API gratis.

## Publicar en Vercel (con IA)

1. En [vercel.com](https://vercel.com) importa este repo. Detecta Astro solo, no hay que cambiar nada del build.
2. En **Settings → Environment Variables** agrega:
   - `ANTHROPIC_API_KEY`: tu key de [console.anthropic.com](https://console.anthropic.com).
   - `ANTHROPIC_MODEL` (opcional): el modelo a usar. Por defecto `claude-haiku-4-5-20251001`, rápido y barato para esto.
3. Vuelve a desplegar para que tome la variable.

## Desarrollo

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # genera ./dist
npm run preview  # sirve ./dist
```

## Vista previa al compartir

Al compartir el link (WhatsApp, Instagram, iMessage…) aparece `public/og.png`: el disco con el texto "Para mi Margarita". Esa imagen necesita la dirección completa del sitio:

- **GitHub Pages:** se detecta sola con el workflow `.github/workflows/deploy.yml`.
- **Vercel o Netlify:** se detecta sola al desplegar.
- **Otro hosting:** define la variable `SITE_URL` al construir, por ejemplo `SITE_URL=https://tu-dominio.com npm run build`.

## Publicar en GitHub Pages

1. En el repo, ve a **Settings → Pages** y en **Source** elige **GitHub Actions**.
2. Cada push a `main` construye y publica el sitio en `https://fervalle200190.github.io/music-selector/`.

## Estructura

```
src/
  pages/index.astro        página principal
  layouts/Layout.astro     <head>, fuentes y estilos globales
  components/              piezas de la interfaz (reproductor, swipe, historial, fondo…)
  data/                    ánimos y canciones, artistas del swipe, artistas por ánimo
  scripts/app.js           toda la lógica del lado del cliente
  styles/global.css        paleta, tipografía, animaciones y modo noche
```

Para cambiar canciones o ánimos, edita `src/data/moods.js`.
