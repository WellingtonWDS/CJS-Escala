# Minha conta: nome e e-mail

No login individual, o nome do usuário no menu lateral abre **Minha conta**, com três seções:

- **Dados pessoais**: a pessoa edita o próprio nome (2 a 160 caracteres). O menu e os registros passam a mostrar o novo nome; a alteração fica no histórico de cadastro (`user_change_log`).
- **E-mail de acesso**: mostra o e-mail atual. Em **Alterar e-mail**, a pessoa informa o novo endereço e a **senha atual**; o Reescala envia um link de confirmação **para o endereço novo** (vale 24 horas, uso único).
  - Até a confirmação, o e-mail atual continua valendo para entrar. Um novo pedido cancela o anterior; no máximo 3 pedidos por hora.
  - Senha atual errada conta no mesmo limite da troca de senha (5 erros bloqueiam por 15 minutos).
  - O endereço não pode estar em uso por outra conta (conferido no pedido e de novo na confirmação).
  - Ao confirmar, o login passa a usar o novo e-mail, links de redefinição de senha ainda abertos deixam de valer e o **endereço antigo recebe um aviso** da troca.
- **Alterar senha**: como antes.

O link só passa pelo backend e pelo e-mail: não volta ao navegador de quem pediu. A página `confirmar-email.html` lê o token do fragmento (`#token=…`), retira-o da barra de endereço e só confirma com o clique em **Confirmar novo e-mail**, para que leitores automáticos de links não confirmem a troca.

## Ativação

1. Banco — migração **019_account_profile.sql** (após 018):

```bash
curl -fsSL https://raw.githubusercontent.com/WellingtonWDS/CJS-Escala/main/database/migrations/019_account_profile.sql -o /tmp/019_account_profile.sql
```

```bash
docker cp /tmp/019_account_profile.sql postgres_apps:/tmp/019_account_profile.sql
```

```bash
docker exec postgres_apps psql -U postgres -d cjs_escala -v ON_ERROR_STOP=1 -f /tmp/019_account_profile.sql
```

2. n8n — e-mails: substituir todo o código do nó **Montar e-mail** pelo conteúdo de [integrations/n8n/montar-email.js](../integrations/n8n/montar-email.js) (versão bruta: https://raw.githubusercontent.com/WellingtonWDS/CJS-Escala/main/integrations/n8n/montar-email.js), que passa a montar os tipos `email_change` (link ao endereço novo) e `email_changed` (aviso ao endereço antigo).

3. Vercel: nada a configurar; a função `api/account.js` sobe com o código. A troca de e-mail usa as mesmas variáveis do envio de e-mails (`N8N_MAIL_URL`, `N8N_SERVICE_SECRET`); sem elas, a seção de e-mail informa que o envio não está configurado.

## Gerar escala sem empresas

Com o armazenamento por empresa ativo, **Gerar escala** só abre se houver ao menos uma empresa cadastrada (ou uma empresa já aberta). Sem empresas, o sistema avisa e volta para **Empresas**:

- Gerente ou Admin com escritório: o formulário de **nova empresa** já abre.
- Operador: orientação para pedir ao gerente o cadastro ou a liberação da empresa.
- Admin sem escritório: orientação para cadastrar o escritório no Painel Admin.

A mesma verificação vale ao recarregar a página numa etapa da escala (`#sec-…`).

## Testes

- `database/tests/account-profile.sql` (13 verificações no PostgreSQL).
- `tests/account-api.test.cjs` (API e e-mails do n8n).
- `tests/browser-conta-email.cjs` (modal, página de confirmação, bloqueio de Gerar escala).
