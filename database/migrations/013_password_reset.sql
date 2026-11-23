-- Executar após 012 no banco cjs_escala, como administrador (concede UPDATE da senha).
-- "Esqueci minha senha": token de uso único (30 min), guardado só como hash,
-- troca da senha bcrypt em public.users e revogação das sessões abertas.
-- O e-mail é enviado pelo backend via n8n; o banco nunca envia mensagens.
BEGIN;
GRANT UPDATE(password_hash) ON public.users TO cjs_owner;
SET LOCAL ROLE cjs_owner;
CREATE TABLE cjs_private.password_resets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES cjs_private.users,
 token_hash bytea NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 used_at timestamptz,
 canceled_at timestamptz,
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '1 hour')
);
CREATE INDEX password_resets_user ON cjs_private.password_resets(user_id,created_at DESC);
ALTER TABLE cjs_private.password_resets ENABLE ROW LEVEL SECURITY;

-- Conta elegível: identidade com o e-mail, usuário ativo e com acesso a algum escritório ativo.
CREATE FUNCTION cjs_private.reset_target(p_email text) RETURNS TABLE(user_id uuid,identity_id uuid,email text,name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
 SELECT u.id,i.user_id,lower(btrim(i.email)),u.name FROM public.users i
 JOIN cjs_private.users u ON u.identity_subject=i.user_id::text AND u.active
 WHERE lower(btrim(i.email))=lower(btrim(p_email))
 AND (u.platform_admin OR EXISTS(SELECT 1 FROM cjs_private.memberships m JOIN cjs_private.offices o ON o.id=m.office_id WHERE m.user_id=u.id AND m.active AND o.active))
 LIMIT 1
$$;
CREATE FUNCTION cjs_api.password_reset_request(p_email text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE t record; token text; recentes integer;
BEGIN
 IF NOT cjs_private.gateway_valid() THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Serviço não autorizado.'; END IF;
 IF p_email IS NULL OR length(btrim(p_email))>254 OR btrim(p_email) !~ '^\S+@\S+\.\S+$' THEN RAISE SQLSTATE 'PT400' USING MESSAGE='E-mail inválido.'; END IF;
 SELECT * INTO t FROM cjs_private.reset_target(p_email);
 IF t.user_id IS NULL THEN RETURN jsonb_build_object('send',false); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('reset:'||t.user_id::text,0));
 -- No máximo 3 links por hora para a mesma conta (a resposta ao navegador é sempre a mesma).
 SELECT count(*) INTO recentes FROM cjs_private.password_resets WHERE user_id=t.user_id AND created_at>now()-interval '1 hour';
 IF recentes>=3 THEN RETURN jsonb_build_object('send',false,'throttled',true); END IF;
 UPDATE cjs_private.password_resets SET canceled_at=now() WHERE user_id=t.user_id AND used_at IS NULL AND canceled_at IS NULL;
 token:=encode(public.gen_random_bytes(32),'hex');
 INSERT INTO cjs_private.password_resets(user_id,token_hash,expires_at) VALUES(t.user_id,sha256(convert_to(token,'UTF8')),now()+interval '30 minutes');
 RETURN jsonb_build_object('send',true,'token',token,'email',t.email,'name',t.name,'expiresMinutes',30);
END $$;
CREATE FUNCTION cjs_api.password_reset_check(p_token text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE r cjs_private.password_resets;
BEGIN
 IF NOT cjs_private.gateway_valid() THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Serviço não autorizado.'; END IF;
 IF p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('valid',false); END IF;
 SELECT * INTO r FROM cjs_private.password_resets WHERE token_hash=sha256(convert_to(p_token,'UTF8'));
 RETURN jsonb_build_object('valid',FOUND AND r.used_at IS NULL AND r.canceled_at IS NULL AND r.expires_at>now(),'expiresAt',CASE WHEN FOUND THEN r.expires_at END);
END $$;
CREATE FUNCTION cjs_api.password_reset_complete(p_token text,p_password text) RETURNS jsonb
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
 -- Quem tinha a senha antiga perde as sessões abertas.
 UPDATE cjs_private.sessions SET revoked_at=now() WHERE user_id=u.id AND revoked_at IS NULL AND expires_at>now();
 GET DIAGNOSTICS revogadas=ROW_COUNT;
 DELETE FROM cjs_private.password_resets WHERE created_at<now()-interval '90 days';
 RETURN jsonb_build_object('email',lower(btrim(i.email)),'name',u.name,'sessionsRevoked',revogadas);
END $$;
GRANT EXECUTE ON FUNCTION cjs_api.password_reset_request(text),cjs_api.password_reset_check(text),
 cjs_api.password_reset_complete(text,text) TO cjs_identity_gateway;
NOTIFY pgrst,'reload schema';
COMMIT;
