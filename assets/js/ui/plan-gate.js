/* Plano do escritório no modo individual com servidor:
 * - toda geração, busca de ajustes, gravação e exportação exige empresa do servidor
 *   e passa pela conferência do plano (limite de empresas, colaboradores e troca de quadro);
 * - empresa arquivada fica somente para visualização;
 * - o gerente vê o uso do plano e pode arquivar/reativar a empresa atual. */
import { createPlanService } from "../services/plans.js";
import { createRemotePersistence } from "../services/persistence.js";
import { getDialogs } from "./dialogs.js";
import { formatCnpj } from "../shared/empresas.js";

const ACOES = {
  gerar: "pré-visualizar a escala",
  proposta: "gerar a proposta 5×2",
  ajustes: "buscar ajustes de cobertura",
  salvar: "salvar o preenchimento",
  exportar: "baixar documentos",
};
export const dataCurta = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
export function textoUso(plan) {
  if (!plan?.limited) return "";
  const extras = plan.swaps ? ` (inclui ${plan.swaps} troca${plan.swaps > 1 ? "s" : ""} de quadro)` : "";
  return `Uso do plano ${plan.name}: ${plan.used} de ${plan.capacity} empresas${extras} · renova em ${dataCurta(plan.renewsAt)}`;
}
// Controles que continuam disponíveis numa empresa arquivada (navegação e consulta).
const LIVRES = "[data-etapa-link],[data-pendencia-etapa],[data-export-pdf],[data-export-termo],[data-termo-abrir],summary,[data-leitura-ok]";

export function initPlanControl({
  document,
  window,
  workspace,
  state,
  service = createPlanService(),
  persistence = createRemotePersistence(),
}) {
  const dialogs = getDialogs(document);
  const root = document.documentElement;
  let company = null,
    plan = null,
    generation = 0;
  const bar = document.getElementById("current-workspace");
  const linha = document.createElement("div");
  linha.className = "workspace-plan";
  linha.hidden = true;
  linha.innerHTML = `<span data-plan-usage></span><button type="button" data-plan-archive data-leitura-ok hidden></button>`;
  (bar?.querySelector(".workspace-context") || bar)?.append(linha);
  const uso = linha.querySelector("[data-plan-usage]"),
    arquivar = linha.querySelector("[data-plan-archive]");
  const main = document.querySelector("main");
  const banner = document.createElement("div");
  banner.id = "aviso-somente-leitura";
  banner.className = "readonly-banner no-print";
  banner.setAttribute("role", "status");
  banner.hidden = true;
  main?.prepend(banner);

  function render() {
    const c = workspace.context();
    const arquivada = !!(c && company?.archived);
    root.dataset.somenteLeitura = String(arquivada);
    banner.hidden = !arquivada;
    banner.innerHTML = arquivada
      ? `<strong>Empresa arquivada — somente visualização.</strong> <span>Os preenchimentos podem ser consultados, mas não alterados, gerados, salvos ou exportados.${plan?.canManage ? " Reative a empresa para voltar a editá-la." : " Peça ao gerente para reativá-la."}</span>`
      : "";
    const gerente = !!(c && company && plan?.canManage);
    uso.textContent = gerente ? textoUso(plan) : "";
    linha.dataset.alerta = String(!!(plan?.limited && plan.used >= 0.8 * plan.capacity));
    arquivar.hidden = !gerente;
    arquivar.textContent = company?.archived ? "Reativar empresa" : "Arquivar empresa";
    linha.hidden = !gerente;
    // Importação SCI: o CNPJ é o da empresa aberta no servidor.
    const cnpj = document.getElementById("sci-cnpj");
    if (cnpj) {
      const travar = !!(c && company?.cnpj);
      if (travar) cnpj.value = formatCnpj(company.cnpj);
      else if (cnpj.dataset.travadoPeloServidor === "true") cnpj.value = "";
      cnpj.readOnly = travar;
      cnpj.dataset.travadoPeloServidor = String(travar);
      cnpj.title = travar ? "CNPJ da empresa aberta no servidor. Para importar outra empresa, troque a empresa atual." : "";
    }
  }

  async function refresh() {
    const request = ++generation,
      c = workspace.context();
    if (!c) {
      company = null;
      plan = null;
      render();
      return;
    }
    try {
      const [rows, status] = await Promise.all([
        persistence.listCompanies(c.officeId),
        service.status(c.officeId).catch(() => null),
      ]);
      if (request !== generation) return;
      company = rows.find((r) => r.id === c.companyId) || null;
      plan = status;
    } catch {
      if (request !== generation) return;
    }
    render();
  }

  async function exigir(acao) {
    const c = workspace.context();
    if (!c) {
      await dialogs.alert(
        `Para ${ACOES[acao] || "continuar"}, selecione a empresa no servidor em “Empresas” (ou em “Empresa atual e Preenchimentos”). O preenchimento local fica apenas como cópia de segurança.`,
        { title: "Selecione a empresa" },
      );
      return false;
    }
    const names = (state.colaboradores || []).map((x) => String(x?.nome ?? "").trim()).filter(Boolean);
    let r;
    try {
      r = await service.use({ officeId: c.officeId, companyId: c.companyId, use: acao, names });
      if (r.status === "confirmar_troca") {
        if (!r.canConfirm) {
          await dialogs.alert(
            `${r.message}\n\nSomente o gerente do escritório pode confirmar a troca de quadro. Peça a ele que abra esta empresa e confirme.`,
            { title: "Troca de quadro detectada" },
          );
          return false;
        }
        const livres = r.plan?.free ?? 0;
        if (!livres) {
          await dialogs.alert(`${r.message}\n\nNão há vaga livre no ciclo. Arquive uma empresa que não está mais em uso (a vaga volta no próximo ciclo) ou fale com a Fintria.`, { title: "Troca de quadro sem vaga" });
          return false;
        }
        const ok = await dialogs.confirm(
          `${r.message}\n\nVagas livres no ciclo: ${livres}. Se for a mesma empresa com novos colaboradores (por exemplo, contratações em massa), confirme. A confirmação fica registrada no histórico do plano.`,
          { title: "Confirmar troca de quadro", confirmText: "Confirmar e usar 1 vaga", cancelText: "Cancelar" },
        );
        if (!ok) return false;
        r = await service.use({ officeId: c.officeId, companyId: c.companyId, use: acao, names, confirmSwap: true });
      }
    } catch (error) {
      await dialogs.alert(error.status === 401 ? "A sessão expirou. Entre novamente." : error.message, { title: "Plano não conferido" });
      return false;
    }
    if (r.plan) plan = { ...r.plan, canManage: plan?.canManage ?? false };
    if (r.status === "bloqueado") {
      if (r.reason === "arquivada" && company) company = { ...company, archived: true };
      render();
      await dialogs.alert(r.message || "Uso não permitido pelo plano.", { title: r.reason === "arquivada" ? "Empresa arquivada" : "Limite do plano" });
      return false;
    }
    if (r.status === "confirmar_troca") return false;
    render();
    if (r.status === "aviso" || r.swapConfirmed) {
      const alvo = bar?.querySelector("[data-current-status]");
      if (alvo) alvo.textContent = r.message || textoUso(r.plan);
    }
    return true;
  }

  arquivar.addEventListener("click", async () => {
    const c = workspace.context();
    if (!c || !company) return;
    const reativar = company.archived;
    if (!reativar && workspace.pending?.()) {
      await dialogs.alert("Conclua o salvamento pendente antes de arquivar a empresa.");
      return;
    }
    const ok = await dialogs.confirm(
      reativar
        ? `Reativar ${company.name}? Ela volta a ocupar uma vaga do plano${plan?.limited ? ` (${plan.used} de ${plan.capacity} em uso)` : ""}.`
        : `Arquivar ${company.name}?\n\nA empresa fica somente para visualização: ninguém poderá alterar, gerar, salvar ou exportar preenchimentos dela.${plan?.limited ? ` A vaga continua contando até o fim do ciclo atual e fica livre a partir de ${dataCurta(plan.renewsAt)}.` : ""}`,
      { title: reativar ? "Reativar empresa" : "Arquivar empresa", confirmText: reativar ? "Reativar" : "Arquivar empresa", cancelText: "Cancelar" },
    );
    if (!ok) return;
    try {
      const r = await service.archive(c.officeId, c.companyId, !reativar);
      company = { ...company, ...r.company };
      plan = { ...r.plan, canManage: true };
      render();
    } catch (error) {
      await dialogs.alert(error.message, { title: "Não foi possível concluir" });
    }
  });

  // Somente visualização: bloqueia edição sem impedir navegação e leitura.
  const bloquear = (event) => {
    if (root.dataset.somenteLeitura !== "true") return;
    const alvo = event.target instanceof window.Element ? event.target : null;
    if (!alvo || !main?.contains(alvo) || alvo.closest(LIVRES)) return;
    const controle = alvo.closest("input,select,textarea,button,[data-ri],[draggable='true'],[contenteditable='true']");
    if (!controle) return;
    if (event.type === "keydown" && ["Tab", "Escape"].includes(event.key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "click") {
      const status = bar?.querySelector("[data-current-status]");
      if (status) status.textContent = "Empresa arquivada: somente visualização.";
    }
  };
  for (const tipo of ["click", "input", "change", "keydown", "pointerdown", "dragstart", "drop", "paste"])
    document.addEventListener(tipo, bloquear, true);

  window.addEventListener("cjs-company-changed", refresh);
  window.addEventListener("cjs-plan-refresh", refresh);
  window.addEventListener("cjs-remote-saved", () => refresh());
  return {
    exigir,
    refresh,
    empresa: () => (workspace.context() && company ? { nome: company.name, cnpj: company.cnpj } : null),
  };
}
