# Registro de implantação — 26/10/2026

Este registro separa código disponível, infraestrutura confirmada pelo operador e validação ponta a ponta. Não contém senhas, chaves ou identificadores pessoais. Atualizar a cada etapa de homologação.

## Código conferido no GitHub

- `1118045`: base de persistência e isolamento por escritório.
- `4b1cd59`: login individual, sessões e interface de empresas/rascunhos.
- `7cb692f`: template n8n com assinatura JWT nativa.
- `login.html` contém o campo de e-mail inicialmente oculto. `assets/js/login.js` consulta `/api/auth?config=1`; somente `mode=n8n` exibe e exige e-mail. `server/auth.js` determina o modo por `AUTH_MODE`. O padrão continua compartilhado.
- Publicação na main não comprova qual commit está em execução na Vercel. É necessário conferir o deployment de Production e suas variáveis.

## Confirmado pelo operador na VPS

- PostgreSQL 17.10, banco dedicado `cjs_escala`; migrações 001 e 002 executadas.
- PostgREST 14.15 dedicado, rede Docker privada; `/escala/rpc/check_session` público responde 401 sem sessão, via Caddy.
- `public.users` criada administrativamente no banco dedicado; credencial `cjs_identity_reader` com SELECT restrito. Conexão do n8n testada.
- Primeira identidade criada com hash bcrypt; usuário interno, escritório, vínculo admin e primeira empresa confirmados por consulta. A criação adotou mínimo de 6 caracteres. Não há cadastro público.
- Workflow publicado em `https://n8n.fintria.com.br/webhook/auth/cjs-login`. Teste retornou HTTP 200, success=true e token presente. Isso não valida a assinatura pela aplicação nem a persistência ponta a ponta.

## Pendente de confirmação

Atualização do operador: Vercel configurada para publicar a main; frontend em `https://cjs-escala.vercel.app`. A consulta pública a `/api/auth?config=1` retornou `Serviço indisponível.`. Esse texto é o catch do adaptador Vercel, não o erro explícito de segredo ausente ou AUTH_MODE inválido. Causa ainda não identificada. O adaptador passa a registrar `CJS_API_FAILURE` com rota e etapa, sem valores de configuração, cabeçalhos, corpos ou exceções. Consultar os logs da função após o próximo deployment. A tentativa de acesso deste ambiente foi bloqueada pelo proxy de saída (403), portanto não houve reprodução remota independente.

1. Confirmar substituição da chave de RPC anteriormente exposta; nunca registrar seu valor.
2. Conferir commit do deployment e configurar as variáveis privadas em Production, conforme `.env.example` e guia n8n; obter a origem real do frontend para APP_ORIGIN.
3. Redeploy; conferir `/api/auth?config=1` retornando `{"mode":"n8n"}` e a tela exigindo e-mail/senha.
4. Validar login pela aplicação, seleção de escritório/empresa, salvar e reabrir rascunho em outra sessão e logout. Não declarar produção homologada antes desses resultados.
5. O cadastro de empresas ainda não possui campo próprio de CNPJ. O CNPJ fornecido não foi persistido pelos comandos administrativos.
6. Hospedagem do frontend continua na Vercel; migração para VPS ainda não realizada.

## Procedimento para continuar

Antes de orientar o operador, consultar este registro e o código. Distinguir claramente teste local, teste informado pelo operador e teste em produção. Não supor que configuração de ambiente já foi aplicada ou que um teste isolado confirma todo o fluxo. SQL administrativo executado no chat não se torna automaticamente uma migração versionada.
