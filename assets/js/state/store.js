export function createDefaultState(now = new Date()) {
  return {
    mes: now.getMonth(),
    ano: now.getFullYear(),
    diaInicio: 1,
    analiseEnquadramentoAtiva: false,
    colaboradores: [
      {
        id: 1,
        nome: "Colaborador 1",
        sexo: "feminino",
        cargo: "Analista DP",
        horasSemana: 44,
      },
      {
        id: 2,
        nome: "Colaborador 2",
        sexo: "masculino",
        cargo: "Auxiliar de DP",
        horasSemana: 44,
      },
    ],
    proximoId: 3,
    coberturaAtiva: false,
    demandasCobertura: [],
    proximaDemandaId: 1,
    tipoEscala: "6x1",
    regimeJornada: "atual44",
    modoRegime: "automatico",
    politicaFeriados: "conta_folga",
    instrumentoColetivo: {
      identificacao: "",
      inicio: "",
      fim: "",
      compativelEC141: false,
      compensacaoDiaria: false,
      limiteDiario: 10,
      repousoMensal: false,
      regime12x36: false,
      compensacaoHoras: false,
      apuracaoInicio: "",
      apuracaoFim: "",
      limiteSemanalCompensado: 44,
    },
    instrumentoCompensacao: "nenhuma",
    feriados: [],
    feriadosLocais: [],
    feriadosConfigurados: [],
    feriadosExcluidos: [],
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
    folgasFimSemana: false,
    folgaDiasPermitidos: [0, 2, 3, 4, 5, 6],
    folgaCobertura: "cobertura",
    escalaGerada: null,
    conversao: null,
    destinoConversao: null,
    atividadeComercio: false,
    domingosPermitidos: false,
    feriadosPermitidos: false,
  };
}
export function replaceState(state, next) {
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, next);
}

// Migra somente os registros de demonstração originais intactos.
export function atualizarNomesExemplo(state) {
  const exemplos = [
    {
      id: 1,
      nome: "Carla Martin",
      cargo: "Analista DP",
      sexo: "feminino",
      horasSemana: 44,
    },
    {
      id: 2,
      nome: "Mateus Silva",
      cargo: "Auxiliar de DP",
      sexo: "masculino",
      horasSemana: 44,
    },
  ];
  const pessoas = [
    ...(state.colaboradores ?? []),
    ...(state.escalaGerada?.resultado ?? []).map((r) => r.colaborador),
    ...(state.escalaGerada?.validacoes ?? []).map((v) => v.colaborador),
  ];
  for (const pessoa of pessoas) {
    if (
      pessoa &&
      exemplos.some((exemplo) =>
        Object.entries(exemplo).every(([k, v]) => pessoa[k] === v),
      )
    )
      pessoa.nome = `Colaborador ${pessoa.id}`;
  }
}
