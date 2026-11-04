import { createDomain } from "./index.js";
import { configDoPerfil } from "./perfil-dominio.js";
import { planejamento5x2 } from "./janelas-planejamento.js";
import { janelaDaProposta } from "./janela-proposta.js";
import { ajustarIntervaloDaProposta } from "./politica-intervalo.js";
import { apurarSemana } from "./resumo-semanal.js";
import { weekKey, dateFromKey } from "./datas-horas.js";

function semanas(r) {
  const grupos=new Map();
  for(const d of r.dias) {
    const key=weekKey(dateFromKey(d.data));
    if(!grupos.has(key)) grupos.set(key,[]);
    grupos.get(key).push(d);
  }
  return [...grupos.values()];
}
export function deficitContratual(config,escala) {
  return escala.resultado.reduce((total,r)=>total+semanas(r).reduce((s,dias)=>{
    const a=apurarSemana(r.colaborador,dias,configDoPerfil(config,r.colaborador)||config);
    return s+(a.completa?Math.max(0,Math.round((a.alvo-a.computadas)*60)):0);
  },0),0);
}
/** Completa semanas inteiras, nunca recupera férias/abonos nem altera edição
 * manual. A proposta só será aceita após conferir cobertura e validação legal. */
export function* candidatosRateio(config,escala,podeAlterar = () => true) {
  if(!planejamento5x2(config)) return;
  for(const r of escala.resultado) {
    const proprio=configDoPerfil(config,r.colaborador)||config;
    if(proprio.tipoEscala==='12x36'||proprio.cicloQuadro) continue;
    for(const dias of semanas(r)) {
      const resumo=apurarSemana(r.colaborador,dias,proprio);
      if(!resumo.completa || resumo.estado!=='abaixo' || dias.some(d=>d.ajusteManual||(d.restricao && d.restricao.tipo!=="horario")||d.creditoIntervaloCCT||d.creditoNoturnoCCT)) continue;
      if(dias.some(d=>["T","FE"].includes(d.status) && !podeAlterar(config,r.colaborador,d))) continue;
      const novos=structuredClone(dias);
      for(const d of novos) d.jornadaAplicada=janelaDaProposta(proprio,r.colaborador,d,
        (proprio.horarioPorDia?proprio.jornadaPorDia?.[d.weekday]:null)||proprio.jornada);
      createDomain(proprio).distribuirHorasIndividuais(r.colaborador,novos);
      for(const d of novos) ajustarIntervaloDaProposta(d);
      const alteracoes=novos.flatMap((d,i)=>!podeAlterar(config,r.colaborador,dias[i]) || JSON.stringify(d)===JSON.stringify(dias[i])?[]:[{
        colaboradorId:r.colaborador.id,data:d.data,antes:structuredClone(dias[i]),depois:{...d,ajusteAutomatico:true}
      }]);
      if(alteracoes.length) yield {tipo:'rateio',alteracoes};
    }
  }
}
