/* Conferência entre o diagnóstico da empresa e a escala gerada (proposta 5×2, ou a
 * escala atual quando ainda não há proposta). Cada item aponta a pergunta de origem e
 * o nível: divergência (a escala contraria a resposta), alerta (pode contrariar ou
 * falta informação no preenchimento), conferir (resposta em texto livre, sem leitura
 * automática) e ok. Não altera a escala nem o diagnóstico. */
import { analisarCobertura } from "../domain/cobertura.js";
import { normalizarFuncao, funcoesHabilitadas } from "../domain/funcoes.js";
import { PERGUNTAS_DIAGNOSTICO, CERTEZAS } from "./questionario.js";

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];
const NIVEIS = ["divergencia", "alerta", "conferir", "ok"];
const trabalha = (d) => ["T", "FE"].includes(d.status);
const min = (h) => {
  const m = /^(\d{2}):(\d{2})$/.exec(h || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const hhmm = (m) => {
  const v = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
};
const dataBr = (iso) => String(iso || "").split("-").reverse().join("/");
const listaDias = (dias) => ORDEM_SEMANA.filter((d) => dias.includes(d)).map((d) => DIAS[d]).join(", ");
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
// "Cozinheiro(a)", "cozinheiros" e "Cozinheiro" são a mesma função para a conferência.
const chaveFuncao = (f) => normalizarFuncao(f).replace(/\(.*?\)/g, "").replace(/s$/, "").trim();
const titulo = (id) => PERGUNTAS_DIAGNOSTICO.find((q) => q.id === id)?.titulo || id;

/** Escala a conferir: a proposta atualizada, ou a escala atual gerada. */
export function escalaParaConferir(state) {
  const c = state.conversao;
  if (c && !c.desatualizada && c.proposta?.config?.escalaGerada?.resultado?.length)
    return { tipo: "proposta", config: c.proposta.config, resultado: c.proposta.config.escalaGerada.resultado,
      origem: c.origem?.escala?.resultado || null, comparacao: c.comparacao || null };
  if (state.escalaGerada?.resultado?.length)
    return { tipo: "atual", config: state, resultado: state.escalaGerada.resultado, origem: null, comparacao: null };
  throw Error("Gere a escala ou a proposta 5×2 antes de conferir com o diagnóstico.");
}

export function conferirDiagnostico(diagnostico, state) {
  const answers = diagnostico?.answers || {};
  const escala = escalaParaConferir(state);
  const { config, resultado } = escala;
  const itens = [];
  const add = (nivel, perguntas, tituloItem, detalhe) => {
    const certezas = perguntas.map((id) => answers[id]?.certainty).filter((c) => c && c !== "confirmada");
    itens.push({ nivel, perguntas, titulo: tituloItem, detalhe,
      certeza: certezas.includes("pendente") ? CERTEZAS.pendente : certezas.includes("estimativa") ? CERTEZAS.estimativa : null });
  };
  const valor = (id) => answers[id]?.value;
  const diasTrab = (r) => r.dias.filter((d) => trabalha(d) && Number.isFinite(d.entradaMin) && Number.isFinite(d.saidaMin));

  // 1. Dias e horários de funcionamento (q05) e atividades fora do horário (q06).
  const horarios = (valor("q05") || []).filter((r) => Number.isInteger(r?.dia) && min(r.inicio) != null && min(r.fim) != null);
  if (horarios.length) {
    const abertos = new Map(horarios.map((r) => {
      const a = min(r.inicio), b = min(r.fim);
      return [r.dia, { a, b: b <= a ? b + 1440 : b }];
    }));
    const foraDoHorario = (lista) => new Set(lista.filter((r) => diasTrab(r).some((d) => {
      const j = abertos.get(d.weekday);
      return j && (d.entradaMin < j.a || d.saidaMin > j.b);
    })).map((r) => r.colaborador.id));
    const diasFechados = new Map(), forasHorario = new Map(), diasComTrabalho = new Set();
    for (const r of resultado)
      for (const d of diasTrab(r)) {
        diasComTrabalho.add(d.weekday);
        const j = abertos.get(d.weekday);
        if (!j) { diasFechados.set(d.weekday, new Set([...(diasFechados.get(d.weekday) || []), r.colaborador.nome])); continue; }
        if (d.entradaMin < j.a || d.saidaMin > j.b) {
          const k = r.colaborador.nome;
          if (!forasHorario.has(k)) forasHorario.set(k, `${hhmm(d.entradaMin)}–${hhmm(d.saidaMin)} (${DIAS[d.weekday]}; funcionamento ${hhmm(j.a)}–${hhmm(j.b)})`);
        }
      }
    if (diasFechados.size)
      add("divergencia", ["q05"], "Trabalho em dia sem funcionamento",
        `A escala tem trabalho em ${listaDias([...diasFechados.keys()])}, mas o diagnóstico informa que a empresa não funciona nesses dias. ${[...diasFechados].map(([d, p]) => `${DIAS[d]}: ${plural(p.size, "pessoa", "pessoas")}`).join("; ")}.`);
    const semNinguem = [...abertos.keys()].filter((d) => !diasComTrabalho.has(d));
    if (semNinguem.length)
      add("divergencia", ["q05"], "Dia de funcionamento sem ninguém escalado",
        `O diagnóstico informa funcionamento em ${listaDias(semNinguem)}, mas ninguém trabalha nesse dia na escala.`);
    if (forasHorario.size) {
      const exemplos = [...forasHorario].slice(0, 3).map(([n, t]) => `${n}: ${t}`).join("; ");
      const atividades = valor("q06");
      const antes = escala.origem ? foraDoHorario(escala.origem).size : null;
      if (atividades === "Sim" && antes != null && forasHorario.size > antes)
        add("alerta", ["q05", "q06"], "Mais pessoas fora do horário de funcionamento",
          `Hoje ${plural(antes, "pessoa trabalha", "pessoas trabalham")} antes da abertura ou depois do fechamento; na proposta, ${forasHorario.size}. O diagnóstico confirma atividades fora do horário${answers.q06?.note ? ` (“${answers.q06.note}”)` : ""}; confira se elas precisam de mais gente. Ex.: ${exemplos}.`);
      else if (atividades === "Sim")
        add("ok", ["q05", "q06"], "Trabalho antes da abertura ou depois do fechamento",
          `${plural(forasHorario.size, "pessoa trabalha", "pessoas trabalham")} fora do horário de funcionamento, o que é coerente com as atividades antes da abertura ou depois do fechamento informadas no diagnóstico${answers.q06?.note ? ` (“${answers.q06.note}”)` : ""}. Confira se são as pessoas certas. Ex.: ${exemplos}.`);
      else
        add(atividades === "Não" ? "divergencia" : "alerta", ["q05", "q06"], "Trabalho fora do horário de funcionamento",
          `${plural(forasHorario.size, "pessoa trabalha", "pessoas trabalham")} antes da abertura ou depois do fechamento, mas o diagnóstico ${atividades === "Não" ? "informa que não há atividades fora do horário" : "não confirma atividades fora do horário"}. Ex.: ${exemplos}.`);
    }
    if (!diasFechados.size && !semNinguem.length && !forasHorario.size)
      add("ok", ["q05"], "Dias e horários de funcionamento", "Todo o trabalho da escala acontece nos dias e horários de funcionamento informados.");
    const cadastrados = [...new Set(config.diasTrabalho || [])].sort();
    const informados = [...abertos.keys()].sort();
    if (cadastrados.length && cadastrados.join() !== informados.join())
      add("alerta", ["q05"], "Dias de funcionamento do preenchimento",
        `O preenchimento usa funcionamento em ${listaDias(cadastrados)}; o diagnóstico informa ${listaDias(informados)}. Ajuste a etapa de funcionamento se o diagnóstico estiver certo.`);
  }

  // 2. Mínimo de pessoas por função, dia e faixa (q11).
  const cobertura = (valor("q11") || []).filter((r) => r?.funcao?.trim() && Number.isInteger(r.minimo) && r.diasSemana?.length && min(r.inicio) != null && min(r.fim) != null);
  if (cobertura.length) {
    const equipe = new Map();
    for (const r of resultado) for (const f of funcoesHabilitadas(r.colaborador)) equipe.set(chaveFuncao(f), f);
    const ausentes = [...new Set(cobertura.map((r) => r.funcao.trim()).filter((f) => !equipe.has(chaveFuncao(f))))];
    if (ausentes.length)
      add("divergencia", ["q11"], "Função do diagnóstico sem ninguém na equipe",
        `${ausentes.join(", ")}: o diagnóstico exige essa função, mas nenhum colaborador tem esse cargo ou essa habilitação. Confira o nome da função ou cadastre a habilitação.`);
    const demandas = cobertura.filter((r) => equipe.has(chaveFuncao(r.funcao))).map((r, i) => ({
      id: i + 1, funcao: equipe.get(chaveFuncao(r.funcao)), inicio: r.inicio, fim: r.fim, minimo: r.minimo,
      diasSemana: [...r.diasSemana], incluirFeriados: false,
    }));
    if (demandas.length) {
      const rel = analisarCobertura({ ...config, coberturaAtiva: true, demandasCobertura: demandas }, resultado);
      const porFuncao = new Map();
      for (const l of rel.lacunas) {
        const g = porFuncao.get(l.funcao) || { dias: new Set(), minutos: 0, exemplo: l };
        g.dias.add(l.data);
        g.minutos += (l.fimMin - l.inicioMin) * (l.faltantes || 1);
        porFuncao.set(l.funcao, g);
      }
      if (porFuncao.size)
        add("divergencia", ["q11"], "Mínimo por função não atendido",
          [...porFuncao].map(([f, g]) => `${f}: falta gente em ${plural(g.dias.size, "dia", "dias")} (ex.: ${dataBr(g.exemplo.data)}, ${hhmm(g.exemplo.inicioMin)}–${hhmm(g.exemplo.fimMin)}, ${g.exemplo.presentes} de ${g.exemplo.necessarios})`).join("; ") + ".");
      else add("ok", ["q11"], "Mínimo por função", "Todas as faixas de mínimo de pessoas do diagnóstico estão cobertas na escala.");
    }
    const assinatura = (d) => [chaveFuncao(d.funcao), d.inicio, d.fim, d.minimo, [...d.diasSemana].sort().join("")].join("|");
    const doPreenchimento = config.coberturaAtiva === false ? [] : config.demandasCobertura || [];
    if (!doPreenchimento.length)
      add("alerta", ["q11"], "Cobertura do diagnóstico não cadastrada",
        "O preenchimento não tem cobertura mínima cadastrada, então a escala foi gerada sem buscar esse mínimo. Cadastre as faixas do diagnóstico na etapa de cobertura e gere novamente.");
    else {
      const a = new Set(cobertura.map(assinatura)), b = new Set(doPreenchimento.map(assinatura));
      if (a.size !== b.size || [...a].some((x) => !b.has(x)))
        add("alerta", ["q11"], "Cobertura diferente da cadastrada",
          `O preenchimento tem ${plural(b.size, "faixa", "faixas")} de cobertura e o diagnóstico ${plural(a.size, "faixa", "faixas")}, com diferenças de função, horário, dias ou mínimo. A escala foi gerada com as faixas do preenchimento.`);
    }
  }

  // 3. O que a empresa aceita alterar (q27): comparação da proposta com a escala atual.
  const aceita = valor("q27") || [];
  if (escala.tipo === "proposta" && escala.origem && aceita.length) {
    const atuais = new Map(escala.origem.map((r) => [r.colaborador.id, r]));
    const padrao = (r) => {
      const p = new Map();
      for (const d of r.dias) {
        const s = p.get(d.weekday) || { trabalha: false, folga: false, entradas: new Set(), pausas: new Set() };
        if (trabalha(d)) {
          s.trabalha = true;
          if (Number.isFinite(d.entradaMin)) s.entradas.add(`${d.entradaMin}-${d.saidaMin}`);
          if (Number.isFinite(d.intervaloInicioMin)) s.pausas.add(d.intervaloInicioMin);
        } else if (!["NC", "VA", "AF", "I"].includes(d.status) && !d.feriado) s.folga = true;
        p.set(d.weekday, s);
      }
      return p;
    };
    const mudou = { horario: [], intervalo: [], folgaMovida: [], funcao: [] };
    for (const r of resultado) {
      const o = atuais.get(r.colaborador.id);
      if (!o) continue;
      const pa = padrao(o), pp = padrao(r);
      const nome = r.colaborador.nome;
      const folgasAntes = [...pa].filter(([, s]) => s.folga && !s.trabalha).map(([d]) => d);
      const folgasDepois = [...pp].filter(([, s]) => s.folga).map(([d]) => d);
      if (folgasAntes.some((d) => !folgasDepois.includes(d))) mudou.folgaMovida.push(nome);
      const igual = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
      if ([...pp].some(([d, s]) => s.trabalha && pa.get(d)?.trabalha && !igual(s.entradas, pa.get(d).entradas))) mudou.horario.push(nome);
      if ([...pp].some(([d, s]) => s.trabalha && pa.get(d)?.trabalha && !igual(s.pausas, pa.get(d).pausas))) mudou.intervalo.push(nome);
      if (r.dias.some((d) => trabalha(d) && d.funcaoAlocada && chaveFuncao(d.funcaoAlocada) !== chaveFuncao(r.colaborador.cargo))) mudou.funcao.push(nome);
    }
    const nada = aceita.includes("Nenhuma alteração");
    const regra = (opcao, lista, rotulo) => {
      if (!lista.length) return;
      const nomes = `${lista.slice(0, 4).join(", ")}${lista.length > 4 ? ` e mais ${lista.length - 4}` : ""}`;
      if (!nada && aceita.includes(opcao))
        add("ok", ["q27"], `${rotulo} (alteração aceita)`, `A proposta altera ${rotulo.toLowerCase()} de ${plural(lista.length, "pessoa", "pessoas")}, o que a empresa aceita: ${nomes}.`);
      else
        add("divergencia", ["q27"], `${rotulo} alterados sem aceite`, `A proposta altera ${rotulo.toLowerCase()} de ${plural(lista.length, "pessoa", "pessoas")} (${nomes}), mas o diagnóstico ${nada ? "informa que a empresa não aceita alterações" : `não marca “${opcao}” entre as alterações aceitas`}.`);
    };
    regra("Entradas e saídas", mudou.horario, "Horários de entrada e saída");
    regra("Distribuição dos intervalos", mudou.intervalo, "Intervalos");
    regra("Dias de folga", mudou.folgaMovida, "Dias de folga atuais");
    regra("Funções por período", mudou.funcao, "Funções por período");
    if (!aceita.includes("Dias de folga") || nada)
      add("alerta", ["q27"], "Segundo repouso semanal",
        "A proposta acrescenta o segundo dia de repouso semanal exigido pela EC 141. Mesmo sem aceite para mudar dias de folga, combine com a empresa em quais dias ele será concedido.");
  }

  // 4. ACT/CCT (q24) e condições do instrumento (q25).
  const inst = valor("q24");
  const decl = config.instrumentoCompensacao === "act_cct" ? config.instrumentoColetivo || {} : null;
  if (inst && typeof inst === "object") {
    if (inst.semInstrumento && decl)
      add("alerta", ["q24"], "Instrumento coletivo", `O diagnóstico informa que não há ACT/CCT, mas o preenchimento declara “${decl.identificacao || "instrumento coletivo"}”.`);
    else if (inst.nome && !decl)
      add("alerta", ["q24"], "Instrumento coletivo não declarado", `O diagnóstico informa o ACT/CCT “${inst.nome}”${inst.inicio ? `, vigente de ${dataBr(inst.inicio)} a ${dataBr(inst.fim)}` : ""}, mas o preenchimento não declara instrumento coletivo. Cláusulas de compensação ou 12×36 não estão sendo consideradas.`);
    else if (inst.nome && decl) {
      const datas = inst.inicio && inst.fim && (inst.inicio !== decl.inicio || inst.fim !== decl.fim);
      add(datas ? "alerta" : "ok", ["q24"], "Instrumento coletivo", datas
        ? `A vigência do diagnóstico (${dataBr(inst.inicio)} a ${dataBr(inst.fim)}) difere da declarada no preenchimento (${dataBr(decl.inicio)} a ${dataBr(decl.fim)}).`
        : `ACT/CCT do diagnóstico coerente com o declarado no preenchimento (${decl.identificacao || inst.nome}).`);
    }
    const datasEscala = resultado.flatMap((r) => r.dias.map((d) => d.data)).sort();
    if (inst.fim && datasEscala.length && inst.fim < datasEscala.at(-1))
      add("alerta", ["q24"], "Vigência do ACT/CCT", `O ACT/CCT informado vence em ${dataBr(inst.fim)}, antes do fim da escala (${dataBr(datasEscala.at(-1))}). Confira a renovação.`);
  }
  const condicoes = valor("q25") || [];
  if (condicoes.includes("12×36") && config.tipoEscala !== "12x36")
    add("alerta", ["q25"], "Regime 12×36", "O diagnóstico indica que o instrumento prevê 12×36, mas a escala não usa esse regime. Confira se algum grupo deveria estar em 12×36.");
  if (condicoes.includes("Compensação diária") && !(decl && decl.compensacaoDiaria))
    add("alerta", ["q25"], "Compensação diária", "O diagnóstico indica compensação diária no instrumento, mas ela não está declarada no preenchimento; a escala não usa jornadas acima de 8h por essa autorização.");
  const noturno = resultado.some((r) => diasTrab(r).some((d) => {
    for (let m = d.entradaMin; m < d.saidaMin; m += 15) { const h = ((m % 1440) + 1440) % 1440; if (h >= 1320 || h < 300) return true; }
    return false;
  }));
  if (noturno && !condicoes.includes("Trabalho noturno"))
    add("alerta", ["q25"], "Trabalho noturno", "A escala tem trabalho entre 22h e 5h, e o diagnóstico não indica regras de trabalho noturno no instrumento. Confira adicional, hora noturna reduzida e as regras da categoria.");

  // 5. Atividade (q23): comércio e a regra do domingo a cada 3 semanas.
  const atividade = String(valor("q23") || "");
  if (/com[eé]rci|varej|loja|supermercad/i.test(atividade) && !config.atividadeComercio)
    add("alerta", ["q23"], "Atividade de comércio", `O diagnóstico descreve “${atividade.slice(0, 120)}”, mas o preenchimento não marca a atividade como comércio. Sem isso, a regra do domingo a cada 3 semanas (Lei nº 10.101/2000) não é aplicada.`);

  // 6. Equipe: restrições individuais (q29), multifunção (q17) e cargas (q26).
  if (valor("q29") === "Sim" && !resultado.some((r) => Object.values(r.colaborador.restricoes || {}).some((v) => Array.isArray(v) ? v.length : !!v)))
    add("alerta", ["q29"], "Restrições individuais", "O diagnóstico informa restrições individuais, mas nenhum colaborador tem restrição cadastrada. A escala não as considera.");
  if (valor("q17") === "Sim" && !resultado.some((r) => funcoesHabilitadas(r.colaborador).length > 1))
    add("alerta", ["q17"], "Colaboradores multifunção", "O diagnóstico informa colaboradores habilitados para mais de uma função, mas nenhuma habilitação extra foi cadastrada. A escala não usa essa flexibilidade.");
  if (["Não", "Parcialmente", "Não sei"].includes(valor("q26")))
    add("alerta", ["q26"], "Cargas contratuais", `O diagnóstico informa que as cargas contratuais ${valor("q26") === "Parcialmente" ? "foram conferidas só em parte" : "não foram conferidas"}. A escala usa as cargas cadastradas.`);

  // 7. Data de implantação (q03) e fase da jornada.
  const implantacao = valor("q03");
  if (escala.tipo === "proposta" && /^\d{4}-\d{2}-\d{2}$/.test(implantacao || "")) {
    const acima40 = resultado.some((r) => r.dias.some((d) => trabalha(d) && Number(d.alvoSemana) > 40));
    if (implantacao >= "2027-12-16" && acima40)
      add("divergencia", ["q03"], "Fase da jornada", `A implantação está prevista para ${dataBr(implantacao)}, quando o limite já é de 40h semanais, mas a proposta usa a fase de 42h.`);
    else {
      const periodo = config.mes != null ? `${config.ano}-${String(config.mes + 1).padStart(2, "0")}` : null;
      const mesmoMes = !periodo || periodo === implantacao.slice(0, 7);
      add(mesmoMes ? "ok" : "alerta", ["q03"], "Data de implantação", mesmoMes
        ? `Implantação prevista para ${dataBr(implantacao)}, no mesmo mês da proposta.`
        : `A proposta foi calculada para ${periodo.split("-").reverse().join("/")}, mas a implantação está prevista para ${dataBr(implantacao)}. Gere a proposta para o mês da implantação para conferir a fase de jornada e o calendário corretos.`);
    }
  }

  // 8. Prioridade principal (q32).
  const prioridade = (valor("q32") || [])[0];
  const lacunasEscala = escala.comparacao?.faltantesDepois ?? config.escalaGerada?.coberturaOperacional?.lacunas?.length ?? 0;
  if (prioridade === "Cobertura operacional" && lacunasEscala > 0)
    add("alerta", ["q32"], "Prioridade: cobertura operacional", "A cobertura é a prioridade nº 1 do diagnóstico, mas a escala ainda tem lacunas de cobertura. Revise as sugestões de ajuste antes de fechar a proposta.");
  else if (prioridade === "Menor necessidade de contratação" && escala.comparacao?.status === "insuficiente")
    add("alerta", ["q32"], "Prioridade: menor contratação", "Evitar contratação é a prioridade nº 1, mas a proposta indica capacidade insuficiente. Considere as alternativas da pergunta sobre falta de pessoal.");
  else if (prioridade === "Previsibilidade das folgas") {
    const variaveis = resultado.filter((r) => {
      const porSemana = new Map();
      for (const d of r.dias) if (!trabalha(d)) {
        const k = Math.floor((Date.parse(d.data + "T12:00:00Z") / 86400000 + 3) / 7);
        porSemana.set(k, [...(porSemana.get(k) || []), d.weekday].sort().join());
      }
      return new Set(porSemana.values()).size > 1;
    }).length;
    if (variaveis) add("alerta", ["q32"], "Prioridade: previsibilidade das folgas", `A previsibilidade das folgas é a prioridade nº 1, mas ${plural(variaveis, "pessoa tem", "pessoas têm")} folgas que mudam de semana para semana.`);
    else add("ok", ["q32"], "Prioridade: previsibilidade das folgas", "As folgas se repetem nos mesmos dias em todas as semanas.");
  } else if (prioridade) add("ok", ["q32"], `Prioridade: ${prioridade.toLowerCase()}`, "Sem conflito identificado com a prioridade nº 1 do diagnóstico.");

  // 9. Respostas em texto livre: conferência pela equipe.
  for (const r of (valor("q28") || []).filter((x) => x?.descricao?.trim()))
    add("conferir", ["q28"], r.natureza === "obrigatoria" ? "Condição obrigatória" : "Preferência", r.descricao.trim());
  for (const id of ["q08", "q14"]) {
    const t = String(valor(id) || "").trim();
    if (t) add("conferir", [id], titulo(id), t);
  }

  itens.sort((a, b) => NIVEIS.indexOf(a.nivel) - NIVEIS.indexOf(b.nivel));
  const contagem = Object.fromEntries(NIVEIS.map((n) => [n, itens.filter((i) => i.nivel === n).length]));
  return { escala: escala.tipo, itens, contagem };
}
