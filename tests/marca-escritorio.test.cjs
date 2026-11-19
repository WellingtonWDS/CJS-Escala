const { test } = require("node:test");
const assert = require("node:assert/strict");
// PNG 1×1 transparente, válido para o jsPDF.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

test("tema do PDF mantém leitura com qualquer cor escolhida", async () => {
  const { temaPdf, contraste, caixaLogo } = await import("../assets/js/export/marca-pdf.js");
  const branco = [255, 255, 255];
  for (const cor of ["#ffffff", "#ffe600", "#7fd3ff", "#0b2545", "#c4122f", "#a0a0a0"]) {
    const t = temaPdf({ primaryColor: cor, secondaryColor: cor });
    assert(contraste(t.titulo, branco) >= 4.5, `título legível para ${cor}`);
    assert(contraste(t.cabecalhoTabela.text, t.cabecalhoTabela.fill) >= 4.5, `cabeçalho de tabela legível para ${cor}`);
    assert(contraste(t.textoFolga, t.folga) >= 4.5, `linha de folga legível para ${cor}`);
  }
  assert.deepEqual(temaPdf(null).primaria, [15, 40, 68]);
  assert.equal(temaPdf(null).personalizada, false);
  assert.deepEqual(caixaLogo(1200, 400), { w: 66, h: 22 });
  assert.deepEqual(caixaLogo(400, 400), { w: 22, h: 22 });
  assert.equal(Math.round(caixaLogo(3000, 300).w), 70);
});

test("API só aceita PNG normalizado, cores hexadecimais e tamanho limitado", async () => {
  const { marcaValida, MAX_LOGO_CHARS } = await import("../server/branding.js");
  const base = { officeId: "20000000-0000-0000-0000-000000000001", revision: 0, displayName: null, logo: PNG, logoWidth: 1, logoHeight: 1, primaryColor: "#112233", secondaryColor: "#445566" };
  assert.equal(marcaValida(base), true);
  assert.equal(marcaValida({ ...base, logo: null, logoWidth: null, logoHeight: null }), true);
  for (const ruim of [
    { logo: "data:image/svg+xml;base64,PHN2Zz4=" },
    { logo: "data:image/png;base64," + "A".repeat(MAX_LOGO_CHARS) },
    { logoWidth: 0 },
    { logo: null },
    { primaryColor: "red" },
    { secondaryColor: "#12345" },
    { displayName: "x".repeat(161) },
    { revision: -1 },
    { officeId: "x" },
  ])
    assert.equal(marcaValida({ ...base, ...ruim }), false, JSON.stringify(ruim).slice(0, 60));
});

test("API de marca: leitura, gravação, permissões no banco e ausência da migração", async () => {
  const { createBrandingHandler } = await import("../server/branding.js");
  const { issueSession } = await import("../server/auth.js");
  const now = Date.now(), env = { AUTH_MODE: "n8n", AUTH_SESSION_SECRET: "brand-unit-cookie-secret-long-enough-x", PERSISTENCE_RPC_URL: "https://rpc.example", PERSISTENCE_JWT_SECRET: "brand-unit-rpc-secret-long-enough-xxxx" };
  const token = await issueSession(env, now, { userId: "10000000-0000-0000-0000-000000000001", sessionId: "40000000-0000-0000-0000-000000000001", expiresAt: now + 3600000 });
  let resposta = () => Response.json({ revision: 1 });
  const chamadas = [];
  const h = createBrandingHandler({ env, now: () => now, fetchImpl: async (url, o) => { chamadas.push([url.split("/rpc/")[1], JSON.parse(o.body)]); return resposta(); } });
  const office = "20000000-0000-0000-0000-000000000001";
  const get = () => h(new Request(`https://app.example/api/branding?officeId=${office}`, { headers: { cookie: "cjs_session=" + token } }));
  const post = (b, extra = {}) => h(new Request("https://app.example/api/branding", { method: "POST", headers: { cookie: "cjs_session=" + token, origin: "https://app.example", "content-type": "application/json", ...extra }, body: JSON.stringify(b) }));
  assert.equal((await h(new Request(`https://app.example/api/branding?officeId=${office}`))).status, 401);
  assert.equal((await get()).status, 200);
  const marca = { officeId: office, revision: 1, displayName: "  Contábil  ", logo: PNG, logoWidth: 1, logoHeight: 1, primaryColor: "#112233", secondaryColor: "#445566" };
  assert.equal((await post(marca, { origin: "https://evil.example" })).status, 403);
  assert.equal((await post({ ...marca, primaryColor: "azul" })).status, 400);
  assert.equal((await post(marca)).status, 200);
  assert.deepEqual(chamadas.map((c) => c[0]), ["office_branding_get", "office_branding_save"]);
  assert.equal(chamadas[1][1].p_display_name, "Contábil");
  resposta = () => new Response(JSON.stringify({ code: "PT403" }), { status: 403, headers: { "Content-Type": "application/json" } });
  assert.match((await (await post(marca)).json()).error, /gerente/);
  resposta = () => new Response(JSON.stringify({ code: "PGRST202" }), { status: 404, headers: { "Content-Type": "application/json" } });
  const semMigracao = await (await get()).json();
  assert.equal(semMigracao.logo, null);
  assert.equal(semMigracao.canEdit, false);
});

test("PDF traz a marca do escritório no topo e o Reescala no rodapé", async () => {
  const { criarEstadoDemo } = await import("../database/demo/state.mjs");
  const { createDomain } = await import("../assets/js/domain/index.js");
  const { prepararRelatorio } = await import("../assets/js/export/relatorio.js");
  const { criarPdf } = await import("../assets/js/export/pdf.js");
  const libs = { ...(await import("jspdf")), ...(await import("jspdf-autotable")) };
  const s = criarEstadoDemo();
  s.escalaGerada = createDomain(s).gerarDadosEscala();
  const r = prepararRelatorio(s);
  const texto = (b) => Buffer.from(b).toString("latin1");
  const padrao = texto(await criarPdf(r, r.pessoas, { libs, logo: PNG, empregador: true }));
  assert.match(padrao, /Elaborado no Reescala/);
  const marca = { displayName: "Contabilidade Exemplo", logo: PNG, logoWidth: 1200, logoHeight: 400, primaryColor: "#c4122f", secondaryColor: "#ffe600", revision: 3 };
  const comMarca = texto(await criarPdf(r, r.pessoas, { libs, logo: PNG, marca, empregador: true }));
  assert.match(comMarca, /Contabilidade Exemplo \\225 Elaborado no Reescala|Contabilidade Exemplo • Elaborado no Reescala|Contabilidade Exemplo .{1,4} Elaborado no Reescala/);
  // Logomarca do escritório e do Reescala incorporadas como imagens distintas.
  assert((comMarca.match(/\/Subtype \/Image/g) || []).length >= 2);
  // Faixa do topo na cor principal (0.769 0.071 0.184 = #c4122f).
  assert.match(comMarca, /0\.769 0\.071 0\.184 rg/);
  const individual = texto(await criarPdf(r, [r.pessoas[0]], { libs, logo: PNG, marca: { displayName: "Só Nome Contábil", primaryColor: "#0b2545", secondaryColor: "#1f7a54", revision: 1 } }));
  assert.match(individual, /Só Nome Contábil|S\\363 Nome Cont\\341bil/);
});
