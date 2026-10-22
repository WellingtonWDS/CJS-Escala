const { irParaEtapa } = require("./helpers/etapas.cjs");
const assert = require("node:assert/strict");
module.exports = async function testarEc141({ browser, baseURL }) {
  const context = await browser.newContext({ timezoneId: "America/Sao_Paulo" });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install({ time: new Date("2026-10-21T12:00:00Z") });
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
    assert.equal(await page.locator("[data-ec141]").count(), 0);
    await irParaEtapa(page, "#btn-gerar");
    await page.locator("#btn-gerar").click();
    assert.ok(
      !(await saved()).escalaGerada.validacoes.some((v) =>
        v.issues.some((i) =>
          ["PROTECAO_SALARIAL", "PROTECAO_PISO"].includes(i.tipo),
        ),
      ),
    );
    // Reativa somente nesta fixture a análise avançada preservada no código.
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("fintria-escala-dp-v2"));
      s.analiseEnquadramentoAtiva = true;
      s.escalaGerada = null;
      localStorage.setItem("fintria-escala-dp-v2", JSON.stringify(s));
    });
    await page.reload();
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    assert.equal(
      await page.locator("#regime-jornada").inputValue(),
      "automatico",
    );
    await irParaEtapa(page, "#cfg-ano");
    await page.locator("#cfg-ano").selectOption("2028");
    await irParaEtapa(page, "#cfg-mes");
    await page.locator("#cfg-mes").selectOption("1");
    await irParaEtapa(page, "#regime-alerta");
    assert.match(
      await page.locator("#regime-alerta").innerText(),
      /Vigência automática/,
    );
    await irParaEtapa(page, "#btn-gerar");
    await page.locator("#btn-gerar").click();
    let state = await saved();
    for (const r of state.escalaGerada.resultado) {
      const semana = r.dias.filter(
        (d) => d.data >= "2028-02-07" && d.data <= "2028-02-13",
      );
      assert.equal(
        semana.reduce((s, d) => s + d.horas, 0),
        40,
      );
      assert.equal(semana.filter((d) => d.status === "F").length, 2);
      assert.equal(r.colaborador.horasSemana, 44);
    }
    await irParaEtapa(page, "#resultado-gerar");
    assert.match(
      await page.locator("#resultado-gerar").innerText(),
      /PENDENTE/,
    );
    await irParaEtapa(page, "#cadastro-manual-colaboradores > summary");
    await page.locator("#cadastro-manual-colaboradores > summary").click();
    const details = page.locator("#colab-list details").first();
    await details.locator("summary").click();
    for (const [field, value] of Object.entries({
      salarioAnterior: "3000",
      salarioAtual: "3000",
      pisoAnterior: "0",
      pisoAtual: "0",
    })) {
      const input = details.locator(`[data-ec141="${field}"]`);
      await input.fill(value);
      await input.dispatchEvent("change");
    }
    await irParaEtapa(page, "#btn-gerar");
    await page.locator("#btn-gerar").click();
    state = await saved();
    assert.ok(
      !state.escalaGerada.validacoes[0].issues.some((i) =>
        ["PROTECAO_SALARIAL", "PROTECAO_PISO"].includes(i.tipo),
      ),
    );
    await irParaEtapa(page, "#colab-list");
    await details.locator('[data-ec141="salarioAtual"]').fill("2900");
    await details
      .locator('[data-ec141="salarioAtual"]')
      .dispatchEvent("change");
    await irParaEtapa(page, "#btn-gerar");
    await page.locator("#btn-gerar").click();
    state = await saved();
    assert.ok(
      state.escalaGerada.validacoes[0].issues.some(
        (i) => i.tipo === "REDUCAO_SALARIAL" && i.severidade === "erro",
      ),
    );
    const downloadPromise = page.waitForEvent("download");
    await irParaEtapa(page, "#btn-exportar-csv");
    await page.locator("#btn-exportar-csv").click();
    const download = await downloadPromise;
    const { readFile } = require("node:fs/promises");
    const csv = await readFile(await download.path(), "utf8");
    assert.match(csv, /RASCUNHO — INCOMPATIBILIDADES/);
    assert.match(csv, /REDUCAO_SALARIAL/);
    assert.match(csv, /Fase na data/);
    await irParaEtapa(page, "#regime-jornada");
    await page.locator("#regime-jornada").selectOption("atual44");
    await irParaEtapa(page, "#regime-alerta");
    assert.match(await page.locator("#regime-alerta").innerText(), /SIMULAÇÃO/);
    await irParaEtapa(page, "#btn-gerar");
    await page.locator("#btn-gerar").click();
    state = await saved();
    assert.equal(state.modoRegime, "simulacao");
    assert.ok(
      state.escalaGerada.validacoes[0].issues.some(
        (i) => i.tipo === "SIMULACAO",
      ),
    );
    await irParaEtapa(page, "#regime-jornada");
    await page.locator("#regime-jornada").selectOption("automatico");
    await irParaEtapa(page, "#cfg-ano");
    await page.locator("#cfg-ano").selectOption("2027");
    await irParaEtapa(page, "#cfg-mes");
    await page.locator("#cfg-mes").selectOption("11");
    await irParaEtapa(page, "#btn-gerar");
    await page.locator("#btn-gerar").click();
    state = await saved();
    assert.ok(
      state.escalaGerada.resultado[0].dias.some(
        (d) => d.data === "2027-12-15" && d.regimeAplicado === "transicao42",
      ),
    );
    assert.ok(
      state.escalaGerada.resultado[0].dias.some(
        (d) => d.data === "2027-12-16" && d.regimeAplicado === "definitivo40",
      ),
    );
    assert.ok(
      state.escalaGerada.validacoes[0].issues.some(
        (i) => i.tipo === "SEMANA_TRANSICAO",
      ),
    );
    await irParaEtapa(page, "#instrumento-detalhes summary");
    await page.locator("#instrumento-detalhes summary").click();
    await irParaEtapa(page, "#instrumento-compensacao");
    await page.locator("#instrumento-compensacao").selectOption("act_cct");
    await irParaEtapa(page, "#act-identificacao");
    await page.locator("#act-identificacao").fill("ACT teste");
    await page.locator("#act-identificacao").dispatchEvent("change");
    await irParaEtapa(page, "#act-inicio");
    await page.locator("#act-inicio").fill("2027-01-01");
    await page.locator("#act-inicio").dispatchEvent("change");
    await irParaEtapa(page, "#act-fim");
    await page.locator("#act-fim").fill("2027-11-30");
    await page.locator("#act-fim").dispatchEvent("change");
    await irParaEtapa(page, "#act-compativel");
    await page.locator("#act-compativel").check();
    await irParaEtapa(page, "#act-diaria");
    await page.locator("#act-diaria").check();
    await irParaEtapa(page, "#btn-gerar");
    await page.locator("#btn-gerar").click();
    assert.ok(
      (await saved()).escalaGerada.validacoes[0].issues.some(
        (i) => i.tipo === "INSTRUMENTO_FORA_VIGENCIA",
      ),
    );
    await irParaEtapa(page, "#act-horas");
    await page.locator("#act-horas").check();
    for (const [id, value] of [
      ["act-apuracao-inicio", "2027-12-01"],
      ["act-apuracao-fim", "2027-12-31"],
      ["act-pico", "44"],
    ]) {
      await irParaEtapa(page, `#${id}`);
      await page.locator(`#${id}`).fill(value);
      await page.locator(`#${id}`).dispatchEvent("change");
    }
    assert.equal(
      (await saved()).instrumentoColetivo.apuracaoInicio,
      "2027-12-01",
    );
    // Enquadramento individual é persistido e recalcula sem afetar os demais.
    await irParaEtapa(page, "#colab-list");
    await details.locator('[data-ec141="tipo"]').selectOption("art8");
    const art8 = page.locator("#colab-list details").first();
    if ((await art8.getAttribute("open")) === null)
      await art8.locator("summary").click();
    await art8.locator('[data-ec141="diplomaSuperior"]').check();
    for (const [field, value] of Object.entries({
      remuneracao: "25000",
      tetoRgps: "10000",
    })) {
      await art8.locator(`[data-ec141="${field}"]`).fill(value);
      await art8.locator(`[data-ec141="${field}"]`).dispatchEvent("change");
    }
    await irParaEtapa(page, "#btn-gerar");
    await page.locator("#btn-gerar").click();
    assert.ok(
      (await saved()).escalaGerada.validacoes[0].issues.some(
        (i) => i.tipo === "ART8_ENQUADRAMENTO",
      ),
    );
    await irParaEtapa(page, "#colab-list");
    await art8.locator('[data-ec141="tipo"]').selectOption("contrato_publico");
    const publico = page.locator("#colab-list details").first();
    await publico.locator("summary").click();
    await publico.locator('[data-ec141="contratoVigente"]').check();
    await publico.locator('[data-ec141="maoDeObraDireta"]').check();
    await publico.locator('[data-ec141="dataAditamento"]').fill("2027-06-01");
    await publico
      .locator('[data-ec141="dataAditamento"]')
      .dispatchEvent("change");
    await irParaEtapa(page, "#btn-gerar");
    await page.locator("#btn-gerar").click();
    assert.ok(
      (await saved()).escalaGerada.validacoes[0].issues.some(
        (i) => i.tipo === "ART9_ENQUADRAMENTO",
      ),
    );
    await page.reload();
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    // A abertura continua no mês atual; dados de enquadramento e instrumento são preservados.
    assert.equal((await saved()).colaboradores[0].ec141.diplomaSuperior, true);
    assert.equal(
      (await saved()).instrumentoColetivo.identificacao,
      "ACT teste",
    );
    assert.deepEqual(errors, []);
    console.log(
      "OK: EC141 automática, contratos preservados, simulação, marcos de dezembro, salário, art8, ACT vencido e CSV com pendências",
    );
  } finally {
    await context.close();
  }
};
