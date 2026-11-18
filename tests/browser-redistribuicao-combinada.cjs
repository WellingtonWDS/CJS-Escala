const assert = require("node:assert/strict");
const cenario = require("./helpers/cenario-redistribuicao.cjs");
module.exports = async ({ browser, baseURL }) => {
  for (const fixa of [false, true]) {
    const ctx = await browser.newContext({
      reducedMotion: "reduce",
      viewport: { width: 1440, height: 1000 },
    });
    try {
      const page = await ctx.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.clock.install({ time: new Date("2026-10-28T12:00:00Z") });
      await page.goto(baseURL);
      await page.waitForFunction(
        () => document.documentElement.dataset.ready === "true",
      );
      const seed = await cenario(fixa);
      const { converterEscala } = await import(
        "../assets/js/domain/conversao.js"
      );
      seed.tipoEscala = "6x1";
      delete seed.aplicarProposta5x2;
      seed.escalaGerada = null;
      seed.colaboradores.forEach((c) => (c.quadroDominio.modelo = "6x1"));
      seed.conversao = converterEscala(seed, {
        periodo: "2026-10",
        fase: "definitivo40",
        folgas: "fim_semana",
      });
      seed.escalaGerada = seed.conversao.origem.escala;
      await page.evaluate(
        (s) => localStorage.setItem("fintria-escala-dp-v2", JSON.stringify(s)),
        seed,
      );
      await page.reload();
      await page.waitForFunction(
        () => document.documentElement.dataset.ready === "true",
      );
      await page.locator('[data-etapa-link="sec-gerar"]').click();
      const painel = page.locator("#resultado-proposta-ajustes"),
        saved = () =>
          page.evaluate(() =>
            JSON.parse(localStorage.getItem("fintria-escala-dp-v2")),
          );
      const antes = await saved();
      const modal = page.locator('dialog[data-app-dialog="alert"][open]');
      async function fecharResultado() {
        await modal.waitFor();
        await modal.locator("[data-dialog-accept]").click();
        await modal.waitFor({ state: "hidden" });
      }
      assert.equal(await painel.locator('[data-ajuste-buscar]').count(),1);
      assert.equal(await page.locator('#escala-atual-previa').evaluate(e=>e.open),false);
      // Cancelamento termina o Worker sem aplicar nenhuma etapa intermediária.
      let liberar;
      const espera = new Promise((r) => (liberar = r));
      await page.route(
        "**/assets/js/workers/ajustes-cobertura.js",
        async (route) => {
          await espera;
          try {
            await route.continue();
          } catch {}
        },
      );
      await painel.locator("[data-ajuste-buscar]").click();
      assert.equal(await painel.getAttribute("aria-busy"), "true");
      assert(await painel.locator("[data-ajuste-buscar]").isDisabled());
      await page
        .locator("[data-loading-overlay][open] [data-loading-cancel]")
        .click();
      liberar();
      await page.unroute("**/assets/js/workers/ajustes-cobertura.js");
      assert.match(
        await painel.locator("[data-ajuste-mensagem]").innerText(),
        /cancelada/,
      );
      assert.deepEqual(await saved(), antes);
      await painel.locator("[data-ajuste-buscar]").click();
      await fecharResultado();
      await painel.locator("[data-ajuste-aplicar]").waitFor();
      await painel.locator("[data-busca-detalhes] > summary").click();
      assert.match(
        await painel.locator("[data-busca-detalhes]").innerText(),
        /busca de sequências sem teto fixo/,
      );
      assert.match(
        await painel.locator("[data-busca-detalhes]").innerText(),
        /Redistribuição encadeada de operações|Otimização global de folgas, horários, intervalos e funções/,
      );
      assert.deepEqual(await saved(), antes);
      await painel.locator("[data-ajuste-aplicar]").click();
      let state = await saved();
      assert.equal(
        state.conversao.proposta.config.escalaGerada.coberturaOperacional
          .lacunas.length,
        0,
      );
      assert.equal(
        state.conversao.proposta.config.escalaGerada.ajustesCobertura
          .buscaAmpliada,
        true,
      );
      await page.reload();
      await page.waitForFunction(
        () => document.documentElement.dataset.ready === "true",
      );
      await page.locator('[data-etapa-link="sec-gerar"]').click();
      assert(await painel.locator("[data-ajuste-desfazer]").isEnabled());
      await painel.locator("[data-ajuste-desfazer]").click();
      state = await saved();
      assert.deepEqual(
        state.conversao.proposta.config.escalaGerada.resultado,
        antes.conversao.proposta.config.escalaGerada.resultado,
      );
      await page.setViewportSize({ width: 390, height: 844 });
      assert(await painel.locator("[data-ajuste-buscar]").isVisible());
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      assert.deepEqual(errors, []);
      console.log(
        `OK: busca única encadeada ${fixa ? "fixa" : "dinâmica"} em Worker, cancelamento, prévia sem alteração, aplicação atômica, recarga/desfazer e celular.`,
      );
    } finally {
      await ctx.close();
    }
  }
};
