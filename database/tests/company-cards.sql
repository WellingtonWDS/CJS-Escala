-- Validação da migração 011 em banco descartável (após seed.sql).
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.como(n integer) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','cjs_authenticated','iss','cjs-escala-api','aud','cjs-postgrest',
  'sub',format('10000000-0000-0000-0000-%s',lpad(n::text,12,'0')),'sid',format('40000000-0000-0000-0000-%s',lpad(n::text,12,'0')))::text,true)
$$;
CREATE FUNCTION pg_temp.ok(cond boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %',msg; END IF; RAISE NOTICE 'ok: %',msg; END $$;
GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean,text),pg_temp.como(integer) TO cjs_authenticated;
SET LOCAL ROLE cjs_authenticated;
SELECT pg_temp.como(1);
SELECT cjs_api.save_draft('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',NULL,NULL,gen_random_uuid(),'Escala de dezembro',
 '{"colaboradores":[{"nome":"Ana"},{"nome":"Bruno"},{"nome":"Carla"}],"conversao":{"x":1}}');
SELECT pg_temp.ok(jsonb_array_length(cjs_api.company_cards()->'companies')=2,'gerente vê as 2 empresas do escritório');
SELECT pg_temp.ok((SELECT (c->>'drafts')::int=1 AND (c->'latest'->>'employees')::int=3 AND (c->'latest'->>'hasResult')::boolean AND c->'latest'->>'updatedBy'='Admin A'
 FROM jsonb_array_elements(cjs_api.company_cards()->'companies') c WHERE c->>'id'='30000000-0000-0000-0000-000000000001'),'resumo do preenchimento');
SELECT pg_temp.ok((cjs_api.company_cards()->'offices'->0->>'canCreate')::boolean,'gerente pode cadastrar');
SELECT pg_temp.como(2);
SELECT pg_temp.ok(jsonb_array_length(cjs_api.company_cards()->'companies')=1,'consulta vê só a empresa autorizada');
SELECT pg_temp.ok(cjs_api.company_cards()->'offices'->0->'plan'='null'::jsonb,'consulta não vê o plano');
SELECT pg_temp.como(3);
SELECT pg_temp.ok((SELECT bool_and(c->>'officeId'='20000000-0000-0000-0000-000000000002') FROM jsonb_array_elements(cjs_api.company_cards()->'companies') c),'outro escritório isolado');
ROLLBACK;
