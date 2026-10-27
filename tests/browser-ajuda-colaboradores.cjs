const assert = require("node:assert/strict");
module.exports = async ({ browser, baseURL }) => {
  for (const mobile of [false, true]) {
    const context = await browser.newContext(mobile
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1366, height: 900 } });
    try {
      await context.route("https://**/*", (r) => r.abort());
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(baseURL);
      await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
      await page.evaluate(async () => {
        const { createDefaultState } = await import("/assets/js/state/store.js");
        const state = createDefaultState();
        state.colaboradores = [{ id: 1, nome: "Pessoa teste", cargo: "Atendente", sexo: "nao_informado", horasSemana: 44,
          quadroDominio: { codigo: "123", arquivo: "origem-privada.xls", aba: "Quadro", linha: 10, serie: "123", vistoFiscal: "456", tipo: "semanal", ativo: true, cargaConfirmada: true, ciclo: {}, pendencias: [], linhasOriginais: [],
            semana: Object.fromEntries([0,1,2,3,4,5,6].map(d => [d, d === 0 ? {status:"folga"} : {status:"trabalho", jornada:{entrada:"08:00",intInicio:"12:00",intFim:"14:00",saida:d === 6 ? "12:00":"18:00"}}])) } }];
        localStorage.setItem("fintria-escala-dp-v2", JSON.stringify(state));
      });
      await page.reload();
      await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
      const detail = page.locator('[data-perfil-dominio="1"]');
      await detail.locator("summary").first().click();
      assert.doesNotMatch(await detail.innerText(), /Série:|Visto fiscal:|origem-privada|Horas de relógio calculadas|O relatório não informa o sexo/);
      const button = page.locator('[data-ajuda="ajuda-carga-1"]');
      const panel = page.locator('#ajuda-carga-1');
      assert.equal(await panel.isVisible(), false);
      const checked = await detail.locator('[data-dominio="cargaConfirmada"]').isChecked();
      if (mobile) await button.tap();
      else await button.hover();
      assert.equal(await panel.isVisible(), true);
      assert.match(await panel.innerText(), /Marcado: preserva.*Desmarcado: estima/);
      assert.equal(await detail.locator('[data-dominio="cargaConfirmada"]').isChecked(), checked);
      const box = await panel.boundingBox();
      const size = page.viewportSize();
      assert.ok(box.x >= 0 && box.x + box.width <= size.width && box.y >= 0 && box.y + box.height <= size.height);
      if (mobile) {
        await button.tap();
        await panel.waitFor({ state: "hidden" });
        await button.tap();
        assert.equal(await panel.isVisible(), true);
        await page.locator('[data-field=nome]').tap();
      } else {
        await page.mouse.move(0,0);
      }
      await panel.waitFor({ state: "hidden" });
      await button.focus();
      assert.equal(await panel.isVisible(), true);
      await page.keyboard.press("Escape");
      await panel.waitFor({ state: "hidden" });
      // Real validation messages remain visible instead of becoming help text.
      await page.locator('[data-field="horasSemana"]').fill("45");
      await page.locator('[data-field="horasSemana"]').dispatchEvent("change");
      assert.match(await page.locator('[data-carga-alerta="1"]').innerText(), /acima de 44/);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  console.log("OK: observações removidas e ajuda por mouse, toque, teclado/Escape, limites da tela e validações visíveis.");
};
