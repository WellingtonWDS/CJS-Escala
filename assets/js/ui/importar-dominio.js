import { mostrarColaboradores } from "./lista-colaboradores.js";
import {
  lerArquivoDominio,
  MAX_DOMINIO_BYTES,
} from "../import/arquivo-dominio.js";
import { analisarQuadroDominio, prepararDominio } from "../import/dominio.js";
import { carregarBaseNomes } from "../domain/sexo-por-nome.js";
import { escapeHtml as esc } from "../shared/formatacao.js";
import { validCnpj, formatCnpj } from "../shared/empresas.js";
import { analisarHorarioSCI, MAX_SCI_BYTES } from "../import/sci.js";

/** Fontes de importação de horários. A Domínio traz o CNPJ no relatório; a SCI
 * (PDF) não traz, e o CNPJ é informado pelo usuário antes de confirmar. */
const FONTES = {
  dominio: {
    nome: "Domínio",
    aceitar: /\.xlsx?$/i,
    tamanho: MAX_DOMINIO_BYTES,
    formato: "Selecione um arquivo .xls ou .xlsx exportado do Quadro de Horário de Trabalho da Domínio.",
    lendo: "Lendo e validando a planilha Domínio",
    async ler(file) { return analisarQuadroDominio(await lerArquivoDominio(await file.arrayBuffer()), file.name); },
  },
  sci: {
    nome: "SCI",
    aceitar: /\.pdf$/i,
    tamanho: MAX_SCI_BYTES,
    formato: "Selecione o relatório Horário de Trabalho da SCI em PDF.",
    lendo: "Lendo e validando o PDF da SCI",
    exigeCnpj: true,
    async ler(file) {
      const { lerPdfSCI } = await import("../import/arquivo-sci.js");
      return analisarHorarioSCI(await lerPdfSCI(await file.arrayBuffer()), file.name);
    },
  },
};
export function createImportarDominioUI({
  state,
  storage,
  env,
  invalidarEscala,
  atualizarInterface,
  fonte = "dominio",
}) {
  const origem = FONTES[fonte];
  const el = (id) => env.document.getElementById(`${fonte}-${id}`);
  const cnpjInformado = () => origem.exigeCnpj ? el("cnpj").value : null;
  const cnpjValido = () => !origem.exigeCnpj || validCnpj(cnpjInformado());
  const liberarConfirmacao = () => (el("confirmar").disabled = !quadro || !cnpjValido());
  let quadro = null,
    token = 0;
  const mensagem = (t) => (el("mensagem").textContent = t);
  function limpar() {
    token++;
    quadro = null;
    el("arquivo").value = "";
    el("arquivo").removeAttribute("aria-busy");
    el("previa").hidden = true;
    el("confirmar").disabled = true;
    if (origem.exigeCnpj) { el("cnpj").value = ""; el("cnpj-erro").textContent = ""; }
  }
  function empresaHtml(e) {
    if (e.sistema === "SCI")
      return `<b>${esc(e.nome)}</b><br>Origem: relatório Horário de Trabalho da SCI · CNPJ: ${esc(e.cnpj ? formatCnpj(e.cnpj) : "a informar")}<br>Endereço: ${esc(e.endereco || "Não informado")}<br>Atividade: ${esc(e.atividade || "Não informada")}<br>Página(s): ${esc(e.paginas.join(", ") || "1")}${e.licenciadoPara ? `<br>Emitido por: ${esc(e.licenciadoPara)}` : ""}`;
    return `<b>${esc(e.nome)}</b><br>Código: ${esc(e.codigo)} · CNPJ: ${esc(e.cnpj || "Não informado")}<br>Empregador: ${esc(e.empregador)}<br>Endereço: ${esc(e.endereco || "Não informado")}<br>Página(s) indicadas: ${esc(e.paginas.join(", "))}<br>${esc(e.licenciadoPara)}`;
  }
  function renderEmpresa() {
    if (!el("empresa-atual")) return;
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
      `${novos.length} colaboradores. ${estimados} campo(s) de sexo serão preenchidos automaticamente por predominância de pelo menos 99% na base de nomes. ${el("modo").value === "substituir" ? "Os colaboradores atuais serão substituídos; as demais configurações serão mantidas, e os dias operacionais serão preenchidos pela união dos horários importados." : "Os colaboradores serão adicionados e os dias operacionais serão ampliados pela união dos horários."} Horários individuais, folgas, ciclos, admissão, código, CTPS e série serão preservados. A cobertura mínima da empresa não consta no relatório e não será inventada. Escalas e comparações anteriores precisarão ser geradas novamente.`;
    if (
      state.empresaDominio?.cnpj &&
      state.empresaDominio.cnpj !== quadro.empresa.cnpj
    )
      el("resumo").textContent =
        "Você está mudando de empresa. Use Substituir. Os colaboradores serão substituídos e cobertura, instrumento coletivo e feriados locais da empresa anterior serão reiniciados. Nenhuma demanda mínima será presumida. Revise as pendências individuais antes de gerar a escala.";
  }
  return {
    resetContext() { limpar(); mensagem(""); for(const id of ["empresa","linhas","resumo"])el(id).innerHTML=""; },
    renderEmpresa,
    bindEvents() {
      el("arquivo").onchange = async () => {
        const file = el("arquivo").files?.[0],
          atual = ++token;
        quadro = null;
        el("arquivo").removeAttribute("aria-busy");
        el("previa").hidden = true;
        el("confirmar").disabled = true;
        if (!file) return;
        if (!origem.aceitar.test(file.name)) {
          mensagem(origem.formato);
          return;
        }
        if (file.size > origem.tamanho) {
          mensagem("O arquivo excede 5 MB.");
          return;
        }
        mensagem("Lendo o quadro e validando os horários…");
        el("arquivo").dataset.loadingLabel = origem.lendo;
        el("arquivo").setAttribute("aria-busy", "true");
        try {
          // A base de nomes é baixada junto com a leitura, para a sugestão de sexo.
          const [lido] = await Promise.all([origem.ler(file), carregarBaseNomes()]);
          if (atual !== token) return;
          quadro = lido;
          previa();
          el("previa").hidden = false;
          liberarConfirmacao();
          mensagem(
            "Confira a empresa, as pessoas e as pendências. A importação preserva dados incompletos para correção na lista de colaboradores cadastrados/importados; eles não serão substituídos por horários presumidos.",
          );
        } catch (error) {
          if (atual === token)
            mensagem(`Não foi possível importar: ${error.message}`);
        } finally {
          if (atual === token) el("arquivo").removeAttribute("aria-busy");
        }
      };
      el("modo").onchange = previa;
      if (origem.exigeCnpj)
        el("cnpj").oninput = () => {
          const valor = el("cnpj").value;
          el("cnpj-erro").textContent = valor && !validCnpj(valor) ? "CNPJ inválido. Confira os 14 dígitos." : "";
          if (quadro) { quadro.empresa.cnpj = validCnpj(valor) ? formatCnpj(valor) : ""; previa(); }
          liberarConfirmacao();
        };
      el("cancelar").onclick = () => {
        limpar();
        mensagem("Importação cancelada. Nenhum dado alterado.");
      };
      el("confirmar").onclick = async () => {
        if (!quadro) return;
        if (!cnpjValido()) {
          mensagem("Informe o CNPJ da empresa: o relatório da SCI não traz essa informação.");
          el("cnpj").focus();
          return;
        }
        el("confirmar").disabled = true;
        try {
          const resolution = env.resolveDominioImport
            ? await env.resolveDominioImport(quadro)
            : undefined;
          if (resolution === null) {
            mensagem(
              "Importação cancelada. O preenchimento atual foi preservado.",
            );
            return;
          }
          const base = resolution?.base ?? state;
          const next = {
            ...base,
            ...prepararDominio(base, quadro, el("modo").value),
          };
          resolution?.commit(next);
          Object.assign(state, next);
          invalidarEscala();
          atualizarInterface();
          renderEmpresa();
          const salvo = storage.saveState();
          limpar();
          mensagem(
            salvo === false
              ? "Importação aplicada nesta aba, mas não foi possível salvar no navegador. Exporte os dados antes de sair."
              : "Quadro importado. Confira na lista de colaboradores cadastrados/importados sexo, dias não informados e datas de início dos ciclos. Os horários individuais serão usados na geração e na cobertura." +
                  (resolution
                    ? " A empresa está vinculada; salve o rascunho para enviar os colaboradores ao servidor."
                    : ""),
          );
          mostrarColaboradores(env.document, el("mensagem").textContent);
        } catch (error) {
          mensagem(error.message);
        } finally {
          if (quadro) liberarConfirmacao();
        }
      };
    },
  };
}
