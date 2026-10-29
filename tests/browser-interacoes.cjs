const assert = require("node:assert/strict");
const { clicarCalculo } = require("./helpers/calculo.cjs");
module.exports = async ({ browser, baseURL }) => {
  const { criarEstadoDemo } = await import("../database/demo/state.mjs");
  const { diasDoModelo } = await import("../assets/js/domain/modelo-escala.js");
  for (const fixa of [false, true]) {
    const ctx = await browser.newContext({
      reducedMotion: "reduce",
      viewport: { width: 2200, height: 1400 },
    });
    try {
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.clock.install({ time: new Date("2026-10-29T12:00:00Z") });
      await page.goto(baseURL);
      await page.waitForFunction(
        () => document.documentElement.dataset.ready === "true",
      );
      const seed = criarEstadoDemo();
      seed.modeloEscala = fixa ? "fixa" : "dinamica";
      seed.atividadeComercio = false;
      seed.coberturaAtiva = false;
      seed.colaboradores.forEach((c) => (c.sexo = "masculino"));
      await page.evaluate(
        (s) => localStorage.setItem("fintria-escala-dp-v2", JSON.stringify(s)),
        seed,
      );
      await page.reload();
      await page.waitForFunction(
        () => document.documentElement.dataset.ready === "true",
      );
      await page.locator('[data-etapa-link="sec-gerar"]').click();
      assert(
        await page
          .locator("#conversao-fase option[value=transicao42]")
          .isDisabled(),
      );
      await clicarCalculo(page, "#btn-converter");
      const saved = () =>
        page.evaluate(() =>
          JSON.parse(localStorage.getItem("fintria-escala-dp-v2")),
        );
      const state = await saved(),
        r = state.conversao.proposta.config.escalaGerada.resultado[0];
      const ds = fixa
        ? diasDoModelo(state.conversao.proposta.config, r.dias)
        : r.dias;
      const da = ds.find((d) => d.weekday === 3 && d.status === "T"),
        db = ds.find((d) => d.weekday === 0 && d.data > da.data);
      const a = r.dias.indexOf(da),
        b = r.dias.indexOf(db);
      const panel = page.locator("#resultado-proposta");
      async function iniciarTroca() {
        if(!fixa) await panel.locator(`[data-ri="0"][data-di="${a}"]`).dragTo(panel.locator(`[data-ri="0"][data-di="${b}"]`));
        else { await panel.locator('[data-troca-selecionar]').click();await panel.locator(`[data-ri="0"][data-di="${a}"]`).click();await panel.locator(`[data-ri="0"][data-di="${b}"]`).click(); }
      }
      const confirm = page.locator('dialog[data-app-dialog="confirm"][open]');
      await iniciarTroca();await confirm.waitFor();await confirm.locator('[data-dialog-cancel]').click();await confirm.waitFor({state:'hidden'});
      assert.deepEqual((await saved()).conversao.proposta.config.escalaGerada,state.conversao.proposta.config.escalaGerada);
      await iniciarTroca();await confirm.waitFor();
      await confirm.locator("[data-dialog-accept]").click();
      await page.waitForFunction(
        () =>
          JSON.parse(localStorage.getItem("fintria-escala-dp-v2")).conversao
            .proposta.config.escalaGerada.ultimaTrocaManual,
      );
      const changed = await saved();
      assert.equal(
        changed.conversao.proposta.config.escalaGerada.resultado[0].dias[a]
          .status,
        "F",
      );
      assert.deepEqual(changed.conversao.origem, state.conversao.origem);
      await panel.locator("[data-troca-desfazer]").click();
      await page.waitForFunction(
        () =>
          !JSON.parse(localStorage.getItem("fintria-escala-dp-v2")).conversao
            .proposta.config.escalaGerada.ultimaTrocaManual,
      );
      if (!fixa) {
        await page.locator('[data-etapa-link="sec-config"]').click();
        for (const id of [1, 2]) {
          const btn = page.locator(`[data-horario-individual="${id}"]`);
          if (await btn.count()) await btn.click();
          else
            await page
              .locator(`[data-perfil-dominio="${id}"]`)
              .evaluate((e) => (e.open = true));
        }
        await page
          .locator(
            '[data-id="1"][data-dominio="horario"][data-dia="1"][data-horario="entrada"]',
          )
          .fill("09:00");
        await page.locator('[data-copiar-horarios="2"]').selectOption("1");
        await page.locator('[data-replicar-horarios="2"]').click();
        await confirm.waitFor();
        await confirm.locator("[data-dialog-accept]").click();
        const copied = await saved();
        assert.deepEqual(
          copied.colaboradores[0].quadroDominio.semana,
          copied.colaboradores[1].quadroDominio.semana,
        );
        assert.notEqual(copied.colaboradores[0].id, copied.colaboradores[1].id);
      }
      assert.deepEqual(errors, []);
      console.log(
        `OK: ${fixa ? "fixa" : "dinâmica"} troca de dias com confirmação/desfazer, origem preservada, 42h bloqueadas e cópia de horários.`,
      );
    } finally {
      await ctx.close();
    }
  }
};
