const {test}=require('node:test');
const assert=require('node:assert/strict');
const cenario=require('./helpers/cenario-redistribuicao.cjs');
async function cadeia(n){
 const s=await cenario();
 const {createDomain}=await import('../assets/js/domain/index.js');
 const {minToTime}=await import('../assets/js/domain/datas-horas.js');
 s.jornada.saida=n===3?'22:00':'02:00';
 const modelo=s.colaboradores[0];
 s.colaboradores=Array.from({length:n},(_,i)=>{
  const c=structuredClone(modelo);c.id=i+1;c.nome=`Colaborador ${c.id}`;
  for(const d of Object.values(c.quadroDominio.semana))if(d.status==='trabalho')d.jornada={entrada:minToTime(480+i*240),saida:minToTime(720+i*240),intInicio:'',intFim:''};
  return c;
 });
 s.demandasCobertura[0].fim=n===3?'21:00':'01:00';s.demandasCobertura[0].diasSemana=[1];
 s.escalaGerada=createDomain(s).gerarDadosEscala();return s;
}
test('busca padrão resolve cadeias de três e mais de quatro operações, incluindo virada noturna',async()=>{
 const {buscarAjustesCobertura:buscar,aplicarAjustesCobertura:aplicar,desfazerAjustesCobertura:desfazer}=await import('../assets/js/domain/ajustes-cobertura.js');
 for(const n of[3,4]){
  const s=await cadeia(n),original=structuredClone(s),p=buscar(s,{agora:()=>0});
  assert.equal(p.limiteTempoMs,30000);assert.equal(p.depois.minutosFaltantes,0);
  assert(p.acoes.some(a=>a.profundidade>=n));assert(p.profundidadeMaxima>=n);
  assert.equal(p.buscaEncadeada,true);assert.deepEqual(s,original);
  const nova=aplicar(s,JSON.parse(JSON.stringify(p)));
  assert(nova.validacoes.every(v=>v.issues.every(i=>i.severidade!=='erro')));
  assert.equal(nova.coberturaOperacional.lacunas.length,0);
  assert.deepEqual(desfazer({...s,escalaGerada:nova}).resultado,original.escalaGerada.resultado);
 }
});
test('prazo encerra com explicação correta e conserva escala, usando relógio determinístico',async()=>{
 const {buscarAjustesCobertura}=await import('../assets/js/domain/ajustes-cobertura.js');
 const {renderExplicacaoBusca}=await import('../assets/js/ui/explicacao-busca.js');
 const s=await cenario(),original=structuredClone(s);let tempo=0;
 const p=buscarAjustesCobertura(s,{limiteTempoMs:15,agora:()=>tempo+=10});
 assert.equal(p.diagnosticoBusca.encerramento,'limite_tempo');
 assert.equal(p.alteracoes.length,0);assert.deepEqual(s,original);
 assert.match(renderExplicacaoBusca(p),/não esgotar todas as combinações|sem esgotar todas as combinações/);
 assert.doesNotMatch(renderExplicacaoBusca(p),/30 segundos|Tempo de busca|tempo máximo/);
 assert.match(renderExplicacaoBusca(p),/sem teto fixo de profundidade/);
});
test('orçamento de estados e avaliações não vira um limite fixo de operações por cadeia',async()=>{
 const {buscarAjustesCobertura}=await import('../assets/js/domain/ajustes-cobertura.js');
 const s=await cadeia(4),p=buscarAjustesCobertura(s,{limiteTentativas:3,agora:()=>0});
 assert(p.tentativas<=3);assert.equal(p.limiteAcoes,p.limiteTentativas);
 assert(p.depois.minutosFaltantes>0);
 assert.notEqual(p.diagnosticoBusca.encerramento,'objetivos_atendidos');
});
