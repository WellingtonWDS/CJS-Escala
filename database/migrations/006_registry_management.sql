BEGIN;
SET LOCAL ROLE cjs_owner;
ALTER TABLE cjs_private.company_registry_log ADD COLUMN details jsonb NOT NULL DEFAULT '{}';
CREATE TABLE cjs_private.office_registry_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL REFERENCES cjs_private.users,
 office_id uuid NOT NULL REFERENCES cjs_private.offices, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION cjs_api.update_company(p_office_id uuid,p_company_id uuid,p_name text,p_cnpj text,p_previous_name text,p_previous_cnpj text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE current_company cjs_private.companies; v text:=upper(regexp_replace(coalesce(p_cnpj,''),'[./[:space:]-]','','g')); previous jsonb;
BEGIN
 IF cjs_private.actor() IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 IF NOT cjs_private.manage_office(p_office_id) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Acesso não permitido.'; END IF;
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 160 OR NOT cjs_private.valid_cnpj(v) THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Dados inválidos.'; END IF;
 SELECT * INTO current_company FROM cjs_private.companies WHERE id=p_company_id AND office_id=p_office_id FOR UPDATE;
 IF NOT FOUND THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Empresa não autorizada.'; END IF;
 IF current_company.name IS DISTINCT FROM p_previous_name OR current_company.cnpj IS DISTINCT FROM p_previous_cnpj THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Cadastro alterado. Reabra antes de salvar.'; END IF;
 previous:=jsonb_build_object('name',current_company.name,'cnpj',current_company.cnpj);
 UPDATE cjs_private.companies SET name=btrim(p_name),cnpj=v WHERE id=current_company.id RETURNING * INTO current_company;
 INSERT INTO cjs_private.company_registry_log(actor_id,office_id,company_id,action,details)
 VALUES(cjs_private.actor(),p_office_id,current_company.id,'update',jsonb_build_object('before',previous,'after',jsonb_build_object('name',current_company.name,'cnpj',current_company.cnpj)));
 RETURN jsonb_build_object('company',jsonb_build_object('id',current_company.id,'name',current_company.name,'cnpj',current_company.cnpj));
EXCEPTION WHEN unique_violation THEN RAISE SQLSTATE 'PT409' USING MESSAGE='CNPJ já cadastrado neste escritório.';
END $$;
CREATE FUNCTION cjs_api.create_office(p_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE target cjs_private.offices;
BEGIN
 IF cjs_private.actor() IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 IF NOT cjs_private.platform_admin() THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Somente Admin pode cadastrar escritórios.'; END IF;
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 160 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Nome inválido.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('office:'||lower(btrim(p_name)),0));
 IF (SELECT count(*) FROM cjs_private.offices WHERE lower(btrim(name))=lower(btrim(p_name)))>1 THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Nome de escritório ambíguo.'; END IF;
 SELECT * INTO target FROM cjs_private.offices WHERE lower(btrim(name))=lower(btrim(p_name));
 IF FOUND THEN
  IF NOT target.active THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Já existe escritório inativo com esse nome.'; END IF;
  RETURN jsonb_build_object('status','existing','office',jsonb_build_object('id',target.id,'name',target.name));
 END IF;
 INSERT INTO cjs_private.offices(name) VALUES(btrim(p_name)) RETURNING * INTO target;
 INSERT INTO cjs_private.office_registry_log(actor_id,office_id) VALUES(cjs_private.actor(),target.id);
 RETURN jsonb_build_object('status','created','office',jsonb_build_object('id',target.id,'name',target.name));
END $$;
GRANT EXECUTE ON FUNCTION cjs_api.update_company(uuid,uuid,text,text,text,text),cjs_api.create_office(text) TO cjs_authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
