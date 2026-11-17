module.exports = async function cenario(fixa = true) {
  const { createDefaultState } = await import("../../assets/js/state/store.js");
  const s = createDefaultState(new Date(2027, 1, 1));
  Object.assign(s, {
    modeloEscala: fixa ? "fixa" : "dinamica",
    dataReferenciaFixa: "2027-02-08",
    tipoEscala: "6x1",
    horarioPorDia: true,
    instrumentoCompensacao: "nenhuma",
    jornada: {
      entrada: "08:00",
      intInicio: "11:00",
      intFim: "13:00",
      saida: "18:24",
    },
    folgaTipo: "fixa",
    folgaDiasPermitidos: [0],
    feriadosExcluidos: ["2027-02-09"],
    coberturaAtiva: true,
    colaboradores: [
      "Motorista",
      "Motorista",
      "Motorista",
      "Vendedor",
      "Vendedor",
      "Administrativo",
      "Ajudante",
    ].map((cargo, i) => ({
      id: i + 1,
      nome: `Colaborador ${i + 1}`,
      sexo: "masculino",
      horasSemana: 44,
      cargo,
    })),
    proximoId: 8,
    destinoConversao: {
      periodo: "2027-02",
      fase: "transicao42",
      folgas: "fim_semana",
    },
  });
  s.jornadaPorDia[6] = {
    entrada: "08:00",
    intInicio: "",
    intFim: "",
    saida: "14:00",
  };
  s.demandasCobertura = ["Motorista", "Vendedor"].flatMap((funcao, i) => [
    {
      id: i * 2 + 1,
      funcao,
      inicio: "08:00",
      fim: "18:24",
      diasSemana: [1, 2, 3, 4, 5],
      minimo: 1,
      incluirFeriados: true,
    },
    {
      id: i * 2 + 2,
      funcao,
      inicio: "08:00",
      fim: "14:00",
      diasSemana: [6],
      minimo: 1,
      incluirFeriados: true,
    },
  ]);
  return s;
};
