const { test, before } = require('node:test');
const assert = require('node:assert/strict');
let base, domain, buscar, aplicar, desfazer, analisar, naoPiora;
before(async()=>{
 ({createDefaultState:base}=await import('../assets/js/state/store.js'));
 ({createDomain:domain}=await import('../assets/js/domain/index.js'));
 ({buscarAjustesCobertura:buscar,aplicarAjustesCobertura:aplicar,desfazerAjustesCobertura:desfazer,coberturaNaoPiora:naoPiora}=await import('../assets/js/domain/ajustes-cobertura.js'));
 ({analisarCobertura:analisar}=await import('../assets/js/domain/cobertura.js'));
});
function empresa(n=1, extra={}) {
 const s=base(new Date(2026,9,26));
 Object.assign(s,{diaInicio:26,tipoEscala:'5x2',diasTrabalho:[1,2,3,4,5],modoRegime:'simulacao',regimeJornada:'definitivo40',coberturaAtiva:true,feriados:[],feriadosExcluidos:['2026-10-12'],jornada:{entrada:'08:00',intInicio:'12:00',intFim:'13:00',saida:'18:00'},...extra});
 s.colaboradores=Array.from({length:n},(_,i)=>({id:i+1,nome:`Pessoa ${i+1}`,cargo:'Atendente',sexo:'masculino',horasSemana:40}));
 s.demandasCobertura=[demanda('Atendente','09:00','18:00')];
 return s;
}
function demanda(funcao,inicio,fim,id=1) {return {id,funcao,inicio,fim,minimo:1,diasSemana:[1,2,3,4,5],incluirFeriados:false};}
function gerar(s){s.escalaGerada=domain(s).gerarDadosEscala();return s;}
function conferir(s,p) {
 const novo=aplicar(s,p);
 assert(novo.validacoes.every(v=>!v.issues.some(i=>i.severidade==='erro')));
 assert(naoPiora(analisar(s,s.escalaGerada.resultado),novo.coberturaOperacional));
 for(let i=0;i<novo.resultado.length;i++)
  assert.equal(novo.resultado[i].dias.reduce((s,d)=>s+d.horas,0),s.escalaGerada.resultado[i].dias.reduce((s,d)=>s+d.horas,0));
 return novo;
}
test('desloca turno e pausa atomicamente quando cada ajuste isolado abriria nova lacuna',()=>{
 const s=gerar(empresa()), original=structuredClone(s);
 const p=buscar(s);
 assert(p.acoes.some(a=>a.tipo==='horario_intervalo'));
 assert.equal(p.antes.minutosFaltantes-p.depois.minutosFaltantes,300);
 const novo=conferir(s,p);
 assert(novo.resultado[0].dias.filter(d=>d.status==='T').every(d=>d.entradaMin===540 && d.saidaMin===1080 && d.intervaloInicioMin===720));
 assert.deepEqual(s,original);
});
test('combina realocações por habilitação sem transferir a lacuna para outra função',()=>{
 const s=empresa(3,{jornada:{entrada:'08:00',intInicio:'12:00',intFim:'13:00',saida:'17:00'}});
 Object.assign(s.colaboradores[0],{cargo:'Atendente',funcoesHabilitadas:['Caixa']});
 Object.assign(s.colaboradores[1],{cargo:'Estoque',funcoesHabilitadas:['Atendente']});
 s.colaboradores[2].cargo='Estoque';
 s.demandasCobertura=['Atendente','Caixa','Estoque'].map((f,i)=>demanda(f,'09:00','12:00',i+1));
 gerar(s); const p=buscar(s);
 assert.equal(p.depois.minutosFaltantes,0);
 assert(p.acoes.every(a=>a.tipo==='funcoes_combinadas'));
 const novo=conferir(s,p);
 for(const periodo of novo.coberturaOperacional.periodos) assert.equal(periodo.presentes,1);
 const semHabilitacao=structuredClone(s);
 delete semHabilitacao.colaboradores[1].funcoesHabilitadas;
 gerar(semHabilitacao);
 assert.equal(buscar(semHabilitacao).alteracoes.length,0);
});
test('busca fixa altera toda a recorrência semanal e contexto; aplicar/desfazer mantém padrão e horas',()=>{
 const s=gerar(empresa(2,{modeloEscala:'fixa',dataReferenciaFixa:'2026-10-26'}));
 for(const r of s.escalaGerada.resultado)
  for(const d of [...r.diasContexto,...r.diasApuracao,...r.dias]) {
   const [ano,mes]=d.data.split('-').map(Number);
   d.ano=ano; d.mes=mes-1;
   d.marcadorCalendario=`ocorrência ${d.data}`;
  }
 const original=structuredClone(s.escalaGerada), p=buscar(s);
 assert(p.alteracoes.length>0);
 const novo=conferir(s,p);
 for(const r of novo.resultado) {
  const porDia=new Map();
  for(const d of [...r.diasContexto,...r.diasApuracao,...r.dias]) {
   const [ano,mes,dia]=d.data.split('-').map(Number);
   assert.equal(d.dia,dia);
   assert.equal(d.mes,mes-1);
   assert.equal(d.ano,ano);
   assert.equal(d.marcadorCalendario,`ocorrência ${d.data}`);
   const valor=JSON.stringify([d.status,d.horas,d.entradaMin,d.intervaloInicioMin,d.intervaloFimMin,d.saidaMin,d.funcaoAlocada]);
   if(porDia.has(d.weekday)) assert.equal(valor,porDia.get(d.weekday));
   porDia.set(d.weekday,valor);
  }
 }
 s.escalaGerada=JSON.parse(JSON.stringify(novo));
 assert.deepEqual(desfazer(s).resultado,original.resultado);
});
test('restrição manual em qualquer repetição fixa impede mudar aquele dia da semana',()=>{
 const s=gerar(empresa(1,{modeloEscala:'fixa',dataReferenciaFixa:'2026-10-26'}));
 const segunda=s.escalaGerada.resultado[0].dias.find(d=>d.weekday===1);
 segunda.ajusteManual=true;
 const p=buscar(s);
 assert(p.alteracoes.every(a=>a.depois.weekday!==1));
 const repetida=buscar(s,{limiteTentativas:15});
 assert.deepEqual(repetida,buscar(s,{limiteTentativas:15}));
 assert(repetida.tentativas<=15);
});
