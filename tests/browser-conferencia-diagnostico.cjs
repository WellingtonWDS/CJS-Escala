const assert = require("node:assert/strict");
const { clicarCalculo } = require("./helpers/calculo.cjs");
module.exports = async ({ browser, baseURL }) => {
  const { criarEstadoDemo } = await import("../database/demo/state.mjs");
  const ctx = await browser.newContext({ timezoneId: "America/Sao_Paulo" });
  try {
    const page = await ctx.newPage(), errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(baseURL);
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
    await page.evaluate((s) => localStorage.setItem("fintria-escala-dp-v2", JSON.stringify(s)), criarEstadoDemo());
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
    await page.locator('[data-etapa-link="sec-gerar"]').click();
    await clicarCalculo(page, "#btn-converter");
    const painel = page.locator("[data-diag-conferencia]");
    // Sem empresa do servidor aberta, o painel orienta a abrir pela tela Empresas.
    await painel.locator("summary").click();
    await page.waitForFunction(() => /Abra a empresa/.test(document.querySelector("[data-diag-conferencia-conteudo]").textContent));
    await painel.locator("summary").click();
    // Com empresa aberta: dois diagnósticos; o concluído é escolhido primeiro.
    await page.evaluate(async () => {
      const { bindConferenciaDiagnostico } = await import("/assets/js/ui/conferencia-diagnostico.js");
      const state = JSON.parse(localStorage.getItem("fintria-escala-dp-v2"));
      const A = (value, certainty = "confirmada") => ({ value, certainty, note: "" });
      const uteis = [1, 2, 3, 4, 5];
      const registros = {
        d1: { id: "d1", unit: "Loja Centro", status: "concluido", revision: 3, updatedAt: "2026-11-20T12:00:00Z", data: { schemaVersion: 1, answers: {
          q05: A([...uteis.map((dia) => ({ dia, inicio: "08:00", fim: "18:00" })), { dia: 6, inicio: "08:00", fim: "12:00" }]),
          q11: A([{ funcao: "Atendente", minimo: 1, diasSemana: uteis, inicio: "09:00", fim: "11:00" }, { funcao: "Supervisor", minimo: 1, diasSemana: uteis, inicio: "14:00", fim: "17:00" }]),
          q27: A(["Nenhuma alteração"]), q28: A([{ descricao: "Supervisor presente na abertura", natureza: "obrigatoria" }]) } } },
        d2: { id: "d2", unit: "Loja Bairro", status: "rascunho", revision: 1, updatedAt: "2026-11-21T12:00:00Z", data: { schemaVersion: 1, answers: {
          q11: A([{ funcao: "Gerente", minimo: 1, diasSemana: [6], inicio: "08:00", fim: "12:00" }], "pendente") } } },
      };
      const service = {
        list: async () => [registros.d2, registros.d1].map(({ data, ...r }) => r),
        get: async ({ id }) => registros[id],
      };
      bindConferenciaDiagnostico(state, { document, contextoServidor: () => ({ officeId: "o", companyId: "c" }) }, service);
    });
    await painel.locator("summary").click();
    await page.waitForFunction(() => /Loja Centro/.test(document.querySelector("[data-conf-resultado]")?.textContent || ""));
    const texto = await page.locator("[data-conf-resultado]").innerText();
    assert.match(texto, /concluído · revisão 3/);
    assert.match(texto, /Mínimo por função/);
    assert.match(texto, /sem aceite|alterações/);
    assert.match(texto, /Supervisor presente na abertura/);
    assert.equal(await page.locator('.conf-lista li[data-nivel="divergencia"]').count() > 0, true);
    // Trocar para o rascunho: aviso de rascunho/pendência e função ausente.
    await page.locator("[data-conf-escolha]").selectOption("d2");
    await page.waitForFunction(() => /Loja Bairro/.test(document.querySelector("[data-conf-resultado]").textContent));
    const rascunho = await page.locator("[data-conf-resultado]").innerText();
    assert.match(rascunho, /rascunho; 1 resposta\(s\) pendentes/);
    assert.match(rascunho, /Gerente: o diagnóstico exige essa função/);
    assert.match(rascunho, /resposta: pendente de conferência/);
    assert.deepEqual(errors, []);
    console.log("OK: conferência da proposta com o diagnóstico da empresa (sem empresa aberta, escolha do diagnóstico, divergências e pendências)");
  } finally {
    await ctx.close();
  }
};
