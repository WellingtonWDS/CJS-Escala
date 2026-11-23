-- Executar após 018 no banco cjs_escala.
-- Minha conta: editar o próprio nome e trocar o e-mail com confirmação pelo link
-- enviado ao endereço novo (24 h). Exige a senha atual para pedir a troca.
BEGIN;
SET LOCAL ROLE cjs_owner;
CREATE TABLE cjs_private.email_changes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES cjs_private.users,
 new_email text NOT NULL CHECK(length(new_email) BETWEEN 3 AND 254),
 token_hash bytea NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL CHECK(expires_at>created_at AND expires_at<=created_at+interval '1 day'),
 used_at timestamptz,
 canceled_at timestamptz
);
CREATE INDEX email_changes_user ON cjs_private.email_changes(user_id,created_at DESC);
ALTER TABLE cjs_private.email_changes ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION cjs_api.my_account() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE who uuid:=cjs_private.actor();
BEGIN
 IF who IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 RETURN (SELECT jsonb_build_object('name',u.name,'email',lower(btrim(i.email)),
  'pendingEmail',(SELECT c.new_email FROM cjs_private.email_changes c WHERE c.user_id=u.id AND c.used_at IS NULL AND c.canceled_at IS NULL AND c.expires_at>now() ORDER BY c.created_at DESC LIMIT 1))
  FROM cjs_private.users u LEFT JOIN public.users i ON i.user_id::text=u.identity_subject WHERE u.id=who);
END $$;

CREATE FUNCTION cjs_api.update_own_name(p_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE who uuid:=cjs_private.actor(); u cjs_private.users; antes text;
BEGIN
 IF who IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 2 AND 160 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Informe o nome completo.'; END IF;
 SELECT * INTO u FROM cjs_private.users WHERE id=who FOR UPDATE;
 antes:=u.name;
 UPDATE cjs_private.users SET name=btrim(p_name),management_revision=management_revision+1 WHERE id=who;
 UPDATE public.users SET username=btrim(p_name) WHERE user_id::text=u.identity_subject;
 INSERT INTO cjs_private.user_change_log(actor_id,user_id,office_id,before_data,after_data)
 VALUES(who,who,NULL,jsonb_build_object('name',antes),jsonb_build_object('name',btrim(p_name),'selfService',true));
 RETURN jsonb_build_object('name',btrim(p_name));
END $$;

-- Pedido de troca: confere a senha atual e o novo endereço; devolve o link só ao backend.
CREATE FUNCTION cjs_api.request_email_change(p_new_email text,p_password text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE who uuid:=cjs_private.actor(); u cjs_private.users; i public.users; novo text:=lower(btrim(coalesce(p_new_email,''))); token text; recentes integer; balde text; erros integer;
BEGIN
 IF who IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 IF length(novo)>254 OR novo !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Informe um e-mail válido.'; END IF;
 IF p_password IS NULL OR octet_length(p_password)>256 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Informe a senha atual.'; END IF;
 SELECT * INTO u FROM cjs_private.users WHERE id=who AND active;
 SELECT * INTO i FROM public.users WHERE user_id::text=u.identity_subject;
 IF NOT FOUND THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Conta sem e-mail de acesso para alterar.'; END IF;
 -- Mesmo limite de erros de senha da troca de senha.
 balde:='change:'||who::text;
 DELETE FROM cjs_private.login_attempts WHERE bucket=balde AND started_at<now()-interval '15 minutes';
 SELECT attempts INTO erros FROM cjs_private.login_attempts WHERE bucket=balde;
 IF coalesce(erros,0)>=5 THEN RAISE SQLSTATE 'PT429' USING MESSAGE='Muitas tentativas com a senha atual incorreta. Aguarde 15 minutos.'; END IF;
 IF i.password_hash IS NULL OR i.password_hash<>public.crypt(p_password,i.password_hash) THEN
  INSERT INTO cjs_private.login_attempts AS a VALUES(balde,now(),1) ON CONFLICT(bucket) DO UPDATE SET attempts=a.attempts+1;
  RETURN jsonb_build_object('ok',false,'reason','senha_atual','remaining',greatest(0,4-coalesce(erros,0)));
 END IF;
 IF novo=lower(btrim(i.email)) THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Este já é o seu e-mail de acesso.'; END IF;
 IF EXISTS(SELECT 1 FROM public.users WHERE lower(btrim(email))=novo) THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Este e-mail já está em uso em outra conta.'; END IF;
 SELECT count(*) INTO recentes FROM cjs_private.email_changes WHERE user_id=who AND created_at>now()-interval '1 hour';
 IF recentes>=3 THEN RAISE SQLSTATE 'PT429' USING MESSAGE='Muitos pedidos de troca de e-mail. Aguarde uma hora.'; END IF;
 DELETE FROM cjs_private.login_attempts WHERE bucket=balde;
 UPDATE cjs_private.email_changes SET canceled_at=now() WHERE user_id=who AND used_at IS NULL AND canceled_at IS NULL;
 token:=encode(public.gen_random_bytes(32),'hex');
 INSERT INTO cjs_private.email_changes(user_id,new_email,token_hash,expires_at) VALUES(who,novo,sha256(convert_to(token,'UTF8')),now()+interval '24 hours');
 RETURN jsonb_build_object('ok',true,'token',token,'newEmail',novo,'oldEmail',lower(btrim(i.email)),'name',u.name,'expiresMinutes',1440);
END $$;

-- Confirmação pelo link (sem sessão): só o backend chama.
CREATE FUNCTION cjs_api.confirm_email_change(p_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE c cjs_private.email_changes; u cjs_private.users; antigo text;
BEGIN
 IF NOT cjs_private.gateway_valid() THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Serviço não autorizado.'; END IF;
 IF p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' THEN RAISE SQLSTATE 'PT410' USING MESSAGE='Link inválido ou expirado.'; END IF;
 SELECT * INTO c FROM cjs_private.email_changes WHERE token_hash=sha256(convert_to(p_token,'UTF8')) FOR UPDATE;
 IF NOT FOUND OR c.used_at IS NOT NULL OR c.canceled_at IS NOT NULL OR c.expires_at<=now() THEN RAISE SQLSTATE 'PT410' USING MESSAGE='Link inválido ou expirado.'; END IF;
 SELECT * INTO u FROM cjs_private.users WHERE id=c.user_id AND active;
 IF NOT FOUND THEN RAISE SQLSTATE 'PT410' USING MESSAGE='Link inválido ou expirado.'; END IF;
 IF EXISTS(SELECT 1 FROM public.users WHERE lower(btrim(email))=c.new_email AND user_id::text<>u.identity_subject) THEN
  UPDATE cjs_private.email_changes SET canceled_at=now() WHERE id=c.id;
  RAISE SQLSTATE 'PT409' USING MESSAGE='Este e-mail passou a ser usado por outra conta.';
 END IF;
 SELECT lower(btrim(email)) INTO antigo FROM public.users WHERE user_id::text=u.identity_subject FOR UPDATE;
 UPDATE public.users SET email=c.new_email WHERE user_id::text=u.identity_subject;
 UPDATE cjs_private.email_changes SET used_at=now() WHERE id=c.id;
 UPDATE cjs_private.email_changes SET canceled_at=now() WHERE user_id=u.id AND used_at IS NULL AND canceled_at IS NULL;
 -- Links de senha enviados ao endereço antigo deixam de valer.
 UPDATE cjs_private.password_resets SET canceled_at=now() WHERE user_id=u.id AND used_at IS NULL AND canceled_at IS NULL;
 INSERT INTO cjs_private.user_change_log(actor_id,user_id,office_id,before_data,after_data)
 VALUES(u.id,u.id,NULL,jsonb_build_object('email',antigo),jsonb_build_object('email',c.new_email,'selfService',true));
 RETURN jsonb_build_object('oldEmail',antigo,'newEmail',c.new_email,'name',u.name);
END $$;
REVOKE ALL ON FUNCTION cjs_api.my_account(),cjs_api.update_own_name(text),cjs_api.request_email_change(text,text),cjs_api.confirm_email_change(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cjs_api.my_account(),cjs_api.update_own_name(text),cjs_api.request_email_change(text,text) TO cjs_authenticated;
GRANT EXECUTE ON FUNCTION cjs_api.confirm_email_change(text) TO cjs_identity_gateway;
NOTIFY pgrst,'reload schema';
COMMIT;
