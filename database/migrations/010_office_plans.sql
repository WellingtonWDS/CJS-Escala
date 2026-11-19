-- Executar após 009 no banco cjs_escala.
-- Planos por escritório: limite de empresas (CNPJ) por ciclo mensal, limite de
-- colaboradores por empresa, troca de quadro como vaga extra, empresas
-- arquivadas (somente visualização), CNPJ travado após o primeiro uso e
-- escritório DEMO visível apenas para Admin. Escritório sem plano = sem limite.
BEGIN;
SET LOCAL ROLE cjs_owner;

ALTER TABLE cjs_private.offices ADD COLUMN demo boolean NOT NULL DEFAULT false;
UPDATE cjs_private.offices SET demo=true WHERE id='de000000-0000-4000-8000-000000000001';

ALTER TABLE cjs_private.companies
 ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN first_used_at timestamptz,
 ADD COLUMN archived_at timestamptz,
 ADD COLUMN archived_by uuid REFERENCES cjs_private.users,
 ADD CONSTRAINT companies_archived_pair CHECK((archived_at IS NULL)=(archived_by IS NULL));
-- Empresas que já têm preenchimento salvo contam como usadas (CNPJ travado).
UPDATE cjs_private.companies c SET first_used_at=d.first_at
FROM (SELECT company_id,min(changed_at) first_at FROM cjs_private.draft_versions GROUP BY company_id) d
WHERE d.company_id=c.id;

CREATE TABLE cjs_private.office_plans (
 office_id uuid PRIMARY KEY REFERENCES cjs_private.offices,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 60),
 company_limit integer NOT NULL CHECK(company_limit BETWEEN 1 AND 10000),
 employee_limit integer NOT NULL DEFAULT 50 CHECK(employee_limit BETWEEN 1 AND 500),
 cycle_anchor date NOT NULL,
 status text NOT NULL DEFAULT 'ativo' CHECK(status IN ('ativo','suspenso')),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=500),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_by uuid NOT NULL REFERENCES cjs_private.users,
 updated_at timestamptz NOT NULL DEFAULT now()
);
-- Empresas usadas em cada ciclo: arquivar no meio do ciclo não libera a vaga até o fim dele.
CREATE TABLE cjs_private.plan_usage (
 office_id uuid NOT NULL, company_id uuid NOT NULL, cycle_start date NOT NULL,
 first_at timestamptz NOT NULL DEFAULT now(), last_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(office_id,cycle_start,company_id),
 FOREIGN KEY(company_id,office_id) REFERENCES cjs_private.companies(id,office_id)
);
-- Vagas adicionais do ciclo: troca de quadro (consome) e cortesia do Admin (amplia o limite).
CREATE TABLE cjs_private.plan_extras (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 office_id uuid NOT NULL REFERENCES cjs_private.offices, company_id uuid,
 cycle_start date NOT NULL, kind text NOT NULL CHECK(kind IN ('troca','cortesia')),
 quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 100),
 reason text NOT NULL DEFAULT '' CHECK(length(reason)<=300),
 actor_id uuid NOT NULL REFERENCES cjs_private.users, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,office_id) REFERENCES cjs_private.companies(id,office_id)
);
CREATE INDEX plan_extras_cycle ON cjs_private.plan_extras(office_id,cycle_start);
-- Quadro de cada empresa guardado apenas como hash do nome normalizado (sem nomes em claro).
CREATE TABLE cjs_private.roster_hashes (
 office_id uuid NOT NULL, company_id uuid NOT NULL, name_hash bytea NOT NULL,
 first_seen date NOT NULL, last_seen date NOT NULL, baseline boolean NOT NULL DEFAULT false,
 PRIMARY KEY(company_id,name_hash),
 FOREIGN KEY(company_id,office_id) REFERENCES cjs_private.companies(id,office_id)
);
CREATE TABLE cjs_private.plan_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 office_id uuid NOT NULL REFERENCES cjs_private.offices, company_id uuid,
 kind text NOT NULL CHECK(kind IN ('plano_salvo','plano_removido','vaga_cortesia','troca_detectada','troca_confirmada','arquivada','desarquivada','bloqueio','demo','cnpj_alterado')),
 details jsonb NOT NULL DEFAULT '{}', actor_id uuid REFERENCES cjs_private.users,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,office_id) REFERENCES cjs_private.companies(id,office_id)
);
CREATE INDEX plan_events_office ON cjs_private.plan_events(office_id,created_at DESC);
ALTER TABLE cjs_private.office_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE cjs_private.plan_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE cjs_private.plan_extras ENABLE ROW LEVEL SECURITY;
ALTER TABLE cjs_private.roster_hashes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cjs_private.plan_events ENABLE ROW LEVEL SECURITY;

-- DEMO: visível somente para Admin global, mesmo para quem tem vínculo.
CREATE OR REPLACE FUNCTION cjs_private.office_visible(p_office uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
 SELECT EXISTS(SELECT 1 FROM cjs_private.offices o WHERE o.id=p_office AND o.active AND
 (cjs_private.platform_admin() OR (NOT o.demo AND EXISTS(SELECT 1 FROM cjs_private.memberships m WHERE m.user_id=cjs_private.actor() AND m.office_id=o.id AND m.active))))
$$;
CREATE OR REPLACE FUNCTION cjs_private.allowed(p_office uuid,p_company uuid,p_write boolean DEFAULT false) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
 SELECT EXISTS(SELECT 1 FROM cjs_private.offices o JOIN cjs_private.companies c ON c.office_id=o.id
 WHERE o.id=p_office AND c.id=p_company AND o.active AND
 (cjs_private.platform_admin() OR (NOT o.demo AND EXISTS(SELECT 1 FROM cjs_private.memberships m WHERE m.user_id=cjs_private.actor() AND m.office_id=o.id AND m.active
 AND (NOT p_write OR m.role IN ('admin','editor')) AND (m.role='admin' OR EXISTS(SELECT 1 FROM cjs_private.company_access a WHERE a.user_id=m.user_id AND a.office_id=m.office_id AND a.company_id=c.id))))))
$$;
CREATE OR REPLACE FUNCTION cjs_private.manage_office(p_office uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
 SELECT EXISTS(SELECT 1 FROM cjs_private.offices o WHERE o.id=p_office AND o.active AND
 (cjs_private.platform_admin() OR (NOT o.demo AND EXISTS(SELECT 1 FROM cjs_private.memberships m WHERE m.user_id=cjs_private.actor() AND m.office_id=o.id AND m.active AND m.role='admin'))))
$$;

CREATE FUNCTION cjs_private.today() RETURNS date
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$ SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date $$;
-- Ciclo mensal a partir do dia de início do plano (dia 31 cai no último dia dos meses menores).
CREATE FUNCTION cjs_private.cycle_start(p_anchor date,p_day date) RETURNS date
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE n integer; s date;
BEGIN
 IF p_day<=p_anchor THEN RETURN p_anchor; END IF;
 n:=((extract(year FROM p_day)-extract(year FROM p_anchor))*12+extract(month FROM p_day)-extract(month FROM p_anchor))::integer;
 s:=(p_anchor+make_interval(months=>n))::date;
 IF s>p_day THEN s:=(p_anchor+make_interval(months=>n-1))::date; END IF;
 RETURN s;
END $$;
CREATE FUNCTION cjs_private.name_hash(p_company uuid,p_name text) RETURNS bytea
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT sha256(convert_to(p_company::text||':'||btrim(regexp_replace(translate(lower(p_name),
 'áàâãäåéèêëíìîïóòôõöúùûüçñý','aaaaaaeeeeiiiiooooouuuucny'),'[^a-z0-9]+',' ','g')),'UTF8'))
$$;
-- Situação do plano no ciclo atual. NULL quando o escritório não tem plano (sem limite).
CREATE FUNCTION cjs_private.plan_snapshot(p_office uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE p cjs_private.office_plans; cs date; ce date; used_companies integer; swaps integer; courtesy integer; cap integer;
BEGIN
 SELECT * INTO p FROM cjs_private.office_plans WHERE office_id=p_office;
 IF NOT FOUND THEN RETURN NULL; END IF;
 cs:=cjs_private.cycle_start(p.cycle_anchor,cjs_private.today());
 ce:=cjs_private.cycle_start(p.cycle_anchor,(cs+interval '1 month' + interval '3 days')::date);
 IF ce<=cs THEN ce:=(cs+interval '1 month')::date; END IF;
 SELECT count(*) INTO used_companies FROM (
  SELECT id FROM cjs_private.companies WHERE office_id=p_office AND archived_at IS NULL
  UNION SELECT company_id FROM cjs_private.plan_usage WHERE office_id=p_office AND cycle_start=cs) x;
 SELECT coalesce(sum(quantity) FILTER (WHERE kind='troca'),0),coalesce(sum(quantity) FILTER (WHERE kind='cortesia'),0)
 INTO swaps,courtesy FROM cjs_private.plan_extras WHERE office_id=p_office AND cycle_start=cs;
 cap:=p.company_limit+courtesy;
 RETURN jsonb_build_object('limited',true,'name',p.name,'status',p.status,'companyLimit',p.company_limit,
  'employeeLimit',p.employee_limit,'courtesy',courtesy,'capacity',cap,'companies',used_companies,'swaps',swaps,
  'used',used_companies+swaps,'free',greatest(cap-used_companies-swaps,0),'cycleStart',cs,'renewsAt',ce,
  'cycleAnchor',p.cycle_anchor,'revision',p.revision,'notes',p.notes);
END $$;
CREATE FUNCTION cjs_private.plan_event(p_office uuid,p_company uuid,p_kind text,p_details jsonb DEFAULT '{}') RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
 INSERT INTO cjs_private.plan_events(office_id,company_id,kind,details,actor_id) VALUES(p_office,p_company,p_kind,coalesce(p_details,'{}'),cjs_private.actor())
$$;
CREATE FUNCTION cjs_private.company_json(c cjs_private.companies) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,cjs_private AS $$
 SELECT jsonb_build_object('id',c.id,'office_id',c.office_id,'officeId',c.office_id,'name',c.name,'cnpj',c.cnpj,
  'archived',c.archived_at IS NOT NULL,'archivedAt',c.archived_at,'cnpjLocked',c.first_used_at IS NOT NULL)
$$;

-- Conferência do plano antes de gerar, buscar ajustes, salvar, importar ou exportar.
CREATE FUNCTION cjs_api.plan_register_use(p_office_id uuid,p_company_id uuid,p_action text,p_names text[],p_confirm_swap boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE who uuid:=cjs_private.actor(); c cjs_private.companies; snap jsonb; cs date; d date:=cjs_private.today();
 hashes bytea[]; n integer; has_base boolean; recent integer; manager boolean;
BEGIN
 IF who IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('gerar','proposta','ajustes','salvar','importar','exportar') OR p_names IS NULL OR cardinality(p_names)>1000
 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Uso inválido.'; END IF;
 IF NOT cjs_private.allowed(p_office_id,p_company_id,p_action IN ('salvar','importar')) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Empresa não autorizada.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('plan:'||p_office_id::text,0));
 SELECT * INTO c FROM cjs_private.companies WHERE id=p_company_id AND office_id=p_office_id FOR UPDATE;
 IF c.archived_at IS NOT NULL THEN
  RETURN jsonb_build_object('status','bloqueado','reason','arquivada','message','Empresa arquivada: somente visualização. Peça ao gerente para reativá-la.');
 END IF;
 SELECT array_agg(DISTINCT cjs_private.name_hash(p_company_id,x)) INTO hashes FROM unnest(p_names) x
 WHERE length(btrim(coalesce(x,'')))>0 AND length(x)<=200;
 n:=coalesce(cardinality(hashes),0);
 snap:=cjs_private.plan_snapshot(p_office_id);
 manager:=cjs_private.manage_office(p_office_id);
 IF snap IS NOT NULL AND snap->>'status'='suspenso' THEN
  RETURN jsonb_build_object('status','bloqueado','reason','suspenso','message','O plano deste escritório está suspenso. Fale com a Fintria para reativá-lo.','plan',snap);
 END IF;
 IF snap IS NOT NULL AND n>(snap->>'employeeLimit')::integer THEN
  PERFORM cjs_private.plan_event(p_office_id,p_company_id,'bloqueio',jsonb_build_object('reason','colaboradores','total',n));
  RETURN jsonb_build_object('status','bloqueado','reason','colaboradores','total',n,'plan',snap,
   'message',format('O plano permite até %s colaboradores por empresa; este preenchimento tem %s.',snap->>'employeeLimit',n));
 END IF;
 IF c.first_used_at IS NULL THEN UPDATE cjs_private.companies SET first_used_at=now() WHERE id=c.id; END IF;
 IF snap IS NULL THEN
  RETURN jsonb_build_object('status','liberado','plan',jsonb_build_object('limited',false));
 END IF;
 cs:=(snap->>'cycleStart')::date;
 INSERT INTO cjs_private.plan_usage(office_id,company_id,cycle_start) VALUES(p_office_id,p_company_id,cs)
 ON CONFLICT(office_id,cycle_start,company_id) DO UPDATE SET last_at=now();
 -- Troca de quadro: mais da metade dos nomes é nova (ausente da base ou incluída nos últimos 30 dias).
 IF n>0 THEN
  DELETE FROM cjs_private.roster_hashes WHERE company_id=p_company_id AND last_seen<d-90;
  SELECT EXISTS(SELECT 1 FROM cjs_private.roster_hashes WHERE company_id=p_company_id AND baseline) INTO has_base;
  IF has_base AND n>3 THEN
   SELECT count(*) INTO recent FROM unnest(hashes) h WHERE NOT EXISTS(SELECT 1 FROM cjs_private.roster_hashes r
    WHERE r.company_id=p_company_id AND r.name_hash=h AND (r.baseline OR r.first_seen<d-30));
   IF recent*2>n THEN
    IF NOT coalesce(p_confirm_swap,false) OR NOT manager THEN
     IF NOT EXISTS(SELECT 1 FROM cjs_private.plan_events WHERE company_id=p_company_id AND kind='troca_detectada' AND created_at>now()-interval '1 day') THEN
      PERFORM cjs_private.plan_event(p_office_id,p_company_id,'troca_detectada',jsonb_build_object('novos',recent,'total',n,'acao',p_action));
     END IF;
     RETURN jsonb_build_object('status','confirmar_troca','novos',recent,'total',n,'canConfirm',manager,
      'hasFreeSlot',(snap->>'free')::integer>0,'plan',snap,
      'message',format('%s de %s colaboradores são novos nesta empresa. Isso caracteriza troca de quadro e consome 1 vaga extra no ciclo.',recent,n));
    END IF;
    IF (snap->>'free')::integer<1 THEN
     PERFORM cjs_private.plan_event(p_office_id,p_company_id,'bloqueio',jsonb_build_object('reason','troca_sem_vaga'));
     RETURN jsonb_build_object('status','bloqueado','reason','troca_sem_vaga','plan',snap,
      'message','Não há vaga livre no ciclo para a troca de quadro. Arquive uma empresa (a vaga volta no próximo ciclo) ou fale com a Fintria.');
    END IF;
    INSERT INTO cjs_private.plan_extras(office_id,company_id,cycle_start,kind,quantity,reason,actor_id)
    VALUES(p_office_id,p_company_id,cs,'troca',1,format('%s de %s colaboradores novos',recent,n),who);
    PERFORM cjs_private.plan_event(p_office_id,p_company_id,'troca_confirmada',jsonb_build_object('novos',recent,'total',n));
    INSERT INTO cjs_private.roster_hashes(office_id,company_id,name_hash,first_seen,last_seen,baseline)
    SELECT p_office_id,p_company_id,h,d,d,true FROM unnest(hashes) h
    ON CONFLICT(company_id,name_hash) DO UPDATE SET last_seen=d,baseline=true;
    snap:=cjs_private.plan_snapshot(p_office_id);
    RETURN jsonb_build_object('status','liberado','swapConfirmed',true,'plan',snap,'message','Troca de quadro confirmada: 1 vaga extra consumida neste ciclo.');
   END IF;
  END IF;
  INSERT INTO cjs_private.roster_hashes(office_id,company_id,name_hash,first_seen,last_seen,baseline)
  SELECT p_office_id,p_company_id,h,d,d,NOT has_base FROM unnest(hashes) h
  ON CONFLICT(company_id,name_hash) DO UPDATE SET last_seen=d;
 END IF;
 snap:=cjs_private.plan_snapshot(p_office_id);
 IF (snap->>'used')::integer>(snap->>'capacity')::integer THEN
  RETURN jsonb_build_object('status','aviso','reason','excedido','plan',snap,
   'message',format('O escritório usa %s de %s vagas do plano. Arquive empresas que não estão mais em uso.',snap->>'used',snap->>'capacity'));
 END IF;
 IF (snap->>'used')::numeric>=0.8*(snap->>'capacity')::numeric THEN
  RETURN jsonb_build_object('status','aviso','reason','proximo','plan',snap,
   'message',format('Uso do plano: %s de %s empresas neste ciclo.',snap->>'used',snap->>'capacity'));
 END IF;
 RETURN jsonb_build_object('status','liberado','plan',snap);
END $$;

CREATE FUNCTION cjs_api.plan_status(p_office_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
BEGIN
 IF cjs_private.actor() IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 IF NOT cjs_private.office_visible(p_office_id) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Escritório não autorizado.'; END IF;
 RETURN coalesce(cjs_private.plan_snapshot(p_office_id),jsonb_build_object('limited',false)) - 'notes'
  || jsonb_build_object('canManage',cjs_private.manage_office(p_office_id));
END $$;

-- Gerente (ou Admin) arquiva/reativa. Arquivada: somente visualização; a vaga volta no próximo ciclo.
CREATE FUNCTION cjs_api.company_set_archived(p_office_id uuid,p_company_id uuid,p_archived boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE who uuid:=cjs_private.actor(); c cjs_private.companies; snap jsonb;
BEGIN
 IF who IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 IF p_archived IS NULL THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Informe a situação.'; END IF;
 IF NOT cjs_private.manage_office(p_office_id) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Somente o gerente pode arquivar empresas.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('plan:'||p_office_id::text,0));
 SELECT * INTO c FROM cjs_private.companies WHERE id=p_company_id AND office_id=p_office_id FOR UPDATE;
 IF NOT FOUND THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Empresa não autorizada.'; END IF;
 snap:=cjs_private.plan_snapshot(p_office_id);
 IF p_archived AND c.archived_at IS NULL THEN
  IF snap IS NOT NULL THEN
   INSERT INTO cjs_private.plan_usage(office_id,company_id,cycle_start) VALUES(p_office_id,c.id,(snap->>'cycleStart')::date)
   ON CONFLICT(office_id,cycle_start,company_id) DO NOTHING;
  END IF;
  UPDATE cjs_private.companies SET archived_at=now(),archived_by=who WHERE id=c.id RETURNING * INTO c;
  PERFORM cjs_private.plan_event(p_office_id,c.id,'arquivada');
 ELSIF NOT p_archived AND c.archived_at IS NOT NULL THEN
  IF snap IS NOT NULL AND (snap->>'free')::integer<1 AND NOT EXISTS(SELECT 1 FROM cjs_private.plan_usage
   WHERE office_id=p_office_id AND company_id=c.id AND cycle_start=(snap->>'cycleStart')::date) THEN
   RAISE SQLSTATE 'PT402' USING MESSAGE='Sem vaga livre no plano para reativar a empresa.';
  END IF;
  UPDATE cjs_private.companies SET archived_at=NULL,archived_by=NULL WHERE id=c.id RETURNING * INTO c;
  PERFORM cjs_private.plan_event(p_office_id,c.id,'desarquivada');
 END IF;
 RETURN jsonb_build_object('company',cjs_private.company_json(c),'plan',coalesce(cjs_private.plan_snapshot(p_office_id),jsonb_build_object('limited',false)) - 'notes');
END $$;

-- Empresa arquivada não aceita gravação nem exclusão de preenchimentos.
CREATE FUNCTION cjs_private.guard_archived_draft() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM cjs_private.companies WHERE id=NEW.company_id AND archived_at IS NOT NULL) THEN
  RAISE SQLSTATE 'PT423' USING MESSAGE='Empresa arquivada: somente visualização.';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER draft_archived_guard BEFORE INSERT OR UPDATE ON cjs_private.drafts FOR EACH ROW EXECUTE FUNCTION cjs_private.guard_archived_draft();

-- Listagens passam a informar arquivamento e trava do CNPJ.
CREATE OR REPLACE FUNCTION cjs_api.list_companies(p_office_id uuid) RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,cjs_private AS $$
 SELECT cjs_private.company_json(c) FROM cjs_private.companies c WHERE office_id=p_office_id ORDER BY archived_at IS NOT NULL,name,id
$$;
CREATE OR REPLACE FUNCTION cjs_api.company_options() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
BEGIN
 IF cjs_private.actor() IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 RETURN jsonb_build_object(
 'offices',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'canCreate',cjs_private.manage_office(id),'demo',demo) ORDER BY name),'[]') FROM cjs_private.offices WHERE cjs_private.office_visible(id)),
 'companies',(SELECT coalesce(jsonb_agg(cjs_private.company_json(c) ORDER BY c.archived_at IS NOT NULL,c.name),'[]') FROM cjs_private.companies c WHERE cjs_private.allowed(c.office_id,c.id))
 );
END $$;

-- Novo CNPJ só entra se houver vaga no ciclo.
CREATE OR REPLACE FUNCTION cjs_api.resolve_company(p_office_id uuid,p_name text,p_cnpj text,p_apply boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE v text:=upper(regexp_replace(coalesce(p_cnpj,''),'[./[:space:]-]','','g')); found_company cjs_private.companies; state text; matches integer; snap jsonb; full_plan boolean;
BEGIN
 IF cjs_private.actor() IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 IF NOT cjs_private.office_visible(p_office_id) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Escritório não autorizado.'; END IF;
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 160 OR NOT cjs_private.valid_cnpj(v) THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Razão social ou CNPJ inválido.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_office_id::text||v,0));
 SELECT * INTO found_company FROM cjs_private.companies WHERE office_id=p_office_id AND cnpj=v;
 IF FOUND THEN
  IF NOT cjs_private.allowed(p_office_id,found_company.id) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Empresa não autorizada.'; END IF;
  RETURN jsonb_build_object('status','existing','company',cjs_private.company_json(found_company));
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
 PERFORM pg_advisory_xact_lock(hashtextextended('plan:'||p_office_id::text,0));
 snap:=cjs_private.plan_snapshot(p_office_id);
 full_plan:=state='missing' AND snap IS NOT NULL AND ((snap->>'free')::integer<1 OR snap->>'status'='suspenso');
 IF NOT coalesce(p_apply,false) THEN RETURN jsonb_build_object('status',state,'canCreate',cjs_private.manage_office(p_office_id) AND NOT full_plan,'limitReached',full_plan,
  'plan',CASE WHEN snap IS NULL THEN jsonb_build_object('limited',false) ELSE snap - 'notes' END,
  'company',CASE WHEN state='legacy' THEN jsonb_build_object('id',found_company.id,'name',found_company.name,'cnpj',null) ELSE null END); END IF;
 IF NOT cjs_private.manage_office(p_office_id) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Solicite o cadastro do CNPJ ao gerente.'; END IF;
 IF full_plan THEN
  RAISE SQLSTATE 'PT402' USING MESSAGE='Limite de empresas do plano atingido neste ciclo.';
 END IF;
 IF state='legacy' THEN
  UPDATE cjs_private.companies SET cnpj=v WHERE id=found_company.id RETURNING * INTO found_company;
 ELSE
  INSERT INTO cjs_private.companies(office_id,name,cnpj) VALUES(p_office_id,btrim(p_name),v) RETURNING * INTO found_company;
 END IF;
 INSERT INTO cjs_private.company_registry_log(actor_id,office_id,company_id,action) VALUES(cjs_private.actor(),p_office_id,found_company.id,CASE WHEN state='legacy' THEN 'bind_cnpj' ELSE 'create' END);
 RETURN jsonb_build_object('status',CASE WHEN state='legacy' THEN 'updated' ELSE 'created' END,'company',cjs_private.company_json(found_company));
END $$;

-- CNPJ travado após o primeiro uso (só Admin altera); arquivada não é editada.
CREATE OR REPLACE FUNCTION cjs_api.update_company(p_office_id uuid,p_company_id uuid,p_name text,p_cnpj text,p_previous_name text,p_previous_cnpj text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE current_company cjs_private.companies; v text:=upper(regexp_replace(coalesce(p_cnpj,''),'[./[:space:]-]','','g')); previous jsonb;
BEGIN
 IF cjs_private.actor() IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 IF NOT cjs_private.manage_office(p_office_id) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Acesso não permitido.'; END IF;
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 160 OR NOT cjs_private.valid_cnpj(v) THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Dados inválidos.'; END IF;
 SELECT * INTO current_company FROM cjs_private.companies WHERE id=p_company_id AND office_id=p_office_id FOR UPDATE;
 IF NOT FOUND THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Empresa não autorizada.'; END IF;
 IF current_company.archived_at IS NOT NULL THEN RAISE SQLSTATE 'PT423' USING MESSAGE='Empresa arquivada: somente visualização.'; END IF;
 IF current_company.name IS DISTINCT FROM p_previous_name OR current_company.cnpj IS DISTINCT FROM p_previous_cnpj THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Cadastro alterado. Reabra antes de salvar.'; END IF;
 IF current_company.first_used_at IS NOT NULL AND current_company.cnpj IS NOT NULL AND current_company.cnpj<>v AND NOT cjs_private.platform_admin() THEN
  RAISE SQLSTATE 'PT423' USING MESSAGE='CNPJ travado após o primeiro uso. Somente o Admin pode alterá-lo.';
 END IF;
 previous:=jsonb_build_object('name',current_company.name,'cnpj',current_company.cnpj);
 UPDATE cjs_private.companies SET name=btrim(p_name),cnpj=v WHERE id=current_company.id RETURNING * INTO current_company;
 INSERT INTO cjs_private.company_registry_log(actor_id,office_id,company_id,action,details)
 VALUES(cjs_private.actor(),p_office_id,current_company.id,'update',jsonb_build_object('before',previous,'after',jsonb_build_object('name',current_company.name,'cnpj',current_company.cnpj)));
 IF previous->>'cnpj' IS DISTINCT FROM current_company.cnpj AND current_company.first_used_at IS NOT NULL THEN
  PERFORM cjs_private.plan_event(p_office_id,current_company.id,'cnpj_alterado',jsonb_build_object('antes',previous->>'cnpj','depois',current_company.cnpj));
 END IF;
 RETURN jsonb_build_object('company',cjs_private.company_json(current_company));
EXCEPTION WHEN unique_violation THEN RAISE SQLSTATE 'PT409' USING MESSAGE='CNPJ já cadastrado neste escritório.';
END $$;

-- Painel do Admin global.
CREATE FUNCTION cjs_private.require_platform_admin() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
BEGIN
 IF cjs_private.actor() IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 IF NOT cjs_private.platform_admin() THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Painel exclusivo do Admin.'; END IF;
END $$;
CREATE FUNCTION cjs_api.admin_plans_overview() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
BEGIN
 PERFORM cjs_private.require_platform_admin();
 RETURN jsonb_build_object('today',cjs_private.today(),'offices',(SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',o.id,'name',o.name,'active',o.active,'demo',o.demo,
  'plan',coalesce(cjs_private.plan_snapshot(o.id),jsonb_build_object('limited',false)),
  'activeCompanies',(SELECT count(*) FROM cjs_private.companies c WHERE c.office_id=o.id AND c.archived_at IS NULL),
  'archivedCompanies',(SELECT count(*) FROM cjs_private.companies c WHERE c.office_id=o.id AND c.archived_at IS NOT NULL),
  'users',(SELECT count(*) FROM cjs_private.memberships m WHERE m.office_id=o.id AND m.active),
  'pendingSwaps',(SELECT count(*) FROM cjs_private.plan_events e WHERE e.office_id=o.id AND e.kind='troca_detectada' AND e.created_at>now()-interval '30 days'
    AND NOT EXISTS(SELECT 1 FROM cjs_private.plan_events f WHERE f.company_id=e.company_id AND f.kind='troca_confirmada' AND f.created_at>=e.created_at)),
  'blocks',(SELECT count(*) FROM cjs_private.plan_events e WHERE e.office_id=o.id AND e.kind='bloqueio' AND e.created_at>now()-interval '30 days')
 ) ORDER BY o.demo,o.name),'[]') FROM cjs_private.offices o),
 'events',(SELECT coalesce(jsonb_agg(x ORDER BY x->>'createdAt' DESC),'[]') FROM (SELECT jsonb_build_object('id',e.id,'officeId',e.office_id,'office',o.name,
  'company',c.name,'kind',e.kind,'details',e.details,'actor',u.name,'createdAt',e.created_at) x
  FROM cjs_private.plan_events e JOIN cjs_private.offices o ON o.id=e.office_id LEFT JOIN cjs_private.companies c ON c.id=e.company_id
  LEFT JOIN cjs_private.users u ON u.id=e.actor_id ORDER BY e.created_at DESC LIMIT 60) y));
END $$;
CREATE FUNCTION cjs_api.admin_plan_detail(p_office_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE snap jsonb; cs date;
BEGIN
 PERFORM cjs_private.require_platform_admin();
 IF NOT EXISTS(SELECT 1 FROM cjs_private.offices WHERE id=p_office_id) THEN RAISE SQLSTATE 'PT404' USING MESSAGE='Escritório não encontrado.'; END IF;
 snap:=cjs_private.plan_snapshot(p_office_id); cs:=(snap->>'cycleStart')::date;
 RETURN jsonb_build_object('office',(SELECT jsonb_build_object('id',id,'name',name,'demo',demo,'active',active) FROM cjs_private.offices WHERE id=p_office_id),
  'plan',coalesce(snap,jsonb_build_object('limited',false)),
  'companies',(SELECT coalesce(jsonb_agg(cjs_private.company_json(c) || jsonb_build_object(
    'createdAt',c.created_at,'firstUsedAt',c.first_used_at,
    'counted',c.archived_at IS NULL OR EXISTS(SELECT 1 FROM cjs_private.plan_usage u WHERE u.company_id=c.id AND u.cycle_start=cs),
    'lastUse',(SELECT max(last_at) FROM cjs_private.plan_usage u WHERE u.company_id=c.id),
    'swaps',(SELECT coalesce(sum(quantity),0) FROM cjs_private.plan_extras x WHERE x.company_id=c.id AND x.kind='troca' AND x.cycle_start=cs),
    'roster',(SELECT count(*) FROM cjs_private.roster_hashes r WHERE r.company_id=c.id))
   ORDER BY c.archived_at IS NOT NULL,c.name),'[]') FROM cjs_private.companies c WHERE c.office_id=p_office_id),
  'extras',(SELECT coalesce(jsonb_agg(jsonb_build_object('kind',x.kind,'quantity',x.quantity,'reason',x.reason,'company',c.name,'actor',u.name,'createdAt',x.created_at) ORDER BY x.created_at DESC),'[]')
   FROM cjs_private.plan_extras x LEFT JOIN cjs_private.companies c ON c.id=x.company_id JOIN cjs_private.users u ON u.id=x.actor_id WHERE x.office_id=p_office_id AND x.cycle_start=cs),
  'events',(SELECT coalesce(jsonb_agg(x ORDER BY x->>'createdAt' DESC),'[]') FROM (SELECT jsonb_build_object('id',e.id,'company',c.name,'kind',e.kind,'details',e.details,'actor',u.name,'createdAt',e.created_at) x
   FROM cjs_private.plan_events e LEFT JOIN cjs_private.companies c ON c.id=e.company_id LEFT JOIN cjs_private.users u ON u.id=e.actor_id
   WHERE e.office_id=p_office_id ORDER BY e.created_at DESC LIMIT 100) y));
END $$;
CREATE FUNCTION cjs_api.admin_plan_save(p_office_id uuid,p_revision integer,p_name text,p_company_limit integer,p_employee_limit integer,p_cycle_anchor date,p_status text,p_notes text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE p cjs_private.office_plans; who uuid:=cjs_private.actor();
BEGIN
 PERFORM cjs_private.require_platform_admin();
 IF NOT EXISTS(SELECT 1 FROM cjs_private.offices WHERE id=p_office_id) THEN RAISE SQLSTATE 'PT404' USING MESSAGE='Escritório não encontrado.'; END IF;
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 60 OR p_company_limit IS NULL OR p_company_limit NOT BETWEEN 1 AND 10000
 OR p_employee_limit IS NULL OR p_employee_limit NOT BETWEEN 1 AND 500 OR p_cycle_anchor IS NULL OR p_status NOT IN ('ativo','suspenso')
 OR length(coalesce(p_notes,''))>500 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Plano inválido.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('plan:'||p_office_id::text,0));
 SELECT * INTO p FROM cjs_private.office_plans WHERE office_id=p_office_id FOR UPDATE;
 IF FOUND AND p.revision IS DISTINCT FROM p_revision OR NOT FOUND AND p_revision IS NOT NULL THEN
  RAISE SQLSTATE 'PT409' USING MESSAGE='O plano foi alterado. Recarregue antes de salvar.';
 END IF;
 INSERT INTO cjs_private.office_plans AS t(office_id,name,company_limit,employee_limit,cycle_anchor,status,notes,updated_by)
 VALUES(p_office_id,btrim(p_name),p_company_limit,p_employee_limit,p_cycle_anchor,p_status,coalesce(p_notes,''),who)
 ON CONFLICT(office_id) DO UPDATE SET name=excluded.name,company_limit=excluded.company_limit,employee_limit=excluded.employee_limit,
  cycle_anchor=excluded.cycle_anchor,status=excluded.status,notes=excluded.notes,updated_by=who,updated_at=now(),revision=t.revision+1;
 PERFORM cjs_private.plan_event(p_office_id,NULL,'plano_salvo',jsonb_build_object('nome',btrim(p_name),'empresas',p_company_limit,
  'colaboradores',p_employee_limit,'inicio',p_cycle_anchor,'situacao',p_status,
  'antes',CASE WHEN p.office_id IS NULL THEN NULL ELSE jsonb_build_object('nome',p.name,'empresas',p.company_limit,'colaboradores',p.employee_limit,'inicio',p.cycle_anchor,'situacao',p.status) END));
 RETURN cjs_private.plan_snapshot(p_office_id);
END $$;
CREATE FUNCTION cjs_api.admin_plan_remove(p_office_id uuid,p_revision integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE p cjs_private.office_plans;
BEGIN
 PERFORM cjs_private.require_platform_admin();
 SELECT * INTO p FROM cjs_private.office_plans WHERE office_id=p_office_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('limited',false); END IF;
 IF p.revision IS DISTINCT FROM p_revision THEN RAISE SQLSTATE 'PT409' USING MESSAGE='O plano foi alterado. Recarregue antes de remover.'; END IF;
 DELETE FROM cjs_private.office_plans WHERE office_id=p_office_id;
 PERFORM cjs_private.plan_event(p_office_id,NULL,'plano_removido',jsonb_build_object('nome',p.name,'empresas',p.company_limit));
 RETURN jsonb_build_object('limited',false);
END $$;
CREATE FUNCTION cjs_api.admin_plan_courtesy(p_office_id uuid,p_quantity integer,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE snap jsonb;
BEGIN
 PERFORM cjs_private.require_platform_admin();
 IF p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 100 OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 300 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Informe quantidade e motivo.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('plan:'||p_office_id::text,0));
 snap:=cjs_private.plan_snapshot(p_office_id);
 IF snap IS NULL THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Escritório sem plano: não há limite a ampliar.'; END IF;
 INSERT INTO cjs_private.plan_extras(office_id,cycle_start,kind,quantity,reason,actor_id)
 VALUES(p_office_id,(snap->>'cycleStart')::date,'cortesia',p_quantity,btrim(p_reason),cjs_private.actor());
 PERFORM cjs_private.plan_event(p_office_id,NULL,'vaga_cortesia',jsonb_build_object('quantidade',p_quantity,'motivo',btrim(p_reason)));
 RETURN cjs_private.plan_snapshot(p_office_id);
END $$;
CREATE FUNCTION cjs_api.admin_office_demo(p_office_id uuid,p_demo boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE o cjs_private.offices;
BEGIN
 PERFORM cjs_private.require_platform_admin();
 IF p_demo IS NULL THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Informe a situação.'; END IF;
 UPDATE cjs_private.offices SET demo=p_demo WHERE id=p_office_id RETURNING * INTO o;
 IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='Escritório não encontrado.'; END IF;
 PERFORM cjs_private.plan_event(p_office_id,NULL,'demo',jsonb_build_object('demo',p_demo));
 RETURN jsonb_build_object('id',o.id,'demo',o.demo);
END $$;

GRANT EXECUTE ON FUNCTION cjs_private.company_json(cjs_private.companies) TO cjs_authenticated;
GRANT EXECUTE ON FUNCTION cjs_api.plan_register_use(uuid,uuid,text,text[],boolean),cjs_api.plan_status(uuid),
 cjs_api.company_set_archived(uuid,uuid,boolean),cjs_api.admin_plans_overview(),cjs_api.admin_plan_detail(uuid),
 cjs_api.admin_plan_save(uuid,integer,text,integer,integer,date,text,text),cjs_api.admin_plan_remove(uuid,integer),
 cjs_api.admin_plan_courtesy(uuid,integer,text),cjs_api.admin_office_demo(uuid,boolean) TO cjs_authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
