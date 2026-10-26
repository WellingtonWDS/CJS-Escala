const unlock = document.getElementById("admin-unlock"),
  area = document.getElementById("admin-area"),
  form = document.getElementById("admin-create"),
  status = document.getElementById("admin-status");
let options;
async function call(body) {
  const response = await fetch("/api/admin", {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw Error("Acesso administrativo indisponível.");
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      area.hidden = true;
      unlock.hidden = false;
    }
    throw Error(data.error || "Não foi possível concluir a operação.");
  }
  return data;
}
async function run(task) {
  document.querySelectorAll("button").forEach((b) => (b.disabled = true));
  status.textContent = "Processando…";
  try {
    await task();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    document.querySelectorAll("button").forEach((b) => (b.disabled = false));
  }
}
function companies() {
  const container = document.getElementById("admin-companies");
  container.replaceChildren();
  const all = form.elements.role.value === "admin";
  document.getElementById("admin-role-help").textContent = all
    ? "Administradores têm acesso a todas as empresas deste escritório. Essa permissão não libera esta página administrativa."
    : "Selecione ao menos uma empresa. O acesso fica restrito às empresas marcadas.";
  for (const company of options.companies.filter(
    (c) => c.officeId === form.elements.officeId.value,
  )) {
    const label = document.createElement("label"),
      input = document.createElement("input");
    input.type = "checkbox";
    input.value = company.id;
    input.checked = all;
    input.disabled = all;
    label.append(input, document.createTextNode(company.name));
    container.append(label);
  }
}
async function load() {
  options = await call();
  unlock.hidden = options.unlocked;
  area.hidden = !options.unlocked;
  if (!options.unlocked) {
    status.textContent =
      "Informe sua senha administrativa. O acesso adicional dura até 30 minutos.";
    return;
  }
  form.elements.officeId.replaceChildren(
    ...options.offices.map((o) => new Option(o.name, o.id)),
  );
  companies();
  status.textContent = "Acesso administrativo liberado.";
}
unlock.addEventListener("submit", (e) => {
  e.preventDefault();
  run(async () => {
    const password = unlock.elements.password.value;
    unlock.elements.password.value = "";
    await call({ action: "unlock", password });
    await load();
  });
});
document.getElementById("admin-lock").addEventListener("click", () =>
  run(async () => {
    await call({ action: "lock" });
    form.reset();
    await load();
  }),
);
form.elements.officeId.addEventListener("change", companies);
form.elements.role.addEventListener("change", companies);
form.addEventListener("submit", (e) => {
  e.preventDefault();
  run(async () => {
    const values = Object.fromEntries(new FormData(form));
    if (values.password !== values.confirmation)
      throw Error("As senhas não conferem.");
    const companyIds = [
      ...document.querySelectorAll("#admin-companies input:checked"),
    ].map((c) => c.value);
    if (values.role !== "admin" && !companyIds.length)
      throw Error("Selecione ao menos uma empresa.");
    const { confirmation, ...fields } = values;
    const result = await call({ action: "createUser", ...fields, companyIds });
    form.elements.password.value = "";
    form.elements.confirmation.value = "";
    status.textContent = `Usuário ${result.user.name} criado com acesso ao escritório selecionado. Já pode entrar com o e-mail e a senha cadastrados.`;
  });
});
run(load);
