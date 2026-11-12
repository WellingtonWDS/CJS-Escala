-- Executar após 008 no banco cjs_escala. Registros exclusivos de Gerentes/Admins.
BEGIN;
SET LOCAL ROLE cjs_owner;
CREATE TABLE cjs_private.diagnostics (
 id uuid PRIMARY KEY, office_id uuid NOT NULL, company_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0), status text NOT NULL CHECK(status IN ('rascunho','concluido')),
 data jsonb NOT NULL CHECK(octet_length(data::text)<=200000),
 created_by uuid NOT NULL REFERENCES cjs_private.users, created_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid NOT NULL REFERENCES cjs_private.users, updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,office_id) REFERENCES cjs_private.companies(id,office_id)
);
CREATE INDEX diagnostics_company ON cjs_private.diagnostics(office_id,company_id,updated_at DESC);
CREATE TABLE cjs_private.diagnostic_revisions (
 diagnostic_id uuid NOT NULL REFERENCES cjs_private.diagnostics, revision integer NOT NULL,
 status text NOT NULL, data jsonb NOT NULL, actor_id uuid NOT NULL REFERENCES cjs_private.users,
 actor_name text NOT NULL, saved_at timestamptz NOT NULL DEFAULT now(), request_key uuid NOT NULL,
 PRIMARY KEY(diagnostic_id,revision), UNIQUE(actor_id,request_key)
);
CREATE FUNCTION cjs_private.diagnostic_access(p_office uuid,p_company uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
 SELECT cjs_private.actor() IS NOT NULL AND cjs_private.manage_office(p_office)
 AND EXISTS(SELECT 1 FROM cjs_private.companies WHERE id=p_company AND office_id=p_office)
$$;
ALTER TABLE cjs_private.diagnostics ENABLE ROW LEVEL SECURITY;
ALTER TABLE cjs_private.diagnostics FORCE ROW LEVEL SECURITY;
CREATE POLICY diagnostics_owner ON cjs_private.diagnostics TO cjs_owner
 USING(cjs_private.diagnostic_access(office_id,company_id)) WITH CHECK(cjs_private.diagnostic_access(office_id,company_id));
ALTER TABLE cjs_private.diagnostic_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cjs_private.diagnostic_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY diagnostics_history_read ON cjs_private.diagnostic_revisions FOR SELECT TO cjs_owner
 USING(EXISTS(SELECT 1 FROM cjs_private.diagnostics d WHERE d.id=diagnostic_id));
CREATE POLICY diagnostics_history_append ON cjs_private.diagnostic_revisions FOR INSERT TO cjs_owner
 WITH CHECK(EXISTS(SELECT 1 FROM cjs_private.diagnostics d WHERE d.id=diagnostic_id));
CREATE FUNCTION cjs_private.validate_diagnostic(p_data jsonb,p_status text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,cjs_private AS $$
DECLARE a record; k text; v jsonb; required_ids text[]:=ARRAY['q01','q02','q04','q05','q10','q11','q15','q23','q24','q26','q27','q32','q33'];
BEGIN
 IF p_status IS NULL OR p_status NOT IN ('rascunho','concluido') OR p_data IS NULL OR jsonb_typeof(p_data)<>'object' OR p_data->'schemaVersion' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(p_data->'answers') IS DISTINCT FROM 'object' OR octet_length(p_data::text)>200000 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) t(key) WHERE key NOT IN ('schemaVersion','answers')) THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Diagnóstico inválido.'; END IF;
 FOR a IN SELECT * FROM jsonb_each(p_data->'answers') LOOP
  IF a.key !~ '^q(0[1-9]|[12][0-9]|3[0-4])$' OR jsonb_typeof(a.value) IS DISTINCT FROM 'object' THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Pergunta inválida.'; END IF;
  IF (a.value->>'certainty') IS NULL OR (a.value->>'certainty') NOT IN ('confirmada','estimativa','pendente') OR jsonb_typeof(a.value->'note') IS DISTINCT FROM 'string' OR length(a.value->>'note')>4000 OR NOT a.value ? 'value' OR EXISTS(SELECT 1 FROM jsonb_object_keys(a.value) t(key) WHERE key NOT IN ('value','certainty','note')) THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Resposta inválida.'; END IF;
  v:=a.value->'value';
  IF a.key=ANY(ARRAY['q01','q05','q11','q16','q21','q25','q27','q28','q30','q32']) THEN
   IF jsonb_typeof(v) IS DISTINCT FROM 'array' OR jsonb_array_length(v)>100 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Lista inválida.'; END IF;
  ELSIF a.key='q24' THEN
   IF jsonb_typeof(v) IS DISTINCT FROM 'object' THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Instrumento inválido.'; END IF;
  ELSIF jsonb_typeof(v) IS DISTINCT FROM 'string' OR length(a.value->>'value')>4000 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Texto inválido.';
  END IF;
 END LOOP;
 IF p_status='concluido' THEN
  FOREACH k IN ARRAY required_ids LOOP
   v:=p_data->'answers'->k;
   IF v IS NULL OR (v->>'certainty'<>'pendente' AND v->'value' IN ('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb)) THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Há respostas essenciais sem preencher.'; END IF;
  END LOOP;
  v:=p_data->'answers'->'q24';
  IF v->>'certainty'<>'pendente' AND coalesce(v->'value'->>'semInstrumento','false')<>'true' AND (coalesce(btrim(v->'value'->>'nome'),'')='' OR coalesce(v->'value'->>'inicio','')='' OR coalesce(v->'value'->>'fim','')='') THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Confira o ACT/CCT ou marque a pendência.'; END IF;
 END IF;
END $$;
CREATE FUNCTION cjs_api.diagnostic_options() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
BEGIN
 IF cjs_private.actor() IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM cjs_private.offices WHERE cjs_private.manage_office(id)) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Somente Gerentes e Admins.'; END IF;
 RETURN jsonb_build_object('offices',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name,id),'[]') FROM cjs_private.offices WHERE cjs_private.manage_office(id)),
 'companies',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'officeId',office_id,'name',name,'cnpj',cnpj) ORDER BY name,id),'[]') FROM cjs_private.companies WHERE cjs_private.manage_office(office_id)));
END $$;
CREATE FUNCTION cjs_api.diagnostic_list(p_office_id uuid,p_company_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
BEGIN
 IF cjs_private.actor() IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 IF NOT cjs_private.diagnostic_access(p_office_id,p_company_id) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Empresa não autorizada.'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'revision',revision,'status',status,'unit',coalesce(nullif(data->'answers'->'q02'->>'value',''),'Unidade não informada'),'updatedAt',updated_at,'updatedBy',u.name) ORDER BY updated_at DESC,d.id),'[]') FROM cjs_private.diagnostics d JOIN cjs_private.users u ON u.id=d.updated_by WHERE d.office_id=p_office_id AND d.company_id=p_company_id);
END $$;
CREATE FUNCTION cjs_api.diagnostic_get(p_office_id uuid,p_company_id uuid,p_id uuid,p_revision integer DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE d cjs_private.diagnostics; r cjs_private.diagnostic_revisions;
BEGIN
 IF cjs_private.actor() IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 IF NOT cjs_private.diagnostic_access(p_office_id,p_company_id) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Empresa não autorizada.'; END IF;
 SELECT * INTO d FROM cjs_private.diagnostics WHERE id=p_id AND office_id=p_office_id AND company_id=p_company_id;
 IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='Diagnóstico não encontrado.'; END IF;
 SELECT * INTO r FROM cjs_private.diagnostic_revisions WHERE diagnostic_id=d.id AND revision=coalesce(p_revision,d.revision);
 IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='Revisão não encontrada.'; END IF;
 RETURN jsonb_build_object('id',d.id,'revision',r.revision,'latestRevision',d.revision,'status',r.status,'data',r.data,'updatedAt',r.saved_at,'updatedBy',r.actor_name,
 'history',(SELECT jsonb_agg(jsonb_build_object('revision',revision,'status',status,'savedAt',saved_at,'savedBy',actor_name) ORDER BY revision DESC) FROM cjs_private.diagnostic_revisions WHERE diagnostic_id=d.id));
END $$;
CREATE FUNCTION cjs_api.diagnostic_save(p_office_id uuid,p_company_id uuid,p_id uuid,p_revision integer,p_key uuid,p_status text,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE who uuid:=cjs_private.actor(); d cjs_private.diagnostics; r cjs_private.diagnostic_revisions; novo integer;
BEGIN
 IF who IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 IF NOT cjs_private.diagnostic_access(p_office_id,p_company_id) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Empresa não autorizada.'; END IF;
 IF p_id IS NULL OR p_key IS NULL OR p_revision IS NULL OR p_revision<0 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Identificação inválida.'; END IF;
 PERFORM cjs_private.validate_diagnostic(p_data,p_status);
 PERFORM pg_advisory_xact_lock(hashtextextended('diagnostic-request:'||who::text||p_key::text,0));
 SELECT * INTO r FROM cjs_private.diagnostic_revisions WHERE actor_id=who AND request_key=p_key;
 IF FOUND THEN
  IF r.diagnostic_id<>p_id OR r.status<>p_status OR r.data<>p_data THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Chave já utilizada em outra operação.'; END IF;
  RETURN cjs_api.diagnostic_get(p_office_id,p_company_id,p_id,r.revision);
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('diagnostic:'||p_id::text,0));
 SELECT * INTO d FROM cjs_private.diagnostics WHERE id=p_id FOR UPDATE;
 IF FOUND THEN
  IF d.office_id<>p_office_id OR d.company_id<>p_company_id THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Empresa não autorizada.'; END IF;
  IF d.revision<>p_revision THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Diagnóstico alterado. Reabra antes de salvar.'; END IF;
  novo:=d.revision+1;
  UPDATE cjs_private.diagnostics SET revision=novo,status=p_status,data=p_data,updated_by=who,updated_at=now() WHERE id=p_id;
 ELSE
  IF p_revision<>0 THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Diagnóstico não encontrado na revisão indicada.'; END IF;
  novo:=1;
  INSERT INTO cjs_private.diagnostics(id,office_id,company_id,revision,status,data,created_by,updated_by) VALUES(p_id,p_office_id,p_company_id,novo,p_status,p_data,who,who);
 END IF;
 INSERT INTO cjs_private.diagnostic_revisions(diagnostic_id,revision,status,data,actor_id,actor_name,request_key) SELECT p_id,novo,p_status,p_data,who,name,p_key FROM cjs_private.users WHERE id=who;
 RETURN cjs_api.diagnostic_get(p_office_id,p_company_id,p_id,novo);
EXCEPTION WHEN unique_violation THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Identificação ou chave já utilizada. Reabra o diagnóstico.';
END $$;
REVOKE ALL ON cjs_private.diagnostics,cjs_private.diagnostic_revisions FROM PUBLIC,cjs_authenticated,cjs_anonymous;
GRANT EXECUTE ON FUNCTION cjs_api.diagnostic_options(),cjs_api.diagnostic_list(uuid,uuid),cjs_api.diagnostic_get(uuid,uuid,uuid,integer),cjs_api.diagnostic_save(uuid,uuid,uuid,integer,uuid,text,jsonb) TO cjs_authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
