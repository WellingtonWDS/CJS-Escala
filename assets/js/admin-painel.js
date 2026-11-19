/* Painel Admin (/admin): planos por escritório, uso no ciclo, vagas extras,
 * DEMO e histórico. A página é apenas uma casca: todos os dados e ações são
 * conferidos no banco (somente Admin global) por /api/plans. */
import { createPlanService } from "./services/plans.js";
import { getDialogs } from "./ui/dialogs.js";
import { formatCnpj } from "./shared/empresas.js";
import { createCompanyService } from "./services/companies.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const dataBr = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");
const dataHora = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(+d) ? "—" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const EVENTOS = {
  plano_salvo: "Plano salvo",
  plano_removido: "Plano removido",
  vaga_cortesia: "Vaga extra concedida",
  troca_detectada: "Troca de quadro detectada",
  troca_confirmada: "Troca de quadro confirmada",
  arquivada: "Empresa arquivada",
  desarquivada: "Empresa reativada",
  bloqueio: "Uso bloqueado",
  demo: "Visibilidade DEMO alterada",
  cnpj_alterado: "CNPJ alterado",
};
const MOTIVOS = { colaboradores: "acima do limite de colaboradores", troca_sem_vaga: "troca de quadro sem vaga", limite_empresas: "limite de empresas" };
export function descreverEvento(e) {
  const d = e.details || {};
  const partes = [];
  if (e.kind === "plano_salvo") partes.push(`${d.nome} · ${d.empresas} empresas · ${d.colaboradores} colab./empresa · início ${dataBr(d.inicio)}${d.situacao === "suspenso" ? " · suspenso" : ""}`);
  if (e.kind === "plano_removido") partes.push(`${d.nome} (${d.empresas} empresas) → sem limite`);
  if (e.kind === "vaga_cortesia") partes.push(`+${d.quantidade} · ${d.motivo}`);
  if (["troca_detectada", "troca_confirmada"].includes(e.kind)) partes.push(`${d.novos} de ${d.total} colaboradores novos`);
  if (e.kind === "bloqueio") partes.push(MOTIVOS[d.reason] || d.reason || "");
  if (e.kind === "demo") partes.push(d.demo ? "visível só para o Admin" : "visível para os vínculos");
  if (e.kind === "cnpj_alterado") partes.push(`${formatCnpj(d.antes || "")} → ${formatCnpj(d.depois || "")}`);
  return partes.filter(Boolean).join(" ");
}
export function nivelUso(plan) {
  if (!plan?.limited) return "livre";
  if (plan.used > plan.capacity) return "cheio";
  return plan.used >= 0.8 * plan.capacity ? "alto" : "normal";
}
export function alertasDoEscritorio(o) {
  const a = [];
  const nivel = nivelUso(o.plan);
  if (o.plan?.limited && o.plan.status === "suspenso") a.push(["vermelho", "Suspenso"]);
  if (nivel === "cheio") a.push(["vermelho", "Acima do limite"]);
  else if (o.plan?.limited && o.plan.free === 0) a.push(["ambar", "Sem vagas"]);
  else if (nivel === "alto") a.push(["ambar", "≥ 80% do limite"]);
  if (o.pendingSwaps) a.push(["ambar", `${o.pendingSwaps} troca(s) pendente(s)`]);
  if (o.blocks) a.push(["neutro", `${o.blocks} bloqueio(s) em 30 dias`]);
  return a;
}
function barraUso(plan) {
  if (!plan?.limited) return `<span class="selo selo-azul">Sem limite</span>`;
  const pct = Math.min(100, Math.round((plan.used / Math.max(plan.capacity, 1)) * 100));
  return `<div class="uso" data-nivel="${nivelUso(plan)}"><div class="uso-barra" role="img" aria-label="${plan.used} de ${plan.capacity} vagas"><i style="width:${pct}%"></i></div><span class="uso-texto"><b>${plan.used}</b> de ${plan.capacity} vagas${plan.swaps ? ` · ${plan.swaps} troca(s)` : ""}${plan.courtesy ? ` · +${plan.courtesy} extra` : ""}</span></div>`;
}
function eventosHtml(lista, { comEscritorio = false } = {}) {
  if (!lista?.length) return `<li><span class="vazio">Nenhuma atividade registrada.</span></li>`;
  return lista.map((e) => `<li><time datetime="${esc(e.createdAt)}">${esc(dataHora(e.createdAt))}</time><div><strong>${esc(EVENTOS[e.kind] || e.kind)}</strong>${comEscritorio ? ` · ${esc(e.office)}` : ""}${e.company ? ` · ${esc(e.company)}` : ""}<div class="quem">${esc(descreverEvento(e))}${e.actor ? ` — ${esc(e.actor)}` : ""}</div></div></li>`).join("");
}

export async function iniciarPainel({ document: doc = document, service = createPlanService(), companies = createCompanyService(), fetchImpl = fetch } = {}) {
  const dialogs = getDialogs(doc);
  const mostrar = (estado) => {
    doc.body.dataset.estado = estado;
    for (const [sel, nome] of [["[data-carregando]", "carregando"], ["[data-restrito]", "restrito"], ["[data-erro]", "erro"], ["[data-painel]", "pronto"]])
      $(sel, doc).hidden = estado !== nome;
  };
  let dados = null, atual = null, detalhe = null;

  async function identidade() {
    const r = await fetchImpl("/api/auth", { credentials: "same-origin", cache: "no-store" });
    if (r.status === 401) {
      location.replace("/login.html?next=" + encodeURIComponent("/admin/"));
      return null;
    }
    const body = await r.json().catch(() => ({}));
    return body.user || null;
  }

  async function carregar() {
    mostrar("carregando");
    try {
      const user = await identidade();
      if (!user) { mostrar("restrito"); return; }
      $("[data-usuario]", doc).textContent = user.name || "";
      if (user.role !== "admin") { mostrar("restrito"); return; }
      dados = await service.overview();
      renderLista();
      mostrar("pronto");
    } catch (error) {
      if (error.status === 403) return mostrar("restrito");
      if (error.status === 401) return location.replace("/login.html?next=" + encodeURIComponent("/admin/"));
      $("[data-erro-texto]", doc).textContent = error.message;
      mostrar("erro");
    }
  }

  function renderLista() {
    const offices = dados.offices || [];
    const comPlano = offices.filter((o) => o.plan?.limited);
    const alertas = offices.filter((o) => alertasDoEscritorio(o).some(([tom]) => tom !== "neutro"));
    const ativas = offices.reduce((s, o) => s + o.activeCompanies, 0);
    const usadas = comPlano.reduce((s, o) => s + o.plan.used, 0), cap = comPlano.reduce((s, o) => s + o.plan.capacity, 0);
    const kpi = (k, v, sub) => { $(`[data-kpi="${k}"]`, doc).textContent = v; $(`[data-kpi-sub="${k}"]`, doc).textContent = sub; };
    kpi("planos", comPlano.length, `${offices.length - comPlano.length} sem limite`);
    kpi("empresas", ativas, `${offices.reduce((s, o) => s + o.archivedCompanies, 0)} arquivada(s)`);
    kpi("vagas", cap ? `${usadas}/${cap}` : "—", cap ? `${Math.round((usadas / cap) * 100)}% dos planos` : "nenhum plano ativo");
    kpi("alertas", alertas.length, alertas.length ? alertas.map((o) => o.name).slice(0, 2).join(", ") : "tudo em ordem");
    $("[data-alerta-kpi]", doc).dataset.ativo = String(alertas.length > 0);
    $("[data-atualizado]", doc).textContent = `Atualizado em ${dataHora(new Date().toISOString())} · ciclo de referência ${dataBr(dados.today)}`;
    const termo = $("[data-busca]", doc).value.trim().toLowerCase(), filtro = $("[data-filtro]", doc).value;
    const linhas = offices.filter((o) => (!termo || o.name.toLowerCase().includes(termo))
      && (filtro === "todos" || (filtro === "alertas" && alertas.includes(o)) || (filtro === "plano" && o.plan?.limited) || (filtro === "livre" && !o.plan?.limited)));
    $("[data-escritorios] tbody", doc).innerHTML = linhas.map((o) => {
      const p = o.plan || {};
      const selos = alertasDoEscritorio(o).map(([tom, t]) => `<span class="selo selo-${tom}">${esc(t)}</span>`).join("") || `<span class="selo selo-verde">OK</span>`;
      return `<tr data-office="${esc(o.id)}"><td><div class="escritorio-nome">${esc(o.name)} ${o.demo ? `<span class="selo selo-azul">DEMO</span>` : ""}${o.active ? "" : ` <span class="selo selo-neutro">Inativo</span>`}</div><div class="escritorio-meta">${o.activeCompanies} empresa(s) ativa(s) · ${o.users} usuário(s)</div></td>
        <td>${p.limited ? `<strong>${esc(p.name)}</strong><div class="escritorio-meta">${p.companyLimit} empresas${p.status === "suspenso" ? " · suspenso" : ""}</div>` : `<span class="escritorio-meta">Sem plano</span>`}</td>
        <td>${barraUso(p)}</td><td>${p.limited ? p.employeeLimit : "—"}</td><td>${p.limited ? dataBr(p.renewsAt) : "—"}</td>
        <td><div class="selos">${selos}</div></td><td><button type="button" class="botao botao-sec botao-mini" data-gerenciar="${esc(o.id)}">Gerenciar</button></td></tr>`;
    }).join("");
    $("[data-vazio]", doc).hidden = linhas.length > 0;
    $("[data-eventos]", doc).innerHTML = eventosHtml(dados.events, { comEscritorio: true });
  }

  const gaveta = $("[data-gaveta]", doc), formPlano = $("[data-form-plano]", doc), formCortesia = $("[data-form-cortesia]", doc);
  const msg = (sel, texto, tipo = "") => { const el = $(sel, doc); el.textContent = texto; el.dataset.tipo = tipo; };

  async function abrir(officeId) {
    atual = officeId;
    msg("[data-msg-plano]", ""); msg("[data-msg-cortesia]", ""); msg("[data-msg-demo]", "");
    $("[data-gaveta-titulo]", doc).textContent = (dados.offices.find((o) => o.id === officeId) || {}).name || "Escritório";
    $("[data-resumo-uso]", doc).innerHTML = `<div><span>Carregando…</span></div>`;
    if (!gaveta.open) gaveta.showModal();
    try {
      detalhe = await service.detail(officeId);
      renderDetalhe();
    } catch (error) {
      $("[data-resumo-uso]", doc).innerHTML = `<div><span>${esc(error.message)}</span></div>`;
    }
  }

  function renderDetalhe() {
    const { office, plan, companies, events } = detalhe;
    $("[data-gaveta-titulo]", doc).textContent = office.name;
    $("[data-gaveta-demo]", doc).textContent = office.demo ? "Escritório de demonstração" : "Escritório";
    $("[data-resumo-uso]", doc).innerHTML = plan.limited
      ? `<div><span>Em uso</span><strong>${plan.used} / ${plan.capacity}</strong></div><div><span>Vagas livres</span><strong>${plan.free}</strong></div><div><span>Ciclo</span><strong>${dataBr(plan.cycleStart)}</strong></div><div><span>Renova em</span><strong>${dataBr(plan.renewsAt)}</strong></div>${barraUso(plan)}`
      : `<div><span>Plano</span><strong>Sem limite</strong></div><div><span>Empresas ativas</span><strong>${companies.filter((c) => !c.archived).length}</strong></div>`;
    const f = formPlano.elements;
    f.name.value = plan.limited ? plan.name : "";
    f.companyLimit.value = plan.limited ? plan.companyLimit : "";
    f.employeeLimit.value = plan.limited ? plan.employeeLimit : 50;
    f.cycleAnchor.value = plan.limited ? plan.cycleAnchor : (dados.today || "");
    f.status.value = plan.limited ? plan.status : "ativo";
    f.notes.value = plan.limited ? plan.notes || "" : "";
    $("[data-modelo]", doc).value = "";
    $("[data-salvar-plano]", doc).textContent = plan.limited ? "Salvar plano" : "Criar plano";
    $("[data-remover-plano]", doc).hidden = !plan.limited;
    formCortesia.hidden = !plan.limited;
    $("[data-demo]", doc).checked = !!office.demo;
    $("[data-empresas] tbody", doc).innerHTML = companies.length ? companies.map((c) => `<tr><td>${esc(c.name)}</td><td>${c.cnpj ? esc(formatCnpj(c.cnpj)) : "—"}${c.cnpjLocked ? ` <span class="selo selo-neutro" title="Travado após o primeiro uso">travado</span>` : ""}</td>
      <td>${c.archived ? `<span class="selo selo-neutro">Arquivada ${esc(dataBr(c.archivedAt))}</span>` : `<span class="selo selo-verde">Ativa</span>`}</td>
      <td>${c.counted ? "Conta" : "Livre"}${c.swaps ? ` · +${c.swaps} troca` : ""}</td><td>${esc(dataHora(c.lastUse))}</td><td>${c.roster ? `${c.roster} nome(s)` : "—"}</td></tr>`).join("")
      : `<tr><td colspan="6" class="vazio">Nenhuma empresa cadastrada.</td></tr>`;
    $("[data-eventos-escritorio]", doc).innerHTML = eventosHtml(events);
  }

  async function atualizarTudo() {
    dados = await service.overview();
    renderLista();
    if (atual) { detalhe = await service.detail(atual); renderDetalhe(); }
  }

  $("[data-modelo]", doc).addEventListener("change", (e) => {
    const [nome, limite] = e.target.value.split("|");
    if (nome) { formPlano.elements.name.value = nome; formPlano.elements.companyLimit.value = limite; }
  });
  formPlano.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = formPlano.elements, plan = detalhe?.plan;
    const dados = { officeId: atual, revision: plan?.limited ? plan.revision : null, name: f.name.value.trim(), companyLimit: Number(f.companyLimit.value),
      employeeLimit: Number(f.employeeLimit.value), cycleAnchor: f.cycleAnchor.value, status: f.status.value, notes: f.notes.value.trim() };
    if (!dados.name || !Number.isInteger(dados.companyLimit) || dados.companyLimit < 1 || !Number.isInteger(dados.employeeLimit) || dados.employeeLimit < 1 || !dados.cycleAnchor)
      return msg("[data-msg-plano]", "Preencha nome, limites e início do ciclo.", "erro");
    const ativas = detalhe.companies.filter((c) => !c.archived).length;
    if (dados.companyLimit < ativas && !(await dialogs.confirm(`O escritório tem ${ativas} empresas ativas e o limite será ${dados.companyLimit}. Novas empresas ficarão bloqueadas até o gerente arquivar as excedentes. Continuar?`, { title: "Limite abaixo do uso atual", confirmText: "Salvar mesmo assim" })))
      return;
    if (dados.status === "suspenso" && plan?.status !== "suspenso" && !(await dialogs.confirm("Suspender o plano bloqueia gerar, buscar ajustes, salvar e exportar em todas as empresas do escritório. Continuar?", { title: "Suspender plano", confirmText: "Suspender" })))
      return;
    $("[data-salvar-plano]", doc).disabled = true;
    try {
      await service.savePlan(dados);
      await atualizarTudo();
      msg("[data-msg-plano]", "Plano salvo.", "ok");
    } catch (error) { msg("[data-msg-plano]", error.message, "erro"); }
    finally { $("[data-salvar-plano]", doc).disabled = false; }
  });
  $("[data-remover-plano]", doc).addEventListener("click", async () => {
    if (!(await dialogs.confirm("Remover o plano deixa o escritório sem limite de empresas e colaboradores. O histórico é preservado.", { title: "Remover plano", confirmText: "Remover plano" }))) return;
    try {
      await service.removePlan(atual, detalhe.plan.revision);
      await atualizarTudo();
      msg("[data-msg-plano]", "Plano removido: escritório sem limite.", "ok");
    } catch (error) { msg("[data-msg-plano]", error.message, "erro"); }
  });
  formCortesia.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = Number(formCortesia.elements.quantity.value), motivo = formCortesia.elements.reason.value.trim();
    if (!Number.isInteger(q) || q < 1 || !motivo) return msg("[data-msg-cortesia]", "Informe quantidade e motivo.", "erro");
    $("[data-conceder]", doc).disabled = true;
    try {
      await service.courtesy(atual, q, motivo);
      formCortesia.elements.reason.value = "";
      await atualizarTudo();
      msg("[data-msg-cortesia]", `${q} vaga(s) extra(s) até ${dataBr(detalhe.plan.renewsAt)}.`, "ok");
    } catch (error) { msg("[data-msg-cortesia]", error.message, "erro"); }
    finally { $("[data-conceder]", doc).disabled = false; }
  });
  $("[data-demo]", doc).addEventListener("change", async (e) => {
    const demo = e.target.checked;
    try {
      await service.setDemo(atual, demo);
      await atualizarTudo();
      msg("[data-msg-demo]", demo ? "Visível somente para o Admin." : "Visível para os usuários vinculados.", "ok");
    } catch (error) { e.target.checked = !demo; msg("[data-msg-demo]", error.message, "erro"); }
  });
  doc.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-gerenciar]");
    if (b) abrir(b.dataset.gerenciar);
  });
  $("[data-fechar]", doc).addEventListener("click", () => { gaveta.close(); });
  gaveta.addEventListener("close", () => { atual = null; detalhe = null; });
  gaveta.addEventListener("click", (e) => { if (e.target === gaveta) gaveta.close(); });
  $("[data-busca]", doc).addEventListener("input", () => dados && renderLista());
  $("[data-filtro]", doc).addEventListener("change", () => dados && renderLista());
  $("[data-recarregar]", doc).addEventListener("click", carregar);
  // Escritórios: criação exclusiva do Admin (conferida no banco).
  const formEscritorio = $("[data-form-escritorio]", doc);
  $("[data-novo-escritorio]", doc).addEventListener("click", () => {
    formEscritorio.hidden = false;
    msg("[data-msg-escritorio]", "");
    formEscritorio.elements.name.focus();
  });
  $("[data-cancelar-escritorio]", doc).addEventListener("click", () => { formEscritorio.reset(); formEscritorio.hidden = true; });
  formEscritorio.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = formEscritorio.elements.name.value.trim();
    if (!nome) return msg("[data-msg-escritorio]", "Informe o nome do escritório.", "erro");
    $("[data-criar-escritorio]", doc).disabled = true;
    try {
      const r = await companies.createOffice(nome);
      dados = await service.overview();
      renderLista();
      formEscritorio.reset();
      msg("[data-msg-escritorio]", `${r.status === "existing" ? "Escritório já cadastrado" : "Escritório criado"}: ${r.office.name}. Sem plano, ele fica sem limite de empresas.`, "ok");
    } catch (error) { msg("[data-msg-escritorio]", error.message, "erro"); }
    finally { $("[data-criar-escritorio]", doc).disabled = false; }
  });
  // Prévia das festividades: só visual, não altera o calendário.
  const previa = $("[data-seasonal-preview-open]", doc);
  previa.addEventListener("click", async () => {
    previa.disabled = true;
    try {
      const { openSeasonalPreview } = await import("./ui/seasonal-preview.js");
      openSeasonalPreview({ document: doc, role: "admin", returnFocus: previa });
    } catch {
      await dialogs.alert("Não foi possível abrir a prévia. Tente recarregar a página.");
    } finally { previa.disabled = false; }
  });
  await carregar();
}

if (typeof document !== "undefined" && document.querySelector("[data-painel]")) iniciarPainel();
