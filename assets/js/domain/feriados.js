import { diasNoMes, isoDate, dateFromKey, addDays } from "./datas-horas.js";

export function calcPascoa(ano) {
  const a = ano % 19,
    b = Math.floor(ano / 100),
    c = ano % 100;
  const d = Math.floor(b / 4),
    e = b % 4,
    f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4),
    k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mesE = Math.floor((h + l - 7 * m + 114) / 31);
  const diaE = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mesE - 1, diaE);
}

export function feriadosNacionais(ano) {
  const pascoa = calcPascoa(ano);
  const fixos = [
    [0, 1, "Confraternização Universal"],
    [3, 21, "Tiradentes"],
    [4, 1, "Dia do Trabalho"],
    [8, 7, "Independência do Brasil"],
    [9, 12, "Nossa Senhora Aparecida"],
    [10, 2, "Finados"],
    [10, 15, "Proclamação da República"],
    [10, 20, "Dia Nacional de Zumbi e da Consciência Negra"],
    [11, 25, "Natal"],
  ].map(([m, d, nome]) => ({
    data: new Date(ano, m, d),
    nome,
    tipo: "nacional",
  }));

  /* Paixão de Cristo é incluída aqui como referência legal
     para o calendário, mas o tratamento pode depender do
     enquadramento/localidade; Carnaval e Corpus Christi ficam
     fora do conjunto automático de feriados nacionais. */
  const moveis = [
    { data: addDays(pascoa, -2), nome: "Paixão de Cristo", tipo: "religioso" },
  ];
  return [...fixos, ...moveis];
}

export function createFeriados(state) {
  function inicializarFeriadosDoMes() {
    const nacionais = feriadosNacionais(state.ano);
    const existentes = Array.isArray(state.feriados) ? state.feriados : [];
    const arquivo = new Map(
      (state.feriadosLocais || []).map((f) => [
        `${f.ano}-${f.mes}-${f.dia}`,
        f,
      ]),
    );
    existentes
      .filter((f) => f.tipo === "municipal" || f.tipo === "local")
      .forEach((f) => arquivo.set(`${f.ano}-${f.mes}-${f.dia}`, f));
    state.feriadosLocais = [...arquivo.values()];
    const municipais = state.feriadosLocais.filter(
      (f) => f.mes === state.mes && f.ano === state.ano,
    );
    const novos = nacionais
      .filter((f) => f.data.getMonth() === state.mes)
      .map((f) => ({
        dia: f.data.getDate(),
        nome: f.nome,
        tipo: f.tipo,
        trabalhado: false,
      }));
    state.feriados = [
      ...novos,
      ...municipais.filter((f) => f.dia <= diasNoMes(state.mes, state.ano)),
    ].sort((a, b) => a.dia - b.dia);
  }

  function feriadoDoDia(dia) {
    return state.feriados.find((f) => Number(f.dia) === Number(dia)) || null;
  }

  function feriadoDaData(data) {
    const date = dateFromKey(data);
    if (!date) return null;
    const key = isoDate(date.getFullYear(), date.getMonth(), date.getDate());
    const atual = state.feriados.find((f) => {
      const fd = isoDate(state.ano, state.mes, Number(f.dia));
      return fd === key;
    });
    if (atual) return atual;

    /* Para as semanas de borda, a grade pode mostrar dias do mês
     anterior/posterior. Nesses dias usamos apenas os feriados
     nacionais/religiosos do calendário; feriados municipais
     permanecem limitados ao mês configurado. */
    const nacional = feriadosNacionais(date.getFullYear()).find(
      (f) =>
        isoDate(f.data.getFullYear(), f.data.getMonth(), f.data.getDate()) ===
        key,
    );
    return nacional
      ? { ...nacional, dia: date.getDate(), trabalhado: false }
      : null;
  }

  return {
    inicializarFeriadosDoMes,
    feriadoDoDia,
    feriadoDaData,
    feriadosNacionais,
    calcPascoa,
  };
}
