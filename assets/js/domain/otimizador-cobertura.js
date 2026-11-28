/* Otimizador global da readequação de cobertura.
 *
 * Modela cada dia de cada colaborador como uma escolha entre opções válidas
 * (entrada, início/duração do intervalo e função) e permite trocar trabalho e
 * folga dentro da mesma semana civil. A cobertura é avaliada minuto a minuto de
 * forma incremental, o que permite avaliar centenas de milhares de combinações.
 * A busca (recozimento simulado com reaquecimentos) aceita pioras temporárias
 * para escapar de ótimos locais; o resultado é sempre conferido depois pelas
 * validações completas do sistema antes de ser apresentado.
 *
 * Invariantes por construção: horas de cada dia trabalhado, dias de trabalho
 * por semana, dias protegidos, folgas fixas e funcionamento da empresa. */
import { normalizarFuncao, habilitadoPara, funcaoDoDia, alocacoesDoDia } from "./funcoes.js";
import { calcularPausaEfetiva } from "./cobertura.js";
import { createFeriados } from "./feriados.js";
import { contextoModelo, periodoModelo } from "./modelo-escala.js";
import { configDoPerfil } from "./perfil-dominio.js";
import { faixaInicioIntervalo } from "./politica-intervalo.js";
import { pausaMinimaPlanejada, funcionamentoDoDia } from "./janelas-planejamento.js";
import { trabalhoDentroDoFuncionamento } from "./funcionamento-empresa.js";
import { descansoMinimo, repousoDoDia, sequenciasDomingo, regrasDomingo } from "./descanso.js";
import { bloqueioNaData, janelaPermitida } from "./restricoes.js";
import { isoDate, diasNoMes, timeToMin, minToTime, dateFromKey, getMonday } from "./datas-horas.js";

const DIA = 1440;
const trabalha = (d) => ["T", "FE"].includes(d.status);
const minutoData = (key) => {
  const [a, m, d] = key.split("-").map(Number);
  return Date.UTC(a, m - 1, d) / 60000;
};
const chaveData = (minuto) => new Date(minuto * 60000).toISOString().slice(0, 10);
const semanaDe = (data) => {
  const d = getMonday(dateFromKey(data));
  return isoDate(d.getFullYear(), d.getMonth(), d.getDate());
};
function aleatorio(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Demanda por função e minuto, com a mesma semântica de analisarCobertura. */
export function modeloDemanda(config) {
  config = contextoModelo(config);
  const { feriadoDaData } = createFeriados(config);
  const fixo = periodoModelo(config);
  const inicio = minutoData(fixo?.inicio || isoDate(config.ano, config.mes, config.diaInicio));
  const fim = minutoData(fixo?.fim || isoDate(config.ano, config.mes, diasNoMes(config.mes, config.ano))) + DIA;
  const L = fim - inicio, funcoes = new Map();
  for (const d of config.demandasCobertura || []) {
    const key = normalizarFuncao(d.funcao);
    if (!key || !Array.isArray(d.diasSemana)) continue;
    if (!funcoes.has(key)) funcoes.set(key, { key, nome: d.funcao.trim(), demanda: new Int16Array(L) });
    const arr = funcoes.get(key).demanda;
    for (let data = inicio - DIA; data < fim; data += DIA) {
      const date = new Date(data * 60000);
      if (!d.diasSemana.includes(date.getUTCDay()) || (feriadoDaData(chaveData(data)) && !d.incluirFeriados)) continue;
      const a = timeToMin(d.inicio), b0 = timeToMin(d.fim);
      if (!Number.isFinite(a) || !Number.isFinite(b0)) continue;
      const b = b0 + (b0 < a ? DIA : 0);
      for (let t = Math.max(0, data + a - inicio); t < Math.min(L, data + b - inicio); t++)
        if (arr[t] < d.minimo) arr[t] = d.minimo;
    }
  }
  return { inicio, fim, L, funcoes: [...funcoes.values()] };
}

/** Trechos de presença de um dia (pausa excluída) por índice de função. */
function trechos(modelo, indiceFuncao, c, d) {
  if (!trabalha(d) || !(d.horas > 0)) return [];
  let partes = null;
  if (d.intervaloMin > 0 && !(Number.isFinite(d.intervaloInicioMin) && Number.isFinite(d.intervaloFimMin))) {
    const p = calcularPausaEfetiva(d, d.jornadaAplicada || {});
    if (p) partes = [[d.entradaMin, p.inicio], [p.fim, d.saidaMin]];
  }
  const base = minutoData(d.data) - modelo.inicio, out = [];
  for (const a of alocacoesDoDia(c, d, partes)) {
    const fi = indiceFuncao.get(normalizarFuncao(a.funcao));
    if (fi == null) continue;
    const x = Math.max(0, base + Math.round(a.inicioMin)), y = Math.min(modelo.L, base + Math.round(a.fimMin));
    if (y > x) out.push(fi, x, y);
  }
  return out;
}

/** Limites inferiores comprováveis da lacuna (minutos-pessoa), por função e
 * semana. Relaxação: as pessoas habilitadas são tratadas como intercambiáveis,
 * cada uma com a maior capacidade do grupo, e podem trabalhar em qualquer dia
 * disponível, mantendo a quantidade de dias de trabalho da semana. Para cada
 * dia, f(k) é a menor lacuna possível com k pessoas, por três argumentos:
 *  - minuto a minuto: presença máxima é min(k, pessoas que alcançam o minuto);
 *  - horas: cada pessoa cobre no máximo a sua jornada do dia;
 *  - almoço: jornadas acima de 6h precisam de 1h de pausa dentro da faixa de
 *    3h a 5h após a entrada, e essa ausência ocorre dentro da zona de almoço.
 * f é convexa em k; a melhor alocação dos dias-pessoa da semana é obtida pela
 * distribuição gulosa dos ganhos marginais, o que torna o limite exato para a
 * relaxação e, portanto, válido para a escala real. */
export function limitesCobertura(config, escala, ctx) {
  const modelo = modeloDemanda(config);
  if (!modelo.funcoes.length) return { limiteInferiorMin: 0, itens: [], parcial: false };
  const datas = [];
  for (let m = modelo.inicio; m < modelo.fim; m += DIA) datas.push(chaveData(m));
  const itens = [];
  let limite = 0, parcial = false;
  const janelasDe = (r, d) => {
    if (!d) return [];
    if (trabalha(d) && !ctx.podeMudar(config, r.colaborador, d)) return [{ inicio: d.entradaMin, fim: d.saidaMin, fixa: true }];
    if (trabalha(d)) return ctx.janelas(config, r.colaborador, d);
    if (!ctx.podeTrabalhar(config, r, d)) return [];
    // A troca leva a jornada de outro dia da semana: só vale se ela couber na janela.
    const semana = semanaDe(d.data);
    const menor = Math.min(...r.dias.filter((x) => trabalha(x) && semanaDe(x.data) === semana && ctx.podeMudar(config, r.colaborador, x) &&
      ctx.podeVirarFolga(config, r.colaborador, x)).map((x) => Math.round(x.horas * 60) + pausaMinimaPlanejada(x.intervaloReduzido?.de ?? x.intervaloMin ?? 0)));
    return ctx.janelas(config, r.colaborador, d).filter((j) => j.fim - j.inicio >= menor);
  };
  for (const f of modelo.funcoes) {
    const habilitados = escala.resultado.filter((r) => habilitadoPara(r.colaborador, f.nome));
    const semanas = new Map();
    datas.forEach((data, i) => {
      const k = semanaDe(data);
      if (!semanas.has(k)) semanas.set(k, []);
      semanas.get(k).push({ data, i });
    });
    for (const dias of semanas.values()) {
      // Dias de trabalho de cada pessoa nesta semana (preservados pela busca).
      let diasPessoa = 0;
      for (const r of habilitados)
        diasPessoa += r.dias.filter((d) => trabalha(d) && dias.some((x) => x.data === d.data)).length;
      const curvas = [];
      for (const { data, i } of dias) {
        const weekday = dateFromKey(data).getDay();
        const funcionamento = funcionamentoDoDia(config, weekday);
        const aberta = (config.diasTrabalho || []).includes(weekday);
        const pode = new Int16Array(DIA);
        let disponiveis = 0, capMax = 0, zona = null, noturno = false, semAlmoco = false, vaoMax = 0, ini = DIA, fimJ = 0;
        for (const r of habilitados) {
          const d = r.dias.find((x) => x.data === data);
          const js = janelasDe(r, d).map((j) => ({ inicio: Math.max(0, j.inicio), fim: j.fim }));
          if (js.some((j) => j.fim > DIA)) noturno = true;
          if (!js.length) continue;
          disponiveis++;
          for (const j of js) for (let t = j.inicio; t < Math.min(DIA, j.fim); t++) pode[t]++;
          const semana = r.dias.filter((x) => semanaDe(x.data) === semanaDe(data) && trabalha(x));
          const horasMax = Math.max(0, ...semana.map((x) => Math.round(x.horas * 60)));
          // A busca nunca aumenta a pausa: a maior pausa possível é a já preenchida.
          const pausaMax = Math.max(0, ...semana.map((x) => x.intervaloReduzido?.de ?? x.intervaloMin ?? 0));
          capMax = Math.max(capMax, Math.min(horasMax || DIA, Math.max(...js.map((j) => j.fim - j.inicio))));
          // Maior permanência contínua possível (jornada + pausa mínima).
          vaoMax = Math.max(vaoMax, (horasMax || DIA) + pausaMax);
          for (const j of js) { ini = Math.min(ini, j.inicio); fimJ = Math.max(fimJ, Math.min(DIA, j.fim)); }
          if (horasMax <= 360) semAlmoco = true;
          else for (const j of js) {
            // Zona onde a pausa obrigatória pode cair, para qualquer entrada possível.
            const a = j.inicio + 180, b = Math.min(j.fim, Math.max(j.inicio, j.fim - horasMax - 60) + 300 + pausaMax);
            zona = zona ? { inicio: Math.min(zona.inicio, a), fim: Math.max(zona.fim, b) } : { inicio: a, fim: b };
          }
        }
        if (semAlmoco) zona = null;
        // Vizinhança noturna: o limite minuto a minuto não considera a véspera.
        const anterior = datas[i - 1];
        if (anterior) for (const r of habilitados) if (janelasDe(r, r.dias.find((x) => x.data === anterior) || (r.diasContexto || []).find((x) => x.data === anterior)).some((j) => j.fim > DIA)) noturno = true;
        if (noturno) parcial = true;
        let demandaDia = 0, foraFuncionamento = 0, demandaZona = 0;
        const base = i * DIA, D = [];
        for (let t = 0; t < DIA && base + t < modelo.L; t++) {
          const v = f.demanda[base + t];
          D.push(v);
          if (!v) continue;
          demandaDia += v;
          if (!aberta || !funcionamento || t < funcionamento.entrada || t >= funcionamento.saida) foraFuncionamento += v;
          if (zona && t >= zona.inicio && t < zona.fim) demandaZona += v;
        }
        if (!demandaDia) continue;
        const coberturaZona = zona ? zona.fim - zona.inicio : 0;
        const curva = [];
        for (let k = 0; k <= disponiveis; k++) {
          let porMinuto = 0;
          if (!noturno) for (let t = 0; t < D.length; t++) if (D[t]) porMinuto += Math.max(0, D[t] - Math.min(k, pode[t]));
          const porHoras = Math.max(0, demandaDia - k * capMax);
          const porAlmoco = coberturaZona > 60 ? Math.max(0, demandaZona - k * (coberturaZona - 60)) : 0;
          // Bordas: ninguém cobre dois minutos separados por mais que sua permanência.
          let porBordas = 0;
          if (!noturno && fimJ - ini > vaoMax && 2 * vaoMax >= fimJ - ini)
            for (let a = ini; a < fimJ - vaoMax; a++) porBordas += Math.max(0, (D[a] || 0) + (D[a + vaoMax] || 0) - k);
          const valor = Math.max(noturno ? 0 : porMinuto, porHoras, noturno ? 0 : porAlmoco, porBordas);
          curva.push({ valor, motivo: valor === porMinuto ? "pessoas" : valor === porAlmoco ? "almoco" : valor === porBordas ? "bordas" : "horas" });
        }
        // Envoltória convexa inferior: continua sendo limite válido e torna a
        // alocação gulosa dos dias-pessoa exata para a relaxação.
        curvas.push({ data, curva: envoltoria(curva), foraFuncionamento, demandaDia, disponiveis });
      }
      if (!curvas.length) continue;
      const k = curvas.map(() => 0);
      let restantes = Math.min(diasPessoa, curvas.reduce((s, c) => s + c.disponiveis, 0));
      while (restantes-- > 0) {
        let melhor = -1, ganho = -1;
        curvas.forEach((c, n) => {
          if (k[n] >= c.disponiveis) return;
          const g = c.curva[k[n]].valor - c.curva[k[n] + 1].valor;
          if (g > ganho) { ganho = g; melhor = n; }
        });
        if (melhor < 0) break;
        k[melhor]++;
      }
      curvas.forEach((c, n) => {
        const lb = Math.floor(c.curva[k[n]].valor);
        if (!lb) return;
        limite += lb;
        itens.push({ data: c.data, funcao: f.nome, minutos: lb, pessoasNoDia: k[n],
          motivo: c.foraFuncionamento >= lb ? "funcionamento" : c.curva[k[n]].motivo,
          foraFuncionamento: c.foraFuncionamento, demandaDia: c.demandaDia, disponiveis: c.disponiveis });
      });
    }
  }
  return { limiteInferiorMin: limite, itens, parcial };
}
function envoltoria(curva) {
  const pts = curva.map((c, k) => [k, c.valor]), casco = [];
  for (const p of pts) {
    while (casco.length >= 2) {
      const [a, b] = casco.slice(-2);
      if ((b[1] - a[1]) * (p[0] - a[0]) >= (p[1] - a[1]) * (b[0] - a[0])) casco.pop();
      else break;
    }
    casco.push(p);
  }
  return curva.map((c, k) => {
    const j = casco.findIndex((p) => p[0] >= k);
    if (casco[j][0] === k) return { ...c, valor: casco[j][1] };
    const [a, b] = [casco[j - 1], casco[j]];
    return { ...c, valor: a[1] + ((b[1] - a[1]) * (k - a[0])) / (b[0] - a[0]) };
  });
}

export function otimizarCobertura(config, escala, ctx) {
  const modelo = modeloDemanda(config);
  if (!modelo.funcoes.length) return null;
  const indiceFuncao = new Map(modelo.funcoes.map((f, i) => [f.key, i]));
  const F = modelo.funcoes.length, L = modelo.L;
  const presenca = modelo.funcoes.map(() => new Int16Array(L));
  const fixa = config.modeloEscala === "fixa";
  const periodo = fixa ? periodoModelo(contextoModelo(config)) : null;
  const sorteio = aleatorio(ctx.semente ?? 20261118);
  let lacuna = 0;

  // Estado: dias visíveis de cada colaborador (no fixo, somente a semana-modelo).
  const pessoas = escala.resultado.map((r) => {
    const c = r.colaborador, proprio = configDoPerfil(config, c) || config;
    const especial = proprio.tipoEscala === "12x36" || proprio.cicloQuadro;
    const dias = r.dias.filter((d) => !periodo || (d.data >= periodo.inicio && d.data <= periodo.fim));
    return { r, c, especial, dias, original: dias.slice(), atual: dias.slice(),
      contexto: fixa ? [] : (r.diasContexto || []).filter((d) => d.data < (dias[0]?.data || "")) };
  });
  const cacheTrechos = new WeakMap();
  const trechosDe = (p, d) => {
    let t = cacheTrechos.get(d);
    if (!t) { t = trechos(modelo, indiceFuncao, p.c, d); cacheTrechos.set(d, t); }
    return t;
  };
  const somar = (p, d, sinal) => {
    const t = trechosDe(p, d);
    for (let k = 0; k < t.length; k += 3) {
      const arr = presenca[t[k]], dem = modelo.funcoes[t[k]].demanda;
      for (let m = t[k + 1]; m < t[k + 2]; m++) {
        if (sinal > 0) { if (arr[m] < dem[m]) lacuna--; arr[m]++; }
        else { arr[m]--; if (arr[m] < dem[m]) lacuna++; }
      }
    }
  };
  for (const f of modelo.funcoes) for (let m = 0; m < L; m++) lacuna += f.demanda[m];
  for (const r of escala.resultado) {
    const p = pessoas.find((x) => x.r === r);
    // Presença de contexto (plantões noturnos da véspera) também conta.
    for (const d of [...(r.diasContexto || []), ...r.dias]) {
      if (p.dias.includes(d)) continue;
      if (minutoData(d.data) + 2 * DIA <= modelo.inicio || minutoData(d.data) >= modelo.fim) continue;
      somar(p, d, 1);
    }
    for (const d of p.dias) somar(p, d, 1);
  }
  const lacunaInicial = lacuna;
  if (!lacuna) return null;

  // Opções de cada dia, construídas sob demanda e conferidas uma vez.
  const funcoesDemanda = modelo.funcoes.map((f) => f.nome);
  const cacheOpcoes = new Map();
  function opcoes(p, i, modeloDia) {
    const base = p.original[i];
    const pausaChave = modeloDia.intervaloReduzido?.de ?? modeloDia.intervaloMin ?? 0;
    const chave = `${p.c.id}|${base.data}|${modeloDia.horas}|${pausaChave}`;
    if (cacheOpcoes.has(chave)) return cacheOpcoes.get(chave);
    const lista = [], vistos = new Set();
    const trabalhoMin = Math.round(modeloDia.horas * 60);
    const pausaOriginal = modeloDia.intervaloReduzido?.de ?? modeloDia.intervaloMin ?? 0;
    const funcoes = [...new Set([funcaoDoDia(p.c, modeloDia), ...funcoesDemanda].filter((f) => habilitadoPara(p.c, f)))];
    for (const j of ctx.janelas(config, p.c, base)) {
      const pMin = pausaMinimaPlanejada(pausaOriginal);
      const starts = new Set();
      for (let s = j.inicio; s + trabalhoMin + pMin <= j.fim; s += 15) starts.add(s);
      if (modeloDia.entradaMin >= j.inicio) starts.add(modeloDia.entradaMin);
      // Entradas que terminam exatamente no fim da janela (com e sem redução da pausa).
      starts.add(j.fim - trabalhoMin - pausaOriginal);
      starts.add(j.fim - trabalhoMin - pMin);
      for (const s of starts) {
        if (s < 0 || s >= DIA) continue;
        const pausa = Math.min(pausaOriginal, j.fim - s - trabalhoMin);
        if (pausa < pMin) continue;
        for (const funcao of funcoes) {
          const novo = ctx.horario(config, p.c, base, modeloDia, s, funcao, true, pausa);
          if (!novo) continue;
          const variantes = [novo];
          if (pausa > 0) {
            const faixa = faixaInicioIntervalo(novo);
            for (let q = Math.ceil(faixa.inicio / 15) * 15; q <= faixa.fim; q += 15) {
              if (q === novo.intervaloInicioMin) continue;
              const v = { ...novo, intervaloInicioMin: q, intervaloFimMin: q + pausa };
              v.jornadaAplicada = { ...novo.jornadaAplicada, intInicio: minToTime(q), intFim: minToTime(q + pausa) };
              variantes.push(v);
            }
          }
          for (const v of variantes) {
            if (normalizarFuncao(funcao) === normalizarFuncao(p.c.cargo)) delete v.funcaoAlocada;
            if (!trabalhoDentroDoFuncionamento(config, v)) continue;
            const k = [v.entradaMin, v.saidaMin, v.intervaloInicioMin, v.funcaoAlocada ?? ""].join("|");
            if (vistos.has(k) || (trabalha(base) && k === [base.entradaMin, base.saidaMin, base.intervaloInicioMin, base.funcaoAlocada ?? ""].join("|"))) continue;
            vistos.add(k);
            lista.push({ ...v, ajusteAutomatico: true });
          }
        }
      }
    }
    cacheOpcoes.set(chave, lista);
    return lista;
  }

  // Conferências rápidas: descanso entre jornadas (11h + 24h por repouso intercalado,
  // Portaria MTE 2.041/2026, art. 4º, § 2º) e sete dias seguidos.
  function interjornadaOk(p, i) {
    const seq = p.atual, n = seq.length;
    const lista = fixa ? [...seq, ...seq, ...seq] : [...p.contexto, ...seq];
    const c = fixa ? n + i : p.contexto.length + i;
    const busca = (k, passo) => {
      for (let j = k + passo, limite = 0; j >= 0 && j < lista.length && limite < 14; j += passo, limite++)
        if (trabalha(lista[j])) return j;
      return -1;
    };
    const ok = (a, b) => {
      if (a < 0 || b < 0) return true;
      let repousos = 0;
      for (let j = a + 1; j < b; j++) if (repousoDoDia(lista[j])) repousos++;
      const minimo = config.tipoEscala === "12x36" ? 660 : descansoMinimo(config, repousos);
      return (b - a) * DIA + lista[b].entradaMin - lista[a].saidaMin >= minimo;
    };
    if (trabalha(lista[c])) return ok(busca(c, -1), c) && ok(c, busca(c, 1));
    return ok(busca(c, -1), busca(c, 1));
  }
  // Repouso dominical: a troca de folgas não pode piorar o rodízio dos domingos.
  const faltasDomingo = (p, dias) =>
    fixa
      ? dias.some((d) => d.weekday === 0 && trabalha(d)) ? regrasDomingo(config, p.c).length : 0
      : sequenciasDomingo(config, p.c, [...p.contexto, ...dias]).length;
  function domingoOk(p) {
    p.domingoBase ??= faltasDomingo(p, p.original);
    return faltasDomingo(p, p.atual) <= p.domingoBase;
  }
  function consecutivosOk(p) {
    if (fixa) return p.atual.some((d) => !trabalha(d));
    let seguidos = 0;
    for (const d of [...p.contexto, ...p.atual]) {
      seguidos = trabalha(d) ? seguidos + 1 : 0;
      if (seguidos >= 7) return false;
    }
    return true;
  }
  const mudancas = () => pessoas.reduce((s, p) => s + p.atual.reduce((n, d, i) => n + (d !== p.original[i]), 0), 0);
  let alteradas = 0, desvio = 0;
  // Desempate: entre soluções com a mesma lacuna, prefere horários próximos dos atuais.
  const distancia = (p, i, d) => {
    const o = p.original[i];
    if (d === o) return 0;
    if (!trabalha(d) || !trabalha(o)) return 60;
    return Math.abs(d.entradaMin - o.entradaMin) + Math.abs((d.intervaloInicioMin ?? 0) - (o.intervaloInicioMin ?? 0)) +
      (normalizarFuncao(funcaoDoDia(p.c, d)) === normalizarFuncao(funcaoDoDia(p.c, o)) ? 0 : 30);
  };
  function trocar(p, i, novo) {
    const velho = p.atual[i];
    somar(p, velho, -1);
    p.atual[i] = novo;
    somar(p, novo, 1);
    alteradas += (novo !== p.original[i]) - (velho !== p.original[i]);
    desvio += distancia(p, i, novo) - distancia(p, i, velho);
  }

  // Dias que a busca pode mudar e índices por data.
  const mutaveis = [], porData = new Map();
  for (const p of pessoas) {
    if (p.especial) continue;
    p.original.forEach((d, i) => {
      if (!ctx.podeMudar(config, p.c, d)) return;
      const item = { p, i };
      mutaveis.push(item);
      if (!porData.has(d.data)) porData.set(d.data, []);
      porData.get(d.data).push(item);
    });
  }
  if (!mutaveis.length) return null;
  // Voltar ao status original é sempre permitido; mudar exige as regras de folga.
  const podeFolgar = (p, i) => !trabalha(p.original[i]) || ctx.podeVirarFolga(config, p.c, p.original[i]);
  const podeTrabalhar = (p, i) => trabalha(p.original[i]) || ctx.podeTrabalhar(config, p.r, p.original[i]);

  function amostraLacuna() {
    for (let tentativa = 0; tentativa < 40; tentativa++) {
      const fi = Math.floor(sorteio() * F), m = Math.floor(sorteio() * L);
      if (presenca[fi][m] < modelo.funcoes[fi].demanda[m]) return { fi, data: chaveData(modelo.inicio + m - (m % DIA)) };
    }
    return null;
  }
  const folgaDe = (p, k) => {
    p.folgas ??= new Map();
    if (!p.folgas.has(k)) p.folgas.set(k, trabalha(p.original[k]) ? ctx.transformarEmFolga(p.original[k]) : p.original[k]);
    return p.folgas.get(k);
  };
  /** Gera um movimento: lista de [pessoa, índice, novoDia]. */
  function movimento() {
    const alvo = sorteio() < 0.75 ? amostraLacuna() : null;
    let itens = alvo ? (porData.get(alvo.data) || []).filter(({ p }) => habilitadoPara(p.c, modelo.funcoes[alvo.fi].nome)) : mutaveis;
    if (!itens.length) itens = mutaveis;
    const { p, i } = itens[Math.floor(sorteio() * itens.length)];
    const atual = p.atual[i];
    // Troca de turnos entre dois colegas que trabalham no mesmo dia.
    if (trabalha(atual) && sorteio() < 0.15) {
      const colegas = (porData.get(atual.data) || []).filter((x) => x.p !== p && trabalha(x.p.atual[x.i]) &&
        Math.abs(x.p.atual[x.i].horas - atual.horas) < 1e-9);
      if (colegas.length) {
        const { p: q, i: j } = colegas[Math.floor(sorteio() * colegas.length)];
        const outro = q.atual[j];
        const chaveTurno = (d) => [d.entradaMin, d.saidaMin, d.intervaloInicioMin].join("|");
        const achar = (pessoa, k, alvoDia) => [pessoa.original[k], ...opcoes(pessoa, k, pessoa.atual[k])]
          .find((o) => trabalha(o) && chaveTurno(o) === chaveTurno(alvoDia) &&
            normalizarFuncao(funcaoDoDia(pessoa.c, o)) === normalizarFuncao(funcaoDoDia(pessoa.c, pessoa.atual[k])));
        const a = achar(p, i, outro), b = achar(q, j, atual);
        if (a && b && a !== atual && b !== outro) return [[p, i, a], [q, j, b]];
      }
    }
    if (trabalha(atual) && sorteio() < 0.65) {
      const lista = opcoes(p, i, atual);
      const escolhas = trabalha(p.original[i]) ? [p.original[i], ...lista] : lista;
      if (!escolhas.length) return null;
      const novo = escolhas[Math.floor(sorteio() * escolhas.length)];
      return novo === atual ? null : [[p, i, novo]];
    }
    // Troca trabalho e folga na mesma semana civil do colaborador.
    const semana = semanaDe(atual.data);
    const mesma = [];
    p.atual.forEach((d, k) => {
      if (k !== i && semanaDe(d.data) === semana && trabalha(d) !== trabalha(atual) && ctx.podeMudar(config, p.c, p.original[k])) mesma.push(k);
    });
    if (!mesma.length) return null;
    const k = mesma[Math.floor(sorteio() * mesma.length)];
    const [folga, trabalho] = trabalha(atual) ? [k, i] : [i, k];
    if (!podeFolgar(p, trabalho) || !podeTrabalhar(p, folga)) return null;
    // O dia que volta à folga original é restaurado; os demais viram folga.
    const novoDescanso = folgaDe(p, trabalho);
    const lista = trabalha(p.original[folga]) ? [p.original[folga], ...opcoes(p, folga, p.atual[trabalho])] : opcoes(p, folga, p.atual[trabalho]);
    if (!lista.length) return null;
    return [[p, folga, lista[Math.floor(sorteio() * lista.length)]], [p, trabalho, novoDescanso]];
  }

  const custo = () => lacuna * 1000 + alteradas * 20 + desvio / 15;
  let melhorCusto = custo(), melhorLacuna = lacuna, melhor = pessoas.map((p) => p.atual.slice());
  const limite = ctx.limiteInferiorMin ?? 0;
  const iteracoes = ctx.iteracoes ?? 400000;
  const inicioTempo = ctx.agora();
  let avaliadas = 0, ultimaMelhoria = 0;
  const T0 = 30000, T1 = 50;
  for (let it = 0; it < iteracoes; it++) {
    if ((it & 255) === 0 && ctx.agora() - inicioTempo > ctx.limiteMs) break;
    // No mínimo comprovado, segue só um polimento curto (desempate por proximidade).
    if (melhorLacuna <= limite && it - ultimaMelhoria > 3000) break;
    if (it - ultimaMelhoria > (ctx.estagnacao ?? 100000)) break;
    // Reaquece a partir do melhor estado a cada terço do orçamento.
    const fase = (it % Math.ceil(iteracoes / 3)) / Math.ceil(iteracoes / 3);
    if (fase === 0 && it) {
      pessoas.forEach((p, n) => melhor[n].forEach((d, i) => { if (p.atual[i] !== d) trocar(p, i, d); }));
    }
    let T = T0 * Math.pow(T1 / T0, fase);
    if (melhorLacuna <= limite) T = Math.min(T, 1);
    const mov = movimento();
    if (!mov || !mov.length) continue;
    const antes = custo();
    const desfazer = mov.map(([p, i]) => [p, i, p.atual[i]]);
    for (const [p, i, novo] of mov) trocar(p, i, novo);
    let valido = mov.every(([p, i]) => interjornadaOk(p, i));
    if (valido && mov.length > 1 && mov[0][0] === mov[1][0]) valido = consecutivosOk(mov[0][0]) && domingoOk(mov[0][0]);
    avaliadas++;
    const delta = custo() - antes;
    if (!valido || (delta > 0 && sorteio() >= Math.exp(-delta / T))) {
      for (const [p, i, velho] of desfazer.reverse()) trocar(p, i, velho);
      continue;
    }
    if (custo() < melhorCusto) {
      melhorCusto = custo();
      melhorLacuna = lacuna;
      melhor = pessoas.map((p) => p.atual.slice());
      ultimaMelhoria = it;
    }
  }
  pessoas.forEach((p, n) => melhor[n].forEach((d, i) => { if (p.atual[i] !== d) trocar(p, i, d); }));

  const alteracoes = [];
  for (const p of pessoas)
    p.atual.forEach((d, i) => {
      const o = p.original[i];
      if (d !== o) alteracoes.push({ colaboradorId: p.c.id, data: o.data, antes: structuredClone(o), depois: structuredClone(d) });
    });
  return { alteracoes, lacunaInicialMin: lacunaInicial, lacunaFinalMin: lacuna, avaliadas, mudancas: mudancas(),
    duracaoMs: Math.round(ctx.agora() - inicioTempo) };
}

const NOMES_DIA = ["domingos", "segundas", "terças", "quartas", "quintas", "sextas", "sábados"];
const horasTexto = (min) => `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, "0")}`;

/** Dias em que a empresa funciona por menos tempo que a jornada diária necessária
 * para fechar o contrato em cinco dias. Trabalhar nesse dia deixa a semana abaixo
 * do contrato; reduzir salário é vedado (art. 2º da EC 141). */
export function diasDeJornadaCurta(config, escala) {
  const out = [];
  for (const weekday of config.diasTrabalho || []) {
    const f = funcionamentoDoDia(config, weekday);
    if (!f) continue;
    const janela = f.saida - f.entrada;
    for (const r of escala.resultado) {
      const semana = r.dias.filter((d) => trabalha(d));
      if (!semana.length) continue;
      const alvo = Math.round((semana[0].alvoSemana ?? r.colaborador.horasSemana) * 60);
      const dias = 5, diario = Math.ceil(alvo / dias);
      const pausa = diario > 360 ? 60 : diario > 240 ? 15 : 0;
      const capacidade = Math.max(0, janela - (janela > 360 ? 60 : janela > 240 ? 15 : 0));
      if (capacidade + pausa >= diario + pausa || capacidade >= diario) continue;
      // Máximo semanal trabalhando nesse dia, com os demais dias no limite diário.
      const outros = (config.diasTrabalho || []).filter((w) => w !== weekday).map((w) => {
        const g = funcionamentoDoDia(config, w);
        return g ? Math.min(diario, g.saida - g.entrada - (g.saida - g.entrada > 360 ? 60 : 0)) : 0;
      }).sort((a, b) => b - a).slice(0, dias - 1);
      const maximo = capacidade + outros.reduce((s, v) => s + v, 0);
      if (maximo >= alvo) continue;
      out.push({ weekday, janela: { entrada: f.entrada, saida: f.saida }, capacidadeMin: capacidade, alvoMin: alvo, maximoSemanalMin: maximo });
      break;
    }
  }
  return out;
}

/** Textos para o usuário: o que é inevitável, por quê, e o que fazer. */
export function explicarLimites(config, escala, limites, lacunaRestanteMin, lacunas) {
  const textos = [];
  const lb = limites.limiteInferiorMin;
  if (!lacunaRestanteMin) return textos;
  if (lacunaRestanteMin <= lb)
    textos.push(`Resultado ótimo comprovado: com as regras e os cadastros atuais, ${horasTexto(lb)} de lacuna (horas-pessoa) são inevitáveis, e a sugestão chega a esse mínimo. Nenhuma outra combinação de folgas, horários, intervalos ou funções cobre mais.`);
  else if (lb)
    textos.push(`Restam ${horasTexto(lacunaRestanteMin)} de lacuna (horas-pessoa). Pelo menos ${horasTexto(lb)} são comprovadamente inevitáveis com as regras atuais; para as ${horasTexto(lacunaRestanteMin - lb)} restantes não há prova de impossibilidade — buscar novamente após aplicar pode encontrar melhoria.`);
  else
    textos.push(`Restam ${horasTexto(lacunaRestanteMin)} de lacuna (horas-pessoa) sem prova de impossibilidade. Buscar novamente após aplicar pode encontrar melhoria; se persistir, revise disponibilidades, funções habilitadas ou a demanda.`);
  if (limites.parcial) textos.push("Há jornadas noturnas: parte da comprovação de limites foi omitida por cautela.");
  const grupos = new Map();
  for (const i of limites.itens) {
    const w = dateFromKey(i.data).getDay(), k = `${i.motivo}|${i.funcao}|${w}`;
    if (!grupos.has(k)) grupos.set(k, { ...i, weekday: w, minutos: 0, datas: 0 });
    const g = grupos.get(k);
    g.minutos += i.minutos; g.datas++;
  }
  const motivos = {
    funcionamento: (g) => `${g.funcao}, aos ${NOMES_DIA[g.weekday]}: a demanda cadastrada está fora do horário de funcionamento da empresa (aba Jornada). Ajuste a faixa de cobertura ou o funcionamento.`,
    pessoas: (g) => `${g.funcao}, aos ${NOMES_DIA[g.weekday]}: não há pessoas habilitadas e disponíveis em número suficiente nesses horários (considerando folgas, restrições e jornadas que cabem no dia). É necessário reforço da equipe nessa função.`,
    almoco: (g) => `${g.funcao}, aos ${NOMES_DIA[g.weekday]}: com ${g.pessoasNoDia} pessoa(s) no dia, os almoços obrigatórios (mínimo de 1h, entre 3h e 5h após a entrada) deixam horários descobertos. Seria preciso mais uma pessoa nesses dias.`,
    bordas: (g) => `${g.funcao}, aos ${NOMES_DIA[g.weekday]}: nenhuma jornada cobre da abertura ao fechamento; com ${g.pessoasNoDia} pessoa(s) não é possível cobrir início e fim do expediente ao mesmo tempo.`,
    horas: (g) => `${g.funcao}, aos ${NOMES_DIA[g.weekday]}: as horas de trabalho disponíveis no dia não alcançam a demanda.`,
  };
  const curtos = new Set(diasDeJornadaCurta(config, escala).map((c) => c.weekday));
  for (const g of grupos.values())
    if (!(g.motivo === "pessoas" && curtos.has(g.weekday))) textos.push(`${motivos[g.motivo]?.(g) || ""} Inevitável: ${horasTexto(g.minutos)} (horas-pessoa) em ${g.datas} data(s).`);
  textos.push(...recomendacoesJornadaCurta(config, escala, lacunas));
  return textos;
}

/** Recomendação para dias de funcionamento curto com horários descobertos. */
export function recomendacoesJornadaCurta(config, escala, lacunas) {
  const textos = [];
  for (const c of diasDeJornadaCurta(config, escala)) {
    const descobertas = (lacunas || []).filter((l) => dateFromKey(l.data).getDay() === c.weekday);
    if (!descobertas.length) continue;
    const porFuncao = new Map();
    for (const l of descobertas) porFuncao.set(l.funcao, Math.max(porFuncao.get(l.funcao) || 0, l.faltantes));
    const funcoes = [...porFuncao].map(([f, n]) => `${n} na função ${f}`).join(", ");
    textos.push(`Aos ${NOMES_DIA[c.weekday]} a empresa funciona das ${minToTime(c.janela.entrada)} às ${minToTime(c.janela.saida)}. Quem trabalha nesse dia não completa as ${horasTexto(c.alvoMin)} semanais (máximo de ${horasTexto(c.maximoSemanalMin)} com os demais dias no limite diário), o que exigiria reduzir a carga — e a redução salarial é vedada (art. 2º da EC 141). Para cobrir esse dia: contratar colaborador(es) específico(s) para os ${NOMES_DIA[c.weekday]} (${funcoes}, ${horasTexto(c.janela.saida - c.janela.entrada)} por dia) ou reduzir a carga contratual das atuais para ${horasTexto(c.maximoSemanalMin)} semanais, mantendo o salário. Outras saídas: ACT/CCT com compensação diária (até 10h), para que quem trabalha no sábado complete as horas nos demais dias — dentro do funcionamento ou da margem da aba Jornada —, ou o revezamento quinzenal do sábado em Folgas da proposta.`);
  }
  return textos;
}
