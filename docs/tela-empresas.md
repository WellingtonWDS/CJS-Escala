# Tela inicial Empresas

Com login individual e empresas no servidor, o Reescala abre em **Empresas** (`/#empresas`). Sem servidor (modo compartilhado/local), a tela inicial continua sendo a geração de escalas.

## Fluxo

1. **Empresas:** cartões das empresas que o usuário pode acessar, ativas primeiro. Cada cartão mostra razão social, CNPJ, escritório (quando há mais de um), quantidade de preenchimentos, colaboradores do preenchimento mais recente, data e autor do último salvamento e selos: *Arquivada*, *Aberta agora* e *Escala gerada*. Busca por razão social ou CNPJ e filtro por escritório. O Gerente vê o uso do plano de cada escritório.
2. **Nova empresa:** Gerente/Admin cadastra escritório, razão social e CNPJ (respeitando o limite do plano). Sem nenhuma empresa, a tela mostra a opção de cadastrar a primeira; o Operador vê a orientação para pedir acesso ao Gerente.
3. **Empresa escolhida:** lista de preenchimentos (abrir/continuar) e **Novo preenchimento**; ambos levam à geração de escalas (etapa 1). Gerente/Admin editam razão social e CNPJ (CNPJ travado após o primeiro uso, salvo para o Admin) e arquivam/reativam a empresa. Empresa arquivada: somente consulta.

Na coluna da direita, **Dados da empresa** aparecem só para leitura; o botão **Editar** abre os campos. Abaixo, o card **Diagnóstico** (Gerente/Admin) lista os diagnósticos da empresa e permite abrir um ou começar um novo, já com a empresa definida.

Ao recarregar a página, a tela atual é mantida (Empresas ou a etapa da escala). O atalho **Empresa atual e Preenchimentos** fica no topo da página. Com servidor, o botão **Limpar dados salvos** não aparece: os preenchimentos ficam salvos por empresa.

## Mudanças no menu

- Saíram **Escritórios**, **Empresas — cadastrar e editar**, **Prévia das festividades**, **Empresa atual e Preenchimentos** (fica no topo) e **Diagnóstico** (no cartão da empresa).
- Criar escritórios e a prévia sazonal ficam no **Painel Admin** (`/admin`), exclusivo do Admin global.

## Ativação no banco da VPS

Aplicar a migração **011_company_cards.sql** após a 010:

```bash
curl -fsSL https://raw.githubusercontent.com/WellingtonWDS/CJS-Escala/main/database/migrations/011_company_cards.sql -o /tmp/011_company_cards.sql
docker cp /tmp/011_company_cards.sql postgres_apps:/tmp/011_company_cards.sql
docker exec postgres_apps psql -U postgres -d cjs_escala -v ON_ERROR_STOP=1 -f /tmp/011_company_cards.sql
```

Sem a 011, a tela Empresas usa a lista simples (sem os números dos cartões). A 011 depende da 010.

## Validação

`database/tests/company-cards.sql` (visibilidade por perfil, resumo do preenchimento, plano só para Gerente), `tests/browser-empresas.cjs` e testes unitários do endpoint `/api/companies?view=cards`.
