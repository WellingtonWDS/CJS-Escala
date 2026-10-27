const {test}=require('node:test');
const assert=require('node:assert/strict');
test('DEMO preenchido: cinco colaboradores, origem 44h e proposta 40h sem lacunas',async()=>{
 const {criarEstadoDemo}=await import('../database/demo/state.mjs');
 const {pendenciasPreenchimento}=await import('../assets/js/domain/preenchimento.js');
 const {gerarReferenciaAtual,converterEscala}=await import('../assets/js/domain/conversao.js');
 const state=criarEstadoDemo(), original=structuredClone(state);
 assert.equal(state.colaboradores.length,5);
 assert.deepEqual(pendenciasPreenchimento(state,state.destinoConversao),[]);
 const atual=gerarReferenciaAtual(state), nova=converterEscala(state,state.destinoConversao);
 for(const resultado of [atual.escala,nova.proposta.config.escalaGerada])
  assert.equal(resultado.validacoes.some(v=>v.issues.some(i=>i.severidade==='erro')),false);
 assert.equal(nova.comparacao.status,'suficiente');
 assert.equal(nova.comparacao.faltantesDepois,0);
 for(const r of atual.escala.resultado){
  const semana=r.dias.filter(d=>d.data>='2026-10-19' && d.data<='2026-10-25');
  assert.equal(semana.reduce((v,d)=>v+d.horas,0),44);
 }
 for(const r of nova.proposta.config.escalaGerada.resultado){
  const semana=r.dias.filter(d=>d.data>='2028-02-07' && d.data<='2028-02-13');
  assert.equal(semana.reduce((v,d)=>v+d.horas,0),40);
  assert.equal(semana.filter(d=>d.status==='F').length,2);
 }
 assert.deepEqual(state,original);
 // Adicionar demanda no sábado permite testar um diagnóstico de insuficiência.
 state.demandasCobertura.push({id:5,funcao:'Supervisor',inicio:'09:00',fim:'12:00',minimo:1,diasSemana:[6],incluirFeriados:false});
 assert.ok(converterEscala(state,state.destinoConversao).comparacao.faltantesDepois>0);
});
