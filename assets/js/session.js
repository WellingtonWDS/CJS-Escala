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
    owner;
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
      if (!response.ok) {
        expire();
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
      clearTimeout(timer);
      timer = setTimeout(expire, remaining);
      return session;
    } catch {
      expire();
      return false;
    } finally {
      checking = false;
    }
  }
  const initialSession = await check();
  if (!initialSession) return false;
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
