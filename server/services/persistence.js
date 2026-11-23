import { createHmac } from "node:crypto";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class PersistenceError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.status = status;
  }
}
export function rpcToken(identity, secret, now = Date.now()) {
  if (
    !UUID.test(identity?.userId) ||
    !UUID.test(identity?.sessionId) ||
    !Number.isSafeInteger(identity?.expiresAt) ||
    identity.expiresAt <= now
  )
    throw new PersistenceError("Sessão individual inválida.", 401);
  if (typeof secret !== "string" || secret.length < 32)
    throw new PersistenceError("Persistência não configurada.");
  const iat = Math.floor(now / 1000),
    exp = Math.min(iat + 60, Math.floor(identity.expiresAt / 1000));
  if (exp <= iat) throw new PersistenceError("Sessão expirada.", 401);
  const encode = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role: "cjs_authenticated", sub: identity.userId, sid: identity.sessionId, iss: "cjs-escala-api", aud: "cjs-postgrest", iat, exp })}`;
  return `${unsigned}.${createHmac("sha256", secret).update(unsigned).digest("base64url")}`;
}
export function createPersistenceService({
  env,
  fetchImpl = fetch,
  now = Date.now,
}) {
  let base;
  try {
    base = new URL(env.PERSISTENCE_RPC_URL);
    if (
      !["https:", "http:"].includes(base.protocol) ||
      base.username ||
      base.password ||
      base.search ||
      base.hash
    )
      throw Error();
    if (
      base.protocol !== "https:" &&
      !(
        env.PERSISTENCE_ALLOW_LOCAL_HTTP === "true" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)
      )
    )
      throw Error();
  } catch {
    throw new PersistenceError("Endereço de persistência inválido.");
  }
  async function call(name, args, identity) {
    const token = rpcToken(identity, env.PERSISTENCE_JWT_SECRET, now());
    let res;
    try {
      res = await fetchImpl(`${base.href.replace(/\/$/, "")}/rpc/${name}`, {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Content-Profile": "cjs_api",
          "Accept-Profile": "cjs_api",
        },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new PersistenceError(
        "Não foi possível conectar ao armazenamento. Tente novamente.",
      );
    }
    if (!res.ok) {
      if (name.startsWith('diagnostic_') && res.status === 404) {
        let error; try { error = await res.clone().json(); } catch {}
        if (error?.code === 'PGRST202') throw new PersistenceError('Diagnóstico ainda não configurado no banco.');
      }
      // Antes da migração 010 as funções de plano não existem: sem plano, sem limite.
      if (/^(plan_|admin_plan|admin_office|company_set_archived|company_cards|office_branding|manage_invite_user|manage_send_access_link|manage_pending_invites)/.test(name) && res.status === 404) {
        let error; try { error = await res.clone().json(); } catch {}
        if (error?.code === 'PGRST202') throw new PersistenceError('Planos ainda não configurados no banco (migração 010).', 501);
      }
      // Mensagens de plano e arquivamento vêm das funções do próprio banco (texto fixo, sem dados do cliente).
      let detail;
      if ([402, 423].includes(res.status)) {
        try { detail = (await res.clone().json())?.message; } catch {}
      }
      const statuses = {
        402: "Limite do plano atingido.",
        423: "Empresa arquivada: somente visualização.",
        400: "Dados inválidos.",
        401: "Sessão expirada ou revogada.",
        403: "Acesso não permitido.",
        404: "Rascunho não encontrado.",
        409: "Conflito: reabra o rascunho atual antes de salvar.",
      };
      throw new PersistenceError(
        (typeof detail === "string" && detail.length <= 200 && detail) || statuses[res.status] || "Armazenamento indisponível.",
        statuses[res.status] ? res.status : 503,
      );
    }
    try {
      return await res.json();
    } catch {
      throw new PersistenceError("Resposta inválida do armazenamento.");
    }
  }
  // Não há método público que aceite nome arbitrário de RPC, papel ou identidade no corpo.
  return {
    planRegisterUse: (identity, { officeId, companyId, action, names, confirmSwap = false }) =>
      call("plan_register_use", { p_office_id: officeId, p_company_id: companyId, p_action: action, p_names: names, p_confirm_swap: confirmSwap }, identity),
    planStatus: (identity, officeId) => call("plan_status", { p_office_id: officeId }, identity),
    companySetArchived: (identity, { officeId, companyId, archived }) =>
      call("company_set_archived", { p_office_id: officeId, p_company_id: companyId, p_archived: archived }, identity),
    adminPlansOverview: (identity) => call("admin_plans_overview", {}, identity),
    adminPlanDetail: (identity, officeId) => call("admin_plan_detail", { p_office_id: officeId }, identity),
    adminPlanSave: (identity, { officeId, revision, name, companyLimit, employeeLimit, cycleAnchor, status, notes }) =>
      call("admin_plan_save", { p_office_id: officeId, p_revision: revision, p_name: name, p_company_limit: companyLimit, p_employee_limit: employeeLimit, p_cycle_anchor: cycleAnchor, p_status: status, p_notes: notes }, identity),
    adminPlanRemove: (identity, { officeId, revision }) => call("admin_plan_remove", { p_office_id: officeId, p_revision: revision }, identity),
    adminPlanCourtesy: (identity, { officeId, quantity, reason }) =>
      call("admin_plan_courtesy", { p_office_id: officeId, p_quantity: quantity, p_reason: reason }, identity),
    adminOfficeDemo: (identity, { officeId, demo }) => call("admin_office_demo", { p_office_id: officeId, p_demo: demo }, identity),
    diagnosticOptions: identity => call('diagnostic_options',{},identity),
    diagnosticList: (identity,{officeId,companyId}) => call('diagnostic_list',{p_office_id:officeId,p_company_id:companyId},identity),
    diagnosticGet: (identity,{officeId,companyId,id,revision=null}) => call('diagnostic_get',{p_office_id:officeId,p_company_id:companyId,p_id:id,p_revision:revision},identity),
    diagnosticSave: (identity,{officeId,companyId,id,revision,key,status,data}) => call('diagnostic_save',{p_office_id:officeId,p_company_id:companyId,p_id:id,p_revision:revision,p_key:key,p_status:status,p_data:data},identity),
    deleteDraft: (identity, { officeId, companyId, draftId, revision }) =>
      call(
        "delete_draft",
        {
          p_office_id: officeId,
          p_company_id: companyId,
          p_draft_id: draftId,
          p_revision: revision,
        },
        identity,
      ),
    updateCompany: (
      identity,
      { officeId, companyId, name, cnpj, previousName, previousCnpj },
    ) =>
      call(
        "update_company",
        {
          p_office_id: officeId,
          p_company_id: companyId,
          p_name: name,
          p_cnpj: cnpj,
          p_previous_name: previousName,
          p_previous_cnpj: previousCnpj,
        },
        identity,
      ),
    createOffice: (identity, name) =>
      call("create_office", { p_name: name }, identity),
    companyOptions: (identity) => call("company_options", {}, identity),
    companyCards: (identity) => call("company_cards", {}, identity),
    officeBrandingGet: (identity, officeId) => call("office_branding_get", { p_office_id: officeId }, identity),
    officeBrandingSave: (identity, b) =>
      call("office_branding_save", { p_office_id: b.officeId, p_revision: b.revision, p_display_name: b.displayName, p_logo: b.logo, p_logo_width: b.logoWidth, p_logo_height: b.logoHeight, p_primary_color: b.primaryColor, p_secondary_color: b.secondaryColor }, identity),
    resolveCompany: (identity, { officeId, name, cnpj, apply = false }) =>
      call(
        "resolve_company",
        { p_office_id: officeId, p_name: name, p_cnpj: cnpj, p_apply: apply },
        identity,
      ),
    managementOptions: (identity) => call("manage_options", {}, identity),
    inviteUser: (identity, { name, email, officeId, role, companyIds }) =>
      call("manage_invite_user", { p_name: name.trim(), p_email: email.trim().toLowerCase(), p_office_id: role === "admin" ? null : officeId, p_role: role, p_company_ids: role === "admin" ? [] : companyIds }, identity),
    sendAccessLink: (identity, { userId, officeId }) => call("manage_send_access_link", { p_user_id: userId, p_office_id: officeId }, identity),
    pendingInvites: (identity) => call("manage_pending_invites", {}, identity),
    createUser: (
      identity,
      { name, email, password, officeId, role, companyIds },
    ) =>
      call(
        "manage_create_user",
        {
          p_name: name.trim(),
          p_email: email.trim().toLowerCase(),
          p_password: password,
          p_office_id: officeId,
          p_role: role,
          p_company_ids: companyIds,
        },
        identity,
      ),
    updateUser: (
      identity,
      {
        userId,
        officeId,
        revision,
        name,
        email,
        role,
        active,
        accountActive,
        companyIds,
      },
    ) =>
      call(
        "manage_update_user",
        {
          p_user_id: userId,
          p_office_id: officeId,
          p_revision: revision,
          p_name: name.trim(),
          p_email: email === null ? null : email.trim().toLowerCase(),
          p_role: role,
          p_active: active,
          p_account_active: accountActive,
          p_company_ids: companyIds,
        },
        identity,
      ),
    updateUserAccess: (identity, { userId, officeId, companyIds }) =>
      call(
        "manage_update_access",
        { p_user_id: userId, p_office_id: officeId, p_company_ids: companyIds },
        identity,
      ),
    listOffices: (identity) => call("list_offices", {}, identity),
    listCompanies: (identity, officeId) =>
      call("list_companies", { p_office_id: officeId }, identity),
    listDrafts: (identity, officeId, companyId) =>
      call(
        "list_drafts",
        { p_office_id: officeId, p_company_id: companyId },
        identity,
      ),
    getDraft: (identity, officeId, companyId, draftId) =>
      call(
        "get_draft",
        { p_office_id: officeId, p_company_id: companyId, p_draft_id: draftId },
        identity,
      ),
    saveDraft: (
      identity,
      { officeId, companyId, draftId, revision, key, title, state },
    ) =>
      call(
        "save_draft",
        {
          p_office_id: officeId,
          p_company_id: companyId,
          p_draft_id: draftId ?? null,
          p_revision: revision ?? null,
          p_key: key,
          p_title: title,
          p_state: state,
        },
        identity,
      ),
  };
}
