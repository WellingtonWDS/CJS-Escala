const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { irParaEtapa } = require("./helpers/etapas.cjs");
module.exports = async function testarSexoNomes({ browser, baseURL }) {
  const context = await browser.newContext({ timezoneId: "America/Sao_Paulo" });
  try {
    const page = await context.newPage(),
      errors = [],
      externas = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install({ time: new Date("2026-10-22T12:00:00Z") });
    await page.route("https://**/*", (r) => {
      externas.push(r.request().url());
      return r.request().url().includes("cdn.tailwindcss.com")
        ? r.fulfill({
            contentType: "application/javascript",
            body: "window.tailwind={};",
          })
        : r.abort();
    });
    const X = await import("@e965/xlsx");
    const { lerArquivoDominio } = await import(
      "../assets/js/import/arquivo-dominio.js"
    );
    const abas = await lerArquivoDominio(
      await fs.readFile(path.join(__dirname, "fixtures/dominio/drogaria.xls")),
      X,
    );
    let i = 0;
    const nomes = [
      "Maria Silva",
      "Lucas Silva",
      "Tiago Silva",
      "Thamires Silva",
      "Hellen Silva",
      "Adair Silva",
    ];
    for (const aba of abas)
      for (const row of aba.linhas)
        for (let col = 0; col < row.length; col++)
          if (/^colaborador drogaria \d+$/i.test(String(row[col])))
            row[col] = nomes[i++];
    assert.equal(i, 6);
    const wb = X.utils.book_new();
    for (const aba of abas)
      X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(aba.linhas), aba.nome);
    const buffer = Buffer.from(
      X.write(wb, { type: "buffer", bookType: "xlsx" }),
    );
    await page.goto(baseURL);
    await page.waitForFunction(
      () => document.getElementById("cfg-mes").options.length === 12,
    );
    const saved = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("fintria-escala-dp-v2")),
      );
    const original = await saved();
    await page.locator("#importacao-dominio > summary").click();
    await page.locator("#dominio-arquivo").setInputFiles({
      name: "quadro-ficticio.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer,
    });
    await page.waitForFunction(
      () => !document.getElementById("dominio-confirmar").disabled,
    );
    assert.match(
      await page.locator("#dominio-linhas tr").first().innerText(),
      /feminino — 99,51%/,
    );
    assert.match(
      await page.locator("#dominio-linhas tr").nth(5).innerText(),
      /Não informado/,
    );
    assert.match(
      await page.locator("#dominio-resumo").innerText(),
      /5 campo\(s\) de sexo/,
    );
    for (const [index, nome, sexo] of [
      [1, "Lucas", "masculino"],
      [2, "Tiago", "masculino"],
      [3, "Thamires", "feminino"],
      [4, "Hellen", "feminino"],
    ]) {
      const linha = await page
        .locator("#dominio-linhas tr")
        .nth(index)
        .innerText();
      assert.ok(linha.includes(nome));
      assert.ok(linha.includes(sexo));
    }
    assert.deepEqual(await saved(), original);
    await page.locator("#dominio-confirmar").click();
    let s = await saved();
    assert.deepEqual(
      s.colaboradores.map((c) => c.sexo),
      [
        "feminino",
        "masculino",
        "masculino",
        "feminino",
        "feminino",
        "nao_informado",
      ],
    );
    assert.equal(s.colaboradores.filter((c) => c.sexoInferencia).length, 5);
    const campo = (n) =>
      page.locator(`#colab-list [data-field="${n}"]`).first();
    assert.match(
      await page.locator("[data-sexo-estimativa]").first().innerText(),
      /99,51%/,
    );
    await campo("sexo").selectOption("masculino");
    assert.equal((await saved()).colaboradores[0].sexoOrigem, "usuario");
    assert.equal(
      await page.locator("[data-sexo-estimativa]").first().innerText(),
      "",
    );
    await campo("nome").fill("Ana Silva");
    await campo("nome").dispatchEvent("change");
    assert.equal((await saved()).colaboradores[0].sexo, "masculino");
    await page.reload();
    assert.equal((await saved()).colaboradores[0].sexo, "masculino");
    // Cadastros antigos são preenchidos pelo botão; escolhas manuais ficam preservadas.
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("fintria-escala-dp-v2"));
      s.colaboradores[2].nome = "Maria Souza";
      localStorage.setItem("fintria-escala-dp-v2", JSON.stringify(s));
    });
    await page.reload();
    await page.locator("#btn-sugerir-sexos").click();
    assert.equal((await saved()).colaboradores[2].sexo, "feminino");
    assert.equal((await saved()).colaboradores[0].sexo, "masculino");
    assert.match(
      await page.locator("#colaboradores-mensagem").innerText(),
      /1 campo/,
    );
    // Uma estimativa da base anterior precisa ser atualizada e salva mesmo se o sexo não mudar.
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("fintria-escala-dp-v2"));
      s.colaboradores[3].sexoInferencia.fonte = "IBGE/Censo 2010";
      s.colaboradores[3].sexoInferencia.versao = "antiga";
      localStorage.setItem("fintria-escala-dp-v2", JSON.stringify(s));
    });
    await page.reload();
    await page.locator("#btn-sugerir-sexos").click();
    assert.match(
      (await saved()).colaboradores[3].sexoInferencia.versao,
      /2022/,
    );
    assert.equal((await saved()).colaboradores[0].sexo, "masculino");
    const segundoNome = page.locator('#colab-list [data-field="nome"]').nth(1);
    await segundoNome.fill("Adair Souza");
    await segundoNome.dispatchEvent("change");
    assert.equal((await saved()).colaboradores[1].sexo, "nao_informado");
    await page
      .locator('#colab-list [data-field="sexo"]')
      .nth(2)
      .selectOption("nao_informado");
    await page.locator("#btn-sugerir-sexos").click();
    assert.equal((await saved()).colaboradores[2].sexo, "nao_informado");
    await irParaEtapa(page, "#btn-gerar");
    await page.locator("#btn-gerar").click();
    const promessa = page.waitForEvent("download");
    await page.locator("#btn-exportar-csv").click();
    const d = await promessa;
    const csv = await fs.readFile(await d.path(), "utf8");
    assert.match(csv, /Origem do sexo/);
    assert.match(csv, /Estimado pelo prenome/);
    assert.ok(
      externas.every((url) =>
        /fonts\.(googleapis|gstatic)\.com|cdn\.tailwindcss\.com/.test(url),
      ),
    );
    assert.deepEqual(errors, []);
    console.log(
      "OK: sexo por nome na prévia/confirmacão, limiar conservador, ausência de consultas externas, correção manual, revisão de nomes, cadastros antigos, CSV e persistência",
    );
  } finally {
    await context.close();
  }
};
