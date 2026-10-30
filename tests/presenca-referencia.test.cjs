const { test, before } = require('node:test');
const assert = require('node:assert/strict');
let base, converter, presenca, diagnosticar;
before(async () => {
  ({createDefaultState:base} = await import('../assets/js/state/store.js'));
  ({converterEscala:converter} = await import('../assets/js/domain/conversao.js'));
  ({compararPresencaAtual:presenca,diagnosticarEquipe:diagnosticar} = await import('../assets/js/domain/diagnostico-equipe.js'));
});
function empresa() {
  const s=base(new Date(2026,9,30));
  Object.assign(s,{modeloEscala:'fixa',dataReferenciaFixa:'2028-02-01',coberturaAtiva:false,
    horarioPorDia:true,jornada:{entrada:'08:00',intInicio:'12:00',intFim:'14:00',saida:'18:00'},
    colaboradores:[{id:1,nome:'Pessoa exemplo',cargo:'Auxiliar',sexo:'masculino',horasSemana:44}]});
  s.jornadaPorDia[6]={entrada:'08:00',intInicio:'12:00',intFim:'00:00',saida:'00:00'};
  return s;
}
const op={periodo:'2028-02',fase:'definitivo40',folgas:'distribuir'};
test('sem cobertura preenchida, 44h em seis dias exige reforço para manter presença com40h/5x2',()=>{
  const s=empresa(), copia=structuredClone(s), c=converter(s,op), m=c.comparacao;
  assert.deepEqual(s,copia);
  assert.equal(m.baseCobertura,'escala_atual');
  assert.equal(m.status,'insuficiente');
  assert.equal(m.diagnostico.referenciaInferida,true);
  assert.equal(m.funcoes[0].necessarias,44);
  assert.equal(m.funcoes[0].limiteCapacidade,40);
  assert.equal(m.faltantesDepois,4);
  assert.ok(m.diagnostico.provas.some(p=>p.tipo==='horas'&&p.deficit===240));
  assert.ok(m.diagnostico.provas.some(p=>p.tipo==='dias'&&p.deficit===1));
  assert.match(m.diagnostico.limitacoes.join(' '),/Se essa presença precisar ser mantida/);
  assert.ok(m.coberturaReferencia.periodos.every(p=>p.fimMin<=720||p.inicioMin>=840));
  assert.equal(c.proposta.config.coberturaAtiva,false);
  assert.deepEqual(c.proposta.config.demandasCobertura,[]);
});
test('42h comACT separa perda de duas horas e necessidade de seis dias de presença',()=>{
  const s=empresa();s.jornada.intFim='13:00';s.tipoEscala='5x2';
  s.modoRegime='simulacao';s.regimeJornada='transicao42';
  s.instrumentoCompensacao='act_cct';
  Object.assign(s.instrumentoColetivo,{identificacao:'ACT exemplo',inicio:'2026-01-01',fim:'2029-12-31',compativelEC141:true,compensacaoDiaria:true,limiteDiario:10});
  const dias=['2028-02-07','2028-02-08','2028-02-09','2028-02-10','2028-02-11'];
  const atual=[pessoa(1,'Auxiliar',[...dias.map(d=>dia(d,480,1020,720,780)),dia('2028-02-12',480,720)])];
  const proposta=[pessoa(1,'Auxiliar',dias.map(d=>dia(d,480,1044,720,780)))];
  const rel=presenca(s,atual,proposta), d=diagnosticar(s,proposta,rel);
  assert.equal(d.status,'capacidade_insuficiente');
  assert.equal(d.funcoes[0].necessarias,44);
  assert.equal(d.funcoes[0].limiteCapacidade,42);
  assert.ok(d.provas.some(p=>p.tipo==='horas'&&p.deficit===120));
  assert.ok(d.provas.some(p=>p.tipo==='dias'&&p.deficit===1));
});
test('cobertura explícita tem precedência e não exige manter pessoas excedentes da referência',()=>{
  const s=empresa();s.coberturaAtiva=true;s.demandasCobertura=[{id:1,funcao:'Auxiliar',diasSemana:[1,2,3,4,5],inicio:'08:00',fim:'12:00',minimo:1,incluirFeriados:true}];
  const m=converter(s,{...op,folgas:'fim_semana'}).comparacao;
  assert.equal(m.baseCobertura,'informada');
  assert.equal(m.diagnostico.referenciaInferida,false);
  assert.equal(m.coberturaReferencia,null);
  assert.equal(m.faltantesDepois,0);
});
function pessoa(id,cargo,dias){return{colaborador:{id,nome:`Pessoa${id}`,cargo,horasSemana:44,sexo:'masculino'},dias};}
function dia(data,entrada,saida,inicio=null,fim=null){return{data,status:'T',weekday:new Date(data+'T12:00:00').getDay(),horas:(saida-entrada-(fim-inicio))/60,entradaMin:entrada,saidaMin:saida,intervaloMin:inicio===null?0:fim-inicio,intervaloInicioMin:inicio,intervaloFimMin:fim};}
test('presença inferida preserva pausas, noite e recorte sem multiplicar linhas do mesmo dia',()=>{
  const s=base(new Date(2028,1,1));s.diaInicio=2;
  const atual=[pessoa(1,'Auxiliar',[dia('2028-02-01',1200,1800,1440,1500)])];
  atual[0].diasContexto=structuredClone(atual[0].dias);
  const proposta=[pessoa(1,'Auxiliar',[dia('2028-02-02',60,360)])];
  const rel=presenca(s,atual,proposta);
  assert.equal(rel.periodos.length,1);
  assert.equal(rel.periodos[0].data,'2028-02-02');
  assert.equal(rel.periodos[0].inicioMin,60);
  assert.equal(rel.periodos[0].fimMin,360);
  assert.equal(rel.periodos[0].necessarios,1);
  assert.equal(rel.lacunas.length,0);
});
test('habilitações compartilhadas não duplicam capacidade de uma pessoa ao preservar duas funções',()=>{
  const s=empresa(), data='2028-02-07';
  const atual=[pessoa(1,'Auxiliar',[dia(data,480,720)]),pessoa(2,'Supervisor',[dia(data,480,720)])];
  const equipe=[pessoa(1,'Auxiliar',[dia(data,480,720)])];
  equipe[0].colaborador.funcoesHabilitadas=['Supervisor'];
  const rel=presenca(s,atual,equipe), d=diagnosticar(s,equipe,rel);
  assert.equal(d.status,'capacidade_insuficiente');
  assert.ok(d.provas.some(p=>p.tipo==='simultaneidade'&&p.deficit===1));
});
test('horário incompleto ou IDs duplicados suspendem conclusão inferida de contratação',()=>{
  const s=empresa(), atual=[pessoa(1,'Auxiliar',[dia('2028-02-07',480,1080,720,840)])];
  const proposta=structuredClone(atual);atual.push(structuredClone(atual[0]));
  const rel=presenca(s,atual,proposta);
  assert.ok(rel.avisos.some(a=>/duplicada/.test(a)));
  assert.equal(diagnosticar(s,proposta,rel).status,'dados_pendentes');
  atual.pop();delete atual[0].dias[0].intervaloFimMin;
  assert.ok(presenca(s,atual,proposta).avisos.length);
});
