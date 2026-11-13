import { temaSazonal } from "./config/calendario-sazonal.js";
const natal =
  '<circle cx="32" cy="36" r="19" fill="none" stroke="#245c43" stroke-width="9"/><circle cx="32" cy="36" r="19" fill="none" stroke="#4e9769" stroke-width="6" stroke-dasharray="5 4"/><g fill="#78b185"><ellipse cx="15" cy="29" rx="3" ry="5" transform="rotate(-30 15 29)"/><ellipse cx="14" cy="41" rx="3" ry="5" transform="rotate(-60 14 41)"/><ellipse cx="22" cy="51" rx="3" ry="5" transform="rotate(-45 22 51)"/><ellipse cx="48" cy="29" rx="3" ry="5" transform="rotate(30 48 29)"/><ellipse cx="50" cy="41" rx="3" ry="5" transform="rotate(60 50 41)"/><ellipse cx="42" cy="51" rx="3" ry="5" transform="rotate(45 42 51)"/></g><g fill="#d84a5d"><circle cx="13" cy="35" r="2"/><circle cx="48" cy="36" r="2"/><circle cx="18" cy="47" r="2"/><circle cx="47" cy="46" r="2"/></g><g transform="rotate(-12 32 19)"><path d="M15 22C20 7 30 3 41 8c6 3 9 9 10 15l-8-2c-3-6-7-7-11-4l-4 8Z" fill="#c9384d"/><path d="M22 18c3-7 8-10 14-9" fill="none" stroke="#ee8190" stroke-width="2" stroke-linecap="round"/><rect x="13" y="20" width="32" height="8" rx="4" fill="#fffaf2" stroke="#d2dbe0"/><circle cx="51" cy="23" r="5" fill="#fffaf2" stroke="#d2dbe0"/></g><g transform="rotate(-14 25 52)"><path d="M20 50c0-5 1-8 5-8s5 3 5 8l2 3H18Z" fill="#e5b951" stroke="#ad7830" stroke-width="1"/><path d="M19 52h12" stroke="#fff0b3" stroke-width="2" stroke-linecap="round"/><circle cx="25" cy="56" r="2" fill="#bc8432"/></g><g transform="rotate(14 39 52)"><path d="M34 50c0-5 1-8 5-8s5 3 5 8l2 3H32Z" fill="#f0cb6c" stroke="#ad7830" stroke-width="1"/><path d="M33 52h12" stroke="#fff0b3" stroke-width="2" stroke-linecap="round"/><circle cx="39" cy="56" r="2" fill="#bc8432"/></g><path d="M32 45c-8-8-12-3-9 1 2 2 5 1 9-1 4 2 7 3 9 1 3-4-1-9-9-1Z" fill="#cb3e50"/><circle cx="32" cy="45" r="2.5" fill="#ef7b85"/><path class="seasonal-sparkle" d="m32 30 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z" fill="#efd387"/>';
const estrela =
  '<path d="m32 17 4 10 11 1-8 7 2 11-9-6-9 6 2-11-8-7 11-1Z" fill="#f1c767" stroke="#a97329" stroke-width="1.5"/>';
const coracao =
  '<path d="M32 52 12 33C-1 17 20 4 32 20 44 4 65 17 52 33Z" fill="#db667e" stroke="#a84058" stroke-width="2"/><path d="M18 20c3-3 6-3 9-1" fill="none" stroke="#ffe1df" stroke-width="3" stroke-linecap="round"/>';
const presente =
  '<rect x="12" y="27" width="40" height="28" rx="4" fill="#3d8a70"/><rect x="9" y="22" width="46" height="11" rx="3" fill="#70b199"/><path d="M32 23C9 20 17 4 27 13l5 10 5-10c10-9 18 7-5 10Zm0 0v32" fill="none" stroke="#f1c767" stroke-width="5" stroke-linejoin="round"/>';
const raios = (x, y, cor, atraso) =>
  `<g class="seasonal-burst" style="--season-delay:${atraso}ms" fill="none" stroke="${cor}" stroke-width="2" stroke-linecap="round">${Array.from(
    { length: 8 },
    (_, i) => {
      const a = (i * Math.PI) / 4;
      return `<path d="M${x + Math.cos(a) * 5} ${y + Math.sin(a) * 5}l${Math.cos(a) * 10} ${Math.sin(a) * 10}"/>`;
    },
  ).join("")}</g>`;
const confetes = Array.from(
  { length: 7 },
  (_, i) =>
    `<rect class="seasonal-confetti" style="--season-delay:${i * 60}ms" x="${8 + i * 7}" y="${6 + (i % 3) * 4}" width="3" height="6" rx="1" fill="${["#e5ba58", "#d7669c", "#66b6a6"][i % 3]}" transform="rotate(${i % 2 ? 25 : -25} ${9 + i * 7} 12)"/>`,
).join("");
const icones = {
  natal,
  fogos: `<path d="M22 57h20l-4-12H26Z" fill="#418c76"/><path d="m27 45 5-19 5 19Z" fill="#e5ba58"/>${estrela}${raios(15, 18, "#df82aa", 0)}${raios(48, 20, "#e5ba58", 180)}${raios(32, 31, "#78c3ac", 350)}`,
  mascara: `${confetes}<path d="M7 25c10-10 16-4 25-1 9-3 15-9 25 1l-4 16c-10 10-14-1-21-3-7 2-11 13-21 3Z" fill="#9c63b5" stroke="#683b85" stroke-width="2"/><path d="M15 29c7-2 10 1 12 6-7 2-10-1-12-6Zm34 0c-7-2-10 1-12 6 7 2 10-1 12-6Z" fill="#fff0bf"/><path d="M9 23 5 14m50 9 4-9" stroke="#e7bf5f" stroke-width="3" stroke-linecap="round"/>`,
  pascoa:
    '<path d="M18 51c-8-10 3-33 14-33s22 23 14 33c-6 8-22 8-28 0Z" fill="#ad8ac5" stroke="#785492" stroke-width="2"/><path d="m16 37 8-4 8 5 8-5 8 4M18 47h28" fill="none" stroke="#f9d981" stroke-width="4"/><path d="M23 20c-10-24 7-23 9-4 2-19 19-20 9 4" fill="#e9c9c3" stroke="#b78388" stroke-width="2"/>',
  arraia:
    '<path d="M4 10q28 13 56 0" fill="none" stroke="#a87b47" stroke-width="2"/><path d="m10 13 1 12 8-7m9 0 4 13 5-13m9-1 7 8 1-12" fill="#df765f"/><path d="m22 31 10-8 10 8-5 15H27Z" fill="#eabb58" stroke="#b17d31" stroke-width="2"/><path d="M32 24v22m-8-12h16M28 46l-3 10m11-10 3 10" stroke="#8e5a35" stroke-width="2"/>',
  flor: '<path d="M32 57V33m0 16c-12 0-17-6-17-9 10-3 17 2 17 9Zm0-6c10 0 16-6 16-9-10-3-16 2-16 9Z" fill="#76ac82" stroke="#407e59" stroke-width="2"/><g fill="#d8789d" stroke="#a94e75"><ellipse cx="32" cy="18" rx="8" ry="12"/><ellipse cx="32" cy="18" rx="8" ry="12" transform="rotate(72 32 25)"/><ellipse cx="32" cy="18" rx="8" ry="12" transform="rotate(144 32 25)"/><ellipse cx="32" cy="18" rx="8" ry="12" transform="rotate(216 32 25)"/><ellipse cx="32" cy="18" rx="8" ry="12" transform="rotate(288 32 25)"/></g><circle cx="32" cy="25" r="7" fill="#f0c76c"/>',
  brasil:
    '<path d="M13 58V8" stroke="#bba778" stroke-width="3"/><path d="M14 10h44v32H14Z" fill="#3a9068"/><path d="m18 26 18-12 18 12-18 12Z" fill="#edc55f"/><circle cx="36" cy="26" r="7" fill="#446989"/><path d="m30 24 12 3" stroke="#fff7df" stroke-width="2"/>',
  contabilidade:
    '<rect x="14" y="7" width="36" height="50" rx="6" fill="#3c806d" stroke="#235b4c" stroke-width="2"/><rect x="20" y="14" width="24" height="11" rx="2" fill="#d3e8d9"/><path d="M21 34h4m9 0h4m-17 8h4m9 0h4m-17 8h4m9 0h4" stroke="#f2cb79" stroke-width="4" stroke-linecap="round"/>',
  trabalho:
    '<rect x="8" y="23" width="48" height="32" rx="5" fill="#537e9b" stroke="#315573" stroke-width="2"/><path d="M23 23v-8h18v8M9 34q23 10 46 0" fill="none" stroke="#d5b975" stroke-width="3"/><rect x="29" y="33" width="6" height="10" rx="2" fill="#f1cf87"/>',
  coracao,
  presente,
  amizade:
    '<path d="m9 34 13-13 10 5 10-5 13 13-16 17H25Z" fill="#e5bd88" stroke="#a97846" stroke-width="2"/><path d="m32 26-9 9 5 4 9-7 10 12M24 43l5 5m4-10 8 8" fill="none" stroke="#93633d" stroke-width="2"/><path d="m8 24 8 8-9 12-7-7m56-13-8 8 9 12 7-7" fill="#5b9f85"/>',
  pipa: '<path d="m32 5 19 19-19 21-19-21Z" fill="#ecb85d" stroke="#95683d" stroke-width="2"/><path d="m32 5v40L13 24h38" fill="none" stroke="#c36979" stroke-width="3"/><path d="M32 45c-9 5 12 9 0 15" fill="none" stroke="#528d7f" stroke-width="2"/><path d="m31 51-5-2v6l5-4m4 5 5-2v6Z" fill="#c36979"/>',
  abobora:
    '<path d="m31 18 3-11 7 1" fill="none" stroke="#5f8f59" stroke-width="5"/><ellipse cx="21" cy="37" rx="14" ry="19" fill="#d07c3e"/><ellipse cx="43" cy="37" rx="14" ry="19" fill="#e29348"/><ellipse cx="32" cy="37" rx="14" ry="20" fill="#ecaa51"/><path d="m18 33 8-7 1 9Zm28 0-8-7-1 9ZM21 43l7 4 4-3 4 3 7-4-4 9H25Z" fill="#564637"/>',
  igualdade:
    '<circle cx="32" cy="32" r="24" fill="#985c42"/><path d="M19 25h26m-26 14h26" stroke="#ffe4af" stroke-width="6" stroke-linecap="round"/><path d="m10 11 4 3m36 0 4-3m0 42-4-3m-36 0-4 3" stroke="#cda861" stroke-width="3" stroke-linecap="round"/>',
};
export function iconeSazonal(tema) {
  return `<svg class="seasonal-icon" viewBox="0 0 64 64" width="48" height="48" focusable="false">${icones[tema.icone] || estrela}</svg>`;
}
const instancias = new WeakMap();
export function initSeasonalDecorations(
  document,
  { agora = () => new Date() } = {},
) {
  if (instancias.has(document)) return instancias.get(document);
  const window = document.defaultView,
    elementos = [...document.querySelectorAll("[data-seasonal-ornament]")];
  let timer,
    chaveAtual,
    ativo = true;
  const toques = new Map();
  function atualizar() {
    if (!ativo) return;
    const tema = temaSazonal(agora());
    const chave = tema ? `${tema.id}/${tema.inicio}` : "";
    if (chave === chaveAtual) return;
    chaveAtual = chave;
    for (const el of elementos) {
      window.clearTimeout(toques.get(el));
      el.classList.remove("is-celebrating");
      el.hidden = !tema;
      if (!tema) {
        el.replaceChildren();
        delete el.dataset.seasonalTheme;
        delete el.dataset.seasonalMessage;
        delete el.dataset.seasonalEffect;
        continue;
      }
      el.dataset.seasonalTheme = tema.id;
      el.dataset.seasonalMessage = tema.mensagem;
      el.dataset.seasonalEffect = tema.efeito;
      // Conteúdo de um catálogo local; nenhuma resposta ou dado de empresa é inserido.
      el.innerHTML = iconeSazonal(tema);
    }
  }
  function agendar() {
    window.clearTimeout(timer);
    atualizar();
    if (ativo && !document.hidden) timer = window.setTimeout(agendar, 60000);
  }
  function celebrar(event) {
    event.preventDefault();
    event.stopPropagation();
    const el = event.currentTarget;
    window.clearTimeout(toques.get(el));
    el.classList.add("is-celebrating");
    toques.set(
      el,
      window.setTimeout(() => el.classList.remove("is-celebrating"), 2500),
    );
  }
  elementos.forEach((el) => el.addEventListener("click", celebrar));
  document.addEventListener("visibilitychange", agendar);
  window.addEventListener("pageshow", agendar);
  agendar();
  const dispose = () => {
    ativo = false;
    window.clearTimeout(timer);
    toques.forEach((t) => window.clearTimeout(t));
    elementos.forEach((el) => el.removeEventListener("click", celebrar));
    document.removeEventListener("visibilitychange", agendar);
    window.removeEventListener("pageshow", agendar);
    instancias.delete(document);
  };
  instancias.set(document, dispose);
  return dispose;
}
