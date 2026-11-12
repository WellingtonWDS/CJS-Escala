import { escapeHtml as h } from "../shared/formatacao.js";
import { DIAS_SEMANA } from "../config/regras-jornada.js";
import { CERTEZAS, respondida } from "../diagnostico/questionario.js";
const selected = (a, b) => (a === b ? " selected" : "");
const checked = (v) => (v ? " checked" : "");
const input = (id, value, type = "text", extra = "") =>
  `<input id="${id}" type="${type}" value="${h(value ?? "")}" ${extra}>`;
function dias(qid, row, value) {
  return `<fieldset class="diag-dias"><legend>Dias da semana</legend>${[1, 2, 3, 4, 5, 6, 0].map((d) => `<label><input type="checkbox" data-row="${row}" data-key="diasSemana" value="${d}"${checked(value?.includes(d))}>${DIAS_SEMANA[d]}</label>`).join("")}</fieldset>`;
}
export function renderPergunta(q, a = {}) {
  const v = a.value,
    id = "diag-" + q.id;
  let field = "";
  if (["text", "date"].includes(q.tipo))
    field = input(
      id,
      v,
      q.tipo,
      `data-value maxlength="300" aria-labelledby="${id}-titulo"`,
    );
  else if (q.tipo === "textarea")
    field = `<textarea id="${id}" rows="3" maxlength="4000" data-value aria-labelledby="${id}-titulo">${h(v || "")}</textarea>`;
  else if (q.tipo === "select")
    field = `<select id="${id}" data-value aria-labelledby="${id}-titulo"><option value="">Selecione</option>${q.opcoes.map((o) => `<option${selected(o, v)}>${h(o)}</option>`).join("")}</select>`;
  else if (q.tipo === "multi")
    field = `<div class="diag-opcoes">${q.opcoes.map((o, i) => `<label><input id="${id}-${i}" type="checkbox" data-choice value="${h(o)}"${checked(v?.includes(o))}>${h(o)}</label>`).join("")}</div>`;
  else if (q.tipo === "ordem")
    field = `<p class="diag-ajuda">Use as setas para ordenar. A legislação e as condições obrigatórias sempre têm precedência.</p><ol class="diag-ordem">${(v?.length ? v : q.opcoes).map((o, i) => `<li><span>${i + 1}. ${h(o)}</span><button type="button" data-order="${i}" data-direction="-1" aria-label="Subir ${h(o)}"${i === 0 ? " disabled" : ""}>↑</button><button type="button" data-order="${i}" data-direction="1" aria-label="Descer ${h(o)}"${i === q.opcoes.length - 1 ? " disabled" : ""}>↓</button></li>`).join("")}</ol>${!v?.length ? '<button type="button" data-confirm-order>Confirmar esta ordem</button>' : ""}`;
  else if (q.tipo === "instrumento")
    field = `<label class="diag-opcao"><input type="checkbox" data-instrument="semInstrumento"${checked(v?.semInstrumento)}>Não há ACT/CCT utilizado nesta análise</label><div${v?.semInstrumento ? " hidden" : ""} class="diag-grid">${[
      ["nome", "Identificação", "text"],
      ["inicio", "Início da vigência", "date"],
      ["fim", "Fim da vigência", "date"],
      ["url", "Link do documento ou referência (opcional)", "url"],
    ]
      .map(
        ([key, label, type]) =>
          `<label for="${id}-${key}">${label}${input(id + "-" + key, v?.[key], type, `data-instrument="${key}" maxlength="500"`)}</label>`,
      )
      .join(
        "",
      )}</div><p class="diag-ajuda">Se ainda não souber, marque como pendente e indique nas observações o que o escritório precisa conferir.</p>`;
  else if (q.tipo === "horarios")
    field = `<p class="diag-ajuda">Marque apenas os dias de funcionamento. Saída anterior à entrada indica término no dia seguinte; horários iguais indicam funcionamento de 24h.</p><div class="diag-horarios">${[
      1, 2, 3, 4, 5, 6, 0,
    ]
      .map((d) => {
        const row = v?.find((r) => r.dia === d);
        return `<div><label><input id="${id}-${d}" type="checkbox" data-open-day="${d}"${checked(row)}>${DIAS_SEMANA[d]}</label>${row ? `<label>Abre${input(id + "-" + d + "-inicio", row.inicio, "time", `data-day="${d}" data-key="inicio"`)}</label><label>Fecha${input(id + "-" + d + "-fim", row.fim, "time", `data-day="${d}" data-key="fim"`)}</label>` : "<span>Fechada</span>"}</div>`;
      })
      .join("")}</div>`;
  else
    field = `<div class="diag-linhas">${(v || []).map((r, i) => `<fieldset class="diag-linha"><legend>${q.tipo === "cobertura" ? "Necessidade" : "Condição"} ${i + 1}</legend>${q.tipo === "cobertura" ? `<div class="diag-grid"><label>Função${input(id + "-" + i + "-funcao", r.funcao, "text", `data-row="${i}" data-key="funcao" maxlength="160"`)}</label><label>Mínimo de pessoas${input(id + "-" + i + "-minimo", r.minimo, "number", `data-row="${i}" data-key="minimo" min="1" max="999" step="1"`)}</label><label>Das${input(id + "-" + i + "-inicio", r.inicio, "time", `data-row="${i}" data-key="inicio"`)}</label><label>Até${input(id + "-" + i + "-fim", r.fim, "time", `data-row="${i}" data-key="fim"`)}</label></div>${dias(q.id, i, r.diasSemana)}` : `<label>Descrição${input(id + "-" + i + "-descricao", r.descricao, "text", `data-row="${i}" data-key="descricao" maxlength="1000"`)}</label><label>Natureza<select data-row="${i}" data-key="natureza"><option value="obrigatoria"${selected(r.natureza, "obrigatoria")}>Obrigatória</option><option value="preferencia"${selected(r.natureza, "preferencia")}>Preferência</option></select></label>`}<button type="button" data-remove-row="${i}">Remover ${q.tipo === "cobertura" ? "faixa" : "condição"} ${i + 1}</button></fieldset>`).join("")}</div><button type="button" data-add-row>Adicionar ${q.tipo === "cobertura" ? "faixa" : "condição"}</button>`;
  const detalhe =
    (["q06", "q09", "q17", "q18", "q22", "q29"].includes(q.id) &&
      v === "Sim") ||
    (q.id === "q20" && ["Eventualmente", "Frequentemente"].includes(v)) ||
    (q.id === "q07" &&
      ["Para parcialmente", "Varia conforme o dia"].includes(v));
  if (q.tipo === "cobertura")
    field =
      `<p class="diag-ajuda">Horários iguais representam uma necessidade contínua de 24h. Intervalos e substituições serão analisados na elaboração da escala.</p>` +
      field;
  return `<fieldset class="diag-pergunta" data-question="${q.id}" tabindex="-1"><legend id="${id}-titulo">${Number(q.id.slice(1))}. ${h(q.titulo)}${q.obrigatoria ? '<span class="diag-essencial">Essencial</span>' : ""}</legend>${field}<div class="diag-confianca"><label for="${id}-certainty">Situação da informação<select id="${id}-certainty" data-certainty>${Object.entries(
    CERTEZAS,
  )
    .map(
      ([k, n]) =>
        `<option value="${k}"${selected(k, a.certainty || "confirmada")}>${n}</option>`,
    )
    .join(
      "",
    )}</select></label><span data-answer-state>${respondida(a) ? "Registrada" : "Ainda não respondida"}</span></div><details${detalhe ? " open" : ""}><summary>${detalhe ? "Detalhe a situação" : "Observações (opcional)"}</summary><textarea id="${id}-note" data-note rows="2" maxlength="4000" aria-label="Observações da pergunta ${Number(q.id.slice(1))}" placeholder="Informações complementares ou o que precisa ser confirmado">${h(a.note || "")}</textarea></details>${q.id === "q29" ? '<p class="diag-ajuda">Não registre diagnósticos de saúde ou detalhes pessoais. Informe apenas as restrições de disponibilidade necessárias.</p>' : ""}</fieldset>`;
}
export function textoResposta(q, a) {
  if (!a) return "Não respondida";
  const v = a.value;
  if (q.tipo === "horarios")
    return (
      v
        .map(
          (r) =>
            `${DIAS_SEMANA[r.dia]}: ${r.inicio || "—"}–${r.fim || "—"}${r.inicio && r.inicio === r.fim ? " (24h)" : ""}`,
        )
        .join("; ") || "Sem horários informados"
    );
  if (q.tipo === "cobertura")
    return (
      v
        .map(
          (r) =>
            `${r.funcao || "Função pendente"}: ${r.minimo ?? "—"} pessoa(s), ${(r.diasSemana || []).map((d) => DIAS_SEMANA[d]).join(", ")}, ${r.inicio || "—"}–${r.fim || "—"}${r.inicio && r.inicio === r.fim ? " (24h)" : ""}`,
        )
        .join("; ") || "Sem faixas informadas"
    );
  if (q.tipo === "condicoes")
    return (
      v
        .map(
          (r) =>
            `${r.descricao || "—"} (${r.natureza === "obrigatoria" ? "obrigatória" : "preferência"})`,
        )
        .join("; ") || "Nenhuma condição registrada"
    );
  if (q.tipo === "instrumento")
    return v.semInstrumento
      ? "Sem ACT/CCT utilizado nesta análise"
      : [
          v.nome,
          v.inicio && `Início: ${v.inicio}`,
          v.fim && `Fim: ${v.fim}`,
          v.url,
        ]
          .filter(Boolean)
          .join(" · ") || "Instrumento pendente";
  return Array.isArray(v)
    ? v.join(q.tipo === "ordem" ? " → " : ", ")
    : v || "Não informada";
}
