const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");

module.exports = async function testarImportacao({ browser, baseURL }) {
  const context = await browser.newContext({ timezoneId: "America/Sao_Paulo" });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install({ time: new Date("2026-10-21T12:00:00Z") });
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
      () => document.getElementById("cfg-mes").options.length === 12,
    );
    await page.locator("#btn-gerar").click();
    const saved = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("fintria-escala-dp-v2")),
      );
    const original = await saved();
    await page.locator("#importacao-colaboradores summary").click();
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#btn-modelo-colaboradores").click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), "modelo-colaboradores.csv");
    const template = await readFile(await download.path(), "utf8");
    assert.ok(
      template.startsWith("\uFEFFNome;Sexo;Cargo / função;Horas semanais\r\n"),
    );
    const upload = (body, name = "equipe.csv") =>
      page
        .locator("#importacao-arquivo")
        .setInputFiles({
          name,
          mimeType: "text/csv",
          buffer: Buffer.from(body),
        });
    const header = "Nome;Sexo;Cargo / função;Horas semanais\r\n";
    await upload(header + "Pessoa inválida;F;Caixa;erro");
    await page.waitForFunction(() =>
      document
        .getElementById("importacao-erros")
        .textContent.includes("Linha 2"),
    );
    assert.equal(
      await page.locator("#importacao-confirmar").isDisabled(),
      true,
    );
    assert.deepEqual(await saved(), original);
    await upload(header + "Pessoa;F;Caixa;40", "equipe.xlsx");
    assert.match(
      await page.locator("#importacao-mensagem").innerText(),
      /arquivo .csv/,
    );
    await page
      .locator("#importacao-arquivo")
      .setInputFiles({
        name: "grande.csv",
        mimeType: "text/csv",
        buffer: Buffer.alloc(1024 * 1024 + 1),
      });
    assert.match(
      await page.locator("#importacao-mensagem").innerText(),
      /1 MB/,
    );
    const valid =
      header +
      'Pessoa <img src=x onerror=alert(1)>;F;Suporte;40\r\nPessoa 2;M;Supervisor;"36,5"\r\n';
    await upload(valid);
    await page.waitForFunction(
      () => !document.getElementById("importacao-confirmar").disabled,
    );
    assert.equal(await page.locator("#importacao-linhas tr").count(), 2);
    assert.equal(await page.locator("#importacao-linhas img").count(), 0);
    assert.match(
      await page.locator("#importacao-resumo").innerText(),
      /4 pessoa/,
    );
    assert.deepEqual(await saved(), original);
    await page.locator("#importacao-cancelar").click();
    assert.deepEqual(await saved(), original);
    assert.equal(await page.locator("#importacao-previa").isVisible(), false);
    await upload(valid);
    await page.waitForFunction(
      () => !document.getElementById("importacao-confirmar").disabled,
    );
    await page.locator("#importacao-confirmar").click();
    const added = await saved();
    assert.equal(added.colaboradores.length, 4);
    assert.deepEqual(added.colaboradores.slice(0, 2), original.colaboradores);
    assert.equal(added.escalaGerada, null);
    assert.equal(new Set(added.colaboradores.map((c) => c.id)).size, 4);
    assert.equal(added.colaboradores[3].horasSemana, 36.5);
    assert.equal(await page.locator("#colab-list img").count(), 0);
    assert.ok(
      (
        await page.locator("#cobertura-funcao option").allTextContents()
      ).includes("Suporte"),
    );
    assert.equal(
      await page.locator("#importacao-confirmar").isDisabled(),
      true,
    );
    await page.reload();
    assert.equal((await saved()).colaboradores.length, 4);
    await page.locator("#importacao-colaboradores summary").click();
    await upload(header + "Pessoa final;M;Atendente;40");
    await page.waitForFunction(
      () => !document.getElementById("importacao-confirmar").disabled,
    );
    await page.locator("#importacao-modo").selectOption("substituir");
    assert.match(
      await page.locator("#importacao-resumo").innerText(),
      /atuais serão removidos/,
    );
    assert.equal((await saved()).colaboradores.length, 4);
    await page.locator("#importacao-confirmar").click();
    const replaced = await saved();
    assert.equal(replaced.colaboradores.length, 1);
    assert.equal(replaced.colaboradores[0].nome, "Pessoa final");
    assert.ok(replaced.colaboradores[0].id >= added.proximoId);
    assert.deepEqual(replaced.jornada, original.jornada);
    assert.deepEqual(replaced.demandasCobertura, original.demandasCobertura);
    await page.locator("#btn-gerar").click();
    assert.equal((await saved()).escalaGerada.resultado.length, 1);
    assert.equal(
      (await saved()).escalaGerada.resultado[0].colaborador.nome,
      "Pessoa final",
    );
    await page.reload();
    assert.equal(
      await page.locator("#importacao-confirmar").isDisabled(),
      true,
    );
    assert.equal((await saved()).colaboradores[0].nome, "Pessoa final");
    assert.deepEqual(errors, []);
    console.log(
      "OK: modelo CSV, erros por linha, extensão/tamanho, prévia segura, cancelamento, adição, substituição, funções, persistência e geração com os importados",
    );
  } finally {
    await context.close();
  }
};
