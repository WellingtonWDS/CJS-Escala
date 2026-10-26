BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
-- Compatível com a tabela criada administrativamente no banco dedicado.
CREATE TABLE IF NOT EXISTS public.users (
 user_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 username text NOT NULL, email text NOT NULL, password_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cjs_identity_email_unique ON public.users(lower(btrim(email)));
REVOKE ALL ON public.users FROM PUBLIC;
GRANT SELECT, INSERT ON public.users TO cjs_owner;
GRANT USAGE ON SCHEMA public TO cjs_owner;
CREATE ROLE cjs_admin_gateway NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT cjs_admin_gateway TO cjs_authenticator;
SET LOCAL ROLE cjs_owner;
CREATE TABLE cjs_private.admin_provision_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id uuid NOT NULL REFERENCES cjs_private.users,
 user_id uuid NOT NULL REFERENCES cjs_private.users,
 office_id uuid NOT NULL REFERENCES cjs_private.offices,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION cjs_private.admin_gateway_valid() RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
BEGIN
 IF NOT coalesce(current_setting('request.jwt.claims',true)::jsonb @>
 '{"role":"cjs_admin_gateway","iss":"cjs-escala-api","aud":"cjs-postgrest","purpose":"admin"}'::jsonb,false) THEN RETURN false; END IF;
 RETURN EXISTS (
  SELECT 1 FROM cjs_private.sessions s JOIN cjs_private.users u ON u.id=s.user_id
  JOIN cjs_private.memberships m ON m.user_id=u.id JOIN cjs_private.offices o ON o.id=m.office_id
  WHERE s.id=(current_setting('request.jwt.claims',true)::jsonb->>'sid')::uuid
  AND u.id=(current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid
  AND s.expires_at>now() AND s.revoked_at IS NULL AND u.active AND m.active AND m.role='admin' AND o.active
 );
END $$;
CREATE OR REPLACE FUNCTION cjs_api.check_session() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
BEGIN
 IF NOT cjs_private.gateway_valid() AND cjs_private.actor() IS NULL AND NOT cjs_private.admin_gateway_valid() THEN
  RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida, expirada ou revogada.';
 END IF;
END $$;
CREATE FUNCTION cjs_api.admin_options() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
BEGIN
 IF NOT cjs_private.admin_gateway_valid() THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Operação não autorizada.'; END IF;
 RETURN jsonb_build_object(
  'offices',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name),'[]') FROM cjs_private.offices WHERE active),
  'companies',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'officeId',c.office_id,'name',c.name) ORDER BY c.name),'[]') FROM cjs_private.companies c JOIN cjs_private.offices o ON o.id=c.office_id WHERE o.active)
 );
END $$;
CREATE FUNCTION cjs_api.admin_create_user(p_name text,p_email text,p_password text,p_office_id uuid,p_role text,p_company_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE identity_id uuid; internal_id uuid; actor_id uuid;
BEGIN
 IF NOT cjs_private.admin_gateway_valid() THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Operação não autorizada.'; END IF;
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 160
 OR p_email IS NULL OR length(p_email)>254 OR btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 OR p_password IS NULL OR length(p_password)<6 OR octet_length(p_password)>72
 OR p_role IS NULL OR p_role NOT IN ('admin','editor','viewer')
 OR p_company_ids IS NULL OR cardinality(p_company_ids)>1000 THEN
  RAISE SQLSTATE 'PT400' USING MESSAGE='Dados de cadastro inválidos.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM cjs_private.offices WHERE id=p_office_id AND active)
 OR EXISTS(SELECT 1 FROM unnest(p_company_ids) chosen(id) WHERE id IS NULL OR NOT EXISTS(SELECT 1 FROM cjs_private.companies c WHERE c.id=chosen.id AND c.office_id=p_office_id))
 OR (p_role<>'admin' AND cardinality(p_company_ids)=0) THEN
  RAISE SQLSTATE 'PT400' USING MESSAGE='Selecione escritório e empresas válidos.';
 END IF;
 actor_id:=(current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid;
 INSERT INTO public.users(username,email,password_hash)
 VALUES(btrim(p_name),lower(btrim(p_email)),public.crypt(p_password,public.gen_salt('bf',12))) RETURNING user_id INTO identity_id;
 INSERT INTO cjs_private.users(identity_subject,name) VALUES(identity_id::text,btrim(p_name)) RETURNING id INTO internal_id;
 INSERT INTO cjs_private.memberships(user_id,office_id,role) VALUES(internal_id,p_office_id,p_role);
 INSERT INTO cjs_private.company_access(user_id,office_id,company_id)
 SELECT DISTINCT internal_id,p_office_id,id FROM unnest(p_company_ids) chosen(id);
 INSERT INTO cjs_private.admin_provision_log(actor_id,user_id,office_id) VALUES(actor_id,internal_id,p_office_id);
 RETURN jsonb_build_object('id',internal_id,'name',btrim(p_name));
EXCEPTION WHEN unique_violation THEN
 RAISE SQLSTATE 'PT409' USING MESSAGE='Já existe uma conta com esse e-mail.';
END $$;
GRANT USAGE ON SCHEMA cjs_api TO cjs_admin_gateway;
GRANT EXECUTE ON FUNCTION cjs_api.check_session(),cjs_api.admin_options(),cjs_api.admin_create_user(text,text,text,uuid,text,uuid[]) TO cjs_admin_gateway;
NOTIFY pgrst, 'reload schema';
COMMIT;
