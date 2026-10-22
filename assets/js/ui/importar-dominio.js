import { mostrarColaboradores } from "./lista-colaboradores.js";
import {
  lerArquivoDominio,
  MAX_DOMINIO_BYTES,
} from "../import/arquivo-dominio.js";
import { analisarQuadroDominio, prepararDominio } from "../import/dominio.js";
import { escapeHtml as esc } from "../shared/formatacao.js";
export function createImportarDominioUI({
  state,
  storage,
  env,
  invalidarEscala,
  atualizarInterface,
}) {
  const el = (id) => env.document.getElementById(`dominio-${id}`);
  let quadro = null,
    token = 0;
  const mensagem = (t) => (el("mensagem").textContent = t);
  function limpar() {
    token++;
    quadro = null;
    el("arquivo").value = "";
    el("previa").hidden = true;
    el("confirmar").disabled = true;
  }
  function empresaHtml(e) {
    return `<b>${esc(e.nome)}</b><br>Código: ${esc(e.codigo)} · CNPJ: ${esc(e.cnpj || "Não informado")}<br>Empregador: ${esc(e.empregador)}<br>Endereço: ${esc(e.endereco || "Não informado")}<br>Página(s) indicadas: ${esc(e.paginas.join(", "))}<br>${esc(e.licenciadoPara)}`;
  }
  function renderEmpresa() {
    el("empresa-atual").innerHTML = state.empresaDominio
      ? `<p class="font-semibold mb-1">Empresa do quadro importado</p>${empresaHtml(state.empresaDominio)}`
      : "";
  }
  function previa() {
    if (!quadro) return;
    const snapshot = prepararDominio(
      { ...state, colaboradores: [], proximoId: 1, empresaDominio: null },
      quadro,
      "substituir",
      el("ausentes-folga").checked,
    );
    const novos = snapshot.colaboradores;
    const estimados = novos.filter((c) => c.sexoInferencia).length;
    el("empresa").innerHTML = empresaHtml(quadro.empresa);
    el("linhas").innerHTML = novos
      .map(
        (c) =>
          `<tr>${[c.quadroDominio.codigo, c.nome, c.cargo, c.sexoInferencia ? `${c.sexo} — ${(c.sexoInferencia.predominancia * 100).toFixed(2).replace(".", ",")}% na base (estimado pelo nome)` : "Não informado", c.quadroDominio.admissao, c.quadroDominio.ctps, c.quadroDominio.serie, c.quadroDominio.tipo === "ciclo" ? `Ciclo de ${Object.keys(c.quadroDominio.ciclo).length} dias` : c.quadroDominio.modelo, c.horasSemana == null ? "Não calculável" : `${c.horasSemana}h (calculadas)`, c.quadroDominio.pendencias.join(" ")].map((v) => `<td class="p-2 border-b align-top">${esc(v)}</td>`).join("")}</tr>`,
      )
      .join("");
    el("resumo").textContent =
      `${novos.length} colaboradores. ${estimados} campo(s) de sexo serão preenchidos automaticamente por predominância de pelo menos 99,5% na base de nomes. ${el("modo").value === "substituir" ? "Os colaboradores atuais serão substituídos; as demais configurações serão mantidas, e os dias operacionais serão preenchidos pela união dos horários importados." : "Os colaboradores serão adicionados e os dias operacionais serão ampliados pela união dos horários."} Horários individuais, folgas, ciclos, admissão, código, CTPS e série serão preservados. A cobertura mínima da empresa não consta no relatório e não será inventada. Escalas e comparações anteriores precisarão ser geradas novamente.`;
    if (
      state.empresaDominio?.cnpj &&
      state.empresaDominio.cnpj !== quadro.empresa.cnpj
    )
      el("resumo").textContent =
        "Você está mudando de empresa. Use Substituir. Os colaboradores serão substituídos e cobertura, instrumento coletivo e feriados locais da empresa anterior serão reiniciados. Nenhuma demanda mínima será presumida. Revise as pendências individuais antes de gerar a escala.";
  }
  return {
    renderEmpresa,
    bindEvents() {
      el("arquivo").onchange = async () => {
        const file = el("arquivo").files?.[0],
          atual = ++token;
        quadro = null;
        el("previa").hidden = true;
        el("confirmar").disabled = true;
        el("ausentes-folga").checked = false;
        if (!file) return;
        if (!/\.xlsx?$/i.test(file.name)) {
          mensagem(
            "Selecione um arquivo .xls ou .xlsx exportado do Quadro de Horário de Trabalho da Domínio.",
          );
          return;
        }
        if (file.size > MAX_DOMINIO_BYTES) {
          mensagem("O arquivo excede 5 MB.");
          return;
        }
        mensagem("Lendo o quadro e validando os horários…");
        try {
          const abas = await lerArquivoDominio(await file.arrayBuffer());
          if (atual !== token) return;
          quadro = analisarQuadroDominio(abas, file.name);
          previa();
          el("previa").hidden = false;
          el("confirmar").disabled = false;
          mensagem(
            "Confira a empresa, as pessoas e as pendências. A importação preserva dados incompletos para correção na lista de colaboradores cadastrados/importados; eles não serão substituídos por horários presumidos.",
          );
        } catch (error) {
          if (atual === token)
            mensagem(`Não foi possível importar: ${error.message}`);
        }
      };
      el("modo").onchange = previa;
      el("ausentes-folga").onchange = previa;
      el("cancelar").onclick = () => {
        limpar();
        mensagem("Importação cancelada. Nenhum dado alterado.");
      };
      el("confirmar").onclick = () => {
        if (!quadro) return;
        try {
          const next = prepararDominio(
            state,
            quadro,
            el("modo").value,
            el("ausentes-folga").checked,
          );
          Object.assign(state, next);
          invalidarEscala();
          atualizarInterface();
          renderEmpresa();
          const salvo = storage.saveState();
          limpar();
          mensagem(
            salvo === false
              ? "Importação aplicada nesta aba, mas não foi possível salvar no navegador. Exporte os dados antes de sair."
              : "Quadro importado. Confira na lista de colaboradores cadastrados/importados carga contratual, sexo, dias não informados e datas de início dos ciclos. Os horários individuais serão usados na geração e na cobertura.",
          );
          mostrarColaboradores(env.document, el("mensagem").textContent);
        } catch (error) {
          mensagem(error.message);
        }
      };
    },
  };
}
