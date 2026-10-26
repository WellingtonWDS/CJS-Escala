# Menu e gestão de usuários por perfil

A gestão fica dentro do sistema, no menu lateral. Não há senha administrativa adicional, allowlist de ambiente nem página separada de cadastro. `/admin.html` redireciona para o sistema. O login individual continua pelo n8n; a sessão é validada no banco em todas as operações remotas.

| Perfil | Escalas e empresas | Gestão de usuários |
| --- | --- | --- |
| Operador | Apenas empresas atribuídas em cada escritório | Sem acesso |
| Gerente | Todas as empresas dos escritórios em que é gerente | Cria operadores/gerentes nesses escritórios e altera empresas dos operadores deles |
| Admin | Todos os escritórios e empresas ativos | Cria todos os perfis e gerencia os acessos dos operadores |

Gerentes não criam Admins globais, não alteram sua própria função, não editam gerentes/Admins e não atribuem empresas de outro escritório. Remover todas as empresas de um operador revoga o acesso remoto dele naquele escritório sem excluir os rascunhos. A sessão já aberta vê as novas permissões nas próximas consultas; caches locais anteriormente acessados não podem ser apagados remotamente. Novas aberturas de cache verificam acesso no servidor.

## Ativação na VPS

Pré-requisitos: migrações 001 e 002 já aplicadas no banco dedicado `cjs_escala`, login individual n8n funcionando. O instalador administrativo aplica 003 e 004 somente se ausentes e promove **somente** a identidade explicitamente informada. Não presume que o primeiro cadastro público seja administrador. Não executar em banco de outro produto. Revisar SQL/backup antes de aplicar.

A partir de uma cópia atualizada do repositório:

```bash
docker cp database postgres_apps:/tmp/cjs-database
docker exec postgres_apps psql -U postgres -d cjs_escala \
  -v ON_ERROR_STOP=1 -v identity_subject='ID_DA_IDENTIDADE_DO_PROPRIETARIO' \
  -f /tmp/cjs-database/enable-user-management.sql
```

`identity_subject` é o UUID de `public.users.user_id` emitido pelo login n8n, convertido em texto; o script encontra o usuário interno correspondente e falha se não encontrar uma conta ativa. O resultado deve mostrar `platform_admin = t`. A promoção não cria usuário nem escritório. Se migrações tiverem sido aplicadas parcialmente ou manualmente fora das transações, investigar antes de usar o instalador.

Na Vercel, manter AUTH_MODE=n8n, PERSISTENCE_ENABLED=true e os segredos/URLs existentes. As antigas ADMIN_USER_IDS e ADMIN_PASSWORD_HASH não são mais lidas e podem ser removidas. Não existe nova senha ou webhook. Após o deployment, recarregar o sistema: o menu mostra nome, perfil, geração de escala e empresas/rascunhos; Gerente/Admin também veem Criar novo usuário e Acessos dos operadores.

## Dados e permissões

- `cjs_private.users.platform_admin` representa o Admin global. Alteração direta só por administração de infraestrutura; a RPC de cadastro permite criar outro Admin somente a quem já é Admin.
- `memberships.role=admin` representa **Gerente do escritório**, não Admin global. Os vínculos antigos admin continuam gerentes após a migração. `editor` corresponde ao Operador; acessos antigos de consulta (`viewer`) conservam sua restrição de escrita.
- `get_identity` fornece nome e perfil calculado no banco. As opções de gestão são limitadas a escritórios autorizados, e todos os parâmetros são conferidos novamente nas operações de escrita. O menu não é a fronteira de autorização.
- RPCs `manage_options`, `manage_create_user` e `manage_update_access` usam a identidade da sessão assinada, papel cjs_authenticated e funções SECURITY DEFINER com search_path fixo. As RLS de rascunhos e empresas reconhecem Admin global e continuam isolando Operadores/Gerentes.
- A criação usa bcrypt (6 caracteres no mínimo, 72 bytes no máximo) e grava identidade, usuário, vínculo e auditoria atomicamente. E-mail duplicado retorna conflito sem sobrescrever a conta. Cadastro exige uma empresa para Operador; Gerente/Admin não precisam de atribuições individuais.
- `admin_provision_log` registra criação; `access_change_log` registra escritório, ator, operador e empresas anteriores/posteriores. Nenhuma senha ou hash entra nessas auditorias.
- As RPCs antigas `admin_options` e `admin_create_user` são removidas. O antigo papel administrativo perde seu caminho de pré-requisição. Cookies administrativos antigos não são usados. Os segredos de RPC/cookie do sistema continuam privados.

A interface cria novas contas e altera empresas de Operadores. Não há edição de senha, convite, exclusão de conta, alteração de perfil de conta existente, criação de escritórios/empresas ou painel para auditoria. Contas já existentes em outro escritório exigem provisionamento administrativo de vínculo; e-mail duplicado não cria associação silenciosamente.

## Validação

`npm test` cobre o handler autenticado, origem e validação de entrada. `npm run test:identity:browser` verifica PostgreSQL 17/PostgREST 14.15 locais, criação bcrypt, abertura de sessão da nova identidade, duplicidade, bloqueio de escalada para Admin, isolamento entre escritórios, edição/revogação de empresas e auditoria, além do menu integrado para os três perfis em navegador real. A identidade n8n nessa suíte é simulada; homologar as operações na infraestrutura real após a ativação.
