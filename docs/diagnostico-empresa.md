# Diagnóstico da empresa

Entrega de **12/11/2026**. Acesso pelo menu **Diagnóstico**, no login individual, exclusivo de **Gerentes e Admins**. Operadores não têm acesso à tela nem às RPCs. Gerentes consultam os escritórios que administram; Admins podem consultar os escritórios ativos da plataforma.


**Correção visual do diagnóstico (12/11/2026):** a lista de empresas abre sobre o conteúdo, sem aumentar o campo Escritório nem deslocar as seções seguintes. Campos alinhados mesmo com razão social longa. As oito etapas ficam em duas linhas de quatro no desktop; até 900px, passam a quatro linhas de duas, com botões de altura uniforme. Hover da etapa selecionada e das ações principais mantém fundo escuro e texto legível. Build e teste de navegador dedicado aprovados em 1440, 768 e 390px, nos temas claro/escuro, incluindo busca, seleção e teclado.

## Uso

1. Selecione o escritório e a empresa. O seletor de empresa reúne a seleção e a busca por razão social/CNPJ em um único controle.
2. Abra um diagnóstico salvo ou clique em **Novo diagnóstico**. É possível manter diagnósticos diferentes para unidades e análises da mesma empresa.
3. Responda pelas oito etapas; os botões de etapas permitem navegar diretamente, além de Voltar/Avançar. Os dados permanecem na tela durante a navegação.
4. Use **Salvar rascunho** para registrar no servidor, mesmo com respostas e linhas incompletas. Não há salvamento automático ao avançar de etapa. Alterações não salvas são indicadas e há confirmação ao sair/trocar de registro; ao fechar/recarregar, o navegador pode pedir confirmação.
5. Em **Ver resumo**, confira a ficha e suas pendências. Ao concluir, perguntas essenciais devem ter resposta ou marcação explícita de pendência. O diagnóstico pode ser concluído com pendências; isso não equivale a aprovar legalmente a operação.
6. Uma conclusão fica em consulta. Use **Revisar diagnóstico** para preparar nova revisão e salve novamente. O histórico anterior permanece disponível, com data, autor e situação.

As oito etapas abrangem **34 perguntas**:

- Objetivos, unidade, prazo e responsáveis.
- Funcionamento, atividades antes/depois da abertura, almoço, fins de semana/feriados e sazonalidade.
- Funções indispensáveis, cobertura mínima por faixa, picos, atividades flexíveis e operação crítica.
- Conferência do cadastro, folgas, habilitações e diferenças entre escala cadastrada/praticada.
- Lacunas, horas extras, substituições e problemas de intervalos/descanso.
- Atividade/categoria, ACT/CCT, vigência, condições específicas e contratos.
- Mudanças autorizadas, condições obrigatórias/preferências, restrições, alternativas e orçamento.
- Ordenação de prioridades, critérios de sucesso e pontos ainda não confirmados.

Cada informação tem classificação **Confirmada**, **Estimativa** ou **Pendente de conferência**, além de observações. Respostas “Não sei” são marcadas como pendentes. Detalhes aparecem conforme as respostas; orçamento é solicitado quando contratação/cobertura parcial/treinamento são alternativas consideradas. A ordem de prioridades nunca substitui a legislação e as condições obrigatórias.

Na entrevista, horários iguais de início/fim representam funcionamento ou necessidade de 24h; horário final anterior ao inicial termina no dia seguinte. Isso descreve a operação, não uma jornada individual de 24h.

A cobertura mínima é preenchida por função, quantidade, dias da semana e faixa de horário, distinguindo o mínimo indispensável da quantidade desejável dos picos. Condições são classificadas individualmente como obrigatórias ou preferências. Não registre detalhes médicos ou pessoais; basta a restrição de disponibilidade necessária.

O ACT/CCT aceita identificação, vigência e link de referência. Também pode ser registrada ausência de instrumento utilizado nesta análise, sem que isso autorize automaticamente uma jornada ou regime. Arquivos anexos não são armazenados por esta entrega.

## Relação com a escala

O diagnóstico é um registro independente do preenchimento/escala. Ele não altera colaboradores, feriados, jornadas, autorizações coletivas ou restrições do gerador.

Quando a mesma empresa estiver aberta no gerador, **Usar dados do preenchimento aberto** permite copiar horários operacionais, funções e cobertura para a entrevista, sob confirmação. Os dados copiados são marcados como estimativa e precisam ser conferidos. Não copia informações de outra empresa nem modifica a escala original.

A ficha de conferência reúne as respostas, sua confiabilidade, condições e pendências. O responsável usa essas premissas para preparar a simulação após conferência. Aplicação automática das respostas no gerador e PDF específico do diagnóstico não fazem parte desta entrega.

## Gravação e revisões

As respostas ficam no PostgreSQL, vinculadas ao escritório/empresa, e podem ser consultadas por outro Gerente/Admin autorizado. Cada salvamento confirmado acrescenta uma revisão com autor, data, situação e respostas completas. Revisões antigas são de consulta; a edição continua pela revisão atual.

O servidor verifica a revisão esperada: se outra pessoa salvou primeiro, a operação é recusada e as respostas locais são mantidas para conferência. Atualizar a lista pede confirmação antes de descartar alterações e carrega a revisão atual.

Se um envio falhar sem confirmação, os campos ficam protegidos e aparece **Repetir gravação pendente**. A repetição usa a mesma chave de operação para não duplicar o registro caso o banco já tenha recebido o envio. Aguarde confirmação antes de sair; respostas ainda não confirmadas permanecem somente na memória da aba. Não são guardadas automaticamente em localStorage.

## Ativação no banco da VPS

O frontend e a API precisam da migração **009_company_diagnostics.sql**, após as migrações 001–008. Não há variável de ambiente, senha, webhook ou configuração nova de Caddy/PostgREST. Usa a autenticação individual e o acesso ao banco já existentes.

Execute uma vez no servidor, após a publicação dos arquivos na `main`:

```bash
curl -fsSL https://raw.githubusercontent.com/WellingtonWDS/CJS-Escala/main/database/migrations/009_company_diagnostics.sql -o /tmp/reescala-009.sql

docker exec -i postgres_apps psql -U postgres -d cjs_escala -v ON_ERROR_STOP=1 < /tmp/reescala-009.sql
```

Conferência:

```bash
docker exec postgres_apps psql -U postgres -d cjs_escala -c "SELECT to_regclass('cjs_private.diagnostics') AS diagnosticos, to_regclass('cjs_private.diagnostic_revisions') AS revisoes, to_regprocedure('cjs_api.diagnostic_options()') AS consulta;"
```

A migração notifica o PostgREST para recarregar o schema. Sem ela, a página informa que a gravação não foi confirmada e orienta conferir a 009. Não foi executada automaticamente na VPS.

## Estrutura e segurança

- Catálogo/validação: `assets/js/diagnostico/questionario.js`.
- Renderização dos campos e ficha: `assets/js/ui/diagnostico-perguntas.js`.
- Fluxo da tela: `assets/js/ui/diagnostico-empresa.js`; estilos em `assets/css/diagnostico-empresa.css` e paleta escura autoral.
- Cliente HTTP: `assets/js/services/diagnostics.js`.
- API portátil: `server/diagnostics.js`, `/api/diagnostics`, adaptador Vercel em `api/diagnostics.js`.
- RPCs: `diagnostic_options`, `diagnostic_list`, `diagnostic_get`, `diagnostic_save`.
- Tabelas privadas: `diagnostics` e `diagnostic_revisions`. Sem acesso direto para anônimos/usuários autenticados; RLS também para o proprietário das funções. Histórico somente de inserção/consulta pelas políticas.
- Sessão/identidade obtidas do cookie autenticado; privilégios conferidos pelo PostgreSQL. O papel e o autor enviados no corpo não concedem acesso. POST exige origem correta e JSON limitado; histórico não aceita sobrescrita por uma revisão antiga.

Validação local inclui testes de questionário/API e integração com PostgreSQL 17/PostgREST 14.15 reais, além de navegador autenticado. Os testes verificam isolamento entre escritórios/empresas, Operador bloqueado, Admin global, rascunho parcial, pendências/conclusão, revisão histórica, conflito, repetição idempotente após falha, fonte da escala preservada, celular e contraste claro/escuro. Os comandos gerais continuam `npm test`, `npm run build`, `node tests/browser.cjs` e `node scripts/test-persistence.mjs --browser`.

Validação desta entrega: **571 testes unitários**, build, suíte completa de navegador e integração PostgreSQL/PostgREST com navegador aprovados localmente. As verificações finais incluem operação de 24h, prioridades sem ultrapassar as extremidades, saída com descarte efetivo e respostas preservadas em conflitos/falhas.
