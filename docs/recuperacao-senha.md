# Esqueci minha senha

O usuário recupera o acesso sozinho, sem depender do Admin.

## Como funciona

1. No login, **Esqueci minha senha** pede o e-mail. A resposta é sempre a mesma, exista ou não a conta (não revela quem está cadastrado).
2. Se o e-mail pertence a um usuário ativo com acesso a algum escritório, o banco gera um **link de uso único que vale 30 minutos**. Só o hash do token fica guardado. Um novo pedido cancela o link anterior; no máximo 3 links por hora por conta, além do limite de tentativas do login (por e-mail e global).
3. O backend pede ao **n8n** o envio do e-mail (HTML + texto). O n8n só monta e envia a mensagem; não acessa o banco.
4. O link abre `/redefinir-senha.html#token=…`. O token fica no fragmento da URL (não vai para logs de acesso) e é retirado da barra de endereço ao abrir. A página confere se o link ainda vale.
5. A nova senha precisa ter de 8 a 72 caracteres, com letras e números (conferido no navegador, no servidor e no banco). É gravada em bcrypt na mesma tabela usada pelo login (`public.users`).
6. Ao trocar: o link é consumido, outros links são cancelados, **todas as sessões abertas são encerradas** e o usuário recebe um e-mail **“Sua senha foi alterada”** com o atalho para pedir um novo link caso não tenha sido ele.

A senha nunca é enviada ao n8n. Falhas do n8n são registradas no log apenas com o tipo da mensagem, sem e-mail ou link.

## Ativação

### 1. Banco (VPS)

```bash
curl -fsSL https://raw.githubusercontent.com/WellingtonWDS/CJS-Escala/main/database/migrations/013_password_reset.sql -o /tmp/013_password_reset.sql
docker cp /tmp/013_password_reset.sql postgres_apps:/tmp/013_password_reset.sql
docker exec postgres_apps psql -U postgres -d cjs_escala -v ON_ERROR_STOP=1 -f /tmp/013_password_reset.sql
```

### 2. n8n

Importar [integrations/n8n/cjs-mail.template.json](../integrations/n8n/cjs-mail.template.json) como **novo fluxo** (vem desativado, sem credenciais). Detalhes no [guia do n8n](../integrations/n8n/README.md#6-e-mails-esqueci-minha-senha).

### 3. Vercel

Adicionar a variável `N8N_MAIL_URL` (Production) com a URL pública do webhook, por exemplo `https://api.fintria.com.br/auth/cjs-mail`, e refazer o deploy. A chave do cabeçalho é a mesma `N8N_SERVICE_SECRET` já usada no login.

Sem `N8N_MAIL_URL`, o pedido responde “Recuperação de senha indisponível no momento” e nada é gerado.

## Validação

`database/tests/password-reset.sql` (16 cenários), `tests/password-reset.test.cjs` (API e fluxo n8n, incluindo o HTML dos e-mails) e `tests/browser-senha.cjs` (telas).
