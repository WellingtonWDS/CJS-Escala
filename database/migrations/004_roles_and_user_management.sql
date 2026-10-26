BEGIN;
SET LOCAL ROLE cjs_owner;
ALTER TABLE cjs_private.users ADD COLUMN platform_admin boolean NOT NULL DEFAULT false;
CREATE FUNCTION cjs_private.platform_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
 SELECT coalesce((SELECT platform_admin FROM cjs_private.users WHERE id=cjs_private.actor() AND active),false)
$$;
CREATE OR REPLACE FUNCTION cjs_private.office_visible(p_office uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
 SELECT EXISTS(SELECT 1 FROM cjs_private.offices o WHERE o.id=p_office AND o.active AND
 (cjs_private.platform_admin() OR EXISTS(SELECT 1 FROM cjs_private.memberships m WHERE m.user_id=cjs_private.actor() AND m.office_id=o.id AND m.active)))
$$;
CREATE OR REPLACE FUNCTION cjs_private.allowed(p_office uuid,p_company uuid,p_write boolean DEFAULT false) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
 SELECT EXISTS(SELECT 1 FROM cjs_private.offices o JOIN cjs_private.companies c ON c.office_id=o.id
 WHERE o.id=p_office AND c.id=p_company AND o.active AND
 (cjs_private.platform_admin() OR EXISTS(SELECT 1 FROM cjs_private.memberships m WHERE m.user_id=cjs_private.actor() AND m.office_id=o.id AND m.active
 AND (NOT p_write OR m.role IN ('admin','editor')) AND (m.role='admin' OR EXISTS(SELECT 1 FROM cjs_private.company_access a WHERE a.user_id=m.user_id AND a.office_id=m.office_id AND a.company_id=c.id)))))
$$;
CREATE FUNCTION cjs_private.manage_office(p_office uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
 SELECT EXISTS(SELECT 1 FROM cjs_private.offices o WHERE o.id=p_office AND o.active AND
 (cjs_private.platform_admin() OR EXISTS(SELECT 1 FROM cjs_private.memberships m WHERE m.user_id=cjs_private.actor() AND m.office_id=o.id AND m.active AND m.role='admin')))
$$;
CREATE OR REPLACE FUNCTION cjs_api.get_identity() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE who uuid:=cjs_private.actor();
BEGIN
 IF who IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 RETURN (SELECT jsonb_build_object('id',u.id,'name',u.name,'role',CASE WHEN u.platform_admin THEN 'admin' WHEN EXISTS(SELECT 1 FROM cjs_private.memberships m JOIN cjs_private.offices o ON o.id=m.office_id WHERE m.user_id=who AND m.active AND o.active AND m.role='admin') THEN 'manager' ELSE 'operator' END) FROM cjs_private.users u WHERE u.id=who);
END $$;
CREATE OR REPLACE FUNCTION cjs_api.open_session(p_expires_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE claims jsonb; u cjs_private.users; s cjs_private.sessions;
BEGIN
 IF NOT cjs_private.gateway_valid() THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Serviço não autorizado.'; END IF;
 claims:=current_setting('request.jwt.claims',true)::jsonb;
 SELECT * INTO u FROM cjs_private.users WHERE identity_subject=claims->>'sub' AND active;
 IF NOT FOUND OR (NOT u.platform_admin AND NOT EXISTS(SELECT 1 FROM cjs_private.memberships m JOIN cjs_private.offices o ON o.id=m.office_id WHERE m.user_id=u.id AND m.active AND o.active))
 THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Usuário sem acesso ao sistema.'; END IF;
 IF p_expires_at IS NULL OR p_expires_at<=now() THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Identidade expirada.'; END IF;
 INSERT INTO cjs_private.sessions(user_id,expires_at) VALUES(u.id,least(p_expires_at,now()+interval '12 hours')) RETURNING * INTO s;
 RETURN jsonb_build_object('userId',u.id,'sessionId',s.id,'expiresAt',floor(extract(epoch FROM s.expires_at)*1000),'name',u.name);
END $$;
CREATE FUNCTION cjs_api.manage_options() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
BEGIN
 IF cjs_private.actor() IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 IF NOT cjs_private.platform_admin() AND NOT EXISTS(SELECT 1 FROM cjs_private.offices WHERE cjs_private.manage_office(id)) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Acesso não permitido.'; END IF;
 RETURN jsonb_build_object(
 'platformAdmin',cjs_private.platform_admin(),
 'offices',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name),'[]') FROM cjs_private.offices WHERE cjs_private.manage_office(id)),
 'companies',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'officeId',office_id,'name',name) ORDER BY name),'[]') FROM cjs_private.companies WHERE cjs_private.manage_office(office_id)),
 'users',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'officeId',m.office_id,'role',CASE WHEN u.platform_admin THEN 'admin' WHEN m.role='admin' THEN 'manager' ELSE 'operator' END,'companyIds',(SELECT coalesce(jsonb_agg(a.company_id),'[]') FROM cjs_private.company_access a WHERE a.user_id=u.id AND a.office_id=m.office_id)) ORDER BY u.name),'[]') FROM cjs_private.users u JOIN cjs_private.memberships m ON m.user_id=u.id WHERE u.active AND m.active AND cjs_private.manage_office(m.office_id) AND (cjs_private.platform_admin() OR (NOT u.platform_admin AND m.role IN ('editor','viewer'))))
 );
END $$;
CREATE FUNCTION cjs_api.manage_create_user(p_name text,p_email text,p_password text,p_office_id uuid,p_role text,p_company_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE identity_id uuid; internal_id uuid; who uuid:=cjs_private.actor();
BEGIN
 IF who IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 IF NOT cjs_private.manage_office(p_office_id) OR (p_role='admin' AND NOT cjs_private.platform_admin()) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Acesso não permitido.'; END IF;
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 160 OR p_email IS NULL OR length(p_email)>254 OR btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 OR p_password IS NULL OR length(p_password)<6 OR octet_length(p_password)>72 OR p_role IS NULL OR p_role NOT IN ('operator','manager','admin') OR p_company_ids IS NULL OR cardinality(p_company_ids)>1000 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Dados inválidos.'; END IF;
 IF (p_role='operator' AND cardinality(p_company_ids)=0) OR EXISTS(SELECT 1 FROM unnest(p_company_ids) chosen(id) WHERE id IS NULL OR NOT EXISTS(SELECT 1 FROM cjs_private.companies c WHERE c.id=chosen.id AND c.office_id=p_office_id)) THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Empresas inválidas.'; END IF;
 INSERT INTO public.users(username,email,password_hash) VALUES(btrim(p_name),lower(btrim(p_email)),public.crypt(p_password,public.gen_salt('bf',12))) RETURNING user_id INTO identity_id;
 INSERT INTO cjs_private.users(identity_subject,name,platform_admin) VALUES(identity_id::text,btrim(p_name),p_role='admin') RETURNING id INTO internal_id;
 INSERT INTO cjs_private.memberships(user_id,office_id,role) VALUES(internal_id,p_office_id,CASE WHEN p_role='operator' THEN 'editor' ELSE 'admin' END);
 INSERT INTO cjs_private.company_access(user_id,office_id,company_id) SELECT DISTINCT internal_id,p_office_id,id FROM unnest(p_company_ids) chosen(id);
 INSERT INTO cjs_private.admin_provision_log(actor_id,user_id,office_id) VALUES(who,internal_id,p_office_id);
 RETURN jsonb_build_object('id',internal_id,'name',btrim(p_name));
EXCEPTION WHEN unique_violation THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Já existe uma conta com esse e-mail.';
END $$;
CREATE TABLE cjs_private.access_change_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL REFERENCES cjs_private.users,
 user_id uuid NOT NULL REFERENCES cjs_private.users, office_id uuid NOT NULL REFERENCES cjs_private.offices,
 before_ids jsonb NOT NULL, after_ids jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION cjs_api.manage_update_access(p_user_id uuid,p_office_id uuid,p_company_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE who uuid:=cjs_private.actor(); previous jsonb; target cjs_private.memberships;
BEGIN
 IF who IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 IF NOT cjs_private.manage_office(p_office_id) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Acesso não permitido.'; END IF;
 SELECT * INTO target FROM cjs_private.memberships WHERE user_id=p_user_id AND office_id=p_office_id AND active FOR UPDATE;
 IF NOT FOUND OR target.role NOT IN ('editor','viewer') OR NOT EXISTS(SELECT 1 FROM cjs_private.users WHERE id=p_user_id AND active AND NOT platform_admin) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Selecione um operador deste escritório.'; END IF;
 IF p_company_ids IS NULL OR cardinality(p_company_ids)>1000 OR EXISTS(SELECT 1 FROM unnest(p_company_ids) chosen(id) WHERE id IS NULL OR NOT EXISTS(SELECT 1 FROM cjs_private.companies c WHERE c.id=chosen.id AND c.office_id=p_office_id)) THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Empresas inválidas.'; END IF;
 SELECT coalesce(jsonb_agg(company_id),'[]') INTO previous FROM cjs_private.company_access WHERE user_id=p_user_id AND office_id=p_office_id;
 DELETE FROM cjs_private.company_access WHERE user_id=p_user_id AND office_id=p_office_id;
 INSERT INTO cjs_private.company_access(user_id,office_id,company_id) SELECT DISTINCT p_user_id,p_office_id,id FROM unnest(p_company_ids) chosen(id);
 INSERT INTO cjs_private.access_change_log(actor_id,user_id,office_id,before_ids,after_ids) VALUES(who,p_user_id,p_office_id,previous,to_jsonb(p_company_ids));
 RETURN jsonb_build_object('ok',true);
END $$;
GRANT EXECUTE ON FUNCTION cjs_api.manage_options(),cjs_api.manage_create_user(text,text,text,uuid,text,uuid[]),cjs_api.manage_update_access(uuid,uuid,uuid[]) TO cjs_authenticated;
-- Desativar definitivamente o caminho antigo com senha/gateway administrativo.
CREATE OR REPLACE FUNCTION cjs_api.check_session() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
BEGIN
 IF NOT cjs_private.gateway_valid() AND cjs_private.actor() IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida, expirada ou revogada.'; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION cjs_api.admin_options(),cjs_api.admin_create_user(text,text,text,uuid,text,uuid[]) FROM cjs_admin_gateway;
DROP FUNCTION cjs_api.admin_options(),cjs_api.admin_create_user(text,text,text,uuid,text,uuid[]);
DROP FUNCTION cjs_private.admin_gateway_valid();
NOTIFY pgrst, 'reload schema';
COMMIT;
