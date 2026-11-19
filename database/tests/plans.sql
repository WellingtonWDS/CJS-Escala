-- Validação da migração 010 em banco descartável (após seed.sql). Simula as claims do PostgREST.
\set ON_ERROR_STOP on
BEGIN;
-- Admin global de teste e escritório DEMO.
INSERT INTO cjs_private.users(id,identity_subject,name,platform_admin) VALUES('10000000-0000-0000-0000-000000000009','test:platform','Plataforma',true);
INSERT INTO cjs_private.sessions(id,user_id,expires_at) VALUES('40000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000009',now()+interval '1 hour');
INSERT INTO cjs_private.offices(id,name,demo) VALUES('de000000-0000-4000-8000-000000000001','DEMO',true) ON CONFLICT(id) DO UPDATE SET demo=true;
INSERT INTO cjs_private.memberships VALUES('10000000-0000-0000-0000-000000000001','de000000-0000-4000-8000-000000000001','admin',true);
CREATE FUNCTION pg_temp.como(n integer) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','cjs_authenticated','iss','cjs-escala-api','aud','cjs-postgrest',
  'sub',format('10000000-0000-0000-0000-%s',lpad(n::text,12,'0')),'sid',format('40000000-0000-0000-0000-%s',lpad(n::text,12,'0')))::text,true)
$$;
CREATE FUNCTION pg_temp.ok(cond boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %',msg; END IF; RAISE NOTICE 'ok: %',msg; END $$;
CREATE FUNCTION pg_temp.erro(cmd text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE cmd; RETURN 'sem erro'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE||' '||SQLERRM; END $$;
GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean,text),pg_temp.erro(text),pg_temp.como(integer) TO cjs_authenticated;
CREATE TEMP TABLE r(k text PRIMARY KEY,v jsonb);
GRANT ALL ON r TO cjs_authenticated;
SET LOCAL ROLE cjs_authenticated;

-- DEMO visível só para Admin global.
SELECT pg_temp.como(1);
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM cjs_api.list_offices() x WHERE x->>'name'='DEMO'),'gerente com vínculo não vê DEMO');
SELECT pg_temp.como(9);
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM cjs_api.list_offices() x WHERE x->>'name'='DEMO'),'Admin vê DEMO');
-- Sem plano: liberado, sem limite.
SELECT pg_temp.como(1);
SELECT pg_temp.ok(cjs_api.plan_register_use('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','gerar',ARRAY['Ana','Bruno'])->>'status'='liberado','sem plano libera');
SELECT pg_temp.ok((cjs_api.plan_status('20000000-0000-0000-0000-000000000001')->>'limited')::boolean=false,'status sem limite');
SELECT pg_temp.ok(pg_temp.erro($$SELECT cjs_api.admin_plans_overview()$$) LIKE 'PT403%','gerente não acessa painel Admin');
-- Admin cria plano de 3 empresas iniciado hoje.
SELECT pg_temp.como(9);
SELECT pg_temp.ok((cjs_api.admin_plan_save('20000000-0000-0000-0000-000000000001',NULL,'Inicial',3,5,cjs_private.today(),'ativo','teste')->>'companyLimit')::integer=3,'Admin salva plano');
SELECT pg_temp.ok(pg_temp.erro($$SELECT cjs_api.admin_plan_save('20000000-0000-0000-0000-000000000001',NULL,'X',3,5,current_date,'ativo','')$$) LIKE 'PT409%','revisão protege plano');
SELECT pg_temp.ok((cjs_api.admin_plans_overview()->'offices'->0) ? 'plan','visão geral');
-- Escritório A tem 2 empresas ativas → 2 de 3.
SELECT pg_temp.como(1);
SELECT pg_temp.ok((cjs_api.plan_status('20000000-0000-0000-0000-000000000001')->>'used')::integer=2,'2 de 3 em uso');
SELECT pg_temp.ok(cjs_api.plan_register_use('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','gerar',ARRAY['Ana','Bruno','Carla','Davi'])->>'status'='liberado','2/3 libera (abaixo de 80%)');
SELECT pg_temp.ok((SELECT (x->>'cnpjLocked')::boolean FROM cjs_api.list_companies('20000000-0000-0000-0000-000000000001') x WHERE x->>'id'='30000000-0000-0000-0000-000000000001'),'primeiro uso trava CNPJ');
-- Limite de colaboradores (5).
SELECT pg_temp.ok(cjs_api.plan_register_use('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','gerar',ARRAY['a','b','c','d','e','f'])->>'reason'='colaboradores','limite de colaboradores bloqueia');
-- Nova empresa: 3/3 e depois bloqueio.
SELECT pg_temp.ok(cjs_api.resolve_company('20000000-0000-0000-0000-000000000001','Nova Ltda','11222333000181',true)->>'status'='created','cria 3ª empresa');
INSERT INTO r SELECT 'nova',cjs_api.resolve_company('20000000-0000-0000-0000-000000000001','Nova Ltda','11222333000181')->'company';
SELECT pg_temp.ok((cjs_api.resolve_company('20000000-0000-0000-0000-000000000001','Outra Ltda','11444777000161')->>'limitReached')::boolean,'prévia informa limite');
SELECT pg_temp.ok(pg_temp.erro($$SELECT cjs_api.resolve_company('20000000-0000-0000-0000-000000000001','Outra Ltda','11444777000161',true)$$) LIKE 'PT402%','4ª empresa bloqueada');
SELECT pg_temp.ok(cjs_api.plan_register_use('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','gerar',ARRAY['Ana'])->>'status'='aviso','aviso com 3/3');
-- Troca de quadro: 4 nomes base; 4 novos → confirmação.
SELECT pg_temp.como(4);
INSERT INTO r SELECT 'troca',cjs_api.plan_register_use('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','gerar',ARRAY['Eva','Fabio','Gil','Hugo']);
SELECT pg_temp.ok((SELECT v->>'status'='confirmar_troca' AND NOT (v->>'canConfirm')::boolean FROM r WHERE k='troca'),'operador vê troca sem poder confirmar');
SELECT pg_temp.ok(cjs_api.plan_register_use('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','gerar',ARRAY['Eva','Fabio','Gil','Hugo'],true)->>'status'='confirmar_troca','operador não confirma');
SELECT pg_temp.ok(cjs_api.plan_register_use('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','gerar',ARRAY['Ana','Bruno','Carla','Eva'])->>'status'<>'confirmar_troca','1 nome novo não é troca');
SELECT pg_temp.como(1);
SELECT pg_temp.ok(cjs_api.plan_register_use('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','gerar',ARRAY['Eva','Fabio','Gil','Hugo'],true)->>'reason'='troca_sem_vaga','troca sem vaga bloqueia');
SELECT pg_temp.como(9);
SELECT pg_temp.ok((cjs_api.admin_plan_courtesy('20000000-0000-0000-0000-000000000001',1,'teste')->>'capacity')::integer=4,'cortesia amplia');
SELECT pg_temp.como(1);
SELECT pg_temp.ok((cjs_api.plan_register_use('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','gerar',ARRAY['Eva','Fabio','Gil','Hugo'],true)->>'swapConfirmed')::boolean,'gerente confirma troca');
SELECT pg_temp.ok((cjs_api.plan_status('20000000-0000-0000-0000-000000000001')->>'used')::integer=4,'troca consome vaga');
SELECT pg_temp.ok(cjs_api.plan_register_use('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','gerar',ARRAY['Eva','Fabio','Gil','Hugo'])->>'status'<>'confirmar_troca','quadro confirmado não repete');
-- Arquivar: somente leitura, vaga só volta no próximo ciclo.
SELECT pg_temp.como(4);
SELECT pg_temp.ok(pg_temp.erro($$SELECT cjs_api.company_set_archived('20000000-0000-0000-0000-000000000001',(SELECT (v->>'id')::uuid FROM r WHERE k='nova'),true)$$) LIKE 'PT403%','operador não arquiva');
SELECT pg_temp.como(1);
SELECT pg_temp.ok((cjs_api.company_set_archived('20000000-0000-0000-0000-000000000001',(SELECT (v->>'id')::uuid FROM r WHERE k='nova'),true)->'company'->>'archived')::boolean,'gerente arquiva');
SELECT pg_temp.ok((cjs_api.plan_status('20000000-0000-0000-0000-000000000001')->>'used')::integer=4,'arquivada ainda conta no ciclo');
SELECT pg_temp.ok(cjs_api.plan_register_use('20000000-0000-0000-0000-000000000001',(SELECT (v->>'id')::uuid FROM r WHERE k='nova'),'gerar',ARRAY['X'])->>'reason'='arquivada','arquivada bloqueia uso');
SELECT pg_temp.ok(pg_temp.erro(format($$SELECT cjs_api.save_draft('20000000-0000-0000-0000-000000000001','%s',NULL,NULL,gen_random_uuid(),'t','{}')$$,(SELECT v->>'id' FROM r WHERE k='nova'))) LIKE 'PT423%','arquivada não salva');
SELECT pg_temp.ok(pg_temp.erro(format($$SELECT cjs_api.update_company('20000000-0000-0000-0000-000000000001','%s','Nova 2','11222333000181','Nova Ltda','11222333000181')$$,(SELECT v->>'id' FROM r WHERE k='nova'))) LIKE 'PT423%','arquivada não edita');
SELECT pg_temp.ok((cjs_api.company_set_archived('20000000-0000-0000-0000-000000000001',(SELECT (v->>'id')::uuid FROM r WHERE k='nova'),false)->'company'->>'archived')::boolean=false,'reativa no mesmo ciclo sem nova vaga');
-- CNPJ travado após uso: gerente não troca, Admin troca.
SELECT cjs_api.plan_register_use('20000000-0000-0000-0000-000000000001',(SELECT (v->>'id')::uuid FROM r WHERE k='nova'),'gerar',ARRAY['X']);
SELECT pg_temp.ok(pg_temp.erro(format($$SELECT cjs_api.update_company('20000000-0000-0000-0000-000000000001','%s','Nova Ltda','11444777000161','Nova Ltda','11222333000181')$$,(SELECT v->>'id' FROM r WHERE k='nova'))) LIKE 'PT423%','CNPJ travado para gerente');
SELECT pg_temp.ok(pg_temp.erro(format($$SELECT cjs_api.update_company('20000000-0000-0000-0000-000000000001','%s','Nova Comércio','11222333000181','Nova Ltda','11222333000181')$$,(SELECT v->>'id' FROM r WHERE k='nova'))) = 'sem erro','razão social segue editável');
SELECT pg_temp.como(9);
SELECT pg_temp.ok(pg_temp.erro(format($$SELECT cjs_api.update_company('20000000-0000-0000-0000-000000000001','%s','Nova Comércio','11444777000161','Nova Comércio','11222333000181')$$,(SELECT v->>'id' FROM r WHERE k='nova'))) = 'sem erro','Admin altera CNPJ');
SELECT pg_temp.ok(jsonb_array_length(cjs_api.admin_plan_detail('20000000-0000-0000-0000-000000000001')->'events')>3,'histórico registrado');
SELECT pg_temp.ok(cjs_api.admin_plan_detail('20000000-0000-0000-0000-000000000001')->'plan'->>'used'='4','detalhe');
-- Plano suspenso bloqueia; remover plano volta a ilimitado.
SELECT pg_temp.ok(cjs_api.admin_plan_save('20000000-0000-0000-0000-000000000001',1,'Inicial',3,5,cjs_private.today(),'suspenso','')->>'status'='suspenso','suspende');
SELECT pg_temp.como(1);
SELECT pg_temp.ok(cjs_api.plan_register_use('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','gerar',ARRAY['Eva'])->>'reason'='suspenso','suspenso bloqueia');
SELECT pg_temp.como(9);
SELECT pg_temp.ok((cjs_api.admin_plan_remove('20000000-0000-0000-0000-000000000001',2)->>'limited')::boolean=false,'remove plano');
-- Ciclo: dia 31 e virada de mês.
SELECT pg_temp.ok(cjs_private.cycle_start('2026-01-31','2026-02-28')='2026-02-28' AND cjs_private.cycle_start('2026-01-31','2026-03-30')='2026-02-28'
 AND cjs_private.cycle_start('2026-01-31','2026-03-31')='2026-03-31' AND cjs_private.cycle_start('2026-01-15','2026-01-14')='2026-01-15'
 AND cjs_private.cycle_start('2026-01-15','2026-04-14')='2026-03-15','ciclo mensal');
RESET ROLE;
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM cjs_private.roster_hashes r WHERE r.name_hash=convert_to('Eva','UTF8')),'só hashes');
ROLLBACK;
