import { A, T, MOODS } from '../data/moods.js';
import { DISCOVER } from '../data/discover.js';
import { MOOD_ARTISTS } from '../data/moodArtists.js';
import { buildPrompt } from '../lib/prompts.js';
/* Limpia datos de versiones de prueba anteriores */
try { localStorage.removeItem("radio-margarita-historial"); localStorage.removeItem("radio-margarita-sugeridos"); localStorage.removeItem("radio-margarita-artistas"); localStorage.removeItem("radio-margarita-intro-v1"); localStorage.removeItem("radio-margarita-pasados"); localStorage.removeItem("radio-margarita-noche"); } catch(e){}

/* ---------- Historial guardado en su teléfono ---------- */
const HIST_KEY = "rmarg2-historial", SUG_KEY = "rmarg2-sugeridos";
let hist = { moods: [], plays: [] };
try { const h = JSON.parse(localStorage.getItem(HIST_KEY) || "null"); if(h && Array.isArray(h.moods) && Array.isArray(h.plays)) hist = h; } catch(e){}
function saveHist(){ try { hist.moods = hist.moods.slice(-200); hist.plays = hist.plays.slice(-200); localStorage.setItem(HIST_KEY, JSON.stringify(hist)); } catch(e){} }
function recordMood(key, text){ hist.moods.push({ k:key, s:text || "", t:Date.now() }); saveHist(); if(typeof renderHistory==="function") renderHistory(); }
function recordPlay(song, artist, key){ hist.plays.push({ song, artist, k:key, t:Date.now() }); saveHist(); if(typeof renderHistory==="function") renderHistory(); }
function topCounts(arr, f, n){
  const c = {}; arr.forEach(x=>{ const k=f(x); if(k) c[k]=(c[k]||0)+1; });
  return Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,n);
}
function histData(){
  return {
    moods: topCounts(hist.moods, m=>MOODS[m.k] && MOODS[m.k].label.toLowerCase(), 3),
    artists: topCounts(hist.plays, p=>p.artist, 5),
    recent: hist.plays.slice(-6).map(p=>p.song+" de "+p.artist)
  };
}

const chipsEl = document.getElementById("chips");
const $ = (id) => document.getElementById(id);
const els = { label:$("npLabel"), song:$("npSong"), artist:$("npArtist"), why:$("npWhy"), link:$("spotify"), vinyl:$("vinyl"), hint:$("hint") };
let current = null, idx = 0;

Object.entries(MOODS).forEach(([key,m])=>{
  const b = document.createElement("button");
  b.type="button"; b.className="chip"; b.id="chip-"+key; b.setAttribute("aria-pressed","false");
  b.innerHTML = `<b>${m.label}</b><span>${m.sub}</span>`;
  b.addEventListener("click",()=>{ pick(key,true); recordMood(key,""); });
  chipsEl.appendChild(b);
});

function spotifyUrl(q){ return "https://open.spotify.com/search/" + encodeURIComponent(q); }

/* Artistas que ella agrega: se guardan en su navegador */
const FIXED = [A, T];
const TERMS = {feliz:"feliz",enamorada:"amor",triste:"triste",ansiosa:"calma",energia:"bailar",nostalgica:"nostalgia",cansada:"tranquila",rabia:"despecho",extranando:"te extraño",motivada:"motivación"};
const STORE = "rmarg2-artistas";
let mine = [];
try { mine = JSON.parse(localStorage.getItem(STORE) || "[]"); if(!Array.isArray(mine)) mine = []; } catch(e){ mine = []; }
function saveMine(){ try { localStorage.setItem(STORE, JSON.stringify(mine)); return true; } catch(e){ return false; } }

const tagsEl = document.getElementById("tags"), artHint = document.getElementById("artHint");
function renderTags(){
  tagsEl.textContent = "";
  FIXED.forEach(n=>{ const t=document.createElement("span"); t.className="tag fixed"; t.textContent=n; tagsEl.appendChild(t); });
  mine.forEach((n,i)=>{
    const t=document.createElement("span"); t.className="tag";
    const label=document.createElement("span"); label.textContent=n; t.appendChild(label);
    const x=document.createElement("button"); x.type="button"; x.textContent="×"; x.setAttribute("aria-label","Quitar "+n);
    x.addEventListener("click",()=>{ mine.splice(i,1); saveMine(); renderTags(); artHint.textContent = n+" ya no está en tu lista."; if(current){ show(); renderMoodArtists(); } });
    t.appendChild(x); tagsEl.appendChild(t);
  });
}
document.getElementById("artForm").addEventListener("submit",e=>{
  e.preventDefault();
  const inp=document.getElementById("artText"); const n=inp.value.trim().replace(/\s+/g," ");
  if(!n){ artHint.textContent="Escribe el nombre de un artista."; return; }
  const all=[...FIXED,...mine].map(x=>norm(x));
  if(all.includes(norm(n))){ artHint.textContent=n+" ya está en tu lista."; return; }
  mine.push(n); const ok=saveMine(); inp.value=""; renderTags();
  artHint.textContent = ok ? "Listo, agregué a "+n+"." : "Agregué a "+n+", pero este navegador no deja guardar: se borrará al cerrar la página.";
  if(current) show();
});

function pool(key){
  const m=MOODS[key];
  const extra = mine.map(n=>[ "Algo de "+n, n, "Una búsqueda de “"+TERMS[key]+"” con su música, porque es de tus favoritos.", n+" "+TERMS[key] ]);
  return [...m.songs, ...extra];
}

let nowShowing = null;
let aiSong = null;          // canción elegida por la IA para lo que ella escribió
let textAsk = "";           // lo último que escribió, para pedir "otra" a la IA
const aiSongsSeen = [];     // canciones que la IA ya le propuso en esta visita

function showAISong(){
  const { song, artist, why, url } = aiSong;
  nowShowing = { song, artist, k: current };
  els.label.textContent = said ? "Para cuando estás " + said.toLowerCase() : "Elegida para ti";
  els.song.textContent = song; els.artist.textContent = artist; els.why.textContent = why || "";
  els.link.href = url || spotifyUrl(song + " " + artist);
  const vw = document.getElementById("vinylWrap");
  vw.classList.add("lift"); clearTimeout(vw._t); vw._t = setTimeout(()=>vw.classList.remove("lift"), 700);
  celebrate();
}

function show(){
  if(aiSong) return showAISong();
  const m = MOODS[current]; const list = pool(current);
  const [song,artist,why,query] = list[idx % list.length];
  nowShowing = { song, artist, k: current };
  els.label.textContent = said ? "Para cuando estás " + said.toLowerCase() : "Sonando ahora · " + m.label.toLowerCase();
  els.song.textContent = song; els.artist.textContent = artist; els.why.textContent = why;
  els.link.href = spotifyUrl(query || (song+" "+artist));
  const vw = document.getElementById("vinylWrap");
  vw.classList.add("lift"); clearTimeout(vw._t); vw._t = setTimeout(()=>vw.classList.remove("lift"), 700);
  celebrate();
}

const playerEl = document.querySelector(".player");
els.link.addEventListener("click", ()=>{ if(nowShowing) recordPlay(nowShowing.song, nowShowing.artist, nowShowing.k); });
function celebrate(){
  // el bloque "sonando ahora" rebota y el texto entra de nuevo
  playerEl.classList.remove("bump"); void playerEl.offsetWidth; playerEl.classList.add("bump");
  [[els.song,""],[els.artist,"lag1"],[els.why,"lag2"]].forEach(([el,d])=>{
    el.classList.remove("swap","lag1","lag2"); void el.offsetWidth; el.classList.add("swap"); if(d) el.classList.add(d);
  });
  // pétalos que salen del vinilo
  const pr = playerEl.getBoundingClientRect(), vr = els.vinyl.getBoundingClientRect();
  const cx = vr.left - pr.left + vr.width/2, cy = vr.top - pr.top + vr.height/2;
  for(let i=0;i<10;i++){
    const p=document.createElement("span"); p.className="petal";
    const ang = (i/10)*Math.PI*2 + Math.random()*.4, dist = 60 + Math.random()*50;
    p.style.left=(cx-6)+"px"; p.style.top=(cy-10)+"px";
    p.style.setProperty("--x", Math.cos(ang)*dist+"px");
    p.style.setProperty("--y", Math.sin(ang)*dist+"px");
    p.style.setProperty("--r", (ang*57+90)+"deg");
    playerEl.appendChild(p); setTimeout(()=>p.remove(), 950);
  }
  // si el reproductor no se ve en pantalla, sube hasta él
  if(pr.top < 0 || pr.bottom > window.innerHeight){
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    playerEl.scrollIntoView({behavior: reduce ? "auto" : "smooth", block:"center"});
  }
}

function pick(key,fresh,fromText){
  current = key;
  if(!fromText){ aiSong = null; textAsk = ""; }
  if(!fromText) said = "";
  if(fresh){
    const list = pool(key);
    const recent = new Set(hist.plays.slice(-8).map(p=>norm(p.song+"|"+p.artist)));
    const options = list.map((x,i)=>i).filter(i=>!recent.has(norm(list[i][0]+"|"+list[i][1])));
    const from = options.length ? options : list.map((x,i)=>i);
    idx = from[Math.floor(Math.random()*from.length)];
  }
  document.querySelectorAll(".chip").forEach(c=>c.setAttribute("aria-pressed", (!fromText && c.id==="chip-"+key) ? "true":"false"));
  show();
  if(typeof renderMoodArtists === "function") renderMoodArtists();
}

document.getElementById("another").addEventListener("click",()=>{
  if(textAsk && sampleFn && !aiOff){ findSongWithAI(textAsk); return; }
  aiSong = null;
  if(!current){ pick(Object.keys(MOODS)[Math.floor(Math.random()*10)],true); return; }
  idx++; show();
});

const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
/* Entender lo que ella escribe: raíces de palabras, sin acentos */
const STEMS = {
  feliz:["feliz","felic","content","alegr","genial","happy","chever","fino","fina","bien","super","excelente","plena","radiante","sonrie","sonriente","bendecid","agradecid","tranquila y feliz","de buenas","buen dia","maravill"],
  enamorada:["enamor","amor","mariposa","love","carino","ilusion","romant","cursi","tierna","tiern","flechad","crush","beso","abrazo","consentid","querida","amada"],
  triste:["trist","llor","sad","depre","bajon","dolid","decepcion","rota","roto","vacia","sola","solita","desanim","herida","mal ","mala","fatal","horrible","destrozad","dolor","pena","sensible","apagad"],
  ansiosa:["ansi","nervi","estres","preocup","agobi","overthink","abrumad","angusti","inquiet","asustad","miedo","tensa","tension","presion","colapsad","saturad","ataque"],
  energia:["energ","activ","gym","bailar","baile","fiesta","emocion","prendid","hiper","euforic","rumba","party","con pila","pilas","animada","rumbera","salir"],
  nostalgica:["nostalg","recuerd","antes","pasado","melancol","añor","anor","memoria","infancia","niña","viejos tiempos"],
  cansada:["cansad","cansancio","sueno","agotad","exhaust","tired","dormir","dormid","floja","flojera","sin ganas","fastidi","aburrid","molid","rendid","muerta","sin energia","sin pilas","quemad","drenad","fundid","reventad","pesad","lenta","tarde larga","dia largo","flaca de energia"],
  rabia:["rabia","rabios","molest","brava","bravis","arrech","furios","enoj","harta","hart","odio","irritad","fastidiada","ladilla","obstinad","indignad","peleand","de malas"],
  extranando:["extran","lejos","distancia","miss","pensando en","echo de menos","quiero ver","quisiera ver","falta","ausencia"],
  motivada:["motivad","productiv","fuerte","segura","empoderad","decidid","puedo","lista","inspirad","poderosa","ambicios","enfocad","con ganas","ganas de","imparable","confiada"]
};
const NEG_FLIP = {feliz:"triste", motivada:"cansada", energia:"cansada"};

function readMood(raw){
  const t = " " + norm(raw).replace(/[^a-zñ\s]/g," ").replace(/\s+/g," ") + " ";
  const scores = {};
  for(const [k,stems] of Object.entries(STEMS)){
    for(const st of stems){
      const stn = norm(st);
      // la raíz debe empezar al inicio de una palabra
      let i = t.indexOf(" "+stn);
      while(i !== -1){
        let key = k;
        const before = t.slice(Math.max(0,i-12), i);
        if(/ no( estoy| me siento| ando)?$/.test(before) && NEG_FLIP[k]) key = NEG_FLIP[k];
        scores[key] = (scores[key]||0) + stn.length; // raíces más largas pesan más
        i = t.indexOf(" "+stn, i+1);
      }
    }
  }
  let best=null, top=0;
  for(const [k,v] of Object.entries(scores)) if(v>top){top=v;best=k;}
  return best;
}

let said = "";
function cleanSaid(raw){
  return raw.trim().replace(/^(hoy\s+)?(me siento|estoy|ando|siento que estoy|me encuentro)\s+/i,"").replace(/[.!¡¿?]+$/,"").slice(0,40);
}

/* ---------- Canción específica con IA para lo que ella escribió ---------- */
let songCtl = null;
function setThinking(on){
  playerEl.classList.toggle("thinking", on);
  els.link.toggleAttribute("aria-disabled", on);
  document.getElementById("another").disabled = on;
  document.querySelector("#askForm button[type=submit]").disabled = on;
  if(on){
    els.label.textContent = said ? "Para cuando estás " + said.toLowerCase() : "Buscando";
    els.song.textContent = "Buscando tu canción…";
    els.artist.textContent = "";
    els.why.textContent = "Estoy eligiendo una que encaje con lo que escribiste.";
    playerEl.scrollIntoView({ behavior:"smooth", block:"center" });
  }
}
async function findSongWithAI(raw){
  if(songCtl) songCtl.abort();
  songCtl = new AbortController();
  textAsk = raw;
  setThinking(true);
  const recentPlays = hist.plays.slice(-15).map(p=>p.song+" de "+p.artist);
  const data = {
    text: raw.trim().slice(0,140),
    likes: [...FIXED, ...mine], passed,
    avoid: [...new Set([...aiSongsSeen.slice(-20), ...recentPlays])],
    history: histData()
  };
  try{
    const r = await askAI("song", data, songCtl.signal);
    if(!r || typeof r.song !== "string" || typeof r.artist !== "string") throw { code:"invalid_json" };
    aiSong = { song: r.song.slice(0,120), artist: r.artist.slice(0,80), why: String(r.why||"").slice(0,160), url: typeof r.url === "string" && r.url.startsWith("https://open.spotify.com/") ? r.url : null };
    aiSongsSeen.push(aiSong.song + " de " + aiSong.artist);
    const key = (r.mood && MOODS[r.mood]) ? r.mood : (readMood(raw) || current || "feliz");
    setThinking(false);
    current = key;
    document.querySelectorAll(".chip").forEach(c=>c.setAttribute("aria-pressed","false"));
    showAISong();
    renderMoodArtists();
    els.hint.textContent = "Elegí esta para ti. Si quieres otra, toca “Otra canción”.";
    return true;
  }catch(e){
    setThinking(false);
    if(e && e.code === "cancelled") return false;
    if(e && ["not_granted","sampling_disabled","not_declared","capability_disabled","capability_removed"].includes(e.code)){ aiOff = true; updateAgainLabel(); }
    aiSong = null; textAsk = "";
    return false;
  }
}

function pickFromText(raw){
  const best = readMood(raw);
  if(best){
    pick(best,true,true); recordMood(best, said);
    els.hint.textContent = "Te entendí. Si quieres otra, toca “Otra canción”.";
  } else {
    const keys=Object.keys(MOODS);
    pick(keys[Math.floor(Math.random()*keys.length)],true,true);
    els.hint.textContent = "No estoy segura de haberte entendido, así que te puse una sorpresa. Prueba con otras palabras o toca una opción:";
  }
}

document.getElementById("askForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const raw = document.getElementById("moodText").value;
  if(!raw.trim()){ els.hint.textContent = "Escribe cómo te sientes, o toca una opción:"; return; }
  said = cleanSaid(raw);
  if(sampleFn && !aiOff){
    const ok = await findSongWithAI(raw);
    if(ok){ recordMood(current, said); return; }
    els.hint.textContent = "No pude buscar con IA ahora, así que te elegí una de tu lista.";
    pickFromText(raw);
    return;
  }
  pickFromText(raw);
});
renderTags();

/* ---------- Primera vez: swipe de artistas ---------- */
const INTRO_KEY = "rmarg2-intro";
const introEl = document.getElementById("intro"), stackEl = document.getElementById("stack"),
      countEl = document.getElementById("count"), actionsEl = document.getElementById("introActions");
let deck = [], pos = 0, likedNow = [];

function initials(n){ return n.split(" ").map(w=>w[0]).slice(0,2).join(""); }
function el(tag, cls, text){ const e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }

function buildCard(a){
  const [name,genre,why] = a;
  const c = el("div","card"); c.setAttribute("aria-label", name+". "+why);
  c.appendChild(el("span","stamp yes","Me gusta"));
  c.appendChild(el("span","stamp no","Paso"));
  c.appendChild(el("div","avatar",initials(name)));
  c.appendChild(el("div","genre",genre));
  c.appendChild(el("h3",null,name));
  c.appendChild(el("p","why",why));
  const l = el("a","listen","Escúchalo primero en Spotify");
  l.href = "https://open.spotify.com/search/" + encodeURIComponent(name); l.target="_blank"; l.rel="noopener";
  l.addEventListener("pointerdown", e=>e.stopPropagation());
  c.appendChild(l);
  return c;
}

function renderDeck(){
  stackEl.textContent = "";
  if(pos >= deck.length){ finishDeck(); return; }
  if(deck[pos+1]){ const b = buildCard(deck[pos+1]); b.classList.add("behind"); stackEl.appendChild(b); }
  const top = buildCard(deck[pos]); stackEl.appendChild(top); attachDrag(top);
  countEl.textContent = (pos+1) + " de " + deck.length;
}

function decide(like){
  const top = stackEl.lastElementChild; if(!top || top.classList.contains("done-card")) return;
  const name = deck[pos][0];
  if(like){ likedNow.push(name); if(!mine.some(m=>norm(m)===norm(name))) { mine.push(name); saveMine(); } }
  else if(!passed.some(m=>norm(m)===norm(name))) { passed.push(name); savePassed(); }
  top.classList.add("gone");
  top.style.transform = "translateX(" + (like ? 520 : -520) + "px) rotate(" + (like ? 25 : -25) + "deg)";
  pos++;
  setTimeout(renderDeck, 300);
}

function attachDrag(card){
  let startX=0, dx=0, active=false;
  const yes = card.querySelector(".stamp.yes"), no = card.querySelector(".stamp.no");
  card.addEventListener("pointerdown", e=>{ active=true; startX=e.clientX; dx=0; card.classList.add("dragging"); card.setPointerCapture(e.pointerId); });
  card.addEventListener("pointermove", e=>{
    if(!active) return; dx = e.clientX - startX;
    card.style.transform = "translateX("+dx+"px) rotate("+(dx/14)+"deg)";
    yes.style.opacity = Math.max(0, Math.min(1, dx/90)); no.style.opacity = Math.max(0, Math.min(1, -dx/90));
  });
  const end = ()=>{
    if(!active) return; active=false; card.classList.remove("dragging");
    if(Math.abs(dx) > 90) decide(dx > 0);
    else { card.style.transform=""; yes.style.opacity=0; no.style.opacity=0; }
  };
  card.addEventListener("pointerup", end); card.addEventListener("pointercancel", end);
}

function finishDeck(){
  actionsEl.hidden = true; countEl.textContent = "";
  const c = el("div","card done-card");
  c.appendChild(el("div","avatar","♥"));
  const none = deck.length === 0;
  c.appendChild(el("h3",null, likedNow.length ? "¡Listo, Margarita!" : (none ? "Ya los viste todos" : "Todo bien")));
  c.appendChild(el("p","why", likedNow.length
    ? "Agregué a tu radio a:"
    : none ? "Ya viste todos los que tenía guardados."
           : "No elegiste ninguno, así que seguimos con Ariana y Taylor. Puedes agregar artistas cuando quieras."));
  let n = 0;
  if(likedNow.length){ const w = el("div","liked"); likedNow.forEach(name=>{ const t=el("span","tag",name); t.style.animationDelay=(.35 + n++*.06)+"s"; w.appendChild(t); }); c.appendChild(w); }
  const btns = el("div","done-btns");
  if(sampleFn && !aiOff){
    const more = el("button","btn ghost","✨ Recomiéndame más"); more.type="button";
    more.style.animationDelay = (.4 + n*.06)+"s";
    more.addEventListener("click", loadMoreWithAI);
    btns.appendChild(more);
  }
  const go = el("button","btn primary","Entrar a mi radio"); go.type="button"; go.addEventListener("click", closeIntro);
  go.style.animationDelay = (.45 + n*.06)+"s";
  btns.appendChild(go);
  c.appendChild(btns);
  if(aiNote){ c.appendChild(el("p","ai-note",aiNote)); aiNote=""; }
  introFoot.hidden = true;
  stackEl.textContent = ""; stackEl.classList.add("done"); stackEl.appendChild(c);
  go.focus({preventScroll:true});
  burst(c);
}

/* ---------- Más artistas con IA ----------
   Dentro de claude.ai usa la cuenta de Claude de quien abre la página.
   En el sitio publicado usa la función /api/recommend (la API key vive en el servidor). */
let sampleFn = null, aiOff = false, aiNote = "", aiCtl = null;
let claudeSample = null, serverAI = false;
function aiReady(){ sampleFn = (claudeSample || serverAI) ? true : null; updateAgainLabel(); if(current) renderMoodArtists(); }
if(window.claude && typeof window.claude.use === "function"){
  window.claude.use("sample").then(f=>{ claudeSample = f || null; aiReady(); }).catch(()=>{});
} else {
  fetch(import.meta.env.BASE_URL.replace(/\/?$/, "/") + "api/recommend", { headers:{ accept:"application/json" } })
    .then(r => r.ok ? r.json() : null).then(j => { serverAI = !!(j && j.ok); aiReady(); }).catch(()=>{});
}

/* Pide a la IA: kind "discover" (6 artistas para el swipe) o "mood" (3 artistas para un ánimo). */
async function askAI(kind, data, signal){
  if(claudeSample) return claudeSample.json(buildPrompt(kind, data), { modelTier:"quick", cache:false, signal });
  let r;
  try{
    r = await fetch(import.meta.env.BASE_URL.replace(/\/?$/, "/") + "api/recommend", {
      method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ kind, data }), signal
    });
  }catch(e){ throw { code: (e && e.name === "AbortError") ? "cancelled" : "upstream_error" }; }
  const j = await r.json().catch(()=>null);
  if(!r.ok) throw { code: (j && j.code === "not_configured") ? "sampling_disabled" : ((j && j.code) || "upstream_error") };
  return j.result;
}
const PASSED_KEY = "rmarg2-pasados";
let passed = [];
try { passed = JSON.parse(localStorage.getItem(PASSED_KEY) || "[]"); if(!Array.isArray(passed)) passed = []; } catch(e){ passed = []; }
function savePassed(){ try { localStorage.setItem(PASSED_KEY, JSON.stringify(passed.slice(-300))); } catch(e){} }
let suggestedEver = [];
try { const sg = JSON.parse(localStorage.getItem(SUG_KEY) || "[]"); if(Array.isArray(sg)) suggestedEver = sg; } catch(e){}
function saveSug(){ try { localStorage.setItem(SUG_KEY, JSON.stringify(suggestedEver.slice(-300))); } catch(e){} }

function known(name){
  const k = norm(name);
  return [...FIXED, ...mine, ...passed, ...suggestedEver].some(m=>norm(m)===k);
}

function showLoading(){
  actionsEl.hidden = true; introFoot.hidden = true; countEl.textContent = "";
  stackEl.classList.add("done"); stackEl.textContent = "";
  const c = el("div","card done-card loading-card");
  c.appendChild(el("div","avatar spin-slow","✿"));
  c.appendChild(el("h3",null,"Buscando artistas para ti…"));
  c.appendChild(el("p","why","Estoy pensando en quién te podría gustar según lo que elegiste. Tarda unos segundos."));
  const stop = el("button","btn ghost","Cancelar"); stop.type="button";
  stop.addEventListener("click", ()=>aiCtl && aiCtl.abort());
  c.appendChild(stop);
  stackEl.appendChild(c);
}

async function loadMoreWithAI(){
  if(!sampleFn) return;
  showLoading();
  const likes = [...FIXED, ...mine];
  const exclude = [...new Set([...likes, ...passed, ...suggestedEver])];
  const data = { likes, passed, exclude, history: histData() };
  aiCtl = new AbortController();
  try{
    const out = await askAI("discover", data, aiCtl.signal);
    const list = (Array.isArray(out) ? out : []).filter(o=>o && typeof o.name==="string" && o.name.trim())
      .map(o=>[String(o.name).trim().slice(0,40), String(o.genre||"Pop").trim().slice(0,28), String(o.why||"").trim().slice(0,140)])
      .filter(a=>!known(a[0]));
    const seen = new Set(); const fresh = list.filter(a=>{ const k=norm(a[0]); if(seen.has(k)) return false; seen.add(k); return true; });
    if(!fresh.length){ aiNote = "Esta vez no encontré artistas nuevos. Prueba otra vez en un rato."; deck=[]; pos=0; finishDeck(); return; }
    fresh.forEach(a=>suggestedEver.push(a[0])); saveSug();
    deck = fresh; pos = 0;
    stackEl.classList.remove("done"); actionsEl.hidden = false; introFoot.hidden = false;
    renderDeck();
  }catch(e){
    const code = e && e.code;
    if(code === "cancelled"){ aiNote = ""; }
    else if(["not_granted","sampling_disabled","not_declared","capability_disabled","capability_removed"].includes(code)){
      aiOff = true; aiNote = "Las recomendaciones con IA no están disponibles aquí, pero puedes escribir artistas en tu radio.";
    } else if(code === "rate_limited"){ aiNote = "Pediste muchas seguidas. Espera un ratico y vuelve a intentar."; }
    else if(code === "session_expired"){ aiNote = "Tu sesión de Claude venció. Vuelve a iniciar sesión e intenta otra vez."; }
    else { aiNote = "No pude traer artistas esta vez. Toca “Recomiéndame más” para intentar de nuevo."; }
    deck = []; pos = 0; finishDeck();
  }
}

const introFoot = document.querySelector(".intro-foot");
function burst(target){
  if(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for(let i=0;i<14;i++){
    const p=document.createElement("span"); p.className="petal";
    const ang=(i/14)*Math.PI*2+Math.random()*.3, dist=110+Math.random()*70;
    p.style.left="calc(50% - 6px)"; p.style.top="62px";
    p.style.setProperty("--x",Math.cos(ang)*dist+"px"); p.style.setProperty("--y",Math.sin(ang)*dist+"px");
    p.style.setProperty("--r",(ang*57+90)+"deg"); p.style.animationDelay=".25s";
    target.appendChild(p); setTimeout(()=>p.remove(),1300);
  }
}
function openIntro(){
  introFoot.hidden = false; stackEl.classList.remove("done");
  deck = DISCOVER.filter(a=>!known(a[0]));
  pos = 0; likedNow = [];
  actionsEl.hidden = false;
  introEl.hidden = false; document.body.style.overflow = "hidden";
  if(!deck.length && sampleFn && !aiOff) loadMoreWithAI(); else renderDeck();
}
function closeIntro(){
  setTimeout(playEntrance, 50);
  try { localStorage.setItem(INTRO_KEY,"1"); } catch(e){}
  introEl.hidden = true; document.body.style.overflow = "";
  renderTags(); if(current) renderMoodArtists();
  if(likedNow.length) artHint.textContent = "Ya están en tu lista: " + likedNow.join(", ") + ".";
}
document.getElementById("btnYes").addEventListener("click", ()=>decide(true));
document.getElementById("btnNo").addEventListener("click", ()=>decide(false));
document.getElementById("skip").addEventListener("click", closeIntro);
document.getElementById("again").addEventListener("click", openIntro);
document.addEventListener("keydown", e=>{
  if(introEl.hidden) return;
  if(e.key==="ArrowRight") decide(true); else if(e.key==="ArrowLeft") decide(false); else if(e.key==="Escape") closeIntro();
});

function updateAgainLabel(){
  const b = document.getElementById("again"); if(!b) return;
  b.textContent = (sampleFn && !aiOff) ? "✨ Descubrir más artistas" : "Descubrir más artistas";
}

/* ---------- Artistas según el estado de ánimo ---------- */
const maBox = document.getElementById("moodArtists"), maTitle = document.getElementById("maTitle"),
      maRow = document.getElementById("maRow"), maAi = document.getElementById("maAi"), maNote = document.getElementById("maNote");
let maExtra = {}; // sugerencias de IA por ánimo
let maCtl = null;

function inMine(n){ return [...FIXED, ...mine].some(m=>norm(m)===norm(n)); }
function wasPassed(n){ return passed.some(m=>norm(m)===norm(n)); }

function renderMoodArtists(){
  if(!current){ maBox.hidden = true; return; }
  const pool = [...(maExtra[current]||[]), ...MOOD_ARTISTS[current]];
  const uniq = []; pool.forEach(n=>{ if(!uniq.some(u=>norm(u)===norm(n))) uniq.push(n); });
  const options = uniq.filter(n=>!inMine(n) && !wasPassed(n)).slice(0,3);
  maTitle.innerHTML = ""; maTitle.append("Artistas para cuando estás ");
  const sp = document.createElement("span"); sp.textContent = (said || MOODS[current].label).toLowerCase(); maTitle.append(sp);
  maRow.textContent = "";
  if(!options.length){
    const p = el("p","ma-note","Ya tienes en tu radio a todos los que tenía para este ánimo.");
    p.hidden = false; maRow.appendChild(p);
  }
  options.forEach((n,i)=>{
    const b = el("button","ma-chip","+ " + n); b.type="button"; b.style.animationDelay = (i*.07)+"s";
    b.setAttribute("aria-label","Agregar a "+n+" a tus artistas");
    b.addEventListener("click", ()=>{
      if(b.classList.contains("added")) return;
      if(!inMine(n)){ mine.push(n); saveMine(); renderTags(); }
      b.classList.add("added"); b.textContent = "✓ " + n; b.setAttribute("aria-label", n+" agregado");
      artHint.textContent = "Agregué a " + n + ". Ya te pueden salir sus canciones.";
      setTimeout(()=>{ renderMoodArtists(); show(); }, 900);
    });
    maRow.appendChild(b);
  });
  maAi.hidden = !(sampleFn && !aiOff);
  maBox.hidden = false;
}

maAi.addEventListener("click", async ()=>{
  if(!sampleFn || !current) return;
  const moodName = (said || MOODS[current].label).toLowerCase();
  maAi.disabled = true; maAi.textContent = "Buscando…"; maNote.hidden = true;
  const likes = [...FIXED, ...mine];
  const exclude = [...new Set([...likes, ...passed, ...(maExtra[current]||[]), ...MOOD_ARTISTS[current]])];
  const data = { mood: moodName, likes, passed, exclude, history: histData() };
  maCtl = new AbortController();
  try{
    const out = await askAI("mood", data, maCtl.signal);
    const names = (Array.isArray(out)?out:[]).map(x=>typeof x==="string"?x:(x&&x.name)).filter(x=>typeof x==="string"&&x.trim()).map(x=>x.trim().slice(0,40));
    const fresh = names.filter(n=>!inMine(n) && !wasPassed(n));
    if(!fresh.length){ maNote.textContent = "Esta vez no encontré otros nuevos. Prueba en un rato."; maNote.hidden = false; }
    else { maExtra[current] = [...fresh, ...(maExtra[current]||[])]; }
  }catch(e){
    const code = e && e.code;
    if(["not_granted","sampling_disabled","not_declared","capability_disabled","capability_removed"].includes(code)){ aiOff = true; updateAgainLabel(); }
    else if(code !== "cancelled"){ maNote.textContent = code==="rate_limited" ? "Pediste muchas seguidas. Espera un ratico." : "No pude buscar artistas ahora. Intenta otra vez."; maNote.hidden = false; }
  }finally{
    maAi.disabled = false; maAi.textContent = "✨ Buscar otros para este ánimo";
    renderMoodArtists();
  }
});

/* ---------- Mostrar historial ---------- */
function ago(t){
  const m = Math.round((Date.now()-t)/60000);
  if(m < 1) return "hace un momento"; if(m < 60) return "hace " + m + " min";
  const h = Math.round(m/60); if(h < 24) return "hace " + h + (h===1?" hora":" horas");
  const d = Math.round(h/24); return d===1 ? "ayer" : "hace " + d + " días";
}
function renderHistory(){
  const list = document.getElementById("histList"), moodEl = document.getElementById("histMood");
  const top = topCounts(hist.moods, m=>m.k, 1)[0];
  moodEl.textContent = top && MOODS[top[0]]
    ? "Lo que más has sentido: " + MOODS[top[0]].label.toLowerCase() + " (" + top[1] + (top[1]===1?" vez)":" veces)") + ". Se guarda solo en este teléfono."
    : "Aquí van a aparecer las canciones que abras en Spotify. Se guarda solo en este teléfono.";
  list.textContent = "";
  const items = hist.plays.slice(-6).reverse();
  if(!items.length){ list.appendChild(el("li","empty","Todavía no has abierto ninguna canción.")); return; }
  items.forEach(p=>{
    const li = el("li"); const main = el("div","h-main");
    main.appendChild(el("span","h-song",p.song));
    main.appendChild(el("span","h-meta", p.artist + (MOODS[p.k] ? " · " + MOODS[p.k].label.toLowerCase() : "") + " · " + ago(p.t)));
    const a = el("a",null,"Otra vez"); a.href = spotifyUrl(p.song.startsWith("Algo de ") ? p.artist : p.song+" "+p.artist); a.target="_blank"; a.rel="noopener";
    li.appendChild(main); li.appendChild(a); list.appendChild(li);
  });
}
const histClear = document.getElementById("histClear"), histConfirm = document.getElementById("histConfirm");
histClear.addEventListener("click", ()=>{ histClear.hidden = true; histConfirm.hidden = false; document.getElementById("histNo").focus(); });
document.getElementById("histNo").addEventListener("click", ()=>{ histConfirm.hidden = true; histClear.hidden = false; histClear.focus(); });
document.getElementById("histYes").addEventListener("click", ()=>{
  hist = { moods: [], plays: [] }; passed = []; suggestedEver = [];
  try { localStorage.removeItem(HIST_KEY); localStorage.removeItem(PASSED_KEY); localStorage.removeItem(SUG_KEY); } catch(e){}
  histConfirm.hidden = true; histClear.hidden = false;
  renderHistory(); if(current) renderMoodArtists();
});
renderHistory();


/* ---------- Modo noche con animación ---------- */
const THEME_KEY = "rmarg2-noche", rootEl = document.documentElement, themeBtn = document.getElementById("themeBtn");
function applyNight(on){
  rootEl.classList.toggle("night", on);
  themeBtn.setAttribute("aria-pressed", on ? "true" : "false");
  themeBtn.setAttribute("aria-label", on ? "Volver al modo día" : "Activar modo noche");
}
try { if(localStorage.getItem(THEME_KEY) === "1") applyNight(true); } catch(e){}
themeBtn.addEventListener("click", ()=>{
  const on = !rootEl.classList.contains("night");
  try { localStorage.setItem(THEME_KEY, on ? "1" : "0"); } catch(e){}
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(reduce){ applyNight(on); return; }
  if(document.startViewTransition){
    // círculo que se expande desde el botón
    const r = themeBtn.getBoundingClientRect(), x = r.left + r.width/2, y = r.top + r.height/2;
    const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const t = document.startViewTransition(()=>applyNight(on));
    t.ready.then(()=>{
      document.documentElement.animate(
        { clipPath: ["circle(0px at "+x+"px "+y+"px)", "circle("+end+"px at "+x+"px "+y+"px)"] },
        { duration: 650, easing: "cubic-bezier(.4,0,.2,1)", pseudoElement: "::view-transition-new(root)" });
    }).catch(()=>{});
  } else {
    // sin View Transitions: los colores se funden suavemente
    rootEl.classList.add("fade"); applyNight(on);
    setTimeout(()=>rootEl.classList.remove("fade"), 800);
  }
});

let seen = false; try { seen = localStorage.getItem(INTRO_KEY)==="1"; } catch(e){}

/* ---------- Animación de entrada ---------- */
(function splitName(){
  const em = document.getElementById("nameEm"); const txt = em.textContent; em.textContent = "";
  em.setAttribute("aria-label", txt);
  [...txt].forEach((ch,i)=>{ const sp = document.createElement("span"); sp.className="letter"; sp.style.setProperty("--i", i); sp.setAttribute("aria-hidden","true"); sp.textContent = ch; em.appendChild(sp); });
  document.querySelectorAll("#chips .chip").forEach((c,i)=>c.style.setProperty("--i", i));
})();
let entered = false;
function playEntrance(){
  if(entered) return; entered = true;
  rootEl.classList.add("enter");
  setTimeout(()=>rootEl.classList.remove("enter"), 3200);
}
if(!seen) openIntro(); else playEntrance();
