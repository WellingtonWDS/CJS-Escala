import { initLoading } from "./loading.js";
const ativos = new WeakSet();
const copiar = (state) => structuredClone(Object.fromEntries(
  Object.entries(state).filter(([key]) => key !== "conversao"),
));
function aguardarPintura(window) {
  return new Promise((resolve) => {
    let fim = false;
    const concluir = () => {
      if (fim) return;
      fim = true;
      window.clearTimeout(timer);
      resolve();
    };
    // O fallback também permite concluir se a aba estiver em segundo plano.
    const timer = window.setTimeout(concluir, 100);
    window.requestAnimationFrame?.(() => window.requestAnimationFrame(concluir));
  });
}
export async function executarCalculoEscala({ state, env, botao, operacao, opcoes, fallback, aplicar }) {
  const { document, window } = env;
  if (ativos.has(document) || botao.disabled) return;
  ativos.add(document);
  const texto = botao.textContent;
  let worker;
  try {
    const config = copiar(state), assinatura = JSON.stringify(config);
    botao.disabled = true;
    botao.dataset.loadingImmediate = "true";
    botao.dataset.loadingLabel = operacao === "converter" ? "Gerando proposta 5×2 e comparação" : "Gerando escala";
    botao.textContent = operacao === "converter" ? "Gerando proposta…" : "Gerando escala…";
    botao.setAttribute("aria-busy", "true");
    initLoading(document).refresh();
    await aguardarPintura(window);
    const resultado = typeof window.Worker === "function"
      ? await new Promise((resolve, reject) => {
          worker = new window.Worker(new URL("../workers/calculo-escala.js", import.meta.url), { type: "module" });
          worker.onmessage = ({ data }) => {
            if (data?.erro) reject(new Error(data.erro));
            else if (data?.resultado && typeof data.resultado === "object") resolve(data.resultado);
            else reject(new Error("O cálculo retornou uma resposta inválida. Tente novamente."));
          };
          worker.onmessageerror = () => reject(new Error("Não foi possível receber o resultado do cálculo. Tente novamente."));
          worker.onerror = () => reject(new Error("Não foi possível concluir o cálculo. Confira a conexão e tente novamente."));
          worker.postMessage({ operacao, config, opcoes });
        })
      : fallback();
    if (JSON.stringify(copiar(state)) !== assinatura)
      throw new Error("Os dados mudaram durante o cálculo. Gere novamente para usar o preenchimento atualizado.");
    await aplicar(resultado);
  } finally {
    worker?.terminate();
    botao.disabled = false;
    botao.textContent = texto;
    botao.removeAttribute("aria-busy");
    ativos.delete(document);
    initLoading(document).refresh();
  }
}
