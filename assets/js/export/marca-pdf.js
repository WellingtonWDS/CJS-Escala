/* Marca do escritório nos relatórios PDF: cores com contraste garantido e
 * posicionamento da logomarca. Sem marca, o relatório usa a identidade padrão. */
export const COR_PRIMARIA_PADRAO = "#0f2844";
export const COR_SECUNDARIA_PADRAO = "#1f7a54";
const NAVY = [15, 40, 68];
export const rgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const canal = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export const luminancia = ([r, g, b]) => 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
export function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
const misturar = (cor, fundo, t) => cor.map((c, i) => Math.round(c * (1 - t) + fundo[i] * t));
/** Escurece a cor até atingir o contraste mínimo sobre o branco. */
function legivelNoBranco(cor, minimo = 4.5) {
  let c = cor;
  for (let i = 0; i < 20 && contraste(c, [255, 255, 255]) < minimo; i++) c = misturar(c, [0, 0, 0], 0.12);
  return c;
}
export function temaPdf(marca) {
  const primaria = rgb(marca?.primaryColor) || rgb(COR_PRIMARIA_PADRAO);
  const secundaria = rgb(marca?.secondaryColor) || rgb(COR_SECUNDARIA_PADRAO);
  const textoCabecalho = contraste(primaria, [255, 255, 255]) >= 4.5 ? [255, 255, 255] : [20, 24, 30];
  return {
    personalizada: !!(marca && (marca.logo || marca.displayName || marca.revision)),
    primaria,
    secundaria,
    titulo: legivelNoBranco(primaria),
    destaque: legivelNoBranco(secundaria),
    cabecalhoTabela: { fill: primaria, text: textoCabecalho },
    folga: misturar(secundaria, [255, 255, 255], 0.86),
    textoFolga: [40, 52, 66],
    neutro: NAVY,
  };
}
/** Dimensões (mm) da logomarca dentro da área disponível, preservando a proporção. */
export function caixaLogo(largura, altura, maxL = 70, maxA = 22) {
  if (!largura || !altura) return { w: maxL, h: maxA };
  const r = Math.min(maxL / largura, maxA / altura);
  return { w: largura * r, h: altura * r };
}
