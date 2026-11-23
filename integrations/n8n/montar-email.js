// Reescala — monta o e-mail (HTML + texto) a partir do pedido do backend.
// Ajuste ORIGEM_PERMITIDA se o domínio público mudar.
const ORIGEM_PERMITIDA = "https://reescala.fintria.com.br";
const LOGO = ORIGEM_PERMITIDA + "/logos/Reescala_original_transparente.png";
const COR = { navy: "#0B2545", verde: "#1F7A54", texto: "#1E2B3A", suave: "#5B6B7C", fundo: "#F3F6F8", borda: "#DCE5EC", alerta: "#FFF4DD", alertaTexto: "#7A4B00" };
const body = $json.body ?? {};
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const linkOk = (u) => typeof u === "string" && u.length <= 400 && (u === ORIGEM_PERMITIDA || u.startsWith(ORIGEM_PERMITIDA + "/"));
const emailOk = (e) => typeof e === "string" && e.length <= 254 && /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(e);
const tipos = ["password_reset", "password_changed", "invite", "plan_notice"];
if (!tipos.includes(body.type) || !emailOk(body.to) || !linkOk(body.loginUrl) || (body.type === "password_reset" && !linkOk(body.resetUrl)) || (body.type === "invite" && !linkOk(body.inviteUrl)) || (body.type === "plan_notice" && (!linkOk(body.appUrl) || !["plano_80", "plano_100", "troca", "ciclo"].includes(body.kind))))
  return [{ json: { valid: false } }];
const nome = String(body.name || "").trim().split(/\s+/)[0].slice(0, 60) || "olá";
const quando = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(+d) ? "" : d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
function botao(href, rotulo) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px"><tr><td align="center" bgcolor="${COR.verde}" style="border-radius:10px">
<a href="${esc(href)}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;line-height:20px;color:#FFFFFF;text-decoration:none;border-radius:10px">${esc(rotulo)}</a></td></tr></table>`;
}
function caixa(html, fundo = COR.fundo, cor = COR.suave) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0"><tr><td style="padding:14px 16px;background:${fundo};border-radius:10px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:${cor}">${html}</td></tr></table>`;
}
function layout({ preheader, titulo, corpo }) {
  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${esc(titulo)}</title>
<style>@media (max-width:620px){.card{width:100%!important}.pad{padding:24px 20px!important}h1{font-size:22px!important}}</style>
</head>
<body style="margin:0;padding:0;background:${COR.fundo};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COR.fundo}">
<tr><td align="center" style="padding:32px 12px">
  <table role="presentation" class="card" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px;background:#FFFFFF;border:1px solid ${COR.borda};border-radius:16px;overflow:hidden">
    <tr><td style="height:6px;background:${COR.navy};font-size:0;line-height:0">&nbsp;</td></tr>
    <tr><td class="pad" style="padding:28px 36px 0">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="padding-right:10px"><img src="${LOGO}" width="44" height="38" alt="" style="display:block;border:0;width:44px;height:38px"></td>
        <td style="font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;color:${COR.navy}">Reescala<div style="font-size:12px;font-weight:normal;color:${COR.suave}">Jornadas em equilíbrio</div></td>
      </tr></table>
    </td></tr>
    <tr><td class="pad" style="padding:24px 36px 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:${COR.texto}">
      <h1 style="margin:0 0 16px;font-size:24px;line-height:30px;color:${COR.navy}">${esc(titulo)}</h1>
      ${corpo}
    </td></tr>
    <tr><td style="padding:18px 36px;border-top:1px solid ${COR.borda};background:#FAFBFC;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:${COR.suave}">
      Mensagem automática do Reescala, enviada para ${esc(body.to)}. Não responda este e-mail.<br>
      Reescala · desenvolvido pela <a href="https://fintria.com.br" target="_blank" rel="noopener" style="color:${COR.verde};text-decoration:underline">Fintria</a>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}
// Validade do link em texto: "30 minutos", "24 horas", "7 dias".
const validade = (min) => {
  const m = Math.min(10080, Math.max(5, Number(min) || 30));
  if (m % 1440 === 0) return `${m / 1440} dia${m === 1440 ? "" : "s"}`;
  if (m % 60 === 0) return `${m / 60} hora${m === 60 ? "" : "s"}`;
  return `${m} minutos`;
};
const curto = (v, n = 120) => String(v || "").trim().slice(0, n);
let subject, html, text;
if (body.type === "password_reset") {
  const prazo = validade(body.expiresMinutes);
  const pedidoPor = curto(body.requestedBy);
  subject = "Redefinição de senha do Reescala";
  html = layout({
    preheader: `Use o link para criar uma nova senha. Ele vale por ${prazo}.`,
    titulo: "Crie uma nova senha",
    corpo: `<p style="margin:0 0 12px">Olá, ${esc(nome)}.</p>
<p style="margin:0">${pedidoPor ? `${esc(pedidoPor)}, gerente do seu escritório, enviou este link para você redefinir a senha da sua conta no Reescala.` : "Recebemos um pedido para redefinir a senha da sua conta no Reescala."} Clique no botão abaixo para criar uma nova senha.</p>
${botao(body.resetUrl, "Criar nova senha")}
<p style="margin:0;font-size:13px;color:${COR.suave}">O link vale por <strong>${prazo}</strong> e pode ser usado uma única vez.</p>
${caixa(`Se o botão não funcionar, copie e cole este endereço no navegador:<br><a href="${esc(body.resetUrl)}" target="_blank" rel="noopener" style="color:${COR.verde};word-break:break-all">${esc(body.resetUrl)}</a>`)}
${caixa(`<strong>Não pediu a troca?</strong> Ignore este e-mail: sua senha atual continua valendo e ninguém terá acesso sem este link.`, COR.alerta, COR.alertaTexto)}`,
  });
  text = `Olá, ${nome}.\n\n${pedidoPor ? `${pedidoPor}, gerente do seu escritório, enviou este link para você redefinir a senha da sua conta no Reescala.` : "Recebemos um pedido para redefinir a senha da sua conta no Reescala."}\nCrie uma nova senha pelo link abaixo (vale por ${prazo} e pode ser usado uma única vez):\n\n${body.resetUrl}\n\nSe você não pediu a troca, ignore este e-mail: sua senha atual continua valendo.\n\nReescala — mensagem automática, não responda.`;
} else if (body.type === "invite") {
  const prazo = validade(body.expiresMinutes);
  const escritorio = curto(body.officeName), quem = curto(body.invitedBy);
  subject = escritorio ? `Convite para acessar o Reescala — ${escritorio}` : "Convite para acessar o Reescala";
  html = layout({
    preheader: `${quem || "Seu escritório"} convidou você para o Reescala. Crie sua senha para entrar.`,
    titulo: "Você foi convidado para o Reescala",
    corpo: `<p style="margin:0 0 12px">Olá, ${esc(nome)}.</p>
<p style="margin:0">${quem ? `<strong>${esc(quem)}</strong> convidou você` : "Você foi convidado"} para acessar o Reescala${escritorio ? ` no escritório <strong>${esc(escritorio)}</strong>` : ""}. O Reescala ajuda a montar e revisar escalas de trabalho conforme a EC 141.</p>
<p style="margin:12px 0 0">Para começar, crie a sua senha. Depois é só entrar com este e-mail (<strong>${esc(body.to)}</strong>) e a senha escolhida.</p>
${botao(body.inviteUrl, "Criar minha senha")}
<p style="margin:0;font-size:13px;color:${COR.suave}">O convite vale por <strong>${prazo}</strong> e pode ser usado uma única vez. Se expirar, peça um novo ao gerente do escritório.</p>
${caixa(`Se o botão não funcionar, copie e cole este endereço no navegador:<br><a href="${esc(body.inviteUrl)}" target="_blank" rel="noopener" style="color:${COR.verde};word-break:break-all">${esc(body.inviteUrl)}</a>`)}
${caixa(`<strong>Não esperava este convite?</strong> Basta ignorar este e-mail: nenhuma senha foi criada e o acesso só é liberado por este link.`, COR.alerta, COR.alertaTexto)}`,
  });
  text = `Olá, ${nome}.\n\n${quem || "Seu escritório"} convidou você para acessar o Reescala${escritorio ? ` no escritório ${escritorio}` : ""}.\nCrie sua senha pelo link abaixo (vale por ${prazo} e pode ser usado uma única vez):\n\n${body.inviteUrl}\n\nDepois, entre com este e-mail (${body.to}) e a senha escolhida.\nNão esperava este convite? Ignore este e-mail.\n\nReescala — mensagem automática, não responda.`;
} else if (body.type === "plan_notice") {
  // Avisos ao Gerente: plano perto do limite, limite atingido, troca de quadro e renovação do ciclo.
  const escritorio = curto(body.officeName), plano = curto(body.planName, 60), empresa = curto(body.companyName);
  const usado = Number(body.used), cap = Number(body.capacity), livres = Math.max(0, Number(body.free) || 0);
  const renova = body.renewsAt ? quando(body.renewsAt + "T12:00:00Z").slice(0, 10) : "";
  const uso = Number.isFinite(usado) && Number.isFinite(cap) && cap > 0 ? `${usado} de ${cap} empresas` : "";
  const barra = uso ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 4px"><tr><td style="background:${COR.borda};border-radius:999px;height:10px;font-size:0;line-height:0"><div style="width:${Math.min(100, Math.round((usado / cap) * 100))}%;height:10px;background:${usado >= cap ? "#B42318" : usado >= 0.8 * cap ? "#C77700" : COR.verde};border-radius:999px"></div></td></tr></table><p style="margin:0;font-size:13px;color:${COR.suave}">${esc(uso)} em uso no ciclo${renova ? ` · renova em ${esc(renova)}` : ""}</p>` : "";
  const textos = {
    plano_80: {
      assunto: `Plano perto do limite${escritorio ? ` — ${escritorio}` : ""}`,
      titulo: "Seu plano está perto do limite",
      pre: `${uso} em uso. Restam ${livres} vaga(s) neste ciclo.`,
      corpo: `<p style="margin:0">O escritório ${escritorio ? `<strong>${esc(escritorio)}</strong> ` : ""}já usa <strong>${esc(uso)}</strong> do plano${plano ? ` ${esc(plano)}` : ""} neste ciclo. Restam <strong>${livres} vaga(s)</strong>.</p>${barra}
<p style="margin:16px 0 0">Para liberar vagas, arquive as empresas que não estão mais em uso (a vaga volta na renovação). Se precisar de mais empresas, fale com a Fintria.</p>`,
      texto: `O escritório ${escritorio} já usa ${uso} do plano ${plano} neste ciclo. Restam ${livres} vaga(s).${renova ? ` O ciclo renova em ${renova}.` : ""}`,
    },
    plano_100: {
      assunto: `Limite do plano atingido${escritorio ? ` — ${escritorio}` : ""}`,
      titulo: "O limite do plano foi atingido",
      pre: `${uso} em uso. Novas empresas ficam bloqueadas até a renovação.`,
      corpo: `<p style="margin:0">O escritório ${escritorio ? `<strong>${esc(escritorio)}</strong> ` : ""}atingiu o limite do plano${plano ? ` ${esc(plano)}` : ""}: <strong>${esc(uso)}</strong>. Novas empresas e trocas de quadro ficam bloqueadas até a renovação do ciclo.</p>${barra}
<p style="margin:16px 0 0">Arquive as empresas que não estão mais em uso (a vaga volta na renovação) ou fale com a Fintria para ampliar o plano.</p>`,
      texto: `O escritório ${escritorio} atingiu o limite do plano ${plano}: ${uso}. Novas empresas ficam bloqueadas até a renovação${renova ? ` (${renova})` : ""}.`,
    },
    troca: {
      assunto: `Troca de quadro aguardando você${empresa ? ` — ${empresa}` : ""}`,
      titulo: "Troca de quadro aguardando confirmação",
      pre: `${empresa || "Uma empresa"} teve a maior parte dos colaboradores trocada.`,
      corpo: `<p style="margin:0">${body.actor ? `<strong>${esc(curto(body.actor))}</strong> tentou` : "Houve uma tentativa de"} montar a escala da empresa <strong>${esc(empresa || "—")}</strong> com ${Number(body.novos) || "vários"} de ${Number(body.total) || "—"} colaboradores novos. Isso caracteriza troca de quadro e só o Gerente pode confirmar.</p>
${caixa(`Se for a mesma empresa com novas contratações, abra a empresa no Reescala e confirme: a troca consome <strong>1 vaga extra</strong> neste ciclo${livres ? ` (restam ${livres})` : ""}. Se não reconhecer a mudança, nenhuma ação é necessária.`)}`,
      texto: `${body.actor || "Alguém"} tentou montar a escala da empresa ${empresa} com ${body.novos} de ${body.total} colaboradores novos. Isso caracteriza troca de quadro e só o Gerente pode confirmar (consome 1 vaga extra no ciclo).`,
    },
    ciclo: {
      assunto: `Ciclo do plano renovado${escritorio ? ` — ${escritorio}` : ""}`,
      titulo: "Seu ciclo foi renovado",
      pre: `Novo ciclo iniciado. ${uso} em uso.`,
      corpo: `<p style="margin:0">Começou um novo ciclo do plano${plano ? ` <strong>${esc(plano)}</strong>` : ""} do escritório ${escritorio ? `<strong>${esc(escritorio)}</strong>` : ""}.${Number(body.freed) > 0 ? ` <strong>${Number(body.freed)} vaga(s)</strong> de empresas arquivadas foram liberadas.` : ""}</p>${barra}`,
      texto: `Começou um novo ciclo do plano ${plano} do escritório ${escritorio}. ${uso} em uso.${Number(body.freed) > 0 ? ` ${Number(body.freed)} vaga(s) de empresas arquivadas foram liberadas.` : ""}${renova ? ` Próxima renovação: ${renova}.` : ""}`,
    },
  }[body.kind];
  subject = textos.assunto;
  html = layout({
    preheader: textos.pre,
    titulo: textos.titulo,
    corpo: `<p style="margin:0 0 12px">Olá, ${esc(nome)}.</p>
${textos.corpo}
${botao(body.appUrl, "Abrir o Reescala")}
<p style="margin:0;font-size:12px;color:${COR.suave}">Você recebe este aviso por ser Gerente do escritório no Reescala.</p>`,
  });
  text = `Olá, ${nome}.\n\n${textos.texto}\n\nAbrir o Reescala: ${body.appUrl}\n\nVocê recebe este aviso por ser Gerente do escritório no Reescala.\nReescala — mensagem automática, não responda.`;
} else {
  const momento = quando(body.changedAt);
  subject = "Sua senha do Reescala foi alterada";
  html = layout({
    preheader: "Confirmação de alteração de senha.",
    titulo: "Senha alterada",
    corpo: `<p style="margin:0 0 12px">Olá, ${esc(nome)}.</p>
<p style="margin:0">A senha da sua conta no Reescala foi alterada${momento ? ` em <strong>${esc(momento)}</strong> (horário de Brasília)` : ""}. Por segurança, as sessões abertas com a senha anterior foram encerradas.</p>
${botao(body.loginUrl, "Entrar no Reescala")}
${caixa(`<strong>Não foi você?</strong> Peça agora um novo link em <a href="${esc(linkOk(body.forgotUrl) ? body.forgotUrl : body.loginUrl)}" target="_blank" rel="noopener" style="color:${COR.alertaTexto}">Esqueci minha senha</a> e avise o gerente do seu escritório.`, COR.alerta, COR.alertaTexto)}`,
  });
  text = `Olá, ${nome}.\n\nA senha da sua conta no Reescala foi alterada${momento ? ` em ${momento} (horário de Brasília)` : ""}. As sessões abertas com a senha anterior foram encerradas.\n\nEntrar: ${body.loginUrl}\n\nNão foi você? Peça um novo link em "Esqueci minha senha" (${linkOk(body.forgotUrl) ? body.forgotUrl : body.loginUrl}) e avise o gerente do seu escritório.\n\nReescala — mensagem automática, não responda.`;
}
return [{ json: { valid: true, to: body.to, subject, html, text, type: body.type } }];
