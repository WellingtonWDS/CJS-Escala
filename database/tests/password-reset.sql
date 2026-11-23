-- Validação da migração 013 em banco descartável (após seed.sql).
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.users(user_id,username,email,password_hash) VALUES('70000000-0000-4000-8000-000000000001','Gerente Teste','Gerente@Exemplo.test',public.crypt('senhaAntiga1',public.gen_salt('bf',4)));
INSERT INTO public.users(user_id,username,email,password_hash) VALUES('70000000-0000-4000-8000-000000000002','Sem acesso','semacesso@exemplo.test',public.crypt('x',public.gen_salt('bf',4)));
INSERT INTO cjs_private.users(id,identity_subject,name) VALUES('10000000-0000-0000-0000-000000000071','70000000-0000-4000-8000-000000000001','Gerente Teste');
INSERT INTO cjs_private.users(id,identity_subject,name) VALUES('10000000-0000-0000-0000-000000000072','70000000-0000-4000-8000-000000000002','Sem acesso');
INSERT INTO cjs_private.memberships VALUES('10000000-0000-0000-0000-000000000071','20000000-0000-0000-0000-000000000001','admin',true);
INSERT INTO cjs_private.sessions(id,user_id,expires_at) VALUES('40000000-0000-0000-0000-000000000071','10000000-0000-0000-0000-000000000071',now()+interval '1 hour');
CREATE FUNCTION pg_temp.ok(cond boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %',msg; END IF; RAISE NOTICE 'ok: %',msg; END $$;
CREATE FUNCTION pg_temp.erro(cmd text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE cmd; RETURN 'sem erro'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE||' '||SQLERRM; END $$;
CREATE TEMP TABLE r(k text PRIMARY KEY,v jsonb);
GRANT ALL ON r TO cjs_identity_gateway, cjs_authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean,text),pg_temp.erro(text) TO cjs_identity_gateway, cjs_authenticated;
SELECT set_config('request.jwt.claims','{"role":"cjs_authenticated","iss":"cjs-escala-api","aud":"cjs-postgrest","sub":"10000000-0000-0000-0000-000000000071","sid":"40000000-0000-0000-0000-000000000071"}',true);
SET LOCAL ROLE cjs_authenticated;
SELECT pg_temp.ok(pg_temp.erro($$SELECT cjs_api.password_reset_request('gerente@exemplo.test')$$) ~ '^(42501|PT403)','usuário comum não chama a função');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"cjs_identity_gateway","iss":"cjs-escala-api","aud":"cjs-postgrest","purpose":"identity","sub":"password"}',true);
SET LOCAL ROLE cjs_identity_gateway;
SELECT pg_temp.ok((cjs_api.password_reset_request('ninguem@exemplo.test')->>'send')::boolean=false,'e-mail desconhecido não envia');
SELECT pg_temp.ok((cjs_api.password_reset_request('semacesso@exemplo.test')->>'send')::boolean=false,'conta sem escritório não envia');
INSERT INTO r SELECT 'a',cjs_api.password_reset_request('  GERENTE@exemplo.test ');
SELECT pg_temp.ok((SELECT (v->>'send')::boolean AND v->>'email'='gerente@exemplo.test' AND length(v->>'token')=64 FROM r WHERE k='a'),'gera token de 64 caracteres');
INSERT INTO r SELECT 'b',cjs_api.password_reset_request('gerente@exemplo.test');
SELECT pg_temp.ok((cjs_api.password_reset_check((SELECT v->>'token' FROM r WHERE k='a'))->>'valid')::boolean=false,'novo pedido invalida o anterior');
SELECT pg_temp.ok((cjs_api.password_reset_check((SELECT v->>'token' FROM r WHERE k='b'))->>'valid')::boolean,'token atual válido');
SELECT pg_temp.ok(pg_temp.erro(format('SELECT cjs_api.password_reset_complete(%L,%L)',(SELECT v->>'token' FROM r WHERE k='b'),'curta1')) LIKE 'PT400%','senha curta recusada');
SELECT pg_temp.ok(pg_temp.erro(format('SELECT cjs_api.password_reset_complete(%L,%L)',(SELECT v->>'token' FROM r WHERE k='b'),'somenteletras')) LIKE 'PT400%','senha sem número recusada');
SELECT pg_temp.ok((cjs_api.password_reset_complete((SELECT v->>'token' FROM r WHERE k='b'),'NovaSenha2026')->>'sessionsRevoked')::int=1,'troca a senha e revoga a sessão aberta');
SELECT pg_temp.ok(pg_temp.erro(format('SELECT cjs_api.password_reset_complete(%L,%L)',(SELECT v->>'token' FROM r WHERE k='b'),'OutraSenha99')) LIKE 'PT410%','link usado não vale de novo');
SELECT pg_temp.ok(pg_temp.erro($$SELECT cjs_api.password_reset_complete('zz','OutraSenha99')$$) LIKE 'PT410%','token mal formado');
SELECT pg_temp.ok((cjs_api.password_reset_request('gerente@exemplo.test')->>'send')::boolean,'terceiro pedido na hora');
SELECT pg_temp.ok((cjs_api.password_reset_request('gerente@exemplo.test')->>'throttled')::boolean,'quarto pedido na hora é limitado');
RESET ROLE;
SELECT pg_temp.ok((SELECT password_hash=public.crypt('NovaSenha2026',password_hash) FROM public.users WHERE user_id='70000000-0000-4000-8000-000000000001'),'nova senha confere no bcrypt');
SELECT pg_temp.ok((SELECT revoked_at IS NOT NULL FROM cjs_private.sessions WHERE id='40000000-0000-0000-0000-000000000071'),'sessão revogada');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM cjs_private.password_resets WHERE token_hash=convert_to((SELECT v->>'token' FROM r WHERE k='b'),'UTF8')),'token guardado só como hash');
ROLLBACK;
