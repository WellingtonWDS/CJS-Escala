export const normalizarFuncao = (valor) =>
  String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
export function funcoesHabilitadas(c) {
  const nomes = [
    c.cargo,
    ...(Array.isArray(c.funcoesHabilitadas) ? c.funcoesHabilitadas : []),
  ];
  const mapa = new Map();
  for (const nome of nomes)
    if (typeof nome === "string" && normalizarFuncao(nome))
      mapa.set(normalizarFuncao(nome), nome.trim());
  return [...mapa.values()];
}
export const habilitadoPara = (c, funcao) =>
  funcoesHabilitadas(c).some(
    (f) => normalizarFuncao(f) === normalizarFuncao(funcao),
  );
export function funcaoDoDia(c, d) {
  return d.funcaoAlocada || c.cargo;
}
