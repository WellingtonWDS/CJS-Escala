# Desempenho — otimizações de 24/11/2026

Preparação para a divulgação. Os gargalos medidos foram o login, que conferia a senha no n8n dentro da VPS, e a lista de empresas (`company_cards`), cujo custo crescia com o total de empresas do sistema.

## Banco — migração 020_performance_listas.sql

- `cjs_private.visible_offices()`: descobre uma vez os escritórios do usuário e o que ele pode em cada um. Espelha `allowed()`, `office_visible()` e `manage_office()` (migração 010); se uma delas mudar, mude também esta função.
- Usam essa função `company_cards`, `company_options`, `manage_options` e `diagnostic_options`, com as mesmas assinaturas e respostas.
- `drafts.summary_employees` e `drafts.summary_has_result`: colunas calculadas pelo banco a cada gravação. Os cartões deixam de descompactar o preenchimento inteiro (até 1 MB) de cada rascunho.
- Índices `companies(office_id)` e `drafts(office_id, company_id, updated_at DESC, id)` só com os rascunhos ativos.

Resultado com 3.200 empresas e 4.800 rascunhos, comparando antes e depois em 100 sessões (respostas idênticas):

| Função | Editor/gerente | Admin geral |
|---|---|---|
| company_cards | ~335 ms → ~1 ms | 907 → 128 ms |
| company_options | ~336 ms → ~1 ms | 311 → 56 ms |
| manage_options (gerente) | 366 ms → 1,4 ms | 61 → 65 ms |
| diagnostic_options (gerente) | 275 ms → 0,5 ms | 238 → 31 ms |

## Login — migração 021_login_direto.sql

- O backend (função do Vercel) confere a senha com bcrypt (`bcryptjs`, ~300 ms por login, fora da VPS). O banco só entrega o hash ao papel de serviço (`cjs_api.login_lookup`, exclusivo de `cjs_identity_gateway`) e abre a sessão. O hash nunca chega ao navegador.
- Para e-mail inexistente, a conferência é feita contra um hash fictício, com o mesmo tempo de resposta.
- Enquanto a 021 não for aplicada, o login continua pelo fluxo n8n. Depois de aplicada e conferida, o fluxo "CJS Escala — Login individual" do n8n pode ser desativado. As variáveis `N8N_LOGIN_URL` e `N8N_JWT_*` continuam necessárias como alternativa.
- Limite global de tentativas: até 15 por segundo e 600 por minuto. Antes eram 120 por minuto, liberadas de uma vez no início do minuto. Por e-mail continua o mesmo: 10 tentativas a cada 15 minutos.

## Front-end

- No build, a tela principal passa a carregar um pacote minificado com divisão de código (`assets/js/app/`) e os estilos num único arquivo (`assets/css/app-*.css`), em vez de cerca de 100 módulos e 12 folhas de estilo. Os módulos originais continuam publicados para os workers, as páginas auxiliares e os testes.
- Abertura medida localmente: de 119 para 20 requisições, de 1.154 para 790 KB sem compressão, e de 833 para 335 ms até a tela pronta.
- `vercel.json`: cache imutável de 1 ano para os arquivos com hash; 1 dia, com revalidação em segundo plano, para bibliotecas (`assets/vendor`) e logos.

## Retenção do histórico — migração 022_retencao_versoes.sql

- A cada salvamento, o banco guarda uma cópia completa do preenchimento (até 1 MB) em `draft_versions`. Agora ficam só as **15 versões mais recentes** de cada preenchimento; as mais antigas são apagadas no próprio salvamento. Na aplicação da migração, o excedente que já existia é apagado de uma vez.
- `idempotency` (proteção contra envio duplicado) ganhou a coluna `created_at`. Os registros existentes recebem a data do salvamento correspondente, e os com mais de 30 dias são apagados, em lotes de até 200 a cada salvamento.
- A auditoria (`audit`: quem salvou, criou ou excluiu, e quando) continua completa.

## Front-end — carregamento sob demanda e fontes próprias

- A base de nomes do IBGE (~190 KB) só é baixada ao importar um quadro ou ao usar a sugestão de sexo. O JavaScript da abertura caiu de 547 para 374 KB sem compressão.
- As fontes Inter e Space Grotesk passaram a ser servidas pelo próprio site, em versão variável (um arquivo por família para todos os pesos, licença OFL, pacotes `@fontsource-variable`), em vez do Google Fonts. A abertura não faz mais nenhuma requisição externa, e a fonte principal é pré-carregada. Cache de 30 dias.

## Próximos passos sugeridos

- **Região das funções do Vercel:** configurada em `arn1` (Estocolmo), a mais próxima da VPS em Helsinki (`regions` no `vercel.json`). Cada ação faz de 1 a 3 chamadas do Vercel à VPS, que agora ficam a poucos milissegundos.
- **Admin geral com milhares de empresas:** paginar a lista de cartões, se os 128 ms incomodarem.
