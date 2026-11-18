const assert = require("node:assert/strict");
const cenario = require("./helpers/cenario-explicacao-busca.cjs");
const { clicarCalculo } = require("./helpers/calculo.cjs");
module.exports = async ({ browser, baseURL }) => {
  for (const fixa of [false, true]) {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    try {
      const page = await ctx.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.clock.install({ time: new Date("2027-02-10T12:00:00Z") });
      await page.goto(baseURL);
      await page.waitForFunction(
        () => document.documentElement.dataset.ready === "true",
      );
      await page.evaluate(
        (s) => localStorage.setItem("fintria-escala-dp-v2", JSON.stringify(s)),
        await cenario(fixa),
      );
      await page.reload();
      await page.waitForFunction(
        () => document.documentElement.dataset.ready === "true",
      );
      await page.locator('[data-etapa-link="sec-gerar"]').click();
      await page.locator("#conversao-fase").selectOption("transicao42");
      await page.locator("#conversao-folgas").selectOption("fim_semana");
      await clicarCalculo(page, "#btn-converter");
      const saved = () =>
        page.evaluate(() =>
          JSON.parse(localStorage.getItem("fintria-escala-dp-v2")),
        );
      const before = await saved(),
        painel = page.locator("#resultado-proposta-ajustes");
      await painel.locator("[data-ajuste-buscar]").click();
      const modal = page.locator('dialog[data-app-dialog="alert"][open]');
      await modal.waitFor();
      assert.match(await modal.innerText(),/Nenhuma melhoria encontrada nas [1-9]\d* alternativas/);
      assert.doesNotMatch(await modal.innerText(),/tempo máximo|30 segundos/);
      await modal.locator("[data-dialog-accept]").click();
      await modal.waitFor({ state: "hidden" });
      const detalhes = painel.locator("[data-busca-detalhes]");
      await detalhes.waitFor();
      await detalhes.locator("> summary").click();
      assert(await detalhes.locator('[data-busca-triagem="dia_anterior_sem_alcance"]').isVisible());
      assert(await detalhes.locator('[data-busca-motivo="configuracao"]').isVisible());
      assert.match(await detalhes.innerText(),/não são tentativas completas/);
      assert.doesNotMatch(await painel.innerText(),/Tempo de busca|30 segundos|espera obrigatória/);
      assert.match(await detalhes.innerText(), /O que foi avaliado/);
      assert.match(
        await detalhes.innerText(),
        /Sábado e domingo estão definidos como folgas fixas/,
      );
      assert.match(
        await detalhes.innerText(),
        /Isso significa que é preciso contratar/,
      );

      const limite = detalhes
        .locator("details")
        .filter({ has: page.locator("summary", { hasText: "Limite teórico" }) })
        .first();
      await limite.locator("> summary").click();
      assert.match(await limite.innerText(), /39:36/);
      assert.match(await limite.innerText(), /diferença mínima de 02:24/);
      assert.match(await limite.innerText(), /não uma prova isolada/);
      const motivo = detalhes.locator("[data-busca-motivo]").first();
      if(await motivo.count()){
        assert.match(await detalhes.innerText(),/amostra de até duas/);
        await motivo.locator("> summary").click();
        assert.match(await motivo.innerText(), /Colaborador/);
      }
      assert.deepEqual(await saved(), before);
      for (const tema of ["light", "dark"]) {
        await page.evaluate(
          (t) => (document.documentElement.dataset.theme = t),
          tema,
        );
        await page.setViewportSize({ width: 390, height: 844 });
        await detalhes.locator("> summary").scrollIntoViewIfNeeded();
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        );
        const region = detalhes.locator(".busca-auditoria-tabela");
        if(await region.count()){
          assert(await region.evaluate(e=>e.scrollWidth>e.clientWidth));
          await region.evaluate(e=>e.scrollLeft=e.scrollWidth);
          assert(await region.evaluate(e=>e.scrollLeft>0));
        }
        const exemplo = detalhes.locator(".busca-auditoria-exemplo").first();
        assert(
          await exemplo.evaluate((e) => {
            const rgb = (s) =>
              (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
            const l = (c) => {
              const v = c.map((x) => {
                x /= 255;
                return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
              });
              return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
            };
            const css = getComputedStyle(e),
              a = l(rgb(css.color)),
              b = l(rgb(css.backgroundColor));
            return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5;
          }),
        );
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await detalhes.locator("> summary").scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `/tmp/reescala-busca-${fixa ? "fixa" : "dinamica"}.png`,
      });
      assert.deepEqual(await saved(), before);
      assert.deepEqual(errors, []);
      console.log(
        `OK: explicação ${fixa ? "fixa" : "dinâmica"} em Worker, estratégias, exemplos reais, folgas fixas, teto contratual, cores claras/escuras, celular e dados preservados.`,
      );
    } finally {
      await ctx.close();
    }
  }
};
