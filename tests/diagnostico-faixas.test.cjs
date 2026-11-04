const {test,before}=require('node:test');
const assert=require('node:assert/strict');
let base,domain,diagnosticar,dias,render,renderAvisos,semData;
before(async()=>{
 ({createDefaultState:base}=await import('../assets/js/state/store.js'));
 ({createDomain:domain}=await import('../assets/js/domain/index.js'));
 ({diagnosticarEquipe:diagnosticar,diasComPreposicao:dias}=await import('../assets/js/domain/diagnostico-equipe.js'));
 ({renderDiagnosticoEquipe:render}=await import('../assets/js/ui/diagnostico-equipe.js'));
 ({renderAvisosEscala:renderAvisos}=await import('../assets/js/ui/avisos-escala.js'));
 ({mensagemSemData:semData}=await import('../assets/js/ui/escala-fixa.js'));
});
function empresa(){
 const s=base(new Date(2026,9,31));
 Object.assign(s,{tipoEscala:'5x2',diaInicio:31,coberturaAtiva:true,jornada:{entrada:'08:00',intInicio:'',intFim:'',saida:'12:00'}});
 s.colaboradores=s.colaboradores.map((c,i)=>({...c,cargo:i?'VENDEDOR DE COMERCIO VAREJISTA':'MOTORISTA DE CAMINHAO',horasSemana:40}));
 s.demandasCobertura=s.colaboradores.map((c,i)=>({id:i+1,funcao:c.cargo,inicio:'08:00',fim:'14:00',minimo:1,diasSemana:[6],incluirFeriados:true}));
 return s;
}
const faltas=s=>s.colaboradores.map(colaborador=>({colaborador,dias:[]}));
test('sábados 08–12 e 12–14 viram uma faixa por função sem perder as causas',()=>{
 const s=empresa(),d=diagnosticar(s,faltas(s));
 assert.equal(d.grupos.length,2);
 for(const g of d.grupos){
  assert.equal(g.inicioMin,480);assert.equal(g.fimMin,840);assert.equal(g.faltantes,1);
  assert.match(g.resumo,/^Aos sábados, das 08:00 às 14:00: falta 1 pessoa/);
  assert.equal(g.tipo,'mista');assert.equal(g.trechos.length,2);
  assert.deepEqual(g.trechos.map(t=>[t.inicioMin,t.fimMin]),[[480,720],[720,840]]);
 }
 const html=render(d);
 assert.match(html,/Ver causas por horário/);assert.match(html,/08:00–12:00/);assert.match(html,/12:00–14:00/);
 assert(d.provas.length,'Provas de capacidade continuam independentes do resumo');
});
test('não une quantidades diferentes nem intervalos com cobertura entre eles',()=>{
 for(const gap of [false,true]){
  const s=empresa();s.colaboradores=s.colaboradores.slice(0,1);
  s.demandasCobertura=[{...s.demandasCobertura[0],fim:'12:00'},{...s.demandasCobertura[0],id:2,inicio:gap?'13:00':'12:00',fim:'14:00',minimo:gap?1:2}];
  const d=diagnosticar(s,faltas(s));assert.equal(d.grupos.length,2);
  assert(d.grupos.every(g=>g.fimMin-g.inicioMin<360));
 }
});
test('datas diferentes não viram uma falsa ocorrência contínua 08–14',()=>{
 const s=empresa();s.diaInicio=1;s.colaboradores=s.colaboradores.slice(0,1);
 const periodos=[{data:'2026-10-03',funcao:s.colaboradores[0].cargo,inicioMin:480,fimMin:720,necessarios:1,presentes:0,faltantes:1},{data:'2026-10-10',funcao:s.colaboradores[0].cargo,inicioMin:720,fimMin:840,necessarios:1,presentes:0,faltantes:1}];
 const d=diagnosticar(s,faltas(s),{configurada:true,periodos,lacunas:periodos,avisos:[]});
 assert.equal(d.grupos.length,2);assert(d.grupos.every(g=>g.datas.length===1));
 assert(!d.grupos.some(g=>g.inicioMin===480&&g.fimMin===840));
});
test('preposições corretas para dias femininos, masculinos e combinações',()=>{
 assert.equal(dias([6]),'Aos sábados');assert.equal(dias([0]),'Aos domingos');
 assert.equal(dias([0,6]),'Aos sábados e domingos');assert.equal(dias([2,4]),'Às terças e quintas');
 assert.equal(dias([5,6]),'Às sextas e aos sábados');
});
function acordo(){
 const s=base(new Date(2027,5,15));
 Object.assign(s,{modeloEscala:'fixa',dataReferenciaFixa:'2027-06-15',tipoEscala:'5x2',diasTrabalho:[1,2,3,4,5],instrumentoCompensacao:'act_cct'});
 s.colaboradores=s.colaboradores.slice(0,1).map(c=>({...c,sexo:'masculino',horasSemana:40}));
 Object.assign(s.instrumentoColetivo,{identificacao:'CCT teste',inicio:'2027-06-15',fim:'2027-06-15',compativelEC141:true,compensacaoDiaria:true,limiteDiario:10});
 return s;
}
const issues=s=>domain(s).gerarDadosEscala().validacoes.flatMap(v=>v.issues);
test('fixo confere apenas referência jurídica, mesmo se o calendário interno fica fora do ACT',()=>{
 const s=acordo();assert(!issues(s).some(i=>i.tipo==='INSTRUMENTO_FORA_VIGENCIA'));
 Object.assign(s,{ano:2030,mes:11});assert(!issues(s).some(i=>i.tipo==='INSTRUMENTO_FORA_VIGENCIA'));
});
test('fixo fora do ACT explica referência e vigência sem converter datas jurídicas em dias da semana',()=>{
 const s=acordo();s.dataReferenciaFixa='2027-06-16';
 const out=issues(s),i=out.find(i=>i.tipo==='INSTRUMENTO_FORA_VIGENCIA');
 assert(i);assert.equal(i.severidade,'erro');assert.match(i.mensagem,/16\/06\/2027/);assert.match(i.mensagem,/15\/06\/2027/);
 const html=renderAvisos([{colaborador:s.colaboradores[0],issues:[i]}],{erros:true,transformar:semData});
 assert.match(html,/16\/06\/2027/);assert.match(html,/campo Data de referência/);
 assert.doesNotMatch(html,/Corrija esta condição antes/);
});
test('dinâmico continua verificando cada data da escala',()=>{
 const s=acordo();s.modeloEscala='dinamica';
 const i=issues(s).find(i=>i.tipo==='INSTRUMENTO_FORA_VIGENCIA');
 assert(i);assert.match(i.mensagem,/Há jornadas fora da vigência/);assert.equal(i.severidade,'erro');
});
