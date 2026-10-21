import { apurarCompensacaoHoras } from "./compensacao-horas.js";
import {
  referenciaDia,
  referenciaSemana,
  instrumentoValido,
  limiteDiario,
  unirDias,
} from "./ec141.js";
import {
  validarEnquadramento,
  validarRepousoMensal,
} from "./enquadramento-ec141.js";
import { limiteHorasDia } from "./distribuicao-horas.js";
import { apurarSemana } from "./resumo-semanal.js";
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
    const datas = dias.filter((x) => x.status === "T" || x.status === "FE");
    datas.forEach((d) => {
      const h = d.horas;
      const partes =
        Number.isFinite(d.intervaloInicioMin) &&
        Number.isFinite(d.intervaloFimMin)
          ? [
              [d.entradaMin, d.intervaloInicioMin],
              [d.intervaloFimMin, d.saidaMin],
            ]
          : [[d.entradaMin, d.saidaMin]];
      const noturno = partes.some(
        ([a, b]) =>
          Number.isFinite(a) &&
          Number.isFinite(b) &&
          [0, 1440, 2880].some(
            (base) =>
              Math.min(b, base + 300) > Math.max(a, base) ||
              Math.min(b, base + 1440) > Math.max(a, base + 1320),
          ),
      );
      if (h > 0 && noturno)
        out.push(
          issue(
            "TRABALHO_NOTURNO",
            "pendencia",
            `${d.data}: há trabalho na faixa noturna urbana de referência (22h–5h). A grade usa horas de relógio e a data de início do turno; confira hora noturna reduzida, adicional, prorrogações e apuração na virada da semana conforme a categoria. Esses efeitos não são homologados automaticamente.`,
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
      const limite = limiteHorasDia(state, d.weekday);
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
        Math.abs(d.saidaMin - d.entradaMin - 720) > 0.01
      )
        out.push(
          issue(
            "PLANTAO_12X36",
            "erro",
            `${d.data}: o plantão deve ter 12h de permanência, incluindo o intervalo.`,
            d.data,
          ),
        );
      if (
        !referenciaDia(state, d.data, colab).semLimiteJornada &&
        h >
          (state.tipoEscala === "12x36" ? 12 : limiteDiario(state, d.data)) +
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
            `${d.data}: ${fmtHoras(h)} de trabalho efetivo no dia, acima de ${state.tipoEscala === "12x36" ? 12 : limiteDiario(state, d.data)}h. ${fundamento}`,
            d.data,
          ),
        );
      }
      if (!jornadaValidaEstrutural(obterJornadaDoDia(d.weekday))) {
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
    const out = [];
    const trabalhados = dias.filter(
      (x) => x.status === "T" || x.status === "FE",
    );

    for (let i = 1; i < trabalhados.length; i++) {
      const anterior = trabalhados[i - 1];
      const atual = trabalhados[i];
      const jPrev = normalizarJornada(obterJornadaDoDia(anterior.weekday));
      const jAtual = normalizarJornada(obterJornadaDoDia(atual.weekday));
      if (!jPrev || !jAtual) continue;

      const anteriorDate = dateFromKey(anterior.data);
      const atualDate = dateFromKey(atual.data);
      const diffDias = Math.round((atualDate - anteriorDate) / 86400000);

      const diff =
        (atual.entradaMin ?? jAtual.entrada) -
        (anterior.saidaMin ?? jPrev.saida) +
        diffDias * 1440;

      const minimo = state.tipoEscala === "12x36" ? 2160 : 660;
      if (diff < minimo) {
        out.push(
          issue(
            "INTERJORNADA",
            "erro",
            `${atual.data}: intervalo entre a saída anterior e a próxima entrada é de ${fmtHoras(diff / 60)}, abaixo de ${state.tipoEscala === "12x36" ? "36h do ciclo 12×36" : "11h do art. 66 da CLT"}.`,
            atual.data,
          ),
        );
      }
    }
    return out;
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
      const folgas = semana.filter(
        (x) => x.status === "F" || x.status === "FC",
      );
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
      if (semana.length >= 7 && folgas.length < (mensal ? 1 : regime.folgas)) {
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

  function validarDomingos(colab, dias) {
    const out = [];
    const domingos = dias.filter((x) => x.weekday === 0);
    const trabalhados = domingosTrabalhados(dias);
    const folgas = domingos.filter(
      (x) => x.status === "F" || x.status === "FC",
    );

    if (trabalhados.length) {
      if (state.atividadeComercio && !state.domingosPermitidos) {
        out.push(
          issue(
            "DOMINGO",
            "alerta",
            "Há domingo trabalhado em atividade marcada como comércio, mas o campo de autorização específica não foi confirmado. Verifique legislação municipal e regras coletivas aplicáveis.",
          ),
        );
      } else {
        out.push(
          issue(
            "DOMINGO",
            "info",
            "Há domingo(s) trabalhado(s). O repouso semanal deve observar a legislação aplicável; para comércio, a Lei 10.101/2000 traz regra específica de coincidência com domingo e a legislação/negociação coletiva também deve ser verificada.",
          ),
        );
      }
    }

    if (!folgas.length && domingos.length) {
      out.push(
        issue(
          "DOMINGO",
          "alerta",
          "Nenhum domingo de folga aparece no período exibido. A ferramenta não considera isso automaticamente ilegal para toda atividade, mas exige conferência da regra setorial aplicável.",
        ),
      );
    }

    if (colab.sexo === "feminino" && trabalhados.length) {
      out.push(
        issue(
          "DOMINGO_MULHER",
          "alerta",
          "Colaboradora com domingo trabalhado: confira a escala de revezamento e a aplicação do art. 386 da CLT e da jurisprudência pertinente à atividade.",
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
      const referencia = referenciaSemana(state, semana, colab);
      const referenciaLegal = referencia.horas;
      const total = apuracao.trabalhadas;
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
        Math.abs(apuracao.computadas - referencia.alvo) > 0.01
      ) {
        const diferenca = apuracao.computadas - referencia.alvo;
        const verbo = diferenca > 0 ? "acima" : "abaixo";
        out.push(
          issue(
            "JORNADA_CONTRATUAL",
            especialDeclarado || compensada || referencia.mista
              ? "pendencia"
              : diferenca > 0
                ? "erro"
                : "alerta",
            `${primeiraData}: ${fmtHoras(total)} trabalhadas + ${fmtHoras(apuracao.abonadas)} abonadas por feriado = ${fmtHoras(apuracao.computadas)} computadas na semana, ${fmtHoras(Math.abs(diferenca))} ${verbo} do alvo programado de ${fmtHoras(referencia.alvo)}; contrato de referência ${fmtHoras(jornadaContratual)} preservado.`,
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
      const todosFolga = resultado.every((r) => {
        const obj = r.dias.find((x) => x.data === dataAlvo);
        return obj && ["F", "FC"].includes(obj.status);
      });
      if (todosFolga)
        out.push(
          issue(
            "COBERTURA",
            "alerta",
            `Dia ${d}/${state.mes + 1}: todos os colaboradores estão em folga. Revise a cobertura operacional.`,
          ),
        );
    }
    return out;
  }

  function validarLegal(colab, dias, contexto = [], apuracao = []) {
    const completos = unirDias(contexto, dias);
    const datas = new Set(dias.map((d) => d.data));
    const compensacao = apurarCompensacaoHoras(
      state,
      colab,
      unirDias(apuracao, contexto, dias),
    );
    return [
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
      ...validarDomingos(colab, dias),
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
    validarJornadaSemanal,
    validarRegimeEscala,
    validarFeriados,
    validarCobertura,
    validarLegal,
  };
}
