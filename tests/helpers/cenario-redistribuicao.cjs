module.exports = async (fixa = false) => {
  const { createDefaultState } = await import("../../assets/js/state/store.js");
  const { createDomain } = await import("../../assets/js/domain/index.js");
  const s = createDefaultState(new Date(2026, 9, 26));
  Object.assign(s, {
    modeloEscala: fixa ? "fixa" : "dinamica",
    dataReferenciaFixa: "2026-10-26",
    tipoEscala: "5x2",
    aplicarProposta5x2: true,
    folgasFimSemana: true,
    diasTrabalho: [1, 2, 3, 4, 5],
    diaInicio: 26,
    modoRegime: "simulacao",
    regimeJornada: "definitivo40",
    coberturaAtiva: true,
    feriados: [],
    feriadosExcluidos: ["2026-10-12"],
  });
  s.colaboradores = [1, 2].map((id) => ({
    id,
    nome: `Colaborador ${id}`,
    sexo: "masculino",
    cargo: "Atendente",
    horasSemana: 20,
    quadroDominio: {
      origem: "manual",
      pendencias: [],
      ciclo: {},
      cargaConfirmada: true,
      ativo: true,
      tipo: "semanal",
      modelo: "5x2",
      semana: Object.fromEntries(
        [0, 1, 2, 3, 4, 5, 6].map((wd) => [
          wd,
          wd === 0 || wd === 6
            ? { status: "folga" }
            : {
                status: "trabalho",
                jornada: {
                  entrada: id === 1 ? "08:00" : "12:00",
                  saida: id === 1 ? "12:00" : "16:00",
                  intInicio: "",
                  intFim: "",
                },
              },
        ]),
      ),
    },
  }));
  s.demandasCobertura = [
    {
      id: 1,
      funcao: "Atendente",
      inicio: "09:00",
      fim: "17:00",
      minimo: 1,
      diasSemana: [1, 2, 3, 4, 5],
      incluirFeriados: false,
    },
  ];
  s.escalaGerada = createDomain(s).gerarDadosEscala();
  return s;
};
