import {
  NOMES_IBGE,
  FONTE_NOMES,
  VERSAO_BASE_NOMES,
} from "../data/nomes-ibge.js";
export const PREDOMINANCIA_MINIMA = 0.99;
export const AMOSTRA_MINIMA = 1000;
const normalizar = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
function consultar(prenome, base) {
  if (!/^[A-Z]{2,}$/.test(prenome) || !Object.hasOwn(base, prenome))
    return null;
  const [feminino, masculino] = base[prenome];
  if (![feminino, masculino].every((v) => Number.isSafeInteger(v) && v > 0))
    return null;
  const total = feminino + masculino,
    predominancia = Math.max(feminino, masculino) / total;
  if (total < AMOSTRA_MINIMA || predominancia < PREDOMINANCIA_MINIMA)
    return null;
  return {
    sexo: feminino > masculino ? "feminino" : "masculino",
    prenome,
    predominancia,
    amostra: total,
    frequenciaFeminina: feminino,
    frequenciaMasculina: masculino,
    fonte: FONTE_NOMES,
    versao: `${VERSAO_BASE_NOMES}-99-v2`,
  };
}
export function inferirSexoPorNome(nome, base = NOMES_IBGE) {
  const palavras = normalizar(nome).split(/\s+/),
    primeiros = palavras[0].split("-");
  const resultados = primeiros.map((p) => consultar(p, base));
  if (
    resultados.some((r) => !r) ||
    resultados.some((r) => r.sexo !== resultados[0].sexo)
  )
    return null;
  const resultado = resultados[0];
  // A segunda palavra só pode fazer abster; nunca determina o resultado.
  const segundo = consultar(palavras[1] || "", base);
  if (segundo && segundo.sexo !== resultado.sexo) return null;
  return resultado;
}
export function preencherSexoPorNome(c) {
  if (
    c.sexoOrigem === "usuario" ||
    (["feminino", "masculino"].includes(c.sexo) && !c.sexoInferencia)
  )
    return false;
  const antes = JSON.stringify([c.sexo, c.sexoOrigem, c.sexoInferencia]);
  const estimativa = inferirSexoPorNome(c.nome);
  if (estimativa) {
    c.sexo = estimativa.sexo;
    c.sexoOrigem = "nome";
    c.sexoInferencia = estimativa;
  } else {
    c.sexo = "nao_informado";
    delete c.sexoInferencia;
    delete c.sexoOrigem;
  }
  return antes !== JSON.stringify([c.sexo, c.sexoOrigem, c.sexoInferencia]);
}
