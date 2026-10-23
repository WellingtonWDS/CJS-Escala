import {
  diagnosticarEquipe,
  TITULOS_DIAGNOSTICO,
  CAUSAS_DIAGNOSTICO,
} from "../domain/diagnostico-equipe.js";
import { funcaoDoDia } from "../domain/funcoes.js";
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
  const ajustes = resultado.some((r) =>
    r.dias.some((d) => d.funcaoAlocada || d.ajusteAutomatico),
  );
  const restricoes = resultado.some((r) => r.colaborador.restricoes);
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
  const sexoEstimado = state.colaboradores.some((c) => c.sexoInferencia);
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
      ...(ajustes
        ? ["Função alocada no dia", "Ajuste de cobertura aplicado"]
        : []),
      ...(restricoes
        ? ["Restrição individual", "Horas dispensadas da meta de alocação"]
        : []),
      ...(dominio ? ["Código Domínio", "Admissão", "CTPS", "Série"] : []),
      ...(sexoEstimado
        ? [
            "Sexo cadastrado",
            "Origem do sexo",
            "Predominância na base de nomes",
          ]
        : []),
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
        ...(ajustes
          ? [
              trabalha ? funcaoDoDia(r.colaborador, d) : "",
              d.ajusteAutomatico ? "Sim" : "",
            ]
          : []),
        ...(restricoes
          ? [
              d.restricao?.descricao || d.ajusteRestricao || "",
              fmtHoras(d.horasDispensadasRestricao || 0),
            ]
          : []),
        ...(dominio
          ? [
              r.colaborador.quadroDominio?.codigo || "",
              r.colaborador.quadroDominio?.admissaoIso || "",
              r.colaborador.quadroDominio?.ctps || "",
              r.colaborador.quadroDominio?.serie || "",
            ]
          : []),
        ...(sexoEstimado
          ? [
              r.colaborador.sexo,
              r.colaborador.sexoInferencia
                ? `Estimado pelo prenome — ${r.colaborador.sexoInferencia.fonte || "IBGE"}`
                : "Informado",
              r.colaborador.sexoInferencia
                ? `${(r.colaborador.sexoInferencia.predominancia * 100).toFixed(2)}%`
                : "",
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
  if (state.coberturaAtiva) {
    const d = diagnosticarEquipe(state, state.escalaGerada.resultado);
    linhas.push(
      [],
      ["Diagnóstico da equipe e contratação", TITULOS_DIAGNOSTICO[d.status]],
      [
        "Função",
        "Dias / horários e faltantes",
        "Causa",
        "Datas",
        "Ocorrências",
      ],
    );
    for (const g of d.grupos)
      linhas.push([
        g.funcao,
        g.resumo,
        CAUSAS_DIAGNOSTICO[g.tipo],
        g.datas.join(", "),
        g.ocorrencias,
      ]);
    linhas.push(
      [],
      ["Verificações de capacidade — não somar como contratações"],
    );
    for (const p of d.provas) linhas.push([p.tipo, p.mensagem]);
    for (const aviso of [...d.avisos, ...d.limitacoes])
      linhas.push(["Observação", aviso]);
    linhas.push([
      "Limite da análise",
      "Capacidade potencial não garante viabilidade. Ausências temporárias podem exigir reforço temporário. Uma pessoa não é contada em duas funções simultâneas.",
    ]);
  }
  return (
    "\uFEFF" + linhas.map((l) => l.map(csvCell).join(";")).join("\n") + "\n"
  );
}
