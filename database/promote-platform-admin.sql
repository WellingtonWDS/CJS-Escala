-- Uso administrativo, uma vez para autorizar o proprietário. Nunca uma RPC pública.
-- psql -v identity_subject='ID_DO_PROVEDOR' -f database/promote-platform-admin.sql
BEGIN;
SELECT set_config('cjs.bootstrap_subject', :'identity_subject', true);
DO $$
DECLARE affected integer;
BEGIN
 UPDATE cjs_private.users SET platform_admin=true
 WHERE identity_subject=current_setting('cjs.bootstrap_subject') AND active;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>1 THEN RAISE EXCEPTION 'Não foi encontrada uma única conta ativa para essa identidade.'; END IF;
END $$;
SELECT id,name,platform_admin FROM cjs_private.users WHERE identity_subject=:'identity_subject';
COMMIT;
