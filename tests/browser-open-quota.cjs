const assert = require("node:assert/strict");
const selectCompany = require("./helpers/company-picker.cjs");
module.exports = async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  try {
    await ctx.route("**/assets/js/main.js", (r) =>
      r.fulfill({
        contentType: "application/javascript",
        body: 'document.documentElement.style.visibility="visible";',
      }),
    );
    const page = await ctx.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(baseURL);
    await page.evaluate(async () => {
      const { createApplication } = await import("/assets/js/app.js");
      const { createWorkspace } = await import("/assets/js/state/workspace.js");
      const { createDefaultState } = await import("/assets/js/state/store.js");
      const { createDomain } = await import("/assets/js/domain/index.js");
      const { converterEscala } =
        await import("/assets/js/domain/conversao.js");
      const { getDialogs } = await import("/assets/js/ui/dialogs.js");
      const { initRemoteWorkspace } =
        await import("/assets/js/ui/remote-workspace.js");
      const user = "10000000-0000-0000-0000-000000000001",
        office = "20000000-0000-0000-0000-000000000001",
        oldCompany = "30000000-0000-0000-0000-000000000001",
        company = "30000000-0000-0000-0000-000000000002",
        oldId = "50000000-0000-0000-0000-000000000001",
        id = "50000000-0000-0000-0000-000000000002";
      const raw = {
        getItem: (k) => localStorage.getItem(k),
        setItem: (k, v) => {
          if (window.__quota)
            throw new DOMException("Quota exceeded", "QuotaExceededError");
          localStorage.setItem(k, v);
        },
        removeItem: (k) => localStorage.removeItem(k),
      };
      const workspace = createWorkspace(raw, user),
        old = createDefaultState(new Date(2026, 9, 1));
      old.colaboradores[0].nome = "Preenchimento local anterior";
      workspace.activate(
        {
          officeId: office,
          companyId: oldCompany,
          draftId: oldId,
          revision: 1,
        },
        old,
      );
      const incoming = createDefaultState(new Date(2026, 7, 1));
      incoming.colaboradores.forEach(
        (c, i) => (c.nome = `Colaborador remoto ${i + 1}`),
      );
      incoming.escalaGerada = createDomain(incoming).gerarDadosEscala();
      incoming.conversao = converterEscala(incoming, {
        periodo: "2028-02",
        fase: "definitivo40",
        folgas: "fim_semana",
      });
      incoming.destinoConversao = {
        periodo: "2028-02",
        fase: "definitivo40",
        folgas: "fim_semana",
        modeloEscala: "dinamica",
      };
      const remote = {
        id,
        title: "Preenchimento de outro computador",
        revision: 7,
        schema_version: 1,
        state: JSON.parse(JSON.stringify(incoming)),
      };
      const service = {
        listOffices: async () => [{ id: office, name: "Escritório" }],
        listCompanies: async () => [
          { id: oldCompany, name: "Empresa anterior" },
          { id: company, name: "Empresa remota" },
        ],
        listDrafts: async (_, c) => (c === company ? [remote] : []),
        getDraft: async (_, __, d) =>
          d === id
            ? remote
            : {
                id: oldId,
                title: "Anterior",
                revision: 1,
                schema_version: 1,
                state: old,
              },
        saveDraft: async (b) => {
          window.__savedRemotely = b;
          return { id, revision: 8 };
        },
      };
      const env = {
        document,
        window,
        location,
        localStorage: {
          ...workspace.storage,
          setItem: (...args) => {
            try {
              workspace.storage.setItem(...args);
            } finally {
              window.dispatchEvent(new Event("cjs-local-save"));
            }
          },
        },
        Blob,
        URL,
        setTimeout: (...a) => window.setTimeout(...a),
        ...getDialogs(document),
        individual: true,
        preserveSavedPeriod: false,
      };
      const app = createApplication({ env, now: () => new Date(2026, 9, 29) });
      app.bindEvents();
      app.init();
      await initRemoteWorkspace({ app, workspace, document, window, service });
      window.__app = app;
      window.__workspace = workspace;
      window.__marker = "same-document";
      window.__target = { id, company };
      window.__remoteRow = remote;
      window.__oldCache = workspace.cached({
        officeId: office,
        companyId: oldCompany,
        draftId: oldId,
        revision: 1,
      });
      window.__durableContext = localStorage.getItem(
        `fintria-escala-dp-v2:user:${user}:context`,
      );
      window.__quota = true;
    });
    const { gerarModeloColaboradores } =
      await import("../assets/js/import/colaboradores.js");
    await page.evaluate(() => {
      document.getElementById("importacao-colaboradores").open = true;
      document.getElementById("colab-nome").value =
        "Cadastro incompleto da empresa anterior";
    });
    await page
      .locator("#importacao-arquivo")
      .setInputFiles({
        name: "anterior.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          gerarModeloColaboradores() + "Pessoa CSV anterior;M;Atendente;40\r\n",
        ),
      });
    await page.waitForFunction(
      () => !document.getElementById("importacao-previa").hidden,
    );
    await page.locator("#btn-remote-workspace").click();
    await page.waitForFunction(
      () =>
        !document.querySelector("#remote-workspace").hasAttribute("aria-busy"),
    );
    const target = await page.evaluate(() => window.__target);
    await selectCompany(page, target.company);
    await page.waitForFunction(
      () =>
        !document.querySelector("#remote-workspace").hasAttribute("aria-busy"),
    );
    await page.locator("[data-remote-draft]").selectOption(target.id);
    await page.locator("[data-remote-open]").click();
    const confirm = page.locator('dialog[data-app-dialog="confirm"][open]');
    await confirm.waitFor();
    await confirm.locator("[data-dialog-accept]").click();
    await page.waitForFunction(
      () =>
        !document.querySelector("#remote-workspace").open &&
        window.__app.state.colaboradores[0].nome === "Colaborador remoto 1",
    );
    assert.equal(await page.locator("#cfg-mes").inputValue(), "7");
    assert.equal(await page.evaluate(() => window.__marker), "same-document");
    assert(await page.locator("[data-current-status]").isVisible());
    assert.match(
      await page.locator("[data-current-status]").textContent(),
      /Sem espaço.*aberto nesta aba/,
    );
    assert.equal(
      await page.locator('[data-field="nome"]').first().inputValue(),
      "Colaborador remoto 1",
    );
    assert(
      await page.evaluate(
        () =>
          !!window.__app.state.escalaGerada?.resultado.length &&
          !!window.__app.state.conversao?.proposta.config.escalaGerada.resultado
            .length,
      ),
    );
    assert.equal(
      await page.evaluate(
        () =>
          localStorage.getItem(
            "fintria-escala-dp-v2:user:10000000-0000-0000-0000-000000000001:context",
          ) === window.__durableContext,
      ),
      true,
    );
    assert.equal(await page.locator("#colab-nome").inputValue(), "");
    assert.equal(await page.locator("#importacao-arquivo").inputValue(), "");
    assert(await page.locator("#importacao-confirmar").isDisabled());
    assert.equal(
      await page.evaluate(() => window.__app.storage.saveState()),
      false,
    );
    assert.match(
      await page.locator("[data-current-status]").textContent(),
      /Alterações apenas nesta aba/,
    );
    await page.locator("[data-remote-save]").click();
    await page.waitForFunction(() =>
      document
        .querySelector("[data-current-status]")
        .textContent.includes("Salvo no servidor"),
    );
    assert(
      await page.evaluate(
        () =>
          window.__savedRemotely.state.colaboradores[0].nome ===
            "Colaborador remoto 1" &&
          !!window.__savedRemotely.state.conversao &&
          window.__savedRemotely.draftId === window.__target.id,
      ),
    );
    await page.evaluate(() => {
      window.__remoteRow.revision = 9;
      window.__remoteRow.state = {
        ...window.__remoteRow.state,
        escalaGerada: null,
        conversao: null,
      };
      window.__remoteRow.state.colaboradores[0].nome = "Colaborador sem escala";
    });
    await page.locator("#btn-remote-workspace").click();
    await page.waitForFunction(
      () =>
        !document.querySelector("#remote-workspace").hasAttribute("aria-busy"),
    );
    await page.locator("[data-remote-open]").click();
    await confirm.waitFor();
    await confirm.locator("[data-dialog-accept]").click();
    await page.waitForFunction(
      () =>
        !document.querySelector("#remote-workspace").open &&
        window.__app.state.colaboradores[0].nome === "Colaborador sem escala",
    );
    assert.equal(await page.locator("#resultado-gerar [data-ri]").count(), 0);
    assert.equal(
      await page.locator("#resultado-proposta [data-ri]").count(),
      0,
    );
    assert.equal(await page.locator("#conversao-comparacao").textContent(), "");
    assert.deepEqual(errors, []);
    console.log(
      "OK: abrir preenchimento remoto com quota esgotada sem reload; mês, dados e escalas preservados, cache anterior intacto e gravação remota disponível.",
    );
  } finally {
    await ctx.close();
  }
};
