# Convite de usuários por e-mail

O Gerente (ou o Admin) cadastra a pessoa informando **nome, e-mail, perfil e empresas**. Não há senha no cadastro: a pessoa recebe um e-mail **“Convite para acessar o Reescala”** e cria a própria senha.

## Fluxo

1. **Usuários → Novo usuário → Enviar convite.** A conta é criada com uma senha aleatória descartada (ninguém consegue entrar antes de aceitar o convite).
2. O e-mail traz o botão **Criar minha senha** (link de uso único, válido por **7 dias**), com o nome de quem convidou e o escritório.
3. A pessoa abre o link, vê **Bem-vindo ao Reescala**, cria a senha (8 a 72 caracteres, com letras e números) e entra com o e-mail e a senha escolhida.
4. Na lista de usuários, quem ainda não aceitou aparece com o selo **Convite pendente** (ou **Convite expirado**).

## Convite de Admin

Admin global não tem vínculo com escritório (acessa todos pelo próprio perfil). Ao escolher o perfil **Admin** no convite, os campos de escritório e empresas somem; só outro Admin pode convidar, reenviar o convite ou enviar link de redefinição para um Admin. Requer a migração **015_admin_invites.sql**:

```bash
curl -fsSL https://raw.githubusercontent.com/WellingtonWDS/CJS-Escala/main/database/migrations/015_admin_invites.sql -o /tmp/015_admin_invites.sql
docker cp /tmp/015_admin_invites.sql postgres_apps:/tmp/015_admin_invites.sql
docker exec postgres_apps psql -U postgres -d cjs_escala -v ON_ERROR_STOP=1 -f /tmp/015_admin_invites.sql
```

## Ações do Gerente na edição do usuário

- **Reenviar convite** (quem nunca entrou): gera um novo link de 7 dias e cancela o anterior.
- **Enviar link para redefinir a senha** (quem já usa o sistema): a pessoa recebe um link de **24 horas**; o Gerente não vê nem define a senha. A senha atual continua valendo até a troca; ao trocar, as sessões abertas são encerradas.

Limites: até 30 convites por hora por Gerente e 5 envios por hora para a mesma pessoa. O link nunca volta ao navegador do Gerente; só vai por e-mail.

## Ativação

1. Banco (VPS), após a 013:

```bash
curl -fsSL https://raw.githubusercontent.com/WellingtonWDS/CJS-Escala/main/database/migrations/014_user_invites.sql -o /tmp/014_user_invites.sql
docker cp /tmp/014_user_invites.sql postgres_apps:/tmp/014_user_invites.sql
docker exec postgres_apps psql -U postgres -d cjs_escala -v ON_ERROR_STOP=1 -f /tmp/014_user_invites.sql
```

2. n8n: no fluxo de e-mails, substituir o código do nó **Montar e-mail** pelo do modelo atualizado ([cjs-mail.template.json](../integrations/n8n/cjs-mail.template.json)), que passa a montar também o e-mail de convite e o de redefinição pedida pelo Gerente. O nó do Gmail não muda.

3. Vercel: nenhuma variável nova (usa `N8N_MAIL_URL`).

Sem a migração 014, o envio do convite responde que os convites ainda não estão configurados; sem `N8N_MAIL_URL`, o formulário avisa que o envio de e-mails não está configurado e não cria a conta.

## Validação

`database/tests/invites.sql` (18 cenários), `tests/invites-api.test.cjs`, `tests/password-reset.test.cjs` (e-mail de convite no n8n) e `tests/browser-convites.cjs`.

## Mudar o escritório de um usuário (Admin)

Na edição do usuário, o Admin vê o campo **Escritório**:

- **Mover para outro escritório:** escolha o escritório e as empresas autorizadas do destino. O vínculo anterior e suas empresas são removidos (a mudança fica no histórico).
- **Admin → Operador/Gerente:** escolha o escritório (obrigatório). Evita contas sem vínculo e sem acesso.
- **Operador/Gerente → Admin:** os vínculos deixam de ser necessários e são removidos; o Admin acessa todos os escritórios.

Não é possível alterar o próprio perfil ou escritório, e sempre deve restar um Admin ativo. Requer a migração **017_move_user.sql**:

```bash
curl -fsSL https://raw.githubusercontent.com/WellingtonWDS/CJS-Escala/main/database/migrations/017_move_user.sql -o /tmp/017_move_user.sql
docker cp /tmp/017_move_user.sql postgres_apps:/tmp/017_move_user.sql
docker exec postgres_apps psql -U postgres -d cjs_escala -v ON_ERROR_STOP=1 -f /tmp/017_move_user.sql
```
