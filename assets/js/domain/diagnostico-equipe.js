import { configDaEscala } from "./contexto-escala.js";
import { periodoModelo } from "./modelo-escala.js";
import { analisarCobertura, normalizarFuncao } from "./cobertura.js";
import { habilitadoPara, funcaoDoDia } from "./funcoes.js";
import { configDoPerfil, verificarPerfil } from "./perfil-dominio.js";
import { janelasDeclaradas } from "./disponibilidade.js";
import { validarRestricoes, bloqueioNaData } from "./restricoes.js";
import {
  referenciaSemana,
  referenciaDia,
  limiteDiario,
  dataValida,
} from "./ec141.js";
import { createFeriados } from "./feriados.js";
import {
  dateFromKey,
  isoDate,
  getMonday,
  fmtHoras,
  horarioComDia,
} from "./datas-horas.js";
import { criarFluxo } from "./fluxo-capacidade.js";

export const TITULOS_DIAGNOSTICO = {
  nao_avaliada: "Cadastre a cobertura operacional para avaliar a equipe.",
  dados_pendentes: "Revise os dados antes de concluir sobre contratação.",
  coberta: "A distribuição atual cobre a demanda informada.",
  capacidade_insuficiente: "Falta capacidade dentro das condições cadastradas.",
  redistribuicao: "Há margem para testar uma redistribuição dos horários.",
};
export const CAUSAS_DIAGNOSTICO = {
  quadro: "Quadro habilitado insuficiente neste horário.",
  disponibilidade:
    "Disponibilidade incompatível: reveja janelas, folgas fixas, férias, afastamentos e admissões. Pode ser necessário reforço temporário.",
  compartilhada:
    "As funções disputam as mesmas pessoas habilitadas. Uma pessoa não cobre duas funções ao mesmo tempo.",
  limite_jornada:
    "Há janela compatível neste horário, mas os limites de horas ou dias disponíveis não comportam toda a demanda do período. Confira as verificações de capacidade abaixo, inclusive as funções que compartilham a equipe.",
  distribuicao:
    "Há pessoas habilitadas com janela compatível. Teste os ajustes automáticos; a viabilidade ainda depende de jornada, intervalos e descanso.",
  dados_pendentes: "Conclusão de capacidade suspensa até a revisão dos dados.",
};

const DIA = 1440;
const minuto = (data) =>
  Date.UTC(...data.split("-").map((n, i) => Number(n) - (i === 1 ? 1 : 0))) /
  60000;
const dataMin = (m) => new Date(m * 60000).toISOString().slice(0, 10);
const chave = (d) => isoDate(d.getFullYear(), d.getMonth(), d.getDate());
const semana = (data) => chave(getMonday(dateFromKey(data)));
const trabalha = (d) => ["T", "FE"].includes(d.status) && d.horas > 0;
const ordenarDias = [1, 2, 3, 4, 5, 6, 0];
const nomesDias = [
  "domingos",
  "segundas",
  "terças",
  "quartas",
  "quintas",
  "sextas",
  "sábados",
];
export function diasEmTexto(dias) {
  const nomes = ordenarDias
    .filter((d) => dias.includes(d))
    .map((d) => nomesDias[d]);
  return nomes.length < 2
    ? nomes[0] || ""
    : nomes.slice(0, -1).join(", ") + " e " + nomes.at(-1);
}
function unirIntervalos(intervalos) {
  const ordem = intervalos
      .filter(([a, b]) => Number.isFinite(a) && b > a)
      .sort((a, b) => a[0] - b[0]),
    out = [];
  for (const faixa of ordem) {
    const ultimo = out.at(-1);
    if (ultimo && faixa[0] <= ultimo[1])
      ultimo[1] = Math.max(ultimo[1], faixa[1]);
    else out.push([...faixa]);
  }
  return out;
}
const duracao = (faixas) =>
  unirIntervalos(faixas).reduce((s, [a, b]) => s + b - a, 0);
const cobre = (faixas, a, b) => faixas.some(([x, y]) => x <= a && y >= b);
function segmentosAtuais(d) {
  if (!trabalha(d) || ![d.entradaMin, d.saidaMin].every(Number.isFinite))
    return [];
  if (
    d.intervaloMin > 0 &&
    Number.isFinite(d.intervaloInicioMin) &&
    Number.isFinite(d.intervaloFimMin)
  )
    return [
      [d.entradaMin, d.intervaloInicioMin],
      [d.intervaloFimMin, d.saidaMin],
    ].filter(([a, b]) => b > a);
  return [[d.entradaMin, d.saidaMin]];
}
function construirPessoas(config, resultado, inicio, fim) {
  const { feriadoDaData } = createFeriados(config),
    out = [],
    avisos = [];
  for (const r of resultado) {
    const c = r.colaborador,
      proprio = configDoPerfil(config, c) || config;
    try {
      verificarPerfil(c);
      if (
        (c.quadroDominio?.admissaoIso &&
          !dataValida(c.quadroDominio.admissaoIso)) ||
        r.dias.some(
          (d) =>
            !dataValida(d.data) ||
            !Number.isFinite(d.horas) ||
            (["T", "FE"].includes(d.status) &&
              d.horas > 0 &&
              (!Number.isFinite(d.entradaMin) || !Number.isFinite(d.saidaMin))),
        ) ||
        validarRestricoes(c).length ||
        !String(c.cargo || "").trim() ||
        !Number.isFinite(Number(c.horasSemana)) ||
        !(Number(c.horasSemana) > 0)
      )
        throw new Error("Revise cargo, carga e restrições.");
    } catch (error) {
      avisos.push(`${c.nome || "Colaborador"}: ${error.message}`);
      continue;
    }
    const mapa = new Map(
      [...(r.diasContexto || []), ...r.dias].map((d) => [d.data, d]),
    );
    const especial = proprio.tipoEscala === "12x36" || !!proprio.cicloQuadro;
    const p = {
      id: c.id,
      c,
      proprio,
      especial,
      dias: new Map(),
      faixas: [],
      noturno: false,
    };
    for (let base = inicio - DIA; base < fim; base += DIA) {
      const data = dataMin(base),
        wd = dateFromKey(data).getDay(),
        real = mapa.get(data),
        feriado = real?.feriado || feriadoDaData(data);
      let janelas = [];
      const antesAdmissao =
        c.quadroDominio?.admissaoIso && data < c.quadroDominio.admissaoIso;
      if (!antesAdmissao) {
        if (especial || real?.ajusteManual)
          janelas = segmentosAtuais(real || {}).map(([inicio, fim]) => ({
            inicio,
            fim,
          }));
        else if (
          !(proprio.folgasFimSemana && [0, 6].includes(wd)) &&
          !(config.folgasFixasOrigemCobertura || []).includes(wd)
        )
          janelas = janelasDeclaradas(config, c, {
            data,
            weekday: wd,
            feriado,
          });
      }
      // Presença válida já registrada nunca é retirada de um teto potencial.
      const atuais = segmentosAtuais(real || {});
      janelas.push(...atuais.map(([inicio, fim]) => ({ inicio, fim })));
      const partes = [];
      for (const j of janelas) {
        if (j.fim > DIA) p.noturno = true;
        for (let a = base + j.inicio; a < base + j.fim; ) {
          const b = Math.min(base + j.fim, Math.floor(a / DIA) * DIA + DIA),
            dataParte = dataMin(a);
          if (!bloqueioNaData(c, dataParte))
            partes.push([Math.max(a, inicio), Math.min(b, fim)]);
          a = b;
        }
      }
      const faixas = unirIntervalos(partes);
      const ref = referenciaDia(proprio, data, c);
      const maxDia = especial
        ? duracao(faixas)
        : Math.min(
            duracao(faixas),
            (ref.semLimiteJornada ? 24 : limiteDiario(proprio, data)) * 60,
          );
      p.dias.set(data, {
        data,
        semana: semana(data),
        faixas,
        capacidade: Math.max(0, maxDia),
      });
      p.faixas.push(...faixas);
    }
    p.faixas = unirIntervalos(p.faixas);
    out.push(p);
  }
  return { pessoas: out, avisos };
}
function capacidadeSemana(p, key) {
  const dias = [...p.dias.values()].filter((d) => d.semana === key),
    ref = referenciaSemana(p.proprio, dias, p.c);
  const compensacao =
    p.proprio.instrumentoColetivo?.compensacaoHoras ||
    p.proprio.instrumentoColetivo?.repousoMensal;
  const quantidade =
    p.especial || compensacao
      ? 7
      : p.proprio.tipoEscala === "5x2"
        ? 5
        : p.proprio.tipoEscala === "6x1"
          ? 7 - ref.folgas
          : 7;
  const fisica = dias
    .map((d) => d.capacidade)
    .sort((a, b) => b - a)
    .slice(0, quantidade)
    .reduce((s, h) => s + h, 0);
  return {
    minutos: Math.min(
      fisica,
      p.especial || compensacao ? Infinity : ref.alvo * 60,
    ),
    dias: Math.min(quantidade, dias.filter((d) => d.capacidade > 0).length),
  };
}
function fluxoAtendimento(pessoas, demandas, capacidade, eligivel, capAresta) {
  const f = criarFluxo(),
    origem = f.no(),
    destino = f.no();
  const nosDemandas = demandas.map((d) => {
    const no = f.no();
    f.ligar(no, destino, d.quantidade);
    return no;
  });
  for (const p of pessoas) {
    const cap = capacidade(p);
    if (!(cap > 0)) continue;
    const no = f.no();
    f.ligar(origem, no, cap);
    demandas.forEach((d, i) => {
      if (eligivel(p, d))
        f.ligar(
          no,
          nosDemandas[i],
          Math.min(cap, capAresta?.(p, d) ?? d.quantidade),
        );
    });
  }
  return {
    necessarios: demandas.reduce((s, d) => s + d.quantidade, 0),
    capacidade: f.maximo(origem, destino),
  };
}
// Componentes de habilitação evitam atribuir a uma função independente o déficit de outra.
function grupoConectado(pessoas, demandas, funcao) {
  const nomes = new Set([normalizarFuncao(funcao)]);
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const p of pessoas) {
      if (
        !demandas.some(
          (d) =>
            nomes.has(normalizarFuncao(d.funcao)) &&
            habilitadoPara(p.c, d.funcao),
        )
      )
        continue;
      for (const d of demandas)
        if (
          habilitadoPara(p.c, d.funcao) &&
          !nomes.has(normalizarFuncao(d.funcao))
        ) {
          nomes.add(normalizarFuncao(d.funcao));
          mudou = true;
        }
    }
  }
  return demandas.filter((d) => nomes.has(normalizarFuncao(d.funcao)));
}
function gruposDeFuncoes(pessoas, demandas) {
  const restantes = new Map(
      demandas.map((d) => [normalizarFuncao(d.funcao), d]),
    ),
    grupos = [];
  while (restantes.size) {
    const grupo = grupoConectado(
      pessoas,
      demandas,
      restantes.values().next().value.funcao,
    );
    grupos.push(new Set(grupo.map((d) => normalizarFuncao(d.funcao))));
    for (const d of grupo) restantes.delete(normalizarFuncao(d.funcao));
  }
  return grupos;
}
function deficitDoGrupo(pessoas, demandas, funcao) {
  const grupo = grupoConectado(pessoas, demandas, funcao);
  if (grupo.length < 2) return 0;
  const a = fluxoAtendimento(
    pessoas,
    grupo,
    () => 1,
    (p, d) => habilitadoPara(p.c, d.funcao),
  );
  return a.necessarios - a.capacidade;
}
function fraseGrupo(g) {
  return `Às ${diasEmTexto(g.diasSemana)}, das ${horarioComDia(g.inicioMin)} às ${horarioComDia(g.fimMin)}: ${g.faltantes === 1 ? "falta 1 pessoa" : "faltam " + g.faltantes + " pessoas"} na função ${g.funcao}.`;
}
export function diagnosticarEquipe(config, resultado, relatorio = null) {
  config = configDaEscala(config);
  const rel = relatorio || analisarCobertura(config, resultado);
  const diagnostico = {
    status: "nao_avaliada",
    grupos: [],
    provas: [],
    funcoes: [],
    avisos: [...rel.avisos],
    limitacoes: [],
    picoDeficitMinimo: 0,
  };
  if (!rel.configurada || !rel.periodos.length) return diagnostico;
  const fixo = periodoModelo(config);
  const inicio = minuto(fixo?.inicio || isoDate(config.ano, config.mes, config.diaInicio)),
    fim =
      minuto(
        fixo?.fim || isoDate(
          config.ano,
          config.mes,
          new Date(config.ano, config.mes + 1, 0).getDate(),
        ),
      ) + DIA;
  const construida = construirPessoas(config, resultado, inicio, fim),
    pessoas = construida.pessoas;
  diagnostico.avisos.push(...construida.avisos);
  if (new Set(resultado.map((r) => r.colaborador.id)).size !== resultado.length)
    diagnostico.avisos.push(
      "Há identificadores de colaboradores duplicados. Revise o cadastro.",
    );
  const funcoes = new Map();
  for (const per of rel.periodos) {
    const key = normalizarFuncao(per.funcao);
    if (!funcoes.has(key))
      funcoes.set(key, {
        funcao: per.funcao,
        pico: 0,
        necessarias: 0,
        faltantes: 0,
        disponiveis: 0,
        limiteCapacidade: 0,
        insuficiencias: [],
      });
    const f = funcoes.get(key);
    f.pico = Math.max(f.pico, per.faltantes);
    f.necessarias += ((per.fimMin - per.inicioMin) * per.necessarios) / 60;
    f.faltantes += ((per.fimMin - per.inicioMin) * per.faltantes) / 60;
  }
  diagnostico.funcoes = [...funcoes.values()];
  const semanas = [...new Set(rel.periodos.map((p) => semana(p.data)))];
  // Tetos são otimistas: pausas e interjornada não são descontadas aqui.
  // Uma insuficiência mesmo neste teto é demonstrável; o inverso não prova viabilidade.
  for (const f of funcoes.values()) {
    for (const p of pessoas)
      if (habilitadoPara(p.c, f.funcao))
        for (const w of semanas)
          f.limiteCapacidade += capacidadeSemana(p, w).minutos / 60;
    for (const r of resultado)
      for (const d of r.dias)
        if (
          trabalha(d) &&
          minuto(d.data) >= inicio &&
          minuto(d.data) < fim &&
          normalizarFuncao(funcaoDoDia(r.colaborador, d)) ===
            normalizarFuncao(f.funcao)
        )
          f.disponiveis += d.horas;
  }
  const ciclosOuNoturnos = pessoas.some((p) => p.noturno || p.especial);
  if (ciclosOuNoturnos)
    diagnostico.limitacoes.push(
      "Em turnos noturnos e ciclos especiais, a conclusão usa a disponibilidade simultânea. Não presume rateio de horas ou dias entre semanas.",
    );
  const provas = [],
    detalhes = [];
  let custo = 0,
    limitada = false;
  const cache = new Map();
  const provar = (prova) => {
    if (prova.deficit > 1e-6) provas.push(prova);
  };
  for (let base = inicio; base < fim; base += DIA) {
    const data = dataMin(base),
      periodos = rel.periodos.filter((p) => p.data === data),
      pontos = new Set(periodos.flatMap((p) => [p.inicioMin, p.fimMin]));
    for (const p of pessoas)
      for (const [a, b] of p.faixas)
        if (b > base && a < base + DIA) {
          pontos.add(Math.max(0, a - base));
          pontos.add(Math.min(DIA, b - base));
        }
    const ordem = [...pontos].sort((a, b) => a - b);
    for (let i = 0; i < ordem.length - 1; i++) {
      const a = ordem[i],
        b = ordem[i + 1],
        demandas = periodos
          .filter((p) => p.inicioMin <= a && p.fimMin >= b)
          .map((p) => ({ ...p, quantidade: p.necessarios }));
      if (!demandas.length) continue;
      const aptos = pessoas.filter((p) => cobre(p.faixas, base + a, base + b));
      const assinatura = JSON.stringify([
        demandas.map((d) => [normalizarFuncao(d.funcao), d.quantidade]),
        aptos.map((p) => p.id),
      ]);
      let atendimento = cache.get(assinatura);
      if (!atendimento) {
        custo += aptos.length * demandas.length;
        if (custo > 100000) {
          limitada = true;
          break;
        }
        atendimento = fluxoAtendimento(
          aptos,
          demandas,
          () => 1,
          (p, d) => habilitadoPara(p.c, d.funcao),
        );
        cache.set(assinatura, atendimento);
      }
      const deficit = atendimento.necessarios - atendimento.capacidade;
      if (deficit > 0)
        provar({
          tipo: "simultaneidade",
          unidade: "pessoas",
          data,
          inicioMin: a,
          fimMin: b,
          funcoes: demandas.map((d) => d.funcao),
          necessarios: atendimento.necessarios,
          capacidade: atendimento.capacidade,
          deficit,
          mensagem: `${data}, ${horarioComDia(a)}–${horarioComDia(b)}: são necessárias ${atendimento.necessarios} pessoas ao mesmo tempo para ${demandas.map((d) => d.funcao).join(" / ")}, mas a equipe habilitada com janela compatível pode oferecer no máximo ${atendimento.capacidade}. Déficit mínimo simultâneo: ${deficit}.`,
        });
      for (const d of demandas.filter((d) => d.faltantes > 0)) {
        atendimento.deficitsGrupos ||= new Map();
        const keyFuncao = normalizarFuncao(d.funcao);
        if (deficit > 0 && !atendimento.deficitsGrupos.has(keyFuncao)) {
          custo += aptos.length * demandas.length * demandas.length;
          if (custo > 100000) {
            limitada = true;
            break;
          }
          atendimento.deficitsGrupos.set(
            keyFuncao,
            deficitDoGrupo(aptos, demandas, d.funcao),
          );
        }
        const qualificados = pessoas.filter((p) =>
            habilitadoPara(p.c, d.funcao),
          ).length,
          potenciais = aptos.filter((p) =>
            habilitadoPara(p.c, d.funcao),
          ).length;
        detalhes.push({
          data,
          funcao: d.funcao,
          inicioMin: a,
          fimMin: b,
          faltantes: d.faltantes,
          potenciais,
          deficitMinimo: Math.max(0, d.necessarios - potenciais),
          tipo:
            potenciais < d.necessarios
              ? qualificados < d.necessarios
                ? "quadro"
                : "disponibilidade"
              : (atendimento.deficitsGrupos.get(keyFuncao) || 0) > 0
                ? "compartilhada"
                : "distribuicao",
        });
      }
    }
    if (limitada) break;
  }
  if (!limitada && !ciclosOuNoturnos)
    for (const { w, funcoesDoGrupo } of gruposDeFuncoes(
      pessoas,
      diagnostico.funcoes,
    ).flatMap((funcoesDoGrupo) =>
      semanas.map((w) => ({ w, funcoesDoGrupo })),
    )) {
      const periodos = rel.periodos.filter(
          (p) =>
            semana(p.data) === w &&
            funcoesDoGrupo.has(normalizarFuncao(p.funcao)),
        ),
        dias = [...new Set(periodos.map((p) => p.data))];
      const demandas = diagnostico.funcoes
        .map((f) => ({
          funcao: f.funcao,
          quantidade: periodos
            .filter(
              (p) => normalizarFuncao(p.funcao) === normalizarFuncao(f.funcao),
            )
            .reduce((s, p) => s + (p.fimMin - p.inicioMin) * p.necessarios, 0),
        }))
        .filter((d) => d.quantidade > 0);
      custo +=
        pessoas.length *
        (demandas.length + dias.length * (demandas.length + 1));
      if (custo > 100000) {
        limitada = true;
        break;
      }
      const atendimento = fluxoAtendimento(
        pessoas,
        demandas,
        (p) => capacidadeSemana(p, w).minutos,
        (p, d) => habilitadoPara(p.c, d.funcao),
      );
      provar({
        tipo: "horas",
        unidade: "minutos",
        semana: w,
        funcoes: demandas.map((d) => d.funcao),
        ...atendimento,
        deficit: atendimento.necessarios - atendimento.capacidade,
        mensagem: `Semana de ${w}: demanda de ${fmtHoras(atendimento.necessarios / 60)} h-pessoa e teto de ${fmtHoras(atendimento.capacidade / 60)} h-pessoa para ${demandas.map((d) => d.funcao).join(" / ")}, sem duplicar a capacidade das pessoas com várias habilitações.`,
      });
      // Presença em dois dias civis pelo mesmo plantão noturno não vira dois dias de contrato.
      if (!pessoas.some((p) => p.noturno || p.especial)) {
        const porDia = [];
        for (const data of dias)
          for (const f of diagnostico.funcoes) {
            const minimo = Math.max(
              0,
              ...periodos
                .filter(
                  (p) =>
                    p.data === data &&
                    normalizarFuncao(p.funcao) === normalizarFuncao(f.funcao),
                )
                .map((p) => p.necessarios),
            );
            if (minimo)
              porDia.push({ data, funcao: f.funcao, quantidade: minimo });
          }
        const fluxo = criarFluxo(),
          origem = fluxo.no(),
          destino = fluxo.no();
        const nos = porDia.map((d) => {
          const no = fluxo.no();
          fluxo.ligar(no, destino, d.quantidade);
          return no;
        });
        for (const p of pessoas) {
          const pessoa = fluxo.no();
          fluxo.ligar(origem, pessoa, capacidadeSemana(p, w).dias);
          for (const data of dias) {
            if (!(p.dias.get(data)?.capacidade > 0)) continue;
            const dia = fluxo.no();
            fluxo.ligar(pessoa, dia, 1);
            porDia.forEach((d, i) => {
              if (d.data === data && habilitadoPara(p.c, d.funcao))
                fluxo.ligar(dia, nos[i], 1);
            });
          }
        }
        const necessarios = porDia.reduce((s, d) => s + d.quantidade, 0),
          capacidade = fluxo.maximo(origem, destino);
        provar({
          tipo: "dias",
          unidade: "dias-pessoa",
          semana: w,
          funcoes: demandas.map((d) => d.funcao),
          necessarios,
          capacidade,
          deficit: necessarios - capacidade,
          mensagem: `Semana de ${w}: a demanda exige pelo menos ${necessarios} dias-pessoa, mas a equipe pode oferecer no máximo ${capacidade}, respeitando dias disponíveis, habilitações e o modelo da escala.`,
        });
      }
      for (const data of dias) {
        const ds = periodos.filter((p) => p.data === data),
          dem = diagnostico.funcoes
            .map((f) => ({
              funcao: f.funcao,
              quantidade: ds
                .filter(
                  (p) =>
                    normalizarFuncao(p.funcao) === normalizarFuncao(f.funcao),
                )
                .reduce(
                  (s, p) => s + (p.fimMin - p.inicioMin) * p.necessarios,
                  0,
                ),
            }))
            .filter((d) => d.quantidade > 0);
        // Este bloco só é usado em jornadas diurnas, com uma origem por dia civil.
        const a = fluxoAtendimento(
          pessoas,
          dem,
          (p) => p.dias.get(data)?.capacidade || 0,
          (p, d) => habilitadoPara(p.c, d.funcao),
        );
        provar({
          tipo: "horas_dia",
          unidade: "minutos",
          data,
          funcoes: dem.map((d) => d.funcao),
          ...a,
          deficit: a.necessarios - a.capacidade,
          mensagem: `${data}: demanda de ${fmtHoras(a.necessarios / 60)} h-pessoa, acima do teto diário de ${fmtHoras(a.capacidade / 60)} h-pessoa da equipe habilitada.`,
        });
      }
    }
  if (limitada)
    diagnostico.avisos.push(
      "A análise detalhada atingiu o limite de processamento. As lacunas continuam disponíveis; a conclusão de capacidade precisa de revisão.",
    );
  const confiavel = !diagnostico.avisos.length;
  diagnostico.provas = confiavel && rel.lacunas.length ? provas : [];
  diagnostico.picoDeficitMinimo = Math.max(
    0,
    ...diagnostico.provas
      .filter((p) => p.unidade === "pessoas")
      .map((p) => p.deficit),
  );
  const linhas = [];
  const observadas = limitada
    ? rel.lacunas.map((l) => ({
        ...l,
        tipo: "dados_pendentes",
        potenciais: null,
        deficitMinimo: 0,
      }))
    : detalhes;
  observadas.sort(
    (a, b) =>
      a.data.localeCompare(b.data) ||
      normalizarFuncao(a.funcao).localeCompare(normalizarFuncao(b.funcao)) ||
      a.inicioMin - b.inicioMin,
  );
  for (const d of observadas) {
    if (!confiavel) d.tipo = "dados_pendentes";
    else if (
      d.tipo === "distribuicao" &&
      diagnostico.provas.some(
        (p) =>
          p.tipo !== "simultaneidade" &&
          p.funcoes.some(
            (f) => normalizarFuncao(f) === normalizarFuncao(d.funcao),
          ) &&
          (p.data === d.data || p.semana === semana(d.data)),
      )
    )
      d.tipo = "limite_jornada";
    const anterior = linhas.at(-1);
    if (
      anterior &&
      anterior.data === d.data &&
      normalizarFuncao(anterior.funcao) === normalizarFuncao(d.funcao) &&
      anterior.fimMin === d.inicioMin &&
      anterior.faltantes === d.faltantes &&
      anterior.tipo === d.tipo &&
      anterior.deficitMinimo === d.deficitMinimo
    ) {
      anterior.fimMin = d.fimMin;
      anterior.potenciais = Math.min(anterior.potenciais, d.potenciais);
    } else linhas.push({ ...d });
  }
  const grupos = new Map();
  for (const d of linhas) {
    const key = JSON.stringify([
      normalizarFuncao(d.funcao),
      d.inicioMin,
      d.fimMin,
      d.faltantes,
      d.tipo,
      d.deficitMinimo,
    ]);
    if (!grupos.has(key)) grupos.set(key, { ...d, datas: [], diasSemana: [] });
    const g = grupos.get(key);
    if (!g.datas.includes(d.data)) g.datas.push(d.data);
    const wd = dateFromKey(d.data).getDay();
    if (!g.diasSemana.includes(wd)) g.diasSemana.push(wd);
  }
  diagnostico.grupos = [...grupos.values()].map((g) => ({
    ...g,
    datas: g.datas.sort(),
    ocorrencias: g.datas.length,
    resumo: fraseGrupo(g),
  }));
  for (const f of diagnostico.funcoes) {
    if (!confiavel) continue;
    if (!pessoas.some((p) => habilitadoPara(p.c, f.funcao)))
      f.insuficiencias.push(
        "Nenhum colaborador possui habilitação cadastrada para essa função.",
      );
    f.insuficiencias.push(
      ...diagnostico.provas
        .filter((p) =>
          p.funcoes.some(
            (nome) => normalizarFuncao(nome) === normalizarFuncao(f.funcao),
          ),
        )
        .map((p) => p.mensagem),
    );
  }
  diagnostico.status = !confiavel
    ? "dados_pendentes"
    : !rel.lacunas.length
      ? "coberta"
      : diagnostico.provas.length
        ? "capacidade_insuficiente"
        : "redistribuicao";
  return diagnostico;
}
