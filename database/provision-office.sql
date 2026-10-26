-- Provisionamento administrativo, nunca uma RPC pública.
-- Exemplo (substituir valores fictícios):
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v identity_subject='123' \
--   -v user_name='Administrador' -v office_name='Escritório Exemplo' \
--   -v company_name='Empresa Exemplo' -f database/provision-office.sql
-- Requer subject emitido pelo provedor de identidade acordado para este produto.
BEGIN;
SET LOCAL ROLE cjs_owner;
WITH actor AS (
 INSERT INTO cjs_private.users(identity_subject,name)
 VALUES(:'identity_subject',:'user_name')
 ON CONFLICT(identity_subject) DO UPDATE SET identity_subject=EXCLUDED.identity_subject
 RETURNING id,active
), office AS (
 INSERT INTO cjs_private.offices(name) SELECT :'office_name' FROM actor WHERE active RETURNING id
), membership AS (
 INSERT INTO cjs_private.memberships(user_id,office_id,role)
 SELECT a.id,o.id,'admin' FROM actor a CROSS JOIN office o RETURNING user_id,office_id
), company AS (
 INSERT INTO cjs_private.companies(office_id,name) SELECT office_id,:'company_name' FROM membership RETURNING id,office_id
)
SELECT m.user_id,m.office_id,c.id AS company_id FROM membership m JOIN company c USING(office_id);
COMMIT;
