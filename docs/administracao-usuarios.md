# Cadastro administrativo de usuários

A página `/admin.html` não tem link no menu. O endereço oculto não é um controle de acesso: a conta individual deve estar em `ADMIN_USER_IDS`, manter sessão ativa no banco e informar a senha adicional. A liberação dura até 30 minutos, vinculada à mesma sessão individual, em cookie HttpOnly/Secure/SameSite=Strict. Logout, revogação ou outra sessão invalidam esse vínculo. Use **Bloquear administração** ao terminar.

## Preparação na VPS

Aplicar **somente** `database/migrations/003_admin_provisioning.sql` no banco dedicado `cjs_escala`, como postgres. Não repetir as migrações anteriores. A migração é transacional e de execução única. Cria as RPCs administrativas e seu papel separado; compatibiliza a tabela `public.users` já criada manualmente e instala pgcrypto caso necessário. O login n8n existente continua consultando essa tabela, sem novo webhook de cadastro. A criação de identidade e dos vínculos é atômica: erro não deixa conta parcial.

Exemplo a partir de uma cópia atualizada do repositório na VPS:

```bash
docker cp database/migrations/003_admin_provisioning.sql postgres_apps:/tmp/003_admin_provisioning.sql
docker exec postgres_apps psql -U postgres -d cjs_escala -v ON_ERROR_STOP=1 -f /tmp/003_admin_provisioning.sql
```

Consulte o UUID interno da sua conta (não use o ID de identidade de public.users):

```sql
SELECT id, name FROM cjs_private.users;
```

Gere o hash da nova senha administrativa no terminal, sem gravar a senha no histórico. Mínimo de 6 caracteres; prefira uma senha exclusiva e longa.

```bash
python3 - <<'PY'
import hashlib
from getpass import getpass
password = getpass('Nova senha administrativa: ')
confirmation = getpass('Confirme: ')
if password != confirmation or len(password) < 6 or len(password) > 256:
    raise SystemExit('As senhas devem coincidir e ter entre 6 e 256 caracteres.')
print(hashlib.pbkdf2_hmac('sha256', password.encode(), b'cjs-admin-access-v1', 210000).hex())
PY
```

Na Vercel, configurar em Production `ADMIN_USER_IDS` com **apenas seu UUID interno** e `ADMIN_PASSWORD_HASH` com o hash gerado. Preservar AUTH_MODE=n8n e as variáveis de autenticação/persistência existentes. Redeploy após configurar. Não transmitir senha, hash ou chaves pelo chat. Sem essas variáveis a área permanece fechada.

## Operação

Entrar normalmente no sistema, abrir `/admin.html`, desbloquear com a senha adicional e preencher nome, e-mail, senha inicial de pelo menos 6 caracteres (máximo 72 bytes), escritório, permissão e empresas. Edição/consulta exigem ao menos uma empresa do escritório. Administrador do escritório acessa todas as empresas dele, mas não recebe a autorização de plataforma desta página. Comunicar a senha inicial por canal privado.

Cadastro duplicado por e-mail retorna conflito e não altera a conta existente. A página cria somente **novas** contas; não adiciona vínculos a contas existentes, não cria escritórios/empresas, não oferece recuperação de senha nem exige troca inicial. Operações ficam registradas em `cjs_private.admin_provision_log`, sem senha ou hash. O endpoint nega chamadas sem sessão, fora da allowlist, sem desbloqueio ou de outra origem. Tentativas de senha administrativa são limitadas no banco (10/15min por administrador, com limite global compartilhado com o login). Não habilitar captura de corpos de requisição nos logs de proxy/APM.

Não existe cadastro público. O backend emite JWT administrativo interno de até 60 segundos; o navegador nunca recebe a chave de RPC nem esse JWT. O papel de dados e o gateway de login não têm permissão nas RPCs de cadastro. A RPC também verifica sessão ativa e vínculo administrativo ativo. A allowlist de administradores da plataforma é aplicada pelo backend e depende da proteção do segredo de assinatura no servidor.
