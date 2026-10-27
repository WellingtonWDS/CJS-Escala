import { createDefaultState } from "../../assets/js/state/store.js";
import { atualizarPerfilDominio } from "../../assets/js/import/dominio.js";

const UTEIS = [1, 2, 3, 4, 5];
const COMERCIAIS = [...UTEIS, 6];
const TODOS = [0, ...COMERCIAIS];
export const uuidDemoSegmento = (n) => `de000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const horario = (entrada, intInicio, intFim, saida) => ({ entrada, intInicio, intFim, saida });
const hLoja = horario("08:00", "11:00", "13:00", "18:00");
function base() {
  const s = createDefaultState(new Date(2026, 9, 1));
  Object.assign(s, {
    colaboradores: [], proximoId: 1, coberturaAtiva: true, demandasCobertura: [],
    diasTrabalho: [...COMERCIAIS], folgaDiasPermitidos: [...TODOS],
    jornada: { ...hLoja }, horarioPorDia: false, folgaTipo: "rotativa",
    destinoConversao: { periodo: "2028-02", fase: "automatico", folgas: "distribuir" },
  });
  return s;
}
function coletivo(s, condicoes) {
  s.instrumentoCompensacao = "act_cct";
  Object.assign(s.instrumentoColetivo, {
    identificacao: "ACT/CCT DEMO FICTÍCIO — exclusivo para simulação",
    inicio: "2026-01-01", fim: "2029-12-31", compativelEC141: true, ...condicoes,
  });
}
function demanda(s, funcao, inicio, fim, diasSemana = COMERCIAIS, minimo = 1, incluirFeriados = false) {
  s.demandasCobertura.push({ id: s.demandasCobertura.length + 1, funcao, inicio, fim, minimo, diasSemana: [...diasSemana], incluirFeriados });
}
function pessoa(s, cargo, horasSemana = 44) {
  const id = s.proximoId++;
  // Sexo informado como dado fictício, sem inferência por nome.
  const c = { id, nome: `${cargo} Demo ${String(id).padStart(2, "0")}`, sexo: "masculino", cargo, horasSemana };
  s.colaboradores.push(c);
  return c;
}
function semanal(s, cargo, jornada, sabado, horas = 44) {
  const c = pessoa(s, cargo, horas);
  c.quadroDominio = {
    origem: "manual", codigo: `DEMO-${c.id}`, ativo: true, tipo: "semanal", cargaConfirmada: true,
    semana: Object.fromEntries(TODOS.map(d => [d, d === 0 ? { status: "folga" } : d === 6
      ? structuredClone(sabado || { status: "folga" })
      : { status: "trabalho", jornada: structuredClone(typeof jornada === "function" ? jornada(d) : jornada) }])),
    ciclo: {}, pendencias: [], linhasOriginais: [],
  };
  atualizarPerfilDominio(c, s);
  return c;
}
function finalizar(s) {
  s.proximaDemandaId = s.demandasCobertura.length + 1;
  for (const c of s.colaboradores) atualizarPerfilDominio(c, s);
  return s;
}
function comercio({ poucos = false, simultaneo = false } = {}) {
  const s = base(); s.atividadeComercio = true;
  s.jornadaPorDia = Object.fromEntries(COMERCIAIS.map(d => [d, d === 6 ? horario("08:00", "", "", "14:00") : { ...hLoja }]));
  s.horarioPorDia = true;
  for (const cargo of ["Atendente", "Caixa"]) {
    const n = poucos ? 1 : 4;
    for (let i = 0; i < n; i++) {
      const pausa = simultaneo ? ["11:00", "13:00"] : [["10:00", "12:00"], ["12:00", "14:00"], ["14:00", "16:00"], ["11:00", "13:00"]][i];
      semanal(s, cargo, horario("08:00", ...pausa, "18:00"), {
        status: "trabalho", jornada: i % 2 ? horario("10:00", "", "", "14:00") : horario("08:00", "", "", "12:00"),
      });
    }
    demanda(s, cargo, "08:00", "18:00", UTEIS);
    demanda(s, cargo, "08:00", "14:00", [6]);
  }
  return finalizar(s);
}
function fazenda({ safra = false } = {}) {
  const s = base();
  s.diasTrabalho = [...UTEIS];
  s.folgaTipo = "fixa"; s.folgaDiasPermitidos = [0, 6];
  s.destinoConversao.folgas = "fim_semana";
  s.jornada = horario("07:00", "12:00", "13:00", "17:00");
  s.horarioPorDia = true;
  s.jornadaPorDia = Object.fromEntries(UTEIS.map(d => [d, horario("07:00", "12:00", "13:00", d === 5 ? "16:00" : "17:00")]));
  coletivo(s, { compensacaoDiaria: true, limiteDiario: 10 });
  for (let i = 0; i < 4; i++) semanal(s, "Trabalhador rural", d => s.jornadaPorDia[d], { status: "compensado" });
  // A frente que entra às 08h mantém a cobertura até 17h na proposta de 40h.
  for (let i = 0; i < 2; i++) semanal(s, "Trabalhador rural", d => horario("08:00", "12:00", "13:00", d === 5 ? "17:00" : "18:00"), { status: "compensado" });
  const minimo = safra ? 7 : 1;
  demanda(s, "Trabalhador rural", "07:00", "12:00", UTEIS, minimo);
  demanda(s, "Trabalhador rural", "13:00", "17:00", [1, 2, 3, 4], minimo);
  demanda(s, "Trabalhador rural", "13:00", "16:00", [5], minimo);
  return finalizar(s);
}
function plantao(s, cargo, grupo, noturno, pausa, concentrado) {
  // 12h de presença, 1h de intervalo real; média de 38,5h efetivas por semana.
  const c = pessoa(s, cargo, 38.5);
  const j = noturno ? horario("20:00", ...pausa, "08:00") : horario("08:00", ...pausa, "20:00");
  c.nome += ` — ${noturno ? "Noite" : "Dia"} / Grupo ${grupo === 0 ? "A" : "B"}`;
  c.quadroDominio = {
    origem: "manual", codigo: `DEMO-${c.id}`, ativo: true, tipo: "ciclo", cargaConfirmada: true,
    ancora: grupo === 0 || concentrado ? "2026-10-01" : "2026-10-02",
    semana: {}, ciclo: { 1: { status: "trabalho", jornada: j }, 2: { status: "folga" } },
    pendencias: [], linhasOriginais: [],
  };
  atualizarPerfilDominio(c, s);
}
function entidade({ poucos = false, concentrado = false } = {}) {
  const s = base(); s.tipoEscala = "12x36"; s.diasTrabalho = [...TODOS];
  s.jornada = horario("08:00", "11:00", "12:00", "20:00");
  s.ancora12x36 = "2026-10-01";
  coletivo(s, { regime12x36: true });
  // Serviço de assistência 24h, incluindo feriado, sem excluir o intervalo real da cobertura.
  s.feriadosConfigurados = [{ ano: 2026, mes: 9, dia: 12, nome: "Nossa Senhora Aparecida", tipo: "nacional", trabalhado: true }];
  for (const cargo of ["Cuidador de idosos", "Enfermeiro"]) {
    for (let grupo = 0; grupo < 2; grupo++) for (const noturno of [false, true]) {
      for (let i = 0; i < (poucos ? 1 : 2); i++) plantao(s, cargo, grupo, noturno, noturno
        ? (i === 0 ? ["00:00", "01:00"] : ["01:00", "02:00"])
        : (i === 0 ? ["11:00", "12:00"] : ["12:00", "13:00"]), concentrado);
    }
    // Janela cruzando meia-noite + janela complementar: cobre as 24 horas, sem sobreposição.
    demanda(s, cargo, "08:00", "20:00", TODOS, 1, true);
    demanda(s, cargo, "20:00", "08:00", TODOS, 1, true);
  }
  for (let i = 0; i < 2; i++) semanal(s, "Administrativo", hLoja, { status: "trabalho", jornada: horario("08:00", "", "", "12:00") });
  demanda(s, "Administrativo", "09:00", "11:00", UTEIS, 1, true);
  demanda(s, "Administrativo", "14:00", "17:00", UTEIS, 1, true);
  return finalizar(s);
}
function padaria({ poucos = false, simultaneo = false } = {}) {
  const s = base(); s.atividadeComercio = true;
  s.jornada = horario("06:00", "10:00", "11:00", "14:20");
  const turnos = [
    horario("06:00", "10:00", "11:00", "14:20"),
    horario("09:00", "13:00", "14:00", "17:20"),
    horario("12:10", "16:00", "17:00", "20:30"),
  ];
  for (const cargo of ["Atendente", "Padeiro"]) {
    const selecionados = poucos || simultaneo ? [turnos[0], turnos[2]] : turnos;
    const n = poucos ? 1 : simultaneo ? 3 : 2;
    for (let t = 0; t < selecionados.length; t++) for (let i = 0; i < n; i++) {
      const j = structuredClone(selecionados[t]);
      if (!simultaneo && i === 1) {
        const pausas = [["11:00", "12:00"], ["14:00", "15:00"], ["17:00", "18:00"]][t];
        [j.intInicio, j.intFim] = pausas;
      }
      semanal(s, cargo, j, { status: "trabalho", jornada: { ...j } });
    }
    demanda(s, cargo, "06:00", "20:30");
  }
  return finalizar(s);
}
function cnpjTeste(n) {
  let value = String(n).padStart(12, "0");
  for (let len = 12; len <= 13; len++) {
    const sum = [...value].reduce((a, c, i) => a + Number(c) * ((len - i - 1) % 8 + 2), 0);
    value += sum % 11 < 2 ? 0 : 11 - sum % 11;
  }
  return value;
}
export function criarCenariosSegmentos() {
  let draft = 201;
  const empresa = (n, segmento, modelos) => ({
    id: uuidDemoSegmento(n), name: `${segmento} — DEMO FICTÍCIA`, cnpj: cnpjTeste(n),
    drafts: modelos.map(([title, tipo, state]) => ({ id: uuidDemoSegmento(draft++), title, tipo, state })),
  });
  return [
    empresa(101, "Comércio", [
      ["Comércio — intervalos distribuídos", "cobertura", comercio()],
      ["Comércio — almoços juntos: readequar", "readequacao", comercio({ simultaneo: true })],
      ["Comércio — equipe reduzida: contratar", "contratacao", comercio({ poucos: true })],
    ]),
    empresa(102, "Fazenda", [
      ["Fazenda — sábados compensados e almoço coletivo", "cobertura", fazenda()],
      ["Fazenda — safra: contratar trabalhadores", "contratacao", fazenda({ safra: true })],
    ]),
    empresa(103, "Entidade / Ação Social 24h", [
      ["Entidade — 12×36 dia/noite + administrativo", "cobertura", entidade()],
      ["Entidade — grupos no mesmo dia: readequar ciclos", "readequacao", entidade({ concentrado: true })],
      ["Entidade — falta cobertura nos intervalos: contratar", "contratacao", entidade({ poucos: true })],
    ]),
    empresa(104, "Padaria", [
      ["Padaria — turnos distribuídos 06h–20h30", "cobertura", padaria()],
      ["Padaria — pausas simultâneas: readequar", "readequacao", padaria({ simultaneo: true })],
      ["Padaria — equipe enxuta: contratar", "contratacao", padaria({ poucos: true })],
    ]),
  ];
}
