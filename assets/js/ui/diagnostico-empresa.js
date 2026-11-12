import { createDiagnosticsService } from "../services/diagnostics.js";
import { createCompanyCombobox } from "./company-combobox.js";
import { getDialogs } from "./dialogs.js";
import { escapeHtml as h } from "../shared/formatacao.js";
import {
  ETAPAS_DIAGNOSTICO as etapas,
  PERGUNTAS_DIAGNOSTICO as perguntas,
  CERTEZAS,
  visivel,
  respondida,
  resumoDiagnostico,
  validarDiagnostico,
  VERSAO_DIAGNOSTICO,
} from "../diagnostico/questionario.js";
import { renderPergunta, textoResposta } from "./diagnostico-perguntas.js";
import { normalizarJornada, minToTime } from "../domain/datas-horas.js";
const vazio = () => ({ schemaVersion: VERSAO_DIAGNOSTICO, answers: {} });
const data = (v) => (v ? new Date(v).toLocaleString("pt-BR") : "");
export function createCompanyDiagnostics({
  document,
  window,
  service = createDiagnosticsService(),
  workspace,
  app,
}) {
  const root = document.getElementById("company-diagnostics"),
    dialogs = getDialogs(document);
  root.dataset.loadingLabel = "Consultando ou salvando o diagnóstico";
  root.innerHTML = `<header><h2>Diagnóstico da empresa</h2><p>Entenda a operação, registre as condições e prepare a análise de readequação. As respostas ficam vinculadas à empresa; não alteram automaticamente a escala.</p></header>
 <div class="diag-selecao"><label>Escritório<select data-diag-office></select></label>
 <div class="company-combobox" data-diag-company><span id="diag-company-label">Empresa</span><select hidden aria-hidden="true" tabindex="-1"></select><button type="button" data-company-trigger aria-labelledby="diag-company-label diag-company-value" id="diag-company-value" aria-haspopup="listbox" aria-expanded="false" aria-controls="diag-company-options">Selecione a empresa</button><div class="company-combobox-popup" data-company-popup hidden><label>Buscar empresa<input type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="diag-company-options" autocomplete="off" placeholder="Razão social ou CNPJ"></label><div id="diag-company-options" role="listbox" aria-label="Empresas"></div><p role="status" aria-live="polite"></p></div></div></div>
 <div class="diag-registros"><label>Diagnósticos desta empresa<select data-diag-record><option value="">Novo diagnóstico</option></select></label><button type="button" data-diag-new>Novo diagnóstico</button><button type="button" data-diag-refresh>Atualizar lista</button></div>
 <p data-diag-status role="status" aria-live="polite" tabindex="-1"></p>
 <div data-diag-editor hidden><div class="diag-meta"><p data-diag-meta></p><label>Revisões salvas<select data-diag-history aria-label="Revisões salvas"></select></label><button type="button" data-diag-current hidden>Abrir versão atual</button><button type="button" data-diag-reopen hidden>Revisar diagnóstico</button><button type="button" data-diag-prefill hidden>Usar dados do preenchimento aberto</button></div>
 <p data-diag-progress aria-live="polite"></p><nav class="diag-etapas" aria-label="Etapas do diagnóstico"></nav>
 <form data-diag-form novalidate></form>
 <div class="diag-paginacao"><button type="button" data-diag-back>Voltar</button><button type="button" data-diag-next>Avançar</button><button type="button" data-diag-summary>Ver resumo</button></div>
 <div class="diag-salvar"><strong data-diag-dirty></strong><div><button type="button" data-diag-retry hidden>Repetir gravação pendente</button><button type="button" data-diag-save>Salvar rascunho</button><button type="button" data-diag-finish>Concluir diagnóstico</button></div></div></div>`;
  const el = (s) => root.querySelector(`[data-diag-${s}]`),
    office = el("office"),
    company = root.querySelector("[data-diag-company] select"),
    form = el("form");
  let options,
    context = null,
    record = null,
    payload = vazio(),
    step = 0,
    dirty = false,
    busy = false,
    editing = true,
    pending = null;

  const readonly = () =>
    !editing || (!!record && record.revision !== record.latestRevision);
  const scope = () => ({ officeId: office.value, companyId: company.value });
  async function canLeave({ discard = false } = {}) {
    if (!dirty && !pending) return true;
    const ok = await dialogs.confirm(
      pending
        ? "Há uma gravação sem confirmação. Deseja sair? Consulte os diagnósticos da empresa ao retornar."
        : "Há respostas não salvas. Deseja sair e descartar essas alterações?",
      {
        title: "Respostas não salvas",
        confirmText: pending ? "Sair sem confirmação" : "Descartar e sair",
      },
    );
    if (ok && discard) {
      payload = record ? structuredClone(record.data) : vazio();
      dirty = false;
      pending = null;
      editing =
        !record ||
        (record.status === "rascunho" &&
          record.revision === record.latestRevision);
      render();
    }
    return ok;
  }
  window.addEventListener("beforeunload", (event) => {
    if (dirty || pending) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  function changed() {
    dirty = true;
    atualizarProgresso();
  }
  function atualizarProgresso() {
    const r = resumoDiagnostico(payload);
    el("progress").textContent =
      `${step < 8 ? `Etapa ${step + 1} de 8 · ` : "Conferência · "}${r.respondidas} de ${r.total} perguntas registradas · ${r.pendencias.length} pendência(s) · ${r.estimativas.length} estimativa(s)`;
    el("dirty").textContent = dirty
      ? "Alterações não salvas"
      : record
        ? `Salvo no servidor · revisão ${record.revision}`
        : "Novo diagnóstico — ainda não salvo";
    el("finish").textContent = r.pendencias.length
      ? "Concluir com pendências"
      : "Concluir diagnóstico";
  }
  function answer(q) {
    return (
      payload.answers[q.id] || {
        value: [
          "multi",
          "ordem",
          "horarios",
          "cobertura",
          "condicoes",
        ].includes(q.tipo)
          ? []
          : q.tipo === "instrumento"
            ? { nome: "", inicio: "", fim: "", url: "" }
            : "",
        certainty: "confirmada",
        note: "",
      }
    );
  }
  function render(focusId) {
    el("editor").hidden = !context;
    if (!context) return;
    const ro = readonly() || !!pending;
    atualizarProgresso();
    el("retry").hidden = !pending;
    el("meta").textContent = record
      ? `${editing && record.status === "concluido" ? "Em revisão — " : ""}${record.status === "concluido" ? "Concluído" : "Rascunho"} · revisão ${record.revision} de ${record.latestRevision} · ${record.updatedBy} · ${data(record.updatedAt)}${ro ? " · consulta" : ""}`
      : "As informações essenciais podem ser marcadas como pendentes quando ainda não forem conhecidas.";
    el("history").replaceChildren(
      ...(record?.history || []).map(
        (r) =>
          new window.Option(
            `Revisão ${r.revision} · ${r.status === "concluido" ? "Concluído" : "Rascunho"} · ${data(r.savedAt)} · ${r.savedBy}`,
            r.revision,
          ),
      ),
    );
    el("history").value = record?.revision || "";
    el("history").disabled = !record;
    el("current").hidden = !record || record.revision === record.latestRevision;
    el("reopen").hidden =
      !record || record.revision !== record.latestRevision || editing;
    el("save").hidden = ro;
    el("finish").hidden = ro || step !== 8;
    const ctx = workspace?.context();
    el("prefill").hidden =
      ro ||
      !app ||
      ctx?.officeId !== context.officeId ||
      ctx?.companyId !== context.companyId;
    root.querySelector(".diag-etapas").innerHTML = etapas
      .map(
        (e, i) =>
          `<button type="button" data-diag-step="${i}"${step === i ? ' aria-current="step"' : ""}>${i + 1}. ${h(e.titulo)}</button>`,
      )
      .join("");
    if (step < 8)
      form.innerHTML = `<h3 tabindex="-1">${h(etapas[step].titulo)}</h3>${etapas[
        step
      ].perguntas
        .filter((q) => visivel(q, payload.answers))
        .map((q) => renderPergunta(q, answer(q)))
        .join("")}`;
    else form.innerHTML = resumo();
    for (const campo of form.querySelectorAll(
      "input,textarea,select,button[data-add-row],button[data-remove-row],button[data-order],button[data-confirm-order]",
    ))
      if (ro) campo.disabled = true;
    el("back").disabled = step === 0;
    el("next").hidden = step === 8;
    el("next").textContent = step === 7 ? "Conferir respostas" : "Avançar";
    if (focusId)
      document.getElementById(focusId)?.focus({ preventScroll: true });
  }
  function resumo() {
    const r = resumoDiagnostico(payload);
    return `<h3 tabindex="-1">Conferência do diagnóstico</h3><p>Revise as premissas antes de elaborar a escala. Este registro não certifica a conformidade da operação nem substitui a conferência do ACT/CCT.</p><div class="diag-alerta"><strong>${r.pendencias.length} pendência(s) para conferir</strong><ul>${r.pendencias.map((q) => `<li><button type="button" data-go-question="${q.id}">${h(q.titulo)}</button></li>`).join("") || "<li>Nenhuma pendência registrada.</li>"}</ul></div>${etapas
      .map(
        (e, i) =>
          `<details class="diag-resumo" open><summary>${i + 1}. ${h(e.titulo)}</summary><dl>${e.perguntas
            .filter((q) => visivel(q, payload.answers))
            .map((q) => {
              const a = payload.answers[q.id];
              return `<div><dt>${h(q.titulo)}</dt><dd>${h(textoResposta(q, a))}<small>${a ? h(CERTEZAS[a.certainty]) : "Não respondida"}</small>${a?.note ? `<p>${h(a.note)}</p>` : ""}</dd></div>`;
            })
            .join("")}</dl></details>`,
      )
      .join("")}`;
  }
  function reset() {
    record = null;
    payload = vazio();
    step = 0;
    dirty = false;
    editing = true;
    pending = null;
    el("record").value = "";
    render();
  }
  async function run(task) {
    if (busy) return;
    busy = true;
    root.inert = true;
    root.setAttribute("aria-busy", "true");
    el("status").textContent = "Aguarde…";
    try {
      await task();
      if (el("status").textContent === "Aguarde…")
        el("status").textContent = dirty
          ? "Alterações mantidas nesta tela; use Salvar rascunho para registrar."
          : "";
    } catch (e) {
      el("status").textContent = e.message;
      el("record").value = record?.id || "";
      el("history").value = record?.revision || "";
      if (pending) render();
    } finally {
      busy = false;
      root.inert = false;
      root.removeAttribute("aria-busy");
    }
  }
  async function list(selected = "") {
    const rows = await service.list(context);
    el("record").replaceChildren(
      new window.Option("Novo diagnóstico", ""),
      ...rows.map(
        (r) =>
          new window.Option(
            `${r.unit} · ${r.status === "concluido" ? "Concluído" : "Rascunho"} · ${data(r.updatedAt)} · revisão ${r.revision}`,
            r.id,
          ),
      ),
    );
    el("record").value = selected;
  }
  function useRecord(r) {
    if (r.data?.schemaVersion !== VERSAO_DIAGNOSTICO)
      throw Error(
        "Esta versão de questionário não é suportada. Atualize o sistema.",
      );
    validarDiagnostico(r.data, "rascunho");
    record = r;
    payload = structuredClone(r.data);
    dirty = false;
    editing = r.status === "rascunho" && r.revision === r.latestRevision;
    pending = null;
    render();
  }
  async function loadRecord(id, revision) {
    useRecord(
      await service.get({ ...context, id, ...(revision ? { revision } : {}) }),
    );
    el("record").value = id;
    el("status").textContent = "Diagnóstico carregado do servidor.";
  }
  async function mudarContexto() {
    const next = scope(),
      prev = context;
    if (!next.officeId || !next.companyId) {
      context = null;
      reset();
      el("status").textContent =
        "Cadastre uma empresa para iniciar o diagnóstico.";
      return;
    }
    if (!(await canLeave())) {
      if (prev) {
        office.value = prev.officeId;
        picker.setRows(
          options.companies.filter((c) => c.officeId === office.value),
          prev.companyId,
        );
      }
      return;
    }
    context = next;
    el("record").replaceChildren(new window.Option("Novo diagnóstico", ""));
    reset();
    await list();
    el("status").textContent =
      "Selecione um diagnóstico salvo ou inicie um novo.";
  }
  const picker = createCompanyCombobox({
    root: el("company"),
    onChange: () => run(mudarContexto),
  });
  office.addEventListener("change", () =>
    run(async () => {
      picker.setRows(
        options.companies.filter((c) => c.officeId === office.value),
      );
      await mudarContexto();
    }),
  );
  el("record").addEventListener("change", () => {
    const id = el("record").value;
    run(async () => {
      if (!(await canLeave())) {
        el("record").value = record?.id || "";
        return;
      }
      if (id) await loadRecord(id);
      else reset();
    });
  });
  el("new").onclick = () =>
    run(async () => {
      if (await canLeave()) {
        reset();
        el("status").textContent =
          "Novo diagnóstico. Salve um rascunho para registrar as respostas.";
      }
    });
  el("refresh").onclick = () =>
    run(async () => {
      if (await canLeave()) {
        const id = record?.id,
          prev = { ...context },
          next = await service.options();
        options = next;
        office.replaceChildren(
          ...options.offices.map((o) => new window.Option(o.name, o.id)),
        );
        if (options.offices.some((o) => o.id === prev.officeId))
          office.value = prev.officeId;
        picker.setRows(
          options.companies.filter((c) => c.officeId === office.value),
          options.companies.some((c) => c.id === prev.companyId)
            ? prev.companyId
            : "",
        );
        context = scope();
        if (
          context.companyId === prev.companyId &&
          context.officeId === prev.officeId
        ) {
          await list(id);
          if (id) await loadRecord(id);
          else reset();
        } else {
          reset();
          if (context.companyId) await list();
          else {
            context = null;
            render();
          }
        }
      }
    });
  el("history").onchange = () => {
    const revision = Number(el("history").value);
    run(async () => {
      if (await canLeave()) await loadRecord(record.id, revision);
      else el("history").value = record.revision;
    });
  };
  el("current").onclick = () => run(() => loadRecord(record.id));
  el("reopen").onclick = () => {
    editing = true;
    changed();
    render();
  };
  function ir(s) {
    step = s;
    render();
    form.querySelector("h3")?.focus({ preventScroll: true });
  }
  root.addEventListener("click", (e) => {
    const stepButton = e.target.closest("[data-diag-step]");
    if (stepButton) ir(Number(stepButton.dataset.diagStep));
    const go = e.target.closest("[data-go-question]");
    if (go) {
      ir(
        etapas.findIndex((s) =>
          s.perguntas.some((q) => q.id === go.dataset.goQuestion),
        ),
      );
      form.querySelector(`[data-question="${go.dataset.goQuestion}"]`)?.focus();
    }
    const f = e.target.closest("[data-question]");
    if (!f || readonly()) return;
    const q = perguntas.find((q) => q.id === f.dataset.question),
      a = answer(q);
    if (e.target.closest("[data-add-row]")) {
      a.value.push(
        q.tipo === "cobertura"
          ? { funcao: "", minimo: 1, diasSemana: [], inicio: "", fim: "" }
          : { descricao: "", natureza: "obrigatoria" },
      );
    } else if (e.target.closest("[data-remove-row]"))
      a.value.splice(Number(e.target.dataset.removeRow), 1);
    else if (e.target.closest("[data-order]")) {
      const i = Number(e.target.dataset.order),
        d = Number(e.target.dataset.direction);
      a.value = a.value.length ? a.value : [...q.opcoes];
      [a.value[i], a.value[i + d]] = [a.value[i + d], a.value[i]];
    } else if (e.target.closest("[data-confirm-order]"))
      a.value = [...q.opcoes];
    else return;
    payload.answers[q.id] = a;
    changed();
    render();
  });
  form.addEventListener("submit", (e) => e.preventDefault());
  form.addEventListener("input", (e) => {
    if (readonly() || pending) return;
    const t = e.target,
      f = t.closest("[data-question]");
    if (!f) return;
    const q = perguntas.find((q) => q.id === f.dataset.question),
      a = answer(q);
    let rerender = false;
    if (t.hasAttribute("data-value")) {
      a.value = t.value;
      rerender = q.tipo === "select";
    } else if (t.hasAttribute("data-certainty")) a.certainty = t.value;
    else if (t.hasAttribute("data-note")) a.note = t.value;
    else if (t.hasAttribute("data-choice")) {
      a.value = [...f.querySelectorAll("[data-choice]:checked")].map(
        (c) => c.value,
      );
      const exclusivos = [
        "Nenhuma alteração",
        "Nenhuma alternativa",
        "Não há",
        "Não sei",
      ];
      if (t.checked) {
        a.value = exclusivos.includes(t.value)
          ? [t.value]
          : a.value.filter((v) => !exclusivos.includes(v));
        for (const c of f.querySelectorAll("[data-choice]"))
          c.checked = a.value.includes(c.value);
      }
      rerender = q.id === "q30";
    } else if (t.hasAttribute("data-instrument")) {
      a.value =
        t.dataset.instrument === "semInstrumento"
          ? {
              nome: "",
              inicio: "",
              fim: "",
              url: "",
              semInstrumento: t.checked,
            }
          : { ...a.value, [t.dataset.instrument]: t.value };
      rerender = t.type === "checkbox";
    } else if (t.hasAttribute("data-open-day")) {
      const dia = Number(t.dataset.openDay);
      a.value = t.checked
        ? [...a.value, { dia, inicio: "", fim: "" }]
        : a.value.filter((r) => r.dia !== dia);
      rerender = true;
    } else if (t.hasAttribute("data-day"))
      a.value.find((r) => r.dia === Number(t.dataset.day))[t.dataset.key] =
        t.value;
    else if (t.hasAttribute("data-row")) {
      const r = a.value[Number(t.dataset.row)],
        k = t.dataset.key;
      r[k] =
        k === "diasSemana"
          ? [
              ...f.querySelectorAll(
                `[data-row="${t.dataset.row}"][data-key="diasSemana"]:checked`,
              ),
            ].map((c) => Number(c.value))
          : k === "minimo"
            ? t.value === ""
              ? null
              : Number(t.value)
            : t.value;
    } else return;
    if (
      a.value === "Não sei" ||
      (Array.isArray(a.value) && a.value.includes("Não sei"))
    ) {
      a.certainty = "pendente";
      f.querySelector("[data-certainty]").value = "pendente";
    }
    payload.answers[q.id] = a;
    changed();
    f.querySelector("[data-answer-state]").textContent = respondida(a)
      ? "Registrada"
      : "Ainda não respondida";
    if (rerender) render(t.id);
  });
  el("back").onclick = () => ir(Math.max(0, step - 1));
  el("next").onclick = () => ir(Math.min(8, step + 1));
  el("summary").onclick = () => ir(8);
  async function save(status) {
    if (!context || readonly()) return;
    try {
      validarDiagnostico(payload, status);
    } catch (e) {
      el("status").textContent = e.message;
      ir(
        e.questionId
          ? etapas.findIndex((et) =>
              et.perguntas.some((q) => q.id === e.questionId),
            )
          : 8,
      );
      form
        .querySelector(`[data-question="${e.questionId}"]`)
        ?.focus({ preventScroll: true });
      return;
    }
    await run(async () => {
      const signature = JSON.stringify({
        payload,
        status,
        context,
        id: record?.id,
        revision: record?.revision,
      });
      if (pending && pending.signature !== signature)
        throw Error(
          "Há uma gravação sem confirmação. Tente salvar novamente as mesmas respostas antes de alterá-las, ou consulte a versão atual em outra janela.",
        );
      pending ||= {
        signature,
        body: {
          ...context,
          id: record?.id || window.crypto.randomUUID(),
          revision: record?.revision || 0,
          key: window.crypto.randomUUID(),
          status,
          data: structuredClone(payload),
        },
      };
      let result;
      try {
        result = await service.save(pending.body);
      } catch (e) {
        // Falhas confirmadas (validação/permissão/conflito) não ficam como envio incerto.
        if ([400, 401, 403, 404, 409, 413, 415].includes(e.status)) pending = null;
        throw e;
      }
      useRecord(result);
      el("status").textContent =
        `${status === "concluido" ? "Diagnóstico concluído" : "Rascunho salvo"} no servidor · revisão ${result.revision}.${result.latestRevision > result.revision ? " Existe uma revisão mais recente; abra a versão atual." : ""}`;
      try {
        await list(result.id);
      } catch {
        el("status").textContent +=
          " Gravação confirmada; não foi possível atualizar a lista.";
      }
    });
  }
  el("retry").onclick = () =>
    run(async () => {
      if (!pending) return;
      const result = await service.save(pending.body);
      useRecord(result);
      el("status").textContent =
        `Gravação confirmada no servidor · revisão ${result.revision}.`;
      try {
        await list(result.id);
      } catch {
        el("status").textContent += " Reabra a seção para atualizar a lista.";
      }
    });
  el("save").onclick = () => save("rascunho");
  el("finish").onclick = () => save("concluido");
  el("prefill").onclick = async () => {
    if (readonly()) return;
    const ctx = workspace?.context();
    if (
      ctx?.companyId !== context.companyId ||
      ctx?.officeId !== context.officeId
    )
      return;
    if (
      !(await dialogs.confirm(
        "Copiar os horários operacionais, funções e cobertura do preenchimento aberto para estas respostas? Confira os valores antes de concluir.",
        {
          title: "Usar dados do preenchimento",
          confirmText: "Copiar para o diagnóstico",
        },
      ))
    )
      return;
    const s = app.state,
      put = (id, value) => {
        payload.answers[id] = {
          value,
          certainty: "estimativa",
          note: "Copiado do preenchimento aberto; conferir com a empresa.",
        };
      };
    put(
      "q05",
      s.diasTrabalho.flatMap((dia) => {
        const j = normalizarJornada(
          s.tipoEscala !== "12x36" && s.horarioPorDia
            ? s.jornadaPorDia[dia] || s.jornada
            : s.jornada,
        );
        return j
          ? [{ dia, inicio: minToTime(j.entrada), fim: minToTime(j.saida) }]
          : [];
      }),
    );
    put(
      "q10",
      [...new Set(s.colaboradores.map((c) => c.cargo).filter(Boolean))].join(
        "\n",
      ),
    );
    if (s.coberturaAtiva)
      put(
        "q11",
        (s.demandasCobertura || []).map(
          ({ funcao, minimo, diasSemana, inicio, fim }) => ({
            funcao,
            minimo,
            diasSemana: [...diasSemana],
            inicio,
            fim,
          }),
        ),
      );
    changed();
    render();
    el("status").textContent =
      "Dados copiados como estimativa. A escala e os cadastros não foram alterados.";
  };
  return {
    canLeave,
    show: () =>
      run(async () => {
        if (options) return;
        options = await service.options();
        office.replaceChildren(
          ...options.offices.map((o) => new window.Option(o.name, o.id)),
        );
        picker.setRows(
          options.companies.filter((c) => c.officeId === office.value),
        );
        await mudarContexto();
      }),
  };
}
