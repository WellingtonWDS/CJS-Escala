const {test,before}=require('node:test');
const assert=require('node:assert/strict');
let base,converter,domain,buscar,aplicar,desfazer,apurar,analisar,alocacoes,validarAlocacoes,csv,relatorio;
before(async()=>{
 ({createDefaultState:base}=await import('../assets/js/state/store.js'));
 ({converterEscala:converter}=await import('../assets/js/domain/conversao.js'));
 ({createDomain:domain}=await import('../assets/js/domain/index.js'));
 ({buscarAjustesCobertura:buscar,aplicarAjustesCobertura:aplicar,desfazerAjustesCobertura:desfazer}=await import('../assets/js/domain/ajustes-cobertura.js'));
 ({apurarSemana:apurar}=await import('../assets/js/domain/resumo-semanal.js'));
 ({analisarCobertura:analisar}=await import('../assets/js/domain/cobertura.js'));
 ({alocacoesDoDia:alocacoes,validarAlocacoesFuncao:validarAlocacoes}=await import('../assets/js/domain/funcoes.js'));
 ({gerarCsv:csv}=await import('../assets/js/export/csv.js'));
 ({prepararRelatorio:relatorio}=await import('../assets/js/export/relatorio.js'));
});
function empresa(){
 const s=base(new Date(2026,9,31));
 Object.assign(s,{jornada:{entrada:'08:00',intInicio:'11:00',intFim:'13:00',saida:'18:00'},horarioPorDia:true,feriados:[]});
 s.jornadaPorDia[6]={entrada:'08:00',intInicio:'',intFim:'',saida:'12:00'};
 s.colaboradores=s.colaboradores.slice(0,1).map(c=>({...c,cargo:'Atendente',sexo:'masculino',horasSemana:44}));
 s.instrumentoCompensacao='act_cct';Object.assign(s.instrumentoColetivo,{identificacao:'CCT teste',inicio:'2026-01-01',fim:'2029-12-31',compativelEC141:true,compensacaoDiaria:true,limiteDiario:10});
 return s;
}
const op={periodo:'2027-02',fase:'transicao42',folgas:'fim_semana'};
const semana=r=>r.dias.filter(d=>d.data>='2027-02-08'&&d.data<='2027-02-14');
const erros=e=>e.validacoes.flatMap(v=>v.issues).filter(i=>i.severidade==='erro');
test('limite diário autorizado controla o rateio em minutos: 8h18 não basta; 8h24 basta',()=>{
 for(const [limite,total]of [[8.3,41.5],[8.4,42],[8.5,42],[10,42]]){
  const s=empresa();s.instrumentoColetivo.limiteDiario=limite;
  const p=converter(s,op).proposta.config, r=p.escalaGerada.resultado[0],dias=semana(r);
  assert.equal(apurar(r.colaborador,dias,p).computadas,total);
  assert(dias.every(d=>d.horas<=limite+1e-7));assert.equal(erros(p.escalaGerada).length,0);
 }
});
test('horário importado de 08–18/2h também propõe 08h24 no fixo e dinâmico sem alterar origem',()=>{
 for(const fixa of [false,true]){
  const s=empresa();if(fixa)Object.assign(s,{modeloEscala:'fixa',dataReferenciaFixa:'2027-02-08'});
  s.colaboradores[0].quadroDominio={ativo:true,tipo:'semanal',modelo:'6x1',semana:Object.fromEntries(Array.from({length:7},(_,d)=>[d,d===0?{status:'folga'}:{status:'trabalho',jornada:d===6?s.jornadaPorDia[6]:s.jornada}])),pendencias:[]};
  const antes=structuredClone(s),c=converter(s,op),p=c.proposta.config;
  assert.deepEqual(s,antes);assert.equal(c.origem.escala.resultado[0].dias.find(d=>d.weekday===1).saidaMin,1080);
  assert(semana(p.escalaGerada.resultado[0]).filter(d=>d.status==='T').every(d=>d.horas===8.4&&d.saidaMin===1104));
  assert.equal(erros(p.escalaGerada).length,0);
 }
});
test('buscar ajustes completa saldo de 40 para 42h, inclusive quando a cobertura já está atendida',()=>{
 const s=empresa();s.coberturaAtiva=true;s.demandasCobertura=[{id:1,funcao:'Atendente',inicio:'08:00',fim:'11:00',minimo:1,diasSemana:[1,2,3,4,5],incluirFeriados:true}];
 const p=converter(s,op).proposta.config;
 for(const r of p.escalaGerada.resultado)for(const campo of ['dias','diasContexto','diasApuracao'])for(const d of r[campo]||[]){
  if(d.status==='T'){d.horas=8;d.horasPrevistas=8;d.horasComputadasCCT=8;d.saidaMin=1080;}
 }
 const original=structuredClone(p.escalaGerada),plano=buscar(p);
 assert(plano.acoes.some(a=>a.tipo==='rateio'));assert(plano.deficitAntesMin>0);assert.equal(plano.deficitDepoisMin,0);
 assert.equal(plano.antes.minutosFaltantes,0);assert.equal(plano.depois.minutosFaltantes,0);
 const e=aplicar(p,plano);assert.equal(erros(e).length,0);
 assert.equal(apurar(e.resultado[0].colaborador,semana(e.resultado[0]),p).computadas,42);
 p.escalaGerada=JSON.parse(JSON.stringify(e));
 assert.deepEqual(desfazer(p).resultado,original.resultado);
});
function multi(fixa=false){
 const s=empresa();Object.assign(s,{tipoEscala:'5x2',diasTrabalho:[1,2,3,4,5],diaInicio:26,modoRegime:'simulacao',regimeJornada:'definitivo40',instrumentoCompensacao:'nenhuma',jornada:{entrada:'08:00',intInicio:'12:00',intFim:'13:00',saida:'17:00'},horarioPorDia:false,coberturaAtiva:true});
 if(fixa)Object.assign(s,{modeloEscala:'fixa',dataReferenciaFixa:'2026-10-26'});
 Object.assign(s.colaboradores[0],{horasSemana:40,funcoesHabilitadas:['Caixa']});
 const demanda=(id,funcao,inicio,fim)=>({id,funcao,inicio,fim,minimo:1,diasSemana:[1,2,3,4,5],incluirFeriados:true});
 s.demandasCobertura=[demanda(1,'Atendente','08:00','11:00'),demanda(2,'Caixa','11:00','12:00'),demanda(3,'Atendente','13:00','17:00')];
 s.escalaGerada=domain(s).gerarDadosEscala();return s;
}
test('funções por período cobrem manhã/caixa/tarde com uma pessoa, sem mudar horas, também no fixo',()=>{
 for(const fixa of [false,true]){
  const s=multi(fixa),antes=structuredClone(s),p=buscar(s),e=aplicar(s,p);
  assert(p.acoes.some(a=>a.tipo==='funcao_periodo'));assert.equal(p.depois.minutosFaltantes,0);
  assert.deepEqual(s,antes);assert.equal(erros(e).length,0);
  const d=e.resultado[0].dias.find(d=>d.status==='T');
  assert.deepEqual(alocacoes(s.colaboradores[0],d).map(a=>[a.inicioMin,a.fimMin,a.funcao]),[[480,660,'Atendente'],[660,720,'Caixa'],[780,1020,'Atendente']]);
  assert.equal(d.horas,8);
  const restored=JSON.parse(JSON.stringify({...s,escalaGerada:e}));
  assert.equal(analisar(restored,restored.escalaGerada.resultado).lacunas.length,0);
  assert.match(csv(restored),/11:00–12:00: Caixa/);
  assert(relatorio(restored).pessoas[0].linhas.some(l=>l[6].includes("11:00–12:00: Caixa")));
  assert.deepEqual(desfazer(restored).resultado,JSON.parse(JSON.stringify(antes.escalaGerada.resultado)));
 }
});
test('alternância não inventa habilitação nem duplica pessoa em demandas simultâneas',()=>{
 for(const semHabilitacao of [true,false]){
  const s=multi();
  if(semHabilitacao)delete s.colaboradores[0].funcoesHabilitadas;
  else s.demandasCobertura.push({...s.demandasCobertura[0],id:4,inicio:'11:00',fim:'12:00'});
  s.escalaGerada=domain(s).gerarDadosEscala();
  const p=buscar(s);assert.equal(p.alteracoes.length,0);assert(p.depois.minutosFaltantes>0);
 }
});
test('alocações sobrepostas ou fora do horário são rejeitadas antes de contar presença',()=>{
 const s=multi(),r=s.escalaGerada.resultado[0],d=r.dias.find(d=>d.status==='T');
 for(const aloc of [
  [{inicioMin:660,fimMin:720,funcao:'Caixa'},{inicioMin:690,fimMin:730,funcao:'Atendente'}],
  [{inicioMin:400,fimMin:500,funcao:'Caixa'}],
  [{inicioMin:660,fimMin:720,funcao:'Enfermeiro'}],
  [null]
 ]){
  d.alocacoesFuncao=aloc;assert(validarAlocacoes(r.colaborador,d));
  assert(analisar(s,[r]).avisos.length);assert(domain(s).validarLegal(r.colaborador,r.dias,r.diasContexto,r.diasApuracao).some(i=>i.tipo==='FUNCAO_NAO_HABILITADA'));
 }
});
test('função alocada atravessando almoço não vira presença durante o intervalo',()=>{
 const s=multi(),r=s.escalaGerada.resultado[0];
 for(const d of r.dias.filter(d=>d.status==='T')) d.alocacoesFuncao=[{inicioMin:660,fimMin:840,funcao:'Caixa'}];
 s.demandasCobertura=[{...s.demandasCobertura[1],inicio:'11:00',fim:'14:00'}];
 const rel=analisar(s,[r]);
 assert.equal(rel.avisos.length,0);
 assert(rel.lacunas.every(l=>l.inicioMin===720&&l.fimMin===780));
 assert(rel.periodos.filter(p=>p.inicioMin===660||p.inicioMin===780).every(p=>p.presentes===1));
});
test('transporte compactado e validação do preenchimento preservam alocações sem compartilhar referências',async()=>{
 const {compactarSnapshot,expandirSnapshot}=await import('../assets/js/state/snapshot.js');
 const {validateSnapshot}=await import('../assets/js/state/workspace.js');
 const s=multi(true);s.escalaGerada=aplicar(s,buscar(s));
 const original=JSON.parse(JSON.stringify(s));
 const restaurado=validateSnapshot(expandirSnapshot(JSON.parse(JSON.stringify(compactarSnapshot(s)))));
 assert.deepEqual(restaurado,original);
 const dias=restaurado.escalaGerada.resultado[0].dias.filter(d=>d.alocacoesFuncao?.length);
 dias[0].alocacoesFuncao[0].funcao='Outro';
 assert.notEqual(dias[1].alocacoesFuncao[0].funcao,'Outro');
 assert.deepEqual(JSON.parse(JSON.stringify(s)),original);
});
test('disponibilidade da proposta mantém o Turno B mesmo sem cobertura cadastrada',async()=>{
 const {janelasDeclaradas}=await import('../assets/js/domain/disponibilidade.js');
 const s=empresa();Object.assign(s,{aplicarProposta5x2:true,tipoEscala:'5x2',turnosRevezamento:true,entradaTurnoB:'14:00'});
 s.horariosOrigemCobertura={jornada:s.jornada,horarioPorDia:false,turnosRevezamento:true,entradaTurnoB:'14:00'};
 const janelas=janelasDeclaradas(s,s.colaboradores[0],{data:'2027-02-08',weekday:1});
 assert(janelas.some(j=>j.inicio<=840&&j.fim>=1560));
});
test('restrição explícita em outro turno permite planejar dentro dela sem herdar a janela antiga',async()=>{
 const {janelaDaProposta}=await import('../assets/js/domain/janela-proposta.js');
 const s=empresa();s.aplicarProposta5x2=true;
 s.colaboradores[0].restricoes={horariosPermitidos:[{dia:1,entrada:'20:00',saida:'23:00'}]};
 const j=janelaDaProposta(s,s.colaboradores[0],{data:'2027-02-08',weekday:1},s.jornada);
 assert.equal(j.entrada,'20:00');assert.equal(j.saida,'23:00');
});
test('capacidade por função contabiliza as horas efetivamente alocadas sem duplicar o total',async()=>{
 const {diagnosticarEquipe}=await import('../assets/js/domain/diagnostico-equipe.js');
 for(const fixa of [false,true]){
  const s=multi(fixa),e=aplicar(s,buscar(s));
  const d=diagnosticarEquipe(s,e.resultado),porFuncao=Object.fromEntries(d.funcoes.map(f=>[f.funcao,f.disponiveis]));
  assert.equal(porFuncao.Atendente,35);assert.equal(porFuncao.Caixa,5);
  assert.equal(Object.values(porFuncao).reduce((a,b)=>a+b,0),40);
 }
});
test('rateio em mês iniciado no meio da semana não altera o contexto fora do período e pode ser aplicado',()=>{
 const s=empresa();s.coberturaAtiva=true;s.demandasCobertura=[{id:1,funcao:'Atendente',inicio:'08:00',fim:'11:00',minimo:1,diasSemana:[1,2,3,4,5],incluirFeriados:false}];
 const p=converter(s,{...op,periodo:'2027-04'}).proposta.config;
 for(const r of p.escalaGerada.resultado)for(const campo of ['dias','diasContexto','diasApuracao'])for(const d of r[campo]||[])
  if(d.status==='T'){d.horas=8;d.horasPrevistas=8;d.horasComputadasCCT=8;d.saidaMin=1080;}
 const original=structuredClone(p.escalaGerada),plano=buscar(p);
 assert(plano.alteracoes.length>0);
 assert(plano.alteracoes.every(a=>a.data>='2027-04-01'&&a.data<='2027-04-30'));
 const novo=aplicar(p,plano);
 for(let i=0;i<novo.resultado.length;i++)
  assert.deepEqual(novo.resultado[i].dias.filter(d=>d.data<'2027-04-01'||d.data>'2027-04-30'),original.resultado[i].dias.filter(d=>d.data<'2027-04-01'||d.data>'2027-04-30'));
 assert.equal(erros(novo).length,0);
});
