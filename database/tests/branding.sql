-- Validação da migração 012 em banco descartável (após seed.sql).
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.como(n integer) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','cjs_authenticated','iss','cjs-escala-api','aud','cjs-postgrest',
  'sub',format('10000000-0000-0000-0000-%s',lpad(n::text,12,'0')),'sid',format('40000000-0000-0000-0000-%s',lpad(n::text,12,'0')))::text,true)
$$;
CREATE FUNCTION pg_temp.ok(cond boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %',msg; END IF; RAISE NOTICE 'ok: %',msg; END $$;
CREATE FUNCTION pg_temp.erro(cmd text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE cmd; RETURN 'sem erro'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE||' '||SQLERRM; END $$;
GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean,text),pg_temp.como(integer),pg_temp.erro(text) TO cjs_authenticated;
SET LOCAL ROLE cjs_authenticated;
SELECT pg_temp.como(2);
SELECT pg_temp.ok((cjs_api.office_branding_get('20000000-0000-0000-0000-000000000001')->>'revision')::int=0,'padrão sem marca');
SELECT pg_temp.ok(NOT (cjs_api.office_branding_get('20000000-0000-0000-0000-000000000001')->>'canEdit')::boolean,'consulta não edita');
SELECT pg_temp.ok(pg_temp.erro($$SELECT cjs_api.office_branding_save('20000000-0000-0000-0000-000000000001',0,'X',NULL,NULL,NULL,'#112233','#445566')$$) LIKE 'PT403%','consulta não salva');
SELECT pg_temp.como(1);
SELECT pg_temp.ok(cjs_api.office_branding_save('20000000-0000-0000-0000-000000000001',0,' Contábil A ','data:image/png;base64,iVBORw0KGgo=',600,200,'#112233','#445566')->>'displayName'='Contábil A','gerente salva marca');
SELECT pg_temp.ok(pg_temp.erro($$SELECT cjs_api.office_branding_save('20000000-0000-0000-0000-000000000001',0,'X',NULL,NULL,NULL,'#112233','#445566')$$) LIKE 'PT409%','revisão protege');
SELECT pg_temp.ok(pg_temp.erro($$SELECT cjs_api.office_branding_save('20000000-0000-0000-0000-000000000001',1,'X','data:image/svg+xml;base64,AAAA',10,10,'#112233','#445566')$$) LIKE 'PT400%','só PNG');
SELECT pg_temp.ok(pg_temp.erro($$SELECT cjs_api.office_branding_save('20000000-0000-0000-0000-000000000001',1,'X',NULL,NULL,NULL,'red','#445566')$$) LIKE 'PT400%','cor em hexadecimal');
SELECT pg_temp.ok(cjs_api.office_branding_save('20000000-0000-0000-0000-000000000001',1,NULL,NULL,NULL,NULL,'#112233','#445566')->'logo'='null'::jsonb,'remove logomarca');
SELECT pg_temp.como(2);
SELECT pg_temp.ok(cjs_api.office_branding_get('20000000-0000-0000-0000-000000000001')->>'primaryColor'='#112233','consulta lê a marca');
SELECT pg_temp.como(3);
SELECT pg_temp.ok(pg_temp.erro($$SELECT cjs_api.office_branding_get('20000000-0000-0000-0000-000000000001')$$) LIKE 'PT403%','outro escritório isolado');
ROLLBACK;
