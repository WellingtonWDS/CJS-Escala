BEGIN;
GRANT UPDATE(username,email) ON public.users TO cjs_owner;
SET LOCAL ROLE cjs_owner;
ALTER TABLE cjs_private.users ADD COLUMN management_revision integer NOT NULL DEFAULT 1 CHECK(management_revision>0);
CREATE TABLE cjs_private.user_change_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL REFERENCES cjs_private.users,
 user_id uuid NOT NULL REFERENCES cjs_private.users, office_id uuid REFERENCES cjs_private.offices,
 before_data jsonb NOT NULL, after_data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION cjs_api.manage_options() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE who uuid:=cjs_private.actor(); elevated boolean:=cjs_private.platform_admin();
BEGIN
 IF who IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 IF NOT elevated AND NOT EXISTS(SELECT 1 FROM cjs_private.offices WHERE cjs_private.manage_office(id)) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Acesso não permitido.'; END IF;
 RETURN jsonb_build_object(
 'currentUserId',who,'platformAdmin',elevated,
 'offices',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'active',active) ORDER BY name),'[]') FROM cjs_private.offices WHERE elevated OR cjs_private.manage_office(id)),
 'companies',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'officeId',office_id,'name',name,'cnpj',cnpj) ORDER BY name),'[]') FROM cjs_private.companies WHERE elevated OR cjs_private.manage_office(office_id)),
 'users',(SELECT coalesce(jsonb_agg(jsonb_build_object(
 'id',u.id,'name',u.name,'email',i.email,'officeId',m.office_id,
 'role',CASE WHEN u.platform_admin THEN 'admin' WHEN m.role='admin' THEN 'manager' WHEN m.role='viewer' THEN 'viewer' ELSE 'operator' END,
 'accountActive',u.active,'membershipActive',coalesce(m.active,true),'active',u.active AND (u.platform_admin OR coalesce(m.active,false)),
 'revision',u.management_revision,'canEdit',elevated OR NOT u.platform_admin,
 'canEditIdentity',elevated OR NOT EXISTS(SELECT 1 FROM cjs_private.memberships other WHERE other.user_id=u.id AND other.office_id<>m.office_id),
 'companyIds',(SELECT coalesce(jsonb_agg(a.company_id ORDER BY a.company_id),'[]') FROM cjs_private.company_access a WHERE a.user_id=u.id AND a.office_id=m.office_id)
 ) ORDER BY u.name,u.id,m.office_id),'[]') FROM cjs_private.users u LEFT JOIN cjs_private.memberships m ON m.user_id=u.id LEFT JOIN public.users i ON i.user_id::text=u.identity_subject WHERE elevated OR cjs_private.manage_office(m.office_id))
 );
END $$;
CREATE FUNCTION cjs_api.manage_update_user(p_user_id uuid,p_office_id uuid,p_revision integer,p_name text,p_email text,p_role text,p_active boolean,p_account_active boolean,p_company_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE who uuid:=cjs_private.actor(); elevated boolean:=cjs_private.platform_admin(); target cjs_private.users; membership cjs_private.memberships; identity_row public.users; previous jsonb; before_state jsonb; next_admin boolean; next_role text;
BEGIN
 IF who IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 IF NOT elevated AND NOT cjs_private.manage_office(p_office_id) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Acesso não permitido.'; END IF;
 -- Serializa alterações administrativas, inclusive a proteção do último Admin.
 PERFORM pg_advisory_xact_lock(876141008);
 SELECT * INTO target FROM cjs_private.users WHERE id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='Usuário não encontrado.'; END IF;
 IF target.platform_admin AND NOT elevated THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Somente Admin pode editar Admin.'; END IF;
 IF p_office_id IS NOT NULL THEN
  SELECT * INTO membership FROM cjs_private.memberships WHERE user_id=p_user_id AND office_id=p_office_id FOR UPDATE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Usuário não pertence a este escritório.'; END IF;
 ELSIF NOT elevated OR EXISTS(SELECT 1 FROM cjs_private.memberships WHERE user_id=p_user_id) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Selecione o escritório do usuário.';
 END IF;
 IF p_revision IS NULL OR p_revision<>target.management_revision THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Cadastro alterado. Atualize a lista antes de salvar.'; END IF;
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 160 OR p_role IS NULL OR p_role NOT IN ('operator','manager','admin','viewer') OR p_active IS NULL OR p_account_active IS NULL OR p_company_ids IS NULL OR cardinality(p_company_ids)>1000
 OR (p_email IS NOT NULL AND (length(p_email)>254 OR btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Dados inválidos.'; END IF;
 SELECT * INTO identity_row FROM public.users WHERE user_id::text=target.identity_subject;
 IF NOT elevated AND (p_role='admin' OR p_account_active<>target.active) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Alteração global não permitida.'; END IF;
 IF NOT elevated AND EXISTS(SELECT 1 FROM cjs_private.memberships WHERE user_id=p_user_id AND office_id<>p_office_id) AND (btrim(p_name)<>target.name OR lower(btrim(p_email)) IS DISTINCT FROM identity_row.email) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Conta vinculada a outros escritórios. Solicite ao Admin a edição de nome e e-mail.'; END IF;
 IF (identity_row.user_id IS NOT NULL AND p_email IS NULL) OR (identity_row.user_id IS NULL AND p_email IS NOT NULL) THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Identidade de acesso incompatível.'; END IF;
 IF p_role='viewer' AND membership.role IS DISTINCT FROM 'viewer' THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Perfil de consulta exclusivo de vínculos legados.'; END IF;
 IF p_office_id IS NULL AND p_role IS DISTINCT FROM (CASE WHEN target.platform_admin THEN 'admin' ELSE 'operator' END) THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Cadastre o vínculo antes de alterar o perfil.'; END IF;
 next_admin:=CASE WHEN elevated THEN p_role='admin' ELSE target.platform_admin END;
 next_role:=CASE WHEN p_role IN ('admin','manager') THEN 'admin' WHEN p_role='viewer' THEN 'viewer' ELSE 'editor' END;
 IF who=p_user_id AND (NOT p_active OR NOT p_account_active OR next_admin<>target.platform_admin OR (p_office_id IS NOT NULL AND membership.role<>next_role)) THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Não é possível inativar ou alterar o próprio perfil.'; END IF;
 IF target.platform_admin AND target.active AND (NOT next_admin OR NOT p_account_active) AND NOT EXISTS(SELECT 1 FROM cjs_private.users WHERE platform_admin AND active AND id<>p_user_id) THEN RAISE SQLSTATE 'PT400' USING MESSAGE='É necessário manter ao menos um Admin ativo.'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_company_ids) chosen(id) WHERE id IS NULL OR NOT EXISTS(SELECT 1 FROM cjs_private.companies c WHERE c.id=chosen.id AND c.office_id=p_office_id)) THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Empresas inválidas.'; END IF;
 SELECT coalesce(jsonb_agg(company_id ORDER BY company_id),'[]') INTO previous FROM cjs_private.company_access WHERE user_id=p_user_id AND office_id=p_office_id;
 before_state:=jsonb_build_object('name',target.name,'email',identity_row.email,'platformAdmin',target.platform_admin,'accountActive',target.active,'membershipActive',membership.active,'role',membership.role,'companyIds',previous);
 UPDATE cjs_private.users SET name=btrim(p_name),active=p_account_active,platform_admin=next_admin,management_revision=management_revision+1 WHERE id=p_user_id;
 IF identity_row.user_id IS NOT NULL THEN UPDATE public.users SET username=btrim(p_name),email=lower(btrim(p_email)) WHERE user_id=identity_row.user_id; END IF;
 IF p_office_id IS NOT NULL THEN
  UPDATE cjs_private.memberships SET role=next_role,active=p_active WHERE user_id=p_user_id AND office_id=p_office_id;
  DELETE FROM cjs_private.company_access WHERE user_id=p_user_id AND office_id=p_office_id;
  INSERT INTO cjs_private.company_access(user_id,office_id,company_id) SELECT DISTINCT p_user_id,p_office_id,id FROM unnest(p_company_ids) chosen(id);
 END IF;
 INSERT INTO cjs_private.access_change_log(actor_id,user_id,office_id,before_ids,after_ids) SELECT who,p_user_id,p_office_id,previous,to_jsonb(p_company_ids) WHERE p_office_id IS NOT NULL;
 IF NOT p_account_active THEN UPDATE cjs_private.sessions SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE user_id=p_user_id AND revoked_at IS NULL; END IF;
 INSERT INTO cjs_private.user_change_log(actor_id,user_id,office_id,before_data,after_data) VALUES(who,p_user_id,p_office_id,before_state,jsonb_build_object('name',btrim(p_name),'email',lower(btrim(p_email)),'platformAdmin',next_admin,'accountActive',p_account_active,'membershipActive',p_active,'role',next_role,'companyIds',to_jsonb(p_company_ids)));
 RETURN jsonb_build_object('ok',true,'revision',target.management_revision+1);
EXCEPTION WHEN unique_violation THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Já existe uma conta com esse e-mail.';
END $$;
-- O caminho antigo continua autorizado apenas para Operadores, mas participa da revisão.
CREATE OR REPLACE FUNCTION cjs_api.manage_update_access(p_user_id uuid,p_office_id uuid,p_company_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE target cjs_private.users; membership cjs_private.memberships; email text;
BEGIN
 IF cjs_private.actor() IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 IF NOT cjs_private.manage_office(p_office_id) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Acesso não permitido.'; END IF;
 PERFORM pg_advisory_xact_lock(876141008);
 SELECT * INTO target FROM cjs_private.users WHERE id=p_user_id FOR UPDATE;
 SELECT * INTO membership FROM cjs_private.memberships WHERE user_id=p_user_id AND office_id=p_office_id;
 IF target.id IS NULL OR target.platform_admin OR NOT target.active OR NOT coalesce(membership.active,false) OR membership.role NOT IN ('editor','viewer') THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Selecione um operador deste escritório.'; END IF;
 SELECT i.email INTO email FROM public.users i WHERE i.user_id::text=target.identity_subject;
 PERFORM cjs_api.manage_update_user(p_user_id,p_office_id,target.management_revision,target.name,email,CASE WHEN membership.role='viewer' THEN 'viewer' ELSE 'operator' END,membership.active,target.active,p_company_ids);
 RETURN jsonb_build_object('ok',true);
END $$;
GRANT EXECUTE ON FUNCTION cjs_api.manage_update_user(uuid,uuid,integer,text,text,text,boolean,boolean,uuid[]) TO cjs_authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
