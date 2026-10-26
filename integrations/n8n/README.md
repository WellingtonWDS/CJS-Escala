# Login individual — preparação e homologação

A aplicação já tem login individual, sessão revogável no PostgreSQL, rotas de autenticação/persistência na Vercel e no servidor Node.js e interface de empresas/rascunhos. A ativação depende da configuração abaixo. O login compartilhado continua sendo o padrão; nenhum serviço real foi alterado.

## 1. Banco e identidade

Em banco dedicado de homologação, aplicar `database/migrations/001_persistence.sql` e depois `002_individual_sessions.sql`. Se a primeira já estiver aplicada, executar apenas a segunda. São migrações transacionais, de execução única; conferir papéis globais antes de aplicar em um cluster compartilhado. Não mudar o banco da instância PostgREST que atende o outro produto.

A instância de escalas usa os parâmetros de [database/README.md](../../database/README.md), incluindo `db-pre-request=cjs_api.check_session`, `db-schemas=cjs_api` e audiência `cjs-postgrest`. A referência validada é PostgREST 14.15 + PostgreSQL 17. Sessões e limite de tentativas estão no banco, não na memória do servidor.

O usuário deve existir no serviço de identidade usado pelo n8n. Provisionar o escritório e seu administrador com `database/provision-office.sql`, usando como `identity_subject` o `user_id` desse serviço convertido em texto. Os IDs internos do sistema de escalas são UUIDs novos. Outros membros precisam de vínculo explícito no escritório; editores/consulta também precisam de `company_access`. Não há endpoint de cadastro público nem autorização automática de quem possui conta no outro projeto.

## 2. Importar uma cópia independente no n8n

Importar [cjs-login.template.json](cjs-login.template.json) como **novo fluxo**. O arquivo está desativado e sem credenciais, dados pessoais ou dados fixados. Não substituir o fluxo de login do outro sistema.

Configurar:

- No webhook **Login CJS**, manter o caminho `auth/cjs-login`, atendido pela rota `/auth/*` já existente no Caddy, e configurar a credencial **Header Auth** com nome `X-CJS-Service-Key` e um valor aleatório próprio, de pelo menos 32 caracteres. O mesmo valor será `N8N_SERVICE_SECRET` no backend.
- No nó **Buscar identidade**, credencial PostgreSQL restrita à consulta de `user_id`, `email` e `password_hash` do provedor atual. A consulta assume `public.users`, conforme os arquivos fornecidos; adaptar explicitamente se o provedor tiver outro schema. O banco de identidade pode ser diferente do banco de escalas.
- No nó **Assinar identidade CJS**, criar uma credencial **JWT Auth**, com tipo de chave **Passphrase/Secret**, algoritmo **HS256** e chave aleatória exclusiva de pelo menos 32 caracteres. Guardar o valor para configurar `N8N_JWT_SECRET` no backend; não reutilizar a chave de RPC nem a do cookie. O template usa o nó JWT nativo e não lê a chave por `$env`.
- Os identificadores do payload já estão definidos na expressão JSON: `iss=fintria-cjs-identity` e `aud=fintria-cjs-login`. Configurar esses mesmos valores no backend. A expressão calcula `iat` uma única vez e define `exp=iat+43200`.
- O runner do nó **Conferir senha** precisa disponibilizar `bcrypt`, como no fluxo original. Verificar essa dependência na instalação antes de ativar. A assinatura não exige `jsonwebtoken` nos nós Code nem liberação de variáveis de ambiente.

O template utiliza a senha existente do provedor (bcrypt), valida tipos/tamanho e responde genericamente em caso de credenciais incorretas. Não emite papéis SQL nem escritório com base no corpo recebido. O JWT contém `sub` string, `iat`, `exp` (até 12h), `iss` e `aud`, assinado em HS256. A aplicação verifica criptograficamente todos esses campos. Campos de gamificação não fazem parte do contrato.

O template foi revisado estaticamente; não foi executado na instância real de n8n. As integrações automatizadas usam provedor simulado que assina JWTs reais. Homologar importação, módulos, parâmetros SQL e credenciais na instalação do usuário antes da ativação. Não salvar execuções com senhas/tokens; o template desativa o salvamento de execuções. Falhas de infraestrutura ou configurações inválidas não concedem acesso.

## 3. Configurar a aplicação

Manter inicialmente `AUTH_MODE=shared` e `PERSISTENCE_ENABLED=false`. Preparar as variáveis privadas do backend conforme `.env.example`:

| Variável | Conteúdo |
| --- | --- |
| `AUTH_SESSION_SECRET` | Chave exclusiva do cookie assinado (>=32 caracteres). |
| `APP_ORIGIN` | Origem pública completa, sem caminho, como `https://escala.fintria.com.br`. |
| `PERSISTENCE_RPC_URL` | URL da instância dedicada de escalas, inclusive seu prefixo se houver. |
| `PERSISTENCE_JWT_SECRET` | Chave da instância PostgREST de escalas; usada para tokens internos de 60s. |
| `N8N_LOGIN_URL` | URL pública do novo webhook. Com o Caddy informado, `https://api.fintria.com.br/auth/cjs-login` é reescrito para `/webhook/auth/cjs-login` no n8n. |
| `N8N_SERVICE_SECRET` | Valor da credencial Header Auth do webhook. |
| `N8N_JWT_SECRET` | Mesmo valor da chave na nova credencial JWT Auth do n8n. |
| `N8N_JWT_ISSUER` | `fintria-cjs-identity`, conforme o payload do nó JWT. |
| `N8N_JWT_AUDIENCE` | `fintria-cjs-login`, conforme o payload do nó JWT. |

Depois de validar o novo fluxo e as migrações, ativar o modo de homologação com `AUTH_MODE=n8n` e `PERSISTENCE_ENABLED=true`. O formulário passa a exigir e-mail e senha. Não há fallback para a senha compartilhada se o n8n ou o banco falhar. A chave de assinatura de identidade nunca é a chave de RPC; a aplicação rejeita essa reutilização.

O JWT do n8n é consumido pelo backend e não é armazenado no navegador. A aplicação abre uma sessão no banco e fornece cookie HttpOnly/Secure/SameSite. O banco confere titularidade, validade, usuário ativo, escritório e empresa a cada operação. Logout revoga a sessão antes de remover o cookie; se o serviço estiver indisponível, o cookie é removido e o navegador informa que a revogação remota não foi confirmada. A sessão continua limitada à expiração original.

Não é necessário transmitir segredos pelo chat. Configurá-los no ambiente privado da hospedagem e nas credenciais do n8n.

## 4. Uso e migração dos dados locais

No cabeçalho, **Empresas e rascunhos** permite escolher escritório e empresa, abrir um rascunho ou um novo preenchimento, **Salvar** e **Salvar como novo**. Só é possível salvar na empresa efetivamente aberta. Não há sincronização automática nesta etapa: uma mensagem de sucesso só aparece após confirmação do servidor.

Contas individuais iniciam sem os colaboradores de exemplo. Cache e envios pendentes são separados por usuário/escritório/empresa/rascunho. Ao entrar em outra conta, o sistema não abre o cache da conta anterior. Acesso à empresa é conferido no servidor antes de abrir um cache já associado. O isolamento da interface não transforma localStorage em armazenamento criptografado; o controle de acesso autoritativo está no servidor.

**Importar dados antigos deste navegador** exige abrir a empresa e confirmar que o preenchimento anterior pertence a ela. Preserva o registro local antigo e não envia nada automaticamente. É preciso salvar explicitamente. Novos preenchimentos usam o mês atual; abrir um rascunho preserva o período escolhido, inclusive meses anteriores.

O envio pendente guarda seu conteúdo e chave de idempotência. Se a resposta se perder, repetir Salvar reenvia a mesma operação, inclusive após recarregar; não duplica o rascunho. Alterações posteriores não são incluídas silenciosamente naquela repetição. Após resolver o envio anterior, salvar novamente envia o preenchimento atual.

Conflito de revisão não sobrescreve a versão do servidor. O preenchimento local é preservado. Ao reabrir a versão atual, o conteúdo local anterior fica disponível em **Recuperar cópia local anterior**, dentro da mesma seleção, para conferir e mesclar manualmente. Limpar preenchimento local não exclui as versões do servidor nem os outros contextos; um envio pendente precisa ser resolvido antes dessa limpeza. Não há mesclagem automática; a cópia é única e será substituída ao abrir outro conteúdo nessa seleção. O navegador mantém cache por conta, não uma garantia de backup.

## 5. Testes e futura VPS

```sh
npm test
npm run test:persistence
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:identity:browser
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:auth:browser
```

Os testes de integração criam apenas PostgreSQL/PostgREST locais descartáveis e provedor de identidade simulado. Verificam autenticação, assinatura, sessão, revogação, limite de tentativas, isolamento, falta de permissões, gravar/reabrir, resposta perdida sem duplicação, conflito, recuperação local e troca de conta.

A camada de rotas é compartilhada pelos adaptadores Vercel e Node.js. Na futura VPS, executar `npm run build` e `npm start` com `APP_ORIGIN` HTTPS e segredo configurados. Por padrão, o serviço escuta somente em `127.0.0.1`; se colocado em container, definir `HOST=0.0.0.0` apenas dentro de rede privada acessível pelo Caddy. O proxy publica HTTPS; PostgREST/PostgreSQL não precisam de portas públicas. Configurar supervisão, limites e backups na implantação, conforme o plano. Não trocar DNS antes de homologar o destino.

As versões de regras de cálculo e do formato do rascunho continuam separadas. Estados salvos são rascunhos, não escalas aprovadas. Permanecem os limites de 1 MiB por estado e 100 itens por listagem, sem armazenamento dos arquivos XLS originais, contas de clientes, painel de provisionamento, aprovação/publicação ou atualização automática de dados remotos.
