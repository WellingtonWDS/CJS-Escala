const assert = require("node:assert/strict");
const { clicarCalculo } = require("./helpers/calculo.cjs");

module.exports = async ({ browser, baseURL }) => {
  const { criarEstadoDemo } = await import("../database/demo/state.mjs");
  const { diasDoModelo } = await import("../assets/js/domain/modelo-escala.js");
  for (const fixa of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 2200, height: 1400 }, reducedMotion: "reduce" });
    try {
      const page = await ctx.newPage(), errors = [];
      page.on("pageerror", e => errors.push(e.message));
      await page.clock.install({ time: new Date("2026-10-29T12:00:00Z") });
      await page.goto(baseURL);
      await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
      const seed = criarEstadoDemo();
      seed.modeloEscala = fixa ? "fixa" : "dinamica";
      seed.coberturaAtiva = false;
      await page.evaluate(s => localStorage.setItem("fintria-escala-dp-v2", JSON.stringify(s)), seed);
      await page.reload();
      await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
      await page.locator('[data-etapa-link="sec-gerar"]').click();
      await clicarCalculo(page, "#btn-converter");
      const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem("fintria-escala-dp-v2")));
      let snapshot = await saved();
      const config = snapshot.conversao.proposta.config;
      const r = config.escalaGerada.resultado[0];
      const dias = diasDoModelo(config, r.dias);
      const seg = dias.find(d => d.weekday === 1 && d.status === "T");
      const dom = dias.find(d => d.weekday === 0 && d.data > seg.data);
      assert.equal(dom.status, "F");
      const panel = page.locator("#resultado-proposta");
      const card = d => panel.locator(`[data-ri="0"][data-di="${r.dias.indexOf(d)}"]`);
      const alert = page.locator('dialog[data-app-dialog="alert"][open]');
      async function bloqueado(mensagem = /empresa não funciona.*Dom/i) {
        await alert.waitFor();
        assert.match(await alert.textContent(), mensagem);
        assert.equal(await page.locator('dialog[data-app-dialog="confirm"][open]').count(), 0);
        await alert.locator("[data-dialog-accept]").click();
        await alert.waitFor({ state: "hidden" });
        assert.deepEqual(await saved(), snapshot);
      }
      // Gesto real de arraste, e alternativa por cliques usada no celular.
      await card(seg).dragTo(card(dom));
      await bloqueado();
      await panel.locator("[data-troca-selecionar]").click();
      await card(dom).click();
      await card(seg).click();
      await bloqueado();
      // A edição por formulário também não pode contornar a restrição.
      await card(dom).click();
      const prompt = page.locator('dialog[data-app-dialog="prompt"][open]');
      await prompt.waitFor();
      await prompt.locator("select").selectOption("T");
      await prompt.locator("[data-dialog-accept]").click();
      const form = page.locator('dialog[data-app-dialog="form"][open]');
      await form.waitFor();
      for (const [key, value] of Object.entries({ entrada: "08:00", intInicio: "11:00", intFim: "13:00", saida: "18:00" }))
        await form.locator(`[data-dialog-time="${key}"]`).fill(value);
      await form.locator("[data-dialog-accept]").click();
      await bloqueado();
      const sab = dias.find(d => d.weekday === 6 && d.data > seg.data);
      // Sábado reduzido: a troca propõe encaixar o horário no funcionamento do dia.
      const confirmar = page.locator('dialog[data-app-dialog="confirm"][open]');
      await card(seg).dragTo(card(sab));
      await confirmar.waitFor();
      assert.match(await confirmar.textContent(), /Ajustar ao horário de funcionamento[\s\S]*Sábado funciona das 08:00 às 12:00[\s\S]*será ajustado para 08:00–12:00, sem intervalo/);
      await confirmar.locator("[data-dialog-cancel]").click();
      await confirmar.waitFor({ state: "hidden" });
      assert.deepEqual(await saved(), snapshot, "cancelar não altera a escala");
      await panel.locator("[data-troca-selecionar]").click();
      await card(sab).click();
      await card(seg).click();
      await confirmar.waitFor();
      assert.match(await confirmar.locator("[data-dialog-accept]").textContent(), /Ajustar e trocar/);
      await confirmar.locator("[data-dialog-accept]").click();
      await confirmar.waitFor({ state: "hidden" });
      await page.waitForFunction((data) => JSON.parse(localStorage.getItem("fintria-escala-dp-v2")).conversao.proposta.config.escalaGerada.resultado[0].dias.find((d) => d.data === data).status === "T", sab.data);
      const ajustado = (await saved()).conversao.proposta.config.escalaGerada.resultado[0].dias.find((d) => d.data === sab.data);
      assert.deepEqual([ajustado.entradaMin, ajustado.saidaMin, ajustado.intervaloInicioMin ?? null], [480, 720, null]);
      snapshot = await saved();
      for (const [entrada,saida] of [["07:59","12:00"],["09:00","13:00"],["08:00","12:01"]]) {
        await card(sab).click();
        await prompt.waitFor();
        await prompt.locator("select").selectOption("T");
        await prompt.locator("[data-dialog-accept]").click();
        await form.waitFor();
        for (const [key,value] of Object.entries({entrada,saida,intInicio:"",intFim:""}))
          await form.locator(`[data-dialog-time="${key}"]`).fill(value);
        await form.locator("[data-dialog-accept]").click();
        await bloqueado(/funcionamento da empresa.*08:00–12:00/);
      }
      assert.deepEqual(errors, []);
      console.log(`OK: ${fixa ? "fixa" : "dinâmica"} bloqueia domingo fechado, ajusta a troca ao sábado de 08–12 após confirmação e bloqueia horário fora do funcionamento no formulário.`);
    } finally { await ctx.close(); }
  }
};
