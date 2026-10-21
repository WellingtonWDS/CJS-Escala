const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
module.exports = async function testarConversao({ browser, baseURL }) {
  const context = await browser.newContext({ timezoneId: "America/Sao_Paulo" });
  try {
    const page = await context.newPage(),
      errors = [];
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
    const saved = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("fintria-escala-dp-v2")),
      );
    // Semeia uma operação pequena e conhecida; as demais ações exercitam a UI real.
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("fintria-escala-dp-v2"));
      s.colaboradores.forEach((c) => {
        c.cargo = "Atendente";
        c.horasSemana = 40;
      });
      s.jornada = {
        entrada: "08:00",
        intInicio: "12:00",
        intFim: "13:00",
        saida: "17:00",
      };
      s.coberturaAtiva = true;
      s.demandasCobertura = [
        {
          id: 1,
          funcao: "Atendente",
          inicio: "09:00",
          fim: "12:00",
          minimo: 1,
          diasSemana: [1, 2, 3, 4, 5, 6],
          incluirFeriados: false,
        },
      ];
      localStorage.setItem("fintria-escala-dp-v2", JSON.stringify(s));
    });
    await page.reload();
    assert.equal(
      await page.locator("#conversao-resultados").isVisible(),
      false,
    );
    assert.equal(await page.locator("#cfg-mes").inputValue(), "9");
    await page.locator("#conversao-periodo").fill("2028-02");
    await page.locator("#btn-converter").click();
    await page.waitForFunction(
      () =>
        !!JSON.parse(localStorage.getItem("fintria-escala-dp-v2")).conversao,
    );
    let s = await saved();
    assert.equal(s.tipoEscala, "6x1");
    assert.equal(s.mes, 9);
    assert.equal(s.conversao.proposta.config.tipoEscala, "5x2");
    assert.equal(s.conversao.proposta.config.mes, 1);
    assert.equal(s.conversao.comparacao.status, "suficiente");
    assert.match(
      await page.locator("#conversao-diagnostico").innerText(),
      /quadro atual é suficiente/,
    );
    assert.match(
      await page.locator("#resultado-proposta").innerText(),
      /Escala mensal/,
    );
    assert.match(
      await page.locator("#resultado-gerar").innerText(),
      /Escala mensal/,
    );
    const origem = structuredClone(s.conversao.origem);
    const promise = page.waitForEvent("download");
    await page.locator("#btn-exportar-proposta").click();
    const download = await promise;
    assert.equal(download.suggestedFilename(), "proposta-5x2-2028-02.csv");
    const csv = await readFile(await download.path(), "utf8");
    assert.match(csv, /2028-02/);
    await page.reload();
    assert.equal((await saved()).conversao.comparacao.status, "suficiente");
    assert.equal(await page.locator("#conversao-resultados").isVisible(), true);
    // Folga manual em quem cobre uma faixa: a conclusão precisa ser recalculada.
    s = await saved();
    const faixa =
      s.conversao.proposta.config.escalaGerada.coberturaOperacional.periodos.find(
        (p) => p.presentes === 1,
      );
    assert.ok(faixa);
    let ri, di;
    for (
      let r = 0;
      r < s.conversao.proposta.config.escalaGerada.resultado.length;
      r++
    ) {
      const dias = s.conversao.proposta.config.escalaGerada.resultado[r].dias;
      const idx = dias.findIndex(
        (d) => d.data === faixa.data && d.status === "T",
      );
      if (idx >= 0) {
        ri = r;
        di = idx;
        break;
      }
    }
    page.on("dialog", (dialog) => dialog.accept("F"));
    await page
      .locator(`#resultado-proposta [data-ri="${ri}"][data-di="${di}"]`)
      .click();
    assert.ok((await saved()).conversao.comparacao.faltantesDepois > 0);
    assert.deepEqual((await saved()).conversao.origem, origem);
    await page.locator("#conversao-folgas").selectOption("fim_semana");
    assert.match(
      await page.locator("#conversao-diagnostico").innerText(),
      /desatualizada/,
    );
    assert.equal(
      await page.locator("#btn-exportar-proposta").isDisabled(),
      true,
    );
    await page.locator("#btn-converter").click();
    assert.ok((await saved()).conversao.comparacao.lacunas.length);
    assert.ok(
      (await saved()).conversao.proposta.config.diasTrabalho.includes(6),
    );
    await page.locator("#conversao-folgas").selectOption("distribuir");
    await page.locator("#cadastro-manual-colaboradores > summary").click();
    await page.locator("#colab-list [data-remove]").last().click();
    await page.locator("#btn-converter").click();
    assert.equal((await saved()).conversao.comparacao.status, "insuficiente");
    assert.match(
      await page.locator("#conversao-comparacao").innerText(),
      /dias-pessoa/,
    );
    await page.locator("#tg-cobertura").uncheck();
    await page.locator("#btn-converter").click();
    assert.equal((await saved()).conversao.comparacao.status, "nao_avaliada");
    assert.match(
      await page.locator("#conversao-diagnostico").innerText(),
      /não é possível concluir/,
    );
    await page.locator('[data-tipo="5x2"]').click();
    await page.locator("#btn-converter").click();
    assert.match(
      await page.locator("#conversao-mensagem").innerText(),
      /modelo 6×1/,
    );
    assert.equal((await saved()).conversao.desatualizada, true);
    await page.locator('[data-tipo="6x1"]').click();
    // Se faltar espaço, a proposta continua disponível nesta aba e a UI avisa.
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException("Sem espaço", "QuotaExceededError");
      };
    });
    await page.locator("#btn-converter").click();
    assert.match(
      await page.locator("#conversao-mensagem").innerText(),
      /não pôde ser salva/,
    );
    assert.equal(
      await page.locator("#btn-exportar-proposta").isDisabled(),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      "OK: conversão 6x1→5x2 separada, diagnóstico de suficiência/insuficiência, preservação da origem, ajuste manual, CSV, restauração e invalidação",
    );
  } finally {
    await context.close();
  }
};
