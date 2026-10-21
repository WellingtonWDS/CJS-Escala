const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let analisar, modelo, preparar, decodificar;
before(async () => {
  const mod = await import("../assets/js/import/colaboradores.js");
  analisar = mod.analisarPlanilhaColaboradores;
  modelo = mod.gerarModeloColaboradores;
  preparar = mod.prepararImportacao;
  decodificar = mod.decodificarPlanilha;
});
const cab = "Nome;Sexo;Cargo / função;Horas semanais\r\n";
test("modelo CSV contém BOM e cabeçalho, sem importar pessoas de exemplo", () => {
  assert.ok(modelo().startsWith("\uFEFF"));
  const result = analisar(modelo());
  assert.equal(result.colaboradores.length, 0);
  assert.match(result.erros[0], /pelo menos um/);
});
test("CSV do Excel com acentos, aspas, ponto e vírgula e decimais brasileiros", () => {
  const result = analisar(
    "\uFEFF" +
      cab +
      '"Pessoa; \"\"Teste\"\"";F;Recepção;"42,5"\r\nPessoa 2;Masculino;Padeiro;40\r\n;;;\r\n',
  );
  assert.deepEqual(result.erros, []);
  assert.deepEqual(result.colaboradores, [
    {
      nome: 'Pessoa; "Teste"',
      sexo: "feminino",
      cargo: "Recepção",
      horasSemana: 42.5,
    },
    { nome: "Pessoa 2", sexo: "masculino", cargo: "Padeiro", horasSemana: 40 },
  ]);
});
test("colunas reordenadas, CSV separado por vírgulas e decimal entre aspas", () => {
  const result = analisar(
    'Horas semanais,Função,Sexo,Nome\n"36,5",Atendente,M,Pessoa\n',
  );
  assert.deepEqual(result.erros, []);
  assert.equal(result.colaboradores[0].horasSemana, 36.5);
});
test("diretiva sep do Excel, tabulação, linhas vazias e CR", () => {
  const result = analisar(
    "sep=\t\r\nNome\tSexo\tCargo\tHoras semanais\r\n\r\nPessoa\tfeminino\tAtendente\t30\r",
  );
  assert.deepEqual(result.erros, []);
  assert.equal(result.colaboradores.length, 1);
});
test("texto entre aspas com quebra de linha é normalizado e erros apontam linha física", () => {
  const result = analisar(
    cab + '"Pessoa\nTeste";F;Atendente;40\nPessoa 2;M;Atendente;abc\n',
  );
  assert.deepEqual(result.colaboradores, []);
  assert.match(result.erros[0], /Linha 4: Horas semanais/);
});
for (const [name, csv, error] of [
  ["nome vazio", cab + ";F;Caixa;40", /Linha 2: Nome/],
  ["função vazia", cab + "Pessoa;F;;40", /Cargo/],
  ["sexo inválido", cab + "Pessoa;Outro;Caixa;40", /Sexo/],
  ["coluna ausente", cab + "Pessoa;F;Caixa", /quatro colunas/],
  ["coluna excedente", cab + "Pessoa;F;Caixa;40;extra", /quatro colunas/],
  [
    "cabeçalho duplicado",
    "Nome;Sexo;Nome;Horas semanais\nPessoa;F;Caixa;40",
    /Cabeçalho/,
  ],
  [
    "cabeçalho desconhecido",
    "Nome;Sexo;Salário;Horas semanais\nPessoa;F;Caixa;40",
    /Cabeçalho/,
  ],
  [
    "cabeçalho herdado",
    "Nome;Sexo;constructor;Horas semanais\nPessoa;F;Caixa;40",
    /Cabeçalho/,
  ],
  ["sexo herdado", cab + "Pessoa;constructor;Caixa;40", /Sexo/],
  ["aspas abertas", cab + '"Pessoa;F;Caixa;40', /aspas não fechadas/],
  ["texto após aspas", cab + '"Pessoa"X;F;Caixa;40', /aspas inválidas/],
  ["nome muito longo", cab + "A".repeat(121) + ";F;Caixa;40", /120 caracteres/],
])
  test(`rejeita ${name} sem importar parte do arquivo`, () => {
    const result = analisar(csv);
    assert.equal(result.colaboradores.length, 0);
    assert.ok(result.erros.some((message) => error.test(message)));
  });
for (const hours of [
  "",
  "0",
  "-1",
  "60.5",
  "40.25",
  "NaN",
  "Infinity",
  "40h",
  "1e1",
  "40:00",
]) {
  test(`rejeita carga semanal inválida ${JSON.stringify(hours)}`, () =>
    assert.match(
      analisar(cab + `Pessoa;M;Caixa;${hours}`).erros[0],
      /Horas semanais/,
    ));
}
test("500 pessoas aceitas; 501 e arquivo acima de 1MB são rejeitados", () => {
  const line = "Pessoa;M;Caixa;40\n";
  assert.equal(analisar(cab + line.repeat(500)).colaboradores.length, 500);
  assert.match(analisar(cab + line.repeat(501)).erros[0], /500/);
  assert.match(analisar("x".repeat(1024 * 1024 + 1)).erros[0], /1 MB/);
});
test("decodifica UTF-8, UTF-16 e Windows-1252 com acentos", () => {
  const utf8 = new TextEncoder().encode(cab + "João;M;Recepção;40");
  assert.equal(analisar(decodificar(utf8)).colaboradores[0].nome, "João");
  const cp = Uint8Array.from(
    Buffer.from(
      "Nome;Sexo;Cargo;Horas semanais\nJo\xe3o;M;Recep\xe7\xe3o;40",
      "latin1",
    ),
  );
  assert.equal(analisar(decodificar(cp)).colaboradores[0].cargo, "Recepção");
  const utf16 = Buffer.concat([
    Buffer.from([255, 254]),
    Buffer.from(cab + "João;M;Caixa;40", "utf16le"),
  ]);
  assert.equal(analisar(decodificar(utf16)).colaboradores[0].nome, "João");
});
test("adicionar preserva registros e enquadramento, sem modificar o estado na prévia", () => {
  const state = {
    colaboradores: [{ id: 8, nome: "Atual", ec141: { salarioAtual: 4000 } }],
    proximoId: 2,
  };
  const original = structuredClone(state);
  const persons = analisar(cab + "Pessoa;M;Caixa;40").colaboradores;
  const next = preparar(state, persons, "adicionar");
  assert.deepEqual(state, original);
  assert.equal(next.colaboradores[0], state.colaboradores[0]);
  assert.equal(next.colaboradores[1].id, 9);
  assert.equal(next.proximoId, 10);
  assert.equal(persons[0].id, undefined);
});
test("substituir só troca colaboradores e mantém IDs exclusivos", () => {
  const state = {
    colaboradores: [{ id: 8, nome: "Atual" }],
    proximoId: 12,
    mes: 9,
  };
  const persons = analisar(cab + "Pessoa;M;Caixa;40").colaboradores;
  const next = preparar(state, persons, "substituir");
  assert.equal(next.colaboradores.length, 1);
  assert.equal(next.colaboradores[0].id, 12);
  assert.equal(state.colaboradores[0].nome, "Atual");
  assert.throws(() => preparar(state, persons, "atualizar"), /Escolha/);
  assert.throws(() => preparar(state, [], "adicionar"), /Nenhum/);
  state.colaboradores = Array.from({ length: 500 }, (_, i) => ({ id: i + 1 }));
  assert.throws(() => preparar(state, persons, "adicionar"), /500/);
  assert.equal(preparar(state, persons, "substituir").colaboradores.length, 1);
});
