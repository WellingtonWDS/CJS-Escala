-- Entrada administrativa para ambientes com 001/002 já aplicadas.
-- Inclui 003/004/005 apenas se ainda ausentes, e autoriza a identidade explicitamente informada.
\set ON_ERROR_STOP on
SELECT to_regclass('cjs_private.admin_provision_log') IS NOT NULL AS has_003,
 EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='cjs_private' AND table_name='users' AND column_name='platform_admin') AS has_004,
 EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='cjs_private' AND table_name='companies' AND column_name='cnpj') AS has_005
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
\ir promote-platform-admin.sql
