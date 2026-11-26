import { planejamento5x2 } from "./janelas-planejamento.js";
import { habilitadoPara, funcaoDoDia, validarAlocacoesFuncao } from "./funcoes.js";
import { contextoModelo, escalaFixa, colaboradorRecorrente } from "./modelo-escala.js";
import { validarRestricoesEscala, ausenciaProgramada } from "./restricoes.js";
import { politicaPlantaoDeclarada, temTrabalhoNoturno } from "./computo-cct.js";
import { apurarCompensacaoHoras } from "./compensacao-horas.js";
import { createDomain } from "./index.js";
import { configDoPerfil } from "./perfil-dominio.js";
import {
  referenciaDia,
  referenciaSemana,
  instrumentoValido,
  limiteDiario,
  distribuicaoTransitoria42,
  unirDias,
} from "./ec141.js";
import {
  validarEnquadramento,
  validarRepousoMensal,
} from "./enquadramento-ec141.js";
import { limiteHorasDia } from "./distribuicao-horas.js";
import { apurarSemana } from "./resumo-semanal.js";
import {
  conferirDescansos,
  descricaoDescanso,
  sequenciasDomingo,
  regrasDomingo,
  turnosIninterruptos,
  diasDoMes,
  PORTARIA,
  DECRETO,
} from "./descanso.js";
import {
  diasNoMes,
  isoDate,
  dateFromKey,
  fmtHoras,
  normalizarJornada,
  intervaloMin,
  jornadaValidaEstrutural,
  getMonday,
  weekKey,
  addDays,
} from "./datas-horas.js";

export function createValidacao(state, jornada, feriados) {
  const { obterJornadaDoDia, regimeAtual } = jornada;
  const { feriadoDoDia, feriadoDaData } = feriados;
  function issue(tipo, severidade, mensagem, data = null) {
    return { tipo, severidade, mensagem, data };
  }

  function validarJornadaDiaria(colab, dias) {
    const out = [];
    if (Number(colab.horasSemana) > 44)
      out.push(
        issue(
          "CARGA_CONTRATUAL",
          "erro",
          `${colab.nome}: jornada contratual de referência acima de 44h semanais. Corrija o cadastro; horas extras não integram a carga contratual.`,
        ),
      );
    const datas = dias.filter((x) => x.status === "T" || x.status === "FE");
    datas.forEach((d) => {
      const h = d.horas;
      const noturno = temTrabalhoNoturno(d);
      if (h > 0 && noturno)
        out.push(
          issue(
            "TRABALHO_NOTURNO",
            "pendencia",
            `${d.data}: ${d.creditoNoturnoCCT ? "Crédito fixo de 1h por plantão noturno computado conforme a CCT declarada. " : ""}Há trabalho na faixa noturna urbana de referência (22h–5h). A presença usa horas de relógio e a data de início do turno; confira hora noturna reduzida, adicional, prorrogações e apuração na virada da semana conforme a categoria. Esses efeitos não são homologados automaticamente.`,
            d.data,
          ),
        );
      if (!Number.isFinite(h) || h <= 0)
        out.push(
          issue(
            "TRABALHO_SEM_HORAS",
            "erro",
            `${d.data}: dia marcado como trabalho sem uma duração positiva válida. Informe horas ou altere o status para folga.`,
            d.data,
          ),
        );
      if (state.tipoEscala === "12x36" && (d.horasComputadasCCT || h) > 12.001)
        out.push(
          issue(
            "COMPUTO_12X36",
            "erro",
            `${d.data}: as horas trabalhadas e os créditos declarados somam ${fmtHoras(d.horasComputadasCCT)}, acima das 12h do plantão. Confira os horários e a cláusula da CCT.`,
            d.data,
          ),
        );
      const limite = planejamento5x2(state) ? Infinity : limiteHorasDia(state, d.weekday);
      if (h > limite + 0.01)
        out.push(
          issue(
            "HORARIO_DIA_EXCEDIDO",
            "erro",
            `${d.data}: ${fmtHoras(h)} de trabalho excedem a janela de ${fmtHoras(limite)} configurada para este dia. Revise o ajuste manual ou o horário por dia.`,
            d.data,
          ),
        );
      if (
        state.tipoEscala === "12x36" &&
        Math.abs(d.saidaMin - d.entradaMin - 720) > 0.01 &&
        !(
          politicaPlantaoDeclarada(state) &&
          instrumentoValido(state, d.data, "regime12x36") &&
          Math.abs((d.horasComputadasCCT || 0) - 12) < 0.001 &&
          d.saidaMin - d.entradaMin <= 720
        )
      )
        out.push(
          issue(
            "PLANTAO_12X36",
            "erro",
            `${d.data}: o plantão deve ter 12h de permanência ou 12h computadas segundo as condições declaradas de CCT vigente.`,
            d.data,
          ),
        );
      if (
        !referenciaDia(state, d.data, colab).semLimiteJornada &&
        h >
          (state.tipoEscala === "12x36" ? 12 : limiteDiario(state, d.data, colab)) +
            0.001
      ) {
        const fundamento =
          state.instrumentoCompensacao === "act_cct"
            ? "Há ACT/CCT informado; confirme que a cláusula efetivamente autoriza a distribuição utilizada."
            : "Não foi indicada base suficiente para presumir a compensação. Verifique ACT/CCT ou outra hipótese legal aplicável.";
        out.push(
          issue(
            "JORNADA_DIARIA",
            "erro",
            `${d.data}: ${fmtHoras(h)} de trabalho efetivo no dia, acima de ${state.tipoEscala === "12x36" ? 12 : limiteDiario(state, d.data, colab)}h. ${fundamento}${Number.isFinite(d.intervaloMin) ? ` Intervalo descontado neste dia: ${fmtHoras(d.intervaloMin / 60)}.` : ""}`,
            d.data,
          ),
        );
      }
      if (
        !jornadaValidaEstrutural(
          d.jornadaAplicada || obterJornadaDoDia(d.weekday),
        )
      ) {
        out.push(
          issue(
            "HORARIO_INVALIDO",
            "erro",
            `${d.data}: horários de entrada, intervalo e saída estão inconsistentes.`,
            d.data,
          ),
        );
      }
    });
    if (datas.some(d => distribuicaoTransitoria42(state, d.data, colab) && d.horas > 8 && d.horas <= 8.401))
      out.push(issue("TRANSICAO_42_SEM_ACT", "info",
        "Distribuição transitória de 42h em cinco dias: até 8h24 diárias sem ACT/CCT, de 16/12/2026 a 15/12/2027, conforme a liminar informada nas ADIs 8041/8042, sujeita a referendo. Os 24 minutos além de 8h integram a jornada ordinária nessa hipótese; intervalos e repousos permanecem obrigatórios."));
    return out;
  }

  function validarIntervalosIntrajornada(colab, dias) {
    const out = [];
    const diasTrabalho = dias.filter(
      (x) => x.status === "T" || x.status === "FE",
    );
    diasTrabalho.forEach((d) => {
      const j =
        state.horarioPorDia && state.jornadaPorDia[d.weekday]
          ? state.jornadaPorDia[d.weekday]
          : state.jornada;
      const h = d.horas;
      const int = d.intervaloMin ?? intervaloMin(j);
      if (int > 120) out.push(issue("INTRAJORNADA_MAXIMA", "erro",
        `${d.data}: intervalo de ${fmtHoras(int / 60)} excede o máximo geral de 2h do art. 71 da CLT. Uma exceção exige acordo escrito ou instrumento coletivo específico, não presumido pelo sistema.`, d.data));
      if (Number.isFinite(d.intervaloInicioMin) && Number.isFinite(d.intervaloFimMin) &&
          (d.intervaloInicioMin - d.entradaMin > 360 || d.saidaMin - d.intervaloFimMin > 360))
        out.push(issue("TRABALHO_CONTINUO", "alerta", `${d.data}: há mais de 6h contínuas antes ou depois do intervalo. Reveja o posicionamento da pausa e as condições do regime/categoria; a conferência preventiva não substitui a análise do instrumento aplicável.`, d.data));
      if (h > 6 && int < 60) {
        out.push(
          issue(
            "INTRAJORNADA",
            "erro",
            `${d.data}: jornada superior a 6h com intervalo configurado de ${fmtHoras(int / 60)}. A regra geral do art. 71 da CLT exige mínimo de 1h, ressalvadas hipóteses legais/coletivas específicas.`,
            d.data,
          ),
        );
      } else if (h > 4 && h <= 6 && int < 15) {
        out.push(
          issue(
            "INTRAJORNADA",
            "erro",
            `${d.data}: jornada superior a 4h e até 6h com intervalo inferior a 15min.`,
            d.data,
          ),
        );
      }
    });
    return out;
  }

  function validarInterjornada(dias) {
    // Entrada/saída efetivas; sem elas, o horário configurado do dia.
    const seq = dias
      .slice()
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((d) => {
        if (!["T", "FE"].includes(d.status)) return d;
        const j = normalizarJornada(d.jornadaAplicada || obterJornadaDoDia(d.weekday));
        if (!j && !Number.isFinite(d.entradaMin)) return { ...d, status: "?" };
        return { ...d, entradaMin: d.entradaMin ?? j.entrada, saidaMin: d.saidaMin ?? j.saida };
      });
    const ajustes = dias
      .filter((d) => d.ajusteDescansoMin > 0 && ["T", "FE"].includes(d.status))
      .map((d) =>
        issue(
          "DESCANSO_AJUSTADO",
          "info",
          `${d.data}: entrada atrasada em ${fmtHoras(d.ajusteDescansoMin / 60)} para garantir o descanso mínimo após o repouso (11h entre jornadas somadas às 24h de cada repouso; ${PORTARIA}, art. 4º, § 2º). A carga do dia foi mantida; confira a cobertura.`,
          d.data,
        ),
      );
    return ajustes.concat(conferirDescansos(state, seq).map(({ dia, real, minimo, repousos }) =>
      issue(
        "INTERJORNADA",
        "erro",
        `${dia.data}: descanso entre a saída anterior e a próxima entrada é de ${fmtHoras(real / 60)}, abaixo de ${descricaoDescanso(state, repousos)}.${repousos > 0 ? ` O repouso semanal não se confunde com o intervalo entre jornadas: ajuste a saída anterior ou a entrada deste dia.` : ""}`,
        dia.data,
      ),
    ));
  }

  function validarRepousoSemanal(colab, dias) {
    const out = [];

    dias
      .filter((d) => d.repousoSeguranca)
      .forEach((d) =>
        out.push(
          issue(
            "REPOUSO_AJUSTADO",
            "alerta",
            `${d.data}: folga adicional inserida para evitar sete dias seguidos de trabalho; revise a distribuição e a cobertura.`,
            d.data,
          ),
        ),
      );
    let seguidos = 0;
    dias.forEach((d) => {
      seguidos = ["T", "FE"].includes(d.status) ? seguidos + 1 : 0;
      if (seguidos === 7)
        out.push(
          issue(
            "DIAS_CONSECUTIVOS",
            "erro",
            `${d.data}: sete dias consecutivos de trabalho sem repouso.`,
            d.data,
          ),
        );
    });

    const inicio = new Date(state.ano, state.mes, state.diaInicio);
    const fim = new Date(state.ano, state.mes, diasNoMes(state.mes, state.ano));
    let monday = getMonday(inicio);
    while (monday <= fim) {
      const semana = [];
      for (let k = 0; k < 7; k++) {
        const date = addDays(monday, k);
        const obj = dias.find(
          (x) =>
            x.data ===
            isoDate(date.getFullYear(), date.getMonth(), date.getDate()),
        );
        if (obj) semana.push(obj);
      }
      const regime = referenciaSemana(state, semana, colab);
      const mensal =
        semana.length &&
        semana.every((d) => instrumentoValido(state, d.data, "repousoMensal"));
      const folgas = semana.filter((x) => ["F", "FC", "I"].includes(x.status));
      if (semana.length === 7 && ["5x2", "6x1"].includes(state.tipoEscala)) {
        const alvoFolgas = state.tipoEscala === "5x2" ? 2 : 1;
        const obrigatorias = semana.filter(
          (d) =>
            !state.diasTrabalho.includes(d.weekday) ||
            (state.tipoEscala === "5x2" &&
              state.folgasFimSemana &&
              [0, 6].includes(d.weekday)) ||
            (d.feriado && !d.feriado.trabalhado),
        );
        if (
          obrigatorias.length > alvoFolgas &&
          semana.some((d) => d.feriado && !d.feriado.trabalhado)
        ) {
          out.push(
            issue(
              "FOLGAS_OBRIGATORIAS",
              "info",
              `${semana[0].data}: dias não operacionais, folgas fixas e feriados não trabalhados totalizam ${obrigatorias.length} dias sem expediente, acima das ${alvoFolgas} folga(s) da escala ${state.tipoEscala}. Esses dias foram preservados; revise os dias operacionais ou marque o feriado como trabalhado se a empresa funcionar nessa data.`,
              semana[0].data,
            ),
          );
        }
      }
      if (
        semana.length >= 7 &&
        !semana.some(ausenciaProgramada) &&
        folgas.length < (mensal ? 1 : regime.folgas)
      ) {
        out.push(
          issue(
            "REPOUSO_SEMANAL",
            regime.mista &&
              folgas.length >= Math.min(...regime.refs.map((r) => r.folgas))
              ? "pendencia"
              : "erro",
            `${isoDate(monday.getFullYear(), monday.getMonth(), monday.getDate())}: a semana civil contém ${folgas.length} dia(s) de repouso na escala; referência configurada: ${regime.folgas}.`,
            isoDate(monday.getFullYear(), monday.getMonth(), monday.getDate()),
          ),
        );
      }
      monday = addDays(monday, 7);
    }
    return out;
  }

  function domingosTrabalhados(dias) {
    return dias.filter(
      (x) => x.weekday === 0 && (x.status === "T" || x.status === "FE"),
    );
  }

  function validarDomingos(colab, dias, completos = dias) {
    const out = [];
    const trabalhados = domingosTrabalhados(dias);
    if (!trabalhados.length) return out;
    if (state.atividadeComercio && !state.domingosPermitidos)
      out.push(
        issue(
          "DOMINGO",
          "alerta",
          "Há domingo trabalhado em atividade marcada como comércio, sem a confirmação de autorização. No comércio em geral, o trabalho aos domingos depende de legislação municipal e das regras da convenção coletiva (Lei nº 10.101/2000, art. 6º).",
        ),
      );
    if (escalaFixa(state)) {
      // Padrão semanal recorrente: o domingo trabalhado repete-se em todas as semanas.
      for (const regra of regrasDomingo(state, colab))
        out.push(
          issue(
            regra.tipo === "DOMINGO_PREFERENCIAL" ? "DOMINGO_FIXO_PREFERENCIAL" : "DOMINGO_FIXO",
            regra.severidade,
            `No padrão fixo, o domingo é trabalhado em todas as semanas e não há repouso dominical: ${regra.texto} (${regra.fundamento}). ${regra.tipo === "DOMINGO_PREFERENCIAL" ? "Considere a escala dinâmica, que organiza o rodízio dos domingos, ou fixe o domingo como repouso." : "Use a escala dinâmica para organizar o revezamento ou fixe o domingo como repouso."}`,
          ),
        );
      return out;
    }
    const datas = new Set(dias.map((d) => d.data));
    for (const { regra, dia } of sequenciasDomingo(state, colab, completos)) {
      if (!datas.has(dia.data)) continue;
      out.push(
        issue(
          regra.tipo,
          regra.severidade,
          `${dia.data}: ${regra.semanas} domingos seguidos trabalhados; ${regra.texto} (${regra.fundamento}).`,
          dia.data,
        ),
      );
    }
    return out;
  }

  function validarJornadaSemanal(
    colab,
    dias,
    compensacao = { situacao: "nao_declarada" },
  ) {
    const out = [];

    const porSemana = new Map();
    dias.forEach((d) => {
      const date = dateFromKey(d.data);
      const key = weekKey(date);
      if (!porSemana.has(key)) porSemana.set(key, []);
      porSemana.get(key).push(d);
    });

    const jornadaContratual = Number(colab.horasSemana);

    for (const [key, semana] of porSemana.entries()) {
      const apuracao = apurarSemana(colab, semana, state);
      if (
        semana.some((d) => d.sabadoCompensado) &&
        apuracao.completa &&
        apuracao.computadas < apuracao.alvo - 0.01
      )
        out.push(
          issue(
            "COMPENSACAO_SABADO",
            "alerta",
            `${semana[0]?.data}: faltam ${fmtHoras(apuracao.alvo - apuracao.computadas)} para a carga semanal. O sábado compensado não gera abono; informe disponibilidade de reposição ou revise os horários e as restrições.`,
          ),
        );
      // A exceção de 8h24 pressupõe distribuição em até cinco dias de trabalho.
      if (semana.filter(d => ["T", "FE"].includes(d.status)).length > 5 &&
          semana.some(d => distribuicaoTransitoria42(state, d.data, colab) && d.horas > 8.001))
        out.push(issue("DISTRIBUICAO_TRANSITORIA_42", "erro",
          `${key}: a distribuição sem ACT/CCT de até 8h24 exige cinco dias de trabalho e dois repousos. Foram encontrados mais de cinco dias trabalhados nesta semana.`));
      const referencia = referenciaSemana(state, semana, colab);
      const referenciaLegal = referencia.horas;
      const total =
        apuracao.trabalhadas +
        apuracao.creditosIntervalo +
        apuracao.creditosNoturnos;
      const especialDeclarado =
        state.tipoEscala === "12x36" &&
        semana.every((d) => instrumentoValido(state, d.data, "regime12x36"));
      const compensada =
        compensacao.situacao === "apurada" &&
        semana.every(
          (d) => d.data >= compensacao.inicio && d.data <= compensacao.fim,
        ) &&
        total <= compensacao.pico + 0.001;
      const primeiraData = semana
        .slice()
        .sort((a, b) => a.data.localeCompare(b.data))[0]?.data;
      if (
        apuracao.completa &&
        Number.isFinite(jornadaContratual) &&
        Math.abs(apuracao.computadas - apuracao.alvo) > 0.01
      ) {
        const diferenca = apuracao.computadas - apuracao.alvo;
        const verbo = diferenca > 0 ? "acima" : "abaixo";
        out.push(
          issue(
            "JORNADA_CONTRATUAL",
            especialDeclarado || compensada || referencia.mista
              ? "pendencia"
              : diferenca > 0
                ? "erro"
                : "alerta",
            `${primeiraData}: ${fmtHoras(total)} trabalhadas + ${fmtHoras(apuracao.abonadas)} abonadas por feriado = ${fmtHoras(apuracao.computadas)} computadas na semana, ${fmtHoras(Math.abs(diferenca))} ${verbo} do alvo programado de ${fmtHoras(apuracao.alvo)}; contrato de referência ${fmtHoras(jornadaContratual)} preservado.`,
            primeiraData,
          ),
        );
      }

      if (referencia.mista)
        out.push(
          issue(
            "SEMANA_TRANSICAO",
            "pendencia",
            `${primeiraData}: a semana atravessa uma mudança de vigência. Programação conservadora pelo menor limite (${Number.isFinite(referenciaLegal) ? fmtHoras(referenciaLegal) : "dispensa de duração declarada"}), sem presumir rateio legal; confira o enquadramento da semana.`,
            primeiraData,
          ),
        );
      if (total > referenciaLegal + 0.001) {
        const excesso = total - referenciaLegal;
        const transicaoIndeterminada =
          referencia.mista &&
          total <= Math.max(...referencia.refs.map((r) => r.horas)) + 0.001;
        const sev =
          especialDeclarado || compensada || transicaoIndeterminada
            ? "pendencia"
            : "erro";
        out.push(
          issue(
            "LIMITE_SEMANAL",
            sev,
            `${primeiraData}: ${fmtHoras(total)} trabalhadas na semana, ${fmtHoras(excesso)} acima da referência de ${fmtHoras(referenciaLegal)} do regime selecionado. O excedente não é classificado automaticamente como hora extra; verifique o regime de compensação e a base jurídica aplicável.`,
            primeiraData,
          ),
        );
      }
    }
    return out;
  }

  function validarRegimeEscala(dias) {
    const out = [];
    if (
      state.tipoEscala === "6x1" &&
      dias.some((d) => referenciaDia(state, d.data).folgas === 2)
    )
      out.push(
        issue(
          "ESCALA_FASE",
          "info",
          "Padrão 6×1 ajustado à exigência de dois repousos. Para manter uma semana com apenas um repouso é necessária a modalidade coletiva de compensação mensal, com apuração própria.",
        ),
      );
    const r = regimeAtual();
    const operacionais = [...new Set(state.diasTrabalho)];

    if (r.futuro && state.tipoEscala !== "12x36") {
      const alvo =
        state.tipoEscala === "5x2" ? 5 : state.tipoEscala === "6x1" ? 6 : null;
      if (alvo !== null && operacionais.length < alvo) {
        out.push(
          issue(
            "DIAS_OPERACIONAIS",
            "erro",
            `A escala ${state.tipoEscala.replace("x", "×")} precisa de pelo menos ${alvo} dias operacionais configurados para gerar ${alvo} dias de trabalho por ciclo semanal; foram selecionados ${operacionais.length}.`,
          ),
        );
      }
    }

    if (state.tipoEscala === "5x2" && operacionais.length < 5) {
      out.push(
        issue(
          "PADRAO_5X2",
          "alerta",
          `A escala 5×2 requer pelo menos 5 dias operacionais configurados; atualmente há ${operacionais.length}.`,
        ),
      );
    }
    if (state.tipoEscala === "6x1" && operacionais.length < 6) {
      out.push(
        issue(
          "PADRAO_6X1",
          "alerta",
          `A escala 6×1 requer pelo menos 6 dias operacionais configurados; atualmente há ${operacionais.length}.`,
        ),
      );
    }

    if (state.tipoEscala === "12x36") {
      out.push(
        issue(
          "12X36",
          "info",
          "A escala 12×36 exige conferência do instrumento de constituição do regime, intervalo intrajornada e demais condições do art. 59-A da CLT.",
        ),
      );
    }
    return out;
  }

  function validarFeriados(dias) {
    const out = [];
    dias.forEach((d) => {
      const f = d.feriado || feriadoDaData(d.data);
      if (!f) return;
      if (f.trabalhado) {
        out.push(
          issue(
            "FERIADO_TRABALHADO",
            "alerta",
            `${d.data}: ${f.nome} foi marcado como trabalhado. Verifique a autorização legal/coletiva aplicável, o tratamento remuneratório ou a folga compensatória correspondente.`,
          ),
        );
      }
    });
    return out;
  }

  function validarCobertura(resultado) {
    const out = [];
    if (state.folgaCobertura !== "cobertura") return out;
    for (let d = state.diaInicio; d <= diasNoMes(state.mes, state.ano); d++) {
      const f = feriadoDoDia(d);
      if (f && !f.trabalhado) continue;
      const wd = new Date(state.ano, state.mes, d).getDay();
      if (
        state.tipoEscala !== "12x36" &&
        state.diasTrabalho.length &&
        !state.diasTrabalho.includes(wd)
      )
        continue;
      const dataAlvo = isoDate(state.ano, state.mes, d);
      const todosSemTrabalho = resultado.every((r) => {
        const obj = r.dias.find((x) => x.data === dataAlvo);
        return obj && !["T", "FE"].includes(obj.status);
      });
      if (todosSemTrabalho)
        out.push(
          issue(
            "COBERTURA",
            "alerta",
            `Dia ${d}/${state.mes + 1}: todos os colaboradores estão sem trabalho escalado (folga, ausência ou indisponibilidade). Revise a cobertura operacional.`,
          ),
        );
    }
    return out;
  }

  const MESES_NOME = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const horasDia = (d) => (["T", "FE"].includes(d.status) ? Number(d.horasComputadasCCT ?? d.horas) || 0 : 0);
  /** Média semanal no mês-calendário (Portaria 2.041, art. 3º): horas do mês ÷ (dias/7). */
  function mediaDoMes(colab, todos) {
    const mes = diasDoMes(todos, state.ano, state.mes);
    if (mes.dias.length !== mes.n || mes.dias.some((d) => ["VA", "AF", "NC"].includes(d.status))) return null;
    const refs = mes.dias.map((d) => referenciaDia(state, d.data, colab));
    if (refs.some((r) => r.semLimiteJornada)) return null;
    const horas = mes.dias.reduce((t, d) => t + horasDia(d), 0);
    return { ...mes, horas, media: horas / (mes.n / 7), limite: Math.min(...refs.map((r) => r.horas)), nome: `${MESES_NOME[state.mes]}/${state.ano}` };
  }

  /** 12×36: média do mês-calendário acima do limite semanal gera compensação ou horas extras
   * (Decreto 13.173, art. 3º; Portaria 2.041, art. 8º). Só existe na escala dinâmica. */
  function validarMediaMensal(colab, todos) {
    if (state.tipoEscala !== "12x36" || escalaFixa(state)) return [];
    const m = mediaDoMes(colab, todos);
    if (!m || m.media <= m.limite + 0.01) return [];
    const instrumento = instrumentoValido(state, m.inicio, "regime12x36") && instrumentoValido(state, m.fim, "regime12x36");
    return [
      issue(
        "MEDIA_12X36",
        instrumento ? "pendencia" : "alerta",
        `${m.nome}: ${fmtHoras(m.horas)} em ${m.n} dias, média de ${fmtHoras(m.media)} semanais no mês-calendário, ${fmtHoras(m.media - m.limite)} acima do limite de ${fmtHoras(m.limite)}. Assegure a compensação dessas horas ou o pagamento como horas extras, nos termos do ACT/CCT (${DECRETO}, art. 3º; ${PORTARIA}, art. 8º).${instrumento ? "" : " Nenhum ACT/CCT vigente para o regime 12×36 foi informado para o mês."}`,
      ),
    ];
  }

  /** Turnos ininterruptos de revezamento: 6h diárias, salvo ACT/CCT, com média mensal no
   * limite semanal e dois repousos (Decreto 13.173, art. 2º; Portaria 2.041, art. 7º). */
  function validarTurnosIninterruptos(colab, dias, todos) {
    if (!state.turnosRevezamento || state.tipoEscala === "12x36" || escalaFixa(state)) return [];
    if (!turnosIninterruptos(dias)) return [];
    const longos = dias.filter((d) => horasDia(d) > 6.001);
    if (!longos.length) return [];
    const semAcordo = longos.filter((d) => !instrumentoValido(state, d.data, "turnosIninterruptos"));
    const out = [];
    const lista = (l) => l.slice(0, 5).map((d) => d.data.split("-").reverse().join("/")).join(", ") + (l.length > 5 ? "…" : "");
    if (semAcordo.length)
      out.push(
        issue(
          "TURNO_ININTERRUPTO",
          "erro",
          `${semAcordo[0].data}: revezamento entre turnos que alcançam os períodos diurno e noturno caracteriza turno ininterrupto, com jornada de 6h diárias salvo ACT/CCT (${DECRETO}, art. 2º; ${PORTARIA}, art. 7º). ${semAcordo.length} dia(s) acima de 6h sem instrumento que autorize: ${lista(semAcordo)}.`,
          semAcordo[0].data,
        ),
      );
    if (semAcordo.length < longos.length) {
      const m = mediaDoMes(colab, todos);
      if (m && m.media > m.limite + 0.01)
        out.push(
          issue(
            "TURNO_ININTERRUPTO_MEDIA",
            "erro",
            `${m.nome}: jornada acima de 6h autorizada pelo ACT/CCT, mas a média do mês-calendário é de ${fmtHoras(m.media)} semanais, acima do limite de ${fmtHoras(m.limite)} (${DECRETO}, art. 2º).`,
          ),
        );
      else
        out.push(
          issue(
            "TURNO_ININTERRUPTO",
            "pendencia",
            `Turnos ininterruptos de revezamento com jornada acima de 6h amparada no ACT/CCT informado. Confira a cláusula; a média do mês-calendário e os dois repousos semanais continuam obrigatórios (${DECRETO}, art. 2º).`,
          ),
        );
    }
    return out;
  }

  /** Férias não podem começar nos dois dias que antecedem feriado ou repouso semanal
   * (CLT, art. 134, § 3º; Portaria 2.041, art. 4º, § 5º). */
  function validarInicioFerias(colab, completos, dias) {
    const periodos = (colab.restricoes?.periodos || []).filter((p) => p.tipo === "ferias");
    if (!periodos.length) return [];
    const datas = new Set(dias.map((d) => d.data));
    const porData = new Map(completos.map((d) => [d.data, d]));
    const out = [];
    for (const p of periodos) {
      if (!datas.has(p.inicio)) continue;
      for (const k of [1, 2]) {
        const dataKey = isoDateOffset(p.inicio, k);
        const d = porData.get(dataKey);
        const feriado = (d?.feriado && !d.feriado.trabalhado) || (!d && feriadoDaData(dataKey));
        const repouso =
          d && (["F", "FC"].includes(d.status) || (["VA", "AF"].includes(d.status) && d.restricao && d.restricao.retirouTrabalho === false && !d.feriado));
        if (!feriado && !repouso) continue;
        out.push(
          issue(
            "FERIAS_INICIO",
            "alerta",
            `${p.inicio}: férias iniciadas ${k === 1 ? "na véspera" : "dois dias antes"} de ${feriado ? "feriado" : "dia de repouso semanal"} (${dataKey.split("-").reverse().join("/")}). É vedado o início das férias nos dois dias que antecedem feriado ou repouso semanal (CLT, art. 134, § 3º; ${PORTARIA}, art. 4º, § 5º).`,
            p.inicio,
          ),
        );
        break;
      }
    }
    return out;
  }
  const isoDateOffset = (data, k) => {
    const d = addDays(dateFromKey(data), k);
    return isoDate(d.getFullYear(), d.getMonth(), d.getDate());
  };

  function validarLegal(colab, dias, contexto = [], apuracao = []) {
    const modelo = contextoModelo(state);
    if (modelo !== state) return createDomain(modelo).validarLegal(colaboradorRecorrente(colab), dias, contexto, apuracao);
    if (escalaFixa(state)) colab = colaboradorRecorrente(colab);
    const individual = configDoPerfil(state, colab);
    if (individual)
      return createDomain(individual).validarLegal(
        colab,
        dias,
        contexto,
        apuracao,
      );
    if (dias.some((d) => d.status === "NC"))
      return [
        issue(
          "ADMISSAO_PARCIAL",
          "pendencia",
          "Há dias anteriores à admissão. Não são trabalho nem folga; confira o fechamento da semana parcial.",
        ),
        ...validarLegal(
          colab,
          dias.filter((d) => d.status !== "NC"),
          contexto.filter((d) => d.status !== "NC"),
          apuracao.filter((d) => d.status !== "NC"),
        ),
      ];
    const completos = unirDias(contexto, dias);
    const datas = new Set(dias.map((d) => d.data));
    const compensacao = apurarCompensacaoHoras(
      state,
      colab,
      unirDias(apuracao, contexto, dias),
    );
    const problemasFixos = [];
    if (escalaFixa(state)) {
      const padroes = new Map();
      for (const d of dias) {
        const chave = JSON.stringify([d.status, d.horas, d.entradaMin, d.saidaMin, d.intervaloInicioMin, d.intervaloFimMin, d.funcaoAlocada || "", d.alocacoesFuncao || []]);
        if (padroes.has(d.weekday) && padroes.get(d.weekday) !== chave) {
          problemasFixos.push(issue("PADRAO_FIXO", "erro", "O resultado contém horários ou folgas diferentes no mesmo dia da semana. Gere novamente um padrão recorrente antes de utilizar."));
          break;
        }
        padroes.set(d.weekday, chave);
      }
    }
    return [
      ...problemasFixos,
      ...dias
        .filter(
          (d) =>
            ["T", "FE"].includes(d.status) &&
            (!habilitadoPara(colab, funcaoDoDia(colab, d)) || validarAlocacoesFuncao(colab,d)),
        )
        .map((d) =>
          issue(
            "FUNCAO_NAO_HABILITADA",
            "erro",
            `${d.data}: colaborador sem habilitação cadastrada para a função alocada.`,
            d.data,
          ),
        ),
      ...validarRestricoesEscala(colab, dias, state),
      ...(colab.quadroDominio?.ativo !== false &&
      colab.quadroDominio?.pendencias?.length
        ? [
            issue(
              "DADOS_DOMINIO",
              "pendencia",
              colab.quadroDominio.pendencias.join(" "),
            ),
          ]
        : []),
      ...validarEnquadramento(state, colab, dias),
      ...compensacao.issues,
      ...validarRepousoMensal(state, colab, unirDias(apuracao, contexto, dias)),
      ...validarRegimeEscala(dias),
      ...validarJornadaDiaria(colab, dias),
      ...validarIntervalosIntrajornada(colab, dias),
      ...validarInterjornada(completos).filter(
        (i) => !i.data || datas.has(i.data),
      ),
      ...validarJornadaSemanal(colab, dias, compensacao),
      ...validarRepousoSemanal(colab, completos).filter(
        (i) => !i.data || datas.has(i.data),
      ),
      ...validarDomingos(colab, dias, completos),
      ...validarMediaMensal(colab, unirDias(apuracao, contexto, dias)),
      ...validarTurnosIninterruptos(colab, dias, unirDias(apuracao, contexto, dias)),
      ...validarInicioFerias(colab, completos, dias),
      ...validarFeriados(dias),
    ];
  }

  return {
    issue,
    validarJornadaDiaria,
    validarIntervalosIntrajornada,
    validarInterjornada,
    validarRepousoSemanal,
    domingosTrabalhados,
    validarDomingos,
    validarMediaMensal,
    validarTurnosIninterruptos,
    validarInicioFerias,
    validarJornadaSemanal,
    validarRegimeEscala,
    validarFeriados,
    validarCobertura,
    validarLegal,
  };
}
