import { apurarSemana } from "../domain/resumo-semanal.js";
import {
  isoDate,
  dateFromKey,
  fmtHoras,
  minToTime,
  getMonday,
  formatDateBR,
  parseHorasTrabalhadas,
} from "../domain/datas-horas.js";
import { MESES, DIAS_SEMANA } from "../config/regras-jornada.js";
import { escapeHtml } from "../shared/formatacao.js";

export function createCalendarioUI({
  state,
  domain,
  storage,
  env,
  renderRelatorioCobertura,
}) {
  const {
    calcHorasDia,
    calcularSaidaSimulada,
    feriadoDaData,
    validarCobertura,
    validarLegal,
    atualizarHorarioEfetivo,
    gerarDadosEscala,
  } = domain;
  const { saveState } = storage;
  const { document, alert, confirm, prompt } = env;

  function editarStatus(ri, di) {
    const obj = state.escalaGerada.resultado[ri].dias[di];
    const atual = obj.status;
    const opcoes = [
      ["T", "T — Trabalho"],
      ["F", "F — Folga/repouso"],
      ["FE", "FE — Feriado trabalhado"],
      ["FC", "FC — Folga compensatória"],
    ];

    const escolha = prompt(
      `Dia ${obj.dia} (${DIAS_SEMANA[obj.weekday]})\nStatus atual: ${atual}\n\nDigite T, F, FE ou FC:`,
      atual,
    );
    if (escolha === null) return;
    const status = escolha.trim().toUpperCase();
    if (!opcoes.some((o) => o[0] === status)) {
      alert("Status inválido. Use T, F, FE ou FC.");
      return;
    }

    if (status === "FE" && !obj.feriado) {
      if (
        !confirm(
          "Este dia não está cadastrado como feriado. Manter FE mesmo assim?",
        )
      )
        return;
    }

    if (status === "FC") {
      if (
        !confirm(
          "FC representa folga compensatória. Confirme que existe fundamento para a compensação antes de usar este status.",
        )
      )
        return;
    }

    let novasHoras = 0;
    if (status === "T" || status === "FE") {
      const horasStr = prompt(
        "Horas trabalhadas neste dia (HH:MM ou decimal):",
        fmtHoras(obj.horas || calcHorasDia(obj.weekday)),
      );
      if (horasStr === null) return;
      novasHoras = parseHorasTrabalhadas(horasStr);
      if (novasHoras === null) {
        alert("Informe horas válidas, entre 0 e 24, com minutos de 00 a 59.");
        return;
      }
    }
    obj.status = status;
    obj.horas = novasHoras;
    atualizarHorarioEfetivo(obj);
    state.escalaGerada.validacoes = state.escalaGerada.resultado.map((r) => ({
      colaborador: r.colaborador,
      issues: validarLegal(
        r.colaborador,
        r.dias,
        r.diasContexto,
        r.diasApuracao,
      ),
    }));
    state.escalaGerada.avisosCobertura = validarCobertura(
      state.escalaGerada.resultado,
    );
    state.escalaGerada.coberturaOperacional = domain.analisarCobertura(
      state.escalaGerada.resultado,
    );
    renderEscalaGerada();
    saveState();
  }

  function atualizarTurnosEscala() {
    if (!state.escalaGerada) return;
    state.escalaGerada.resultado.forEach((r, indice) => {
      for (const dia of [...(r.diasContexto ?? []), ...r.dias]) {
        dia.turno = domain.obterTurno(dateFromKey(dia.data), indice);
        atualizarHorarioEfetivo(dia);
      }
    });
    state.escalaGerada.validacoes = state.escalaGerada.resultado.map((r) => ({
      colaborador: r.colaborador,
      issues: validarLegal(
        r.colaborador,
        r.dias,
        r.diasContexto,
        r.diasApuracao,
      ),
    }));
    state.escalaGerada.coberturaOperacional = domain.analisarCobertura(
      state.escalaGerada.resultado,
    );
    renderEscalaGerada();
    saveState();
  }

  function severityBadge(issueObj) {
    if (issueObj.severidade === "pendencia")
      return '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-fintria-azulBg text-fintria-azul">PENDENTE</span>';
    if (issueObj.severidade === "erro")
      return '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-fintria-vermelhoBg text-fintria-vermelho">ERRO</span>';
    if (issueObj.severidade === "alerta")
      return '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-fintria-ambarBg text-fintria-ambar">ANÁLISE</span>';
    return '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-fintria-azulBg text-fintria-azul">INFO</span>';
  }

  function renderEscalaGerada() {
    if (!state.escalaGerada) return;
    const { resultado } = state.escalaGerada;
    const container = document.getElementById("resultado-gerar");
    let html = renderRelatorioCobertura(resultado);

    // As validações são recalculadas a cada renderização. Assim, qualquer alteração
    // manual em um dia repercute imediatamente nos indicadores semanais e mensais.
    const allIssues = resultado.flatMap((r) =>
      validarLegal(r.colaborador, r.dias, r.diasContexto, r.diasApuracao),
    );
    const cobertura = validarCobertura(resultado);
    const erros = allIssues.filter((x) => x.severidade === "erro");
    const alertas = allIssues.filter(
      (x) => x.severidade === "alerta" || x.severidade === "pendencia",
    );
    const infos = allIssues.filter((x) => x.severidade === "info");

    if (erros.length) {
      html += `<div class="rounded-lg px-3.5 py-2.5 text-sm bg-fintria-vermelhoBg text-fintria-vermelho mb-2"><b>${erros.length} incompatibilidade(s) objetiva(s).</b> Revise os itens abaixo antes de tratar a escala como válida.</div>`;
    } else if (alertas.length) {
      html += `<div class="rounded-lg px-3.5 py-2.5 text-sm bg-fintria-ambarBg text-fintria-ambar mb-2"><b>${alertas.length} ponto(s) dependem de análise.</b> Verificações documentais ou de enquadramento pendentes não equivalem à aprovação de adequação à EC 141.</div>`;
    } else {
      html += `<div class="rounded-lg px-3.5 py-2.5 text-sm bg-fintria-verdeBg text-fintria-verde mb-2"><b>Nenhuma incompatibilidade objetiva detectada</b> nas regras modeladas. Isso não substitui a conferência do caso concreto.</div>`;
    }

    if (cobertura.length) {
      html += `<div class="rounded-lg px-3.5 py-2.5 text-sm bg-fintria-ambarBg text-fintria-ambar mb-3">⚠ <b>Problema de cobertura:</b> ${cobertura.map((x) => escapeHtml(x.mensagem)).join(" ")}</div>`;
    }

    html += `<div class="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
    <div class="border border-slate-200 rounded-lg p-3 bg-slate-50"><b class="text-fintria-vermelho">${erros.length}</b><div class="text-xs text-slate-500">ERROS</div></div>
    <div class="border border-slate-200 rounded-lg p-3 bg-slate-50"><b class="text-fintria-ambar">${alertas.length}</b><div class="text-xs text-slate-500">ANÁLISES</div></div>
    <div class="border border-slate-200 rounded-lg p-3 bg-slate-50"><b class="text-fintria-azul">${infos.length}</b><div class="text-xs text-slate-500">INFORMATIVOS</div></div>
    <div class="border border-slate-200 rounded-lg p-3 bg-slate-50"><b class="text-fintria-navy">${resultado.length}</b><div class="text-xs text-slate-500">COLABORADORES</div></div>
  </div>`;

    // ---------------------------------------------------------
    // PAINEL POR COLABORADOR
    // ---------------------------------------------------------
    resultado.forEach((r) => {
      const issues = validarLegal(
        r.colaborador,
        r.dias,
        r.diasContexto,
        r.diasApuracao,
      );
      const hasError = issues.some((x) => x.severidade === "erro");
      const hasAlert = issues.some(
        (x) => x.severidade === "alerta" || x.severidade === "pendencia",
      );
      const label = hasError
        ? "INCOMPATÍVEL"
        : hasAlert
          ? "REQUER ANÁLISE"
          : "SEM INCOMPATIBILIDADE OBJETIVA";
      const cls = hasError
        ? "bg-fintria-vermelhoBg text-fintria-vermelho"
        : hasAlert
          ? "bg-fintria-ambarBg text-fintria-ambar"
          : "bg-fintria-verdeBg text-fintria-verde";
      const diasAlvo =
        state.tipoEscala === "5x2"
          ? 5
          : state.tipoEscala === "6x1"
            ? 6
            : [...new Set(state.diasTrabalho)].length;
      const jIndividual = diasAlvo
        ? calcularSaidaSimulada(
            Number(r.colaborador.horasSemana) || 0,
            diasAlvo,
          )
        : null;
      html += `<div class="border border-slate-200 rounded-lg px-3.5 py-3 mb-3">
      <div class="flex justify-between items-start gap-3">
        <div><b>${escapeHtml(r.colaborador.nome || "(sem nome)")}</b> <span class="text-slate-500">— ${escapeHtml(r.colaborador.cargo || "")}</span> <span class="text-xs text-slate-500">· ${fmtHoras(Number(r.colaborador.horasSemana) || 0)}/semana</span></div>
        <span class="text-[10px] font-bold px-2.5 py-1 rounded-full ${cls}">${label}</span>
      </div>
      ${state.horarioPorDia ? `<div class="text-xs text-slate-500 mt-1">Carga distribuída dentro dos horários de cada dia. Dias reduzidos são respeitados; consulte os horários efetivos na grade e o fechamento no resumo semanal.</div>` : jIndividual ? `<div class="text-xs text-slate-500 mt-1">Jornada individual estimada (uniforme): entrada ${state.jornada.entrada} · ${fmtHoras(jIndividual.horasDia)}/dia médio em ${diasAlvo} dia(s) · saída ${jIndividual.saida}. Esta é apenas a referência média; os horários efetivos de cada dia aparecem na grade e consideram folgas, feriados e ajustes manuais.</div>` : ""}
      ${issues.length ? `<div class="mt-2 space-y-1">${issues.map((x) => `<div class="text-xs flex gap-2 items-start">${severityBadge(x)}<span>${escapeHtml(x.mensagem)}</span></div>`).join("")}</div>` : ""}
    </div>`;
    });

    // ---------------------------------------------------------
    // ESCALA VISUAL — modelo inspirado no quadro do Big Ambitions:
    // eixo horizontal = dias da semana; eixo vertical = semanas do mês;
    // última coluna = resumo da semana.
    // ---------------------------------------------------------
    const datas = resultado.flatMap((r) => r.dias.map((d) => d.data)).sort();
    if (datas.length) {
      const inicio = dateFromKey(datas[0]);
      const fim = dateFromKey(datas[datas.length - 1]);
      const cursor = getMonday(inicio);
      const ultima = getMonday(fim);

      html += `<div class="border border-slate-200 rounded-xl overflow-hidden mb-5">
      <div class="bg-fintria-navy text-white px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-1">
        <div><div class="font-display font-bold text-base">Escala mensal</div><div class="text-xs opacity-85">Dias na horizontal · semanas do mês na vertical · resumo da semana na última coluna</div></div>
        <div class="text-xs opacity-85">Clique em um colaborador para alterar o status</div>
      </div>
      <p class="text-xs text-slate-500 px-3 py-2 no-print 2xl:hidden">Deslize a tabela horizontalmente para ver todos os dias e o resumo da semana.</p>
      <div class="w-full overflow-x-auto">
        <table class="escala-mensal border-collapse w-full table-fixed text-[11px] leading-tight">
          <colgroup>
            <col style="width:7%">
            <col style="width:11%"><col style="width:11%"><col style="width:11%"><col style="width:11%">
            <col style="width:11%"><col style="width:11%"><col style="width:11%">
            <col style="width:16%">
          </colgroup>
          <thead><tr>
            <th class="border border-slate-200 px-1 py-2 bg-slate-100 text-fintria-navySoft text-center">Semana</th>`;

      const nomesDias = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
      for (let i = 0; i < 7; i++) {
        html += `<th class="border border-slate-200 px-1 py-2 bg-slate-100 text-fintria-navySoft text-center">${nomesDias[i]}</th>`;
      }
      html += `<th class="border border-slate-200 px-2 py-2 bg-slate-100 text-fintria-navySoft text-left">Resumo da semana</th>
          </tr></thead><tbody>`;

      let semanaNumero = 0;
      const mensal = resultado
        .map((r) => ({
          r,
          diasMes: r.dias.filter((d) => {
            const dt = dateFromKey(d.data);
            return (
              dt &&
              dt.getMonth() === state.mes &&
              dt.getFullYear() === state.ano &&
              dt.getDate() >= state.diaInicio
            );
          }),
        }))
        .map((x) => ({
          ...x,
          horas: x.diasMes.reduce((s, d) => s + d.horas, 0),
          diasTrabalho: x.diasMes.filter(
            (d) => d.status === "T" || d.status === "FE",
          ).length,
          diasFolga: x.diasMes.filter(
            (d) => d.status === "F" || d.status === "FC",
          ).length,
        }));

      while (cursor <= ultima) {
        semanaNumero++;
        const weekStart = new Date(cursor.getTime());
        const weekEnd = new Date(cursor.getTime());
        weekEnd.setDate(weekEnd.getDate() + 6);
        const semanaDatas = [];
        for (let i = 0; i < 7; i++) {
          const dt = new Date(weekStart.getTime());
          dt.setDate(dt.getDate() + i);
          const key = isoDate(dt.getFullYear(), dt.getMonth(), dt.getDate());
          const obj = { dt, key, wd: dt.getDay() };
          // Mostra a semana completa, mas dias fora do mês ficam visualmente neutros.
          obj.noMes =
            dt.getMonth() === state.mes &&
            dt.getFullYear() === state.ano &&
            dt.getDate() >= state.diaInicio;
          semanaDatas.push(obj);
        }

        const semanaPorColaborador = resultado.map((r) => {
          const semana = r.dias.filter((d) =>
            semanaDatas.some((x) => x.key === d.data),
          );
          const apuracao = apurarSemana(r.colaborador, semana, state);
          const folgas = semana.filter(
            (d) => d.status === "F" || d.status === "FC",
          );
          return { r, ...apuracao, folgas };
        });

        const resumoHtml = semanaPorColaborador
          .map((x) => {
            const badge =
              x.estado === "ok"
                ? '<span class="px-1.5 py-0.5 rounded bg-fintria-verdeBg text-fintria-verde font-bold">HORAS OK</span>'
                : x.estado === "acima"
                  ? '<span class="px-1.5 py-0.5 rounded bg-fintria-vermelhoBg text-fintria-vermelho font-bold">ACIMA</span>'
                  : x.estado === "abaixo"
                    ? '<span class="px-1.5 py-0.5 rounded bg-fintria-ambarBg text-fintria-ambar font-bold">ABAIXO</span>'
                    : '<span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-bold">PARCIAL</span>';
            const folgas = x.folgas
              .map((d) => {
                const dt = dateFromKey(d.data);
                return dt
                  ? `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`
                  : d.data;
              })
              .join(", ");
            return `<div data-resumo-semanal data-colaborador="${x.r.colaborador.id}" data-semana="${isoDate(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate())}" class="pb-2 mb-2 border-b border-slate-200 last:border-0 last:mb-0 last:pb-0">
          <div class="flex items-start justify-between gap-1"><b class="text-fintria-navy">${escapeHtml(x.r.colaborador.nome || "(sem nome)")}</b>${badge}</div>
          <div class="text-slate-600 mt-0.5" title="O fechamento de horas não substitui as validações de jornada e enquadramento">${fmtHoras(x.trabalhadas)} trabalhadas${x.abonadas ? ` + ${fmtHoras(x.abonadas)} abonadas` : ""}${Number.isFinite(x.alvo) ? ` · total ${fmtHoras(x.computadas)} / alvo ${fmtHoras(x.alvo)}` : ""}</div>
          ${x.abonos.map((a) => `<div class="text-fintria-azul mt-1">Abono de feriado: ${formatDateBR(dateFromKey(a.data))} — ${escapeHtml(a.nome)} (${fmtHoras(a.horas)}).</div>`).join("")}
          ${x.contrato !== x.alvo ? `<div class="text-slate-500">Contrato de referência: ${fmtHoras(x.contrato)}. Alvo ajustado à fase, sem alteração salarial.</div>` : ""}
          <div class="text-slate-500">Folgas: ${folgas || "nenhuma"}</div>
        </div>`;
          })
          .join("");

        html += `<tr>
        <td class="border border-slate-200 px-1 py-2 align-top bg-slate-50 text-center">
          <div class="font-display font-bold text-fintria-navy">${semanaNumero}</div>
          <div class="text-[9px] text-slate-500 mt-1">${formatDateBR(weekStart)}<br>${formatDateBR(weekEnd)}</div>
        </td>`;

        semanaDatas.forEach(({ dt, key, wd, noMes }) => {
          const itens = resultado
            .map((r, ri) => ({
              r,
              ri,
              obj: r.dias.find((x) => x.data === key),
            }))
            .filter((x) => x.obj);
          const diaAtual = dt.getDate();
          const fer = feriadoDaData(key);
          let celula = "";

          if (!itens.length) {
            celula = `<div class="text-center text-slate-400 py-4">Sem dados</div>`;
          } else {
            celula = itens
              .map((x) => {
                const trabalho = x.obj.status === "T" || x.obj.status === "FE";
                const cls = trabalho
                  ? "bg-fintria-verdeBg text-fintria-verde border-fintria-verde"
                  : "bg-fintria-azulBg text-fintria-azul border-fintria-azul";
                const status =
                  x.obj.status === "FE"
                    ? "FE"
                    : x.obj.status === "FC"
                      ? "FC"
                      : x.obj.status;
                return `<button data-ri="${x.ri}" data-di="${x.r.dias.indexOf(x.obj)}" class="w-full text-left mb-1 last:mb-0 px-1.5 py-1 rounded border ${cls} hover:opacity-80" title="${trabalho ? "Trabalho" : "Folga"}${trabalho && x.obj.intervaloInicioMin != null ? ` · Intervalo ${minToTime(x.obj.intervaloInicioMin)}–${minToTime(x.obj.intervaloFimMin)}` : ""} — clique para alterar">
              <div class="font-semibold truncate">${escapeHtml(x.r.colaborador.nome || "(sem nome)")}</div>
              <div class="text-[9px] opacity-80">${status}${state.turnosRevezamento ? ` · ${x.obj.turno}` : ""}${x.obj.horas ? ` · ${fmtHoras(x.obj.horas)} · ${minToTime(x.obj.entradaMin)}–${minToTime(x.obj.saidaMin)}` : ""}</div>
            </button>`;
              })
              .join("");
            if (fer)
              celula += `<div class="mt-1 text-[9px] text-fintria-ambar font-semibold truncate" title="${escapeHtml(fer.nome)}">⚑ ${escapeHtml(fer.nome)}</div>`;
          }

          html += `<td class="border border-slate-200 px-1 py-1 align-top ${wd === 0 ? "bg-fintria-vermelhoBg/30" : ""} ${!noMes ? "bg-slate-50/80" : ""}">
          <div class="text-[9px] font-bold ${wd === 0 ? "text-fintria-vermelho" : "text-slate-500"} mb-1 text-center">${String(dt.getDate()).padStart(2, "0")}${!noMes ? `<span class="block text-[8px] font-normal text-slate-400">${MESES[dt.getMonth()].slice(0, 3).toUpperCase()}</span>` : ""}</div>
          ${celula}
        </td>`;
        });

        html += `<td class="border border-slate-200 px-2 py-2 align-top bg-slate-50">${resumoHtml}</td></tr>`;
        cursor.setDate(cursor.getDate() + 7);
      }

      html += `</tbody></table></div></div>`;

      // -------------------------------------------------------
      // RESUMO MENSAL — consolida o efeito das alterações feitas
      // manualmente na grade.
      // -------------------------------------------------------
      html += `<div class="border border-slate-200 rounded-xl overflow-hidden mb-4">
      <div class="px-4 py-3 bg-slate-50 border-b border-slate-200">
        <div class="font-display font-bold text-fintria-navy">Resumo geral do mês</div>
        <div class="text-xs text-slate-500">Os valores abaixo são recalculados sempre que um status diário é alterado.</div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5 p-3">`;
      mensal.forEach((x) => {
        html += `<div class="border border-slate-200 rounded-lg p-3">
        <div class="font-semibold text-fintria-navy">${escapeHtml(x.r.colaborador.nome || "(sem nome)")}</div>
        <div class="grid grid-cols-3 gap-2 mt-2 text-xs">
          <div><div class="font-bold text-fintria-navy">${fmtHoras(x.horas)}</div><div class="text-slate-500">Horas trabalhadas</div></div>
          <div><div class="font-bold text-fintria-navy">${x.diasTrabalho}</div><div class="text-slate-500">Dias trabalhados</div></div>
          <div><div class="font-bold text-fintria-navy">${x.diasFolga}</div><div class="text-slate-500">Dias de folga</div></div>
        </div>
      </div>`;
      });
      html += `</div></div>`;
    }

    html += `<div class="flex gap-4 mt-2.5 text-xs text-slate-500 flex-wrap">
    <span><b class="text-fintria-verde">T</b> — Trabalho</span>
    <span><b class="text-fintria-azul">F</b> — Folga/repouso</span>
    <span><b class="text-fintria-ambar">FE</b> — Feriado trabalhado</span>
    <span><b class="text-fintria-azul">FC</b> — Folga compensatória</span>
    <span class="italic">A grade e os resumos são recalculados após cada alteração.</span>
  </div>`;

    container.innerHTML = html;

    container.querySelectorAll("[data-ri][data-di]").forEach((el) => {
      el.onclick = () =>
        editarStatus(Number(el.dataset.ri), Number(el.dataset.di));
    });
  }

  function gerarEscala() {
    if (!state.colaboradores.length) {
      alert("Cadastre ao menos um colaborador.");
      return;
    }
    state.escalaGerada = gerarDadosEscala();
    renderEscalaGerada();
    saveState();
  }
  return {
    atualizarTurnosEscala,
    gerarEscala,
    editarStatus,
    severityBadge,
    renderEscalaGerada,
    bindEvents,
  };
  function bindEvents() {
    document.getElementById("btn-gerar").onclick = gerarEscala;
  }
}
