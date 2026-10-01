// @ts-check
import { defineConfig } from 'astro/config';

// URL pública del sitio: la imagen al compartir (og.png) necesita una dirección completa.
// Se toma de SITE_URL, o de las variables que ponen Vercel y Netlify al desplegar.
const site =
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
  process.env.URL ||
  undefined;

export default defineConfig({ site });
