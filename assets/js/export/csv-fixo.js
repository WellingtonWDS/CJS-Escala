import { diasDoModelo, ocorrenciasDoModelo } from "../domain/modelo-escala.js";
import { createDomain } from "../domain/index.js";
import { analisarCobertura } from "../domain/cobertura.js";
import { referenciaDia, VERSAO_REGRAS } from "../domain/ec141.js";
import { DIAS_SEMANA } from "../config/regras-jornada.js";
import { fmtHoras, horarioComDia, dateFromKey } from "../domain/datas-horas.js";
import { csvCell } from "../shared/formatacao.js";

export function gerarCsvFixo(config) {
  const domain = createDomain(config), escala = config.escalaGerada;
  const validacoes = escala.resultado.map((r) => ({ r,
    issues: domain.validarLegal(r.colaborador, r.dias, r.diasContexto, r.diasApuracao) }));
  const issues = validacoes.flatMap((v) => v.issues);
  const linhas = [
    ["Situação", issues.some((i) => i.severidade === "erro") ? "RASCUNHO — INCOMPATIBILIDADES" : issues.some((i) => ["alerta", "pendencia"].includes(i.severidade)) ? "RASCUNHO — VERIFICAÇÕES PENDENTES" : "SEM INCOMPATIBILIDADE NAS REGRAS VERIFICADAS"],
    ["Modelo", "Escala mensal fixa — padrão semanal recorrente, sem feriados"],
    ["Data de referência jurídica", config.dataReferenciaFixa],
    ["Fase", referenciaDia(config, config.dataReferenciaFixa).nome],
    ["Modo", config.modoRegime === "simulacao" ? "SIMULAÇÃO" : "Vigência na data de referência"],
    ["Versão das regras", VERSAO_REGRAS],
    ["Observação", "Reavaliar na mudança da legislação ou vigência do ACT/CCT. Eventos por data não aplicados. O padrão não autoriza automaticamente trabalho em feriados."],
  ];
  if (config.empresaDominio) linhas.push(["Empresa", config.empresaDominio.nome], ["CNPJ", config.empresaDominio.cnpj]);
  linhas.push(["Colaborador", "Função", "Dia da semana", "Status", "Entrada", "Início do intervalo", "Fim do intervalo", "Saída", "Horas trabalhadas", "Alvo semanal", "Contrato de referência"]);
  for (const r of escala.resultado) for (const d of diasDoModelo(config, r.dias)) {
    const trabalha = ["T", "FE"].includes(d.status);
    linhas.push([r.colaborador.nome, r.colaborador.cargo, DIAS_SEMANA[d.weekday], d.sabadoCompensado ? "FC — Sábado compensado" : d.status,
      trabalha ? horarioComDia(d.entradaMin) : "", trabalha && d.intervaloInicioMin != null ? horarioComDia(d.intervaloInicioMin) : "",
      trabalha && d.intervaloFimMin != null ? horarioComDia(d.intervaloFimMin) : "", trabalha ? horarioComDia(d.saidaMin) : "",
      fmtHoras(d.horas), fmtHoras(d.alvoSemana), fmtHoras(r.colaborador.horasSemana)]);
  }
  linhas.push([], ["Ocorrências — conferir antes de utilizar o padrão"], ["Colaborador", "Dia", "Severidade", "Tipo", "Descrição"]);
  for (const { r, issues } of validacoes) {
    for (const i of ocorrenciasDoModelo(config, issues)) {
      const mensagem = i.mensagem.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (v) => DIAS_SEMANA[dateFromKey(v).getDay()]);
      linhas.push([r.colaborador.nome, i.data ? DIAS_SEMANA[dateFromKey(i.data).getDay()] : "", i.severidade, i.tipo, mensagem]);
    }
  }
  if (config.coberturaAtiva) {
    const rel = analisarCobertura(config, escala.resultado);
    linhas.push([], ["Cobertura semanal"], ["Dia", "Função", "Início", "Fim", "Mínimo", "Presentes", "Faltam"]);
    for (const l of rel.lacunas) linhas.push([DIAS_SEMANA[dateFromKey(l.data).getDay()], l.funcao, horarioComDia(l.inicioMin), horarioComDia(l.fimMin), l.necessarios, l.presentes, l.faltantes]);
    for (const aviso of rel.avisos) linhas.push(["Observação", aviso]);
  }
  return "\uFEFF" + linhas.map((l) => l.map(csvCell).join(";")).join("\n") + "\n";
}
