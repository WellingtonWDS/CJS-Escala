# Menu e gestão de usuários por perfil

A gestão fica dentro do sistema, no menu lateral. Não há senha administrativa adicional, allowlist de ambiente nem página separada de cadastro. `/admin.html` redireciona para o sistema. O login individual continua pelo n8n; a sessão é validada no banco em todas as operações remotas.

| Perfil | Escalas e empresas | Gestão de usuários |
| --- | --- | --- |
| Operador | Apenas empresas atribuídas em cada escritório | Sem acesso |
| Gerente | Todas as empresas dos escritórios em que é gerente | Lista os usuários do escritório, cadastra e edita Operadores/Gerentes e gerencia situação/acessos locais |
| Admin | Todos os escritórios e empresas ativos | Lista todos, filtra por nome/escritório, cadastra e edita todos os perfis e controla a conta global |

Gerentes não criam nem editam Admins globais, não alteram sua própria função nem inativam o próprio acesso e não atribuem empresas de outro escritório. Podem editar outros Gerentes do mesmo escritório. Remover todas as empresas de um operador revoga o acesso remoto dele naquele escritório sem excluir os rascunhos. A sessão já aberta vê as novas permissões nas próximas consultas; caches locais anteriormente acessados não podem ser apagados remotamente. Novas aberturas de cache verificam acesso no servidor.

## Ativação na VPS

Pré-requisitos: migrações 001 e 002 já aplicadas no banco dedicado `cjs_escala`, login individual n8n funcionando. O instalador administrativo aplica 003 a 008 somente se ausentes e promove **somente** a identidade explicitamente informada. Não presume que o primeiro cadastro público seja administrador. Não executar em banco de outro produto. Revisar SQL/backup antes de aplicar.

A partir de uma cópia atualizada do repositório:

```bash
docker cp database postgres_apps:/tmp/cjs-database
docker exec postgres_apps psql -U postgres -d cjs_escala \
  -v ON_ERROR_STOP=1 -v identity_subject='ID_DA_IDENTIDADE_DO_PROPRIETARIO' \
  -f /tmp/cjs-database/enable-user-management.sql
```

`identity_subject` é o UUID de `public.users.user_id` emitido pelo login n8n, convertido em texto; o script encontra o usuário interno correspondente e falha se não encontrar uma conta ativa. O resultado deve mostrar `platform_admin = t`. A promoção não cria usuário nem escritório. Se migrações tiverem sido aplicadas parcialmente ou manualmente fora das transações, investigar antes de usar o instalador.

Na Vercel, manter AUTH_MODE=n8n, PERSISTENCE_ENABLED=true e os segredos/URLs existentes. As antigas ADMIN_USER_IDS e ADMIN_PASSWORD_HASH não são mais lidas e podem ser removidas. Não existe nova senha ou webhook. Após o deployment, recarregar o sistema: o menu mostra nome, perfil, geração de escala e empresas/rascunhos; Gerente/Admin veem apenas **Usuários**, que reúne cadastro, pesquisa, edição, situação e empresas autorizadas.

## Dados e permissões

- `cjs_private.users.platform_admin` representa o Admin global. Apenas Admin pode criar ou atribuir esse perfil pela aplicação. A própria função não pode ser alterada e é obrigatório manter um Admin ativo.
- `memberships.role=admin` representa **Gerente do escritório**, não Admin global. Os vínculos antigos admin continuam gerentes após a migração. `editor` corresponde ao Operador; acessos antigos de consulta (`viewer`) conservam sua restrição de escrita.
- `get_identity` fornece nome e perfil calculado no banco. As opções de gestão são limitadas a escritórios autorizados, e todos os parâmetros são conferidos novamente nas operações de escrita. O menu não é a fronteira de autorização.
- RPCs `manage_options`, `manage_create_user`, `manage_update_user` e `manage_update_access` usam a identidade da sessão assinada, papel cjs_authenticated e funções SECURITY DEFINER com search_path fixo. As RLS de rascunhos e empresas reconhecem Admin global e continuam isolando Operadores/Gerentes.
- A criação usa bcrypt (6 caracteres no mínimo, 72 bytes no máximo) e grava identidade, usuário, vínculo e auditoria atomicamente. E-mail duplicado retorna conflito sem sobrescrever a conta. Cadastro exige uma empresa para Operador; Gerente/Admin não precisam de atribuições individuais.
- `user_change_log` registra antes/depois de nome, e-mail, perfil e situação, sem senha/hash. Revisões impedem sobrescrever edições simultâneas. `admin_provision_log` registra criação; `access_change_log` registra escritório, ator, operador e empresas anteriores/posteriores. Nenhuma senha ou hash entra nessas auditorias.
- As RPCs antigas `admin_options` e `admin_create_user` são removidas. O antigo papel administrativo perde seu caminho de pré-requisição. Cookies administrativos antigos não são usados. Os segredos de RPC/cookie do sistema continuam privados.

A interface cadastra, lista e edita usuários e seus acessos. Não há edição de senha, convite, exclusão definitiva de conta ou painel de auditoria. Contas já existentes em outro escritório exigem provisionamento administrativo de vínculo; e-mail duplicado não cria associação silenciosamente.

## Validação

`npm test` cobre o handler autenticado, origem e validação de entrada. `npm run test:identity:browser` verifica PostgreSQL 17/PostgREST 14.15 locais, criação bcrypt, abertura de sessão da nova identidade, duplicidade, bloqueio de escalada para Admin, isolamento entre escritórios, edição/revogação de empresas e auditoria, além do menu integrado para os três perfis em navegador real. A identidade n8n nessa suíte é simulada; homologar as operações na infraestrutura real após a ativação.

Gerente/Admin também cadastram e editam empresas por razão social/CNPJ, e somente Admin cria escritórios. Há busca e identificação na importação Domínio: [cadastro de empresas](cadastro-empresas.md).


## Janela Usuários

- Abra **Usuários** no menu lateral. Pesquise por nome, e-mail ou nome do escritório e use o filtro de escritório. Usuários com vários vínculos aparecem uma vez por escritório. Ativos e inativos ficam disponíveis para consulta.
- **Novo usuário** abre o cadastro com senha inicial; **Editar** abre nome, e-mail, perfil, situação e empresas daquele vínculo. A senha existente permanece a mesma. Dados de identidade são atualizados atomicamente junto ao cadastro interno; e-mail duplicado não sobrescreve outra conta.
- O toggle na lista ativa/inativa o acesso ao escritório, sem apagar preenchimentos nem afetar outros vínculos. A inativação pede confirmação. Para Admin global, o toggle controla a conta inteira; Gerente não altera esse perfil.
- Na edição, Admin também tem **Conta ativa em todo o sistema**: inativar revoga todas as sessões. Reativar exige novo login; sessões revogadas não são recuperadas. Conta inativada globalmente depende do Admin para voltar a entrar.
- Nome/e-mail de uma conta vinculada a vários escritórios são somente leitura para Gerentes; o Admin pode editá-los. O Gerente continua podendo gerir perfil, situação e empresas do vínculo autorizado.
- Operador acessa somente as empresas marcadas. Gerente/Admin têm acesso conforme o perfil e não dependem dessas marcações. O perfil Consulta de vínculos antigos conserva sua restrição ao editar o cadastro.
- Se o cadastro mudar durante a edição, o salvamento é bloqueado. Use **Atualizar lista** e confira os dados; nenhuma alteração parcial é gravada. Depois de salvar, a listagem é atualizada. Falhas de rede não são apresentadas como sucesso confirmado.

## Migração 008 na VPS

Com 001–007 já aplicadas, execute **uma vez** no banco dedicado:

```bash
curl -fsSL https://raw.githubusercontent.com/WellingtonWDS/CJS-Escala/main/database/migrations/008_users_directory.sql -o /tmp/008_users_directory.sql
docker cp /tmp/008_users_directory.sql postgres_apps:/tmp/008_users_directory.sql
docker exec postgres_apps psql -U postgres -d cjs_escala -v ON_ERROR_STOP=1 -f /tmp/008_users_directory.sql
```

Se não confirmou todas as anteriores, use o [instalador completo com download dos arquivos](exclusao-preenchimentos.md#atualizar-o-banco-na-vps), que verifica 003–008 antes de aplicar. Não há nova variável ou alteração no n8n. O login usa o mesmo subject; editar e-mail não cria outra identidade.

Conferência:

```bash
docker exec postgres_apps psql -U postgres -d cjs_escala \
  -c "SELECT to_regprocedure('cjs_api.manage_update_user(uuid,uuid,integer,text,text,text,boolean,boolean,uuid[])') AS edicao_usuarios;"
```

O resultado deve identificar a função, sem valor vazio. Após o deployment da main, recarregue e homologue com usuários de teste; os testes locais não confirmam aplicação da migração na VPS.
