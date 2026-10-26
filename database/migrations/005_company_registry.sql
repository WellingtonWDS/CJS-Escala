BEGIN;
SET LOCAL ROLE cjs_owner;
ALTER TABLE cjs_private.companies ADD COLUMN cnpj text;
CREATE UNIQUE INDEX companies_office_cnpj_unique ON cjs_private.companies(office_id,cnpj) WHERE cnpj IS NOT NULL;
CREATE FUNCTION cjs_private.valid_cnpj(p_value text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE v text:=upper(regexp_replace(coalesce(p_value,''),'[./[:space:]-]','','g')); n integer; i integer; total integer; digit integer;
BEGIN
 IF v !~ '^[A-Z0-9]{12}[0-9]{2}$' OR v ~ '^([0-9])\1{13}$' THEN RETURN false; END IF;
 FOR n IN 12..13 LOOP
  total:=0;
  FOR i IN 1..n LOOP total:=total+(ascii(substr(v,i,1))-48)*((n-i)%8+2); END LOOP;
  digit:=CASE WHEN total%11<2 THEN 0 ELSE 11-total%11 END;
  IF digit<>substr(v,n+1,1)::integer THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
ALTER TABLE cjs_private.companies ADD CONSTRAINT companies_cnpj_valid CHECK(cnpj IS NULL OR (cnpj=upper(regexp_replace(cnpj,'[./[:space:]-]','','g')) AND cjs_private.valid_cnpj(cnpj)));
CREATE TABLE cjs_private.company_registry_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL REFERENCES cjs_private.users,
 office_id uuid NOT NULL REFERENCES cjs_private.offices, company_id uuid NOT NULL REFERENCES cjs_private.companies,
 action text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION cjs_api.list_companies(p_office_id uuid) RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,cjs_private AS $$
 SELECT jsonb_build_object('id',id,'office_id',office_id,'name',name,'cnpj',cnpj) FROM cjs_private.companies WHERE office_id=p_office_id ORDER BY name,id
$$;
CREATE FUNCTION cjs_api.company_options() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
BEGIN
 IF cjs_private.actor() IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 RETURN jsonb_build_object(
 'offices',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'canCreate',cjs_private.manage_office(id)) ORDER BY name),'[]') FROM cjs_private.offices WHERE cjs_private.office_visible(id)),
 'companies',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'officeId',office_id,'name',name,'cnpj',cnpj) ORDER BY name),'[]') FROM cjs_private.companies WHERE cjs_private.allowed(office_id,id))
 );
END $$;
CREATE FUNCTION cjs_private.company_name_key(value text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT regexp_replace(lower(value),'[^[:alnum:]]','','g') $$;
CREATE FUNCTION cjs_api.resolve_company(p_office_id uuid,p_name text,p_cnpj text,p_apply boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE v text:=upper(regexp_replace(coalesce(p_cnpj,''),'[./[:space:]-]','','g')); found_company cjs_private.companies; state text; matches integer;
BEGIN
 IF cjs_private.actor() IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 IF NOT cjs_private.office_visible(p_office_id) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Escritório não autorizado.'; END IF;
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 160 OR NOT cjs_private.valid_cnpj(v) THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Razão social ou CNPJ inválido.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_office_id::text||v,0));
 SELECT * INTO found_company FROM cjs_private.companies WHERE office_id=p_office_id AND cnpj=v;
 IF FOUND THEN
  IF NOT cjs_private.allowed(p_office_id,found_company.id) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Empresa não autorizada.'; END IF;
  RETURN jsonb_build_object('status','existing','company',jsonb_build_object('id',found_company.id,'name',found_company.name,'cnpj',found_company.cnpj));
 END IF;
 SELECT count(*) INTO matches FROM cjs_private.companies WHERE office_id=p_office_id AND cnpj IS NULL AND cjs_private.company_name_key(name)=cjs_private.company_name_key(p_name);
 IF matches=1 THEN
  SELECT * INTO found_company FROM cjs_private.companies WHERE office_id=p_office_id AND cnpj IS NULL AND cjs_private.company_name_key(name)=cjs_private.company_name_key(p_name) FOR UPDATE;
  IF FOUND THEN
   IF NOT cjs_private.allowed(p_office_id,found_company.id) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Empresa não autorizada.'; END IF;
   state:='legacy';
  END IF;
 END IF;
 IF state IS NULL THEN state:='missing'; END IF;
 IF NOT coalesce(p_apply,false) THEN RETURN jsonb_build_object('status',state,'canCreate',cjs_private.manage_office(p_office_id),'company',CASE WHEN state='legacy' THEN jsonb_build_object('id',found_company.id,'name',found_company.name,'cnpj',null) ELSE null END); END IF;
 IF NOT cjs_private.manage_office(p_office_id) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Solicite o cadastro do CNPJ ao gerente.'; END IF;
 IF state='legacy' THEN
  UPDATE cjs_private.companies SET cnpj=v WHERE id=found_company.id RETURNING * INTO found_company;
 ELSE
  INSERT INTO cjs_private.companies(office_id,name,cnpj) VALUES(p_office_id,btrim(p_name),v) RETURNING * INTO found_company;
 END IF;
 INSERT INTO cjs_private.company_registry_log(actor_id,office_id,company_id,action) VALUES(cjs_private.actor(),p_office_id,found_company.id,CASE WHEN state='legacy' THEN 'bind_cnpj' ELSE 'create' END);
 RETURN jsonb_build_object('status',CASE WHEN state='legacy' THEN 'updated' ELSE 'created' END,'company',jsonb_build_object('id',found_company.id,'name',found_company.name,'cnpj',found_company.cnpj));
END $$;
GRANT EXECUTE ON FUNCTION cjs_api.company_options(),cjs_api.resolve_company(uuid,text,text,boolean) TO cjs_authenticated;
-- Gestão de usuários também deve exibir CNPJ nas atribuições de empresas.
CREATE OR REPLACE FUNCTION cjs_api.manage_options() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
BEGIN
 IF cjs_private.actor() IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 IF NOT cjs_private.platform_admin() AND NOT EXISTS(SELECT 1 FROM cjs_private.offices WHERE cjs_private.manage_office(id)) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Acesso não permitido.'; END IF;
 RETURN jsonb_build_object('platformAdmin',cjs_private.platform_admin(),
 'offices',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name),'[]') FROM cjs_private.offices WHERE cjs_private.manage_office(id)),
 'companies',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'officeId',office_id,'name',name,'cnpj',cnpj) ORDER BY name),'[]') FROM cjs_private.companies WHERE cjs_private.manage_office(office_id)),
 'users',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'officeId',m.office_id,'role',CASE WHEN u.platform_admin THEN 'admin' WHEN m.role='admin' THEN 'manager' ELSE 'operator' END,'companyIds',(SELECT coalesce(jsonb_agg(a.company_id),'[]') FROM cjs_private.company_access a WHERE a.user_id=u.id AND a.office_id=m.office_id)) ORDER BY u.name),'[]') FROM cjs_private.users u JOIN cjs_private.memberships m ON m.user_id=u.id WHERE u.active AND m.active AND cjs_private.manage_office(m.office_id) AND (cjs_private.platform_admin() OR (NOT u.platform_admin AND m.role IN ('editor','viewer')))));
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
