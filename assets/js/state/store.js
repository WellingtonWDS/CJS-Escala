export function createDefaultState(now = new Date()) {
  return {
    mes: now.getMonth(),
    ano: now.getFullYear(),
    diaInicio: 1,
    colaboradores: [
      {
        id: 1,
        nome: "Carla Martin",
        sexo: "feminino",
        cargo: "Analista DP",
        horasSemana: 44,
      },
      {
        id: 2,
        nome: "Mateus Silva",
        sexo: "masculino",
        cargo: "Auxiliar de DP",
        horasSemana: 44,
      },
    ],
    proximoId: 3,
    tipoEscala: "6x1",
    regimeJornada: "atual44",
    instrumentoCompensacao: "nenhuma",
    feriados: [],
    feriadosLocais: [],
    jornada: {
      entrada: "08:00",
      intInicio: "12:00",
      intFim: "13:00",
      saida: "18:00",
    },
    jornadaPorDia: {},
    horarioPorDia: false,
    turnosRevezamento: false,
    entradaTurnoB: "14:00",
    ancora12x36: "2026-01-01",
    diasTrabalho: [1, 2, 3, 4, 5, 6],
    folgaTipo: "rotativa",
    folgaDiasPermitidos: [0, 2, 3, 4, 5, 6],
    folgaCobertura: "cobertura",
    escalaGerada: null,
    atividadeComercio: false,
    domingosPermitidos: false,
    feriadosPermitidos: false,
  };
}
export function replaceState(state, next) {
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, next);
}
