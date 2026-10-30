const assert = require("node:assert/strict");
const { clicarCalculo } = require("./helpers/calculo.cjs");
const { irParaEtapa } = require("./helpers/etapas.cjs");

module.exports = async ({ browser, baseURL }) => {
  const context = await browser.newContext({ timezoneId: "America/Sao_Paulo" });
  try {
    const page = await context.newPage(), errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install({ time: new Date("2026-10-30T12:00:00Z") });
    await page.route("https://**/*", (r) => r.abort());
    await page.goto(baseURL);
    const pronta = () => page.waitForFunction(() => document.documentElement.dataset.ready === "true");
    await pronta();
    async function simular(pausa, fase) {
      await page.evaluate(async ({ pausa }) => {
        const { createDefaultState } = await import("/assets/js/state/store.js");
        const s = createDefaultState(new Date(2026, 9, 30));
        s.colaboradores = [{ id: 1, nome: "Pessoa de teste", cargo: "Auxiliar", sexo: "masculino", horasSemana: 44 }];
        s.proximoId = 2;
        s.jornada = { entrada: "08:00", intInicio: "11:00", intFim: pausa === 60 ? "12:00" : "13:00", saida: "18:00" };
        s.horarioPorDia = true;
        s.jornadaPorDia[6] = { entrada: "08:00", intInicio: "", intFim: "", saida: "12:00" };
        s.instrumentoCompensacao = "act_cct";
        Object.assign(s.instrumentoColetivo, { identificacao: "CCT de teste", inicio: "2026-01-01", fim: "2029-12-31", compativelEC141: true, compensacaoDiaria: true, limiteDiario: 10 });
        localStorage.setItem("fintria-escala-dp-v2", JSON.stringify(s));
      }, { pausa });
      await page.reload(); await pronta();
      await irParaEtapa(page, "#conversao-periodo");
      await page.locator("#conversao-periodo").fill("2027-02");
      await page.locator("#conversao-fase").selectOption(fase);
      await page.locator("#conversao-folgas").selectOption("fim_semana");
      await clicarCalculo(page, "#btn-converter");
      await page.waitForFunction(() => !!JSON.parse(localStorage.getItem("fintria-escala-dp-v2")).conversao);
      return page.evaluate(() => JSON.parse(localStorage.getItem("fintria-escala-dp-v2")).conversao);
    }
    // A janela com 1h de pausa comporta 08h24 efetivas sem estender a saída.
    let c = await simular(60, "transicao42");
    const dias = c.proposta.config.escalaGerada.resultado[0].dias.filter(d => d.data >= "2027-02-08" && d.data <= "2027-02-12");
    assert.equal(dias.length, 5);
    assert(dias.every(d => Math.round(d.horas * 60) === 504));
    assert.match(await page.locator("#resultado-proposta").innerText(), /08:24/);
    assert.match(await page.locator(".diagnostico-rateio").innerText(), /Rateio aplicado/);
    assert.match(await page.locator(".diagnostico-rateio").innerText(), /08:24/);
    assert(await page.locator("#conversao-visao-geral").evaluate(el => !!(el.compareDocumentPosition(document.querySelector("#resultado-proposta")) & Node.DOCUMENT_POSITION_FOLLOWING)));
    // A atual de44h é preservada como referência:40h não mantêm a mesma presença.
    c = await simular(120, "definitivo40");
    assert.equal(c.comparacao.baseCobertura, "escala_atual");
    assert.equal(c.comparacao.status, "insuficiente");
    const executivo = page.locator("#conversao-visao-geral");
    assert.match(await executivo.innerText(), /manter a presença atual.*reforçar a equipe/s);
    assert.match(await executivo.innerText(), /Não é uma demanda operacional confirmada/);
    const diagnostico = page.locator("#conversao-comparacao [data-diagnostico-equipe]");
    assert.match(await diagnostico.innerText(), /necessidade de reforço é condicional/);
    assert.equal(await diagnostico.getAttribute("data-status"), "capacidade_insuficiente");
    const faixas = diagnostico.locator("[data-diagnostico-faixa]");
    assert(await faixas.count());
    await faixas.first().locator("summary").click();
    assert.match(await faixas.first().innerText(), /\d{2}\/02\/2027/);
    const capacidade = page.locator("#conversao-comparacao > section > details").filter({ has: page.locator('summary', { hasText: "Capacidade por função" }) });
    await capacidade.locator("summary").click();
    assert.match(await capacidade.locator("tbody").innerText(), /Auxiliar/);
    const lacunas = page.locator("#conversao-comparacao > section > details").filter({ has: page.locator('summary', { hasText: "Horários descobertos" }) });
    await lacunas.locator("summary").click();
    assert.match(await lacunas.locator("tbody").innerText(), /\d{2}\/02\/2027/);
    // A mesma janela com2h de pausa não comporta42h: não inventar minutos.
    c = await simular(120, "transicao42");
    const rateio = await page.locator(".diagnostico-rateio").innerText();
    assert.match(rateio, /Rateio a revisar/);
    assert.match(rateio, /Faltam 02:00 na semana/);
    assert.match(rateio, /00:24 adicionais por dia/);
    assert(c.proposta.config.escalaGerada.resultado[0].dias.every(d => !["T", "FE"].includes(d.status) || (d.saidaMin <= 1080 && d.intervaloMin === 120)));
    await page.setViewportSize({ width: 390, height: 844 });
    for (const selector of ["#conversao-visao-geral", ".diagnostico-rateio", "#conversao-comparacao [data-diagnostico-equipe]"]) {
      assert(await page.locator(selector).evaluate(el => {
        const box = el.getBoundingClientRect();
        return box.left >= 0 && box.right <= innerWidth + 1 && el.scrollWidth <= el.clientWidth + 1;
      }), `Resumo sem transbordamento móvel: ${selector}`);
    }
    assert.deepEqual(errors, []);
    console.log("OK: diagnóstico5x2 — rateio08h24 real, reforço condicional sem cobertura, datas/tabelas, janela limitada e resumo móvel");
  } finally { await context.close(); }
};
