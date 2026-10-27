-- Reescala: cenários FICTÍCIOS de comércio, fazenda, assistência 24h e padaria.
-- Execução administrativa; requer migrações 001–008. Não cria contas nem senhas.
\set ON_ERROR_STOP on
\if :{?identity_subject}
\else
\echo 'Informe -v identity_subject=ID_DA_IDENTIDADE_ADMIN'
\quit 3
\endif
BEGIN;
SET LOCAL ROLE cjs_owner;
SELECT set_config('cjs.demo_subject', :'identity_subject', true);
DO $segmentos_demo$
DECLARE
 v_actor uuid;
 v_office constant uuid := 'de000000-0000-4000-8000-000000000001';
 v_company jsonb;
 v_draft jsonb;
 v_cid uuid;
 v_did uuid;
 v_dataset jsonb := $demo_data$__DEMO_SEGMENTOS__$demo_data$::jsonb;
BEGIN
 -- Mesmo lock do instalador original: serializa todos os cadastros do DEMO.
 PERFORM pg_advisory_xact_lock(hashtextextended('reescala:demo:install:v1',0));
 SELECT id INTO v_actor FROM cjs_private.users
 WHERE identity_subject=current_setting('cjs.demo_subject') AND active AND platform_admin;
 IF v_actor IS NULL THEN RAISE EXCEPTION 'A identidade informada precisa pertencer a um Admin global ativo.'; END IF;
 IF EXISTS(SELECT 1 FROM cjs_private.offices o WHERE o.id=v_office AND (o.name<>'DEMO' OR NOT o.active)) THEN
  RAISE EXCEPTION 'Identificador do escritório DEMO divergente/inativo. Nada foi alterado.';
 END IF;
 INSERT INTO cjs_private.offices(id,name) VALUES(v_office,'DEMO') ON CONFLICT(id) DO NOTHING;
 IF FOUND THEN INSERT INTO cjs_private.office_registry_log(actor_id,office_id) VALUES(v_actor,v_office); END IF;
 INSERT INTO cjs_private.memberships(user_id,office_id,role) VALUES(v_actor,v_office,'admin') ON CONFLICT DO NOTHING;
 FOR v_company IN SELECT value FROM jsonb_array_elements(v_dataset) LOOP
  v_cid := (v_company->>'id')::uuid;
  IF EXISTS(SELECT 1 FROM cjs_private.companies c WHERE c.id=v_cid AND c.office_id<>v_office) THEN
   RAISE EXCEPTION 'Identificador da empresa DEMO pertence a outro escritório. Nada foi alterado.';
  END IF;
  -- Preserva nome/CNPJ se o usuário já editou uma empresa de demonstração instalada.
  INSERT INTO cjs_private.companies(id,office_id,name,cnpj)
  VALUES(v_cid,v_office,v_company->>'name',v_company->>'cnpj') ON CONFLICT(id) DO NOTHING;
  IF FOUND THEN
   INSERT INTO cjs_private.company_registry_log(actor_id,office_id,company_id,action,details)
   VALUES(v_actor,v_office,v_cid,'create','{"origem":"demo-segmentos-ficticios"}');
  END IF;
  FOR v_draft IN SELECT value FROM jsonb_array_elements(v_company->'drafts') LOOP
   v_did := (v_draft->>'id')::uuid;
   IF EXISTS(SELECT 1 FROM cjs_private.drafts d WHERE d.id=v_did AND
    (d.office_id<>v_office OR d.company_id<>v_cid OR d.deleted_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'Preenchimento DEMO excluído ou identificador em outro contexto. Nada foi alterado.';
   END IF;
   INSERT INTO cjs_private.drafts(id,office_id,company_id,title,state,updated_by)
   VALUES(v_did,v_office,v_cid,v_draft->>'title',v_draft->'state',v_actor) ON CONFLICT(id) DO NOTHING;
  END LOOP;
 END LOOP;
END $segmentos_demo$;
COMMIT;
SELECT c.name AS empresa,d.title AS preenchimento,jsonb_array_length(d.state->'colaboradores') AS colaboradores,d.revision AS revisao
FROM cjs_private.companies c JOIN cjs_private.drafts d ON d.company_id=c.id
WHERE c.office_id='de000000-0000-4000-8000-000000000001' AND c.id IN (
 'de000000-0000-4000-8000-000000000101','de000000-0000-4000-8000-000000000102',
 'de000000-0000-4000-8000-000000000103','de000000-0000-4000-8000-000000000104')
AND d.deleted_at IS NULL ORDER BY c.name,d.title;
