const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const contrast = require("./helpers/contrast.cjs");
module.exports = async ({ browser, baseURL, tokens, companyId, savedId }) => {
  const contexts = [];
  try {
    const context = await browser.newContext({
      timezoneId: "America/Sao_Paulo",
    });
    contexts.push(context);
    await context.addCookies([
      { name: "cjs_session", value: tokens[0], url: baseURL },
    ]);
    await context.route("https://**/*", (r) => r.abort());
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const ready = () =>
      page.waitForFunction(
        () => document.documentElement.dataset.ready === "true",
      );
    await page.goto(baseURL);
    await ready();
    const menu = page.locator('[data-app-view="diagnostics"]');
    assert(await menu.isVisible());
    await menu.click();
    const root = page.locator("#company-diagnostics"),
      field = (s) => root.locator(`[data-diag-${s}]`);
    const idle = async () => {
      await page.waitForFunction(
        () =>
          document
            .querySelector("#company-diagnostics")
            .getAttribute("aria-busy") !== "true",
      );
      await page
        .locator("[data-loading-overlay][open]")
        .waitFor({ state: "hidden" });
    };
    await field("record")
      .locator(`option[value="${savedId}"]`)
      .waitFor({ state: "attached" });
    await idle();
    await field("record").selectOption(savedId);
    await idle();
    assert.match(await field("meta").innerText(), /Concluído.*revisão 2/);
    await field("history").selectOption("1");
    await idle();
    assert.match(await field("meta").innerText(), /revisão 1 de 2.*consulta/);
    assert(await root.locator("#diag-q02").isDisabled());
    await field("current").click();
    await idle();
    assert.match(await field("meta").innerText(), /revisão 2 de 2/);
    await field("new").click();
    await idle();
    await root.locator("#diag-q01-0").check();
    await root.locator("#diag-q02").fill("Unidade via navegador");
    await root.locator("#diag-q04").fill("Responsável pela operação");
    await root.locator('[data-diag-step="1"]').click();
    await root.locator("#diag-q05-1").check();
    await root.locator("#diag-q05-1-inicio").fill("08:00");
    await field("save").click();
    await idle();
    assert.match(
      await field("status").innerText(),
      /Rascunho salvo no servidor/,
    );
    const id = await field("record").inputValue();
    assert(id && id !== savedId);
    await page.reload();
    await ready();
    await menu.click();
    await idle();
    await field("record").selectOption(id);
    await idle();
    assert.equal(
      await root.locator("#diag-q02").inputValue(),
      "Unidade via navegador",
    );
    await root.locator('[data-diag-step="1"]').click();
    assert.equal(
      await root.locator("#diag-q05-1-inicio").inputValue(),
      "08:00",
    );
    await root.locator("#diag-q05-1-fim").fill("18:00");
    await field("save").click();
    await idle();
    assert.match(await field("meta").innerText(), /revisão 2/);
    // Outra sessão salva antes da tela atual: não sobrescrever nem perder a edição local.
    const endpoint =
      "/api/diagnostics?" +
      new URLSearchParams({
        action: "get",
        officeId: "20000000-0000-0000-0000-000000000001",
        companyId,
        id,
      });
    let current = await (await page.request.get(baseURL + endpoint)).json();
    await page.request.post(baseURL + "/api/diagnostics", {
      headers: { Origin: baseURL },
      data: {
        action: "save",
        officeId: "20000000-0000-0000-0000-000000000001",
        companyId,
        id,
        revision: current.revision,
        key: randomUUID(),
        status: "rascunho",
        data: current.data,
      },
    });
    await root.locator('[data-diag-step="0"]').click();
    await root.locator("#diag-q02").fill("Edição local preservada");
    await field("save").click();
    await idle();
    assert.match(await field("status").innerText(), /outra revisão/);
    assert.equal(
      await root.locator("#diag-q02").inputValue(),
      "Edição local preservada",
    );
    await page.locator('[data-app-view="schedule"]').click();
    let dialog = page.locator("dialog[data-app-dialog][open]");
    await dialog.waitFor();
    await dialog.locator("[data-dialog-cancel]").click();
    assert.equal(
      await page.locator("body").getAttribute("data-app-view"),
      "diagnostics",
    );
    await field("refresh").click();
    await dialog.waitFor();
    await dialog.locator("[data-dialog-accept]").click();
    await idle();
    assert.equal(
      await root.locator("#diag-q02").inputValue(),
      "Unidade via navegador",
    );
    // Registrar as informações ainda desconhecidas de maneira explícita.
    for (const [step, ids] of [
      [2, ["q10", "q11"]],
      [3, ["q15"]],
      [5, ["q23", "q24", "q26"]],
      [6, ["q27"]],
      [7, ["q32", "q33"]],
    ]) {
      await root.locator(`[data-diag-step="${step}"]`).click();
      for (const q of ids)
        await root.locator(`#diag-${q}-certainty`).selectOption("pendente");
    }
    const ranking = root.locator('[data-question="q32"]');
    assert(
      await ranking
        .locator('[data-order="0"][data-direction="-1"]')
        .isDisabled(),
    );
    assert(
      await ranking
        .locator('[data-order="4"][data-direction="1"]')
        .isDisabled(),
    );
    await ranking.locator("[data-confirm-order]").click();
    await ranking.locator("[data-certainty]").selectOption("pendente");
    await field("summary").click();
    assert.match(
      await root.locator("[data-diag-form]").innerText(),
      /pendência/,
    );
    await field("finish").click();
    await idle();
    assert.match(await field("status").innerText(), /Diagnóstico concluído/);
    assert(await field("reopen").isVisible());
    current = await (await page.request.get(baseURL + endpoint)).json();
    assert.equal(current.status, "concluido");
    assert(current.history.length >= 4);
    for (const dark of [false, true]) {
      if (dark) await page.locator("#btn-theme").click();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(async () => {
        await Promise.all(
          document.body
            .getAnimations({ subtree: true })
            .filter((a) => a.effect?.getTiming().iterations !== Infinity)
            .map((a) => a.finished.catch(() => {})),
        );
      });
      const layout = await root.evaluate((el) => ({
        width: el.clientWidth,
        scroll: el.scrollWidth,
        bad: [...el.querySelectorAll("*")]
          .filter(
            (x) =>
              x.getClientRects().length &&
              x.getBoundingClientRect().right > innerWidth,
          )
          .map((x) => ({
            tag: x.tagName,
            cls: x.className,
            id: x.id,
            w: x.getBoundingClientRect().width,
            text: x.textContent.slice(0, 100),
          }))
          .slice(0, 8),
      }));
      assert(layout.scroll <= layout.width + 1, JSON.stringify(layout));
      assert.deepEqual(await contrast(page, "#company-diagnostics"), []);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await field("reopen").click();
    await root.locator('[data-diag-step="0"]').click();
    await root.locator("#diag-q02").fill("Retentativa idempotente");
    const historyBefore = current.history.length;
    await page.route("**/api/diagnostics", async (route) => {
      if (route.request().method() === "POST") {
        await route.fetch();
        await route.abort();
      } else await route.continue();
    });
    await field("save").click();
    await idle();
    assert(await field("retry").isVisible());
    assert(await root.locator("#diag-q02").isDisabled());
    await page.unroute("**/api/diagnostics");
    await field("retry").click();
    await idle();
    current = await (await page.request.get(baseURL + endpoint)).json();
    assert.equal(current.history.length, historyBefore + 1);
    assert.equal(current.data.answers.q02.value, "Retentativa idempotente");
    // Copiar a referência do preenchimento só sob confirmação e da mesma empresa.
    await page.evaluate(
      async ({ companyId }) => {
        const { createWorkspace } = await import(
          "/assets/js/state/workspace.js"
        );
        const { createDefaultState } = await import(
          "/assets/js/state/store.js"
        );
        const s = createDefaultState();
        s.colaboradores[0].cargo = "Atendente";
        s.colaboradores[1].cargo = "Supervisor";
        createWorkspace(
          localStorage,
          "81000000-0000-4000-8000-000000000001",
        ).activate(
          {
            officeId: "20000000-0000-0000-0000-000000000001",
            companyId,
            draftId: null,
            revision: null,
            title: "Teste de origem",
          },
          s,
        );
      },
      { companyId },
    );
    await page.reload();
    await ready();
    await menu.click();
    await idle();
    await field("record").selectOption(id);
    await idle();
    const state = () =>
      page.evaluate(async () => {
        const { createWorkspace } = await import(
          "/assets/js/state/workspace.js"
        );
        return createWorkspace(
          localStorage,
          "81000000-0000-4000-8000-000000000001",
        ).storage.getItem("fintria-escala-dp-v2");
      });
    const source = await state();
    await field("prefill").click();
    await dialog.waitFor();
    await dialog.locator("[data-dialog-accept]").click();
    await root.locator('[data-diag-step="2"]').click();
    assert.match(await root.locator("#diag-q10").inputValue(), /Atendente/);
    assert.equal(
      await root.locator("#diag-q10-certainty").inputValue(),
      "estimativa",
    );
    assert.equal(await state(), source);
    await field("save").click();
    await idle();
    const savedRoleText = await root.locator("#diag-q10").inputValue();
    await root.locator("#diag-q10").fill("Alteração que será descartada");
    await page.locator('[data-app-view="schedule"]').click();
    await dialog.waitFor();
    await dialog.locator("[data-dialog-accept]").click();
    await page.waitForFunction(
      () => document.body.dataset.appView === "schedule",
    );
    await menu.click();
    await idle();
    assert.equal(await root.locator("#diag-q10").inputValue(), savedRoleText);
    assert.doesNotMatch(
      await field("dirty").innerText(),
      /Alterações não salvas/,
    );
    for (const role of [1, 2]) {
      const c = await browser.newContext();
      contexts.push(c);
      await c.addCookies([
        { name: "cjs_session", value: tokens[role], url: baseURL },
      ]);
      await c.route("https://**/*", (r) => r.abort());
      const p = await c.newPage();
      await p.goto(baseURL);
      await p.waitForFunction(
        () => document.documentElement.dataset.ready === "true",
      );
      if (role === 1) {
        assert(await p.locator('[data-app-view="diagnostics"]').isHidden());
        assert.equal(
          (await p.request.get(baseURL + "/api/diagnostics")).status(),
          403,
        );
      } else {
        await p.locator('[data-app-view="diagnostics"]').click();
        await p
          .locator("#company-diagnostics [data-diag-office] option")
          .first()
          .waitFor({ state: "attached" });
        assert.equal(
          await p
            .locator("#company-diagnostics [data-diag-office] option")
            .count(),
          2,
        );
      }
    }
    assert.deepEqual(errors, []);
    console.log(
      "OK: diagnóstico UI real/SQL — menu por perfil, etapas, rascunho parcial, consulta/revisões, conflito, pendências, conclusão, retry idempotente, prefill sem alterar escala, celular e contraste claro/escuro.",
    );
  } finally {
    for (const c of contexts) await c.close();
  }
};
