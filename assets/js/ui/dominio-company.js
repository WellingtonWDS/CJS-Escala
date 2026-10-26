import { createCompanyService } from "../services/companies.js";
import { validCnpj, formatCnpj } from "../shared/empresas.js";
import { createDefaultState } from "../state/store.js";
export function createDominioCompanyResolver({
  document,
  window,
  workspace,
  state,
  service = createCompanyService(),
}) {
  return async (quadro) => {
    if (workspace.pending())
      throw Error(
        "Conclua o salvamento pendente antes de importar para outra empresa.",
      );
    if (!validCnpj(quadro.empresa.cnpj))
      throw Error(
        "O relatório não contém um CNPJ válido. Confira o arquivo antes de vincular os colaboradores a uma empresa.",
      );
    const result = await chooseCompany({
      document,
      workspace,
      quadro,
      service,
    });
    if (!result) return null;
    const current = workspace.context();
    const same =
      current?.officeId === result.officeId &&
      current?.companyId === result.company.id;
    const base = same ? state : createDefaultState();
    if (!same) {
      base.colaboradores = [];
      base.proximoId = 1;
    }
    return {
      base,
      commit(next) {
        if (workspace.pending())
          throw Error(
            "Há um salvamento pendente. Conclua-o antes de mudar de empresa.",
          );
        workspace.activate(
          same
            ? current
            : {
                officeId: result.officeId,
                companyId: result.company.id,
                draftId: null,
                revision: null,
              },
          next,
        );
        window.dispatchEvent(new Event("cjs-company-changed"));
      },
    };
  };
}
function chooseCompany({ document, workspace, quadro, service }) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "remote-workspace no-print";
    dialog.id = "dominio-company-dialog";
    dialog.setAttribute("aria-label", "Empresa do relatório Domínio");
    dialog.innerHTML = `<h2>Empresa do relatório Domínio</h2><p data-company-import-name></p><p data-company-import-cnpj></p><label>Escritório<select data-company-import-office></select></label><p data-company-import-status role="status" aria-live="polite"></p><div class="remote-actions"><button type="button" data-company-import-confirm disabled>Identificando empresa…</button><button type="button" data-company-import-cancel>Cancelar</button></div><p class="text-xs">O CNPJ identifica a empresa dentro deste escritório. Se for outra empresa, o preenchimento atual ficará preservado e a importação será aberta em um novo rascunho.</p>`;
    const office = dialog.querySelector("select"),
      status = dialog.querySelector("[role=status]"),
      confirm = dialog.querySelector("[data-company-import-confirm]"),
      cancel = dialog.querySelector("[data-company-import-cancel]");
    dialog.querySelector("[data-company-import-name]").textContent =
      quadro.empresa.nome;
    dialog.querySelector("[data-company-import-cnpj]").textContent = formatCnpj(
      quadro.empresa.cnpj,
    );
    let closed = false,
      applying = false,
      generation = 0,
      match;
    const finish = (value) => {
      if (closed) return;
      closed = true;
      generation++;
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    cancel.onclick = () => {
      if (!applying) finish(null);
    };
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      if (!applying) finish(null);
    });
    async function lookup() {
      const request = ++generation;
      match = null;
      confirm.disabled = true;
      if (!office.value) {
        status.textContent =
          "Selecione o escritório ao qual o relatório pertence.";
        return;
      }
      status.textContent = "Consultando empresa pelo CNPJ…";
      try {
        const result = await service.resolve(
          office.value,
          quadro.empresa.nome,
          quadro.empresa.cnpj,
        );
        if (closed || request !== generation) return;
        match = result;
        confirm.disabled = result.status !== "existing" && !result.canCreate;
        confirm.textContent =
          result.status === "existing"
            ? "Usar empresa e importar"
            : result.status === "legacy"
              ? "Vincular CNPJ e importar"
              : "Cadastrar empresa e importar";
        status.textContent =
          result.status === "existing"
            ? `Empresa já cadastrada: ${result.company.name}. Será utilizada sem criar duplicidade.`
            : result.canCreate
              ? result.status === "legacy"
                ? "Encontramos um cadastro com a mesma razão social e sem CNPJ. Confirme para vincular o CNPJ a ele."
                : "Empresa ainda não cadastrada neste escritório. Confirme para cadastrar e importar."
              : "Solicite ao Gerente ou Admin o cadastro deste CNPJ e a autorização de acesso antes de importar.";
      } catch (error) {
        if (!closed && request === generation)
          status.textContent = error.message;
      }
    }
    office.onchange = lookup;
    confirm.onclick = async () => {
      if (!match || applying) return;
      applying = true;
      confirm.disabled = true;
      cancel.disabled = true;
      office.disabled = true;
      status.textContent = "Confirmando empresa…";
      try {
        const result = await service.resolve(
          office.value,
          quadro.empresa.nome,
          quadro.empresa.cnpj,
          true,
        );
        finish({ officeId: office.value, company: result.company });
      } catch (error) {
        status.textContent = error.message;
      } finally {
        applying = false;
        if (!closed) {
          confirm.disabled = false;
          cancel.disabled = false;
          office.disabled = false;
        }
      }
    };
    document.body.append(dialog);
    dialog.showModal();
    status.textContent = "Carregando escritórios autorizados…";
    service
      .options()
      .then((options) => {
        if (closed) return;
        office.replaceChildren(
          new Option("Selecione o escritório", ""),
          ...options.offices.map((row) => new Option(row.name, row.id)),
        );
        const current = workspace.context();
        if (options.offices.some((o) => o.id === current?.officeId))
          office.value = current.officeId;
        else if (options.offices.length === 1)
          office.value = options.offices[0].id;
        lookup();
      })
      .catch((error) => {
        if (!closed) status.textContent = error.message;
      });
  });
}
