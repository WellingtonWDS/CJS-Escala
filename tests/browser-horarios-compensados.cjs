const { clicarCalculo } = require("./helpers/calculo.cjs");
const assert = require("node:assert/strict");
const { irParaEtapa } = require("./helpers/etapas.cjs");
module.exports = async ({ browser, baseURL }) => {
  const context = await browser.newContext({ timezoneId: "America/Sao_Paulo" });
  try {
    await context.route("https://**/*", (r) => r.abort());
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install({ time: new Date("2026-10-22T12:00:00Z") });
    await page.goto(baseURL);
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    await page.evaluate(async () => {
      const { createDefaultState } = await import("/assets/js/state/store.js");
      const s = createDefaultState(new Date(2026, 9, 22));
      s.colaboradores = [
        {
          id: 1,
          nome: "Pessoa teste",
          sexo: "masculino",
          cargo: "Atendente",
          horasSemana: 44,
        },
      ];
      s.instrumentoCompensacao = "act_cct";
      Object.assign(s.instrumentoColetivo, {
        identificacao: "ACT teste",
        inicio: "2026-01-01",
        fim: "2029-12-31",
        compativelEC141: true,
        compensacaoDiaria: true,
        limiteDiario: 10,
      });
      localStorage.setItem("fintria-escala-dp-v2", JSON.stringify(s));
    });
    await page.reload();
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    const saved = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("fintria-escala-dp-v2")),
      );
    await page.locator('[data-horario-individual="1"]').click();
    const detail = page.locator('[data-perfil-dominio="1"]');
    assert.equal(await detail.evaluate((el) => el.open), true);
    const status = detail.locator('[data-dominio=status][data-dia="6"]');
    await status.selectOption("compensado");
    const hora = async (d, f, v) => {
      const el = detail.locator(
        `[data-dominio=horario][data-dia="${d}"][data-horario="${f}"]`,
      );
      await el.fill(v);
      await el.dispatchEvent("change");
    };
    for (let d = 1; d <= 5; d++) {
      await hora(d, "entrada", "07:00");
      await hora(d, "intInicio", "12:00");
      await hora(d, "intFim", "13:00");
      await hora(d, "saida", d === 5 ? "16:00" : "17:00");
    }
    await hora(6, "entrada", "08:00");
    await hora(6, "intInicio", "12:00");
    await hora(6, "intFim", "");
    await hora(6, "saida", "");
    assert.equal(
      (await saved()).colaboradores[0].quadroDominio.horasCalculadas,
      44,
    );
    assert.equal(
      await page.locator("[data-field=horasSemana]").getAttribute("max"),
      "44",
    );
    await irParaEtapa(page, "#btn-gerar");
    await clicarCalculo(page, "#btn-gerar");
    let s = await saved();
    assert.equal(
      s.escalaGerada.resultado[0].dias.find((d) => d.data === "2026-10-10")
        .sabadoCompensado,
      true,
    );
    await irParaEtapa(page, "#sec-config");
    await detail.evaluate((el) => (el.open = true));
    const carga = page.locator("[data-field=horasSemana]");
    await carga.fill("45");
    await carga.dispatchEvent("change");
    assert.match(
      await page.locator('[data-carga-alerta="1"]').textContent(),
      /acima de 44/,
    );
    await carga.fill("44");
    await carga.dispatchEvent("change");
    await detail.locator("[data-dominio=cargaConfirmada]").uncheck();
    await hora(5, "saida", "15:00");
    assert.equal((await saved()).colaboradores[0].horasSemana, 43);
    await carga.fill("44");
    await carga.dispatchEvent("change");
    assert.match(
      await detail.locator("[data-pendencias-dominio]").textContent(),
      /Carga incoerente/,
    );
    await irParaEtapa(page, "#btn-gerar");
    await clicarCalculo(page, "#btn-gerar");
    s = await saved();
    const sat = s.escalaGerada.resultado[0].dias.find(
      (d) => d.data === "2026-10-10",
    );
    assert.equal(sat.horas, 1);
    assert.equal(sat.reposicaoSabado, true);
    await page.reload();
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    assert.equal(
      (await saved()).colaboradores[0].quadroDominio.semana[6].status,
      "compensado",
    );
    assert.deepEqual(errors, []);
    console.log(
      "OK: horários individuais manuais, sábado compensado/reposição, meio período sem campos zerados, carga 44h, divergência, confirmação e restauração.",
    );
  } finally {
    await context.close();
  }
};
