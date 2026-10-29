const { test } = require("node:test");
const assert = require("node:assert/strict");
async function gerar(h, pausa) {
  const { createDefaultState } = await import("../assets/js/state/store.js");
  const { createDomain } = await import("../assets/js/domain/index.js");
  const s = createDefaultState();
  s.ano = 2026;
  s.mes = 9;
  s.modoRegime = "simulacao";
  s.regimeJornada = "atual44";
  s.jornada = {
    entrada: "08:00",
    intInicio: pausa ? "10:00" : "",
    intFim: pausa
      ? `${String(10 + Math.floor(pausa / 60)).padStart(2, "0")}:${String(pausa % 60).padStart(2, "0")}`
      : "",
    saida: `${String(8 + h + Math.floor(pausa / 60)).padStart(2, "0")}:${String(pausa % 60).padStart(2, "0")}`,
  };
  s.colaboradores = [
    {
      id: 1,
      nome: "Pessoa",
      cargo: "Atendente",
      sexo: "masculino",
      horasSemana: 40,
    },
  ];
  const domain = createDomain(s);
  return domain.validarLegal(s.colaboradores[0], [
    {
      data: "2026-10-05",
      weekday: 1,
      status: "T",
      horas: h,
      entradaMin: 480,
      saidaMin: 480 + h * 60 + pausa,
      intervaloMin: pausa,
      intervaloInicioMin: pausa ? 600 : null,
      intervaloFimMin: pausa ? 600 + pausa : null,
      jornadaAplicada: s.jornada,
    },
  ]);
}
test("art71: 4h sem pausa, 5/6h com 15min, mais de6 com60 e teto120", async () => {
  for (const [h, p, erro] of [
    [4, 0, false],
    [5, 0, true],
    [5, 15, false],
    [6, 15, false],
    [7, 15, true],
    [7, 60, false],
    [7, 120, false],
    [7, 135, true],
  ]) {
    const issues = await gerar(h, p);
    assert.equal(
      issues.some((i) =>
        ["INTRAJORNADA", "INTRAJORNADA_MAXIMA"].includes(i.tipo),
      ),
      erro,
      `${h}h/${p}min`,
    );
  }
});
test("sugestão de jornada de 8h inicia entre3h e5h, preservando duração e turno noturno", async () => {
  const { alternativasIntervalo } =
    await import("../assets/js/domain/intervalos-cobertura.js");
  for (const entrada of [480, 1200]) {
    const d = {
      data: "2026-10-05",
      weekday: 1,
      status: "T",
      horas: 8,
      entradaMin: entrada,
      saidaMin: entrada + 600,
      intervaloMin: 120,
      intervaloInicioMin: entrada + 360,
      intervaloFimMin: entrada + 480,
    };
    const options = [...alternativasIntervalo({}, d)];
    assert.deepEqual(options.map(x=>x.intervaloInicioMin-entrada), [180,195,210,225,240,255,270,285,300]);
    for (const x of options) {
      assert(x.intervaloInicioMin - entrada >= 180);
      assert(x.intervaloInicioMin - entrada <= 300);
      assert.equal(x.intervaloFimMin - x.intervaloInicioMin, 120);
      assert.equal(x.saidaMin, d.saidaMin);
    }
  }
});

test("faixa próxima de8h cobre 7h a9h, sem impor almoço de3h a jornadas curtas", async()=> {
 const {alternativasIntervalo}=await import('../assets/js/domain/intervalos-cobertura.js');
 for(const horas of [5,6,7,7.5,8,8.4,9]) {
   const pausa=horas<=6?15:60;
   const d={data:'2026-10-05',weekday:1,status:'T',horas,entradaMin:480,saidaMin:480+horas*60+pausa,intervaloMin:pausa,intervaloInicioMin:480+120,intervaloFimMin:480+120+pausa};
   const op=[...alternativasIntervalo({},d)];assert(op.length);
   if(horas>=7)assert(op.every(x=>x.intervaloInicioMin>=660&&x.intervaloInicioMin<=780));
   else assert(op.some(x=>x.intervaloInicioMin<660));
   assert(op.every(x=>x.intervaloFimMin<x.saidaMin&&x.horas===horas));
 }
});

test('proposta sem demanda operacional reposiciona almoço cedo/tarde e preserva origem',async()=>{
 const {createDefaultState}=await import('../assets/js/state/store.js');
 const {converterEscala}=await import('../assets/js/domain/conversao.js');
 for(const inicio of ['10:00','14:00']){
  const s=createDefaultState(new Date(2026,9,1));s.ano=2026;s.mes=9;s.coberturaAtiva=false;
  s.jornada={entrada:'08:00',intInicio:inicio,intFim:inicio==='10:00'?'12:00':'16:00',saida:'18:00'};
  s.colaboradores=[{id:1,nome:'Pessoa',cargo:'Atendente',sexo:'masculino',horasSemana:44}];
  const snapshot=structuredClone(s);
  const result=converterEscala(s,{periodo:'2028-02',fase:'definitivo40',folgas:'fim_semana'});
  const dias=result.proposta.config.escalaGerada.resultado[0].dias.filter(d=>d.status==='T');
  assert(dias.length);assert(dias.every(d=>d.intervaloInicioMin>=660&&d.intervaloInicioMin<=780));
  assert(dias.every(d=>d.intervaloFimMin-d.intervaloInicioMin===120&&d.horas===8));
  assert.deepEqual(s,snapshot);
 }
});
