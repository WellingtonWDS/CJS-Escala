# Excluir um preenchimento

1. Abra **Empresa atual e Preenchimentos**.
2. Escolha o escritório, a empresa e um preenchimento salvo.
3. Clique em **Excluir preenchimento selecionado** e confira o nome e a empresa na confirmação.
4. Confirme **Excluir preenchimento** ou escolha **Manter preenchimento** para cancelar.

A exclusão remove o registro da lista de todos os usuários da empresa. Se for o preenchimento aberto, ele será fechado e sua cópia local neste navegador será removida. Excluir outro registro preserva o que está aberto. Os demais preenchimentos e o cadastro da empresa permanecem intactos. A opção fica desabilitada para um preenchimento novo ainda não salvo.

Operador com permissão de edição na empresa, Gerente do escritório e Admin podem excluir. A API verifica a permissão e a sessão no servidor; usuários legados de consulta não podem excluir. Se outra pessoa alterar o registro depois de carregar a lista, a exclusão é bloqueada: reabra a janela, confira e tente novamente. Conclua eventual envio pendente do registro aberto antes de excluí-lo.

Se a resposta se perder na rede, o sistema mantém a seleção até obter confirmação; tentar de novo não duplica a auditoria. A exclusão é lógica: histórico e auditoria internos são preservados, sem botão de restauração. Caches já carregados por outros usuários não são apagados remotamente. Se um colega tentar salvar o registro excluído, recebe aviso; pode preservar suas alterações por **Salvar uma cópia**, criando outro ID explicitamente. Repetições de salvamentos antigos não reativam o registro.

## Atualizar o banco na VPS

Requer a migração **007_delete_drafts.sql**. Os testes locais não aplicam alterações na VPS. Não há nova variável de ambiente nem alteração no n8n.

Para o banco dedicado `cjs_escala`, com 001/002 já executadas, o instalador abaixo verifica e aplica somente as migrações ausentes de 003 a 008. A promoção de Admin exige informar explicitamente o subject da identidade proprietária já cadastrada; use o mesmo UUID informado no provisionamento inicial. Não é o UUID interno de `cjs_private.users`.

```bash
(
set -e
read -r -p "Subject da identidade proprietária: " cjs_identity_subject
mkdir -p /tmp/cjs-acessos/migrations
for arquivo in \
  enable-user-management.sql \
  promote-platform-admin.sql \
  migrations/003_admin_provisioning.sql \
  migrations/004_roles_and_user_management.sql \
  migrations/005_company_registry.sql \
  migrations/006_registry_management.sql \
  migrations/007_delete_drafts.sql \
  migrations/008_users_directory.sql
do
  curl -fsSL \
    "https://raw.githubusercontent.com/WellingtonWDS/CJS-Escala/main/database/$arquivo" \
    -o "/tmp/cjs-acessos/$arquivo"
done
docker cp /tmp/cjs-acessos postgres_apps:/tmp/
docker exec postgres_apps psql \
  -U postgres -d cjs_escala -v ON_ERROR_STOP=1 \
  -v identity_subject="$cjs_identity_subject" \
  -f /tmp/cjs-acessos/enable-user-management.sql
)
```

Se as migrações 001–006 já estiverem confirmadas, basta aplicar **007 uma vez**:

```bash
curl -fsSL https://raw.githubusercontent.com/WellingtonWDS/CJS-Escala/main/database/migrations/007_delete_drafts.sql -o /tmp/007_delete_drafts.sql
docker cp /tmp/007_delete_drafts.sql postgres_apps:/tmp/007_delete_drafts.sql
docker exec postgres_apps psql -U postgres -d cjs_escala -v ON_ERROR_STOP=1 -f /tmp/007_delete_drafts.sql
```

Conferência da instalação:

```bash
docker exec postgres_apps psql -U postgres -d cjs_escala \
  -c "SELECT to_regprocedure('cjs_api.delete_draft(uuid,uuid,uuid,integer)') AS exclusao;"
```

O resultado deve identificar a função `delete_draft`, sem valor vazio. Após o deployment da main e a atualização do banco, recarregue a aplicação. Homologue com um preenchimento de teste: confirme cancelamento, exclusão e preservação dos demais registros.
