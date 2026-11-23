-- Executar após 014 no banco cjs_escala.
-- Convite de Admin global sem vínculo com escritório (o Admin acessa todos pelo perfil).
BEGIN;
SET LOCAL ROLE cjs_owner;
CREATE OR REPLACE FUNCTION cjs_api.manage_invite_user(p_name text,p_email text,p_office_id uuid,p_role text,p_company_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE identity_id uuid; internal_id uuid; who uuid:=cjs_private.actor(); recentes integer; token text; escritorio text; quem text;
BEGIN
 IF who IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 IF p_role='admin' AND NOT cjs_private.platform_admin() THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Somente o Admin cria outro Admin.'; END IF;
 -- Admin global não tem vínculo com escritório: acessa todos pelo próprio perfil.
 IF p_role='admin' THEN p_office_id:=NULL; p_company_ids:='{}'::uuid[];
 ELSIF p_office_id IS NULL OR NOT cjs_private.manage_office(p_office_id) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Acesso não permitido.'; END IF;
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 160 OR p_email IS NULL OR length(btrim(p_email))>254 OR btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 OR p_role IS NULL OR p_role NOT IN ('operator','manager','admin') OR p_company_ids IS NULL OR cardinality(p_company_ids)>1000 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Dados inválidos.'; END IF;
 IF (p_role='operator' AND cardinality(p_company_ids)=0) OR EXISTS(SELECT 1 FROM unnest(p_company_ids) chosen(id) WHERE id IS NULL OR NOT EXISTS(SELECT 1 FROM cjs_private.companies c WHERE c.id=chosen.id AND c.office_id=p_office_id)) THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Empresas inválidas.'; END IF;
 SELECT count(*) INTO recentes FROM cjs_private.password_resets WHERE requested_by=who AND kind='invite' AND created_at>now()-interval '1 hour';
 IF recentes>=30 THEN RAISE SQLSTATE 'PT429' USING MESSAGE='Muitos convites em pouco tempo. Aguarde e tente novamente.'; END IF;
 -- Senha aleatória descartada: a conta só entra depois que a pessoa criar a própria senha.
 INSERT INTO public.users(username,email,password_hash)
 VALUES(btrim(p_name),lower(btrim(p_email)),public.crypt(encode(public.gen_random_bytes(24),'hex'),public.gen_salt('bf',8))) RETURNING user_id INTO identity_id;
 INSERT INTO cjs_private.users(identity_subject,name,platform_admin) VALUES(identity_id::text,btrim(p_name),p_role='admin') RETURNING id INTO internal_id;
 IF p_office_id IS NOT NULL THEN
  INSERT INTO cjs_private.memberships(user_id,office_id,role) VALUES(internal_id,p_office_id,CASE WHEN p_role='operator' THEN 'editor' ELSE 'admin' END);
  INSERT INTO cjs_private.company_access(user_id,office_id,company_id) SELECT DISTINCT internal_id,p_office_id,id FROM unnest(p_company_ids) chosen(id);
  INSERT INTO cjs_private.admin_provision_log(actor_id,user_id,office_id) VALUES(who,internal_id,p_office_id);
 END IF;
 token:=cjs_private.issue_access_token(internal_id,'invite',interval '7 days',who);
 SELECT name INTO escritorio FROM cjs_private.offices WHERE id=p_office_id;
 SELECT name INTO quem FROM cjs_private.users WHERE id=who;
 RETURN jsonb_build_object('user',jsonb_build_object('id',internal_id,'name',btrim(p_name)),
  'mail',jsonb_build_object('kind','invite','token',token,'email',lower(btrim(p_email)),'name',btrim(p_name),'officeName',escritorio,'invitedBy',quem,'expiresMinutes',10080));
EXCEPTION WHEN unique_violation THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Já existe uma conta com esse e-mail.';
END $$;

CREATE OR REPLACE FUNCTION cjs_api.manage_send_access_link(p_user_id uuid,p_office_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE who uuid:=cjs_private.actor(); u cjs_private.users; email text; kind text; recentes integer; token text; escritorio text; quem text;
BEGIN
 IF who IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 SELECT * INTO u FROM cjs_private.users WHERE id=p_user_id AND active;
 IF NOT FOUND THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Usuário não encontrado.'; END IF;
 IF p_office_id IS NULL THEN
  -- Admin global sem escritório: só outro Admin envia.
  IF NOT (cjs_private.platform_admin() AND u.platform_admin) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Acesso não permitido.'; END IF;
 ELSIF NOT cjs_private.manage_office(p_office_id) OR NOT EXISTS(SELECT 1 FROM cjs_private.memberships WHERE user_id=p_user_id AND office_id=p_office_id AND active)
 OR (u.platform_admin AND NOT cjs_private.platform_admin()) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Usuário fora deste escritório.'; END IF;
 SELECT lower(btrim(i.email)) INTO email FROM public.users i WHERE i.user_id::text=u.identity_subject;
 IF email IS NULL THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Conta sem e-mail cadastrado.'; END IF;
 SELECT count(*) INTO recentes FROM cjs_private.password_resets WHERE user_id=p_user_id AND created_at>now()-interval '1 hour';
 IF recentes>=5 THEN RAISE SQLSTATE 'PT429' USING MESSAGE='Muitos envios para esta pessoa. Aguarde uma hora.'; END IF;
 kind:=CASE WHEN EXISTS(SELECT 1 FROM cjs_private.sessions WHERE user_id=p_user_id) THEN 'reset' ELSE 'invite' END;
 token:=cjs_private.issue_access_token(p_user_id,kind,CASE WHEN kind='invite' THEN interval '7 days' ELSE interval '24 hours' END,who);
 SELECT name INTO escritorio FROM cjs_private.offices WHERE id=p_office_id;
 SELECT name INTO quem FROM cjs_private.users WHERE id=who;
 RETURN jsonb_build_object('kind',kind,'token',token,'email',email,'name',u.name,'officeName',escritorio,'invitedBy',quem,
  'expiresMinutes',CASE WHEN kind='invite' THEN 10080 ELSE 1440 END);
END $$;

CREATE OR REPLACE FUNCTION cjs_api.manage_pending_invites() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
BEGIN
 IF cjs_private.actor() IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('userId',x.user_id,'sentAt',x.created_at,'expiresAt',x.expires_at,
   'expired',x.expires_at<=now() OR x.canceled_at IS NOT NULL)),'[]')
  FROM (SELECT DISTINCT ON (r.user_id) r.* FROM cjs_private.password_resets r
   WHERE r.kind='invite' AND r.used_at IS NULL
   AND NOT EXISTS(SELECT 1 FROM cjs_private.sessions s WHERE s.user_id=r.user_id)
   AND NOT EXISTS(SELECT 1 FROM cjs_private.password_resets d WHERE d.user_id=r.user_id AND d.used_at IS NOT NULL)
   AND (EXISTS(SELECT 1 FROM cjs_private.memberships m WHERE m.user_id=r.user_id AND cjs_private.manage_office(m.office_id))
    OR (cjs_private.platform_admin() AND EXISTS(SELECT 1 FROM cjs_private.users a WHERE a.id=r.user_id AND a.platform_admin)))
   ORDER BY r.user_id,r.created_at DESC) x);
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
