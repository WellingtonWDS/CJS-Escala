const { test, before } = require('node:test');
const assert = require('node:assert/strict');
let base, domain, converter, referencia, modelo, cobertura, csv, persistencia, snapshots;
before(async () => {
  ({createDefaultState: base} = await import('../assets/js/state/store.js'));
  ({createDomain: domain} = await import('../assets/js/domain/index.js'));
  ({converterEscala: converter, gerarReferenciaAtual: referencia} = await import('../assets/js/domain/conversao.js'));
  modelo = await import('../assets/js/domain/modelo-escala.js');
  ({analisarCobertura: cobertura} = await import('../assets/js/domain/cobertura.js'));
  ({gerarCsv: csv} = await import('../assets/js/export/csv.js'));
  ({createPersistence: persistencia} = await import('../assets/js/state/persistencia.js'));
  ({validateSnapshot: snapshots} = await import('../assets/js/state/workspace.js'));
});
function empresa(extra = {}) {
  const s=base(new Date(2026,9,28));
  Object.assign(s, {modeloEscala:'fixa', horarioPorDia:true,
    jornada:{entrada:'08:00',intInicio:'11:00',intFim:'13:00',saida:'18:00'}, ...extra});
  s.jornadaPorDia[6]={entrada:'08:00',intInicio:'',intFim:'',saida:'12:00'};
  s.colaboradores=s.colaboradores.map(c=>({...c,cargo:'Atendente'}));
  return s;
}
const padrao = (s, r) => modelo.diasDoModelo(s,r.dias).map(d=>[d.weekday,d.status,d.horas,d.entradaMin,d.intervaloInicioMin,d.intervaloFimMin,d.saidaMin]);
const erros = (e) => e.validacoes.flatMap(v=>v.issues).filter(i=>i.severidade==='erro');
function conferirRepeticao(escala) {
  for(const r of escala.resultado) {
    const porDia=new Map();
    for(const d of r.dias) {
      const valor=JSON.stringify([d.status,d.horas,d.entradaMin,d.intervaloInicioMin,d.intervaloFimMin,d.saidaMin]);
      if(porDia.has(d.weekday)) assert.equal(valor,porDia.get(d.weekday));
      porDia.set(d.weekday,valor);
    }
  }
}
test('fixa ignora mês, início e feriados nacionais/locais sem alterar o cadastro mensal',()=>{
  const s=empresa(); s.feriados=[{dia:7,nome:'Feriado local',tipo:'municipal',trabalhado:false}];
  const antes=structuredClone(s), a=domain(s).gerarDadosEscala();
  assert.deepEqual(s,antes); assert.equal(a.modeloEscala,'fixa');
  assert(a.resultado.every(r=>r.dias.every(d=>!d.feriado && d.status!=='FE')));
  Object.assign(s,{mes:1,ano:2030,diaInicio:20,feriados:[{dia:12,nome:'Outro',trabalhado:false}]});
  const b=domain(s).gerarDadosEscala();
  assert.deepEqual(padrao(s,a.resultado[0]),padrao(s,b.resultado[0]));
  conferirRepeticao(a); conferirRepeticao(b);
});
test('modelo dinâmico continua dispensando feriado nacional e abonando o dia previsto',()=>{
  const s=empresa({modeloEscala:'dinamica'}), e=domain(s).gerarDadosEscala();
  const dia=e.resultado[0].dias.find(d=>d.data==='2026-10-12');
  assert.equal(dia.status,'F'); assert.equal(dia.horasPrevistas,8); assert(dia.feriado);
});
test('conversão fixa preserva origem e compara uma semana de 44h para 40h/duas folgas',()=>{
  const s=empresa(), antes=structuredClone(s), c=converter(s,{fase:'definitivo40',folgas:'fim_semana'});
  assert.deepEqual(s,antes); assert.equal(c.origem.escala.referenciaAtual44,true);
  assert(c.comparacao.pessoas.every(p=>p.horasAntes===44 && p.horasDepois===40 && p.folgasDepois===2));
  assert.equal(erros(c.proposta.config.escalaGerada).length,0);
  conferirRepeticao(c.proposta.config.escalaGerada);
});
test('fase automática fixa usa a data de referência inclusive nas duas viradas legais',()=>{
  for(const [data,alvo] of [['2026-12-15',44],['2026-12-16',42],['2027-12-15',42],['2027-12-16',40]]) {
    const s=empresa({dataReferenciaFixa:data,mes:0,ano:2030}), e=domain(s).gerarDadosEscala();
    assert(e.resultado[0].dias.every(d=>d.alvoSemana===alvo),data);
    conferirRepeticao(e);
  }
});
test('42h em cinco dias não presume autorização acima de 8h; ACT válido libera somente a distribuição autorizada',()=>{
  const s=empresa({dataReferenciaFixa:'2027-06-15'});
  s.jornada={entrada:'07:00',intInicio:'11:00',intFim:'12:00',saida:'17:00'};
  let c=converter(s,{fase:'transicao42',folgas:'fim_semana'});
  assert.equal(c.comparacao.pessoas[0].horasDepois,40); assert(c.comparacao.pessoas[0].deficits);
  s.instrumentoCompensacao='act_cct';
  Object.assign(s.instrumentoColetivo,{identificacao:'CCT teste',inicio:'2027-06-15',fim:'2027-06-15',compativelEC141:true,compensacaoDiaria:true,limiteDiario:9});
  c=converter(s,{fase:'transicao42',folgas:'fim_semana'});
  assert.equal(c.comparacao.pessoas[0].horasDepois,42);
  assert(!erros(c.proposta.config.escalaGerada).some(i=>i.tipo==='INSTRUMENTO_FORA_VIGENCIA'));
  conferirRepeticao(c.proposta.config.escalaGerada);
  s.instrumentoColetivo.fim='2027-06-14';
  c=converter(s,{fase:'transicao42',folgas:'fim_semana'});
  assert.equal(c.comparacao.pessoas[0].horasDepois,40);
  s.dataReferenciaFixa='2026-10-01';
  s.instrumentoColetivo.inicio='2026-01-01';
  s.instrumentoColetivo.fim='2026-09-30';
  c=converter(s,{fase:'definitivo40',folgas:'fim_semana'});
  assert(erros(c.proposta.config.escalaGerada).some(i=>i.tipo==='INSTRUMENTO_FORA_VIGENCIA'));
});
test('admissão e férias datadas não alteram o padrão; folgas e janelas semanais são preservadas',()=>{
  const s=empresa();
  s.colaboradores[0].restricoes={periodos:[{tipo:'ferias',inicio:'2026-10-01',fim:'2026-10-31'}],folgasObrigatorias:[2],horariosPermitidos:[{dia:1,entrada:'09:00',saida:'16:00'}]};
  const e=domain(s).gerarDadosEscala(), dias=modelo.diasDoModelo(s,e.resultado[0].dias);
  assert.equal(dias.find(d=>d.weekday===2).status,'F');
  assert(dias.find(d=>d.weekday===1).entradaMin>=540);
  assert(dias.every(d=>!['VA','AF'].includes(d.status)));
  assert.equal(s.colaboradores[0].restricoes.periodos.length,1);
  conferirRepeticao(e);
});
test('cobertura fixa mede sete dias, conta intervalos e ignora a opção de feriados da demanda',()=>{
  const s=empresa({coberturaAtiva:true});
  s.demandasCobertura=[{id:1,funcao:'Atendente',inicio:'08:00',fim:'18:00',minimo:1,diasSemana:[1,2,3,4,5],incluirFeriados:false}];
  const e=domain(s).gerarDadosEscala(), rel=cobertura(s,e.resultado);
  assert.equal(new Set(rel.periodos.map(p=>p.data)).size,5);
  assert.equal(rel.lacunas.reduce((a,l)=>a+(l.fimMin-l.inicioMin)*l.faltantes,0),600);
  s.demandasCobertura[0].incluirFeriados=true;
  assert.deepEqual(cobertura(s,e.resultado),rel);
});
test('proposta fixa redistribui intervalos repetindo cada sugestão em todas as semanas',()=>{
  const s=empresa({coberturaAtiva:true});
  s.demandasCobertura=[{id:1,funcao:'Atendente',inicio:'08:00',fim:'18:00',minimo:1,diasSemana:[1,2,3,4,5],incluirFeriados:false}];
  const c=converter(s,{fase:'definitivo40',folgas:'fim_semana'}), e=c.proposta.config.escalaGerada;
  assert(e.sugestoesIntervalos.length>0); assert.equal(e.coberturaOperacional.lacunas.length,0);
  conferirRepeticao(e); assert.equal(c.comparacao.status,'suficiente');
});
test('diagnóstico fixo diferencia capacidade insuficiente sem somar semanas fictícias como contratações',()=>{
  const s=empresa({coberturaAtiva:true});
  s.colaboradores=s.colaboradores.slice(0,1);
  s.demandasCobertura=[{id:1,funcao:'Atendente',inicio:'08:00',fim:'18:00',minimo:3,diasSemana:[1,2,3,4,5],incluirFeriados:false}];
  const c=converter(s,{fase:'definitivo40',folgas:'fim_semana'});
  assert.equal(c.comparacao.status,'insuficiente'); assert.equal(c.comparacao.funcoes[0].necessarias,150);
});
test('fixa não converte ciclos alternados nem presume apuração de compensações por datas',()=>{
  assert.throws(()=>domain(empresa({tipoEscala:'12x36'})).gerarDadosEscala(),/12×36/);
  for(const campo of ['repousoMensal','compensacaoHoras']) {
    const s=empresa({instrumentoCompensacao:'act_cct'}); s.instrumentoColetivo[campo]=true;
    assert.throws(()=>domain(s).gerarDadosEscala(),/datas reais/);
  }
  assert.throws(()=>domain(empresa({dataReferenciaFixa:'2026-02-30'})).gerarDadosEscala(),/referência válida/);
});
test('turnos são fixos por pessoa e noturnos indicam saída no dia seguinte, sem perder interjornada',()=>{
  const s=empresa({tipoEscala:'5x2',folgasFimSemana:true,turnosRevezamento:true,entradaTurnoB:'22:00'}),e=domain(s).gerarDadosEscala();
  conferirRepeticao(e);
  assert(e.resultado[0].dias.filter(d=>d.status==='T').every(d=>d.turno==='A'));
  assert(e.resultado[1].dias.filter(d=>d.status==='T').every(d=>d.turno==='B' && d.saidaMin>1440));
  const r=e.resultado[0], segunda=r.dias.find(d=>d.weekday===1);
  segunda.entradaMin=0;
  const issues=domain(s).validarLegal(r.colaborador,r.dias,r.diasContexto,r.diasApuracao);
  assert(issues.some(i=>i.tipo==='PADRAO_FIXO'));
});
test('domingo fixo trabalhado exige revezamento em comércio e não fica aprovado silenciosamente',()=>{
  const s=empresa({tipoEscala:'5x2',atividadeComercio:true,domingosPermitidos:true,diasTrabalho:[0,1,2,3,4,5,6],folgaDiasPermitidos:[1,2],folgaTipo:'fixa'}),e=domain(s).gerarDadosEscala();
  assert(erros(e).some(i=>i.tipo==='DOMINGO_FIXO'));
});
test('CSV fixo exporta sete dias por colaborador, intervalos e identificação sem inventar um mês',()=>{
  const s=empresa();s.escalaGerada=domain(s).gerarDadosEscala();
  const arquivo=csv(s);
  assert.match(arquivo,/padrão semanal recorrente/); assert.match(arquivo,/Data de referência jurídica;2026-10-28/);
  assert.match(arquivo,/Início do intervalo/); assert.match(arquivo,/;Seg;/);
  assert.equal(arquivo.split('\n').filter(l=>l.startsWith('Colaborador 1;Atendente;')).length,7);
  assert.doesNotMatch(arquivo,/2026-10-05/);
});
test('preenchimento antigo continua dinâmico, e salvar/reabrir mantém modo fixo e feriados',()=>{
  const initial=base(new Date(2026,9,28)), state=structuredClone(initial), data=new Map();
  const storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
  const p=persistencia({state,initialState:initial,storage});
  const antigo=empresa();delete antigo.modeloEscala;delete antigo.dataReferenciaFixa;
  data.set('fintria-escala-dp-v2',JSON.stringify(antigo));p.loadState();
  assert.equal(state.modeloEscala,'dinamica');
  state.modeloEscala='fixa';state.feriados=[{dia:12,nome:'Preservado'}];p.saveState();
  state.modeloEscala='dinamica';p.loadState();
  assert.equal(state.modeloEscala,'fixa');assert.equal(state.feriados[0].nome,'Preservado');
  assert.equal(snapshots(state).modeloEscala,'fixa');
});
test('cenários de comércio, fazenda e padaria mantêm padrão fixo e distinguem cobertura de carga semanal',async()=>{
  const {criarCenariosSegmentos}=await import('../database/demo/segmentos.mjs');
  let simulados=0,ciclos=0;
  for(const empresa of criarCenariosSegmentos()) for(const d of empresa.drafts) {
    const s=structuredClone(d.state);s.modeloEscala='fixa';
    if(empresa.name.startsWith('Entidade')) {
      assert.throws(()=>domain(s).gerarDadosEscala(),/12×36/);ciclos++;continue;
    }
    s.colaboradores[0].quadroDominio.admissaoIso='2099-01-01';
    const c=converter(s,{...s.destinoConversao,fase:'definitivo40'}),e=c.proposta.config.escalaGerada;
    assert(c.origem.escala.resultado[0].dias.every(d=>d.status!=='NC'));
    conferirRepeticao(c.origem.escala);
    conferirRepeticao(e);assert.equal(erros(e).length,0,d.title);
    if(d.title.includes('contratar')) assert.equal(c.comparacao.status,'insuficiente',d.title);
    else {
      if(empresa.name.startsWith('Comércio')) {
        // Sábado curto não comporta cinco jornadas que completem 40h: a
        // proposta mantém o alvo contratual e expõe a cobertura a resolver.
        assert(c.comparacao.pessoas.every(p=>p.horasDepois===40&&!p.deficits),d.title);
        assert(e.coberturaOperacional.lacunas.some(l=>new Date(l.data+'T12:00:00').getDay()===6),d.title);
      } else assert.equal(e.coberturaOperacional.lacunas.length,0,d.title);
      assert.equal(c.comparacao.status,empresa.name.startsWith('Fazenda')?'suficiente':'ajustes',d.title);
    }
    simulados++;
  }
  assert.equal(simulados,8);assert.equal(ciclos,3);
});
test('descanso interjornada continua sendo verificado na passagem de domingo para segunda',()=>{
  const s=empresa({tipoEscala:'5x2',diasTrabalho:[0,1,2,3,4,5,6],folgaTipo:'fixa',folgaDiasPermitidos:[2,3]});
  s.colaboradores=s.colaboradores.filter(c=>c.sexo==='masculino');
  s.jornadaPorDia[0]={entrada:'22:00',intInicio:'02:00',intFim:'03:00',saida:'07:00'};
  const e=domain(s).gerarDadosEscala();
  assert(erros(e).some(i=>i.tipo==='INTERJORNADA' && i.mensagem.includes('abaixo de 11h')));
});
