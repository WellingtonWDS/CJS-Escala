const {
  respondToDialogs,
  waitForDialogs,
  stopDialogResponses,
} = require("./helpers/dialogs.cjs");
const assert = require("node:assert/strict");
module.exports = async function ({ browser, baseURL }) {
  const { cenario } = await import("./fixtures/edicao-manual.mjs");
  const context = await browser.newContext({ timezoneId: "America/Sao_Paulo" });
  try {
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install({ time: new Date("2026-10-23T12:00:00Z") });
    await page.route("https://**/*", (r) =>
      r.request().url().includes("cdn.tailwindcss.com")
        ? r.fulfill({
            contentType: "application/javascript",
            body: "window.tailwind={};",
          })
        : r.abort(),
    );
    await page.goto(baseURL);
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    const seed = cenario();
    seed.colaboradores[0].nome =
      "Colaborador com Nome Completo Muito Extenso para Conferir Quebra de Linha";
    seed.escalaGerada.resultado[0].colaborador.nome =
      seed.colaboradores[0].nome;
    await page.evaluate(
      (s) => localStorage.setItem("fintria-escala-dp-v2", JSON.stringify(s)),
      seed,
    );
    await page.reload();
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    await page.locator('[data-etapa-link="sec-gerar"]').click();
    await waitForDialogs(page);
    const saved = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("fintria-escala-dp-v2")),
      );
    const cards = page.locator("#resultado-gerar .escala-colaborador");
    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.waitForFunction(() => {
        const c = [
          ...document.querySelectorAll("#resultado-gerar .escala-colaborador"),
        ];
        return (
          c.length &&
          Math.max(...c.map((c) => c.getBoundingClientRect().height)) -
            Math.min(...c.map((c) => c.getBoundingClientRect().height)) <
            1
        );
      });
      assert.equal(await cards.count(), 14);
      assert.ok(
        (await cards.first().textContent()).includes(
          seed.colaboradores[0].nome,
        ),
      );
    }
    await page.emulateMedia({ media: "print" });
    await page.waitForFunction(() => {
      const c = [
        ...document.querySelectorAll("#resultado-gerar .escala-colaborador"),
      ];
      return (
        c.length &&
        Math.max(...c.map((c) => c.getBoundingClientRect().height)) -
          Math.min(...c.map((c) => c.getBoundingClientRect().height)) <
          1
      );
    });
    assert.ok(
      await cards.evaluateAll((cards) =>
        cards.every((c) => c.scrollHeight <= c.clientHeight + 2),
      ),
    );
    await page.emulateMedia({ media: "screen" });
    await page.setViewportSize({ width: 1280, height: 900 });
    let liberar;
    const bloqueado = new Promise((r) => (liberar = r));
    await page.route("**/assets/js/workers/edicao-manual.js", async (route) => {
      await bloqueado;
      try {
        await route.continue();
      } catch {}
    });
    let respostas = ["T", "08:00"];
    const responder = (dialog) => dialog.accept(respostas.shift() || "");
    await respondToDialogs(page, responder);
    await page.locator('#resultado-gerar [data-ri="0"][data-di="0"]').click();
    await waitForDialogs(page);
    await waitForDialogs(page);
    stopDialogResponses(page);
    const painel = page.locator("#resultado-gerar-edicao-manual");
    await painel.waitFor();
    assert.match(await painel.locator('[role="alert"]').textContent(), /48:00/);
    assert.equal(await painel.getAttribute("aria-busy"), "true");
    const rascunho = (await saved()).escalaGerada;
    assert.equal(rascunho.resultado[0].dias[0].status, "T");
    assert.deepEqual(rascunho.resultado[1], seed.escalaGerada.resultado[1]);
    await page
      .locator("[data-loading-overlay][open] [data-loading-cancel]")
      .click();
    await waitForDialogs(page);
    liberar();
    await page.unroute("**/assets/js/workers/edicao-manual.js");
    assert.match(
      await painel.locator("[data-manual-mensagem]").textContent(),
      /cancelada/,
    );
    assert.deepEqual((await saved()).escalaGerada, rascunho);
    await painel.locator("[data-manual-buscar]").click();
    await waitForDialogs(page);
    await painel.locator("[data-manual-aplicar]").waitFor();
    assert.deepEqual((await saved()).escalaGerada, rascunho);
    const opcao = await painel
      .locator("[data-manual-opcao] option")
      .evaluateAll(
        (options) =>
          options.find((o) => o.textContent.includes("27/10/2026")).value,
      );
    await painel.locator("[data-manual-opcao]").selectOption(opcao);
    assert.match(
      await painel.locator("[data-manual-detalhes]").textContent(),
      /Colaborador de Exemplo 2/,
    );
    await painel.locator("[data-manual-aplicar]").click();
    await waitForDialogs(page);
    assert.equal(await painel.count(), 0);
    const aplicado = (await saved()).escalaGerada;
    assert.equal(aplicado.resultado[0].dias[0].status, "T");
    for (const r of aplicado.resultado) {
      assert.equal(r.dias.filter((d) => d.status === "F").length, 2);
      assert.equal(
        r.dias.reduce((n, d) => n + d.horas, 0),
        40,
      );
    }
    assert.equal(aplicado.coberturaOperacional.lacunas.length, 0);
    // A nova edição pode ser desfeita, inclusive após recarregar a página.
    respostas = ["F"];
    await respondToDialogs(page, responder);
    await page.locator('#resultado-gerar [data-ri="0"][data-di="0"]').click();
    await waitForDialogs(page);
    await waitForDialogs(page);
    stopDialogResponses(page);
    await page.reload();
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    await page.locator('[data-etapa-link="sec-gerar"]').click();
    await waitForDialogs(page);
    await painel.locator("[data-manual-desfazer]").click();
    await waitForDialogs(page);
    assert.equal(await painel.count(), 0);
    assert.deepEqual(
      (await saved()).escalaGerada.resultado,
      aplicado.resultado,
    );
    assert.deepEqual(errors, []);
    console.log(
      "Edição manual: cartões uniformes, aviso semanal, prévia com colega, cancelamento, aplicação e desfazer após recarga OK.",
    );
  } finally {
    await context.close();
  }
};
