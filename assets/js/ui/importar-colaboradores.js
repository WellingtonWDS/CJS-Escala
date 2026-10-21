import {
  analisarPlanilhaColaboradores,
  decodificarPlanilha,
  gerarModeloColaboradores,
  MAX_ARQUIVO_BYTES,
  prepararImportacao,
} from "../import/colaboradores.js";
import { escapeHtml } from "../shared/formatacao.js";

export function createImportarColaboradoresUI({
  state,
  storage,
  env,
  invalidarEscala,
  renderColaboradores,
  renderResumo,
}) {
  const { document } = env;
  let pendentes = [],
    leitura = 0;
  const el = (id) => document.getElementById(id);
  function mensagem(text) {
    el("importacao-mensagem").textContent = text;
  }
  function limpar() {
    leitura++;
    pendentes = [];
    el("importacao-arquivo").value = "";
    el("importacao-previa").hidden = true;
    el("importacao-erros").innerHTML = "";
    el("importacao-confirmar").disabled = true;
  }
  function atualizarPrevia() {
    const substituir = el("importacao-modo").value === "substituir";
    const total =
      (substituir ? 0 : state.colaboradores.length) + pendentes.length;
    el("importacao-resumo").textContent =
      `${pendentes.length} colaborador(es) no arquivo. O cadastro ficará com ${total} pessoa(s). ${substituir ? "Os colaboradores atuais serão removidos, incluindo seus dados individuais. As demais configurações e demandas de cobertura serão mantidas; revise as funções após importar." : "Os colaboradores atuais e seus dados serão preservados. Nomes repetidos serão adicionados como pessoas distintas; não há atualização automática por nome."} A escala anterior precisará ser gerada novamente.`;
  }
  async function lerArquivo() {
    const file = el("importacao-arquivo").files?.[0];
    const token = ++leitura;
    pendentes = [];
    el("importacao-previa").hidden = true;
    el("importacao-erros").innerHTML = "";
    el("importacao-confirmar").disabled = true;
    if (!file) {
      mensagem("");
      return;
    }
    if (!/\.csv$/i.test(file.name)) {
      mensagem(
        "Selecione um arquivo .csv. No Excel ou LibreOffice, use Salvar como CSV, preferencialmente UTF-8.",
      );
      return;
    }
    if (file.size > MAX_ARQUIVO_BYTES) {
      mensagem("O arquivo excede o limite de 1 MB.");
      return;
    }
    mensagem("Lendo e validando a planilha…");
    try {
      const texto = decodificarPlanilha(await file.arrayBuffer());
      if (token !== leitura) return;
      const { colaboradores, erros } = analisarPlanilhaColaboradores(texto);
      if (erros.length) {
        mensagem(
          `Encontrado(s) ${erros.length} erro(s). Corrija a planilha e selecione o arquivo novamente. Nenhum cadastro foi alterado.`,
        );
        el("importacao-erros").innerHTML =
          erros
            .slice(0, 30)
            .map((erro) => `<li>${escapeHtml(erro)}</li>`)
            .join("") +
          (erros.length > 30 ? "<li>Exibindo os primeiros 30 erros.</li>" : "");
        return;
      }
      pendentes = colaboradores;
      el("importacao-linhas").innerHTML = colaboradores
        .slice(0, 20)
        .map(
          (c) =>
            `<tr><td class="p-2 border-b">${escapeHtml(c.nome)}</td><td class="p-2 border-b">${escapeHtml(c.sexo)}</td><td class="p-2 border-b">${escapeHtml(c.cargo)}</td><td class="p-2 border-b">${c.horasSemana}</td></tr>`,
        )
        .join("");
      atualizarPrevia();
      el("importacao-previa").hidden = false;
      el("importacao-confirmar").disabled = false;
      mensagem(
        "Arquivo válido. Confira a prévia (até 20 pessoas) e o modo de importação antes de confirmar.",
      );
    } catch {
      if (token === leitura)
        mensagem(
          "Não foi possível ler o arquivo. Salve novamente como CSV e tente outra vez. Nenhum cadastro foi alterado.",
        );
    }
  }
  function confirmar() {
    try {
      const next = prepararImportacao(
        state,
        pendentes,
        el("importacao-modo").value,
      );
      const count = pendentes.length;
      Object.assign(state, next);
      invalidarEscala();
      renderColaboradores();
      renderResumo();
      storage.saveState();
      limpar();
      mensagem(
        `${count} colaborador(es) importado(s). Confira o cadastro, revise a cobertura e clique em Gerar escala.`,
      );
    } catch (error) {
      mensagem(error.message);
    }
  }
  return {
    bindEvents() {
      el("btn-modelo-colaboradores").onclick = () => {
        const blob = new env.Blob([gerarModeloColaboradores()], {
          type: "text/csv;charset=utf-8;",
        });
        const url = env.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "modelo-colaboradores.csv";
        link.click();
        env.setTimeout(() => env.URL.revokeObjectURL(url), 1000);
      };
      el("importacao-arquivo").onchange = lerArquivo;
      el("importacao-modo").onchange = atualizarPrevia;
      el("importacao-confirmar").onclick = confirmar;
      el("importacao-cancelar").onclick = () => {
        limpar();
        mensagem("Importação cancelada. O cadastro foi preservado.");
      };
    },
  };
}
