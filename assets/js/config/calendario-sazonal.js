/** Calendário visual brasileiro. Não representa feriados nem altera escalas. */
export const FUSO_SAZONAL = "America/Sao_Paulo";
const dia = 86400000;
const chave = (d) => d.toISOString().slice(0, 10);
const data = (ano, mes, diaMes) => new Date(Date.UTC(ano, mes - 1, diaMes));
const somar = (d, dias) => new Date(d.getTime() + dias * dia);
const domingo = (ano, mes, numero) => {
  const primeiro = data(ano, mes, 1);
  return somar(primeiro, ((7 - primeiro.getUTCDay()) % 7) + 7 * (numero - 1));
};
export function pascoa(ano) {
  if (!Number.isInteger(ano) || ano < 1583 || ano > 9998)
    throw new RangeError("Ano fora do calendário gregoriano suportado.");
  const a = ano % 19,
    b = Math.floor(ano / 100),
    c = ano % 100,
    d = Math.floor(b / 4),
    e = b % 4,
    f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4),
    k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7,
    m = Math.floor((a + 11 * h + 22 * l) / 451),
    n = h + l - 7 * m + 114;
  return data(ano, Math.floor(n / 31), (n % 31) + 1);
}
export function calendarioSazonal(ano) {
  const p = pascoa(ano),
    carnaval = somar(p, -47),
    maes = domingo(ano, 5, 2),
    pais = domingo(ano, 8, 2);
  const itens = [];
  const periodo = (
    id,
    nome,
    mensagem,
    inicio,
    fim,
    icone,
    efeito = "balanco",
    prioridade = 40,
  ) =>
    itens.push({
      id,
      nome,
      mensagem,
      inicio: chave(inicio),
      fim: chave(fim),
      icone,
      efeito,
      prioridade,
    });
  const fixo = (
    id,
    nome,
    mensagem,
    mes,
    inicio,
    fim,
    icone,
    efeito,
    prioridade,
  ) =>
    periodo(
      id,
      nome,
      mensagem,
      data(ano, mes, inicio),
      data(ano, mes, fim),
      icone,
      efeito,
      prioridade,
    );
  periodo(
    "ano-novo",
    "Ano Novo",
    "Feliz Ano Novo!",
    data(ano, 12, 26),
    data(ano + 1, 1, 6),
    "fogos",
    "fogos",
    60,
  );
  periodo(
    "carnaval",
    "Carnaval",
    "Bom Carnaval!",
    somar(carnaval, -10),
    somar(carnaval, 1),
    "mascara",
    "confete",
    50,
  );
  fixo(
    "mulheres",
    "Dia Internacional da Mulher",
    "Feliz Dia da Mulher!",
    3,
    6,
    8,
    "flor",
    "balanco",
    70,
  );
  periodo(
    "pascoa",
    "Páscoa",
    "Feliz Páscoa!",
    somar(p, -14),
    p,
    "pascoa",
    "balanco",
    30,
  );
  fixo(
    "tiradentes",
    "Tiradentes",
    "Cidadania se constrói juntos!",
    4,
    21,
    21,
    "brasil",
  );
  fixo(
    "contabilidade",
    "Dia do Profissional da Contabilidade",
    "Viva a contabilidade!",
    4,
    24,
    25,
    "contabilidade",
  );
  periodo(
    "trabalho",
    "Dia do Trabalho",
    "Feliz Dia do Trabalho!",
    data(ano, 4, 28),
    data(ano, 5, 1),
    "trabalho",
  );
  periodo(
    "maes",
    "Dia das Mães",
    "Feliz Dia das Mães!",
    somar(maes, -5),
    maes,
    "coracao",
  );
  periodo(
    "juninas",
    "Festas juninas e julinas",
    "Bom arraiá!",
    data(ano, 6, 1),
    data(ano, 7, 7),
    "arraia",
    "balanco",
    10,
  );
  fixo(
    "namorados",
    "Dia dos Namorados",
    "Feliz Dia dos Namorados!",
    6,
    8,
    12,
    "coracao",
  );
  fixo("amizade", "Dia do Amigo", "Viva a amizade!", 7, 17, 20, "amizade");
  periodo(
    "pais",
    "Dia dos Pais",
    "Feliz Dia dos Pais!",
    somar(pais, -5),
    pais,
    "presente",
  );
  fixo(
    "independencia",
    "Independência do Brasil",
    "Viva o Brasil!",
    9,
    1,
    7,
    "brasil",
  );
  fixo(
    "contador",
    "Dia do Contador",
    "Feliz Dia do Contador!",
    9,
    19,
    22,
    "contabilidade",
  );
  fixo("primavera", "Primavera", "Bem-vinda, primavera!", 9, 23, 27, "flor");
  fixo(
    "criancas",
    "Dia das Crianças",
    "Feliz Dia das Crianças!",
    10,
    8,
    12,
    "pipa",
  );
  fixo(
    "halloween",
    "Halloween",
    "Doces ou travessuras?",
    10,
    25,
    31,
    "abobora",
  );
  fixo(
    "republica",
    "Proclamação da República",
    "Viva a cidadania!",
    11,
    15,
    15,
    "brasil",
  );
  fixo(
    "consciencia-negra",
    "Dia da Consciência Negra",
    "Respeito, igualdade e consciência.",
    11,
    20,
    20,
    "igualdade",
  );
  periodo(
    "natal",
    "Natal",
    "Feliz Natal!",
    data(ano, 11, 1),
    data(ano, 12, 25),
    "natal",
    "balanco",
    10,
  );
  return itens;
}
export function dataSazonal(agora = new Date()) {
  if (!(agora instanceof Date) || !Number.isFinite(agora.getTime()))
    throw new TypeError("Data inválida.");
  const partes = new Intl.DateTimeFormat("en", {
    timeZone: FUSO_SAZONAL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);
  const campo = (nome) => partes.find((p) => p.type === nome).value;
  return `${campo("year")}-${campo("month")}-${campo("day")}`;
}
export function temaSazonal(agora = new Date()) {
  const hoje = dataSazonal(agora),
    ano = Number(hoje.slice(0, 4));
  // O domingo de Páscoa prevalece quando coincide com outra homenagem.
  const prioridade = (t) =>
    t.id === "pascoa" && t.fim === hoje ? 80 : t.prioridade;
  return (
    [
      ...calendarioSazonal(ano),
      ...calendarioSazonal(ano - 1).filter((t) => t.id === "ano-novo"),
    ]
      .filter((t) => t.inicio <= hoje && hoje <= t.fim)
      .sort((a, b) => prioridade(b) - prioridade(a))[0] || null
  );
}
