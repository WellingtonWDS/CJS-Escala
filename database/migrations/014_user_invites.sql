-- Executar após 013 no banco cjs_escala.
-- Convite por e-mail: o Gerente informa nome e e-mail; a pessoa cria a própria
-- senha por link de uso único (7 dias). Reaproveita os links da migração 013.
-- O Gerente também pode enviar um link de redefinição (24 h) a quem já tem acesso.
BEGIN;
SET LOCAL ROLE cjs_owner;
ALTER TABLE cjs_private.password_resets
 ADD COLUMN kind text NOT NULL DEFAULT 'reset' CHECK(kind IN ('reset','invite')),
 ADD COLUMN requested_by uuid REFERENCES cjs_private.users,
 DROP CONSTRAINT IF EXISTS password_resets_check,
 ADD CONSTRAINT password_resets_validade CHECK(expires_at>created_at AND expires_at<=created_at+interval '7 days');

-- Gera um link novo e cancela os anteriores ainda abertos da mesma conta.
CREATE FUNCTION cjs_private.issue_access_token(p_user uuid,p_kind text,p_valid interval,p_by uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE token text:=encode(public.gen_random_bytes(32),'hex');
BEGIN
 UPDATE cjs_private.password_resets SET canceled_at=now() WHERE user_id=p_user AND used_at IS NULL AND canceled_at IS NULL;
 INSERT INTO cjs_private.password_resets(user_id,token_hash,expires_at,kind,requested_by)
 VALUES(p_user,sha256(convert_to(token,'UTF8')),now()+p_valid,p_kind,p_by);
 RETURN token;
END $$;

CREATE FUNCTION cjs_api.manage_invite_user(p_name text,p_email text,p_office_id uuid,p_role text,p_company_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE identity_id uuid; internal_id uuid; who uuid:=cjs_private.actor(); recentes integer; token text; escritorio text; quem text;
BEGIN
 IF who IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 IF NOT cjs_private.manage_office(p_office_id) OR (p_role='admin' AND NOT cjs_private.platform_admin()) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Acesso não permitido.'; END IF;
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 160 OR p_email IS NULL OR length(btrim(p_email))>254 OR btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 OR p_role IS NULL OR p_role NOT IN ('operator','manager','admin') OR p_company_ids IS NULL OR cardinality(p_company_ids)>1000 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Dados inválidos.'; END IF;
 IF (p_role='operator' AND cardinality(p_company_ids)=0) OR EXISTS(SELECT 1 FROM unnest(p_company_ids) chosen(id) WHERE id IS NULL OR NOT EXISTS(SELECT 1 FROM cjs_private.companies c WHERE c.id=chosen.id AND c.office_id=p_office_id)) THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Empresas inválidas.'; END IF;
 SELECT count(*) INTO recentes FROM cjs_private.password_resets WHERE requested_by=who AND kind='invite' AND created_at>now()-interval '1 hour';
 IF recentes>=30 THEN RAISE SQLSTATE 'PT429' USING MESSAGE='Muitos convites em pouco tempo. Aguarde e tente novamente.'; END IF;
 -- Senha aleatória descartada: a conta só entra depois que a pessoa criar a própria senha.
 INSERT INTO public.users(username,email,password_hash)
 VALUES(btrim(p_name),lower(btrim(p_email)),public.crypt(encode(public.gen_random_bytes(24),'hex'),public.gen_salt('bf',8))) RETURNING user_id INTO identity_id;
 INSERT INTO cjs_private.users(identity_subject,name,platform_admin) VALUES(identity_id::text,btrim(p_name),p_role='admin') RETURNING id INTO internal_id;
 INSERT INTO cjs_private.memberships(user_id,office_id,role) VALUES(internal_id,p_office_id,CASE WHEN p_role='operator' THEN 'editor' ELSE 'admin' END);
 INSERT INTO cjs_private.company_access(user_id,office_id,company_id) SELECT DISTINCT internal_id,p_office_id,id FROM unnest(p_company_ids) chosen(id);
 INSERT INTO cjs_private.admin_provision_log(actor_id,user_id,office_id) VALUES(who,internal_id,p_office_id);
 token:=cjs_private.issue_access_token(internal_id,'invite',interval '7 days',who);
 SELECT name INTO escritorio FROM cjs_private.offices WHERE id=p_office_id;
 SELECT name INTO quem FROM cjs_private.users WHERE id=who;
 RETURN jsonb_build_object('user',jsonb_build_object('id',internal_id,'name',btrim(p_name)),
  'mail',jsonb_build_object('kind','invite','token',token,'email',lower(btrim(p_email)),'name',btrim(p_name),'officeName',escritorio,'invitedBy',quem,'expiresMinutes',10080));
EXCEPTION WHEN unique_violation THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Já existe uma conta com esse e-mail.';
END $$;

-- Reenvio: convite (7 dias) para quem nunca entrou; redefinição (24 h) para quem já usa o sistema.
CREATE FUNCTION cjs_api.manage_send_access_link(p_user_id uuid,p_office_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE who uuid:=cjs_private.actor(); u cjs_private.users; email text; kind text; recentes integer; token text; escritorio text; quem text;
BEGIN
 IF who IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 IF NOT cjs_private.manage_office(p_office_id) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Acesso não permitido.'; END IF;
 SELECT * INTO u FROM cjs_private.users WHERE id=p_user_id AND active;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM cjs_private.memberships WHERE user_id=p_user_id AND office_id=p_office_id AND active)
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

-- Convites ainda não aceitos, para a lista de usuários do Gerente.
CREATE FUNCTION cjs_api.manage_pending_invites() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
BEGIN
 IF cjs_private.actor() IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('userId',x.user_id,'sentAt',x.created_at,'expiresAt',x.expires_at,
   'expired',x.expires_at<=now() OR x.canceled_at IS NOT NULL)),'[]')
  FROM (SELECT DISTINCT ON (r.user_id) r.* FROM cjs_private.password_resets r
   WHERE r.kind='invite' AND r.used_at IS NULL
   AND NOT EXISTS(SELECT 1 FROM cjs_private.sessions s WHERE s.user_id=r.user_id)
   AND NOT EXISTS(SELECT 1 FROM cjs_private.password_resets d WHERE d.user_id=r.user_id AND d.used_at IS NOT NULL)
   AND EXISTS(SELECT 1 FROM cjs_private.memberships m WHERE m.user_id=r.user_id AND cjs_private.manage_office(m.office_id))
   ORDER BY r.user_id,r.created_at DESC) x);
END $$;

-- A página do link precisa saber se é convite (criar senha) ou redefinição.
CREATE OR REPLACE FUNCTION cjs_api.password_reset_check(p_token text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE r cjs_private.password_resets; escritorio text;
BEGIN
 IF NOT cjs_private.gateway_valid() THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Serviço não autorizado.'; END IF;
 IF p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('valid',false); END IF;
 SELECT * INTO r FROM cjs_private.password_resets WHERE token_hash=sha256(convert_to(p_token,'UTF8'));
 IF FOUND AND r.kind='invite' THEN
  SELECT o.name INTO escritorio FROM cjs_private.memberships m JOIN cjs_private.offices o ON o.id=m.office_id WHERE m.user_id=r.user_id AND m.active ORDER BY o.name LIMIT 1;
 END IF;
 RETURN jsonb_build_object('valid',FOUND AND r.used_at IS NULL AND r.canceled_at IS NULL AND r.expires_at>now(),
  'expiresAt',CASE WHEN FOUND THEN r.expires_at END,'kind',CASE WHEN FOUND THEN r.kind END,'officeName',escritorio);
END $$;
CREATE OR REPLACE FUNCTION cjs_api.password_reset_complete(p_token text,p_password text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE r cjs_private.password_resets; u cjs_private.users; i public.users; revogadas integer;
BEGIN
 IF NOT cjs_private.gateway_valid() THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Serviço não autorizado.'; END IF;
 IF p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' THEN RAISE SQLSTATE 'PT410' USING MESSAGE='Link inválido ou expirado.'; END IF;
 IF p_password IS NULL OR length(p_password)<8 OR octet_length(p_password)>72 OR p_password !~ '[[:alpha:]]' OR p_password !~ '[[:digit:]]'
 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='A senha precisa ter de 8 a 72 caracteres, com letras e números.'; END IF;
 SELECT * INTO r FROM cjs_private.password_resets WHERE token_hash=sha256(convert_to(p_token,'UTF8')) FOR UPDATE;
 IF NOT FOUND OR r.used_at IS NOT NULL OR r.canceled_at IS NOT NULL OR r.expires_at<=now() THEN RAISE SQLSTATE 'PT410' USING MESSAGE='Link inválido ou expirado.'; END IF;
 SELECT * INTO u FROM cjs_private.users WHERE id=r.user_id AND active;
 IF NOT FOUND THEN RAISE SQLSTATE 'PT410' USING MESSAGE='Link inválido ou expirado.'; END IF;
 SELECT * INTO i FROM public.users WHERE user_id::text=u.identity_subject FOR UPDATE;
 IF NOT FOUND THEN RAISE SQLSTATE 'PT410' USING MESSAGE='Link inválido ou expirado.'; END IF;
 UPDATE public.users SET password_hash=public.crypt(p_password,public.gen_salt('bf',12)) WHERE user_id=i.user_id;
 UPDATE cjs_private.password_resets SET used_at=now() WHERE id=r.id;
 UPDATE cjs_private.password_resets SET canceled_at=now() WHERE user_id=u.id AND used_at IS NULL AND canceled_at IS NULL;
 UPDATE cjs_private.sessions SET revoked_at=now() WHERE user_id=u.id AND revoked_at IS NULL AND expires_at>now();
 GET DIAGNOSTICS revogadas=ROW_COUNT;
 DELETE FROM cjs_private.password_resets WHERE created_at<now()-interval '90 days';
 RETURN jsonb_build_object('email',lower(btrim(i.email)),'name',u.name,'sessionsRevoked',revogadas,'kind',r.kind);
END $$;
GRANT EXECUTE ON FUNCTION cjs_api.manage_invite_user(text,text,uuid,text,uuid[]),cjs_api.manage_send_access_link(uuid,uuid),
 cjs_api.manage_pending_invites() TO cjs_authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
