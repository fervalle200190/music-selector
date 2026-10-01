/*
 * Instrucciones que se le mandan a la IA para recomendar artistas.
 * Lo usan tanto el navegador (dentro de claude.ai) como la función del servidor (api/recommend.js),
 * así el texto es el mismo en los dos lados.
 */

const list = (arr, empty) => (arr && arr.length ? arr.join(", ") : empty);

function historyText(h = {}) {
  const moods = (h.moods || []).map(([k, v]) => `${k} (${v})`);
  const artists = (h.artists || []).map(([k, v]) => `${k} (${v})`);
  return `Cómo se ha sentido más seguido: ${list(moods, "aún no hay datos")}.
Artistas que más ha abierto en Spotify: ${list(artists, "aún no hay datos")}.
Lo último que escuchó: ${(h.recent || []).length ? h.recent.join("; ") : "nada todavía"}.`;
}

/**
 * kind "discover": 6 artistas nuevos para el swipe, como objetos {name, genre, why}.
 * kind "mood": 3 nombres de artistas para un estado de ánimo.
 */
export function buildPrompt(kind, d) {
  if (kind === "discover") {
    return `Eres una amiga melómana recomendando música a Margarita, una chica venezolana.
Sus álbumes favoritos son "eternal sunshine" de Ariana Grande y "The Tortured Poets Department" de Taylor Swift.
Artistas que le gustan: ${list(d.likes, "Ariana Grande, Taylor Swift")}.
Artistas que NO le llamaron la atención: ${list(d.passed, "ninguno todavía")}.
${historyText(d.history)}

Recomiéndale 6 artistas o bandas reales que probablemente le gusten, basándote sobre todo en los que le gustan y evitando parecerse a los que no.
Puedes incluir algún artista latino o en español si encaja con su gusto.
NO repitas ninguno de estos: ${list(d.exclude, "ninguno")}.

Responde solo con un array JSON de 6 objetos así:
[{"name":"Nombre del artista","genre":"2 o 3 palabras","why":"Una frase en español, tuteándola, de máximo 110 caracteres, que conecte con lo que le gusta"}]
En "why" no inventes datos: si no estás segura de una colaboración o un hecho, describe el estilo en vez de afirmarlo.`;
  }
  if (kind === "mood") {
    return `Recomienda música a Margarita, una chica venezolana. Hoy se siente: "${d.mood}".
Sus favoritos: ${list(d.likes, "Ariana Grande, Taylor Swift")}. No le gustaron: ${list(d.passed, "ninguno todavía")}.
${historyText(d.history)}
Dame 3 artistas o bandas reales que encajen con ese estado de ánimo y con su gusto. No repitas: ${list(d.exclude, "ninguno")}.
Responde solo con un array JSON de 3 nombres, por ejemplo ["Artista 1","Artista 2","Artista 3"].`;
  }
  throw new Error("Tipo de recomendación desconocido");
}
