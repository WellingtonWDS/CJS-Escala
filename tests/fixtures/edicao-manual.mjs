import { createDefaultState } from "../../assets/js/state/store.js";
import { createDomain } from "../../assets/js/domain/index.js";
import {
  assinaturaAjustes,
  substituirDiasDaEscala,
  criarFolga,
  criarHorarioCompativel,
} from "../../assets/js/domain/ajustes-cobertura.js";
export function cenario({ cobertura = true, pessoas = 2 } = {}) {
  const s = createDefaultState(new Date(2026, 9, 26));
  Object.assign(s, {
    diaInicio: 26,
    tipoEscala: "5x2",
    diasTrabalho: [1, 2, 3, 4, 5, 6],
    modoRegime: "simulacao",
    regimeJornada: "definitivo40",
    coberturaAtiva: cobertura,
    feriados: [],
    feriadosExcluidos: ["2026-10-12"],
    jornada: {
      entrada: "08:00",
      intInicio: "12:00",
      intFim: "13:00",
      saida: "17:00",
    },
  });
  s.colaboradores = Array.from({ length: pessoas }, (_, i) => ({
    id: i + 1,
    nome: `Colaborador de Exemplo ${i + 1}`,
    cargo: "Atendente",
    sexo: "masculino",
    horasSemana: 40,
  }));
  s.demandasCobertura = [
    {
      id: 1,
      funcao: "Atendente",
      inicio: "09:00",
      fim: "12:00",
      minimo: 1,
      diasSemana: [1, 2, 3, 4, 5, 6],
      incluirFeriados: false,
    },
  ];
  s.escalaGerada = createDomain(s).gerarDadosEscala();
  for (const r of s.escalaGerada.resultado) {
    const modelo = r.dias.find((d) => d.status === "T");
    s.escalaGerada = substituirDiasDaEscala(
      s.escalaGerada,
      r.dias.map((d) => ({
        colaboradorId: r.colaborador.id,
        data: d.data,
        depois: [0, r.colaborador.id === 1 ? 1 : 2].includes(d.weekday)
          ? criarFolga(d)
          : criarHorarioCompativel(
              s,
              r.colaborador,
              d,
              modelo,
              480,
              "Atendente",
            ),
      })),
    );
  }
  return s;
}
export function editar(s, id = 1, data = "2026-10-26", status = "T") {
  const r = s.escalaGerada.resultado.find((r) => r.colaborador.id === id),
    antes = structuredClone(r.dias.find((d) => d.data === data));
  const modelo = r.dias.find((d) => d.status === "T");
  const depois = {
    ...(status === "F"
      ? criarFolga(antes)
      : criarHorarioCompativel(
          s,
          r.colaborador,
          antes,
          modelo,
          480,
          "Atendente",
        )),
    ajusteManual: true,
  };
  s.escalaGerada = substituirDiasDaEscala(s.escalaGerada, [
    { colaboradorId: id, data, depois },
  ]);
  s.escalaGerada.ultimaEdicaoManual = {
    colaboradorId: id,
    data,
    antes,
    assinatura: assinaturaAjustes(s),
  };
  return s;
}
