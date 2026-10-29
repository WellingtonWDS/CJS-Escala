const assert = require("node:assert/strict");
module.exports = async ({ browser, baseURL }) => {
  const ctx = await browser.newContext();
  try {
    const page = await ctx.newPage();
    await page.goto(baseURL);
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    await page.evaluate(async () => {
      const { initRemoteWorkspace } =
        await import("/assets/js/ui/remote-workspace.js");
      const { createWorkspace } = await import("/assets/js/state/workspace.js");
      const { createDefaultState } = await import("/assets/js/state/store.js");
      const { createDomain } = await import("/assets/js/domain/index.js");
      const { converterEscala } =
        await import("/assets/js/domain/conversao.js");
      const { createRemotePersistence } =
        await import("/assets/js/services/persistence.js");
      const office = "20000000-0000-0000-0000-000000000001",
        company = "30000000-0000-0000-0000-000000000001",
        id = "50000000-0000-0000-0000-000000000001";
      const state = createDefaultState();
      state.ano = 2026;
      state.mes = 9;
      state.escalaGerada = createDomain(state).gerarDadosEscala();
      state.conversao = converterEscala(state, {
        periodo: "2028-02",
        fase: "definitivo40",
        folgas: "fim_semana",
      });
      window.__originalSnapshot = JSON.stringify(state);
      const workspace = createWorkspace(
        localStorage,
        "10000000-0000-0000-0000-000000000001",
      );
      workspace.activate(
        { officeId: office, companyId: company, draftId: null, revision: null },
        state,
      );
      const service = createRemotePersistence({
        fetchImpl: async (_, options) => {
          const b = JSON.parse(options.body);
          let response;
          if (b.action === "listOffices")
            response = [{ id: office, name: "Escritório" }];
          if (b.action === "listCompanies")
            response = [
              { id: company, name: "Empresa teste", cnpj: "11222333000181" },
            ];
          if (b.action === "listDrafts") response = [];
          if (b.action === "saveDraft") {
            (window.__retryKeys ||= []).push(b.key);
            if(window.__networkDown) throw Error("Falha de rede");
            window.__wireSnapshot = b.state;
            response = { id, revision: 1 };
          }
          if (b.action === "getDraft")
            response = { id, revision: 1, state: window.__wireSnapshot };
          return new Response(JSON.stringify(response), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        },
      });
      await initRemoteWorkspace({
        app: { state },
        workspace,
        document,
        window,
        service,
      });
      window.__service = service;
      window.__company = { office, company, id };
      window.__networkDown = true;
      document.getElementById("conversao-mensagem").textContent = "A cópia automática falhou.";
      window.__originalSet = Storage.prototype.setItem;
      Storage.prototype.setItem = () => {
        throw new DOMException("Sem espaço", "QuotaExceededError");
      };
    });
    await page.locator("#btn-workspace-fab").click();
    await page.locator("[data-remote-save]").click();
    await page.waitForFunction(()=>document.querySelector('[data-current-status]').textContent.includes('apenas nesta aba'));
    assert.doesNotMatch(await page.locator('[data-current-status]').textContent(),/Salvo no servidor/);
    await page.evaluate(()=>window.__networkDown=false);
    await page.locator('[data-remote-save]').click();
    await page.waitForFunction(() =>
      document
        .querySelector("[data-current-status]")
        .textContent.includes("Salvo no servidor"),
    );
    assert.match(
      await page.locator("[data-current-status]").textContent(),
      /Inclui a escala atual e a proposta/,
    );
    assert.match(
      await page.locator("[data-current-status]").textContent(),
      /cópia local/,
    );
    const result = await page.evaluate(async () => {
      Storage.prototype.setItem = window.__originalSet;
      const c = window.__company;
      const reopened = await window.__service.getDraft(
        c.office,
        c.company,
        c.id,
      );
      return {
        compressed: !!window.__wireSnapshot.resultadosCompactados,
        identical: JSON.stringify(reopened.state) === window.__originalSnapshot,
      };
    });
    assert(result.compressed);
    assert(result.identical);
    assert.match(await page.locator("#conversao-mensagem").textContent(),/salvas no servidor/);
    const keys=await page.evaluate(()=>window.__retryKeys);assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);
    console.log(
      "OK: salvamento remoto independe de quota local, confirma servidor e reabre escala atual/proposta completas pelo transporte compactado.",
    );
  } finally {
    await ctx.close();
  }
};
