-- Validação da migração 017 em banco descartável (após seed.sql).
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO cjs_private.users(id,identity_subject,name,platform_admin) VALUES('10000000-0000-0000-0000-000000000009','test:platform','Plataforma',true),
 ('10000000-0000-0000-0000-000000000091','test:admin2','Admin Dois',true);
INSERT INTO cjs_private.sessions(id,user_id,expires_at) VALUES('40000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000009',now()+interval '1 hour');
CREATE FUNCTION pg_temp.como(n integer) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','cjs_authenticated','iss','cjs-escala-api','aud','cjs-postgrest',
  'sub',format('10000000-0000-0000-0000-%s',lpad(n::text,12,'0')),'sid',format('40000000-0000-0000-0000-%s',lpad(n::text,12,'0')))::text,true)
$$;
CREATE FUNCTION pg_temp.ok(cond boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %',msg; END IF; RAISE NOTICE 'ok: %',msg; END $$;
CREATE FUNCTION pg_temp.erro(cmd text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE cmd; RETURN 'sem erro'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE||' '||SQLERRM; END $$;
CREATE FUNCTION pg_temp.rev(u uuid) RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$ SELECT management_revision FROM cjs_private.users WHERE id=u $$;
GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean,text),pg_temp.erro(text),pg_temp.como(integer),pg_temp.rev(uuid) TO cjs_authenticated;
SET LOCAL ROLE cjs_authenticated;
SELECT pg_temp.como(1);
SELECT pg_temp.ok(pg_temp.erro($$SELECT cjs_api.manage_move_user('10000000-0000-0000-0000-000000000004',1,'20000000-0000-0000-0000-000000000002','operator',ARRAY['30000000-0000-0000-0000-000000000002']::uuid[])$$) LIKE 'PT403%','gerente não muda escritório');
SELECT pg_temp.como(9);
-- Operador do Escritório A vai para o B.
SELECT pg_temp.ok((cjs_api.manage_move_user('10000000-0000-0000-0000-000000000004',pg_temp.rev('10000000-0000-0000-0000-000000000004'),'20000000-0000-0000-0000-000000000002','operator',ARRAY['30000000-0000-0000-0000-000000000002']::uuid[])->>'officeId')='20000000-0000-0000-0000-000000000002','operador movido para outro escritório');
SELECT pg_temp.ok(pg_temp.erro(format($$SELECT cjs_api.manage_move_user('10000000-0000-0000-0000-000000000004',%s,'20000000-0000-0000-0000-000000000001','operator',ARRAY['30000000-0000-0000-0000-000000000002']::uuid[])$$,pg_temp.rev('10000000-0000-0000-0000-000000000004'))) LIKE 'PT400%','empresas precisam ser do escritório de destino');
SELECT pg_temp.ok(pg_temp.erro(format($$SELECT cjs_api.manage_move_user('10000000-0000-0000-0000-000000000091',%s,NULL,'operator','{}'::uuid[])$$,pg_temp.rev('10000000-0000-0000-0000-000000000091'))) LIKE 'PT400%','Admin rebaixado precisa de escritório');
-- Admin sem escritório vira Gerente do Escritório A.
SELECT pg_temp.ok((cjs_api.manage_move_user('10000000-0000-0000-0000-000000000091',pg_temp.rev('10000000-0000-0000-0000-000000000091'),'20000000-0000-0000-0000-000000000001','manager','{}'::uuid[])->>'ok')::boolean,'Admin vira Gerente com escritório');
SELECT pg_temp.ok(pg_temp.erro(format($$SELECT cjs_api.manage_move_user('10000000-0000-0000-0000-000000000009',%s,'20000000-0000-0000-0000-000000000001','operator',ARRAY['30000000-0000-0000-0000-000000000001']::uuid[])$$,pg_temp.rev('10000000-0000-0000-0000-000000000009'))) LIKE 'PT400%','não altera o próprio perfil');
SELECT pg_temp.ok(pg_temp.erro($$SELECT cjs_api.manage_move_user('10000000-0000-0000-0000-000000000004',1,'20000000-0000-0000-0000-000000000001','operator',ARRAY['30000000-0000-0000-0000-000000000001']::uuid[])$$) LIKE 'PT409%','revisão protege');
-- Gerente volta a ser Admin global.
SELECT pg_temp.ok((cjs_api.manage_move_user('10000000-0000-0000-0000-000000000091',pg_temp.rev('10000000-0000-0000-0000-000000000091'),NULL,'admin','{}'::uuid[])->>'officeId') IS NULL,'promove a Admin sem escritório');
RESET ROLE;
SELECT pg_temp.ok((SELECT m.active AND m.role='editor' FROM cjs_private.memberships m WHERE user_id='10000000-0000-0000-0000-000000000004' AND office_id='20000000-0000-0000-0000-000000000002'),'vínculo ativo no destino');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM cjs_private.memberships WHERE user_id='10000000-0000-0000-0000-000000000004' AND office_id='20000000-0000-0000-0000-000000000001'),'vínculo anterior removido');
SELECT pg_temp.ok((SELECT count(*)>=1 FROM cjs_private.user_change_log WHERE user_id='10000000-0000-0000-0000-000000000004' AND after_data->>'moved'='true'),'mudança registrada no histórico');
SELECT pg_temp.ok((SELECT array_agg(company_id)=ARRAY['30000000-0000-0000-0000-000000000002']::uuid[] FROM cjs_private.company_access WHERE user_id='10000000-0000-0000-0000-000000000004'),'empresas só do destino');
SELECT pg_temp.ok((SELECT platform_admin AND NOT EXISTS(SELECT 1 FROM cjs_private.memberships WHERE user_id=u.id AND active) FROM cjs_private.users u WHERE id='10000000-0000-0000-0000-000000000091'),'Admin sem vínculos ativos');
-- O operador movido enxerga a empresa do novo escritório.
SET LOCAL ROLE cjs_authenticated;
SELECT pg_temp.como(4);
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM jsonb_array_elements(cjs_api.company_options()->'companies') c WHERE c->>'id'='30000000-0000-0000-0000-000000000002'),'operador acessa a empresa do novo escritório');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(cjs_api.company_options()->'companies') c WHERE c->>'id'='30000000-0000-0000-0000-000000000001'),'e não a do escritório anterior');
ROLLBACK;
