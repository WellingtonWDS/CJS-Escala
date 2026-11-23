-- Validação da migração 016 em banco descartável (após seed.sql).
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.users(user_id,username,email,password_hash) VALUES('70000000-0000-4000-8000-000000000011','Pessoa','Pessoa@Exemplo.test',public.crypt('SenhaAtual1',public.gen_salt('bf',4)));
INSERT INTO cjs_private.users(id,identity_subject,name) VALUES('10000000-0000-0000-0000-000000000081','70000000-0000-4000-8000-000000000011','Pessoa');
INSERT INTO cjs_private.memberships VALUES('10000000-0000-0000-0000-000000000081','20000000-0000-0000-0000-000000000001','editor',true);
INSERT INTO cjs_private.sessions(id,user_id,expires_at) VALUES('40000000-0000-0000-0000-000000000081','10000000-0000-0000-0000-000000000081',now()+interval '1 hour'),
 ('40000000-0000-0000-0000-000000000082','10000000-0000-0000-0000-000000000081',now()+interval '1 hour');
CREATE FUNCTION pg_temp.ok(cond boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %',msg; END IF; RAISE NOTICE 'ok: %',msg; END $$;
CREATE FUNCTION pg_temp.erro(cmd text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE cmd; RETURN 'sem erro'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE||' '||SQLERRM; END $$;
GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean,text),pg_temp.erro(text) TO cjs_authenticated;
SELECT set_config('request.jwt.claims','{"role":"cjs_authenticated","iss":"cjs-escala-api","aud":"cjs-postgrest","sub":"10000000-0000-0000-0000-000000000081","sid":"40000000-0000-0000-0000-000000000081"}',true);
SET LOCAL ROLE cjs_authenticated;
SELECT pg_temp.ok(cjs_api.change_own_password('errada1','NovaSenha2026')->>'reason'='senha_atual','senha atual errada é recusada');
SELECT pg_temp.ok(pg_temp.erro($$SELECT cjs_api.change_own_password('SenhaAtual1','curta1')$$) LIKE 'PT400%','nova senha fraca recusada');
SELECT pg_temp.ok(pg_temp.erro($$SELECT cjs_api.change_own_password('SenhaAtual1','SenhaAtual1')$$) LIKE 'PT400%','nova senha igual à atual recusada');
SELECT pg_temp.ok((cjs_api.change_own_password('SenhaAtual1','NovaSenha2026')->>'sessionsRevoked')::int=1,'troca a senha e encerra só as outras sessões');
RESET ROLE;
SELECT pg_temp.ok((SELECT password_hash=public.crypt('NovaSenha2026',password_hash) FROM public.users WHERE user_id='70000000-0000-4000-8000-000000000011'),'nova senha vale no login');
SELECT pg_temp.ok((SELECT revoked_at IS NULL FROM cjs_private.sessions WHERE id='40000000-0000-0000-0000-000000000081'),'sessão atual continua');
SELECT pg_temp.ok((SELECT revoked_at IS NOT NULL FROM cjs_private.sessions WHERE id='40000000-0000-0000-0000-000000000082'),'outra sessão encerrada');
SET LOCAL ROLE cjs_authenticated;
SELECT cjs_api.change_own_password('errada'||n,'OutraSenha99') FROM generate_series(1,5) n;
SELECT pg_temp.ok(pg_temp.erro($$SELECT cjs_api.change_own_password('NovaSenha2026','OutraSenha99')$$) LIKE 'PT429%','5 erros bloqueiam por 15 minutos, mesmo com a senha certa');
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
SET LOCAL ROLE cjs_authenticated;
SELECT pg_temp.ok(pg_temp.erro($$SELECT cjs_api.change_own_password('a','NovaSenha2026')$$) LIKE 'PT401%','exige sessão');
ROLLBACK;
