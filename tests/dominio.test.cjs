const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
let X,
  ler,
  normalizar,
  analisar,
  preparar,
  atualizar,
  dias,
  horario,
  base,
  domain,
  converter,
  csv,
  apurar;
const fixture = (nome) =>
  new URL(`./fixtures/dominio/${nome}.xls`, `file://${__filename}`);
before(async () => {
  X = await import("@e965/xlsx");
  ({ lerArquivoDominio: ler, normalizarBiffDominio: normalizar } = await import(
    "../assets/js/import/arquivo-dominio.js"
  ));
  ({
    analisarQuadroDominio: analisar,
    prepararDominio: preparar,
    atualizarPerfilDominio: atualizar,
    interpretarDias: dias,
    interpretarHorario: horario,
  } = await import("../assets/js/import/dominio.js"));
  ({ createDefaultState: base } = await import("../assets/js/state/store.js"));
  ({ createDomain: domain } = await import("../assets/js/domain/index.js"));
  ({ converterEscala: converter } = await import(
    "../assets/js/domain/conversao.js"
  ));
  ({ gerarCsv: csv } = await import("../assets/js/export/csv.js"));
  ({ apurarSemana: apurar } = await import(
    "../assets/js/domain/resumo-semanal.js"
  ));
});
async function quadro(nome) {
  return analisar(
    await ler(await fs.readFile(fixture(nome)), X),
    nome + ".xls",
  );
}
async function estado(nome) {
  const s = base(new Date(2026, 9, 22));
  Object.assign(s, preparar(s, await quadro(nome), "substituir"));
  return s;
}
for (const [tipo, quantidade, ciclos] of [
  ["comercio", 7, 0],
  ["drogaria", 6, 0],
  ["misto", 17, 4],
])
  test(`lê layout ${tipo}: ${quantidade} colaboradores e ${ciclos} ciclos, sem presumir sexo ou contrato`, async () => {
    const q = await quadro(tipo);
    assert.equal(q.colaboradores.length, quantidade);
    assert.equal(
      q.colaboradores.filter((c) => c.quadroDominio.tipo === "ciclo").length,
      ciclos,
    );
    assert.ok(
      q.colaboradores.every(
        (c) =>
          c.sexo === "nao_informado" &&
          c.quadroDominio.cargaConfirmada === false,
      ),
    );
    assert.match(q.empresa.cnpj, /00\.000/);
    assert.ok(q.empresa.endereco);
    assert.ok(q.empresa.licenciadoPara);
    assert.equal(q.colaboradores[0].quadroDominio.codigo, "001");
    assert.equal(q.colaboradores[0].quadroDominio.admissaoIso, "2020-01-01");
  });
test("normaliza o preâmbulo BIFF defeituoso, mantendo arquivo original intacto", async () => {
  const bytes = new Uint8Array(await fs.readFile(fixture("drogaria"))),
    original = bytes.slice();
  const semReparo = X.read(bytes, { type: "array" });
  assert.ok(!semReparo.Sheets[semReparo.SheetNames[0]]?.["!ref"]);
  const fixed = normalizar(bytes, X),
    wb = X.read(fixed, { type: "array" });
  assert.ok(wb.Sheets[wb.SheetNames[0]]["!ref"]);
  assert.deepEqual(bytes, original);
  assert.deepEqual(normalizar(fixed, X), fixed);
});
test("preserva zeros à esquerda, admissão e linhas originais", async () => {
  const q = await quadro("drogaria"),
    p = q.colaboradores[0].quadroDominio;
  assert.equal(p.ctps, "00012345");
  assert.equal(p.serie, "0001");
  assert.equal(p.linhasOriginais[0].entrada, "08:00");
  assert.equal(p.linhasOriginais[0].saida, "18:00");
  assert.ok(p.linhasOriginais[0].celulas.length > 20);
});
test("faixas semanais, travessia de domingo e ciclos são interpretados sem usar nomes das pessoas", () => {
  assert.deepEqual(dias("Segunda à sexta"), { dias: [1, 2, 3, 4, 5] });
  assert.deepEqual(dias("Sexta a domingo"), { dias: [5, 6, 0] });
  assert.deepEqual(dias("Quinta até segunda"), { dias: [4, 5, 6, 0, 1] });
  assert.deepEqual(dias("1º Dia"), { ciclo: 1 });
  assert.equal(dias("Não é um dia"), null);
});
test("00:00–00:00 sem indicação é pendência; folga explícita é respeitada", () => {
  assert.equal(horario("00:00", "", "00:00", "").status, "nao_informado");
  assert.equal(horario("00:00", "", "00:00", "Folga").status, "folga");
  assert.equal(horario("08:00", "", "18:00", "").horas, 10);
  assert.equal(horario("19:00", "22:00 as 23:00", "06:00", "").horas, 10);
});
test("não inventa pausa nem altera 54h programadas para 44h contratuais", async () => {
  const s = await estado("drogaria"),
    c = s.colaboradores[0];
  assert.equal(c.horasSemana, 54);
  c.horasSemana = 44;
  c.quadroDominio.cargaConfirmada = true;
  atualizar(c);
  const escala = domain(s).gerarDadosEscala(),
    r = escala.resultado[0];
  assert.equal(r.dias.find((d) => d.data === "2026-10-19").horas, 10);
  assert.equal(r.dias.find((d) => d.data === "2026-10-24").horas, 4);
  assert.ok(escala.validacoes[0].issues.some((i) => i.tipo === "INTRAJORNADA"));
  assert.ok(
    escala.validacoes[0].issues.some((i) => i.tipo === "JORNADA_CONTRATUAL"),
  );
});
test("horários diferentes no sábado e intervalos permanecem por pessoa", async () => {
  const s = await estado("drogaria"),
    e = domain(s).gerarDadosEscala();
  const dia = (i, date) => e.resultado[i].dias.find((d) => d.data === date);
  assert.deepEqual(
    [dia(0, "2026-10-24").entradaMin, dia(0, "2026-10-24").saidaMin],
    [480, 720],
  );
  assert.deepEqual(
    [dia(1, "2026-10-24").entradaMin, dia(1, "2026-10-24").saidaMin],
    [720, 960],
  );
  assert.equal(dia(0, "2026-10-19").intervaloMin, 0);
  assert.equal(dia(1, "2026-10-19").intervaloMin, 120);
});
test("cobertura usa intervalos individuais em vez do horário padrão global", async () => {
  const s = await estado("drogaria");
  s.coberturaAtiva = true;
  s.demandasCobertura = [
    {
      id: 1,
      funcao: "BALCONISTA",
      inicio: "12:00",
      fim: "12:30",
      minimo: 3,
      diasSemana: [1],
      incluirFeriados: false,
    },
  ];
  const e = domain(s).gerarDadosEscala(),
    l = e.coberturaOperacional.lacunas.find((l) => l.data === "2026-10-19");
  assert.equal(l.presentes, 2);
  assert.equal(l.faltantes, 1);
});
test("dias da semana ausentes são folga automaticamente, sem confundir horários zerados", async () => {
  const q = await quadro("comercio"),
    s = base(new Date(2026, 9, 22));
  assert.equal(q.colaboradores[0].quadroDominio.semana[0].status, "folga");
  const b = preparar(s, q, "substituir");
  assert.equal(b.colaboradores[0].quadroDominio.semana[0].status, "folga");
  assert.equal(b.colaboradores[0].horasSemana, 44);
  assert.equal(b.colaboradores[1].horasSemana, null);
  assert.equal(
    b.colaboradores[1].quadroDominio.semana[1].status,
    "nao_informado",
  );
  Object.assign(s, b);
  assert.throws(() => domain(s).gerarDadosEscala(), /revise/);
});

test("intervalo fora da jornada permanece como pendência, preservando o original", async () => {
  const s = await estado("misto"),
    c = s.colaboradores[6],
    p = c.quadroDominio;
  assert.equal(p.semana[2].status, "nao_informado");
  assert.equal(c.horasSemana, null);
  assert.ok(p.linhasOriginais.some((l) => l.intervalo === "11:00 as 12:30"));
  p.semana[2] = {
    status: "trabalho",
    jornada: {
      entrada: "14:00",
      intInicio: "16:00",
      intFim: "16:30",
      saida: "18:00",
    },
  };
  p.semana[4] = structuredClone(p.semana[2]);
  atualizar(c);
  assert.equal(c.horasSemana, 19);
  assert.ok(p.linhasOriginais.some((l) => l.intervalo === "11:00 as 12:30"));
});
test("ciclos não presumem âncora ou grupo por posição do funcionário", async () => {
  const s = await estado("misto");
  s.colaboradores = [s.colaboradores[0], s.colaboradores[12]];
  assert.throws(() => domain(s).gerarDadosEscala(), /1º dia/);
  s.colaboradores[0].quadroDominio.ancora = "2026-10-01";
  s.colaboradores[1].quadroDominio.ancora = "2026-10-02";
  s.colaboradores.forEach(atualizar);
  const e = domain(s).gerarDadosEscala();
  const dia = (i, data) => e.resultado[i].dias.find((d) => d.data === data);
  assert.equal(dia(0, "2026-10-01").status, "T");
  assert.equal(dia(1, "2026-10-01").status, "F");
  assert.equal(dia(1, "2026-10-02").status, "T");
  assert.equal(dia(0, "2026-10-01").saidaMin, 1800);
  assert.equal(dia(0, "2026-10-01").horas, 10);
});
test("plantão explícito de 12h com segundo dia livre reconhece 12x36 sem afetar demais jornadas", async () => {
  const s = await estado("misto"),
    c = s.colaboradores[7];
  c.quadroDominio.ancora = "2026-10-01";
  atualizar(c);
  s.colaboradores = [c];
  const e = domain(s).gerarDadosEscala(),
    d = e.resultado[0].dias.find((d) => d.data === "2026-10-01");
  assert.equal(d.entradaMin, 420);
  assert.equal(d.saidaMin, 1140);
  assert.equal(d.horas, 11);
  assert.ok(!e.validacoes[0].issues.some((i) => i.tipo === "JORNADA_DIARIA"));
  assert.ok(e.validacoes[0].issues.some((i) => i.tipo === "12X36"));
});
test("admissão impede trabalho anterior e não conta como folga", async () => {
  const s = await estado("drogaria");
  s.colaboradores = [s.colaboradores[1]];
  const c = s.colaboradores[0];
  c.quadroDominio.admissaoIso = "2026-10-21";
  atualizar(c);
  const r = domain(s).gerarDadosEscala().resultado[0];
  assert.ok(
    r.dias
      .filter((d) => d.data < "2026-10-21")
      .every((d) => d.status === "NC" && d.horas === 0),
  );
  const semana = r.dias.filter(
    (d) => d.data >= "2026-10-19" && d.data <= "2026-10-25",
  );
  assert.equal(apurar(c, semana, s).estado, "parcial");
});
test("conversão 6x1 usa disponibilidades individuais e não declara suficiência com dados pendentes", async () => {
  const s = await estado("drogaria");
  s.coberturaAtiva = true;
  s.demandasCobertura = [
    {
      id: 1,
      funcao: "BALCONISTA",
      inicio: "09:00",
      fim: "10:00",
      minimo: 1,
      diasSemana: [1, 2, 3, 4, 5],
      incluirFeriados: false,
    },
  ];
  const c = converter(s, {
    periodo: "2028-02",
    fase: "automatico",
    folgas: "distribuir",
  });
  assert.notEqual(c.comparacao.status, "suficiente");
  for (const r of c.proposta.config.escalaGerada.resultado)
    assert.ok(
      r.dias
        .filter((d) => d.weekday === 6 && d.horas > 0)
        .every(
          (d) =>
            d.saidaMin <=
            (r.colaborador.quadroDominio.codigo === "002" ? 960 : 720),
        ),
    );
});
test("regimes mistos não são convertidos silenciosamente em 6x1", async () => {
  const s = await estado("misto");
  assert.equal(s.tipoEscala, "custom");
  s.colaboradores = s.colaboradores.filter(
    (c) => c.quadroDominio.tipo === "ciclo",
  );
  s.colaboradores.forEach((c) => {
    c.quadroDominio.ancora = "2026-10-01";
    atualizar(c);
  });
  assert.throws(
    () =>
      converter(s, {
        periodo: "2028-02",
        fase: "automatico",
        folgas: "distribuir",
      }),
    /ciclos diferentes/,
  );
});
test("preparação é atômica, evita duplicatas e separa configurações de empresas", async () => {
  const s = await estado("drogaria"),
    q = await quadro("comercio"),
    original = structuredClone(s);
  s.coberturaAtiva = true;
  s.demandasCobertura = [{ id: 1 }];
  s.instrumentoCompensacao = "act_cct";
  s.feriadosLocais = [{ nome: "Local anterior" }];
  const before = structuredClone(s);
  assert.throws(() => preparar(s, q, "adicionar"), /outra empresa/);
  const next = preparar(s, q, "substituir");
  assert.deepEqual(s, before);
  assert.equal(next.coberturaAtiva, false);
  assert.deepEqual(next.demandasCobertura, []);
  assert.equal(next.instrumentoCompensacao, "nenhuma");
  assert.deepEqual(next.feriadosLocais, []);
  assert.ok(next.proximoId > original.proximoId);
  const same = await quadro("drogaria");
  assert.throws(() => preparar(s, same, "adicionar"), /códigos/);
});
test("CSV inclui empresa e identificação da Domínio sem perder zeros à esquerda", async () => {
  const s = await estado("drogaria");
  s.escalaGerada = domain(s).gerarDadosEscala();
  const out = csv(s);
  assert.match(out, /EMPRESA EXEMPLO DROGARIA/);
  assert.match(out, /Código Domínio;Admissão;CTPS;Série/);
  assert.match(out, /001;2020-01-01;00012345;0001/);
});
test("XLSX do mesmo layout é aceito; fórmulas e planilhas não relacionadas são rejeitadas", async () => {
  const abas = await ler(await fs.readFile(fixture("drogaria")), X),
    wb = X.utils.book_new();
  X.utils.book_append_sheet(
    wb,
    X.utils.aoa_to_sheet(abas[0].linhas),
    "Relatório",
  );
  const bytes = new Uint8Array(
    X.write(wb, { type: "array", bookType: "xlsx" }),
  );
  assert.equal(analisar(await ler(bytes, X)).colaboradores.length, 6);
  wb.Sheets.Relatório.A1 = {
    t: "s",
    v: "teste",
    f: 'HYPERLINK("https://exemplo.invalid")',
  };
  await assert.rejects(
    () =>
      ler(new Uint8Array(X.write(wb, { type: "array", bookType: "xlsx" })), X),
    /fórmulas/,
  );
  assert.throws(
    () =>
      analisar([
        {
          nome: "Outro",
          linhas: [
            ["Nome", "Cargo"],
            ["Pessoa", "Caixa"],
          ],
        },
      ]),
    /Não foi identificado/,
  );
  await assert.rejects(
    () => ler(new Uint8Array(5 * 1024 * 1024 + 1), X),
    /5 MB/,
  );
});
test("exportação protege texto literal que começa como fórmula de planilha", async () => {
  const { csvCell } = await import("../assets/js/shared/formatacao.js");
  assert.equal(csvCell("=1+1"), "'=1+1");
  assert.equal(csvCell(" @SUM(A1)"), "' @SUM(A1)");
  assert.equal(csvCell(-2), "-2");
});
