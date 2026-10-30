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
  async function check() {
    if (checking) return;
    checking = true;
    try {
      const response = await fetch("/api/auth", { cache: "no-store" });
      if (response.status === 401) {
        expire();
        return false;
      }
      if (!response.ok) {
        unavailable();
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
  window.addEventListener("focus", check);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) check();
  });
  // Detect logout in another tab even while this tab stays open.
  setInterval(check, 60000);
  const initialSession = (await check()) || await recovered;
  document.getElementById("btn-sair")?.addEventListener("click", async () => {
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
