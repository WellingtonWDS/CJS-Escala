const { clicarCalculo } = require("./helpers/calculo.cjs");
const {
  respondToDialogs,
  waitForDialogs,
  stopDialogResponses,
} = require("./helpers/dialogs.cjs");
const { irParaEtapa } = require("./helpers/etapas.cjs");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

(async () => {
  const { createDevServer } = await import("../scripts/serve.js");
  const { gerarCsv } = await import("../assets/js/export/csv.js");
  const server = createDevServer({
    root: path.resolve(__dirname, "../dist"),
    auth: false,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
    });
    const context = await browser.newContext({
      timezoneId: "America/Sao_Paulo",
    });
    const page = await context.newPage();
    await page.clock.install({ time: new Date("2026-10-19T12:00:00Z") });
    // Testa a aplicação sem depender da disponibilidade de fontes e Tailwind externos.
    await page.route("https://**/*", (route) =>
      route.request().url().includes("cdn.tailwindcss.com")
        ? route.fulfill({
            contentType: "application/javascript",
            body: "window.tailwind={};",
          })
        : route.abort(),
    );
    const errors = [],
      failedAssets = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.url().includes("127.0.0.1") && response.status() >= 400)
        failedAssets.push(response.url());
    });
    await respondToDialogs(page, (dialog) => dialog.dismiss());
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(
      () => document.getElementById("cfg-mes").options.length === 12,
    );
    assert.equal(await page.locator("#cfg-mes").inputValue(), "9");
    const saved = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("fintria-escala-dp-v2")),
      );
    await irParaEtapa(page, "#ciclo-12x36-config");
    assert.equal(await page.locator("#ciclo-12x36-config").isVisible(), false);
    for (const type of ["6x1", "5x2", "12x36", "custom"]) {
      await irParaEtapa(page, `[data-tipo="${type}"]`);
      await page.locator(`[data-tipo="${type}"]`).click();
      await waitForDialogs(page);
      await irParaEtapa(page, "#ciclo-12x36-config");
      assert.equal(
        await page.locator("#ciclo-12x36-config").isVisible(),
        type === "12x36",
      );
      await irParaEtapa(page, "#btn-gerar");
      await clicarCalculo(page, "#btn-gerar");
      await waitForDialogs(page);
      await irParaEtapa(page, "#resultado-gerar");
      assert.match(
        await page.locator("#resultado-gerar").innerText(),
        /Escala mensal/,
      );
    }
    console.log(
      "OK: modelos de escala e carregamento dos módulos na saída de produção",
    );
    await irParaEtapa(page, '[data-tipo="5x2"]');
    await page.locator('[data-tipo="5x2"]').click();
    await waitForDialogs(page);
    assert.equal(
      await page.locator("#importacao-colaboradores").getAttribute("open"),
      null,
    );
    assert.equal(
      await page.locator("#cadastro-manual-colaboradores").getAttribute("open"),
      null,
    );
    assert.deepEqual(
      await page
        .locator("#config-colaboradores > details")
        .evaluateAll((els) => els.map((el) => el.id)),
      [
        "importacao-colaboradores",
        "cadastro-manual-colaboradores",
        "importacao-dominio",
      ],
    );
    await irParaEtapa(page, "#cadastro-manual-colaboradores > summary");
    await page.locator("#cadastro-manual-colaboradores > summary").click();
    await waitForDialogs(page);
    assert.equal(
      await page.locator("#cadastro-manual-colaboradores #colab-list").count(),
      0,
    );
    const beforeManual = (await saved()).colaboradores.length;
    await irParaEtapa(page, "#btn-add-colab");
    await page.locator("#btn-add-colab").click();
    await waitForDialogs(page);
    assert.equal((await saved()).colaboradores.length, beforeManual);
    await irParaEtapa(page, "#colab-nome");
    await page.locator("#colab-nome").fill("Pessoa cadastrada");
    await irParaEtapa(page, "#colab-sexo");
    await page.locator("#colab-sexo").selectOption("masculino");
    await irParaEtapa(page, "#colab-cargo");
    await page.locator("#colab-cargo").fill("Atendente");
    await irParaEtapa(page, "#colab-horas");
    await page.locator("#colab-horas").fill("40");
    assert.equal((await saved()).colaboradores.length, beforeManual);
    await irParaEtapa(page, "#btn-add-colab");
    await page.locator("#btn-add-colab").click();
    await waitForDialogs(page);
    assert.equal((await saved()).colaboradores.length, beforeManual + 1);
    assert.equal(await page.locator("#colab-nome").inputValue(), "");
    assert.equal(await page.locator("#colab-horas").inputValue(), "44");
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "colaboradores-cadastrados",
    );
    assert.equal(
      await page
        .locator('#colab-list [data-field="cargo"]')
        .last()
        .inputValue(),
      "Atendente",
    );
    const name = page.locator('[data-field="nome"]').last();
    await name.fill('Pessoa; "Teste"');
    await name.dispatchEvent("change");
    await irParaEtapa(page, "#j-entrada");
    await page.locator("#j-entrada").fill("07:00");
    await page.locator("#j-entrada").dispatchEvent("change");
    await page.reload();
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    assert.equal(await page.locator("#j-entrada").inputValue(), "07:00");
    assert.equal(
      await page.locator('[data-field="nome"]').last().inputValue(),
      'Pessoa; "Teste"',
    );
    assert.equal((await saved()).colaboradores.length, 3);
    console.log(
      "OK: persistência compatível com a chave e o formato anteriores",
    );
    await irParaEtapa(page, "#btn-gerar");
    await clicarCalculo(page, "#btn-gerar");
    await waitForDialogs(page);
    const horariosAntes = (await saved()).escalaGerada.resultado.map((r) =>
      r.dias.map((d) => [d.data, d.status, d.horas]),
    );
    await irParaEtapa(page, "#turnos-config");
    assert.equal(await page.locator("#turnos-config").isVisible(), false);
    await irParaEtapa(page, "#tg-turnos");
    await page.locator("#tg-turnos").check();
    await irParaEtapa(page, "#turnos-config");
    assert.equal(await page.locator("#turnos-config").isVisible(), true);
    await irParaEtapa(page, "#turnos-resumo");
    assert.match(await page.locator("#turnos-resumo").innerText(), /Turno B/);
    assert.deepEqual(
      (await saved()).escalaGerada.resultado.map((r) =>
        r.dias.map((d) => [d.data, d.status, d.horas]),
      ),
      horariosAntes,
    );
    assert.ok(
      (await saved()).escalaGerada.resultado.some((r) =>
        r.dias.some((d) => d.turno === "B" && d.entradaMin === 840),
      ),
    );
    await irParaEtapa(page, "#entrada-turno-b");
    await page.locator("#entrada-turno-b").fill("15:00");
    await page.locator("#entrada-turno-b").dispatchEvent("change");
    assert.ok(
      (await saved()).escalaGerada.resultado.some((r) =>
        r.dias.some((d) => d.turno === "B" && d.entradaMin === 900),
      ),
    );
    await irParaEtapa(page, "#tg-turnos");
    await page.locator("#tg-turnos").uncheck();
    assert.ok(
      (await saved()).escalaGerada.resultado.every((r) =>
        r.dias.every((d) => d.turno === "A" && d.entradaMin === 420),
      ),
    );
    await irParaEtapa(page, "#tg-turnos");
    await page.locator("#tg-turnos").check();
    await irParaEtapa(page, "#entrada-turno-b");
    await page.locator("#entrada-turno-b").fill("14:00");
    await page.locator("#entrada-turno-b").dispatchEvent("change");
    console.log(
      "OK: toggle aplica turnos imediatamente, mostra grupos e preserva horas/folgas",
    );
    await irParaEtapa(page, "#btn-gerar");
    await clicarCalculo(page, "#btn-gerar");
    await waitForDialogs(page);
    await irParaEtapa(page, "#resultado-gerar");
    assert.match(await page.locator("#resultado-gerar").innerText(), /14:00/);
    await irParaEtapa(page, "#sec-pec");
    assert.equal(await page.locator("#btn-simular-pec").count(), 0);
    assert.equal(await page.locator("#pec-resultado").count(), 0);
    assert.match(await page.locator("#sec-pec").innerText(), /16\/12\/2027/);

    let answers = ["T", "08:30"];
    await respondToDialogs(page, (dialog) => dialog.accept(answers.shift()));
    await irParaEtapa(page, '[data-ri="0"][data-di="0"]');
    await page.locator('[data-ri="0"][data-di="0"]').click();
    await waitForDialogs(page);
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("fintria-escala-dp-v2")).escalaGerada
          .resultado[0].dias[0].horas === 8.5,
    );
    await irParaEtapa(page, "#tg-turnos");
    await page.locator("#tg-turnos").uncheck();
    await irParaEtapa(page, "#tg-turnos");
    await page.locator("#tg-turnos").check();
    assert.equal((await saved()).escalaGerada.resultado[0].dias[0].horas, 8.5);
    const before = (await saved()).escalaGerada.resultado[0].dias[0];
    answers = ["T", "08:99"];
    await irParaEtapa(page, '[data-ri="0"][data-di="0"]');
    await page.locator('[data-ri="0"][data-di="0"]').click();
    await waitForDialogs(page);
    assert.deepEqual((await saved()).escalaGerada.resultado[0].dias[0], before);
    console.log("OK: edição manual e rejeição de horas inválidas");
    const downloadPromise = page.waitForEvent("download");
    await irParaEtapa(page, "#btn-exportar-csv");
    await page.locator("#btn-exportar-csv").click();
    await waitForDialogs(page);
    const download = await downloadPromise;
    assert.equal(
      await readFile(await download.path(), "utf8"),
      gerarCsv(await saved()),
    );
    console.log("OK: download CSV, inclusive nomes com separadores e aspas");
    await irParaEtapa(page, "#regime-jornada");
    await page.locator("#regime-jornada").selectOption("definitivo40");
    assert.equal((await saved()).escalaGerada, null);
    await irParaEtapa(page, "#resultado-gerar");
    assert.match(
      await page.locator("#resultado-gerar").innerText(),
      /Configuração alterada/,
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(failedAssets, []);
    console.log(
      "OK: invalidação da escala e ausência de erros JavaScript/arquivos locais",
    );
    await require("./browser-edicao-manual.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}`,
    });
    await require("./browser-previas.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}/`,
    });
    await require("./browser-ajustes-cobertura.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}/`,
    });
    await require("./browser-restricoes.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}/`,
    });
    await require("./browser-sexo-nomes.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}`,
    });
    await require("./browser-computo-cct.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}`,
    });
    await require("./browser-pendencias.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}`,
    });
    await require("./browser-etapas.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}`,
    });
    await require("./browser-dominio.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}/`,
    });
    await require("./browser-conversao.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}/`,
    });
    await require("./browser-importacao.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}/`,
    });
    await require("./browser-demo-segmentos.cjs")({ browser, baseURL: `http://127.0.0.1:${server.address().port}` });
    await require("./browser-marca-demo.cjs")({ browser, baseURL: `http://127.0.0.1:${server.address().port}` });
    await require("./browser-interface.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}`,
    });
    await require("./browser-ajuda-colaboradores.cjs")({ browser, baseURL: `http://127.0.0.1:${server.address().port}/` });
    await require("./browser-horarios-compensados.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}`,
    });
    await require("./browser-workspace.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}`,
    });
    await require("./browser-calculo-loading.cjs")({ browser, baseURL: `http://127.0.0.1:${server.address().port}` });
    await require("./browser-loading.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}`,
    });
    await require("./browser-dialogs.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}`,
    });
    await require("./browser-tutorial.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}/`,
    });
    await require("./browser-setores.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}/`,
    });
    await require("./browser-ec141.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}/`,
    });
    await require("./browser-fim-semana.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}/`,
    });
    await require("./browser-feriado-folga.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}/`,
    });
    await require("./browser-folgas.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}/`,
    });
    await require("./browser-sabado.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}/`,
    });
    await require("./browser-feriados.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}/`,
    });
    await require("./browser-cobertura.cjs")({
      browser,
      baseURL: `http://127.0.0.1:${server.address().port}/`,
    });
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
