import { createDefaultState } from "../../assets/js/state/store.js";

// Cenário fictício e estável; não acompanha automaticamente o mês de produção.
export function criarEstadoDemo() {
  const state = createDefaultState(new Date(2026, 9, 1));
  Object.assign(state, {
    colaboradores: Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      nome: `Colaborador Demo ${i + 1}`,
      sexo: i % 2 ? "feminino" : "masculino",
      cargo: i < 3 ? "Atendente" : "Supervisor",
      horasSemana: 44,
    })),
    proximoId: 6,
    horarioPorDia: true,
    jornada: { entrada: "08:00", intInicio: "11:00", intFim: "13:00", saida: "18:00" },
    folgaTipo: "fixa",
    folgaDiasPermitidos: [0],
    coberturaAtiva: true,
    destinoConversao: { periodo: "2028-02", fase: "automatico", folgas: "fim_semana" },
  });
  state.jornadaPorDia = Object.fromEntries([1,2,3,4,5,6].map(d => [d,
    d === 6 ? {entrada:"08:00", intInicio:"", intFim:"", saida:"12:00"} : structuredClone(state.jornada)
  ]));
  state.demandasCobertura = ["Atendente", "Supervisor"].flatMap((funcao, i) => [
    { id: i * 2 + 1, funcao, inicio: "09:00", fim: "11:00", minimo: 1, diasSemana: [1,2,3,4,5], incluirFeriados: false },
    { id: i * 2 + 2, funcao, inicio: "14:00", fim: "17:00", minimo: 1, diasSemana: [1,2,3,4,5], incluirFeriados: false },
  ]);
  state.proximaDemandaId = 5;
  return state;
}
