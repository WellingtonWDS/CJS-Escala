const {test,before}=require('node:test');
const assert=require('node:assert/strict');
let empresas, domain, converter, pendencias, diagnosticar, sugerir, atualizar, analisar;
before(async()=>{
 ({criarCenariosSegmentos:empresas}=await import('../database/demo/segmentos.mjs'));
 ({createDomain:domain}=await import('../assets/js/domain/index.js'));
 ({converterEscala:converter}=await import('../assets/js/domain/conversao.js'));
 ({pendenciasPreenchimento:pendencias}=await import('../assets/js/domain/preenchimento.js'));
 ({diagnosticarEquipe:diagnosticar}=await import('../assets/js/domain/diagnostico-equipe.js'));
 ({sugerirIntervalosCobertura:sugerir}=await import('../assets/js/domain/intervalos-cobertura.js'));
 ({atualizarPerfilDominio:atualizar}=await import('../assets/js/import/dominio.js'));
 ({analisarCobertura:analisar}=await import('../assets/js/domain/cobertura.js'));
});
for(const [empresa,quantos] of [[0,3],[1,2],[2,3],[3,3]]) for(let modelo=0;modelo<quantos;modelo++) {
 test(`DEMO segmento ${empresa+1}, modelo ${modelo+1}: preenchimento, jornada e diagnóstico`,()=>{
  const e=empresas()[empresa], d=e.drafts[modelo], s=d.state, original=structuredClone(s);
  assert.deepEqual(pendencias(s,s.destinoConversao),[]);
  const escala=domain(s).gerarDadosEscala();
  assert.equal(escala.validacoes.some(v=>v.issues.some(i=>i.severidade==='erro')),false);
  const rel=escala.coberturaOperacional;
  if(d.tipo==='cobertura') assert.equal(rel.lacunas.length,0);
  else assert.ok(rel.lacunas.length>0);
  if(empresa===2) {
   assert.throws(()=>converter(s,s.destinoConversao),/conversão atual atende à origem 6/);
   if(d.tipo==='contratacao') assert.equal(diagnosticar(s,escala.resultado).status,'capacidade_insuficiente');
  } else {
   const c=converter(s,s.destinoConversao);
   if(d.tipo==='contratacao') {
    assert.ok(c.comparacao.faltantesDepois>0);
    assert.equal(c.comparacao.status,'insuficiente');
    assert.equal(diagnosticar(c.proposta.config,c.proposta.config.escalaGerada.resultado).status,'capacidade_insuficiente');
   }
   if(d.tipo==='readequacao') {
    assert.equal(diagnosticar(s,escala.resultado).status,'redistribuicao');
    const ajustada=sugerir(s,escala);
    assert.ok(ajustada.sugestoesIntervalos.length>0);
    const deficit=r=>r.lacunas.reduce((v,p)=>v+(p.fimMin-p.inicioMin)*p.faltantes,0);
    assert.ok(deficit(analisar(s,ajustada.resultado))<deficit(rel));
   }
   if(empresa===1 && d.tipo==='cobertura') assert.equal(c.comparacao.status,'suficiente');
  }
  assert.deepEqual(s,original);
 });
}
test('DEMO: horários de funcionamento e pausa coletiva não viram demanda de cobertura',()=>{
 const es=empresas();
 for(const s of es[0].drafts.map(d=>d.state)) {
  assert.ok(s.demandasCobertura.some(d=>d.inicio==='08:00'&&d.fim==='18:00'&&d.diasSemana.length===5));
  assert.ok(s.demandasCobertura.some(d=>d.inicio==='08:00'&&d.fim==='14:00'&&d.diasSemana[0]===6));
 }
 const s=es[1].drafts[0].state;
 assert.ok(s.colaboradores.every(c=>c.quadroDominio.semana[6].status==='compensado'));
 for(const c of s.colaboradores) for(const d of [1,2,3,4,5]) {
  assert.equal(c.quadroDominio.semana[d].jornada.intInicio,'12:00');
  assert.equal(c.quadroDominio.semana[d].jornada.intFim,'13:00');
 }
 assert.ok(s.demandasCobertura.every(d=>d.fim<='12:00'||d.inicio>='13:00'));
 const atual=domain(s).gerarDadosEscala();
 for(const r of atual.resultado) assert.equal(r.dias.filter(d=>d.data>='2026-10-19'&&d.data<='2026-10-25').reduce((t,d)=>t+d.horas,0),44);
 for(const s of es[3].drafts.map(d=>d.state)) assert.ok(s.demandasCobertura.every(d=>d.inicio==='06:00'&&d.fim==='20:30'));
});
test('Entidade: readequar grupos A/B elimina lacunas sem contratar ou encurtar 36h de descanso',()=>{
 const s=empresas()[2].drafts[1].state;
 for(const c of s.colaboradores.filter(c=>c.quadroDominio.tipo==='ciclo')) {
  c.quadroDominio.ancora=c.nome.endsWith('Grupo B')?'2026-10-02':'2026-10-01';
  atualizar(c,s);
 }
 const escala=domain(s).gerarDadosEscala();
 assert.equal(escala.coberturaOperacional.lacunas.length,0);
 for(const r of escala.resultado.filter(r=>r.colaborador.quadroDominio.tipo==='ciclo')) {
  const ds=r.dias.filter(d=>d.status==='T'||d.status==='FE');
  for(let i=1;i<ds.length;i++) {
   const minuto=d=>Date.parse(d.data+'T00:00:00Z')/60000;
   assert.ok(minuto(ds[i])+ds[i].entradaMin-(minuto(ds[i-1])+ds[i-1].saidaMin)>=36*60);
  }
 }
});
test('DEMO: identificadores únicos, CNPJs de teste válidos e SQL publicado sincronizado',async()=>{
 const {validCnpj}=await import('../assets/js/shared/empresas.js');
 const {readFile}=await import('node:fs/promises');const dados=empresas();
 const ids=dados.flatMap(e=>[e.id,...e.drafts.map(d=>d.id)]);
 assert.equal(new Set(ids).size,ids.length);
 assert.ok(dados.every(e=>validCnpj(e.cnpj)));
 const template=await readFile(new URL('../database/demo/segmentos.template.sql','file://'+__filename),'utf8');
 assert.equal(await readFile(new URL('../database/demo/segmentos.sql','file://'+__filename),'utf8'),template.replace('__DEMO_SEGMENTOS__',JSON.stringify(dados)));
});
