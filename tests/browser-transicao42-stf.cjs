const assert = require("node:assert/strict");
const { clicarCalculo } = require("./helpers/calculo.cjs");
const { irParaEtapa } = require("./helpers/etapas.cjs");
module.exports = async ({ browser, baseURL }) => {
  const context = await browser.newContext({ timezoneId: "America/Sao_Paulo" });
  try {
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install({ time: new Date("2026-10-30T12:00:00Z") });
    await page.route("https://**/*", (r) => r.abort());
    await page.goto(baseURL);
    const pronta = () =>
      page.waitForFunction(
        () => document.documentElement.dataset.ready === "true",
      );
    await pronta();
    for (const fixa of [false, true]) {
      await page.evaluate(async (fixa) => {
        const { createDefaultState } = await import(
          "/assets/js/state/store.js"
        );
        const s = createDefaultState(new Date(2026, 9, 30));
        s.colaboradores = [
          {
            id: 1,
            nome: "Pessoa teste",
            cargo: "Auxiliar",
            sexo: "masculino",
            horasSemana: 44,
          },
        ];
        s.proximoId = 2;
        s.jornada = {
          entrada: "08:00",
          intInicio: "11:00",
          intFim: "13:00",
          saida: "18:00",
        };
        s.horarioPorDia = true;
        s.jornadaPorDia[6] = {
          entrada: "08:00",
          intInicio: "",
          intFim: "",
          saida: "12:00",
        };
        s.instrumentoCompensacao = "nenhuma";
        if (fixa)
          Object.assign(s, {
            modeloEscala: "fixa",
            dataReferenciaFixa: "2027-02-08",
          });
        localStorage.setItem("fintria-escala-dp-v2", JSON.stringify(s));
      }, fixa);
      await page.reload();
      await pronta();
      await irParaEtapa(page, "#conversao-fase");
      if (!fixa) {
        for (const [periodo, disabled] of [
          ["2026-11", true],
          ["2026-12", false],
          ["2027-12", false],
          ["2028-01", true],
          ["2027-02", false],
        ]) {
          await page.locator("#conversao-periodo").fill(periodo);
          assert.equal(
            await page
              .locator('#conversao-fase option[value="transicao42"]')
              .isDisabled(),
            disabled,
            periodo,
          );
        }
      }
      if (fixa) {
        await irParaEtapa(page, "#cfg-referencia-fixa");
        await page.locator("#cfg-referencia-fixa").fill("2026-12-01");
        await irParaEtapa(page, "#conversao-fase");
        assert.equal(
          await page
            .locator('#conversao-fase option[value="transicao42"]')
            .isDisabled(),
          true,
        );
        assert.equal(
          await page.locator("#conversao-regra42").getAttribute("data-motivo"),
          "referencia_fora_transicao",
        );
        assert.match(
          await page.locator("#conversao-regra42").innerText(),
          /01\/12\/2026/,
        );
        assert.match(
          await page.locator("#conversao-regra42").innerText(),
          /16\/12\/2026/,
        );
        await irParaEtapa(page, "#cfg-referencia-fixa");
        await page.locator("#cfg-referencia-fixa").fill("2026-12-16");
        await irParaEtapa(page, "#conversao-fase");
        assert.match(
          await page.locator("#conversao-regra42").innerText(),
          /42h disponíveis sem ACT\/CCT/,
        );
      }
      assert.equal(
        await page
          .locator('#conversao-fase option[value="transicao42"]')
          .isDisabled(),
        false,
      );
      await page.locator("#conversao-fase").selectOption("transicao42");
      await page.locator("#conversao-folgas").selectOption("fim_semana");
      await clicarCalculo(page, "#btn-converter");
      await page.waitForFunction(
        () =>
          !!JSON.parse(localStorage.getItem("fintria-escala-dp-v2")).conversao,
      );
      const c = await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("fintria-escala-dp-v2")).conversao,
      );
      const config = c.proposta.config;
      assert.equal(config.instrumentoCompensacao, "nenhuma");
      const r = config.escalaGerada.resultado[0];
      const { diasDoModelo } = await import(
        "../assets/js/domain/modelo-escala.js"
      );
      const dias = fixa
        ? diasDoModelo(config, r.dias)
        : r.dias.filter(
            (d) => d.data >= "2027-02-08" && d.data <= "2027-02-14",
          );
      assert.equal(dias.filter((d) => d.status === "T").length, 5);
      assert(
        dias
          .filter((d) => d.status === "T")
          .every((d) => d.horas === 8.4 && d.intervaloMin === 96 && d.saidaMin === 1080),
      );
      assert(
        !config.escalaGerada.validacoes[0].issues.some(
          (i) => i.tipo === "JORNADA_DIARIA",
        ),
      );
      assert.match(
        await page.locator(".diagnostico-rateio").innerText(),
        /Rateio aplicado/,
      );
      assert.match(
        await page.locator(".diagnostico-rateio").innerText(),
        /08:24/,
      );
      assert.match(
        await page.locator(".diagnostico-rateio").innerText(),
        /16\/12\/2026–15\/12\/2027/,
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      "OK: transição STF — opção 42h sem ACT/CCT, fronteiras, rateio 08h24 no fixo e dinâmico",
    );
  } finally {
    await context.close();
  }
};
