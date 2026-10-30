const {test,before}=require('node:test');
const assert=require('node:assert/strict');
let base,converter,analisar,domain,apurar;
before(async()=>{
 ({createDefaultState:base}=await import('../assets/js/state/store.js'));
 ({converterEscala:converter}=await import('../assets/js/domain/conversao.js'));
 ({analisarRateioSemanal:analisar}=await import('../assets/js/domain/rateio-semanal.js'));
 ({createDomain:domain}=await import('../assets/js/domain/index.js'));
 ({apurarSemana:apurar}=await import('../assets/js/domain/resumo-semanal.js'));
});
function empresa(pausa=60){
 const s=base(new Date(2026,9,30));
 s.colaboradores=s.colaboradores.slice(0,1);
 s.jornada={entrada:'08:00',intInicio:'11:00',intFim:pausa===60?'12:00':'13:00',saida:'18:00'};
 s.horarioPorDia=true;
 s.jornadaPorDia[6]={entrada:'08:00',intInicio:'',intFim:'',saida:'12:00'};
 s.instrumentoCompensacao='act_cct';
 Object.assign(s.instrumentoColetivo,{identificacao:'CCT de teste',inicio:'2026-01-01',fim:'2029-12-31',compativelEC141:true,compensacaoDiaria:true,limiteDiario:10});
 return s;
}
const op={periodo:'2027-02',fase:'transicao42',folgas:'fim_semana'};
const semana=r=>r.dias.filter(d=>d.data>='2027-02-08'&&d.data<='2027-02-14');
function dados(s,opcoes=op){const c=converter(s,opcoes),config=c.proposta.config,r=config.escalaGerada.resultado[0];return{c,config,r,dias:semana(r)};}
function rec(config,r){return analisar(config,[r])[0].semanas.find(s=>s.inicio==='2027-02-08');}

test('rateia 42h em cinco jornadas exatas de 08h24, com clocks e pausa preservada',()=>{
 const s=empresa(),original=structuredClone(s),{config,r,dias}=dados(s);
 const trabalho=dias.filter(d=>d.status==='T');
 assert.deepEqual(s,original);
 assert.equal(trabalho.length,5);
 assert(trabalho.every(d=>Math.round(d.horas*60)===504&&d.entradaMin===480&&d.saidaMin===1044&&d.intervaloMin===60));
 assert.equal(apurar(r.colaborador,dias,config).computadas,42);
 assert.equal(rec(config,r).aplicado,true);
 assert.equal(rec(config,r).horasPorDiaMin,504);
 assert(config.escalaGerada.recomendacoesRateio.length);
});

test('perfis individuais importados também rateiam 42h, sem congelar as horas do quadro atual',()=>{
 const s=empresa(),c=s.colaboradores[0];
 c.quadroDominio={ativo:true,tipo:'semanal',modelo:'6x1',semana:Object.fromEntries(Array.from({length:7},(_,d)=>[d,d===0?{status:'folga'}:{status:'trabalho',jornada:d===6?s.jornadaPorDia[6]:s.jornada}])),pendencias:[]};
 const {config,r,dias}=dados(s);
 assert(dias.filter(d=>d.status==='T').every(d=>Math.round(d.horas*60)===504));
 assert.equal(apurar(r.colaborador,dias,config).computadas,42);
 assert.equal(rec(config,r).aplicado,true);
});

test('não reduz 2h de almoço nem amplia janela 08–18 para fingir 42h; recomenda os 24min necessários',()=>{
 const {config,r,dias}=dados(empresa(120));
 assert.equal(apurar(r.colaborador,dias,config).computadas,40);
 assert(dias.filter(d=>d.status==='T').every(d=>d.intervaloMin===120&&d.saidaMin<=1080));
 const aviso=rec(config,r);
 assert.equal(aviso.faltantesMin,120);assert.equal(aviso.acrescimoMedioMin,24);
 assert.equal(aviso.horasPorDiaMin,504);assert.equal(aviso.viavelLegalmente,true);assert.equal(aviso.motivo,'janela');
});

test('sem ACT não presume 08h24 e identifica autorização coletiva insuficiente',()=>{
 const s=empresa();s.instrumentoCompensacao='nenhuma';
 const {config,r,dias}=dados(s),aviso=rec(config,r);
 assert(dias.every(d=>d.horas<=8));assert.equal(aviso.faltantesMin,120);
 assert.equal(aviso.horasPorDiaMin,504);assert.equal(aviso.viavelLegalmente,false);assert.equal(aviso.motivo,'fundamento_coletivo');
});

test('preserva contratos menores e distribui restos em minutos sem perder carga',()=>{
 for(const carga of [20,30,39.983333333333334,40,41.983333333333334]){
  const s=empresa();s.colaboradores[0].horasSemana=carga;
  const {config,r,dias}=dados(s),minutos=dias.filter(d=>d.status==='T').map(d=>Math.round(d.horas*60));
  assert.equal(minutos.reduce((a,b)=>a+b,0),Math.round(carga*60));
  assert(Math.max(...minutos)-Math.min(...minutos)<=1);
  assert.equal(r.colaborador.horasSemana,carga);
  if(carga<=40)assert.deepEqual(analisar(config,[r]),[]);
 }
});

test('redistribui saldo de dia curto para os demais dias respeitando janela e limite diário',()=>{
 const s=empresa();s.colaboradores[0].restricoes={horariosPermitidos:[{dia:1,entrada:'11:00',saida:'18:00'}]};
 const {config,r,dias}=dados(s);
 assert.equal(apurar(r.colaborador,dias,config).computadas,42);
 assert.equal(dias[0].entradaMin,660);
 assert(dias.every(d=>d.saidaMin<=1080&&d.horas<=10));
});

test('feriado abonado não entra como saldo a recuperar; recomendação é recalculada após edição',()=>{
 const s=empresa();s.feriados=[{dia:10,mes:1,ano:2027,nome:'Feriado de teste',tipo:'municipal',trabalhado:false}];
 s.politicaFeriados='adicional';
 const {config,r,dias}=dados(s),aviso=rec(config,r);
 assert.equal(apurar(r.colaborador,dias,config).computadas,42);
 assert.equal(aviso.faltantesMin,0);assert.equal(aviso.creditosMin,504);
 assert.equal(aviso.horasPorDiaMin,504);assert.equal(aviso.diasTrabalho,4);
 const d=dias.find(d=>d.status==='T');d.horas-=1;d.saidaMin-=60;
 assert.equal(rec(config,r).faltantesMin,60);
});

test('flag legado usarHorasQuadro não congela jornadas na geração da proposta',()=>{
 const s=empresa();s.tipoEscala='5x2';s.aplicarProposta5x2=true;s.usarHorasQuadro=true;s.modoRegime='simulacao';s.regimeJornada='transicao42';s.ano=2027;s.mes=1;s.folgasFimSemana=true;
 const r=domain(s).gerarDadosEscala().resultado[0],dias=semana(r);
 assert.equal(dias.reduce((sum,d)=>sum+Math.round(d.horas*60),0),2520);
 assert(dias.filter(d=>d.status==='T').every(d=>Math.round(d.horas*60)===504));
});

test('escala fixa mostra o mesmo rateio 08h24 na semana representativa',()=>{
 const s=empresa();s.modeloEscala='fixa';s.dataReferenciaFixa='2027-02-08';
 const {config,r}=dados(s);
 const avisos=analisar(config,[r]);
 assert.equal(avisos[0].semanas.length,1);
 assert.equal(avisos[0].semanas[0].horasPorDiaMin,504);
 assert.equal(avisos[0].semanas[0].aplicado,true);
});

test('férias parciais dispensam a parcela prevista sem recomendar recuperá-la nos dias restantes',()=>{
 const s=empresa();s.colaboradores[0].restricoes={periodos:[{tipo:'ferias',inicio:'2027-02-08',fim:'2027-02-09'}]};
 const {config,r,dias}=dados(s),resumo=apurar(r.colaborador,dias,config);
 assert.equal(Math.round(resumo.alvo*60),1512);
 assert.equal(Math.round(resumo.computadas*60),1512);
 assert.equal(dias.filter(d=>d.status==='T').length,3);
 assert.equal(analisar(config,[r])[0].semanas.some(s=>s.inicio==='2027-02-08'),false);
});

test('ACT vencido muda a recomendação para base coletiva insuficiente sem ultrapassar 8h',()=>{
 const s=empresa();s.instrumentoColetivo.fim='2027-02-07';
 const {config,r,dias}=dados(s),aviso=rec(config,r);
 assert(dias.every(d=>d.horas<=8));
 assert.equal(aviso.motivo,'fundamento_coletivo');
 assert.equal(aviso.faltantesMin,120);
});

test('horas acima do alvo não são anunciadas como rateio aplicado nem recebem acréscimos',()=>{
 const {config,r,dias}=dados(empresa());
 const d=dias.find(d=>d.status==='T');d.horas+=1;d.saidaMin+=60;
 assert.equal(apurar(r.colaborador,dias,config).estado,'acima');
 assert.equal(analisar(config,[r])[0].semanas.some(s=>s.inicio==='2027-02-08'),false);
});

test('rateio com capacidade aberta também usa minutos inteiros e preserva o total',async()=>{
 const {distribuirCargaPrevista}=await import('../assets/js/domain/distribuicao-horas.js');
 const dias=Array.from({length:5},(_,i)=>({data:`2027-02-${String(i+8).padStart(2,'0')}`,weekday:i+1,previsto:true}));
 const carga=distribuirCargaPrevista({horasSemana:37.1},dias,{}),minutos=[...carga.values()].map(h=>h*60);
 assert(minutos.every(Number.isInteger));
 assert.equal(minutos.reduce((a,b)=>a+b,0),2226);
 assert.equal(Math.max(...minutos)-Math.min(...minutos),1);
});

test('cobertura não compra uma folga em dia longo à custa de perder quatro horas contratuais',()=>{
 const s=empresa(120);s.instrumentoCompensacao='nenhuma';
 s.coberturaAtiva=true;s.demandasCobertura=[{id:1,funcao:s.colaboradores[0].cargo,inicio:'08:00',fim:'12:00',minimo:1,diasSemana:[6],incluirFeriados:true}];
 const c=converter(s,{periodo:'2028-02',fase:'definitivo40',folgas:'distribuir'}),config=c.proposta.config,r=config.escalaGerada.resultado[0];
 const dias=r.dias.filter(d=>d.data>='2028-02-07'&&d.data<='2028-02-13');
 assert.equal(apurar(r.colaborador,dias,config).computadas,40);
 assert.equal(dias.find(d=>d.weekday===6).horas,0);
 assert(c.comparacao.lacunas.some(l=>l.data==='2028-02-12'));
 assert.equal(c.comparacao.pessoas[0].deficits,0);
 assert(config.escalaGerada.validacoes[0].issues.every(i=>i.severidade!=='erro'));
});

test('entre planos que completam a carga, a cobertura continua decidindo a melhor folga',()=>{
 const s=empresa(120);s.colaboradores[0].horasSemana=36;
 s.coberturaAtiva=true;s.demandasCobertura=[{id:1,funcao:s.colaboradores[0].cargo,inicio:'08:00',fim:'12:00',minimo:1,diasSemana:[6],incluirFeriados:true}];
 const c=converter(s,{periodo:'2028-02',fase:'definitivo40',folgas:'distribuir'}),config=c.proposta.config,r=config.escalaGerada.resultado[0];
 const dias=r.dias.filter(d=>d.data>='2028-02-07'&&d.data<='2028-02-13');
 assert.equal(apurar(r.colaborador,dias,config).computadas,36);
 assert.equal(dias.find(d=>d.weekday===6).horas,4);
 assert.equal(c.comparacao.lacunas.length,0);
 assert.equal(c.comparacao.pessoas[0].deficits,0);
});
