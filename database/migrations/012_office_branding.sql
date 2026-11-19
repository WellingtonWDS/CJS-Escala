-- Executar após 011 no banco cjs_escala.
-- Marca do escritório nos relatórios: logomarca (PNG já normalizado no navegador),
-- cores da marca e nome exibido. Leitura para quem acessa o escritório; edição
-- para Gerente (ou Admin).
BEGIN;
SET LOCAL ROLE cjs_owner;
CREATE TABLE cjs_private.office_branding (
 office_id uuid PRIMARY KEY REFERENCES cjs_private.offices,
 display_name text CHECK(display_name IS NULL OR length(btrim(display_name)) BETWEEN 1 AND 160),
 logo text CHECK(logo IS NULL OR (logo ~ '^data:image/png;base64,[A-Za-z0-9+/]+=*$' AND length(logo)<=700000)),
 logo_width integer CHECK(logo_width IS NULL OR logo_width BETWEEN 1 AND 2000),
 logo_height integer CHECK(logo_height IS NULL OR logo_height BETWEEN 1 AND 2000),
 primary_color text NOT NULL DEFAULT '#0f2844' CHECK(primary_color ~ '^#[0-9a-f]{6}$'),
 secondary_color text NOT NULL DEFAULT '#1f7a54' CHECK(secondary_color ~ '^#[0-9a-f]{6}$'),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_by uuid NOT NULL REFERENCES cjs_private.users,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((logo IS NULL)=(logo_width IS NULL) AND (logo IS NULL)=(logo_height IS NULL))
);
ALTER TABLE cjs_private.office_branding ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION cjs_private.branding_json(p_office uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
 SELECT jsonb_build_object('officeId',o.id,'officeName',o.name,'displayName',b.display_name,
  'logo',b.logo,'logoWidth',b.logo_width,'logoHeight',b.logo_height,
  'primaryColor',coalesce(b.primary_color,'#0f2844'),'secondaryColor',coalesce(b.secondary_color,'#1f7a54'),
  'revision',coalesce(b.revision,0),'updatedAt',b.updated_at,'canEdit',cjs_private.manage_office(o.id))
 FROM cjs_private.offices o LEFT JOIN cjs_private.office_branding b ON b.office_id=o.id WHERE o.id=p_office
$$;
CREATE FUNCTION cjs_api.office_branding_get(p_office_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
BEGIN
 IF cjs_private.actor() IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 IF NOT cjs_private.office_visible(p_office_id) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Escritório não autorizado.'; END IF;
 RETURN cjs_private.branding_json(p_office_id);
END $$;
CREATE FUNCTION cjs_api.office_branding_save(p_office_id uuid,p_revision integer,p_display_name text,p_logo text,p_logo_width integer,p_logo_height integer,p_primary_color text,p_secondary_color text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE b cjs_private.office_branding; who uuid:=cjs_private.actor(); nome text:=nullif(btrim(coalesce(p_display_name,'')),'');
BEGIN
 IF who IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 IF NOT cjs_private.manage_office(p_office_id) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Somente o gerente pode alterar a marca do escritório.'; END IF;
 IF p_revision IS NULL OR p_revision<0 OR (nome IS NOT NULL AND length(nome)>160)
 OR p_primary_color IS NULL OR p_primary_color !~ '^#[0-9a-f]{6}$' OR p_secondary_color IS NULL OR p_secondary_color !~ '^#[0-9a-f]{6}$'
 OR (p_logo IS NULL)<>(p_logo_width IS NULL) OR (p_logo IS NULL)<>(p_logo_height IS NULL)
 OR (p_logo IS NOT NULL AND (p_logo !~ '^data:image/png;base64,[A-Za-z0-9+/]+=*$' OR length(p_logo)>700000 OR p_logo_width NOT BETWEEN 1 AND 2000 OR p_logo_height NOT BETWEEN 1 AND 2000))
 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Marca inválida.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('brand:'||p_office_id::text,0));
 SELECT * INTO b FROM cjs_private.office_branding WHERE office_id=p_office_id FOR UPDATE;
 IF coalesce(b.revision,0)<>p_revision THEN RAISE SQLSTATE 'PT409' USING MESSAGE='A marca foi alterada por outra pessoa. Reabra antes de salvar.'; END IF;
 INSERT INTO cjs_private.office_branding AS t(office_id,display_name,logo,logo_width,logo_height,primary_color,secondary_color,updated_by)
 VALUES(p_office_id,nome,p_logo,p_logo_width,p_logo_height,p_primary_color,p_secondary_color,who)
 ON CONFLICT(office_id) DO UPDATE SET display_name=excluded.display_name,logo=excluded.logo,logo_width=excluded.logo_width,
  logo_height=excluded.logo_height,primary_color=excluded.primary_color,secondary_color=excluded.secondary_color,
  updated_by=who,updated_at=now(),revision=t.revision+1;
 RETURN cjs_private.branding_json(p_office_id);
END $$;
GRANT EXECUTE ON FUNCTION cjs_api.office_branding_get(uuid),
 cjs_api.office_branding_save(uuid,integer,text,text,integer,integer,text,text) TO cjs_authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
