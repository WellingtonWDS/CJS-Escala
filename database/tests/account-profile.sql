-- Validação da migração 019 em banco descartável (após seed.sql).
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.users(user_id,username,email,password_hash) VALUES('70000000-0000-4000-8000-000000000021','Pessoa','pessoa@exemplo.test',public.crypt('SenhaAtual1',public.gen_salt('bf',4))),
 ('70000000-0000-4000-8000-000000000022','Outra','ocupado@exemplo.test','x');
INSERT INTO cjs_private.users(id,identity_subject,name) VALUES('10000000-0000-0000-0000-000000000083','70000000-0000-4000-8000-000000000021','Pessoa');
INSERT INTO cjs_private.memberships VALUES('10000000-0000-0000-0000-000000000083','20000000-0000-0000-0000-000000000001','editor',true);
INSERT INTO cjs_private.sessions(id,user_id,expires_at) VALUES('40000000-0000-0000-0000-000000000083','10000000-0000-0000-0000-000000000083',now()+interval '1 hour');
CREATE FUNCTION pg_temp.ok(cond boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %',msg; END IF; RAISE NOTICE 'ok: %',msg; END $$;
CREATE FUNCTION pg_temp.erro(cmd text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE cmd; RETURN 'sem erro'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE||' '||SQLERRM; END $$;
CREATE TEMP TABLE r(k text PRIMARY KEY,v jsonb);
GRANT ALL ON r TO cjs_authenticated,cjs_identity_gateway;
GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean,text),pg_temp.erro(text) TO cjs_authenticated,cjs_identity_gateway;
SELECT set_config('request.jwt.claims','{"role":"cjs_authenticated","iss":"cjs-escala-api","aud":"cjs-postgrest","sub":"10000000-0000-0000-0000-000000000083","sid":"40000000-0000-0000-0000-000000000083"}',true);
SET LOCAL ROLE cjs_authenticated;
SELECT pg_temp.ok(cjs_api.my_account()->>'email'='pessoa@exemplo.test','consulta a própria conta');
SELECT pg_temp.ok(cjs_api.update_own_name('  Pessoa Renomeada ')->>'name'='Pessoa Renomeada','edita o próprio nome');
SELECT pg_temp.ok(pg_temp.erro($$SELECT cjs_api.update_own_name('x')$$) LIKE 'PT400%','nome curto recusado');
SELECT pg_temp.ok(cjs_api.request_email_change('novo@exemplo.test','errada')->>'reason'='senha_atual','troca exige a senha atual');
SELECT pg_temp.ok(pg_temp.erro($$SELECT cjs_api.request_email_change('ocupado@exemplo.test','SenhaAtual1')$$) LIKE 'PT409%','e-mail de outra conta recusado');
SELECT pg_temp.ok(pg_temp.erro($$SELECT cjs_api.request_email_change('PESSOA@exemplo.test','SenhaAtual1')$$) LIKE 'PT400%','mesmo e-mail recusado');
INSERT INTO r SELECT 'a',cjs_api.request_email_change(' Novo@Exemplo.test ','SenhaAtual1');
SELECT pg_temp.ok((SELECT v->>'newEmail'='novo@exemplo.test' AND v->>'oldEmail'='pessoa@exemplo.test' AND length(v->>'token')=64 FROM r WHERE k='a'),'pedido gera link para o endereço novo');
SELECT pg_temp.ok(cjs_api.my_account()->>'pendingEmail'='novo@exemplo.test' AND cjs_api.my_account()->>'email'='pessoa@exemplo.test','e-mail atual continua até confirmar');
INSERT INTO r SELECT 'b',cjs_api.request_email_change('novo2@exemplo.test','SenhaAtual1');
SELECT pg_temp.ok(pg_temp.erro(format('SELECT cjs_api.confirm_email_change(%L)',(SELECT v->>'token' FROM r WHERE k='b'))) ~ '^(42501|PT403)','usuário não confirma sem o serviço');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"cjs_identity_gateway","iss":"cjs-escala-api","aud":"cjs-postgrest","purpose":"identity","sub":"account"}',true);
SET LOCAL ROLE cjs_identity_gateway;
SELECT pg_temp.ok(pg_temp.erro(format('SELECT cjs_api.confirm_email_change(%L)',(SELECT v->>'token' FROM r WHERE k='a'))) LIKE 'PT410%','novo pedido cancela o anterior');
SELECT pg_temp.ok(cjs_api.confirm_email_change((SELECT v->>'token' FROM r WHERE k='b'))->>'newEmail'='novo2@exemplo.test','confirmação troca o e-mail');
SELECT pg_temp.ok(pg_temp.erro(format('SELECT cjs_api.confirm_email_change(%L)',(SELECT v->>'token' FROM r WHERE k='b'))) LIKE 'PT410%','link usado não vale de novo');
RESET ROLE;
SELECT pg_temp.ok((SELECT email='novo2@exemplo.test' AND username='Pessoa Renomeada' FROM public.users WHERE user_id='70000000-0000-4000-8000-000000000021'),'login passa a usar o novo e-mail e o novo nome');
ROLLBACK;
