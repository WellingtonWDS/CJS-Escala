-- Validação da migração 014 em banco descartável (após seed.sql).
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.como(n integer) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','cjs_authenticated','iss','cjs-escala-api','aud','cjs-postgrest',
  'sub',format('10000000-0000-0000-0000-%s',lpad(n::text,12,'0')),'sid',format('40000000-0000-0000-0000-%s',lpad(n::text,12,'0')))::text,true)
$$;
CREATE FUNCTION pg_temp.gateway() RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims','{"role":"cjs_identity_gateway","iss":"cjs-escala-api","aud":"cjs-postgrest","purpose":"identity","sub":"password"}',true)
$$;
CREATE FUNCTION pg_temp.ok(cond boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %',msg; END IF; RAISE NOTICE 'ok: %',msg; END $$;
CREATE FUNCTION pg_temp.erro(cmd text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE cmd; RETURN 'sem erro'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE||' '||SQLERRM; END $$;
CREATE TEMP TABLE r(k text PRIMARY KEY,v jsonb);
GRANT ALL ON r TO cjs_authenticated,cjs_identity_gateway;
GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean,text),pg_temp.erro(text),pg_temp.como(integer),pg_temp.gateway() TO cjs_authenticated,cjs_identity_gateway;
SET LOCAL ROLE cjs_authenticated;
-- Operador não convida; gerente convida sem senha.
SELECT pg_temp.como(4);
SELECT pg_temp.ok(pg_temp.erro($$SELECT cjs_api.manage_invite_user('Novo','novo@exemplo.test','20000000-0000-0000-0000-000000000001','operator',ARRAY['30000000-0000-0000-0000-000000000001']::uuid[])$$) LIKE 'PT403%','operador não convida');
SELECT pg_temp.como(1);
INSERT INTO r SELECT 'convite',cjs_api.manage_invite_user(' Nova Pessoa ',' Nova@Exemplo.test ','20000000-0000-0000-0000-000000000001','operator',ARRAY['30000000-0000-0000-0000-000000000001']::uuid[]);
SELECT pg_temp.ok((SELECT v->'mail'->>'kind'='invite' AND v->'mail'->>'email'='nova@exemplo.test' AND v->'mail'->>'officeName'='Escritório A' AND v->'mail'->>'invitedBy'='Admin A' AND length(v->'mail'->>'token')=64 AND (v->'mail'->>'expiresMinutes')::int=10080 FROM r WHERE k='convite'),'convite com link de 7 dias');
SELECT pg_temp.ok(pg_temp.erro($$SELECT cjs_api.manage_invite_user('Outra','NOVA@exemplo.test','20000000-0000-0000-0000-000000000001','manager','{}'::uuid[])$$) LIKE 'PT409%','e-mail repetido');
SELECT pg_temp.ok(pg_temp.erro($$SELECT cjs_api.manage_invite_user('Op','op@exemplo.test','20000000-0000-0000-0000-000000000001','operator','{}'::uuid[])$$) LIKE 'PT400%','operador precisa de empresa');
SELECT pg_temp.ok(pg_temp.erro($$SELECT cjs_api.manage_invite_user('Adm','adm@exemplo.test','20000000-0000-0000-0000-000000000001','admin','{}'::uuid[])$$) LIKE 'PT403%','gerente não cria Admin global');
SELECT pg_temp.ok(jsonb_array_length(cjs_api.manage_pending_invites())=1,'convite pendente listado');
-- Reenvio gera novo link e cancela o anterior.
INSERT INTO r SELECT 'reenvio',cjs_api.manage_send_access_link((SELECT (v->'user'->>'id')::uuid FROM r WHERE k='convite'),'20000000-0000-0000-0000-000000000001');
SELECT pg_temp.ok((SELECT v->>'kind'='invite' FROM r WHERE k='reenvio'),'reenvio de quem nunca entrou é convite');
SELECT pg_temp.como(3);
SELECT pg_temp.ok(pg_temp.erro(format('SELECT cjs_api.manage_send_access_link(%L,%L)',(SELECT v->'user'->>'id' FROM r WHERE k='convite'),'20000000-0000-0000-0000-000000000002')) LIKE 'PT403%','gerente de outro escritório não reenvia');
SELECT pg_temp.ok(jsonb_array_length(cjs_api.manage_pending_invites())=0,'outro escritório não vê o convite');
RESET ROLE;
-- A conta convidada não entra antes de criar a senha.
SELECT pg_temp.ok((SELECT password_hash<>public.crypt('',password_hash) FROM public.users WHERE lower(email)='nova@exemplo.test'),'senha inicial inutilizável');
SET LOCAL ROLE cjs_identity_gateway;
SELECT pg_temp.gateway();
SELECT pg_temp.ok((cjs_api.password_reset_check((SELECT v->'mail'->>'token' FROM r WHERE k='convite'))->>'valid')::boolean=false,'link do primeiro convite cancelado');
SELECT pg_temp.ok((SELECT x->>'kind'='invite' AND x->>'officeName'='Escritório A' AND (x->>'valid')::boolean FROM (SELECT cjs_api.password_reset_check((SELECT v->>'token' FROM r WHERE k='reenvio')) x) y),'página reconhece convite');
SELECT pg_temp.ok((cjs_api.password_reset_complete((SELECT v->>'token' FROM r WHERE k='reenvio'),'MinhaSenha2026')->>'kind')='invite','pessoa cria a própria senha');
RESET ROLE;
SELECT pg_temp.ok((SELECT password_hash=public.crypt('MinhaSenha2026',password_hash) FROM public.users WHERE lower(email)='nova@exemplo.test'),'senha criada vale no login');
SET LOCAL ROLE cjs_authenticated;
SELECT pg_temp.como(1);
SELECT pg_temp.ok(jsonb_array_length(cjs_api.manage_pending_invites())=0,'convite aceito sai da lista');
-- Para quem já usa o sistema, o gerente envia redefinição (24 h).
RESET ROLE;
INSERT INTO cjs_private.sessions(user_id,expires_at) SELECT (v->'user'->>'id')::uuid,now()+interval '1 hour' FROM r WHERE k='convite';
SET LOCAL ROLE cjs_authenticated;
SELECT pg_temp.como(1);
SELECT pg_temp.ok(cjs_api.manage_send_access_link((SELECT (v->'user'->>'id')::uuid FROM r WHERE k='convite'),'20000000-0000-0000-0000-000000000001')->>'kind'='reset','quem já entrou recebe redefinição');
SELECT pg_temp.ok((cjs_api.manage_send_access_link((SELECT (v->'user'->>'id')::uuid FROM r WHERE k='convite'),'20000000-0000-0000-0000-000000000001')->>'expiresMinutes')::int=1440,'redefinição pelo gerente vale 24 h');
SELECT pg_temp.ok(pg_temp.erro($$SELECT cjs_api.manage_send_access_link('10000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000001')$$) LIKE 'PT400%','conta sem e-mail é recusada');
ROLLBACK;
