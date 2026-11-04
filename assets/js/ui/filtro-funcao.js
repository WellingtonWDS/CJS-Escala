import { normalizarFuncao, funcaoDoDia } from "../domain/funcoes.js";

/** Presentation only: keep the original indices, calculations and exports. */
export function configurarFiltroFuncao(container, resultado, selecionada = "") {
  const quadro = container.querySelector("[data-escala-quadro]");
  if (!quadro) return;
  const document = container.ownerDocument, nomes = new Map();
  const chave = valor => normalizarFuncao(valor) ? `funcao:${normalizarFuncao(valor)}` : "sem-funcao";
  const funcoes = resultado.map(r => {
    const valores = [r.colaborador.cargo, ...r.dias.filter(d => ["T", "FE"].includes(d.status)).map(d => funcaoDoDia(r.colaborador, d))];
    return new Set(valores.map(valor => {
      const key = chave(valor);
      if (!nomes.has(key)) nomes.set(key, String(valor || "").trim() || "Sem função informada");
      return key;
    }));
  });
  const toolbar = document.createElement("div");
  toolbar.className = "escala-filtro";
  const label = document.createElement("label");
  label.className = "no-print";
  label.textContent = "Filtrar por função";
  const select = document.createElement("select");
  select.dataset.filtroFuncao = "";
  select.title = "Função cadastrada ou alocada na escala; habilitações sem alocação não entram no filtro.";
  select.append(new Option("Todas as funções", ""));
  [...nomes].sort((a,b) => a[1].localeCompare(b[1], "pt-BR")).forEach(([key,nome]) => select.append(new Option(nome,key)));
  select.value = nomes.has(selecionada) ? selecionada : "";
  label.append(select);
  const mensagem = document.createElement("p");
  mensagem.dataset.filtroContagem = "";
  mensagem.setAttribute("role", "status");
  mensagem.setAttribute("aria-live", "polite");
  toolbar.append(label, mensagem);
  quadro.insertBefore(toolbar, quadro.querySelector(".escala-ferramentas"));
  const porId = new Map(resultado.map((r,ri) => [String(r.colaborador.id),ri]));
  function aplicar() {
    const indices = new Set(funcoes.flatMap((f,ri) => !select.value || f.has(select.value) ? [ri] : []));
    container.dispatchEvent(new container.ownerDocument.defaultView.KeyboardEvent("keydown", {key:"Escape",bubbles:false}));
    quadro.querySelectorAll("[data-ri][data-di]").forEach(card => card.hidden = !indices.has(Number(card.dataset.ri)));
    container.querySelectorAll("[data-fixo-colaborador],[data-resumo-semanal],[data-resumo-mensal]").forEach(row => {
      const id = row.dataset.fixoColaborador ?? row.dataset.colaborador ?? row.dataset.resumoMensal;
      row.hidden = !indices.has(porId.get(String(id)));
    });
    quadro.querySelectorAll("td").forEach(cell => {
      const cards = [...cell.querySelectorAll("[data-ri][data-di]")];
      if (!cards.length || cell.closest("[data-fixo-colaborador]")) return;
      let vazio = cell.querySelector("[data-filtro-vazio]");
      if (!vazio) {
        vazio = document.createElement("p");
        vazio.dataset.filtroVazio = "";
        vazio.className = "escala-filtro-vazio";
        vazio.textContent = "Nenhum colaborador desta função.";
        cell.append(vazio);
      }
      vazio.hidden = cards.some(card => !card.hidden);
    });
    mensagem.textContent = `${select.value ? nomes.get(select.value) : "Todas as funções"} · ${indices.size} de ${resultado.length} colaborador(es). Filtro visual; cálculos, ajustes e PDFs exportados continuam com a equipe completa.`;
  }
  select.addEventListener("change", aplicar);
  aplicar();
}
