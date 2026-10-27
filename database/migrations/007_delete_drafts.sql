BEGIN;
SET LOCAL ROLE cjs_owner;
ALTER TABLE cjs_private.drafts ADD COLUMN deleted_at timestamptz, ADD COLUMN deleted_by uuid REFERENCES cjs_private.users;
ALTER TABLE cjs_private.drafts ADD CONSTRAINT drafts_deleted_pair CHECK((deleted_at IS NULL)=(deleted_by IS NULL));
DROP POLICY drafts_read ON cjs_private.drafts;
CREATE POLICY drafts_read ON cjs_private.drafts FOR SELECT TO cjs_authenticated USING(deleted_at IS NULL AND cjs_private.allowed(office_id,company_id));
DROP POLICY drafts_create ON cjs_private.drafts;
CREATE POLICY drafts_create ON cjs_private.drafts FOR INSERT TO cjs_authenticated WITH CHECK(deleted_at IS NULL AND deleted_by IS NULL AND cjs_private.allowed(office_id,company_id,true) AND updated_by=cjs_private.actor());
DROP POLICY drafts_edit ON cjs_private.drafts;
CREATE POLICY drafts_edit ON cjs_private.drafts FOR UPDATE TO cjs_authenticated USING(deleted_at IS NULL AND cjs_private.allowed(office_id,company_id,true)) WITH CHECK(deleted_at IS NULL AND deleted_by IS NULL AND cjs_private.allowed(office_id,company_id,true) AND updated_by=cjs_private.actor());
DROP POLICY versions_read ON cjs_private.draft_versions;
CREATE POLICY versions_read ON cjs_private.draft_versions FOR SELECT TO cjs_authenticated USING(cjs_private.allowed(office_id,company_id) AND EXISTS(SELECT 1 FROM cjs_private.drafts d WHERE d.id=draft_id AND d.office_id=draft_versions.office_id AND d.company_id=draft_versions.company_id AND d.deleted_at IS NULL));
CREATE OR REPLACE FUNCTION cjs_private.record_draft() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.deleted_at IS NOT NULL THEN RAISE SQLSTATE 'PT404' USING MESSAGE='Preenchimento excluído.'; END IF;
 IF NEW.deleted_at IS NOT NULL THEN
  INSERT INTO cjs_private.audit(office_id,company_id,draft_id,revision,user_id,action)
  VALUES(NEW.office_id,NEW.company_id,NEW.id,NEW.revision,NEW.deleted_by,'delete');
  RETURN NEW;
 END IF;
 INSERT INTO cjs_private.draft_versions(draft_id,office_id,company_id,revision,title,state,schema_version,changed_by)
 VALUES(NEW.id,NEW.office_id,NEW.company_id,NEW.revision,NEW.title,NEW.state,NEW.schema_version,NEW.updated_by);
 INSERT INTO cjs_private.audit(office_id,company_id,draft_id,revision,user_id,action)
 VALUES(NEW.office_id,NEW.company_id,NEW.id,NEW.revision,NEW.updated_by,CASE WHEN TG_OP='INSERT' THEN 'create' ELSE 'update' END);
 RETURN NEW;
END $$;
CREATE FUNCTION cjs_api.delete_draft(p_office_id uuid,p_company_id uuid,p_draft_id uuid,p_revision integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE target cjs_private.drafts; who uuid:=cjs_private.actor();
BEGIN
 IF who IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 IF NOT cjs_private.allowed(p_office_id,p_company_id,true) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Exclusão não permitida.'; END IF;
 IF p_revision IS NULL OR p_revision<1 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Informe a revisão.'; END IF;
 SELECT * INTO target FROM cjs_private.drafts WHERE id=p_draft_id AND office_id=p_office_id AND company_id=p_company_id FOR UPDATE;
 IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='Preenchimento não encontrado.'; END IF;
 IF target.deleted_at IS NOT NULL THEN RETURN jsonb_build_object('id',target.id,'deleted',true); END IF;
 IF target.revision<>p_revision THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Outra pessoa alterou o preenchimento. Atualize a lista antes de excluir.'; END IF;
 UPDATE cjs_private.drafts SET deleted_at=clock_timestamp(),deleted_by=who,updated_by=who,updated_at=clock_timestamp() WHERE id=target.id;
 RETURN jsonb_build_object('id',target.id,'deleted',true);
END $$;
GRANT EXECUTE ON FUNCTION cjs_api.delete_draft(uuid,uuid,uuid,integer) TO cjs_authenticated;

CREATE OR REPLACE FUNCTION cjs_api.save_draft(p_office_id uuid,p_company_id uuid,p_draft_id uuid,p_revision integer,p_key uuid,p_title text,p_state jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,cjs_private AS $$
DECLARE who uuid; fingerprint bytea; old cjs_private.idempotency; saved cjs_private.drafts; result jsonb;
BEGIN
 who:=cjs_private.actor();
 IF NOT cjs_private.allowed(p_office_id,p_company_id,true) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Gravação não permitida.';END IF;
 IF p_key IS NULL OR p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 160
 OR p_state IS NULL OR jsonb_typeof(p_state)<>'object' OR octet_length(p_state::text)>1048576
 OR (p_draft_id IS NULL AND p_revision IS NOT NULL) OR (p_draft_id IS NOT NULL AND (p_revision IS NULL OR p_revision<1))
 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Rascunho inválido.'; END IF;
 fingerprint:=sha256(convert_to(jsonb_build_array(p_draft_id,p_revision,p_title,p_state)::text,'UTF8'));
 PERFORM pg_advisory_xact_lock(hashtextextended(who::text||p_office_id::text||p_company_id::text||p_key::text,0));
 SELECT * INTO old FROM cjs_private.idempotency WHERE user_id=who AND office_id=p_office_id AND company_id=p_company_id AND key=p_key;
 IF FOUND THEN
  IF old.request_hash<>fingerprint THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Chave de repetição usada com outro conteúdo.';END IF;
  PERFORM 1 FROM cjs_private.drafts WHERE id=(old.response->>'id')::uuid AND office_id=p_office_id AND company_id=p_company_id FOR SHARE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='Preenchimento excluído ou indisponível.'; END IF;
  RETURN old.response;
 END IF;
 IF p_draft_id IS NULL THEN
  INSERT INTO cjs_private.drafts(office_id,company_id,title,state,updated_by)
  VALUES(p_office_id,p_company_id,btrim(p_title),p_state,who) RETURNING * INTO saved;
 ELSE
  SELECT * INTO saved FROM cjs_private.drafts WHERE id=p_draft_id AND office_id=p_office_id AND company_id=p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='Rascunho não encontrado.';END IF;
  IF saved.revision<>p_revision THEN RAISE SQLSTATE 'PT409' USING MESSAGE='O rascunho foi alterado. Reabra a versão atual antes de salvar.',DETAIL=jsonb_build_object('revision',saved.revision)::text;END IF;
  UPDATE cjs_private.drafts SET title=btrim(p_title),state=p_state,revision=revision+1,updated_by=who,updated_at=clock_timestamp()
  WHERE id=p_draft_id RETURNING * INTO saved;
 END IF;
 result:=jsonb_build_object('id',saved.id,'revision',saved.revision,'schema_version',saved.schema_version,'updated_at',saved.updated_at);
 INSERT INTO cjs_private.idempotency(user_id,office_id,company_id,key,request_hash,response) VALUES(who,p_office_id,p_company_id,p_key,fingerprint,result);
 RETURN result;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
