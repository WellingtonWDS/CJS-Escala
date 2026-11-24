import { getDialogs } from "./ui/dialogs.js";
export function safeDestination(value) {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !/[\\\r\n]/.test(value) &&
    !value.startsWith("/login.html") &&
    !value.startsWith("/api/")
    ? value
    : "/";
}
export async function requireSession() {
  let timer,
    checking = false,
    owner,
    interruption;
  let recoverInitial;
  const recovered = new Promise(resolve => { recoverInitial = resolve; });
  function unavailable() {
    if (interruption) return;
    if (document.documentElement.dataset.ready !== "true")
      document.body.removeAttribute("aria-busy");
    interruption = document.createElement("dialog");
    interruption.className = "app-dialog";
    interruption.setAttribute("aria-label", "Verificação de acesso temporariamente indisponível");
    interruption.innerHTML = `<h2>Não foi possível verificar seu acesso</h2><p>A conexão ou o serviço está temporariamente indisponível. Sua sessão não foi encerrada. Vamos verificar novamente; os dados desta aba foram preservados.</p><button type="button">Tentar novamente</button>`;
    interruption.addEventListener("cancel", event => event.preventDefault());
    interruption.querySelector("button").onclick = check;
    document.body.append(interruption);
    interruption.showModal();
    document.documentElement.style.visibility = "visible";
    document.body.inert = false;
  }
  function available() {
    interruption?.close();
    interruption?.remove();
    interruption = null;
  }
  const expire = (expired = true) => {
    document.documentElement.style.visibility = "hidden";
    document.body.inert = true;
    location.replace(
      "/login.html?" +
        (expired ? "expired=1&" : "") +
        "next=" +
        encodeURIComponent(location.pathname + location.search + location.hash),
    );
  };
  // Última verificação concluída. Aba escondida não consulta o servidor: a expiração
  // local continua pelo temporizador, e as chamadas de dados são validadas no banco.
  let ultima = 0;
  async function check() {
    if (checking) return;
    checking = true;
    ultima = Date.now();
    try {
      const response = await fetch("/api/auth", { cache: "no-store" });
      if (response.status === 401) {
        expire();
        return false;
      }
      if (!response.ok) {
        unavailable();
        ultima = 0;
        return false;
      }
      const session = await response.json();
      if (owner && owner !== session.user?.id) {
        expire();
        return false;
      }
      owner = session.user?.id;
      const remaining = session.expiresAt - session.serverNow;
      if (!(remaining > 0)) {
        expire();
        return false;
      }
      available();
      recoverInitial(session);
      clearTimeout(timer);
      timer = setTimeout(expire, remaining);
      return session;
    } catch {
      unavailable();
      // Falha temporária: a próxima ocasião (foco ou intervalo) tenta de novo.
      ultima = 0;
      return false;
    } finally {
      checking = false;
    }
  }
  window.addEventListener("pageshow", async (event) => {
    if (event.persisted) {
      document.documentElement.style.visibility = "hidden";
      document.body.inert = true;
      if (await check()) {
        document.documentElement.style.visibility = "visible";
        document.body.inert = false;
      }
    }
  });
  const RETORNO = 60_000, INTERVALO = 5 * 60_000;
  const seAntiga = (ms) => {
    if (!document.hidden && Date.now() - ultima >= ms) check();
  };
  // Ao voltar para a janela ou aba: verifica se a última consulta tem mais de 1 min.
  window.addEventListener("focus", () => seAntiga(RETORNO));
  document.addEventListener("visibilitychange", () => seAntiga(RETORNO));
  // Com a aba visível: no máximo uma consulta a cada 5 min.
  setInterval(() => seAntiga(INTERVALO), 30_000);
  // Saída em outra aba encerra esta na hora, sem consultar o servidor.
  const canal = typeof BroadcastChannel === "function" ? new BroadcastChannel("reescala-sessao") : null;
  if (canal) canal.onmessage = (event) => { if (event.data === "logout") expire(false); };
  const initialSession = (await check()) || await recovered;
  document.getElementById("btn-sair")?.addEventListener("click", async () => {
    canal?.postMessage("logout");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      if (!response.ok)
        await getDialogs(document).alert(
          "O acesso local foi encerrado, mas o servidor não confirmou a revogação da sessão. Tente novamente quando o serviço estiver disponível.",
        );
    } catch {
      // The local interface is still locked if the network is unavailable.
    } finally {
      expire(false);
    }
  });
  return initialSession;
}
