const assert = require("node:assert/strict");
const path = require("node:path");
const { readFile } = require("node:fs/promises");
module.exports = async function testarDominio({ browser, baseURL }) {
  const context = await browser.newContext({ timezoneId: "America/Sao_Paulo" });
  try {
    const page = await context.newPage(),
      errors = [],
      assets = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (r) => {
      if (r.url().includes("/assets/vendor/")) assets.push(r.status());
    });
    await page.clock.install({ time: new Date("2026-10-22T12:00:00Z") });
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
      () => document.getElementById("cfg-mes").options.length === 12,
    );
    const saved = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("fintria-escala-dp-v2")),
      );
    const upload = async (tipo) => {
      await page.locator("#importacao-dominio").evaluate((el) => {
        el.open = true;
      });
      await page
        .locator("#dominio-arquivo")
        .setInputFiles(path.join(__dirname, "fixtures/dominio", tipo + ".xls"));
    };
    const ready = () =>
      page.waitForFunction(
        () => !document.getElementById("dominio-confirmar").disabled,
      );
    const original = await saved();
    assert.equal(
      await page.locator("#importacao-dominio").getAttribute("open"),
      null,
    );
    await page.locator("#importacao-dominio > summary").click();
    await upload("drogaria");
    await ready();
    assert.equal(await page.locator("#dominio-linhas tr").count(), 6);
    assert.match(
      await page.locator("#dominio-empresa").innerText(),
      /EMPRESA EXEMPLO DROGARIA/,
    );
    assert.match(await page.locator("#dominio-linhas").innerText(), /00012345/);
    assert.deepEqual(await saved(), original);
    await page.locator("#dominio-cancelar").click();
    assert.deepEqual(await saved(), original);
    await page.locator("#dominio-arquivo").setInputFiles({
      name: "arquivo.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("qualquer coisa"),
    });
    assert.match(await page.locator("#dominio-mensagem").innerText(), /\.xls/);
    await upload("drogaria");
    await ready();
    await page.locator("#dominio-confirmar").click();
    assert.equal(
      await page.locator("#importacao-dominio").getAttribute("open"),
      null,
    );
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "colaboradores-cadastrados",
    );
    assert.match(
      await page.locator("#colaboradores-mensagem").innerText(),
      /Quadro importado/,
    );
    let s = await saved();
    assert.equal(s.colaboradores.length, 6);
    assert.equal(s.escalaGerada, null);
    assert.equal(s.tipoEscala, "6x1");
    assert.deepEqual(
      s.colaboradores.map((c) => c.horasSemana),
      [54, 44, 44, 44, 54, 54],
    );
    assert.ok(s.colaboradores.every((c) => c.sexo === "nao_informado"));
    await page.locator("#cadastro-manual-colaboradores > summary").click();
    assert.equal(
      await page
        .locator('#colab-list [data-field="sexo"]')
        .first()
        .inputValue(),
      "nao_informado",
    );
    const primeiroId = s.colaboradores[0].id;
    await page
      .locator(`[data-perfil-dominio="${primeiroId}"] > summary`)
      .click();
    await page
      .locator('#colab-list [data-field="sexo"]')
      .first()
      .selectOption("masculino");
    await page
      .locator('#colab-list [data-field="horasSemana"]')
      .first()
      .fill("44");
    await page
      .locator('#colab-list [data-field="horasSemana"]')
      .first()
      .dispatchEvent("change");
    assert.equal(
      (await saved()).colaboradores[0].quadroDominio.cargaConfirmada,
      true,
    );
    await page.locator("#btn-gerar").click();
    s = await saved();
    assert.equal(s.escalaGerada.resultado.length, 6);
    const dia = (r, data) => r.dias.find((d) => d.data === data);
    assert.equal(dia(s.escalaGerada.resultado[0], "2026-10-19").horas, 10);
    assert.equal(dia(s.escalaGerada.resultado[0], "2026-10-24").saidaMin, 720);
    assert.equal(
      dia(s.escalaGerada.resultado[1], "2026-10-24").entradaMin,
      720,
    );
    assert.equal(dia(s.escalaGerada.resultado[1], "2026-10-24").saidaMin, 960);
    const dp = page.waitForEvent("download");
    await page.locator("#btn-exportar-csv").click();
    const download = await dp;
    assert.match(
      await readFile(await download.path(), "utf8"),
      /001;2020-01-01;00012345;0001/,
    );
    await page.reload();
    s = await saved();
    assert.equal(s.colaboradores.length, 6);
    assert.equal(s.colaboradores[0].quadroDominio.ctps, "00012345");
    assert.equal(dia(s.escalaGerada.resultado[0], "2026-10-19").horas, 10);
    await page.locator("#importacao-dominio > summary").click();
    await upload("comercio");
    await ready();
    assert.match(
      await page.locator("#dominio-resumo").innerText(),
      /mudando de empresa/,
    );
    await page.locator("#dominio-ausentes-folga").check();
    assert.match(
      await page.locator("#dominio-linhas tr").first().innerText(),
      /44h/,
    );
    await page.locator("#dominio-confirmar").click();
    s = await saved();
    assert.equal(s.colaboradores.length, 7);
    assert.equal(s.colaboradores[0].horasSemana, 44);
    assert.equal(s.colaboradores[1].horasSemana, null);
    await page.locator("#btn-gerar").click();
    assert.match(
      await page.locator("#resultado-gerar").innerText(),
      /revise os dias/,
    );
    assert.equal((await saved()).escalaGerada, null);
    await page.locator("#cadastro-manual-colaboradores > summary").click();
    assert.equal(
      await page
        .locator('#colab-list [data-field="horasSemana"]')
        .nth(1)
        .inputValue(),
      "",
    );
    await upload("misto");
    await ready();
    assert.equal(
      await page.locator("#dominio-ausentes-folga").isChecked(),
      false,
    );
    await page.locator("#dominio-ausentes-folga").check();
    await page.locator("#dominio-confirmar").click();
    s = await saved();
    assert.equal(s.colaboradores.length, 17);
    assert.equal(s.tipoEscala, "custom");
    await page.locator("#btn-gerar").click();
    assert.match(
      await page.locator("#resultado-gerar").innerText(),
      /1º dia do ciclo/,
    );
    for (const c of s.colaboradores.filter(
      (c) => c.quadroDominio.tipo === "ciclo",
    )) {
      const details = page.locator(`[data-perfil-dominio="${c.id}"]`);
      await details.locator("> summary").click();
      const input = details.locator('[data-dominio="ancora"]');
      await input.fill(
        c.quadroDominio.codigo === "013" ? "2026-10-02" : "2026-10-01",
      );
      await input.dispatchEvent("change");
      assert.equal((await details.getAttribute("open")) !== null, true);
    }
    const joana = s.colaboradores.find((c) => c.quadroDominio.codigo === "007");
    const details = page.locator(`[data-perfil-dominio="${joana.id}"]`);
    await details.locator("> summary").click();
    for (const d of ["2", "4"]) {
      for (const [field, value] of [
        ["intInicio", "16:00"],
        ["intFim", "16:30"],
      ]) {
        const input = details.locator(
          `[data-dia="${d}"][data-horario="${field}"]`,
        );
        await input.fill(value);
        await input.dispatchEvent("change");
      }
      await details
        .locator(`[data-dia="${d}"][data-dominio="status"]`)
        .selectOption("trabalho");
    }
    s = await saved();
    assert.equal(
      s.colaboradores.find((c) => c.id === joana.id).horasSemana,
      19,
    );
    assert.ok(
      s.colaboradores
        .find((c) => c.id === joana.id)
        .quadroDominio.linhasOriginais.some(
          (l) => l.intervalo === "11:00 as 12:30",
        ),
    );
    await page.locator("#btn-gerar").click();
    s = await saved();
    assert.equal(s.escalaGerada.resultado.length, 17);
    assert.equal(dia(s.escalaGerada.resultado[0], "2026-10-01").status, "T");
    assert.equal(dia(s.escalaGerada.resultado[12], "2026-10-01").status, "F");
    assert.equal(dia(s.escalaGerada.resultado[0], "2026-10-01").saidaMin, 1800);
    assert.equal(dia(s.escalaGerada.resultado[7], "2026-10-01").horas, 11);
    await page.reload();
    assert.equal((await saved()).escalaGerada.resultado.length, 17);
    assert.ok(assets.length && assets.every((s) => s === 200));
    assert.deepEqual(errors, []);
    console.log(
      "OK: importação Domínio dos três layouts, prévia/cancelamento, dados individuais, revisão de pendências, ciclos com âncoras próprias, CSV e persistência",
    );
  } finally {
    await context.close();
  }
};
