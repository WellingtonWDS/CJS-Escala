-- Entrada administrativa para ambientes com 001/002 já aplicadas.
-- Inclui 003–008 apenas se ainda ausentes, e autoriza a identidade explicitamente informada.
\set ON_ERROR_STOP on
SELECT to_regclass('cjs_private.admin_provision_log') IS NOT NULL AS has_003,
 EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='cjs_private' AND table_name='users' AND column_name='platform_admin') AS has_004,
 EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='cjs_private' AND table_name='companies' AND column_name='cnpj') AS has_005,
 to_regprocedure('cjs_api.create_office(text)') IS NOT NULL AS has_006,
 to_regprocedure('cjs_api.delete_draft(uuid,uuid,uuid,integer)') IS NOT NULL AS has_007,
 to_regprocedure('cjs_api.manage_update_user(uuid,uuid,integer,text,text,text,boolean,boolean,uuid[])') IS NOT NULL AS has_008
\gset
\if :has_003
\else
\ir migrations/003_admin_provisioning.sql
\endif
\if :has_004
\else
\ir migrations/004_roles_and_user_management.sql
\endif
\if :has_005
\else
\ir migrations/005_company_registry.sql
\endif
\if :has_006
\else
\ir migrations/006_registry_management.sql
\endif
\if :has_007
\else
\ir migrations/007_delete_drafts.sql
\endif
\if :has_008
\else
\ir migrations/008_users_directory.sql
\endif
\ir promote-platform-admin.sql
