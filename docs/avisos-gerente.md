# Avisos automáticos ao Gerente

Os Gerentes de cada escritório (perfil Gerente ativo, com e-mail) recebem por e-mail, via n8n:

| Aviso | Quando | Frequência |
| --- | --- | --- |
| **Plano perto do limite** | uso no ciclo chega a 80% das vagas | uma vez por ciclo |
| **Limite do plano atingido** | uso chega a 100% | uma vez por ciclo |
| **Troca de quadro aguardando confirmação** | um Operador tenta montar a escala com mais da metade dos colaboradores novos | uma vez por empresa e dia |
| **Ciclo renovado** | começa um novo ciclo do plano (com o número de vagas liberadas por empresas arquivadas) | uma vez por ciclo |

Escritórios sem plano (sem limite) não recebem avisos de uso nem de ciclo.

## Como funciona

- O banco registra os avisos numa fila (`plan_notices`) automaticamente: gatilhos no uso do plano, no cadastro de empresas, nas vagas extras e nas alterações do plano; a troca de quadro entra pela detecção já existente. A renovação é verificada a cada envio (até 3 dias após o início do ciclo).
- O backend envia os pendentes **na hora** quando o uso gera aviso (troca detectada, plano perto do limite, nova empresa) e **uma vez por dia** pelo fluxo n8n de agendamento.
- Cada aviso vai para cada Gerente do escritório. Se o envio falhar, o aviso volta para a fila e é tentado de novo (até 5 vezes, com intervalo mínimo de 10 minutos).

## Ativação

1. Banco (VPS), após a 017:

```bash
curl -fsSL https://raw.githubusercontent.com/WellingtonWDS/CJS-Escala/main/database/migrations/018_plan_notices.sql -o /tmp/018_plan_notices.sql
docker cp /tmp/018_plan_notices.sql postgres_apps:/tmp/018_plan_notices.sql
docker exec postgres_apps psql -U postgres -d cjs_escala -v ON_ERROR_STOP=1 -f /tmp/018_plan_notices.sql
```

2. n8n — e-mails: no fluxo de e-mails, substituir o código do nó **Montar e-mail** pelo do modelo atualizado ([cjs-mail.template.json](../integrations/n8n/cjs-mail.template.json)), que passa a montar o tipo `plan_notice`.

3. n8n — agendamento: importar [cjs-avisos-diarios.template.json](../integrations/n8n/cjs-avisos-diarios.template.json). No nó **Enviar avisos pendentes**, usar a mesma credencial Header Auth (`X-CJS-Service-Key`) dos outros fluxos e ativar. Ele chama `POST https://reescala.fintria.com.br/api/notices` todo dia às 8h (horário de Brasília).

Sem variável nova na Vercel (usa `N8N_MAIL_URL`, `N8N_SERVICE_SECRET` e `APP_ORIGIN`).

## Validação

`database/tests/plan-notices.sql` (14 cenários), `tests/plan-notices.test.cjs` (envio, nova tentativa, proteção do endpoint e e-mails do n8n).
