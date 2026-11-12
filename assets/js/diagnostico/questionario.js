export const VERSAO_DIAGNOSTICO = 1;
const opc = (...s) => s;
export const ETAPAS_DIAGNOSTICO = [
  [
    "Objetivo da readequação",
    [
      [
        "q01",
        "Qual é o principal objetivo da análise?",
        "multi",
        opc(
          "Adequar a jornada",
          "Melhorar a cobertura",
          "Reduzir horas extras",
          "Organizar folgas",
          "Planejar contratações",
          "Outro",
        ),
        true,
      ],
      [
        "q02",
        "Qual estabelecimento ou unidade será analisado?",
        "text",
        null,
        true,
      ],
      [
        "q03",
        "Para quando a empresa pretende implementar a nova escala?",
        "date",
      ],
      [
        "q04",
        "Quem fornece as informações e quem aprova a proposta?",
        "text",
        null,
        true,
      ],
    ],
  ],
  [
    "Funcionamento da empresa",
    [
      [
        "q05",
        "Em quais dias e horários a empresa funciona?",
        "horarios",
        null,
        true,
      ],
      [
        "q06",
        "Existem atividades antes da abertura ou depois do fechamento?",
        "select",
        opc("Não", "Sim", "Não sei"),
      ],
      [
        "q07",
        "A operação para durante o almoço?",
        "select",
        opc(
          "Para totalmente",
          "Para parcialmente",
          "Funciona continuamente",
          "Varia conforme o dia",
          "Não sei",
        ),
      ],
      ["q08", "Como funciona aos sábados, domingos e feriados?", "textarea"],
      [
        "q09",
        "Existem períodos sazonais ou datas que alteram o funcionamento?",
        "select",
        opc("Não", "Sim", "Não sei"),
      ],
    ],
  ],
  [
    "Necessidade por horário",
    [
      [
        "q10",
        "Quais funções precisam estar presentes para a operação funcionar?",
        "textarea",
        null,
        true,
      ],
      [
        "q11",
        "Qual é o mínimo de pessoas por função, dia e faixa de horário?",
        "cobertura",
        null,
        true,
      ],
      [
        "q12",
        "Quando há maior movimento e quantas pessoas seriam desejáveis nesses períodos?",
        "textarea",
      ],
      [
        "q13",
        "Quais atividades podem ser realizadas em horários diferentes?",
        "textarea",
      ],
      [
        "q14",
        "Quais atividades não podem ficar descobertas, mesmo por poucos minutos?",
        "textarea",
      ],
    ],
  ],
  [
    "Equipe e escala atual",
    [
      [
        "q15",
        "O cadastro e os horários atuais dos colaboradores estão atualizados?",
        "select",
        opc("Sim", "Não", "Parcialmente", "Não sei"),
        true,
      ],
      [
        "q16",
        "Como as folgas são distribuídas atualmente?",
        "multi",
        opc("Fixas", "Rotativas", "Sábado compensado", "Ciclos", "Outro"),
      ],
      [
        "q17",
        "Há colaboradores habilitados para exercer mais de uma função?",
        "select",
        opc("Não", "Sim", "Não sei"),
      ],
      [
        "q18",
        "Existem diferenças entre o horário cadastrado e o praticado?",
        "select",
        opc("Não", "Sim", "Não sei"),
      ],
    ],
  ],
  [
    "Problemas atuais",
    [
      [
        "q19",
        "Em quais dias, horários e funções costuma faltar pessoal?",
        "textarea",
      ],
      [
        "q20",
        "Há horas extras ou convocações na folga?",
        "select",
        opc("Nunca", "Eventualmente", "Frequentemente", "Não sei"),
      ],
      [
        "q21",
        "Como são cobertas férias, afastamentos e faltas inesperadas?",
        "multi",
        opc(
          "Substituição interna",
          "Temporários",
          "Proprietário",
          "Redução do atendimento",
          "Sem cobertura",
          "Outro",
        ),
      ],
      [
        "q22",
        "Há problemas recorrentes com intervalos, domingos ou folgas?",
        "select",
        opc("Não", "Sim", "Não sei"),
      ],
    ],
  ],
  [
    "Condições trabalhistas",
    [
      [
        "q23",
        "Qual atividade e categoria profissional se aplicam à equipe?",
        "textarea",
        null,
        true,
      ],
      [
        "q24",
        "Qual ACT/CCT está sendo utilizado e qual é sua vigência?",
        "instrumento",
        null,
        true,
      ],
      [
        "q25",
        "Quais condições específicas o instrumento prevê?",
        "multi",
        opc(
          "Compensação diária",
          "Sábado compensado",
          "Intervalos",
          "Domingos",
          "Feriados",
          "Trabalho noturno",
          "12×36",
          "Outras condições",
          "Não há",
          "Não sei",
        ),
      ],
      [
        "q26",
        "As cargas contratuais foram conferidas?",
        "select",
        opc("Sim", "Não", "Parcialmente", "Não sei"),
        true,
      ],
    ],
  ],
  [
    "Flexibilidade da proposta",
    [
      [
        "q27",
        "O que a empresa aceita alterar?",
        "multi",
        opc(
          "Entradas e saídas",
          "Distribuição dos intervalos",
          "Dias de folga",
          "Turnos",
          "Funções por período",
          "Horários de funcionamento",
          "Nenhuma alteração",
        ),
        true,
      ],
      [
        "q28",
        "Quais condições são obrigatórias e quais são preferências?",
        "condicoes",
      ],
      [
        "q29",
        "Há restrições individuais que precisam ser respeitadas?",
        "select",
        opc("Não", "Sim", "Não sei"),
      ],
      [
        "q30",
        "Se faltar pessoal, quais alternativas podem ser consideradas?",
        "multi",
        opc(
          "Contratação",
          "Cobertura parcial",
          "Treinamento de substitutos",
          "Reorganização de atividades",
          "Alterar funcionamento",
          "Nenhuma alternativa",
          "Outro",
        ),
      ],
      ["q31", "Existe limite de orçamento para essas alternativas?", "text"],
    ],
  ],
  [
    "Prioridades e validação",
    [
      [
        "q32",
        "Cumpridas as condições legais, qual é a ordem de prioridade?",
        "ordem",
        opc(
          "Cobertura operacional",
          "Previsibilidade das folgas",
          "Preservar horários atuais",
          "Equilíbrio entre colaboradores",
          "Menor necessidade de contratação",
        ),
        true,
      ],
      [
        "q33",
        "Quais resultados indicarão que a readequação funcionou?",
        "textarea",
        null,
        true,
      ],
      [
        "q34",
        "O que ainda precisa ser confirmado antes da proposta final?",
        "textarea",
      ],
    ],
  ],
].map(([titulo, qs]) => ({
  titulo,
  perguntas: qs.map(([id, titulo, tipo, opcoes, obrigatoria = false]) => ({
    id,
    titulo,
    tipo,
    opcoes,
    obrigatoria,
  })),
}));
export const PERGUNTAS_DIAGNOSTICO = ETAPAS_DIAGNOSTICO.flatMap(
  (e) => e.perguntas,
);
export const CERTEZAS = {
  confirmada: "Confirmada",
  estimativa: "Estimativa",
  pendente: "Pendente de conferência",
};
export function visivel(q, answers) {
  if (q.id !== "q31") return true;
  return (answers.q30?.value || []).some((v) =>
    ["Contratação", "Cobertura parcial", "Treinamento de substitutos"].includes(
      v,
    ),
  );
}
export function respondida(a) {
  return (
    !!a &&
    (a.certainty === "pendente" ||
      (typeof a.value === "string"
        ? !!a.value.trim()
        : Array.isArray(a.value)
          ? a.value.length > 0
          : a.value && Object.values(a.value).some(Boolean)))
  );
}
const hora = (v) =>
  typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const data = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v + "T12:00:00Z")) &&
  new Date(v + "T12:00:00Z").toISOString().slice(0, 10) === v;
export function validarDiagnostico(payload, status = "rascunho") {
  if (
    !payload ||
    Object.keys(payload).some(
      (k) => !["schemaVersion", "answers"].includes(k),
    ) ||
    payload.schemaVersion !== VERSAO_DIAGNOSTICO ||
    !payload.answers ||
    Array.isArray(payload.answers) ||
    typeof payload.answers !== "object" ||
    !["rascunho", "concluido"].includes(status)
  )
    throw Error("Diagnóstico em formato inválido.");
  if (JSON.stringify(payload).length > 150000)
    throw Error("Diagnóstico excede o limite de tamanho.");
  const answerKeys = Object.keys(payload.answers);
  if (answerKeys.some((k) => !PERGUNTAS_DIAGNOSTICO.some((q) => q.id === k)))
    throw Error("Pergunta desconhecida no diagnóstico.");
  const erros = [];
  for (const q of PERGUNTAS_DIAGNOSTICO) {
    const a = payload.answers[q.id];
    if (!a) continue;
    const falha = () =>
      erros.push({
        questionId: q.id,
        message: `${q.titulo} Confira o preenchimento.`,
      });
    if (
      typeof a !== "object" ||
      Array.isArray(a) ||
      !Object.hasOwn(CERTEZAS, a.certainty) ||
      typeof a.note !== "string" ||
      a.note.length > 4000 ||
      Object.keys(a).some((k) => !["value", "certainty", "note"].includes(k))
    ) {
      falha();
      continue;
    }
    const v = a.value;
    if (["text", "textarea", "date", "select"].includes(q.tipo)) {
      if (
        typeof v !== "string" ||
        v.length > (q.tipo === "text" ? 300 : 4000)
      ) {
        falha();
        continue;
      }
      if (q.tipo === "date" && v && !data(v)) falha();
      if (q.tipo === "select" && v && !q.opcoes.includes(v)) falha();
    } else if (["multi", "ordem"].includes(q.tipo)) {
      if (
        !Array.isArray(v) ||
        new Set(v).size !== v.length ||
        v.some((x) => !q.opcoes.includes(x)) ||
        (q.tipo === "ordem" && v.length && v.length !== q.opcoes.length)
      )
        falha();
      else if (
        v.length > 1 &&
        v.some((x) =>
          [
            "Nenhuma alteração",
            "Nenhuma alternativa",
            "Não há",
            "Não sei",
          ].includes(x),
        )
      )
        falha();
    } else if (q.tipo === "instrumento") {
      if (
        !v ||
        typeof v !== "object" ||
        Array.isArray(v) ||
        Object.keys(v).some(
          (k) =>
            !["nome", "inicio", "fim", "url", "semInstrumento"].includes(k),
        ) ||
        ["nome", "inicio", "fim", "url"].some(
          (k) => typeof v[k] !== "string" || v[k].length > 500,
        ) ||
        (v.semInstrumento !== undefined &&
          typeof v.semInstrumento !== "boolean")
      ) {
        falha();
        continue;
      }
      if (
        (v.inicio && !data(v.inicio)) ||
        (v.fim && !data(v.fim)) ||
        (v.inicio && v.fim && v.inicio > v.fim)
      )
        falha();
      if (v.url) {
        try {
          const u = new URL(v.url);
          if (
            !["http:", "https:"].includes(u.protocol) ||
            u.username ||
            u.password
          )
            falha();
        } catch {
          falha();
        }
      }
    } else {
      if (!Array.isArray(v) || v.length > 100) {
        falha();
        continue;
      }
      for (const r of v) {
        if (!r || typeof r !== "object" || Array.isArray(r)) {
          falha();
          continue;
        }
        const completo = status === "concluido" && a.certainty !== "pendente";
        if (!completo) {
          const keys =
            q.tipo === "horarios"
              ? ["dia", "inicio", "fim"]
              : q.tipo === "cobertura"
                ? ["funcao", "minimo", "diasSemana", "inicio", "fim"]
                : ["descricao", "natureza"];
          if (
            Object.keys(r).some((k) => !keys.includes(k)) ||
            Object.values(r).some(
              (x) => typeof x === "string" && x.length > 1000,
            )
          )
            falha();
          if (
            q.tipo === "horarios" &&
            (!Number.isInteger(r.dia) ||
              r.dia < 0 ||
              r.dia > 6 ||
              typeof r.inicio !== "string" ||
              typeof r.fim !== "string")
          )
            falha();
          if (
            q.tipo === "cobertura" &&
            (typeof r.funcao !== "string" ||
              typeof r.inicio !== "string" ||
              typeof r.fim !== "string" ||
              !(
                r.minimo === null ||
                (Number.isInteger(r.minimo) && r.minimo >= 1 && r.minimo <= 999)
              ) ||
              !Array.isArray(r.diasSemana) ||
              r.diasSemana.some((d) => !Number.isInteger(d) || d < 0 || d > 6))
          )
            falha();
          if (
            q.tipo === "condicoes" &&
            (typeof r.descricao !== "string" ||
              !["obrigatoria", "preferencia"].includes(r.natureza))
          )
            falha();
          continue;
        }
        if (q.tipo === "horarios") {
          if (
            Object.keys(r).some((k) => !["dia", "inicio", "fim"].includes(k)) ||
            !Number.isInteger(r.dia) ||
            r.dia < 0 ||
            r.dia > 6 ||
            !hora(r.inicio) ||
            !hora(r.fim)
          )
            falha();
        } else if (q.tipo === "cobertura") {
          if (
            Object.keys(r).some(
              (k) =>
                !["funcao", "minimo", "diasSemana", "inicio", "fim"].includes(
                  k,
                ),
            ) ||
            typeof r.funcao !== "string" ||
            !r.funcao.trim() ||
            r.funcao.length > 160 ||
            !Number.isInteger(r.minimo) ||
            r.minimo < 1 ||
            r.minimo > 999 ||
            !Array.isArray(r.diasSemana) ||
            !r.diasSemana.length ||
            new Set(r.diasSemana).size !== r.diasSemana.length ||
            r.diasSemana.some((d) => !Number.isInteger(d) || d < 0 || d > 6) ||
            !hora(r.inicio) ||
            !hora(r.fim)
          )
            falha();
        } else if (
          Object.keys(r).some((k) => !["descricao", "natureza"].includes(k)) ||
          typeof r.descricao !== "string" ||
          !r.descricao.trim() ||
          r.descricao.length > 1000 ||
          !["obrigatoria", "preferencia"].includes(r.natureza)
        )
          falha();
      }
      if (
        q.tipo === "horarios" &&
        new Set(v.map((r) => r?.dia)).size !== v.length
      )
        falha();
    }
  }
  // Rascunhos admitem linhas incompletas; limites de estrutura/tipos continuam
  // verificados no servidor antes de persistir. Conclusão exige conferir as linhas.
  if (erros.length)
    throw Object.assign(Error(erros[0].message), {
      questionId: erros[0].questionId,
    });
  if (status === "concluido") {
    const faltam = PERGUNTAS_DIAGNOSTICO.filter(
      (q) =>
        q.obrigatoria &&
        visivel(q, payload.answers) &&
        !respondida(payload.answers[q.id]),
    );
    if (faltam.length)
      throw Object.assign(
        Error(
          `Antes de concluir, responda ou marque como pendente: ${faltam[0].titulo}`,
        ),
        { questionId: faltam[0].id },
      );
    const i = payload.answers.q24;
    if (
      i?.certainty !== "pendente" &&
      !i?.value?.semInstrumento &&
      (!i?.value?.nome || !i.value.inicio || !i.value.fim)
    )
      throw Object.assign(
        Error(
          "Informe a identificação e a vigência do ACT/CCT ou marque como pendente de conferência.",
        ),
        { questionId: "q24" },
      );
  }
  return payload;
}
export function resumoDiagnostico(payload) {
  const answers = payload.answers || {},
    visiveis = PERGUNTAS_DIAGNOSTICO.filter((q) => visivel(q, answers));
  return {
    respondidas: visiveis.filter((q) => respondida(answers[q.id])).length,
    total: visiveis.length,
    pendencias: visiveis.filter(
      (q) =>
        answers[q.id]?.certainty === "pendente" ||
        (q.obrigatoria && !respondida(answers[q.id])),
    ),
    estimativas: visiveis.filter(
      (q) => answers[q.id]?.certainty === "estimativa",
    ),
  };
}
