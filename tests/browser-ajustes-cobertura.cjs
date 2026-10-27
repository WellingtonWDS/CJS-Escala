const { clicarCalculo } = require("./helpers/calculo.cjs");
const assert = require("node:assert/strict");
const { irParaEtapa } = require("./helpers/etapas.cjs");
module.exports = async function ({ browser, baseURL }) {
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
    await page.evaluate(() => {
      const key = "fintria-escala-dp-v2",
        s = JSON.parse(localStorage.getItem(key));
      Object.assign(s, {
        mes: 9,
        ano: 2026,
        diaInicio: 26,
        tipoEscala: "5x2",
        diasTrabalho: [1, 2, 3, 4, 5],
        modoRegime: "simulacao",
        regimeJornada: "definitivo40",
        coberturaAtiva: true,
        feriados: [],
        feriadosExcluidos: ["2026-10-12"],
        jornada: {
          entrada: "08:00",
          intInicio: "12:00",
          intFim: "13:00",
          saida: "18:00",
        },
        escalaGerada: null,
        conversao: null,
      });
      s.colaboradores = [1, 2].map((id) => ({
        id,
        nome: `Pessoa ${id}`,
        cargo: "Atendente",
        sexo: "masculino",
        horasSemana: 40,
      }));
      s.demandasCobertura = [
        {
          id: 1,
          funcao: "Atendente",
          inicio: "09:00",
          fim: "18:00",
          minimo: 1,
          diasSemana: [1, 2, 3, 4, 5],
          incluirFeriados: false,
        },
      ];
      localStorage.setItem(key, JSON.stringify(s));
    });
    await page.reload();
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    const saved = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("fintria-escala-dp-v2")),
      );
    await irParaEtapa(page, "#btn-gerar");
    await clicarCalculo(page, "#btn-gerar");
    const inicial = (await saved()).escalaGerada;
    const diagnostico = page.locator(
      "#resultado-gerar [data-diagnostico-equipe]",
    );
    assert.equal(
      await diagnostico.getAttribute("data-status"),
      "redistribuicao",
    );
    assert.ok(await diagnostico.locator("[data-diagnostico-faixa]").count());
    const painel = page.locator("#resultado-gerar-ajustes");
    async function confirmarResultado(painelAtual) {
      const modal = page.locator('dialog[data-app-dialog][open]');
      await modal.waitFor({ state: "visible" });
      const resumo = await modal.locator("#app-dialog-message").textContent();
      assert.match(await modal.locator("h2").textContent(), /cobertura/);
      assert.notEqual(await painelAtual.locator("[data-ajuste-mensagem]").textContent(), resumo);
      assert.equal(await painelAtual.locator("[data-ajuste-aplicar]").count(), 0);
      await modal.locator("[data-dialog-accept]").click();
      await modal.waitFor({ state: "hidden" });
      assert.equal(await painelAtual.locator("[data-ajuste-mensagem]").textContent(), resumo);
      return resumo;
    }
    // Hold the worker request to exercise visible loading and cancellation without sleep.
    let liberar;
    const bloqueado = new Promise((resolve) => (liberar = resolve));
    await page.route(
      "**/assets/js/workers/ajustes-cobertura.js",
      async (route) => {
        await bloqueado;
        try {
          await route.continue();
        } catch {}
      },
    );
    await painel.locator("[data-ajuste-buscar]").click();
    assert.equal(await painel.getAttribute("aria-busy"), "true");
    assert.ok(await painel.locator("[data-ajuste-progresso]").isVisible());
    assert.ok(await painel.locator("[data-ajuste-buscar]").isDisabled());
    await page
      .locator("[data-loading-overlay][open] [data-loading-cancel]")
      .click();
    liberar();
    await page.unroute("**/assets/js/workers/ajustes-cobertura.js");
    assert.equal(await painel.getAttribute("aria-busy"), null);
    assert.match(
      await painel.locator("[data-ajuste-mensagem]").textContent(),
      /cancelada/,
    );
    assert.deepEqual((await saved()).escalaGerada, inicial);
    await painel.locator("[data-ajuste-buscar]").click();
    await confirmarResultado(painel);
    await painel.locator("[data-ajuste-aplicar]").waitFor({ state: "visible" });
    assert.deepEqual((await saved()).escalaGerada, inicial);
    assert.match(
      await painel.locator("[data-ajuste-previa]").textContent(),
      /Antes.*Sugestão/s,
    );
    await painel.locator("[data-ajuste-aplicar]").click();
    let s = await saved();
    assert.equal(s.escalaGerada.coberturaOperacional.lacunas.length, 0);
    assert.ok(s.escalaGerada.ajustesCobertura);
    assert.equal(await diagnostico.getAttribute("data-status"), "coberta");
    assert.ok(await painel.locator("[data-ajuste-desfazer]").isEnabled());
    const aplicado = structuredClone((await saved()).escalaGerada);
    await painel.locator("[data-ajuste-buscar]").click();
    assert.match(await confirmarResultado(painel), /Nenhum ajuste seguro/);
    assert.deepEqual((await saved()).escalaGerada, aplicado);
    await page.reload();
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    await irParaEtapa(page, "#btn-gerar");
    assert.ok(await painel.locator("[data-ajuste-desfazer]").isEnabled());
    await painel.locator("[data-ajuste-desfazer]").click();
    assert.deepEqual((await saved()).escalaGerada.resultado, inicial.resultado);
    assert.equal(
      await diagnostico.getAttribute("data-status"),
      "redistribuicao",
    );
    // Register another enabled role, then use real conversion + worker + apply.
    await page.evaluate(() => {
      const key = "fintria-escala-dp-v2",
        s = JSON.parse(localStorage.getItem(key));
      Object.assign(s, {
        tipoEscala: "6x1",
        diaInicio: 1,
        diasTrabalho: [1, 2, 3, 4, 5, 6],
        escalaGerada: null,
        conversao: null,
      });
      s.colaboradores = [
        {
          id: 1,
          nome: "Caixa exemplo",
          cargo: "Caixa",
          sexo: "masculino",
          horasSemana: 40,
        },
        {
          id: 2,
          nome: "Supervisor habilitado",
          cargo: "Supervisor",
          sexo: "masculino",
          horasSemana: 40,
        },
        {
          id: 3,
          nome: "Supervisor exemplo",
          cargo: "Supervisor",
          sexo: "masculino",
          horasSemana: 40,
        },
      ];
      s.demandasCobertura = [
        {
          id: 1,
          funcao: "Caixa",
          inicio: "09:00",
          fim: "12:00",
          minimo: 2,
          diasSemana: [1, 2, 3, 4, 5],
          incluirFeriados: false,
        },
        {
          id: 2,
          funcao: "Supervisor",
          inicio: "09:00",
          fim: "12:00",
          minimo: 1,
          diasSemana: [1, 2, 3, 4, 5],
          incluirFeriados: false,
        },
      ];
      localStorage.setItem(key, JSON.stringify(s));
    });
    await page.reload();
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    await irParaEtapa(page, "#colab-list");
    const habilitacoes = page.locator('[data-habilitacoes="2"]');
    await habilitacoes.locator("summary").click();
    await habilitacoes.locator('[data-habilitacao="2"][value="Caixa"]').check();
    assert.deepEqual((await saved()).colaboradores[1].funcoesHabilitadas, [
      "Caixa",
    ]);
    await irParaEtapa(page, "#btn-converter");
    await page.locator("#conversao-periodo").fill("2026-10");
    await page.locator("#conversao-fase").selectOption("definitivo40");
    await page.locator("#conversao-folgas").selectOption("fim_semana");
    await clicarCalculo(page, "#btn-converter");
    s = await saved();
    assert.ok(s.conversao);
    const origem = structuredClone(s.conversao.origem),
      faltantes = s.conversao.comparacao.faltantesDepois;
    const proposta = page.locator("#resultado-proposta-ajustes");
    await proposta.locator("[data-ajuste-buscar]").click();
    await confirmarResultado(proposta);
    await proposta
      .locator("[data-ajuste-aplicar]")
      .waitFor({ state: "visible" });
    assert.match(
      await proposta.locator("[data-ajuste-previa]").textContent(),
      /Caixa/,
    );
    await proposta.locator("[data-ajuste-aplicar]").click();
    s = await saved();
    assert.deepEqual(s.conversao.origem, origem);
    assert.ok(s.conversao.comparacao.faltantesDepois < faltantes);
    assert.ok(
      s.conversao.proposta.config.escalaGerada.resultado[1].dias.some(
        (d) => d.funcaoAlocada === "Caixa",
      ),
    );
    assert.match(
      await page.locator("#resultado-proposta").textContent(),
      /Função: Caixa/,
    );
    // A stale proposal cannot be optimized again.
    await irParaEtapa(page, "#tg-cobertura");
    await page.locator("#tg-cobertura").uncheck();
    await irParaEtapa(page, "#btn-converter");
    await proposta.locator("[data-ajuste-buscar]").click();
    await confirmarResultado(proposta);
    assert.match(
      await proposta.locator("[data-ajuste-mensagem]").textContent(),
      /desatualizada/,
    );
    assert.equal((await saved()).conversao.desatualizada, true);
    assert.equal(
      await page
        .locator("#conversao-comparacao [data-diagnostico-equipe]")
        .count(),
      0,
    );
    await irParaEtapa(page, "#tg-cobertura");
    await page.locator("#tg-cobertura").check();
    await irParaEtapa(page, "#btn-converter");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await proposta.locator("[data-ajuste-buscar]").isVisible());
    // Editing inputs during a background search must discard the old result safely.
    await page.evaluate(() => {
      const Original = window.Worker;
      window.__ajusteMensagens = 0;
      window.Worker = class extends Original {
        constructor(...args) {
          super(...args);
          this.addEventListener("message", () => window.__ajusteMensagens++);
        }
      };
    });
    await irParaEtapa(page, "#btn-gerar");
    await clicarCalculo(page, "#btn-gerar");
    let liberarEdicao;
    const bloqueioEdicao = new Promise((resolve) => (liberarEdicao = resolve));
    await page.route(
      "**/assets/js/workers/ajustes-cobertura.js",
      async (route) => {
        await bloqueioEdicao;
        try {
          await route.continue();
        } catch {}
      },
    );
    await painel.locator("[data-ajuste-buscar]").click();
    await irParaEtapa(page, "#colab-list");
    await page.locator('[data-field="nome"]').first().fill("Caixa revisado");
    await page.locator('[data-field="nome"]').first().dispatchEvent("change");
    liberarEdicao();
    await page.unroute("**/assets/js/workers/ajustes-cobertura.js");
    await page.waitForFunction(() => window.__ajusteMensagens > 0);
    assert.equal((await saved()).escalaGerada, null);
    assert.equal(await painel.count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      "OK: sugestões em Worker, loading/cancelamento, prévia sem mutação, aplicar/desfazer e recarga, habilitações, proposta preservando origem e bloqueio de resultado desatualizado",
    );
  } finally {
    await context.close();
  }
};
