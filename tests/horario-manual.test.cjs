const {test,before}=require('node:test');
const assert=require('node:assert/strict');
let base,domain,editar,validar,desfazer,modelo,csv;
before(async()=>{
 ({createDefaultState:base}=await import('../assets/js/state/store.js'));
 ({createDomain:domain}=await import('../assets/js/domain/index.js'));
 ({aplicarHorarioManual:editar,validarHorarioManual:validar,desfazerHorarioRecorrente:desfazer}=await import('../assets/js/domain/horario-manual.js'));
 modelo=await import('../assets/js/domain/modelo-escala.js');
 ({gerarCsv:csv}=await import('../assets/js/export/csv.js'));
});
const horario=(entrada='08:00',saida='17:00',intInicio='12:00',intFim='13:00')=>({entrada,saida,intInicio,intFim});
function empresa(fixa=false){const s=base(new Date(2026,9,28));Object.assign(s,{modeloEscala:fixa?'fixa':'dinamica',tipoEscala:'5x2',folgasFimSemana:true,jornada:horario(),modoRegime:'simulacao',regimeJornada:'definitivo40'});s.escalaGerada=domain(s).gerarDadosEscala();return s;}
const primeiro=(s,wd=1)=>modelo.diasDoModelo({...s,modeloEscala:'fixa'},s.escalaGerada.resultado[0].dias).find(d=>d.weekday===wd);
test('edição aceita meio período sem intervalo e calcula horários noturnos e meia-noite',()=>{
 assert.equal(validar(horario('08:00','12:00','','')).intervalo,0);
 assert.equal(validar(horario('22:00','06:00','02:00','03:00')).saida,1800);
 assert.equal(validar(horario('20:00','00:00','','')).saida,1440);
 assert.equal(validar(horario('22:00','06:00','00:00','01:00')).intInicio,1440);
});
test('edição rejeita pausa parcial, fora de ordem, fora da jornada, relógio inválido e duração zero',()=>{
 for(const j of [horario('08:00','12:00','10:00',''),horario('08:00','17:00','14:00','13:00'),horario('08:00','17:00','18:00','19:00'),horario('08:99'),horario('08:00','08:00','',''),horario('08:00','','',''),horario('08:00','17:00','12:00','12:00')]) assert.throws(()=>validar(j));
});
test('dinâmica altera só a data escolhida, mantém cópias sincronizadas e permite desfazer no fluxo existente',async()=>{
 const s=empresa(),d=primeiro(s),antes=structuredClone(s.escalaGerada);
 s.escalaGerada=editar(s,1,d.data,'T',horario('09:00','13:00','',''));
 const r=s.escalaGerada.resultado[0];assert.equal(r.dias.find(x=>x.data===d.data).horas,4);
 assert.deepEqual(r.dias.filter(x=>x.data!==d.data),antes.resultado[0].dias.filter(x=>x.data!==d.data));
 assert.equal(r.diasApuracao.find(x=>x.data===d.data).entradaMin,540);
 const {desfazerUltimaEdicaoManual}=await import('../assets/js/domain/edicao-manual.js');
 const volta=desfazerUltimaEdicaoManual(s);assert.deepEqual(volta.resultado,antes.resultado);
});
test('fixa edita o mesmo dia em todas as semanas/contextos e deixa os colegas intactos',()=>{
 const s=empresa(true),d=primeiro(s),original=structuredClone(s.escalaGerada);
 s.escalaGerada=editar(s,1,d.data,'T',horario('08:00','12:00','',''));
 const r=s.escalaGerada.resultado[0];
 for(const lista of [r.dias,r.diasContexto,r.diasApuracao]) assert(lista.filter(x=>x.weekday===1).every(x=>x.horas===4&&x.intervaloMin===0&&x.ajusteManual));
 assert.deepEqual(s.escalaGerada.resultado[1],original.resultado[1]);
 assert(!s.escalaGerada.validacoes[0].issues.some(i=>i.tipo==='PADRAO_FIXO'));
 s.escalaGerada=JSON.parse(JSON.stringify(s.escalaGerada));
 assert.deepEqual(desfazer(s).resultado,original.resultado);
});
test('fixa trabalho em folga recalcula excesso semanal, repouso e cobertura; folga retira presença',()=>{
 const s=empresa(true);s.coberturaAtiva=true;s.demandasCobertura=[{id:1,funcao:s.colaboradores[0].cargo,inicio:'08:00',fim:'12:00',minimo:1,diasSemana:[1,6],incluirFeriados:false}];
 let d=primeiro(s,6);s.escalaGerada=editar(s,1,d.data,'T',horario('08:00','12:00','',''));
 const issues=s.escalaGerada.validacoes[0].issues;
 assert(issues.some(i=>i.tipo==='JORNADA_CONTRATUAL'&&i.severidade==='erro'));
 assert(issues.some(i=>i.tipo==='REPOUSO_SEMANAL'&&i.severidade==='erro'));
 assert(!s.escalaGerada.coberturaOperacional.lacunas.some(l=>l.data.endsWith('10-10')));
 d=primeiro(s,1);s.escalaGerada=editar(s,1,d.data,'F');
 assert(s.escalaGerada.resultado[0].dias.filter(x=>x.weekday===1).every(x=>x.horas===0&&x.status==='F'));
 assert(s.escalaGerada.coberturaOperacional.lacunas.length>0);
});
test('restrições individuais impedem alterações inválidas sem mutação e edição desatualizada não desfaz',()=>{
 const s=empresa(true),d=primeiro(s),antes=structuredClone(s.escalaGerada);
 s.escalaGerada.resultado[0].colaborador.restricoes={horariosPermitidos:[{dia:1,entrada:'09:00',saida:'17:00'}]};
 const snapshot=structuredClone(s.escalaGerada);
 assert.throws(()=>editar(s,1,d.data,'T',horario()),/janela permitida/);assert.deepEqual(s.escalaGerada,snapshot);
 delete s.escalaGerada.resultado[0].colaborador.restricoes;
 s.escalaGerada=editar(s,1,d.data,'T',horario('09:00','13:00','',''));s.colaboradores[0].nome='Mudou';
 assert.throws(()=>desfazer(s),/escala mudou/);
});
test('CSV conserva os horários editados, intervalo e virada de dia nos dois modelos',()=>{
 for(const fixa of [false,true]){const s=empresa(fixa),d=primeiro(s);s.jornada=horario('22:00','06:00','02:00','03:00');s.escalaGerada=editar(s,1,d.data,'T',horario('22:00','06:00','02:00','03:00'));const arquivo=csv(s);assert.match(arquivo,/22:00/);assert.match(arquivo,/06:00/);assert.match(arquivo,/01:00/);assert.match(arquivo,/02:00 \(\+1d\)/);assert.match(arquivo,/03:00 \(\+1d\)/);}
});
test('edição de trabalho no feriado retira abono e mantém alerta sem alterar o feriado dos colegas',()=>{
 const s=empresa(),data='2026-10-12',antes=structuredClone(s.escalaGerada);
 assert.equal(antes.resultado[0].dias.find(d=>d.data===data).status,'F');
 s.escalaGerada=editar(s,1,data,'T',horario());
 assert.equal(s.escalaGerada.resultado[0].dias.find(d=>d.data===data).feriado.trabalhado,true);
 assert(s.escalaGerada.validacoes[0].issues.some(i=>i.tipo==='FERIADO_TRABALHADO'));
 assert.deepEqual(s.escalaGerada.resultado[1],antes.resultado[1]);
 assert.equal(antes.resultado[0].dias.find(d=>d.data===data).feriado.trabalhado,false);
});
test('edição manual bloqueia trabalho em dia fechado, inclusive feriado e perfil próprio, sem impedir correção para folga',()=>{
 for(const fixa of [false,true]){
  const s=empresa(fixa),d=primeiro(s,0),id=s.escalaGerada.resultado[0].colaborador.id;
  // Um perfil individual que mencione domingo não altera o funcionamento global.
  s.escalaGerada.resultado[0].colaborador.quadroDominio={ativo:true,tipo:'semanal',modelo:'5x2',semana:{0:{status:'trabalho',jornada:horario()}}};
  const snapshot=structuredClone(s);
  for(const status of fixa?['T']:['T','FE']){
   assert.throws(()=>editar(s,id,d.data,status,horario()),/empresa não funciona.*Dom/i);
   assert.deepEqual(s,snapshot);
  }
  delete s.escalaGerada.resultado[0].colaborador.quadroDominio;
  d.status='T';d.horas=8;
  const corrigida=editar(s,id,d.data,'F');
  assert.equal(corrigida.resultado[0].dias.find(x=>x.data===d.data).status,'F');
 }
});
test('o bloqueio segue os dias configurados, permite domingo aberto e preserva turno noturno iniciado em dia aberto',()=>{
 const s=empresa(),id=s.escalaGerada.resultado[0].colaborador.id;
 const segunda=primeiro(s,1),domingo=primeiro(s,0),sabado=primeiro(s,6);
 s.diasTrabalho=s.diasTrabalho.filter(d=>d!==1).concat(0);
 assert.throws(()=>editar(s,id,segunda.data,'T',horario()),/empresa não funciona.*Seg/i);
 assert.equal(editar(s,id,domingo.data,'T',horario()).resultado[0].dias.find(d=>d.data===domingo.data).status,'T');
 s.diasTrabalho=s.diasTrabalho.filter(d=>d!==0);
 s.horarioPorDia=true;s.jornadaPorDia[6]=horario('22:00','06:00','02:00','03:00');
 const noite=editar(s,id,sabado.data,'T',horario('22:00','06:00','02:00','03:00'));
 assert.equal(noite.resultado[0].dias.find(d=>d.data===sabado.data).saidaMin,1800);
});
test('funcionamento da empresa limita horários manuais, antes do perfil individual e da permissão coletiva',()=>{
 for(const fixa of [false,true]){
  const s=empresa(fixa),sab=primeiro(s,6),seg=primeiro(s,1),id=s.escalaGerada.resultado[0].colaborador.id;
  s.horarioPorDia=true;s.jornadaPorDia[6]=horario('08:00','12:00','','');
  s.instrumentoCompensacao='act_cct';s.instrumentoColetivo={identificacao:'CCT',compensacaoDiaria:true,limiteDiario:10,inicio:'2026-01-01',fim:'2028-12-31',compativelEC141:true};
  s.escalaGerada.resultado[0].colaborador.quadroDominio={ativo:true,tipo:'semanal',modelo:'5x2',semana:{6:{status:'trabalho',jornada:horario('07:00','18:00')}}};
  const snapshot=structuredClone(s);
  for(const j of [horario('07:59','12:00','',''),horario('08:00','12:01','',''),horario('09:00','13:00','',''),horario('08:00','18:00'),horario('22:00','02:00','','')]){
   assert.throws(()=>editar(s,id,sab.data,'T',j),/funcionamento da empresa.*08:00–12:00/);
   assert.deepEqual(s,snapshot);
  }
  assert.throws(()=>editar(s,id,seg.data,'T',horario('08:00','17:24')),/funcionamento da empresa.*08:00–17:00/);
  delete s.escalaGerada.resultado[0].colaborador.quadroDominio;
  const nova=editar(s,id,sab.data,'T',horario('08:00','12:00','',''));
  assert.equal(nova.resultado[0].dias.find(d=>d.data===sab.data).horas,4);
  if(fixa)assert(nova.resultado[0].dias.filter(d=>d.weekday===6).every(d=>d.saidaMin===720));
 }
});
