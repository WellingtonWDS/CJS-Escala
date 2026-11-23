-- Validação da migração 018 em banco descartável (após seed.sql).
\set ON_ERROR_STOP on
BEGIN;
-- Gerente A com e-mail (identidade) e Admin global para criar o plano.
INSERT INTO public.users(user_id,username,email,password_hash) VALUES('70000000-0000-4000-8000-0000000000a1','Admin A','gerente.a@exemplo.test','x');
UPDATE cjs_private.users SET identity_subject='70000000-0000-4000-8000-0000000000a1' WHERE id='10000000-0000-0000-0000-000000000001';
INSERT INTO cjs_private.users(id,identity_subject,name,platform_admin) VALUES('10000000-0000-0000-0000-000000000009','test:platform','Plataforma',true);
INSERT INTO cjs_private.sessions(id,user_id,expires_at) VALUES('40000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000009',now()+interval '1 hour');
CREATE FUNCTION pg_temp.como(n integer) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','cjs_authenticated','iss','cjs-escala-api','aud','cjs-postgrest',
  'sub',format('10000000-0000-0000-0000-%s',lpad(n::text,12,'0')),'sid',format('40000000-0000-0000-0000-%s',lpad(n::text,12,'0')))::text,true)
$$;
CREATE FUNCTION pg_temp.ok(cond boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %',msg; END IF; RAISE NOTICE 'ok: %',msg; END $$;
CREATE FUNCTION pg_temp.fila(k text) RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$ SELECT count(*)::integer FROM cjs_private.plan_notices WHERE kind=k $$;
CREATE TEMP TABLE r(k text PRIMARY KEY,v jsonb);
GRANT ALL ON r TO cjs_authenticated,cjs_identity_gateway;
GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean,text),pg_temp.como(integer),pg_temp.fila(text) TO cjs_authenticated,cjs_identity_gateway;
SET LOCAL ROLE cjs_authenticated;
-- Plano de 5 empresas iniciado há um mês (ciclo renova hoje). Escritório A tem 2 empresas ativas.
SELECT pg_temp.como(9);
SELECT cjs_api.admin_plan_save('20000000-0000-0000-0000-000000000001',NULL,'Inicial',5,50,(cjs_private.today()-interval '1 month')::date,'ativo','');
SELECT pg_temp.ok(pg_temp.fila('plano_80')=0,'40% não avisa');
SELECT pg_temp.como(1);
SELECT cjs_api.resolve_company('20000000-0000-0000-0000-000000000001','Nova Um','11222333000181',true);
SELECT cjs_api.resolve_company('20000000-0000-0000-0000-000000000001','Nova Dois','11444777000161',true);
SELECT pg_temp.ok(pg_temp.fila('plano_80')=1,'80% do plano gera aviso');
SELECT cjs_api.resolve_company('20000000-0000-0000-0000-000000000001','Nova Tres','04252011000110',true);
SELECT pg_temp.ok(pg_temp.fila('plano_100')=1,'limite atingido gera aviso');
SELECT cjs_api.plan_register_use('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','gerar',ARRAY['Ana','Bruno','Carla','Davi']);
SELECT pg_temp.ok(pg_temp.fila('plano_80')=1 AND pg_temp.fila('plano_100')=1,'aviso de uso não se repete no ciclo');
-- Troca de quadro tentada pelo operador.
SELECT pg_temp.como(4);
SELECT cjs_api.plan_register_use('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','gerar',ARRAY['Eva','Fabio','Gil','Hugo']);
SELECT cjs_api.plan_register_use('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','gerar',ARRAY['Eva','Fabio','Gil','Hugo']);
SELECT pg_temp.ok(pg_temp.fila('troca')=1,'troca de quadro gera um aviso por empresa e dia');
-- Envio pelo backend.
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"cjs_identity_gateway","iss":"cjs-escala-api","aud":"cjs-postgrest","purpose":"identity","sub":"notices"}',true);
SET LOCAL ROLE cjs_identity_gateway;
INSERT INTO r SELECT 'p',cjs_api.plan_notices_pending(50);
SELECT pg_temp.ok((SELECT jsonb_array_length(v)=4 FROM r WHERE k='p'),'pendentes: 80%, 100%, troca e renovação do ciclo');
SELECT pg_temp.ok((SELECT bool_and(x->'recipients'->0->>'email'='gerente.a@exemplo.test') FROM r, jsonb_array_elements(v) x WHERE k='p'),'destinatário é o Gerente do escritório');
SELECT pg_temp.ok((SELECT x->>'companyName'='Empresa A' AND (x->'details'->>'novos')::int=4 AND x->'details'->>'actor'='Editor A' FROM r, jsonb_array_elements(v) x WHERE k='p' AND x->>'kind'='troca'),'aviso de troca traz empresa, novos e quem tentou');
SELECT pg_temp.ok((SELECT (x->'plan'->>'capacity')::int=5 FROM r, jsonb_array_elements(v) x WHERE k='p' AND x->>'kind'='ciclo'),'aviso de ciclo traz o plano');
SELECT pg_temp.ok(jsonb_array_length(cjs_api.plan_notices_pending(50))=0,'em envio não sai de novo por 10 minutos');
SELECT pg_temp.ok((cjs_api.plan_notices_done(ARRAY(SELECT (x->>'id')::uuid FROM r, jsonb_array_elements(v) x WHERE k='p'))->>'sent')::int=4,'marca como enviados');
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)=0 FROM cjs_private.plan_notices WHERE sent_at IS NULL),'fila vazia');
SELECT set_config('request.jwt.claims','{"role":"cjs_identity_gateway","iss":"cjs-escala-api","aud":"cjs-postgrest","purpose":"identity","sub":"notices"}',true);
SET LOCAL ROLE cjs_identity_gateway;
SELECT pg_temp.ok(jsonb_array_length(cjs_api.plan_notices_pending(50))=0,'renovação não se repete no mesmo ciclo');
RESET ROLE;
SELECT pg_temp.como(1);
SET LOCAL ROLE cjs_authenticated;
SELECT pg_temp.ok((SELECT has_function_privilege('cjs_authenticated','cjs_api.plan_notices_pending(integer)','EXECUTE'))=false,'usuário comum não lê a fila');
ROLLBACK;
