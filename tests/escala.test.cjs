const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
function app(){
  const elements=new Map(),storage=new Map();
  const document={getElementById(id){if(!elements.has(id)) elements.set(id,{value:'',innerHTML:'',textContent:'',style:{},classList:{toggle(){}},querySelectorAll(){return []}});return elements.get(id)}};
  const ctx=vm.createContext({document,console,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},alert(){},confirm(){return true},prompt(){return null}});
  vm.runInContext(script,ctx);
  return source=>vm.runInContext(source,ctx);
}
test('feriado dispensa sua parcela de horas, sem concentrá-las nos demais dias',()=>{
 const run=app();const r=run(`state.tipoEscala='5x2';state.diasTrabalho=[1,2,3,4,5];const ds=gerarEscalaColaborador(state.colaboradores[0],0,new Date(2026,8,7),new Date(2026,8,13),{'2026-09-07':{nome:'Independência',trabalhado:false}});({total:ds.reduce((s,d)=>s+d.horas,0),max:Math.max(...ds.map(d=>d.horas)),alertas:validarJornadaDiaria(state.colaboradores[0],ds).filter(i=>i.tipo==='JORNADA_DIARIA').length})`);
 assert.equal(r.total,35.2);assert.equal(r.max,8.8);assert.equal(r.alertas,4);
});
test('validações de carga, intervalo e descanso usam as horas individuais',()=>{
 const run=app();const r=run(`state.jornada={entrada:'08:00',intInicio:'12:00',intFim:'12:00',saida:'17:00'};const d={data:'2026-09-01',weekday:2,status:'T',horas:11,turno:'A'};atualizarHorarioEfetivo(d);const d2={...d,data:'2026-09-02',horas:8};state.jornada.entrada='05:00';atualizarHorarioEfetivo(d2);({daily:validarJornadaDiaria(state.colaboradores[0],[d]).some(i=>i.tipo==='JORNADA_DIARIA'),intra:validarIntervalosIntrajornada(state.colaboradores[0],[d]).length,inter:validarInterjornada([d,d2]).length})`);
 assert.equal(r.daily,true);assert.equal(r.intra,1);assert.equal(r.inter,1);
});
test('12x36 mantém alternância e 36h de descanso nas viradas de mês/ano',()=>{
 const run=app();assert.equal(run(`state.tipoEscala='12x36';let ok=true;for(const start of [new Date(2026,6,30),new Date(2026,11,30)])for(let idx=0;idx<2;idx++){const ds=gerarEscalaColaborador(state.colaboradores[idx],idx,start,addDays(start,8),{});const work=ds.filter(d=>d.status==='T');ok &&=work.every(d=>d.saidaMin-d.entradaMin===720);ok &&=validarInterjornada(ds).length===0;for(let i=1;i<ds.length;i++)ok &&=ds[i].status!==ds[i-1].status;}ok`),true);
});
test('folgas rotativas evitam sete dias consecutivos em todas as combinações',()=>{
 const run=app();assert.equal(run(`state.diasTrabalho=[0,1,2,3,4,5,6];let ok=true;for(let mask=1;mask<128;mask++){state.folgaDiasPermitidos=Array.from({length:7},(_,i)=>i).filter(i=>mask&(1<<i));const ds=gerarEscalaColaborador(state.colaboradores[0],0,new Date(2026,8,1),new Date(2026,9,31),{});let n=0;for(const d of ds){n=d.status==='T'?n+1:0;ok &&=n<=6;}}ok`),true);
});
test('edição manual que cria sete dias seguidos é sinalizada',()=>{
 const run=app();assert.equal(run(`const ds=Array.from({length:7},(_,i)=>({data:isoDate(2026,8,i+7),weekday:i,status:'T',horas:8}));validarRepousoSemanal(state.colaboradores[0],ds).some(i=>i.tipo==='DIAS_CONSECUTIVOS')`),true);
});
test('mudanças de mês e regime invalidam dados, grade e comparativo',()=>{
 for(const [id,value] of [['cfg-mes','9'],['regime-jornada','definitivo40'],['instrumento-compensacao','act_cct']]){
 const run=app();assert.equal(run(`state.escalaGerada={validacoes:['antiga']};document.getElementById('resultado-gerar').innerHTML='ANTIGA';document.getElementById('pec-resultado').innerHTML='ANTIGO';document.getElementById('${id}').onchange({target:{value:'${value}'}});state.escalaGerada===null && !document.getElementById('resultado-gerar').innerHTML.includes('ANTIGA') && document.getElementById('pec-resultado').innerHTML===''`),true);
 }
});
test('feriado local fica vinculado a mês/ano e reaparece ao retornar',()=>{
 const run=app();assert.equal(run(`state.feriados=[{dia:15,nome:'Local',tipo:'municipal',mes:8,ano:2026}];state.mes=9;inicializarFeriadosDoMes();const outubro=state.feriados.some(f=>f.nome==='Local');state.mes=8;inicializarFeriadosDoMes();!outubro && state.feriados.some(f=>f.nome==='Local')`),true);
});
test('turnos têm entradas diferentes e trocam semanalmente',()=>{
 const run=app();assert.equal(run(`state.turnosRevezamento=true;state.entradaTurnoB='14:00';const a=gerarEscalaColaborador(state.colaboradores[0],0,new Date(2026,8,7),new Date(2026,8,20),{});const b=gerarEscalaColaborador(state.colaboradores[1],1,new Date(2026,8,7),new Date(2026,8,20),{});a[0].turno!==b[0].turno && a[0].entradaMin!==b[0].entradaMin && a[0].turno!==a[7].turno`),true);
});
test('restaura horário salvo nos campos após recarregar',()=>{
 const run=app();assert.equal(run(`state.jornada.entrada='07:00';saveState();state=JSON.parse(JSON.stringify(defaultState));document.getElementById('j-entrada').value='08:00';init();state.jornada.entrada==='07:00' && document.getElementById('j-entrada').value==='07:00'`),true);
});
test('edição rejeita minutos, negativos, texto, mais de 24h; cancelar preserva dia',()=>{
 const run=app();for(const value of ['08:99','08:60','-1','25:00','24:01','8abc',''])assert.equal(run(`parseHorasTrabalhadas(${JSON.stringify(value)})`),null);
 assert.equal(run(`parseHorasTrabalhadas('08:59')`),8+59/60);assert.equal(run(`parseHorasTrabalhadas('8,5')`),8.5);
 assert.equal(run(`state.escalaGerada={resultado:[{dias:[{dia:1,status:'F',horas:0}]}]};prompt=(()=>{let i=0;return ()=>['T','08:99'][i++]})();editarStatus(0,0);state.escalaGerada.resultado[0].dias[0].status`),'F');
});
test('12x36 respeita feriado dispensado sem reiniciar o ciclo',()=>{
 const run=app();assert.equal(run(`state.tipoEscala='12x36';state.ancora12x36='2026-09-07';const ds=gerarEscalaColaborador(state.colaboradores[0],0,new Date(2026,8,7),new Date(2026,8,10),{'2026-09-07':{nome:'Independência',trabalhado:false}});ds[0].status==='F' && ds[0].horas===0 && ds[2].status==='T'`),true);
});
test('cancelar a edição das horas preserva status e totais',()=>{
 const run=app();assert.equal(run(`state.escalaGerada={resultado:[{dias:[{dia:1,status:'F',horas:0}]}]};prompt=(()=>{let i=0;return ()=>['T',null][i++]})();editarStatus(0,0);state.escalaGerada.resultado[0].dias[0].status==='F' && state.escalaGerada.resultado[0].dias[0].horas===0`),true);
});
test('geração renderiza grade e validações usando os horários efetivos',()=>{
 const run=app();assert.equal(run(`gerarEscala();document.getElementById('resultado-gerar').innerHTML.includes('Escala mensal') && state.escalaGerada.resultado.every(r=>r.dias.every(d=>Number.isFinite(d.saidaMin)))`),true);
});
