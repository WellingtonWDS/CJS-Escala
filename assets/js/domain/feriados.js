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
  const chave = (f) => isoDate(f.ano, f.mes, Number(f.dia));
  function arquivarFeriados() {
    const arquivo = new Map(
      (state.feriadosConfigurados || []).map((f) => [chave(f), f]),
    );
    for (const f of state.feriados || []) {
      f.ano ??= state.ano;
      f.mes ??= state.mes;
      const registro = { ...f };
      arquivo.set(chave(registro), registro);
    }
    state.feriadosConfigurados = [...arquivo.values()];
    const locais = new Map(
      (state.feriadosLocais || []).map((f) => [chave(f), f]),
    );
    for (const f of arquivo.values())
      if (["municipal", "local"].includes(f.tipo)) locais.set(chave(f), f);
    state.feriadosLocais = [...locais.values()];
  }
  function inicializarFeriadosDoMes() {
    arquivarFeriados();
    const arquivo = new Map(
      (state.feriadosConfigurados || []).map((f) => [chave(f), f]),
    );
    const calendario = new Map(
      feriadosNacionais(state.ano)
        .filter((f) => f.data.getMonth() === state.mes)
        .map((f) => {
          const registro = {
            ...f,
            dia: f.data.getDate(),
            mes: state.mes,
            ano: state.ano,
            trabalhado: false,
          };
          return [chave(registro), registro];
        }),
    );
    for (const f of [...(state.feriadosLocais || []), ...arquivo.values()])
      if (
        f.ano === state.ano &&
        f.mes === state.mes &&
        Number(f.dia) <= diasNoMes(state.mes, state.ano)
      )
        calendario.set(chave(f), f);
    const excluidos = new Set(state.feriadosExcluidos || []);
    state.feriados = [...calendario.values()]
      .filter((f) => !excluidos.has(chave(f)))
      .sort((a, b) => a.dia - b.dia);
  }
  function feriadoDoDia(dia) {
    return feriadoDaData(isoDate(state.ano, state.mes, Number(dia)));
  }
  function feriadoDaData(data) {
    if (state.modeloEscala === "fixa") return null;
    const date = dateFromKey(data);
    if (!date || Number.isNaN(date.getTime())) return null;
    const atual = (state.feriados || []).find(
      (f) =>
        isoDate(f.ano ?? state.ano, f.mes ?? state.mes, Number(f.dia)) === data,
    );
    if (atual) return atual;
    if ((state.feriadosExcluidos || []).includes(data)) return null;
    const salvo = [
      ...(state.feriadosConfigurados || []),
      ...(state.feriadosLocais || []),
    ].find((f) => chave(f) === data);
    if (salvo) return salvo;
    const nacional = feriadosNacionais(date.getFullYear()).find(
      (f) =>
        isoDate(f.data.getFullYear(), f.data.getMonth(), f.data.getDate()) ===
        data,
    );
    return nacional
      ? {
          ...nacional,
          dia: date.getDate(),
          mes: date.getMonth(),
          ano: date.getFullYear(),
          trabalhado: false,
        }
      : null;
  }
  return {
    inicializarFeriadosDoMes,
    arquivarFeriados,
    feriadoDoDia,
    feriadoDaData,
    feriadosNacionais,
    calcPascoa,
  };
}
