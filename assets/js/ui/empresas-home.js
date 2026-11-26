/* Tela inicial "Empresas": cartões das empresas autorizadas com resumo,
 * cadastro de nova empresa, e ao escolher uma empresa: dados (edição e
 * arquivamento para Gerente/Admin) e preenchimentos (abrir ou começar novo). */
import { createCompanyService } from "../services/companies.js";
import { createRemotePersistence } from "../services/persistence.js";
import { createPlanService } from "../services/plans.js";
import { createDiagnosticsService } from "../services/diagnostics.js";
import { getDialogs } from "./dialogs.js";
import { validCnpj, formatCnpj, searchText, normalizeCnpj } from "../shared/empresas.js";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const dataBr = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(+d) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
};
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
export function resumoEmpresa(c) {
  const l = c.latest;
  return {
    preenchimentos: Number(c.drafts ?? 0),
    colaboradores: l ? Number(l.employees ?? 0) : null,
    atualizado: l ? dataBr(l.updatedAt) : "",
    autor: l?.updatedBy || "",
    resultado: !!l?.hasResult,
  };
}

export function createCompaniesHome({
  document,
  window,
  session,
  workspace,
  remote,
  onOpened = () => {},
  onDiagnostic = () => {},
  diagnostics = createDiagnosticsService(),
  companies = createCompanyService(),
  persistence = createRemotePersistence(),
  plans = createPlanService(),
}) {
  const dialogs = getDialogs(document);
  const role = session?.user?.role || "operator";
  const root = document.getElementById("companies-home");
  root.dataset.loadingLabel = "Carregando empresas";
  root.innerHTML = `<div data-home-list>
    <div class="home-topo"><div><p class="home-sobretitulo">Início</p><h2 tabindex="-1">Empresas</h2><p class="home-sub">Escolha uma empresa para abrir um preenchimento ou começar um novo.</p></div>
      <div class="home-topo-acoes"><button type="button" data-home-brand hidden>Marca do escritório</button><button type="button" class="home-botao-pri" data-home-new hidden>+ Nova empresa</button></div></div>
    <div class="home-planos" data-home-plans></div>
    <form id="company-create" class="home-form" hidden><h3>Nova empresa</h3>
      <div class="home-campos"><label>Escritório<select name="officeId" required></select></label><label>Razão social<input name="name" maxlength="160" required autocomplete="off"></label><label>CNPJ<input name="cnpj" maxlength="18" required placeholder="00.000.000/0000-00" autocomplete="off" inputmode="numeric"></label></div>
      <p class="home-nota" data-home-create-plan></p>
      <div class="home-acoes"><button type="submit" class="home-botao-pri">Cadastrar empresa</button><button type="button" data-home-create-cancel>Cancelar</button></div></form>
    <div class="home-filtros" data-home-filters><label class="home-busca">Buscar empresa<input type="search" data-home-search placeholder="Razão social ou CNPJ" autocomplete="off"></label><label data-home-office-filter hidden>Escritório<select data-home-office></select></label>
      <div class="home-visao" role="group" aria-label="Visualização das empresas"><button type="button" data-home-view="cartoes" aria-pressed="true">Cartões</button><button type="button" data-home-view="lista" aria-pressed="false">Lista</button></div></div>
    <p data-home-status class="home-status" role="status" aria-live="polite"></p>
    <ul class="home-grade" data-home-grid data-view="cartoes" aria-label="Empresas"></ul>
    <div class="home-vazio" data-home-empty hidden></div>
  </div>
  <div data-home-detail hidden>
    <button type="button" class="home-voltar" data-home-back>← Empresas</button>
    <div class="home-detalhe-topo"><div><p class="home-sobretitulo" data-detail-office></p><h2 tabindex="-1" data-detail-name></h2><p class="home-sub" data-detail-cnpj></p></div><div class="home-selos" data-detail-badges></div></div>
    <div class="home-detalhe-grade">
      <section class="home-cartao" aria-labelledby="home-drafts-title"><div class="home-cartao-topo"><h3 id="home-drafts-title">Preenchimentos</h3><button type="button" class="home-botao-pri" data-home-new-draft>Novo preenchimento</button></div>
        <p class="home-nota" data-drafts-note></p><ul class="home-preenchimentos" data-home-drafts></ul></section>
      <div class="home-coluna">
      <section class="home-cartao" aria-labelledby="home-company-title"><div class="home-cartao-topo"><h3 id="home-company-title">Dados da empresa</h3><button type="button" data-company-edit-open hidden>Editar</button></div>
        <dl class="home-dados" data-company-view><div><dt>Razão social</dt><dd data-view-name></dd></div><div><dt>CNPJ</dt><dd data-view-cnpj></dd></div><div><dt>Escritório</dt><dd data-view-office></dd></div></dl>
        <form id="company-edit" hidden><label>Razão social<input name="name" required maxlength="160"></label><label>CNPJ<input name="cnpj" required maxlength="18" inputmode="numeric"></label><p class="home-nota" data-cnpj-note></p><div class="home-acoes"><button type="submit" class="home-botao-pri">Salvar alterações</button><button type="button" data-company-edit-cancel>Cancelar</button></div></form>
        <div class="home-arquivo" data-detail-manage hidden><p class="home-nota" data-archive-note></p><button type="button" data-home-archive></button></div>
        <p data-company-status role="status" aria-live="polite"></p></section>
      <section class="home-cartao" data-detail-diagnostics hidden aria-labelledby="home-diag-title"><div class="home-cartao-topo"><h3 id="home-diag-title">Diagnóstico</h3><button type="button" class="home-botao-pri" data-diag-new-open>Novo diagnóstico</button></div>
        <p class="home-nota" data-diag-note>Entrevista sobre a operação para preparar a readequação. Não altera a escala.</p><ul class="home-preenchimentos" data-home-diagnostics></ul></section>
      </div>
    </div>
  </div>`;
  const $ = (s) => root.querySelector(s);
  const list = $("[data-home-list]"), detail = $("[data-home-detail]"), create = $("#company-create"), edit = $("#company-edit");
  let data = { offices: [], companies: [] }, atual = null, busy = false, generation = 0;

  // Visualização em cartões ou lista, guardada neste navegador para cada usuário.
  const chaveVisao = `cjs-empresas-visao:${session?.user?.id || session?.user?.email || "anon"}`;
  function aplicarVisao(visao, salvar = false) {
    const v = visao === "lista" ? "lista" : "cartoes";
    $("[data-home-grid]").dataset.view = v;
    for (const b of root.querySelectorAll("[data-home-view]")) b.setAttribute("aria-pressed", String(b.dataset.homeView === v));
    if (salvar) try { window.localStorage.setItem(chaveVisao, v); } catch {}
  }
  try { aplicarVisao(window.localStorage.getItem(chaveVisao)); } catch { aplicarVisao("cartoes"); }

  async function run(task, label) {
    if (busy) return;
    busy = true;
    if (label) root.dataset.loadingLabel = label;
    root.setAttribute("aria-busy", "true");
    root.inert = true;
    try {
      return await task();
    } finally {
      busy = false;
      root.inert = false;
      root.removeAttribute("aria-busy");
    }
  }
  const status = (t) => ($("[data-home-status]").textContent = t);
  const contexto = () => workspace?.context?.() || null;

  function planosHtml() {
    return data.offices.filter((o) => o.plan?.limited).map((o) => {
      const alerta = o.plan.used >= 0.8 * o.plan.capacity;
      return `<p class="home-plano" data-alerta="${alerta}">${data.offices.length > 1 ? `<b>${esc(o.name)}</b> · ` : ""}Plano ${esc(o.plan.name)}: ${o.plan.used} de ${o.plan.capacity} empresas no ciclo · renova em ${esc(dataBr(o.plan.renewsAt + "T12:00:00"))}</p>`;
    }).join("");
  }
  function cardHtml(c) {
    const r = resumoEmpresa(c), ctx = contexto();
    const aberta = ctx?.companyId === c.id && ctx?.officeId === c.officeId;
    const selos = [
      c.archived ? `<span class="home-selo home-selo-neutro">Arquivada</span>` : "",
      aberta ? `<span class="home-selo home-selo-azul">Aberta agora</span>` : "",
      !c.archived && r.resultado ? `<span class="home-selo home-selo-verde">Escala gerada</span>` : "",
    ].join("");
    const numeros = data.summaryUnavailable ? "" : `<dl class="home-numeros"><div><dt>Preenchimentos</dt><dd>${r.preenchimentos}</dd></div><div><dt>Colaboradores</dt><dd>${r.colaboradores ?? "—"}</dd></div><div><dt>Atualizado</dt><dd>${esc(r.atualizado || "—")}</dd></div></dl>`;
    return `<li><button type="button" class="home-card" data-company-card="${esc(c.id)}" data-office="${esc(c.officeId)}" data-archived="${!!c.archived}">
      <span class="home-card-topo"><span class="home-card-nome">${esc(c.name)}</span><span class="home-selos">${selos}</span></span>
      <span class="home-card-cnpj">${c.cnpj ? esc(formatCnpj(c.cnpj)) : "CNPJ não informado"}${data.offices.length > 1 ? ` · ${esc(c.officeName || "")}` : ""}</span>
      ${numeros}
      <span class="home-card-rodape"><span class="home-card-autor">${r.autor ? `Último salvamento por ${esc(r.autor)}` : r.preenchimentos ? "" : "Nenhum preenchimento salvo"}</span><span class="home-card-seta" aria-hidden="true">→</span></span></button></li>`;
  }
  function renderLista() {
    const criar = data.offices.filter((o) => o.canCreate);
    $("[data-home-new]").hidden = !criar.length;
    $("[data-home-brand]").hidden = !criar.length;
    $("[data-home-plans]").innerHTML = planosHtml();
    const filtroEscritorio = $("[data-home-office]");
    $("[data-home-office-filter]").hidden = data.offices.length < 2;
    const escolhido = filtroEscritorio.value;
    filtroEscritorio.replaceChildren(new Option("Todos os escritórios", ""), ...data.offices.map((o) => new Option(o.name, o.id)));
    filtroEscritorio.value = data.offices.some((o) => o.id === escolhido) ? escolhido : "";
    const termo = searchText($("[data-home-search]").value.trim()), digitos = normalizeCnpj($("[data-home-search]").value);
    const linhas = data.companies.filter((c) => (!filtroEscritorio.value || c.officeId === filtroEscritorio.value)
      && (!termo || searchText(c.name).includes(termo) || (digitos && String(c.cnpj || "").includes(digitos))));
    $("[data-home-grid]").innerHTML = linhas.map(cardHtml).join("");
    $("[data-home-filters]").hidden = !data.companies.length;
    const vazio = $("[data-home-empty]");
    vazio.hidden = data.companies.length > 0 && linhas.length > 0;
    vazio.innerHTML = !data.companies.length
      ? criar.length
        ? `<h3>Nenhuma empresa cadastrada</h3><p>Cadastre a primeira empresa para começar a montar as escalas.</p><button type="button" class="home-botao-pri" data-home-new-empty>Cadastrar nova empresa</button>`
        : `<h3>Nenhuma empresa disponível</h3><p>Peça ao gerente do escritório para cadastrar a empresa ou liberar o seu acesso.</p>`
      : `<p>Nenhuma empresa encontrada para esta busca.</p>`;
  }
  async function carregar() {
    const request = ++generation;
    const r = await companies.cards();
    if (request !== generation) return;
    data = { offices: r.offices || [], companies: (r.companies || []).map((c) => ({ ...c, officeId: c.officeId || c.office_id })), summaryUnavailable: !!r.summaryUnavailable };
    renderLista();
  }

  function abrirCadastro() {
    const escritorios = data.offices.filter((o) => o.canCreate);
    create.elements.officeId.replaceChildren(...escritorios.map((o) => new Option(o.name, o.id)));
    create.hidden = false;
    atualizarAvisoPlano();
    create.elements.name.focus();
  }
  function atualizarAvisoPlano() {
    const o = data.offices.find((x) => x.id === create.elements.officeId.value);
    const p = o?.plan;
    $("[data-home-create-plan]").textContent = p?.limited
      ? p.free > 0 ? `Vagas livres no plano neste ciclo: ${p.free} de ${p.capacity}.` : `Sem vagas livres no plano neste ciclo (${p.used} de ${p.capacity}). Arquive uma empresa sem uso (a vaga volta na renovação) ou fale com a Fintria.`
      : "";
  }
  create.elements.officeId.addEventListener("change", atualizarAvisoPlano);
  $("[data-home-create-cancel]").addEventListener("click", () => { create.reset(); create.hidden = true; });
  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-home-new], [data-home-new-empty]")) abrirCadastro();
    const visao = e.target.closest("[data-home-view]");
    if (visao) aplicarVisao(visao.dataset.homeView, true);
    if (e.target.closest("[data-home-brand]"))
      import("./marca-escritorio.js").then(({ openOfficeBranding }) =>
        openOfficeBranding({ document, window, offices: data.offices.filter((o) => o.canCreate) }));
    const card = e.target.closest("[data-company-card]");
    if (card) mostrarEmpresa(card.dataset.companyCard, card.dataset.office);
  });
  create.addEventListener("submit", (e) => {
    e.preventDefault();
    run(async () => {
      const f = Object.fromEntries(new FormData(create));
      if (!f.name.trim()) throw Error("Informe a razão social.");
      if (!validCnpj(f.cnpj)) throw Error("Informe um CNPJ válido, incluindo os dígitos verificadores.");
      const r = await companies.resolve(f.officeId, f.name.trim(), f.cnpj, true);
      window.dispatchEvent(new window.Event("cjs-company-changed"));
      create.reset();
      create.hidden = true;
      await carregar();
      status(`${r.status === "existing" ? "Empresa já cadastrada" : r.status === "updated" ? "CNPJ vinculado à empresa existente" : "Empresa cadastrada"}: ${r.company.name} — ${formatCnpj(r.company.cnpj)}.`);
      return r.company;
    }, "Cadastrando a empresa").then((company) => company && mostrarEmpresa(company.id, company.officeId))
      .catch((error) => status(error.message));
  });
  $("[data-home-search]").addEventListener("input", renderLista);
  $("[data-home-office]").addEventListener("change", renderLista);

  // Detalhe da empresa
  async function mostrarEmpresa(companyId, officeId) {
    const c = data.companies.find((x) => x.id === companyId && (!officeId || x.officeId === officeId));
    if (!c) return status("Empresa não encontrada. Atualize a lista.");
    atual = { ...c };
    list.hidden = true;
    detail.hidden = false;
    $("[data-company-status]").textContent = "";
    renderDetalhe();
    $("[data-detail-name]").focus({ preventScroll: true });
    await Promise.all([carregarPreenchimentos(), carregarDiagnosticos()]);
  }
  function editar(abrir) {
    edit.hidden = !abrir;
    $("[data-company-view]").hidden = abrir;
    $("[data-company-edit-open]").classList.toggle("home-oculto", abrir);
    if (abrir) edit.elements.name.focus();
  }
  $("[data-company-edit-open]").addEventListener("click", () => editar(true));
  $("[data-company-edit-cancel]").addEventListener("click", () => {
    if (atual) { edit.elements.name.value = atual.name; edit.elements.cnpj.value = atual.cnpj ? formatCnpj(atual.cnpj) : ""; }
    editar(false);
  });
  async function carregarDiagnosticos() {
    const c = atual, alvo = $("[data-home-diagnostics]");
    if ($("[data-detail-diagnostics]").hidden) return;
    alvo.innerHTML = `<li class="home-nota">Carregando diagnósticos…</li>`;
    try {
      const rows = await diagnostics.list({ officeId: c.officeId, companyId: c.id });
      if (atual !== c) return;
      alvo.innerHTML = rows.length
        ? rows.map((d) => `<li><div><strong>${esc(d.unit)}</strong><span>${d.status === "concluido" ? "Concluído" : "Rascunho"} · revisão ${esc(d.revision)} · ${esc(dataBr(d.updatedAt))}${d.updatedBy ? ` · ${esc(d.updatedBy)}` : ""}</span></div><button type="button" data-open-diagnostic="${esc(d.id)}">Abrir</button></li>`).join("")
        : `<li class="home-nota">Nenhum diagnóstico registrado.</li>`;
    } catch (error) {
      if (atual === c) alvo.innerHTML = `<li class="home-nota">${esc(error.message || "Não foi possível carregar os diagnósticos.")}</li>`;
    }
  }
  const abrirDiagnostico = (id) => onDiagnostic({ officeId: atual.officeId, companyId: atual.id, companyName: atual.name, cnpj: atual.cnpj, id });
  $("[data-home-diagnostics]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-open-diagnostic]");
    if (b && atual) abrirDiagnostico(b.dataset.openDiagnostic);
  });
  $("[data-diag-new-open]").addEventListener("click", () => atual && abrirDiagnostico(null));
  function renderDetalhe() {
    const c = atual, r = resumoEmpresa(c);
    $("[data-detail-office]").textContent = c.officeName || data.offices.find((o) => o.id === c.officeId)?.name || "Empresa";
    $("[data-detail-name]").textContent = c.name;
    $("[data-detail-cnpj]").textContent = `${c.cnpj ? `CNPJ ${formatCnpj(c.cnpj)}` : "CNPJ não informado"}${data.summaryUnavailable ? "" : ` · ${plural(r.preenchimentos, "preenchimento", "preenchimentos")}${r.colaboradores != null ? ` · ${plural(r.colaboradores, "colaborador", "colaboradores")}` : ""}`}`;
    $("[data-detail-badges]").innerHTML = c.archived ? `<span class="home-selo home-selo-neutro">Arquivada — somente visualização</span>` : "";
    const gerente = c.canManage ?? data.offices.find((o) => o.id === c.officeId)?.canCreate ?? false;
    $("[data-detail-manage]").hidden = !gerente;
    $("[data-detail-diagnostics]").hidden = !gerente;
    $("[data-diag-new-open]").hidden = !!c.archived;
    $("[data-company-edit-open]").hidden = !gerente || !!c.archived;
    $("[data-view-name]").textContent = c.name;
    $("[data-view-cnpj]").textContent = `${c.cnpj ? formatCnpj(c.cnpj) : "Não informado"}${c.cnpjLocked && c.cnpj ? " · travado após o primeiro uso" : ""}`;
    $("[data-view-office]").textContent = c.officeName || data.offices.find((o) => o.id === c.officeId)?.name || "—";
    editar(false);
    edit.elements.name.value = c.name;
    edit.elements.cnpj.value = c.cnpj ? formatCnpj(c.cnpj) : "";
    const travado = c.cnpjLocked && c.cnpj && role !== "admin";
    edit.elements.cnpj.readOnly = !!travado;
    $("[data-cnpj-note]").textContent = travado ? "CNPJ travado após o primeiro uso. Somente o Admin pode alterá-lo." : "";
    for (const el of edit.elements) el.disabled = !!c.archived;
    const arq = $("[data-home-archive]");
    arq.textContent = c.archived ? "Reativar empresa" : "Arquivar empresa";
    const plano = data.offices.find((o) => o.id === c.officeId)?.plan;
    $("[data-archive-note]").textContent = c.archived
      ? "Empresa arquivada: os preenchimentos podem ser consultados, mas não alterados, gerados, salvos ou exportados."
      : `Arquive empresas que não estão mais em uso.${plano?.limited ? ` A vaga continua contando até o fim do ciclo e fica livre a partir de ${dataBr(plano.renewsAt + "T12:00:00")}.` : ""}`;
    const podeNovo = !c.archived && (c.canWrite ?? true);
    $("[data-home-new-draft]").hidden = !podeNovo;
  }
  async function carregarPreenchimentos() {
    const alvo = $("[data-home-drafts]"), c = atual;
    alvo.innerHTML = `<li class="home-nota">Carregando preenchimentos…</li>`;
    try {
      const rows = await persistence.listDrafts(c.officeId, c.id);
      if (atual !== c) return;
      const ctx = contexto();
      $("[data-drafts-note]").textContent = rows.length ? "" : c.archived ? "Nenhum preenchimento salvo." : "Nenhum preenchimento salvo ainda. Comece um novo para montar a escala.";
      alvo.innerHTML = rows.map((d) => {
        const aberto = ctx?.companyId === c.id && ctx?.draftId === d.id;
        return `<li><div><strong>${esc(d.title)}</strong><span>Revisão ${esc(d.revision)} · atualizado em ${esc(dataBr(d.updated_at))}${aberto ? " · aberto agora" : ""}</span></div><button type="button" data-open-draft="${esc(d.id)}">${c.archived ? "Consultar" : aberto ? "Continuar" : "Abrir"}</button></li>`;
      }).join("");
    } catch (error) {
      alvo.innerHTML = "";
      $("[data-drafts-note]").textContent = error.message || "Não foi possível carregar os preenchimentos.";
    }
  }
  async function abrir(draftId) {
    const c = atual;
    const anterior = window.location.hash;
    window.history.replaceState(null, "", "#sec-config");
    try {
      const ok = await remote.open({ officeId: c.officeId, companyId: c.id, draftId }, { confirmar: "seAlterado" });
      if (ok === false) { window.history.replaceState(null, "", anterior || "#empresas"); return false; }
      return true;
    } catch (error) {
      window.history.replaceState(null, "", anterior || "#empresas");
      $("[data-drafts-note]").textContent = error.status === 401 ? "A sessão expirou. Entre novamente." : error.message;
    }
  }
  $("[data-home-drafts]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-open-draft]");
    if (b) run(() => abrir(b.dataset.openDraft), "Abrindo o preenchimento").then((ok) => ok && onOpened());
  });
  // A troca de tela acontece depois do carregamento, para não ser bloqueada por ele.
  $("[data-home-new-draft]").addEventListener("click", () => run(() => abrir(null), "Abrindo a empresa").then((ok) => ok && onOpened()));
  $("[data-home-back]").addEventListener("click", () => voltar());
  function voltar() {
    atual = null;
    detail.hidden = true;
    list.hidden = false;
    renderLista();
    list.querySelector("h2").focus({ preventScroll: true });
  }
  edit.addEventListener("submit", (e) => {
    e.preventDefault();
    const c = atual;
    run(async () => {
      const f = Object.fromEntries(new FormData(edit));
      if (!validCnpj(f.cnpj)) throw Error("Informe um CNPJ válido.");
      const r = await companies.update({ ...f, officeId: c.officeId, companyId: c.id, previousName: c.name, previousCnpj: c.cnpj });
      window.dispatchEvent(new window.Event("cjs-company-changed"));
      Object.assign(atual, r.company);
      try { await carregar(); } catch {}
      if (atual === c) renderDetalhe();
      editar(false);
      $("[data-company-status]").textContent = `Empresa atualizada: ${r.company.name} — ${formatCnpj(r.company.cnpj)}. Preenchimentos e permissões foram preservados.`;
    }, "Atualizando o cadastro da empresa").catch((error) => ($("[data-company-status]").textContent = error.message));
  });
  $("[data-home-archive]").addEventListener("click", async () => {
    const c = atual;
    const reativar = !!c.archived;
    const plano = data.offices.find((o) => o.id === c.officeId)?.plan;
    const ok = await dialogs.confirm(
      reativar
        ? `Reativar ${c.name}? Ela volta a ocupar uma vaga do plano${plano?.limited ? ` (${plano.used} de ${plano.capacity} em uso)` : ""}.`
        : `Arquivar ${c.name}?\n\nA empresa fica somente para visualização: ninguém poderá alterar, gerar, salvar ou exportar preenchimentos dela.${plano?.limited ? ` A vaga continua contando até o fim do ciclo atual.` : ""}`,
      { title: reativar ? "Reativar empresa" : "Arquivar empresa", confirmText: reativar ? "Reativar" : "Arquivar empresa", cancelText: "Cancelar" },
    );
    if (!ok) return;
    run(async () => {
      const r = await plans.archive(c.officeId, c.id, !reativar);
      Object.assign(atual, r.company);
      window.dispatchEvent(new window.Event("cjs-plan-refresh"));
      try { await carregar(); } catch {}
      if (atual === c) { atual = { ...c, ...(data.companies.find((x) => x.id === c.id) || {}), ...r.company }; renderDetalhe(); await carregarPreenchimentos(); }
      $("[data-company-status]").textContent = reativar ? "Empresa reativada." : "Empresa arquivada: somente visualização.";
    }, reativar ? "Reativando a empresa" : "Arquivando a empresa").catch((error) => ($("[data-company-status]").textContent = error.message));
  });

  return {
    async show({ companyId = null, officeId = null, novaEmpresa = false } = {}) {
      // Entrar na tela mostra a lista atualizada (ou a empresa pedida, ao voltar do diagnóstico).
      atual = null;
      detail.hidden = true;
      list.hidden = false;
      try {
        await run(carregar);
        status("");
        if (companyId) await mostrarEmpresa(companyId, officeId);
        // Vindo de "Gerar escala" sem empresas: já abre o cadastro da primeira.
        else if (novaEmpresa && !data.companies.length && data.offices.some((o) => o.canCreate)) abrirCadastro();
      } catch (error) {
        status(error.status === 401 ? "A sessão expirou. Entre novamente." : error.message || "Não foi possível carregar as empresas.");
      }
    },
    voltar,
    abrirEmpresa: mostrarEmpresa,
    refresh: () => run(carregar).catch((error) => status(error.message)),
  };
}
