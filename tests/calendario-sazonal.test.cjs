const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let calendario, tema, pascoa, icone;
before(async () => {
  ({
    calendarioSazonal: calendario,
    temaSazonal: tema,
    pascoa,
  } = await import("../assets/js/config/calendario-sazonal.js"));
  ({ iconeSazonal: icone } = await import("../assets/js/seasonal.js"));
});
const aoMeioDia = (data) => new Date(`${data}T15:00:00Z`);
test("troca Natal/Ano Novo exatamente na virada do dia 26 em São Paulo", () => {
  assert.equal(tema(aoMeioDia("2026-11-13")).id, "natal");
  assert.equal(tema(new Date("2026-12-26T02:59:59.999Z")).id, "natal");
  assert.equal(tema(new Date("2026-12-26T03:00:00Z")).id, "ano-novo");
  assert.equal(tema(aoMeioDia("2027-01-01")).id, "ano-novo");
  assert.equal(tema(aoMeioDia("2027-01-06")).id, "ano-novo");
  assert.equal(tema(aoMeioDia("2027-01-07")), null);
  assert.equal(tema(aoMeioDia("2030-12-26")).mensagem, "Feliz Ano Novo!");
});
test("Páscoa gregoriana e Carnaval mudam de ano para ano sem datas fixadas manualmente", () => {
  for (const [ano, domingo, terca] of [
    [2026, "2026-04-05", "2026-02-17"],
    [2027, "2027-03-28", "2027-02-09"],
    [2028, "2028-04-16", "2028-02-29"],
    [2038, "2038-04-25", "2038-03-09"],
  ]) {
    assert.equal(pascoa(ano).toISOString().slice(0, 10), domingo);
    assert.equal(tema(aoMeioDia(domingo)).id, "pascoa");
    assert.equal(tema(aoMeioDia(terca)).id, "carnaval");
  }
});
test("Dia das Mães e dos Pais seguem o segundo domingo e suas vésperas", () => {
  for (const [data, id] of [
    ["2026-05-10", "maes"],
    ["2027-05-09", "maes"],
    ["2026-08-09", "pais"],
    ["2027-08-08", "pais"],
  ]) {
    assert.equal(tema(aoMeioDia(data)).id, id);
    const anterior = new Date(`${data}T15:00:00Z`);
    anterior.setUTCDate(anterior.getUTCDate() - 5);
    assert.equal(tema(anterior).id, id);
  }
});
test("datas específicas prevalecem sobre temporadas longas e depois devolvem o tema anterior", () => {
  for (const [data, id] of [
    ["2027-06-07", "juninas"],
    ["2027-06-08", "namorados"],
    ["2027-06-12", "namorados"],
    ["2027-06-13", "juninas"],
    ["2026-11-14", "natal"],
    ["2026-11-15", "republica"],
    ["2026-11-16", "natal"],
    ["2026-11-20", "consciencia-negra"],
    ["2026-11-21", "natal"],
    ["2038-03-08", "mulheres"],
  ])
    assert.equal(tema(aoMeioDia(data)).id, id, data);
});
test("calendário cobre as demais festividades e possui ícones locais para todos os temas", () => {
  for (const [data, id] of [
    ["2027-04-21", "tiradentes"],
    ["2027-04-25", "contabilidade"],
    ["2027-05-01", "trabalho"],
    ["2027-07-20", "amizade"],
    ["2027-09-07", "independencia"],
    ["2027-09-22", "contador"],
    ["2027-09-25", "primavera"],
    ["2027-10-12", "criancas"],
    ["2027-10-31", "halloween"],
  ])
    assert.equal(tema(aoMeioDia(data)).id, id, data);
  for (const item of calendario(2027)) {
    assert(item.inicio <= item.fim);
    const svg = icone(item);
    assert.match(svg, /^<svg/);
    assert(!/https?:|<script|onload=|href=/.test(svg));
  }
  assert.match(icone(tema(aoMeioDia("2026-12-26"))), /seasonal-burst/);
  assert.match(icone(tema(aoMeioDia("2027-02-09"))), /seasonal-confetti/);
});
test("datas inválidas são rejeitadas e catálogo retorna novos objetos independentes", () => {
  assert.throws(() => tema(new Date("invalid")), TypeError);
  assert.throws(() => pascoa(1500), RangeError);
  const c = calendario(2027);
  c[0].mensagem = "alterado";
  assert.equal(calendario(2027)[0].mensagem, "Feliz Ano Novo!");
});
test("login libera somente os dois novos módulos públicos, mantendo os demais arquivos protegidos", async () => {
  const { publicPath } = await import("../server/auth.js");
  assert(publicPath("/assets/js/seasonal.js"));
  assert(publicPath("/assets/js/config/calendario-sazonal.js"));
  assert(!publicPath("/assets/js/config/regras-jornada.js"));
  assert(!publicPath("/assets/js/seasonal.js/qualquer"));
});
test("datas móveis permanecem válidas, sem deslocamento por fuso, de 1900 a 2100", () => {
  for (let ano = 1900; ano <= 2100; ano++) {
    const p = pascoa(ano),
      catalogo = calendario(ano);
    assert.equal(p.getUTCDay(), 0);
    assert(p.getUTCMonth() === 2 || p.getUTCMonth() === 3);
    const fimCarnaval = new Date(
      catalogo.find((t) => t.id === "carnaval").fim + "T00:00:00Z",
    );
    assert.equal(fimCarnaval.getUTCDay(), 3);
    for (const id of ["maes", "pais"]) {
      const ultimo = new Date(
        catalogo.find((t) => t.id === id).fim + "T00:00:00Z",
      );
      assert.equal(ultimo.getUTCDay(), 0);
      assert(ultimo.getUTCDate() >= 8 && ultimo.getUTCDate() <= 14);
    }
  }
});
