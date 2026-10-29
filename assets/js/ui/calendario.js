import { bindArrasteEscala } from "./arrastar-escala.js";
import { editarHorario } from "./horario-manual.js";
import { aplicarHorarioManual, desfazerHorarioRecorrente } from "../domain/horario-manual.js";
import { renderResumoSemanal } from "./resumo-semanal.js";
import { executarCalculoEscala } from "./calculo-escala.js";
import { renderQuadroFixo } from "./escala-fixa.js";
import { createEdicaoManualUI } from "./edicao-manual.js";
import { configurarRolagemEscala } from "./rolagem-escala.js";
import { configDaEscala } from "../domain/contexto-escala.js";
import { createDomain } from "../domain/index.js";
import { createAjustesCoberturaUI } from "./ajustes-cobertura.js";
import { funcaoDoDia } from "../domain/funcoes.js";
import { aplicarRestricoesDia } from "../domain/restricoes.js";
import { configDoPerfil } from "../domain/perfil-dominio.js";
import { apurarComputoCCT } from "../domain/computo-cct.js";
import { apurarSemana } from "../domain/resumo-semanal.js";
import {
  isoDate,
  dateFromKey,
  fmtHoras,
  horarioComDia,
  getMonday,
  formatDateBR,
} from "../domain/datas-horas.js";
import { MESES, DIAS_SEMANA } from "../config/regras-jornada.js";
import { escapeHtml } from "../shared/formatacao.js";

export function createCalendarioUI({
  state,
  domain,
  storage,
  env,
  renderRelatorioCobertura,
  containerId = "resultado-gerar",
  onEscalaChange = () => {},
  ajustesPermitidos = () => true,
}) {
  const {
    calcularSaidaSimulada,
    feriadoDaData,
    validarCobertura,
    gerarDadosEscala,
  } = domain;
  const metodoDaEscala =
    (nome) =>
    (...args) => {
      const config = configDaEscala(state);
      return (config === state ? domain : createDomain(config))[nome](...args);
    };
  const validarLegal = metodoDaEscala("validarLegal");
  const atualizarHorarioEfetivo = metodoDaEscala("atualizarHorarioEfetivo");
  let limparRolagem = () => {};
  const { saveState } = storage;
  const { document, alert, confirm, prompt } = env;

  const ajustes = createAjustesCoberturaUI({
    state,
    storage,
    env,
    containerId,
    renderEscalaGerada,
    onEscalaChange,
    permitido: ajustesPermitidos,
  });

  const edicaoManual = createEdicaoManualUI({
    state,
    storage,
    env,
    containerId,
    renderEscalaGerada,
    onEscalaChange,
    permitido: ajustesPermitidos,
  });

  let editando = false;
  async function editarStatus(ri, di) {
    if (editando) return;
    editando = true;
    const escalaInicial = state.escalaGerada;
    try {
      if (!ajustesPermitidos()) {
        alert("A proposta está desatualizada. Gere novamente antes de editar.");
        return;
      }
      const obj = state.escalaGerada.resultado[ri].dias[di];
      if (obj.status === "NC") {
        alert(
          "Data anterior à admissão. Confira a data de admissão no cadastro importado.",
        );
        return;
      }
      const colaborador = state.escalaGerada.resultado[ri].colaborador;
      if (obj.restricao && obj.restricao.tipo !== "horario") {
        alert(
          `${obj.restricao.descricao}. Altere a restrição no cadastro do colaborador e gere novamente para modificar esta data.`,
        );
        return;
      }
      const atual = obj.status;
      const opcoes = [
        ["T", "T — Trabalho"],
        ["F", "F — Folga/repouso"],
        ["FE", "FE — Feriado trabalhado"],
        ["FC", "FC — Folga compensatória"],
      ].filter(([status]) => state.modeloEscala !== "fixa" || status !== "FE");

      const escolha = await prompt(
        `${state.modeloEscala === "fixa" ? `${DIAS_SEMANA[obj.weekday]} em todas as semanas` : `Dia ${obj.dia} (${DIAS_SEMANA[obj.weekday]})`}\nStatus atual: ${atual}\n\nSelecione o novo status:`,
        atual,
        { title: "Alterar status do dia", label: "Status", choices: opcoes },
      );
      if (escolha === null) return;
      const status = escolha.trim().toUpperCase();
      if (!opcoes.some((o) => o[0] === status)) {
        alert("Status inválido. Use T, F, FE ou FC.");
        return;
      }

      if (status === "FE" && !obj.feriado) {
        if (
          !(await confirm(
            "Este dia não está cadastrado como feriado. Manter FE mesmo assim?",
          ))
        )
          return;
      }

      if (status === "FC") {
        if (
          !(await confirm(
            "FC representa folga compensatória. Confirme que existe fundamento para a compensação antes de usar este status.",
          ))
        )
          return;
      }

      let jornada;
      if (status === "T" || status === "FE") {
        const config = configDaEscala(state);
        const proprio = configDoPerfil(config, colaborador) || config;
        jornada = await (env.editarHorario || editarHorario)(env, obj,
          createDomain(proprio).obterJornadaDoDia(obj.weekday));
        if (jornada === null) return;
      }
      if (state.escalaGerada !== escalaInicial || !ajustesPermitidos()) {
        await alert("A escala mudou durante a edição. Abra o dia novamente.");
        return;
      }
      try {
        state.escalaGerada = aplicarHorarioManual(state, colaborador.id, obj.data, status, jornada);
      } catch (error) {
        await alert(error.message);
        return;
      }
      renderEscalaGerada();
      onEscalaChange();
      saveState();
      if (state.modeloEscala === "fixa")
        document.getElementById(containerId).querySelector("[data-edicao-fixa]")?.focus({ preventScroll: true });
      else edicaoManual.destacar();
    } finally {
      editando = false;
    }
  }

  function atualizarTurnosEscala() {
    if (!state.escalaGerada) return;
    state.escalaGerada.resultado.forEach((r, indice) => {
      for (const dia of [...(r.diasContexto ?? []), ...r.dias]) {
        dia.turno = domain.obterTurno(dateFromKey(dia.data), indice);
        atualizarHorarioEfetivo(dia);
        const config =
          configDoPerfil(configDaEscala(state), r.colaborador) ||
          configDaEscala(state);
        aplicarRestricoesDia(r.colaborador, dia, config, (d) =>
          Object.assign(d, apurarComputoCCT(config, d)),
        );
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
    onEscalaChange();
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

  function bindTrocas(container) {
    bindArrasteEscala({container,state,env,permitido:ajustesPermitidos,render:renderEscalaGerada,salvar:saveState,alterou:onEscalaChange});
  }
  function renderEscalaGerada() {
    if (!state.escalaGerada) return;
    if (state.modeloEscala === "fixa") {
      const config = configDaEscala(state);
      const container = document.getElementById(containerId);
      limparRolagem();
      container.innerHTML = renderQuadroFixo(config, createDomain(config));
      limparRolagem = configurarRolagemEscala(container, env.window);
      bindTrocas(container);
      container.querySelectorAll("[data-ri][data-di]").forEach((el) => {
        el.onclick = () => editarStatus(Number(el.dataset.ri), Number(el.dataset.di));
      });
      container.querySelector("[data-fixo-desfazer]")?.addEventListener("click", async () => {
        if (!ajustesPermitidos()) return;
        try {
          state.escalaGerada = desfazerHorarioRecorrente(state);
          renderEscalaGerada(); onEscalaChange(); saveState();
        } catch (error) { await alert(error.message); }
      });
      return;
    }
    const { resultado } = state.escalaGerada;
    const container = document.getElementById(containerId);
    let analises = state.escalaGerada.referenciaAtual44
      ? '<p data-referencia-atual class="text-sm border border-slate-200 rounded-lg p-3 mb-3">Referência atual 6×1: validação e resumo em 44h semanais, conforme o contexto preservado na conversão. A simulação da fase futura é aplicada à proposta 5×2. Os horários e intervalos efetivos continuam sujeitos às verificações.</p>'
      : "";
    const coberturaHtml = renderRelatorioCobertura(resultado);
    const ajustesHtml = ajustes.renderPainel();

    // As validações são recalculadas a cada renderização. Assim, qualquer alteração
    // manual em um dia repercute imediatamente nos indicadores semanais e mensais.
    const validacoes = resultado.map((r) => ({
      r,
      issues: validarLegal(
        r.colaborador,
        r.dias,
        r.diasContexto,
        r.diasApuracao,
      ),
    }));
    const allIssues = validacoes.flatMap((v) => v.issues);
    const cobertura = validarCobertura(resultado);
    const erros = allIssues.filter((x) => x.severidade === "erro");
    const alertas = allIssues.filter(
      (x) => x.severidade === "alerta" || x.severidade === "pendencia",
    );
    const infos = allIssues.filter((x) => x.severidade === "info");

    if (erros.length) {
      analises += `<div class="rounded-lg px-3.5 py-2.5 text-sm bg-fintria-vermelhoBg text-fintria-vermelho mb-2"><b>${erros.length} incompatibilidade(s) objetiva(s).</b> Os erros detalhados estão antes da grade e precisam ser corrigidos antes de utilizar a escala.</div>`;
    } else if (alertas.length) {
      analises += `<div class="rounded-lg px-3.5 py-2.5 text-sm bg-fintria-ambarBg text-fintria-ambar mb-2"><b>${alertas.length} ponto(s) dependem de análise.</b> Verificações documentais ou de enquadramento pendentes não equivalem à aprovação de adequação à EC 141.</div>`;
    } else {
      analises += `<div class="rounded-lg px-3.5 py-2.5 text-sm bg-fintria-verdeBg text-fintria-verde mb-2"><b>Nenhuma incompatibilidade objetiva detectada</b> nas regras modeladas. Isso não substitui a conferência do caso concreto.</div>`;
    }

    if (cobertura.length) {
      analises += `<div class="rounded-lg px-3.5 py-2.5 text-sm bg-fintria-ambarBg text-fintria-ambar mb-3">⚠ <b>Problema de cobertura:</b> ${cobertura.map((x) => escapeHtml(x.mensagem)).join(" ")}</div>`;
    }

    analises += `<div class="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
    <div class="border border-slate-200 rounded-lg p-3 bg-slate-50"><b class="text-fintria-vermelho">${erros.length}</b><div class="text-xs text-slate-500">ERROS</div></div>
    <div class="border border-slate-200 rounded-lg p-3 bg-slate-50"><b class="text-fintria-ambar">${alertas.length}</b><div class="text-xs text-slate-500">ANÁLISES</div></div>
    <div class="border border-slate-200 rounded-lg p-3 bg-slate-50"><b class="text-fintria-azul">${infos.length}</b><div class="text-xs text-slate-500">INFORMATIVOS</div></div>
    <div class="border border-slate-200 rounded-lg p-3 bg-slate-50"><b class="text-fintria-navy">${resultado.length}</b><div class="text-xs text-slate-500">COLABORADORES</div></div>
  </div>`;

    // ---------------------------------------------------------
    // PAINEL POR COLABORADOR
    // ---------------------------------------------------------
    validacoes.forEach(({ r, issues }) => {
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
      const jIndividual =
        diasAlvo && !r.colaborador.quadroDominio
          ? calcularSaidaSimulada(
              Number(r.colaborador.horasSemana) || 0,
              diasAlvo,
            )
          : null;
      analises += `<div class="border border-slate-200 rounded-lg px-3.5 py-3 mb-3">
      <div class="flex justify-between items-start gap-3">
        <div><b>${escapeHtml(r.colaborador.nome || "(sem nome)")}</b> <span class="text-slate-500">— ${escapeHtml(r.colaborador.cargo || "")}</span> <span class="text-xs text-slate-500">· ${fmtHoras(Number(r.colaborador.horasSemana) || 0)}/semana</span></div>
        <span class="text-[10px] font-bold px-2.5 py-1 rounded-full ${cls}">${label}</span>
      </div>
      ${r.colaborador.quadroDominio?.ativo !== false && r.colaborador.quadroDominio ? '<div class="text-xs text-slate-500 mt-1">Horário individual cadastrado: horários, intervalos e folgas desta pessoa aparecem na grade. A carga de referência deve ser conferida com o contrato.</div>' : state.horarioPorDia ? `<div class="text-xs text-slate-500 mt-1">Carga distribuída dentro dos horários de cada dia. Dias reduzidos são respeitados; consulte os horários efetivos na grade e o fechamento no resumo semanal.</div>` : jIndividual ? `<div class="text-xs text-slate-500 mt-1">Jornada individual estimada (uniforme): entrada ${state.jornada.entrada} · ${fmtHoras(jIndividual.horasDia)}/dia médio em ${diasAlvo} dia(s) · saída ${jIndividual.saida}. Esta é apenas a referência média; os horários efetivos de cada dia aparecem na grade e consideram folgas, feriados e ajustes manuais.</div>` : ""}
      ${
        issues.length
          ? `<div class="mt-2 space-y-1">${issues
              .filter((x) => x.severidade !== "erro")
              .map(
                (x) =>
                  `<div class="text-xs flex gap-2 items-start">${severityBadge(x)}<span>${escapeHtml(x.mensagem)}</span></div>`,
              )
              .join("")}</div>`
          : ""
      }
    </div>`;
    });

    let html = erros.length
      ? `<details data-erros-escala open class="border border-red-200 rounded-lg p-4 mb-4"><summary class="cursor-pointer font-semibold text-fintria-vermelho">${erros.length} incompatibilidade(s) objetiva(s). Corrija os erros abaixo antes de utilizar a escala.</summary>${validacoes
          .filter((v) => v.issues.some((i) => i.severidade === "erro"))
          .map(
            (v) =>
              `<div class="mt-3"><b>${escapeHtml(v.r.colaborador.nome || "(sem nome)")}</b>${v.issues
                .filter((i) => i.severidade === "erro")
                .map(
                  (i) =>
                    `<p class="text-sm mt-1">${severityBadge(i)} ${escapeHtml(i.mensagem)}</p>`,
                )
                .join("")}</div>`,
          )
          .join("")}</details>`
      : "";

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

      html += `<div data-escala-quadro class="escala-quadro border border-slate-200 rounded-xl mb-5">
      <div class="bg-fintria-navy text-white px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-1">
        <div class="escala-identidade"><img class="escala-marca" src="/logos/Reescala_branco_transparente.png" alt="" width="36" height="32" style="width:36px;height:32px;max-width:36px;object-fit:contain;flex-shrink:0"><img class="escala-marca-impressao" src="/logos/Reescala_preto_transparente.png" alt="" width="36" height="32" style="width:36px;height:32px;max-width:36px;object-fit:contain;flex-shrink:0"><div><div class="font-display font-bold text-base">Reescala <span class="font-normal">· Escala mensal</span></div><div class="text-xs opacity-85">Dias na horizontal · semanas do mês na vertical · resumo da semana na última coluna</div></div></div>
        <div class="text-xs opacity-85">Clique em um colaborador para alterar o status</div>
      </div>
      <div class="escala-ferramentas no-print"><span>Role para ver os dias e as semanas. O resumo fica na última coluna.</span><button type="button" data-ver-resumo class="border rounded px-3 py-1 text-fintria-navy">Ver resumo da semana →</button></div>
      <div data-rolagem-topo class="escala-rolagem-topo no-print" tabindex="0" role="region" aria-label="Rolagem horizontal da escala"><div data-rolagem-espaco></div></div>
      <div data-rolagem-escala class="escala-rolagem" tabindex="0" role="region" aria-label="Escala mensal: role para ver todos os dias, semanas e o resumo">
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
          const apuracao = apurarSemana(
            r.colaborador,
            semana,
            configDaEscala(state),
          );
          const folgas = semana.filter(
            (d) => d.status === "F" || d.status === "FC",
          );
          return { r, ...apuracao, folgas };
        });

        const resumoHtml = semanaPorColaborador.map((x) => renderResumoSemanal(x, {
          semana: isoDate(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()),
        })).join("");

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
                const status = x.obj.sabadoCompensado
                  ? "FC — Sábado compensado"
                  : x.obj.reposicaoSabado
                    ? "T — Reposição do sábado compensado"
                    : x.obj.status === "FE"
                      ? "FE"
                      : x.obj.status === "FC"
                        ? "FC"
                        : x.obj.status;
                return `<button data-ri="${x.ri}" data-di="${x.r.dias.indexOf(x.obj)}" class="escala-colaborador w-full text-left mb-2 last:mb-0 rounded border ${cls} hover:opacity-80" title="${escapeHtml(x.obj.restricao?.descricao || (trabalho ? "Trabalho" : x.obj.status === "NC" ? "Anterior à admissão" : "Folga"))}${trabalho && x.obj.intervaloInicioMin != null ? ` · Intervalo ${horarioComDia(x.obj.intervaloInicioMin)}–${horarioComDia(x.obj.intervaloFimMin)}` : ""} — clique para alterar">
              <div class="escala-colaborador-nome">${escapeHtml(x.r.colaborador.nome || "(sem nome)")}</div>
              ${trabalho && x.obj.funcaoAlocada ? `<div class="escala-colaborador-detalhe font-semibold">Função: ${escapeHtml(funcaoDoDia(x.r.colaborador, x.obj))}</div>` : ""}
              ${x.obj.intervaloSugerido ? `<div class="escala-colaborador-detalhe font-semibold">Intervalo sugerido para cobertura</div>` : ""}
              ${x.obj.ajusteAutomatico ? `<div class="escala-colaborador-detalhe">Ajuste de cobertura aplicado</div>` : ""}
              <div class="escala-colaborador-detalhe">${x.obj.restricao ? escapeHtml(x.obj.restricao.descricao) : status}${state.turnosRevezamento ? ` · ${x.obj.turno}` : ""}${x.obj.horas ? ` · ${fmtHoras(x.obj.horas)} trabalhadas` : ""}</div>
              ${trabalho && x.obj.horas ? `<div class="escala-colaborador-detalhe">Horário: ${horarioComDia(x.obj.entradaMin)}–${horarioComDia(x.obj.saidaMin)}</div><div class="escala-colaborador-detalhe">${x.obj.intervaloInicioMin != null && x.obj.intervaloFimMin != null ? `Intervalo: ${horarioComDia(x.obj.intervaloInicioMin)}–${horarioComDia(x.obj.intervaloFimMin)}` : "Sem intervalo"}</div>` : ""}
              ${(x.obj.creditoIntervaloCCT || 0) + (x.obj.creditoNoturnoCCT || 0) > 0 ? `<div class="escala-colaborador-detalhe font-semibold">${fmtHoras(x.obj.horasComputadasCCT)} computadas (CCT)</div>` : ""}
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
    ${resultado.some((r) => r.dias.some((d) => d.status === "NC")) ? "<span>NC — anterior à admissão (não é folga)</span>" : ""}
    ${resultado.some((r) => r.dias.some((d) => d.restricao)) ? "<span>VA — Férias · AF — Afastamento · I — Indisponível. Os bloqueios individuais são preservados.</span>" : ""}
    <span class="italic">A grade e os resumos são recalculados após cada alteração.</span>
  </div>`;

    html += coberturaHtml + ajustesHtml;
    html += `<details data-analises-escala class="border border-slate-200 rounded-lg p-4 mt-4"><summary class="cursor-pointer font-semibold text-fintria-navy">Análises e informações por colaborador — ${alertas.length} ponto(s) de análise · ${infos.length} informativo(s)</summary><div class="mt-4">${analises}</div></details>`;
    const anterior = container.querySelector("[data-rolagem-escala]");
    const posicao = {
      left: anterior?.scrollLeft || 0,
      top: anterior?.scrollTop || 0,
    };
    limparRolagem();
    container.innerHTML = edicaoManual.renderPainel() + html;
    limparRolagem = configurarRolagemEscala(container, env.window, posicao);
    bindTrocas(container);
    ajustes.bindEvents();
    edicaoManual.bindEvents();

    container.querySelectorAll("[data-ri][data-di]").forEach((el) => {
      el.onclick = () =>
        editarStatus(Number(el.dataset.ri), Number(el.dataset.di));
    });
  }

  function gerarEscala(resultado = null) {
    if (!state.colaboradores.length) {
      alert("Cadastre ao menos um colaborador.");
      return;
    }
    try {
      state.escalaGerada = resultado || gerarDadosEscala();
    } catch (error) {
      document.getElementById(containerId).textContent = error.message;
      return;
    }
    renderEscalaGerada();
    onEscalaChange();
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
    const botao = document.getElementById("btn-gerar");
    botao.onclick = async () => {
      if (!state.colaboradores.length) return gerarEscala();
      try {
        await executarCalculoEscala({ state, env, botao, operacao: "gerar",
          fallback: gerarDadosEscala, aplicar: gerarEscala });
      } catch (error) {
        document.getElementById(containerId).textContent = error.message;
      }
    };
  }
}
