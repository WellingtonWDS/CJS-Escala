const { test, before } = require('node:test');
const assert = require('node:assert/strict');
let base, limiteDiario, distribuicaoTransitoria42, permiteSimular42, converterEscala;
before(async () => {
  ({ createDefaultState: base } = await import('../assets/js/state/store.js'));
  ({ limiteDiario, distribuicaoTransitoria42 } = await import('../assets/js/domain/ec141.js'));
  ({ permiteSimular42 } = await import('../assets/js/domain/simulacao42.js'));
  ({ converterEscala } = await import('../assets/js/domain/conversao.js'));
});
function estado() {
  const s = base(new Date(2026, 9, 1));
  Object.assign(s, { tipoEscala: '5x2', instrumentoCompensacao: 'nenhuma', modoRegime: 'automatico' });
  return s;
}
test('liminar: vigência exata, 42h e apenas 5x2; simular outra fase não prorroga a exceção', () => {
  const s = estado();
  for (const [data, limite] of [['2026-12-15', 8], ['2026-12-16', 8.4], ['2027-12-15', 8.4], ['2027-12-16', 8]])
    assert.equal(limiteDiario(s, data), limite, data);
  s.modoRegime = 'simulacao';
  for (const fase of ['atual44', 'definitivo40']) {
    s.regimeJornada = fase;
    assert.equal(limiteDiario(s, '2027-02-08'), 8);
  }
  s.regimeJornada = 'transicao42';
  for (const data of ['2026-12-15', '2027-12-16', '2028-02-08'])
    assert.equal(limiteDiario(s, data), 8);
  for (const tipo of ['6x1', '12x36', 'custom']) {
    s.tipoEscala = tipo;
    assert.equal(limiteDiario(s, '2027-02-08'), 8, tipo);
  }
});
test('ACT informado continua com sua própria vigência e teto; banco não equivale à ausência de acordo', () => {
  const s = estado();
  s.instrumentoCompensacao = 'act_cct';
  Object.assign(s.instrumentoColetivo, { identificacao: 'CCT', inicio: '2027-01-01', fim: '2027-06-30', compativelEC141: true, compensacaoDiaria: true, limiteDiario: 10 });
  assert.equal(limiteDiario(s, '2027-02-08'), 10);
  s.instrumentoColetivo.limiteDiario = 8;
  assert.equal(limiteDiario(s, '2027-02-08'), 8);
  assert.equal(limiteDiario(s, '2027-07-01'), 8);
  s.instrumentoCompensacao = 'banco';
  assert.equal(limiteDiario(s, '2027-02-08'), 8);
});
test('fixa usa a referência legal e não as datas sintéticas do calendário', () => {
  const s = estado();
  s.modeloEscala = 'fixa';
  s.dataReferenciaFixa = '2027-02-08';
  assert.equal(limiteDiario(s, '2028-02-08'), 8.4);
  assert.equal(permiteSimular42(s, ''), true);
  s.dataReferenciaFixa = '2027-12-16';
  assert.equal(limiteDiario(s, '2027-02-08'), 8);
  assert.equal(permiteSimular42(s, '2027-02'), false);
  for (const data of ['', null, undefined, '2027-02-30']) {
    s.dataReferenciaFixa = data;
    assert.equal(distribuicaoTransitoria42(s, '2027-02-08'), false);
  }
});
test('seleção de 42h aceita origem 6x1 e meses de fronteira, sem liberar fora do período', () => {
  const s = estado(); s.tipoEscala = '6x1';
  for (const mes of ['2026-12', '2027-02', '2027-12']) assert.equal(permiteSimular42(s, mes), true, mes);
  for (const mes of ['', '2027-13', '2026-11', '2028-01']) assert.equal(permiteSimular42(s, mes), false, mes);
});
function converter(contrato = 44, fixa = false) {
  const s = estado(); s.tipoEscala = '6x1';
  s.colaboradores = s.colaboradores.slice(0, 1);
  s.colaboradores[0].horasSemana = contrato;
  s.jornada = { entrada: '08:00', intInicio: '11:00', intFim: '13:00', saida: '18:00' };
  s.horarioPorDia = true;
  s.jornadaPorDia[6] = { entrada: '08:00', intInicio: '', intFim: '', saida: '12:00' };
  if (fixa) Object.assign(s, { modeloEscala: 'fixa', dataReferenciaFixa: '2027-02-08' });
  const original = structuredClone(s);
  const c = converterEscala(s, { periodo: '2027-02', fase: 'transicao42', folgas: 'fim_semana' });
  assert.deepEqual(s, original);
  return c.proposta.config;
}
test('conversão sem ACT: 504 minutos, dois repousos, pausa preservada, sem erro diário em ambos os modelos', () => {
  for (const fixa of [false, true]) {
    const config = converter(44, fixa), r = config.escalaGerada.resultado[0];
    const dias = r.dias.filter(d => d.data >= '2027-02-08' && d.data <= '2027-02-14');
    const trabalho = dias.filter(d => d.status === 'T');
    assert.equal(trabalho.length, 5);
    assert.equal(dias.filter(d => d.status === 'F').length, 2);
    assert(trabalho.every(d => Math.round(d.horas * 60) === 504 && d.intervaloMin === 120));
    assert.equal(trabalho.reduce((a, d) => a + Math.round(d.horas * 60), 0), 2520);
    const issues = config.escalaGerada.validacoes[0].issues;
    assert(!issues.some(i => i.tipo === 'JORNADA_DIARIA'));
    assert(issues.some(i => i.tipo === 'TRANSICAO_42_SEM_ACT' && i.severidade === 'info'));
  }
});
test('a dispensa não aumenta contratos de 40h ou menores', () => {
  for (const carga of [30, 40]) {
    const config = converter(carga), r = config.escalaGerada.resultado[0];
    const dias = r.dias.filter(d => d.data >= '2027-02-08' && d.data <= '2027-02-14');
    assert.equal(dias.reduce((a, d) => a + Math.round(d.horas * 60), 0), carga * 60);
  }
});
test('edição manual não pode ultrapassar 8h24 nem utilizar a exceção em seis dias', async () => {
  const { createDomain } = await import('../assets/js/domain/index.js');
  const config = converter(), r = config.escalaGerada.resultado[0];
  const dias = structuredClone(r.dias.filter(d => d.data >= '2027-02-08' && d.data <= '2027-02-14'));
  dias[0].horas = 9;
  assert(createDomain(config).validarJornadaDiaria(r.colaborador, dias).some(i => i.tipo === 'JORNADA_DIARIA' && i.severidade === 'erro'));
  dias[0].horas = 8.4;
  Object.assign(dias[5], { ...dias[0], data: dias[5].data, weekday: 6 });
  assert(createDomain(config).validarJornadaSemanal(r.colaborador, dias).some(i => i.tipo === 'DISTRIBUICAO_TRANSITORIA_42' && i.severidade === 'erro'));
});
test('meses de fronteira calculam o teto por data; não prolongam a exceção em simulação', () => {
  for (const periodo of ['2026-12', '2027-12']) {
    const s = estado(); s.tipoEscala = '6x1'; s.colaboradores = s.colaboradores.slice(0, 1);
    s.jornada = { entrada: '08:00', intInicio: '11:00', intFim: '13:00', saida: '18:00' };
    const config = converterEscala(s, { periodo, fase: 'transicao42', folgas: 'fim_semana' }).proposta.config;
    for (const d of config.escalaGerada.resultado[0].dias) {
      const dentro = d.data >= '2026-12-16' && d.data <= '2027-12-15';
      assert(d.horas <= (dentro ? 8.4 : 8) + 0.001, d.data);
    }
  }
});
test('buscar ajustes pode recuperar as 2h faltantes sem ACT na transição', async () => {
  const { buscarAjustesCobertura, aplicarAjustesCobertura } = await import('../assets/js/domain/ajustes-cobertura.js');
  const config = converter();
  config.coberturaAtiva = true;
  config.demandasCobertura = [{ id: 1, funcao: config.colaboradores[0].cargo, inicio: '08:00', fim: '11:00', minimo: 1, diasSemana: [1,2,3,4,5], incluirFeriados: true }];
  for (const r of config.escalaGerada.resultado) for (const campo of ['dias', 'diasContexto', 'diasApuracao']) for (const d of r[campo] || []) {
    if (d.status === 'T') Object.assign(d, { horas: 8, horasPrevistas: 8, horasComputadasCCT: 8, saidaMin: 1080 });
  }
  const plano = buscarAjustesCobertura(config);
  assert(plano.acoes.some(a => a.tipo === 'rateio'));
  assert(plano.deficitAntesMin > 0);
  assert.equal(plano.deficitDepoisMin, 0);
  const resultado = aplicarAjustesCobertura(config, plano);
  assert(!resultado.validacoes.flatMap(v => v.issues).some(i => i.severidade === 'erro'));
  const semana = resultado.resultado[0].dias.filter(d => d.data >= '2027-02-08' && d.data <= '2027-02-14');
  assert.equal(semana.reduce((a, d) => a + Math.round(d.horas * 60), 0), 2520);
});
test('a exceção de distribuição não substitui enquadramentos individuais distintos', () => {
  const s = estado(); s.analiseEnquadramentoAtiva = true;
  const publico = { ec141: { tipo: 'contrato_publico', contratoVigente: true, maoDeObraDireta: true } };
  assert.equal(limiteDiario(s, '2027-02-08', publico), 8);
  assert.equal(distribuicaoTransitoria42(s, '2027-02-08', publico), false);
  const art8 = { ec141: { tipo: 'art8', diplomaSuperior: true, tetoRgps: 1000, remuneracao: 3000, empregadoPublico: false, jornadaMantida: false } };
  assert.equal(distribuicaoTransitoria42(s, '2027-02-08', art8), false);
});
