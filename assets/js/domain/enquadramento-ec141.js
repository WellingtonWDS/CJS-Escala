import {
  dataValida,
  PUBLICACAO,
  PRAZO_PUBLICO,
  excecaoArt8,
  referenciaDia,
  instrumentoValido,
} from "./ec141.js";
import { diasNoMes, isoDate } from "./datas-horas.js";
const issue = (tipo, severidade, mensagem, data = null) => ({
  tipo,
  severidade,
  mensagem,
  data,
});
export function validarEnquadramento(state, c, dias) {
  const out = [];
  const analiseAtiva = state.analiseEnquadramentoAtiva === true;
  const e = analiseAtiva ? c.ec141 || {} : {};
  const vigentes = dias.filter((d) => d.data >= PUBLICACAO);
  if (!vigentes.length) return out;
  if (state.modoRegime === "simulacao")
    out.push(
      issue(
        "SIMULACAO",
        "pendencia",
        "Simulação de fase: os limites escolhidos não representam automaticamente a vigência nas datas da escala.",
      ),
    );
  const informado = (v) =>
    v !== "" && v != null && Number.isFinite(Number(v)) && Number(v) >= 0;
  if (analiseAtiva) {
    if (!informado(e.salarioAnterior) || !informado(e.salarioAtual))
      out.push(
        issue(
          "PROTECAO_SALARIAL",
          "pendencia",
          "Proteção salarial não avaliada: informe remuneração anterior e atual. Não há alteração automática de salários.",
        ),
      );
    else if (Number(e.salarioAtual) < Number(e.salarioAnterior))
      out.push(
        issue(
          "REDUCAO_SALARIAL",
          "erro",
          "Remuneração atual inferior à anterior: incompatível com a proteção salarial da EC 141.",
        ),
      );
    if (informado(e.pisoAnterior) && informado(e.pisoAtual)) {
      if (Number(e.pisoAtual) < Number(e.pisoAnterior))
        out.push(
          issue(
            "REDUCAO_PISO",
            "erro",
            "Piso salarial atual inferior ao anterior.",
          ),
        );
    } else
      out.push(
        issue(
          "PROTECAO_PISO",
          "pendencia",
          "Proteção do piso não avaliada: informe os pisos anterior e atual, inclusive zero quando não houver piso específico.",
        ),
      );
    if (e.tipo === "art8") {
      if (e.empregadoPublico)
        out.push(
          issue(
            "ART8_EMPREGADO_PUBLICO",
            "erro",
            "A exceção do art. 8º não se aplica a empregado público. Aplicados os limites gerais.",
          ),
        );
      else if (!excecaoArt8(c) && !e.jornadaMantida)
        out.push(
          issue(
            "ART8_REQUISITOS",
            "erro",
            "Art. 8º sem requisitos demonstrados: diploma superior e remuneração de pelo menos 2,5 vezes o teto RGPS do período são obrigatórios. Aplicados os limites gerais.",
          ),
        );
      if (excecaoArt8(c))
        out.push(
          issue(
            "ART8_ENQUADRAMENTO",
            "pendencia",
            "Exceção de duração/controle aplicada aos dados declarados do art. 8º. Confira diploma, remuneração, teto RGPS do período e ausência de previsão coletiva ou liberalidade que mantenha a jornada. O repouso continua protegido.",
          ),
        );
    }
    if (e.tipo === "contrato_publico") {
      if (!e.contratoVigente || !e.maoDeObraDireta)
        out.push(
          issue(
            "ART9_REQUISITOS",
            "erro",
            "Diferimento do art. 9º exige contrato vigente na publicação e execução com emprego direto de mão de obra. Aplicados os prazos gerais.",
          ),
        );
      if (
        e.dataAditamento &&
        (!dataValida(e.dataAditamento) ||
          e.dataAditamento < PUBLICACAO ||
          e.dataAditamento > PRAZO_PUBLICO)
      )
        out.push(
          issue(
            "ART9_ADITAMENTO",
            "erro",
            "Data do aditamento inválida ou fora de 16/10/2026 a 16/10/2027. O limite máximo não é prorrogado.",
          ),
        );
      out.push(
        issue(
          "ART9_ENQUADRAMENTO",
          "pendencia",
          "Art. 9º calculado conforme declaração do contrato e aditamento, sujeito à conferência do instrumento. Sem aditamento, a redução é aplicada no prazo máximo de 16/10/2027; o segundo repouso segue a vigência geral.",
        ),
      );
    }
  }
  if (state.tipoEscala === "12x36")
    out.push(
      issue(
        "REGIME_ESPECIAL",
        "pendencia",
        "12×36: a conformidade à EC 141 exige enquadramento específico. Plantões, descanso e limites gerais são verificados; eventual regra diferenciada não é presumida.",
      ),
    );
  const i = state.instrumentoColetivo || {};
  if (state.instrumentoCompensacao !== "nenhuma") {
    if (state.instrumentoCompensacao === "banco")
      out.push(
        issue(
          "BANCO_HORAS",
          "pendencia",
          "Banco de horas não dispensa os limites gerais nem comprova compensação. Apuração de créditos/débitos e instrumento do período devem ser conferidos.",
        ),
      );
    if (
      state.instrumentoCompensacao === "act_cct" &&
      (!String(i.identificacao || "").trim() ||
        !dataValida(i.inicio) ||
        !dataValida(i.fim) ||
        i.inicio > i.fim)
    )
      out.push(
        issue(
          "INSTRUMENTO_COLETIVO",
          "erro",
          "Informe identificação e datas válidas de vigência do ACT/CCT.",
        ),
      );
    if (
      state.instrumentoCompensacao === "act_cct" &&
      vigentes.some((d) => d.data >= "2026-12-16") &&
      !i.compativelEC141
    )
      out.push(
        issue(
          "CLAUSULA_INCOMPATIVEL",
          "erro",
          "A partir de 16/12/2026, o ACT/CCT não pode ser usado sem confirmação da compatibilidade das cláusulas com a EC 141.",
        ),
      );
    if (
      state.instrumentoCompensacao === "act_cct" &&
      dataValida(i.inicio) &&
      dataValida(i.fim) &&
      vigentes.some((d) => d.data < i.inicio || d.data > i.fim)
    )
      out.push(
        issue(
          "INSTRUMENTO_FORA_VIGENCIA",
          "erro",
          "Há jornadas fora da vigência do ACT/CCT informado. A autorização não é estendida a essas datas.",
        ),
      );
    if (state.instrumentoCompensacao === "act_cct")
      out.push(
        issue(
          "DOCUMENTO_COLETIVO",
          "pendencia",
          "Instrumento coletivo declarado: a ferramenta confere datas e parâmetros, mas a validade e o conteúdo da cláusula exigem conferência documental.",
        ),
      );
  }
  if (
    state.politicaFeriados !== "adicional" &&
    !state.folgasFimSemana &&
    dias.some((d) => d.feriado && !d.feriado.trabalhado)
  )
    out.push(
      issue(
        "FERIADO_REPOUSO",
        "pendencia",
        "Feriado contado entre as folgas conforme política da empresa. A EC 141, por si só, não autoriza essa substituição em todos os casos; confira o fundamento aplicável. O abono não comprova repouso compensatório.",
      ),
    );
  return out;
}
export function validarRepousoMensal(state, c, dias) {
  if (!state.instrumentoColetivo?.repousoMensal) return [];
  const n = diasNoMes(state.mes, state.ano);
  const inicio = isoDate(state.ano, state.mes, 1),
    fim = isoDate(state.ano, state.mes, n);
  const mes = dias.filter((d) => d.data >= inicio && d.data <= fim);
  if (
    !instrumentoValido(state, inicio, "repousoMensal") ||
    !instrumentoValido(state, fim, "repousoMensal")
  )
    return [
      issue(
        "REPOUSO_MENSAL_INSTRUMENTO",
        "erro",
        "Compensação mensal exige ACT/CCT compatível e vigente durante todo o mês apurado.",
      ),
    ];
  if (mes.length !== n)
    return [
      issue(
        "REPOUSO_MENSAL_INCOMPLETO",
        "pendencia",
        "Não há todos os dias do mês para apurar a compensação de repousos.",
      ),
    ];
  const refs = mes.map((d) => referenciaDia(state, d.data, c).folgas);
  if (new Set(refs).size > 1)
    return [
      issue(
        "REPOUSO_MENSAL_TRANSICAO",
        "pendencia",
        "O mês atravessa uma mudança de vigência do repouso. Não é presumido rateio da compensação mensal: confira o enquadramento da transição.",
      ),
    ];
  if (refs[0] < 2)
    return [
      issue(
        "REPOUSO_MENSAL_ANTERIOR",
        "info",
        "O segundo repouso ainda não está vigente neste mês; aplicada a referência geral da fase.",
      ),
    ];
  const folgas = mes.filter((d) => ["F", "FC"].includes(d.status)).length;
  const minimo = Math.ceil((2 * n) / 7);
  return [
    issue(
      "REPOUSO_MENSAL",
      folgas < minimo ? "erro" : "pendencia",
      `${folgas} repousos em ${n} dias; referência de média semanal: 2 × ${n}/7, mínimo inteiro ${minimo}. ${folgas < minimo ? "Quantidade insuficiente." : "Quantidade atingida; conferir a cláusula e o critério de média mensal declarado."} A garantia de repouso dentro de sete dias é verificada separadamente.`,
    ),
  ];
}
