const assert = require("node:assert/strict");
module.exports = async function testarCobertura({ browser, baseURL }) {
  const context = await browser.newContext({ timezoneId: "America/Sao_Paulo" });
  try {
    const page = await context.newPage();
    await page.clock.install({ time: new Date("2026-10-19T12:00:00Z") });
    await page.route("https://**/*", (r) =>
      r.request().url().includes("cdn.tailwindcss.com")
        ? r.fulfill({
            contentType: "application/javascript",
            body: "window.tailwind={};",
          })
        : r.abort(),
    );
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(baseURL);
    await page.waitForFunction(
      () => document.getElementById("cfg-diaInicio").options.length === 31,
    );
    const saved = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("fintria-escala-dp-v2")),
      );
    await page.locator("#cfg-diaInicio").selectOption("31");
    await page.locator('[data-tipo="custom"]').click();
    for (const day of [1, 2, 3, 4, 5])
      await page.locator(`#weekday-picker [data-day="${day}"]`).click();
    for (const [i, funcao] of [
      [0, "Atendente"],
      [1, "Supervisor"],
    ]) {
      const input = page.locator('[data-field="cargo"]').nth(i);
      await input.fill(funcao);
      await input.dispatchEvent("change");
      const horas = page.locator('[data-field="horasSemana"]').nth(i);
      await horas.fill("8");
      await horas.dispatchEvent("change");
    }
    async function cadastrar(funcao, minimo, inicio = "09:00", fim = "18:00") {
      await page.locator("#cobertura-funcao").fill(funcao);
      await page.locator("#cobertura-minimo").fill(String(minimo));
      await page.locator("#cobertura-inicio").fill(inicio);
      await page.locator("#cobertura-fim").fill(fim);
      for (const checkbox of await page.locator("#cobertura-dias input").all())
        await checkbox.setChecked((await checkbox.inputValue()) === "6");
      await page.locator("#cobertura-salvar").click();
    }
    await cadastrar("Atendente", 2);
    assert.equal((await saved()).demandasCobertura.length, 1);
    await page.locator("#btn-gerar").click();
    let r = (await saved()).escalaGerada.coberturaOperacional;
    assert.ok(
      r.lacunas.some(
        (f) =>
          f.inicioMin === 720 &&
          f.fimMin === 780 &&
          f.presentes === 0 &&
          f.faltantes === 2,
      ),
    );
    await page.locator('[data-cobertura-editar="1"]').click();
    await page.locator("#cobertura-minimo").fill("1");
    await page.locator("#cobertura-salvar").click();
    assert.equal((await saved()).escalaGerada, null);
    await page.locator("#btn-gerar").click();
    r = (await saved()).escalaGerada.coberturaOperacional;
    assert.deepEqual(
      r.lacunas.map((f) => [f.inicioMin, f.fimMin, f.faltantes]),
      [
        [720, 780, 1],
        [1020, 1080, 1],
      ],
    );
    assert.equal(await page.locator("[data-cobertura-lacuna]").count(), 2);
    await cadastrar("Supervisor", 1, "09:00", "12:00");
    await page.reload();
    assert.equal((await saved()).demandasCobertura.length, 2);
    assert.deepEqual(
      await page
        .locator("#cobertura-dias input:checked")
        .evaluateAll((inputs) => inputs.map((input) => input.value)),
      ["6"],
    );
    assert.equal(await page.locator("[data-cobertura-editar]").count(), 2);
    await page.locator("#btn-gerar").click();
    assert.ok(
      (await saved()).escalaGerada.coberturaOperacional.lacunas.every(
        (f) => f.funcao === "Atendente",
      ),
    );
    console.log(
      "OK: cadastro/edição/persistência e lacunas por função, incluindo almoço e saída",
    );
    const di = (await saved()).escalaGerada.resultado[0].dias.findIndex(
      (d) => d.data === "2026-10-31",
    );
    page.on("dialog", (d) => d.accept("F"));
    await page.locator(`[data-ri="0"][data-di="${di}"]`).click();
    r = (await saved()).escalaGerada.coberturaOperacional;
    assert.deepEqual(
      r.lacunas.map((f) => [f.inicioMin, f.fimMin, f.faltantes]),
      [[540, 1080, 1]],
    );
    assert.match(
      await page.locator("#relatorio-cobertura").innerText(),
      /09:00–18:00/,
    );
    console.log(
      "OK: alteração de folga recalcula o relatório de cobertura imediatamente",
    );
    await page.locator("#cobertura-funcao").fill("Atendente");
    for (const cb of await page.locator("#cobertura-dias input").all())
      await cb.uncheck();
    await page.locator("#cobertura-salvar").click();
    assert.match(
      await page.locator("#cobertura-mensagem").innerText(),
      /Selecione/,
    );
    assert.equal((await saved()).demandasCobertura.length, 2);
    for (const id of [1, 2])
      await page.locator(`[data-cobertura-remover="${id}"]`).click();
    assert.equal((await saved()).demandasCobertura.length, 0);
    await page.locator("#btn-gerar").click();
    assert.match(
      await page.locator("#relatorio-cobertura").innerText(),
      /ainda não avaliada/,
    );
    assert.deepEqual(errors, []);
    console.log(
      "OK: validação de dias, remoção de demandas e estado sem cobertura configurada",
    );
  } finally {
    await context.close();
  }
};
