const assert = require("node:assert/strict");
const { irParaEtapa } = require("./helpers/etapas.cjs");
module.exports = async function ({ browser, baseURL }) {
  const context = await browser.newContext({ timezoneId: "America/Sao_Paulo" });
  try {
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install({ time: new Date("2026-10-23T12:00:00Z") });
    await page.route("https://**/*", (route) =>
      route.request().url().includes("cdn.tailwindcss.com")
        ? route.fulfill({
            contentType: "application/javascript",
            body: "window.tailwind={};",
          })
        : route.abort(),
    );
    await page.goto(baseURL);
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    await page.evaluate(() => {
      const key = "fintria-escala-dp-v2",
        s = JSON.parse(localStorage.getItem(key));
      Object.assign(s, {
        ano: 2026,
        mes: 9,
        tipoEscala: "5x2",
        diasTrabalho: [1, 2, 3, 4, 5],
        modoRegime: "simulacao",
        regimeJornada: "definitivo40",
        jornada: {
          entrada: "08:00",
          intInicio: "12:00",
          intFim: "13:00",
          saida: "17:00",
        },
        feriados: [],
        feriadosExcluidos: ["2026-10-12"],
        escalaGerada: null,
      });
      s.colaboradores = [
        {
          id: 1,
          nome: "Pessoa Exemplo",
          sexo: "masculino",
          cargo: "Atendente",
          horasSemana: 40,
        },
      ];
      localStorage.setItem(key, JSON.stringify(s));
    });
    await page.reload();
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    await irParaEtapa(page, "#colab-list");
    const bloco = page.locator('[data-restricoes="1"]');
    assert.equal(await bloco.getAttribute("open"), null);
    await bloco.locator("summary").click();
    let form = bloco.locator('[data-restricao-form="periodo"]');
    await form.locator("[name=tipo]").selectOption("ferias");
    await form.locator("[name=inicio]").fill("2026-10-06");
    await form.locator("[name=fim]").fill("2026-10-08");
    await form.locator("button").click();
    assert.match(
      await bloco.locator("[data-restricoes-periodos]").textContent(),
      /Férias.*06\/10\/2026.*08\/10\/2026/,
    );
    assert.ok(await bloco.evaluate((el) => el.open));
    // Invalid and overlapping periods cannot replace or erase previously saved conditions.
    await form.locator("[name=tipo]").selectOption("afastamento");
    await form.locator("[name=inicio]").fill("2026-10-08");
    await form.locator("[name=fim]").fill("2026-10-09");
    await form.locator("button").click();
    assert.match(
      await bloco.locator("[data-restricoes-mensagem]").textContent(),
      /sobrepostas/,
    );
    const salvo = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("fintria-escala-dp-v2")),
      );
    assert.equal(
      (await salvo()).colaboradores[0].restricoes.periodos.length,
      1,
    );
    let hf = bloco.locator('[data-restricao-form="horario"]');
    await hf.locator("[name=dia]").selectOption("1");
    await hf.locator("[name=entrada]").fill("10:00");
    await hf.locator("[name=saida]").fill("16:00");
    await hf.locator("button").click();
    // Updating the same weekday replaces the prior window.
    await hf.locator("[name=dia]").selectOption("1");
    await hf.locator("[name=entrada]").fill("10:00");
    await hf.locator("[name=saida]").fill("17:00");
    await hf.locator("button").click();
    assert.equal(
      (await salvo()).colaboradores[0].restricoes.horariosPermitidos.length,
      1,
    );
    await bloco
      .locator('[data-restricao-dias="folgasObrigatorias"][value="0"]')
      .check();
    await page.reload();
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    await irParaEtapa(page, "#colab-list");
    await bloco.locator("summary").click();
    assert.ok(
      await bloco
        .locator('[data-restricao-dias="folgasObrigatorias"][value="0"]')
        .isChecked(),
    );
    assert.match(
      await bloco.locator("[data-restricoes-horarios]").textContent(),
      /10:00–17:00/,
    );
    await irParaEtapa(page, "#btn-gerar");
    await page.locator("#btn-gerar").click();
    let s = await salvo();
    const dias = s.escalaGerada.resultado[0].dias;
    const index = dias.findIndex((d) => d.data === "2026-10-06");
    assert.equal(dias[index].status, "VA");
    assert.equal(dias.find((d) => d.data === "2026-10-05").entradaMin, 600);
    assert.match(
      await page
        .locator('[data-resumo-semanal][data-semana="2026-10-05"]')
        .textContent(),
      /Férias.*24:00 previstas retiradas/,
    );
    // An absence cannot be overwritten through the calendar editor.
    let alerts = [],
      respostas = [];
    page.on("dialog", async (d) => {
      alerts.push(d.message());
      if (d.type() === "prompt" && respostas.length)
        await d.accept(respostas.shift());
      else await d.dismiss();
    });
    await page
      .locator(`#resultado-gerar [data-ri="0"][data-di="${index}"]`)
      .click();
    assert.ok(alerts.some((m) => m.includes("restrição no cadastro")));
    assert.equal(
      (await salvo()).escalaGerada.resultado[0].dias[index].status,
      "VA",
    );
    respostas = ["T", "08:00"];
    const segunda = dias.findIndex((d) => d.data === "2026-10-05");
    await page
      .locator(`#resultado-gerar [data-ri="0"][data-di="${segunda}"]`)
      .click();
    assert.ok(alerts.some((m) => m.includes("janela permitida")));
    assert.equal(
      (await salvo()).escalaGerada.resultado[0].dias[segunda].horas,
      6,
    );
    // Export retains the restriction description and the absence status.
    await page.evaluate(
      () =>
        (window.__csvPromise = import("/assets/js/export/csv.js").then(
          ({ gerarCsv }) =>
            gerarCsv(JSON.parse(localStorage.getItem("fintria-escala-dp-v2"))),
        )),
    );
    assert.match(
      await page.evaluate(() => window.__csvPromise),
      /Restrição individual/,
    );
    await irParaEtapa(page, "#colab-list");
    if (!(await bloco.evaluate((el) => el.open)))
      await bloco.locator("summary").click();
    await bloco.locator('[data-restricao-remover="periodos"]').click();
    assert.equal((await salvo()).escalaGerada, null);
    assert.equal(
      (await salvo()).colaboradores[0].restricoes.periodos.length,
      0,
    );
    await bloco
      .locator('[data-restricao-dias="diasIndisponiveis"][value="2"]')
      .check();
    assert.deepEqual(
      (await salvo()).colaboradores[0].restricoes.diasIndisponiveis,
      [2],
    );
    await bloco
      .locator('[data-restricao-remover="horariosPermitidos"]')
      .click();
    assert.equal(
      (await salvo()).colaboradores[0].restricoes.horariosPermitidos.length,
      0,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await bloco.locator("summary").isVisible());
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    console.log(
      "OK: restrições por colaborador, formulários, validação, atualização/remoção, persistência, ausência no resumo, proteção de edição, CSV e cadastro móvel",
    );
  } finally {
    await context.close();
  }
};
