// @ts-check
import { defineConfig } from 'astro/config';

// La imagen al compartir (og.png) necesita la dirección completa del sitio.
// Se detecta según dónde se construya:
//  - SITE_URL (y BASE_PATH) si los defines tú
//  - GitHub Pages: https://<usuario>.github.io/<repo>/
//  - Vercel y Netlify: sus variables de despliegue
const [ghOwner, ghRepo] = (process.env.GITHUB_REPOSITORY || '').split('/');
const onGitHubPages = process.env.GITHUB_ACTIONS === 'true' && ghOwner && ghRepo;

const site =
  process.env.SITE_URL ||
  (onGitHubPages ? `https://${ghOwner}.github.io` : undefined) ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
  process.env.URL ||
  undefined;

const base = process.env.BASE_PATH || (onGitHubPages && !process.env.SITE_URL ? `/${ghRepo}` : undefined);

export default defineConfig({ site, base });
