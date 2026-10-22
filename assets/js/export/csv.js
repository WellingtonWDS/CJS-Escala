import {
  dateFromKey,
  minToTime,
  fmtHoras,
  addDays,
  isoDate,
} from "../domain/datas-horas.js";
import { referenciaDia, VERSAO_REGRAS } from "../domain/ec141.js";
import { createDomain } from "../domain/index.js";
import { csvCell } from "../shared/formatacao.js";
export function gerarCsv(state) {
  const { resultado } = state.escalaGerada;
  const dominio = resultado.some((r) => r.colaborador.quadroDominio);
  const domain = createDomain(state);
  const validacoes = resultado.map((r) => ({
    r,
    issues: domain.validarLegal(
      r.colaborador,
      r.dias,
      r.diasContexto,
      r.diasApuracao,
    ),
  }));
  const erros = validacoes.some((v) =>
    v.issues.some((i) => i.severidade === "erro"),
  );
  const pendentes = validacoes.some((v) =>
    v.issues.some((i) => ["alerta", "pendencia"].includes(i.severidade)),
  );
  const computoCct =
    state.instrumentoColetivo?.intervaloComputado ||
    state.instrumentoColetivo?.creditoNoturnoUmaHora;
  const linhas = [
    [
      "Situação",
      erros
        ? "RASCUNHO — INCOMPATIBILIDADES"
        : pendentes
          ? "RASCUNHO — VERIFICAÇÕES PENDENTES"
          : "SEM INCOMPATIBILIDADE NAS REGRAS VERIFICADAS",
    ],
    [
      "Referência",
      "EC 141 — texto de 16/10/2026 fornecido para a configuração",
    ],
    ["Versão das regras", VERSAO_REGRAS],
    [
      "Modo",
      state.modoRegime === "simulacao" ? "SIMULAÇÃO" : "Vigência automática",
    ],
    [
      "Colaborador",
      "Cargo",
      "Data",
      "Status",
      "Entrada",
      "Saída",
      "Intervalo",
      "Horas trabalhadas",
      "Horas previstas/abono",
      "Alvo semanal",
      "Contrato de referência",
      "Fase na data",
      "Limite semanal aplicado",
      "Enquadramento",
      "Aditamento informado",
      "Data da saída",
      ...(dominio ? ["Código Domínio", "Admissão", "CTPS", "Série"] : []),
      ...(computoCct
        ? [
            "Intervalo computado CCT",
            "Crédito noturno CCT",
            "Horas computadas com CCT",
            "Instrumento coletivo",
          ]
        : []),
    ],
  ];
  if (state.empresaDominio)
    linhas.splice(
      1,
      0,
      ["Empresa", state.empresaDominio.nome],
      ["CNPJ", state.empresaDominio.cnpj],
      ["Endereço", state.empresaDominio.endereco],
    );
  for (const { r } of validacoes)
    for (const d of r.dias) {
      const dt = dateFromKey(d.data);
      if (
        dt.getFullYear() !== state.ano ||
        dt.getMonth() !== state.mes ||
        dt.getDate() < state.diaInicio
      )
        continue;
      const trabalha = ["T", "FE"].includes(d.status);
      linhas.push([
        r.colaborador.nome,
        r.colaborador.cargo,
        d.data,
        d.status,
        trabalha ? minToTime(d.entradaMin) : "",
        trabalha ? minToTime(d.saidaMin) : "",
        trabalha ? fmtHoras(d.intervaloMin / 60) : "",
        fmtHoras(d.horas),
        fmtHoras(d.horasPrevistas),
        fmtHoras(d.alvoSemana ?? r.colaborador.horasSemana),
        fmtHoras(r.colaborador.horasSemana),
        referenciaDia(state, d.data, r.colaborador).nome,
        referenciaDia(state, d.data, r.colaborador).semLimiteJornada
          ? "Duração dispensada conforme declaração do art. 8º"
          : fmtHoras(referenciaDia(state, d.data, r.colaborador).horas),
        state.analiseEnquadramentoAtiva === true
          ? r.colaborador.ec141?.tipo || "geral"
          : "geral",
        state.analiseEnquadramentoAtiva === true
          ? r.colaborador.ec141?.dataAditamento || ""
          : "",
        trabalha
          ? (() => {
              const saida = addDays(dt, Math.floor(d.saidaMin / 1440));
              return isoDate(
                saida.getFullYear(),
                saida.getMonth(),
                saida.getDate(),
              );
            })()
          : "",
        ...(dominio
          ? [
              r.colaborador.quadroDominio?.codigo || "",
              r.colaborador.quadroDominio?.admissaoIso || "",
              r.colaborador.quadroDominio?.ctps || "",
              r.colaborador.quadroDominio?.serie || "",
            ]
          : []),
        ...(computoCct
          ? [
              fmtHoras(d.creditoIntervaloCCT || 0),
              fmtHoras(d.creditoNoturnoCCT || 0),
              fmtHoras(d.horasComputadasCCT ?? d.horas),
              state.instrumentoColetivo?.identificacao || "",
            ]
          : []),
      ]);
    }
  linhas.push(
    [],
    ["Ocorrências — conferir antes de utilizar a escala"],
    ["Colaborador", "Data", "Severidade", "Tipo", "Descrição"],
  );
  for (const { r, issues } of validacoes)
    for (const i of issues)
      linhas.push([
        r.colaborador.nome,
        i.data || "",
        i.severidade,
        i.tipo,
        i.mensagem,
      ]);
  return (
    "\uFEFF" + linhas.map((l) => l.map(csvCell).join(";")).join("\n") + "\n"
  );
}
