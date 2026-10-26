-- Executar uma vez em banco dedicado, com administrador. Não altera public.users.
BEGIN;
CREATE ROLE cjs_owner NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE cjs_authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE cjs_anonymous NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE cjs_authenticator LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
GRANT cjs_authenticated,cjs_anonymous TO cjs_authenticator;
CREATE SCHEMA cjs_private AUTHORIZATION cjs_owner;
CREATE SCHEMA cjs_api AUTHORIZATION cjs_owner;
SET LOCAL ROLE cjs_owner;
ALTER DEFAULT PRIVILEGES IN SCHEMA cjs_api REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA cjs_private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE cjs_private.users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 identity_subject text UNIQUE NOT NULL CHECK(length(identity_subject) BETWEEN 1 AND 255),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 160),
 active boolean NOT NULL DEFAULT true
);
CREATE TABLE cjs_private.offices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 160),
 active boolean NOT NULL DEFAULT true
);
CREATE TABLE cjs_private.memberships (
 user_id uuid REFERENCES cjs_private.users ON DELETE CASCADE,
 office_id uuid REFERENCES cjs_private.offices,
 role text NOT NULL CHECK(role IN ('admin','editor','viewer')),
 active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(user_id,office_id)
);
CREATE TABLE cjs_private.companies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 office_id uuid NOT NULL REFERENCES cjs_private.offices,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 160),
 UNIQUE(id,office_id)
);
CREATE TABLE cjs_private.company_access (
 user_id uuid NOT NULL,
 office_id uuid NOT NULL,
 company_id uuid NOT NULL,
 PRIMARY KEY(user_id,office_id,company_id),
 FOREIGN KEY(user_id,office_id) REFERENCES cjs_private.memberships,
 FOREIGN KEY(company_id,office_id) REFERENCES cjs_private.companies(id,office_id)
);
CREATE TABLE cjs_private.sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES cjs_private.users,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '12 hours')
);
CREATE TABLE cjs_private.drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 office_id uuid NOT NULL,
 company_id uuid NOT NULL,
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 160),
 state jsonb NOT NULL CHECK(jsonb_typeof(state)='object' AND octet_length(state::text)<=1048576),
 schema_version integer NOT NULL DEFAULT 1 CHECK(schema_version=1),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_by uuid NOT NULL REFERENCES cjs_private.users,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,office_id,company_id),
 FOREIGN KEY(company_id,office_id) REFERENCES cjs_private.companies(id,office_id)
);
CREATE INDEX drafts_company ON cjs_private.drafts(office_id,company_id,updated_at DESC);
CREATE TABLE cjs_private.draft_versions (
 draft_id uuid NOT NULL,
 office_id uuid NOT NULL,
 company_id uuid NOT NULL,
 revision integer NOT NULL,
 title text NOT NULL,
 state jsonb NOT NULL,
 schema_version integer NOT NULL,
 changed_by uuid NOT NULL REFERENCES cjs_private.users,
 changed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(draft_id,revision),
 FOREIGN KEY(draft_id,office_id,company_id) REFERENCES cjs_private.drafts(id,office_id,company_id)
);
CREATE TABLE cjs_private.idempotency (
 user_id uuid NOT NULL REFERENCES cjs_private.users,
 office_id uuid NOT NULL,
 company_id uuid NOT NULL,
 key uuid NOT NULL,
 request_hash bytea NOT NULL,
 response jsonb NOT NULL,
 PRIMARY KEY(user_id,office_id,company_id,key),
 FOREIGN KEY(company_id,office_id) REFERENCES cjs_private.companies(id,office_id)
);
CREATE TABLE cjs_private.audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 office_id uuid NOT NULL,
 company_id uuid NOT NULL,
 draft_id uuid NOT NULL,
 revision integer NOT NULL,
 user_id uuid NOT NULL,
 action text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(draft_id,office_id,company_id) REFERENCES cjs_private.drafts(id,office_id,company_id)
);
-- Helpers privilegiados são pequenos e não aceitam identidade indicada pelo cliente.
CREATE FUNCTION cjs_private.actor() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE claims jsonb; actor_id uuid; session_id uuid;
BEGIN
 claims:=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
 IF claims->>'role' IS DISTINCT FROM 'cjs_authenticated' OR claims->>'iss' IS DISTINCT FROM 'cjs-escala-api' OR claims->>'aud' IS DISTINCT FROM 'cjs-postgrest' THEN RETURN NULL; END IF;
 BEGIN actor_id:=(claims->>'sub')::uuid;session_id:=(claims->>'sid')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RETURN NULL; END;
 IF EXISTS(SELECT 1 FROM cjs_private.users u JOIN cjs_private.sessions s ON s.user_id=u.id
   WHERE u.id=actor_id AND u.active AND s.id=session_id AND s.revoked_at IS NULL AND s.expires_at>now())
 THEN RETURN actor_id; END IF;
 RETURN NULL;
END $$;
CREATE FUNCTION cjs_private.office_visible(p_office uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
 SELECT EXISTS(SELECT 1 FROM cjs_private.memberships m JOIN cjs_private.offices o ON o.id=m.office_id
 WHERE m.user_id=cjs_private.actor() AND m.office_id=p_office AND m.active AND o.active)
$$;
CREATE FUNCTION cjs_private.allowed(p_office uuid,p_company uuid,p_write boolean DEFAULT false) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
 SELECT EXISTS(SELECT 1 FROM cjs_private.memberships m
 JOIN cjs_private.offices o ON o.id=m.office_id
 JOIN cjs_private.companies c ON c.office_id=o.id AND c.id=p_company
 WHERE m.user_id=cjs_private.actor() AND m.office_id=p_office AND m.active AND o.active
 AND (NOT p_write OR m.role IN ('admin','editor'))
 AND (m.role='admin' OR EXISTS(SELECT 1 FROM cjs_private.company_access a
 WHERE a.user_id=m.user_id AND a.office_id=m.office_id AND a.company_id=c.id)))
$$;
ALTER TABLE cjs_private.offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE cjs_private.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE cjs_private.drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cjs_private.draft_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cjs_private.idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE cjs_private.audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY offices_read ON cjs_private.offices FOR SELECT TO cjs_authenticated USING(cjs_private.office_visible(id));
CREATE POLICY companies_read ON cjs_private.companies FOR SELECT TO cjs_authenticated USING(cjs_private.allowed(office_id,id));
CREATE POLICY drafts_read ON cjs_private.drafts FOR SELECT TO cjs_authenticated USING(cjs_private.allowed(office_id,company_id));
CREATE POLICY drafts_create ON cjs_private.drafts FOR INSERT TO cjs_authenticated WITH CHECK(cjs_private.allowed(office_id,company_id,true) AND updated_by=cjs_private.actor());
CREATE POLICY drafts_edit ON cjs_private.drafts FOR UPDATE TO cjs_authenticated USING(cjs_private.allowed(office_id,company_id,true)) WITH CHECK(cjs_private.allowed(office_id,company_id,true) AND updated_by=cjs_private.actor());
CREATE POLICY versions_read ON cjs_private.draft_versions FOR SELECT TO cjs_authenticated USING(cjs_private.allowed(office_id,company_id));
CREATE POLICY idempotency_read ON cjs_private.idempotency FOR SELECT TO cjs_authenticated USING(user_id=cjs_private.actor() AND cjs_private.allowed(office_id,company_id,true));
CREATE POLICY idempotency_create ON cjs_private.idempotency FOR INSERT TO cjs_authenticated WITH CHECK(user_id=cjs_private.actor() AND cjs_private.allowed(office_id,company_id,true));
CREATE POLICY audit_read ON cjs_private.audit FOR SELECT TO cjs_authenticated USING(cjs_private.allowed(office_id,company_id));
-- Histórico e auditoria só são gravados pelo trigger, nunca fornecidos pelo frontend.
CREATE FUNCTION cjs_private.record_draft() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
BEGIN
 INSERT INTO cjs_private.draft_versions(draft_id,office_id,company_id,revision,title,state,schema_version,changed_by)
 VALUES(NEW.id,NEW.office_id,NEW.company_id,NEW.revision,NEW.title,NEW.state,NEW.schema_version,NEW.updated_by);
 INSERT INTO cjs_private.audit(office_id,company_id,draft_id,revision,user_id,action)
 VALUES(NEW.office_id,NEW.company_id,NEW.id,NEW.revision,NEW.updated_by,CASE WHEN TG_OP='INSERT' THEN 'create' ELSE 'update' END);
 RETURN NEW;
END $$;
CREATE TRIGGER draft_record AFTER INSERT OR UPDATE ON cjs_private.drafts FOR EACH ROW EXECUTE FUNCTION cjs_private.record_draft();
CREATE FUNCTION cjs_api.check_session() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
BEGIN
 IF cjs_private.actor() IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida, expirada ou revogada.'; END IF;
END $$;
CREATE FUNCTION cjs_api.list_offices() RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,cjs_private AS $$
 SELECT jsonb_build_object('id',id,'name',name) FROM cjs_private.offices ORDER BY name,id
$$;
CREATE FUNCTION cjs_api.list_companies(p_office_id uuid) RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,cjs_private AS $$
 SELECT jsonb_build_object('id',id,'office_id',office_id,'name',name) FROM cjs_private.companies WHERE office_id=p_office_id ORDER BY name,id
$$;
CREATE FUNCTION cjs_api.list_drafts(p_office_id uuid,p_company_id uuid) RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,cjs_private AS $$
 SELECT jsonb_build_object('id',id,'title',title,'revision',revision,'schema_version',schema_version,'updated_at',updated_at)
 FROM cjs_private.drafts WHERE office_id=p_office_id AND company_id=p_company_id ORDER BY updated_at DESC,id LIMIT 100
$$;
CREATE FUNCTION cjs_api.get_draft(p_office_id uuid,p_company_id uuid,p_draft_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,cjs_private AS $$
DECLARE result jsonb;
BEGIN
 IF NOT cjs_private.allowed(p_office_id,p_company_id) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Acesso não permitido.';END IF;
 SELECT to_jsonb(d) INTO result FROM cjs_private.drafts d WHERE id=p_draft_id AND office_id=p_office_id AND company_id=p_company_id;
 IF result IS NULL THEN RAISE SQLSTATE 'PT404' USING MESSAGE='Rascunho não encontrado.';END IF;
 RETURN result;
END $$;
CREATE FUNCTION cjs_api.save_draft(p_office_id uuid,p_company_id uuid,p_draft_id uuid,p_revision integer,p_key uuid,p_title text,p_state jsonb) RETURNS jsonb
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
GRANT USAGE ON SCHEMA cjs_api,cjs_private TO cjs_authenticated;
GRANT SELECT ON cjs_private.offices,cjs_private.companies,cjs_private.drafts,cjs_private.draft_versions,cjs_private.audit,cjs_private.idempotency TO cjs_authenticated;
GRANT INSERT,UPDATE ON cjs_private.drafts TO cjs_authenticated;
GRANT INSERT ON cjs_private.idempotency TO cjs_authenticated;
GRANT EXECUTE ON FUNCTION cjs_private.actor(),cjs_private.office_visible(uuid),cjs_private.allowed(uuid,uuid,boolean) TO cjs_authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA cjs_api TO cjs_authenticated;
GRANT USAGE ON SCHEMA cjs_api TO cjs_anonymous;
GRANT EXECUTE ON FUNCTION cjs_api.check_session() TO cjs_anonymous;
COMMIT;
