# Reescala — persistência, banco e sessões

Implementados banco, sessões individuais, serviços portáteis e interface de rascunhos com isolamento por escritório/empresa. A ativação em cada ambiente depende da configuração; o padrão dos arquivos de exemplo continua sendo login compartilhado e armazenamento local. O operador já confirmou o login individual na implantação; não confundir funcionalidade implementada com pendências de homologação das migrações e funções novas. Não há cadastro público. A senha compartilhada não dá acesso remoto. Consulte o [guia de integração n8n](../integrations/n8n/README.md) para configurar o novo fluxo sem alterar o outro projeto.

## Conteúdo

- `migrations/001_persistence.sql`: schemas privados/API, papéis mínimos, usuários provisionados, escritórios, vínculos, empresas, acesso por empresa, sessões, rascunhos, versões imutáveis e auditoria. Migração transacional para banco dedicado, executar uma vez com administrador; não altera `public.users` de outro produto. Papéis são globais no cluster: conferir colisões de nomes antes da implantação. Não executar automaticamente ao iniciar a aplicação.
- `migrations/002_individual_sessions.sql`: papel exclusivo do serviço de identidade, abertura/revogação de sessão, consulta de identidade e limitação persistente de tentativas.
- `migrations/003_admin_provisioning.sql`: tabela de credenciais no banco dedicado, gateway administrativo separado, RPCs de cadastro transacional, hash bcrypt e auditoria. Aplicar uma vez como administrador. Operação e ativação: [administração de usuários](../docs/administracao-usuarios.md). Não aplicar em banco de outro produto.
- `migrations/004_roles_and_user_management.sql`: Admin global e Gerente/Operador por escritório, gestão integrada com isolamento e auditoria de alterações de empresas. Substitui a senha e as RPCs administrativas da entrega 003.
- `migrations/005_company_registry.sql`: cadastro de empresas por escritório, CNPJ validado/único, resolução no importador Domínio e auditoria. [Guia](../docs/cadastro-empresas.md).
- `migrations/006_registry_management.sql`: edição de razão social/CNPJ com conflito otimista e auditoria; criação de escritórios somente por Admin, sem alterar os vínculos dos rascunhos.
- `migrations/007_delete_drafts.sql`: exclusão lógica por empresa/revisão, bloqueio de acesso e reenvio de salvamentos de registros excluídos, preservando histórico/auditoria. [Operação e ativação](../docs/exclusao-preenchimentos.md).
- `migrations/008_users_directory.sql`: diretório de usuários ativos/inativos, edição de nome/e-mail/perfil com revisão, situação por escritório, inativação global por Admin, empresas autorizadas e auditoria sem credenciais. [Operação e ativação](../docs/administracao-usuarios.md).
- `enable-user-management.sql` e `promote-platform-admin.sql`: ativação administrativa explícita da identidade do proprietário; nunca expostos como RPC. Ver [guia](../docs/administracao-usuarios.md).
- `provision-office.sql`: criação administrativa de escritório, primeiro administrador e empresa. Não cria senha nem sessão e não substitui a integração com o provedor de identidade. A variável `identity_subject` identifica um usuário já provisionado nesse provedor. A primeira fase usa um único emissor de identidade configurado para o produto; adicionar outro emissor exige mudar a chave de identidade para `(emissor, subject)`.
- `demo/install.sql` e `demo/segmentos.sql`: instaladores administrativos de dados fictícios no escritório DEMO, vinculados a um Admin ativo. O primeiro contém cinco colaboradores; o segundo, quatro empresas por segmento e onze preenchimentos. Reexecutar preserva edições, sem duplicação ou ressurreição de excluídos. Operação: [DEMO original](../docs/empresa-demo.md) e [segmentos](../docs/cenarios-demo-segmentos.md). Não entram no build estático nem são RPCs públicas. Instalação na VPS ainda não confirmada.
- `tests/seed.sql`: exemplos descartáveis; inclui credenciais exclusivamente locais de teste. Nunca executar em produção.
- `server/services/persistence.js`: operações fixas por `fetch`, JWT HS256 de até 60s associado a usuário e sessão, HTTPS e timeout. Não recebe papel ou identidade do corpo da requisição.
- `server/persistence-api.js`: handler padrão Request/Response independente de Vercel/Node. Autenticador injetado pelo backend; sem ele retorna 401. Valida origem, método, IDs e tamanho, trata conflito e não expõe erros SQL. Montado em `/api/persistence`, com autenticador do cookie individual do servidor e nova checagem pelo PostgreSQL.
- `assets/js/services/persistence.js`: cliente implementado para `/api/persistence`, usado pela área Empresa atual e Preenchimentos quando o modo individual está configurado e a persistência habilitada.

## Contrato da identidade e sessões

O autenticador do backend verifica a sessão/cookie e devolve `{userId, sessionId, expiresAt}`. `userId` e `sessionId` são UUIDs do banco desta aplicação, não IDs arbitrários do corpo ou do JWT do outro projeto. JWT de identidade externo terá sua assinatura, emissor, audiência e expiração verificados antes de estabelecer essa sessão. O JWT curto encaminhado ao PostgREST usa outro contrato: `role=cjs_authenticated`, `sub=userId`, `sid=sessionId`, `iss=cjs-escala-api`, `aud=cjs-postgrest`.

A criação de sessões ocorre pela RPC `open_session`, exclusiva do papel `cjs_identity_gateway`, com subject extraído do JWT de identidade verificado pelo backend. O papel de dados não abre sessões nem consulta usuários/sessões diretamente. `get_identity` e `revoke_session` atendem apenas ao próprio usuário e à sessão presente no token. O gateway não lê rascunhos. Nenhum endpoint público permite autocadastro ou aceita identidade/papel arbitrários do cliente. Cadastro e edição de usuários passam pela API administrativa autenticada e pelas permissões de Admin/Gerente, conforme as migrações 004/008.

Sessões duram no máximo 12h no banco. O `db-pre-request` confere existência, titularidade, expiração e revogação em cada requisição. Funções de RLS repetem a checagem, inclusive se chamadas fora do PostgREST por uma conexão que assuma o papel da aplicação. Admin global tem acesso a todos os escritórios/empresas; Gerente (`membership.admin`) administra seu escritório; Operador (`editor`) e Consulta legada precisam do acesso correspondente em `company_access`. Perfil consulta não grava. Um mesmo usuário pode ter vínculos explícitos com mais de um escritório.

Helpers SECURITY DEFINER com proprietário NOLOGIN consultam a identidade e os vínculos; não recebem o usuário como argumento. São a fronteira confiável e não têm FORCE RLS para evitar recursão. Os proprietários/migradores continuam sendo administradores de infraestrutura. As RPCs de rascunhos usam SECURITY INVOKER e RLS, exceto delete_draft: SECURITY DEFINER valida ator, permissão de escrita e revisão antes de marcar a exclusão. Histórico/auditoria são gerados por trigger, sem permissão de escrita pelo papel da API.

## Testes locais com serviços reais

Requisitos: Node.js >=22 e Docker disponível. O teste cria containers/rede exclusivos com nomes aleatórios, publica apenas o PostgREST em porta aleatória de `127.0.0.1` e remove os recursos criados ao terminar. Não conecta à VPS e não modifica containers existentes. PostgreSQL não publica porta no host.

```sh
npm test
npm run test:persistence
```

A referência local é **PostgreSQL 17 + PostgREST 14.15**. As imagens são obtidas pelo Docker se não estiverem presentes. A versão **14.15** foi confirmada pelo operador na VPS com `docker exec postgrest postgrest --version`; a imagem lá está configurada como `postgrest/postgrest:latest`. Os testes usam `postgrest/postgrest:v14.15` explicitamente. Isso valida os contratos na mesma versão do PostgREST, sem comprovar a configuração ou as permissões da instância real. A API dedicada informada para escalas é `https://api.fintria.com.br/escala`; o operador confirmou o 401 sem sessão via Caddy. Os testes descritos aqui são locais e não fazem chamadas autenticadas à infraestrutura real. Fixar uma versão explícita na futura instância de escalas; não atualizar a instância existente automaticamente.

O teste verifica migração, provisionamento fictício, leitura autorizada, isolamento de dois escritórios e de empresas, leitura sem edição, gravações idempotentes, conteúdo divergente com mesma chave, atualização por revisão, conflito concorrente, rollback de entrada inválida, histórico/auditoria, RLS direta, referência cruzada rejeitada, JWT inválido/expirado, revogação e handler sem autenticador.

## Configuração por ambiente e homologação

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

A API oferece `listOffices`, `listCompanies`, `listDrafts`, `getDraft`, `saveDraft` e `deleteDraft`. Exclusão exige permissão de escrita na empresa e revisão esperada; é lógica, auditada e idempotente. Registros excluídos e suas versões deixam de ser acessíveis ao papel da aplicação, sem apagar o histórico interno. Repetir um salvamento antigo não reabre nem confirma sucesso para o registro excluído. O salvamento recebe escritório, empresa, título, objeto de estado, chave UUID de idempotência e, nas atualizações, ID e revisão esperada. Uma repetição exata da operação devolve a mesma resposta; conteúdo diferente com a mesma chave ou revisão desatualizada retorna 409. Manter a chave ao repetir uma gravação cujo resultado se perdeu na rede.

Estados são rascunhos JSONB com `schema_version=1`, limitados a 1 MiB na representação JSONB textual do PostgreSQL. Não são escalas aprovadas. Resultados incluídos no estado são entradas não certificadas do cliente. Dados sensíveis dos colaboradores não são reproduzidos na auditoria; as versões guardam o rascunho para recuperação e exigirão política de retenção antes de produção.

A listagem inicial retorna no máximo 100 rascunhos por empresa; paginação, histórico na interface, política de retenção/idempotência, arquivos originais, sincronização automática e validação autoritativa de escalas não fazem parte desta etapa. A API de salvamento só recebe snapshots completos nesta fase. A normalização de colaboradores/restrições/configurações em cadastros próprios será feita por novas migrações, preservando versões históricas.

Entregues autenticação individual via n8n, abertura/revogação de sessões, gestão por perfil, empresas e seleção/salvamento/cópia/exclusão de preenchimentos na interface. O login foi confirmado pelo operador; a homologação das funções novas e a execução de todas as migrações remotas devem ser conferidas no [registro de implantação](../docs/implantacao-atual.md). A futura hospedagem na VPS reutiliza os mesmos handlers, sem depender do middleware Vercel.

## Escalas, edição e persistência — 29/10/2026

A primeira entrega da escala fixa está implementada desde **28/10/2026**. O snapshot inclui `modeloEscala` (`dinamica`/`fixa`) e `dataReferenciaFixa`; preenchimentos antigos recebem o padrão dinâmico ao carregar. Não há migração SQL nem alteração de `schema_version`: o JSONB existente preserva esses campos, períodos/feriados mensais e resultados identificados pelo modo. A versão de regras mudou para exigir nova geração de resultados antigos. A integração local verifica também salvar e reabrir o JSON fixo por RPC autenticada. Quadro diário continua no [planejamento](../docs/planos/evolucao-escalas.md).

A edição nos quadros agora recebe entrada, início/fim de intervalo e saída, com pausa opcional; no dinâmico vale para a data, no fixo para o mesmo dia da semana em todo o padrão. Horários aplicados e resultados continuam dentro do snapshot existente. Salvar no servidor permanece uma ação explícita do usuário; editar ou gerar uma escala não ativa sincronização automática.

A revisão da conversão 5×2 atualizou as regras para **`ec141-2026-10-28-8`**. Resultados de versões anteriores exigem nova geração, preservando colaboradores, configurações e preenchimentos. Não há nova migração, RPC, variável de ambiente ou alteração nas permissões. As correções incluem disponibilidade por perfil, limites de ACT/CCT por data e janelas/pausas antes da distribuição de horas. [Relatório técnico e limites](../docs/auditorias/precisao-5x2-2026-10-28.md).

A integração local PostgreSQL 17/PostgREST 14.15 com navegador passou na entrega do modo fixo. As alterações posteriores de edição e cálculo foram validadas por testes unitários e navegador, sem repetir essa integração de banco. Esses resultados não comprovam aplicação de migrações na VPS nem homologação do deploy público. Registro operacional: [implantação atual](../docs/implantacao-atual.md).

Desde 29/10/2026, os resultados também podem ser exportados como PDF completo do empregador e ZIP com PDFs individuais. A geração é local no navegador, não salva anexos no banco nem altera RPCs, permissões ou schema. O salvamento do preenchimento continua explícito e independente da exportação.
