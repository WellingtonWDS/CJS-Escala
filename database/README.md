# Persistência — banco, sessões e interface

Implementados banco, sessões individuais, serviços portáteis e interface de rascunhos com isolamento por escritório/empresa. A ativação depende da configuração de homologação; o padrão continua sendo login compartilhado e armazenamento local. Não há cadastro público. A senha compartilhada não dá acesso remoto. Consulte o [guia de integração n8n](../integrations/n8n/README.md) para configurar o novo fluxo sem alterar o outro projeto.

## Conteúdo

- `migrations/001_persistence.sql`: schemas privados/API, papéis mínimos, usuários provisionados, escritórios, vínculos, empresas, acesso por empresa, sessões, rascunhos, versões imutáveis e auditoria. Migração transacional para banco dedicado, executar uma vez com administrador; não altera `public.users` de outro produto. Papéis são globais no cluster: conferir colisões de nomes antes da implantação. Não executar automaticamente ao iniciar a aplicação.
- `migrations/002_individual_sessions.sql`: papel exclusivo do serviço de identidade, abertura/revogação de sessão, consulta de identidade e limitação persistente de tentativas.
- `migrations/003_admin_provisioning.sql`: tabela de credenciais no banco dedicado, gateway administrativo separado, RPCs de cadastro transacional, hash bcrypt e auditoria. Aplicar uma vez como administrador. Operação e ativação: [administração de usuários](../docs/administracao-usuarios.md). Não aplicar em banco de outro produto.
- `migrations/004_roles_and_user_management.sql`: Admin global e Gerente/Operador por escritório, gestão integrada com isolamento e auditoria de alterações de empresas. Substitui a senha e as RPCs administrativas da entrega 003.
- `migrations/005_company_registry.sql`: cadastro de empresas por escritório, CNPJ validado/único, resolução no importador Domínio e auditoria. [Guia](../docs/cadastro-empresas.md).
- `enable-user-management.sql` e `promote-platform-admin.sql`: ativação administrativa explícita da identidade do proprietário; nunca expostos como RPC. Ver [guia](../docs/administracao-usuarios.md).
- `provision-office.sql`: criação administrativa de escritório, primeiro administrador e empresa. Não cria senha nem sessão e não substitui a integração com o provedor de identidade. A variável `identity_subject` identifica um usuário já provisionado nesse provedor. A primeira fase usa um único emissor de identidade configurado para o produto; adicionar outro emissor exige mudar a chave de identidade para `(emissor, subject)`.
- `tests/seed.sql`: exemplos descartáveis; inclui credenciais exclusivamente locais de teste. Nunca executar em produção.
- `server/services/persistence.js`: operações fixas por `fetch`, JWT HS256 de até 60s associado a usuário e sessão, HTTPS e timeout. Não recebe papel ou identidade do corpo da requisição.
- `server/persistence-api.js`: handler padrão Request/Response independente de Vercel/Node. Autenticador injetado pelo backend; sem ele retorna 401. Valida origem, método, IDs e tamanho, trata conflito e não expõe erros SQL. Montado em `/api/persistence`, com autenticador do cookie individual do servidor e nova checagem pelo PostgreSQL.
- `assets/js/services/persistence.js`: cliente para `/api/persistence`, preparado para a próxima entrega. Usado pelo painel de empresas/rascunhos quando o modo individual está configurado e a persistência habilitada.

## Contrato da identidade e sessões

O autenticador do backend deverá verificar a sessão/cookie e devolver `{userId, sessionId, expiresAt}`. `userId` e `sessionId` são UUIDs do banco desta aplicação, não IDs arbitrários do corpo ou do JWT do outro projeto. JWT de identidade externo terá sua assinatura, emissor, audiência e expiração verificados antes de estabelecer essa sessão. O JWT curto encaminhado ao PostgREST usa outro contrato: `role=cjs_authenticated`, `sub=userId`, `sid=sessionId`, `iss=cjs-escala-api`, `aud=cjs-postgrest`.

A criação de sessões ocorre pela RPC `open_session`, exclusiva do papel `cjs_identity_gateway`, com subject extraído do JWT de identidade verificado pelo backend. O papel de dados não abre sessões nem consulta usuários/sessões diretamente. `get_identity` e `revoke_session` atendem apenas ao próprio usuário e à sessão presente no token. O gateway não lê rascunhos. Nenhum endpoint aceita cadastrar usuário ou fabricar identidade.

Sessões duram no máximo 12h no banco. O `db-pre-request` confere existência, titularidade, expiração e revogação em cada requisição. Funções de RLS repetem a checagem, inclusive se chamadas fora do PostgREST por uma conexão que assuma o papel da aplicação. Administradores têm acesso às empresas do próprio escritório; editores/consulta precisam de vínculo em `company_access`. Perfil consulta não grava. Um mesmo usuário pode ter vínculos explícitos com mais de um escritório.

Helpers SECURITY DEFINER com proprietário NOLOGIN consultam a identidade e os vínculos; não recebem o usuário como argumento. São a fronteira confiável e não têm FORCE RLS para evitar recursão. Os proprietários/migradores continuam sendo administradores de infraestrutura. As RPCs de negócio são SECURITY INVOKER e passam por RLS. Histórico/auditoria são gerados por trigger, sem permissão de escrita pelo papel da API.

## Testes locais com serviços reais

Requisitos: Node.js >=22 e Docker disponível. O teste cria containers/rede exclusivos com nomes aleatórios, publica apenas o PostgREST em porta aleatória de `127.0.0.1` e remove os recursos criados ao terminar. Não conecta à VPS e não modifica containers existentes. PostgreSQL não publica porta no host.

```sh
npm test
npm run test:persistence
```

A referência local é **PostgreSQL 17 + PostgREST 14.15**. As imagens são obtidas pelo Docker se não estiverem presentes. A versão **14.15** foi confirmada pelo operador na VPS com `docker exec postgrest postgrest --version`; a imagem lá está configurada como `postgrest/postgrest:latest`. Os testes usam `postgrest/postgrest:v14.15` explicitamente. Isso valida os contratos na mesma versão do PostgREST, sem comprovar a configuração ou as permissões da instância real. A API informada é `https://api.fintria.com.br/`; sua identificação pública não pôde ser consultada a partir deste ambiente. Não houve chamadas autenticadas à infraestrutura real. Fixar uma versão explícita na futura instância de escalas; não atualizar a instância existente automaticamente.

O teste verifica migração, provisionamento fictício, leitura autorizada, isolamento de dois escritórios e de empresas, leitura sem edição, gravações idempotentes, conteúdo divergente com mesma chave, atualização por revisão, conflito concorrente, rollback de entrada inválida, histórico/auditoria, RLS direta, referência cruzada rejeitada, JWT inválido/expirado, revogação e handler sem autenticador.

## Configuração de homologação — ainda não aplicar na produção

Usar banco dedicado e uma instância de PostgREST específica para o sistema de escalas. O PostgREST atual de outro projeto não deve ter seu `db-uri` substituído. Se for adotado um subcaminho como `https://api.fintria.com.br/escala`, Caddy encaminha esse caminho à nova instância e remove o prefixo; a decisão de roteamento e versão depende do inventário da VPS.

Após revisar migração e backup, o operador aplica o SQL com `ON_ERROR_STOP=1`, define a senha do papel `cjs_authenticator` por canal seguro e configura na instância dedicada:

```ini
db-schemas = "cjs_api"
db-anon-role = "cjs_anonymous"
db-pre-request = "cjs_api.check_session"
jwt-aud = "cjs-postgrest"
```

`db-uri` usa a conta restrita `cjs_authenticator`; `jwt-secret` é uma chave nova e exclusiva deste produto. Ambos são segredos do servidor. `cjs_private` não é schema exposto. A configuração acima corresponde à referência local; validar nomes e suporte na versão real antes de instalar.

Os parâmetros do backend estão em `.env.example`. `PERSISTENCE_ENABLED` fica false até existir login individual integrado, seleção de contexto e migração assistida. Não colocar esses segredos nos arquivos estáticos. A pasta `database/`, os testes e os módulos `server/` não entram no build estático.

## Fluxo de rascunhos e limites desta etapa

A API oferece `listOffices`, `listCompanies`, `listDrafts`, `getDraft` e `saveDraft`. O salvamento recebe escritório, empresa, título, objeto de estado, chave UUID de idempotência e, nas atualizações, ID e revisão esperada. Uma repetição exata da operação devolve a mesma resposta; conteúdo diferente com a mesma chave ou revisão desatualizada retorna 409. Manter a chave ao repetir uma gravação cujo resultado se perdeu na rede.

Estados são rascunhos JSONB com `schema_version=1`, limitados a 1 MiB na representação JSONB textual do PostgreSQL. Não são escalas aprovadas. Resultados incluídos no estado são entradas não certificadas do cliente. Dados sensíveis dos colaboradores não são reproduzidos na auditoria; as versões guardam o rascunho para recuperação e exigirão política de retenção antes de produção.

A listagem inicial retorna no máximo 100 rascunhos por empresa; paginação, histórico na interface, política de retenção/idempotência, arquivos originais, sincronização automática e validação autoritativa de escalas não fazem parte desta etapa. A API de salvamento só recebe snapshots completos nesta fase. A normalização de colaboradores/restrições/configurações em cadastros próprios será feita por novas migrações, preservando versões históricas.

Entregues autenticação individual via n8n (dependente de homologação do template), abertura/revogação de sessões, adaptadores HTTP e seleção de empresa/rascunho na interface. Próxima etapa operacional: aplicar as migrações e configurar o novo fluxo em homologação, seguindo o guia. A futura hospedagem na VPS reutiliza os mesmos handlers, sem depender do middleware Vercel.
