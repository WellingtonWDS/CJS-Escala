# Análise dos fluxos n8n e adaptação para CJS Escala

Data: 26/10/2026. Escopo: leitura estática das exportações de login e criação de conta fornecidas pelo usuário. Nenhum webhook foi chamado e nenhum usuário foi criado. Não foram acessados banco, credenciais, configuração do proxy ou execução do n8n. Arquivos originais e dados fixados não integram este documento nem devem ser adicionados ao repositório.

## Decisões do produto

- Equipes de várias contabilidades, cada escritório com suas empresas e permissões isoladas.
- Sem autocadastro público. Novos escritórios são provisionados por administração da plataforma; membros são provisionados por administração autorizada do escritório. Ativação por convite é uma possibilidade, sem conceder permissões livremente ao portador.
- Autenticação pelo n8n pode ser reaproveitada após adaptação e homologação, preservando o outro projeto.
- API da aplicação portátil entre Vercel e VPS. Hospedagem futura dentro de fintria.com.br, com endereço exato a definir. A troca de hospedagem ocorre em uma etapa própria.

## Caminhos efetivamente conectados

**Cadastro:** Webhook → Validate Input → Check Existing User1 → Verify User input → If → Hash Password → Create User → Code in JavaScript1 → Respond to Webhook. A saída negativa do If responde conflito. Os nós antigos de consulta e verificação não pertencem ao caminho acionado pelo webhook.

**Login:** Webhook → Validate Input → Execute a SQL query → User exists? → Compare password → Password match? → JWT → If → Execute a SQL query1 → Respond to Webhook2. As verificações de usuário e senha têm saídas de erro próprias. O nó Code chamado Generate JWT está desconectado da entrada.

A leitura das conexões foi verificada por travessia do grafo a partir de Webhook. Isso confirma o caminho estático, não o comportamento da instância em produção.

## O que pode ser aproveitado

A estrutura consulta usuário no PostgreSQL, usa bcrypt (custo 12 no cadastro), compara senha antes de emitir token, utiliza parâmetros `$1`, `$2`, `$3` nas consultas e atualiza a data do último login. O login conectado emite `sub` convertido para string e usa credencial do n8n para assinar JWT. É uma base útil; a autorização por escritório, a sessão e a segurança do provisionamento precisam ser acrescentadas.

## Achados e adaptações

| Achado na exportação | Efeito e ação para este produto |
| --- | --- |
| Webhook de cadastro sem autenticação configurada no nó e sem conferência de convite/administrador no caminho conectado. | Não reutilizar como cadastro aberto. Ausência de formulário não protege o endpoint. Restringir a chamada ao backend autorizado e conferir no banco o ator e seu poder de provisionamento. Não foi possível verificar proteções externas já existentes no proxy. |
| Nó Generate JWT contém validade de 30 dias, mas está desconectado. O caminho real usa o nó JWT, com opções vazias e sem `exp`, `iss` ou `aud` explícitos no payload exportado. | Não concluir validade real a partir do código de 30 dias. Verificar configuração da credencial/nó e versão do n8n em homologação. Exigir expiração explícita, algoritmo permitido, emissor e audiência deste produto. Sessão máxima proposta: 12h; token de acesso às RPCs curto e limitado pela sessão. |
| JWT conectado usa papel `dlu_authenticated`, referente ao outro projeto. | Definir papel restrito e audiência próprios de CJS Escala. Não conceder acesso às tabelas do outro projeto nem aceitar seu token por compartilhamento de chave. A assinatura sozinha não demonstra autorização para este produto. |
| Não há checagem de usuário ativo, vínculo com escritório, empresas permitidas ou sessão revogável nas consultas exportadas. | Persistir e validar esses vínculos. Login estabelece identidade; cada RPC verifica autorização atual. Desativação, saída e remoção de vínculo precisam ter efeito no servidor. A situação real das políticas e tabelas não pode ser inferida do JSON. |
| Nó If após JWT compara dois textos literais vazios. | Não verifica sucesso da emissão; com a configuração apresentada, a comparação é verdadeira. Remover a condição inócua ou substituir por verificação real da saída/erro, sem tratar presença de texto como validação criptográfica. |
| User not found e Incorrect password têm mensagens distintas e não definem código HTTP de erro; Error também não o define. | Usar resposta genérica de credenciais inválidas e status 401, validação com 400 e falha interna com 5xx. Acrescentar limitação de tentativas no serviço de entrada; controles externos atuais não foram verificados. |
| Cadastro devolve `token: $json.token`, mas não há emissão de token nesse caminho. | Corrigir o contrato: provisionamento retorna o usuário/vínculo criado; ativação e login são passos explícitos. Não indicar sessão autenticada após um cadastro que não emitiu credencial. |
| Verificação de duplicidade ocorre antes de INSERT, em consultas separadas. | Verificar constraints únicas normalizadas no banco. A pré-consulta não impede corrida. Provisionamento de usuário/vínculo/convite deve ser transacional, com tratamento de conflito e repetição idempotente. O DDL não foi fornecido, então não se afirma que constraints estejam ausentes. |
| Validação usa `.trim()`/`.length` sem conferir consistentemente o tipo e limites. Usuário composto apenas por espaços pode passar pela presença inicial do cadastro. | Exigir objeto válido, strings, tamanhos máximos, normalização e rejeição de entradas vazias após trim. Com bcrypt, definir limite por bytes e rejeitar excesso para evitar truncamento silencioso (72 bytes nas implementações usuais). Testar caracteres multibyte. |
| Consultas usam tabela `users` sem schema em partes do caminho e campos de gamificação do outro produto. | Definir schema/identidade do produto ou serviço de identidade compartilhado explicitamente. Remover campos de gamificação do contrato de escalas. Conferir privilégios da credencial do n8n; o export só contém referências a credenciais. |
| Resposta de login é montada como texto JSON com interpolação de dados do usuário. | Preferir objeto estruturado e serialização JSON, evitando que aspas ou caracteres especiais gerem respostas inválidas. Confirmar comportamento na versão do n8n usada. |
| Password e password_hash atravessam dados dos nós; ambos os arquivos incluem pinData com senha de exemplo. | Remover dados fixados antes de reutilizar/exportar. Configurar retenção e salvamento de execuções para não registrar senhas ou tokens. Se a senha fixada for real ou reutilizada, substituí-la. Não foi reproduzida neste relatório. |

O uso de parâmetros SQL é positivo. Ainda é necessário verificar no n8n a montagem de `queryReplacement` em texto separado por vírgulas, inclusive com valores que contenham vírgulas; preferir parâmetros estruturados suportados pela versão instalada. Não há evidência suficiente para afirmar uma injeção SQL a partir da exportação.

## Fluxo recomendado

1. Administração da plataforma provisiona o escritório e o primeiro administrador. Administração autorizada do escritório provisiona os membros. O banco determina escritório e permissões a partir do ator autorizado, sem confiar em papéis solicitados no corpo.
2. Se houver convite, usar token aleatório, de uso único, com expiração, armazenado por hash, associado ao destinatário e ao escritório. Sua ativação não equivale a um endpoint de cadastro livre. Definição inicial de senha não deve depender de senha padrão compartilhada.
3. O navegador chama `/api/auth` na mesma origem. A API faz a chamada interna ao fluxo de login n8n, com autenticação de serviço, tamanho/tempo limitados e contrato validado. A API não deve ser um proxy irrestrito para webhooks.
4. n8n valida as credenciais e a situação do usuário e retorna credencial de identidade com assinatura, emissor, audiência e expiração explícitos. A API verifica criptograficamente essa credencial e estabelece uma sessão revogável, representada no navegador por cookie HttpOnly/Secure/SameSite.
5. Nas operações de negócio, a API confere a sessão e usa JWT curto restrito ao PostgREST deste produto. Esse token pode ser emitido pelo backend ou obtido de emissor interno, conforme o contrato final. Tokens de identidade/login e de RPC têm finalidades explícitas e não são intercambiáveis automaticamente.
6. PostgreSQL confere sessão ativa, vínculo com o escritório, empresa e papel para cada RPC. Não depender apenas do escritório inscrito no token. Nenhum token ou senha do banco é armazenado em localStorage.

O n8n participa de autenticação/provisionamento, sem intermediar cada consulta, salvamento ou cálculo de escala. A API e o banco também precisam falhar de forma fechada se a sessão não puder ser validada.

## Homologação necessária antes de integrar

Validar token assinado, expirado, com emissor/audiência/algoritmo incorretos, sessão revogada, usuário inativo, senha errada, usuário inexistente e dados malformados. Confirmar respostas com caracteres especiais, comportamento de consultas sem linhas (o nó de busca de login tem alwaysOutputData habilitado), conflitos simultâneos no cadastro e indisponibilidade de n8n/PostgreSQL.

Testar dois escritórios e duas empresas: usuário do escritório A não acessa nem provisiona o B, mesmo manipulando IDs, claims ou pedidos ao webhook. Convite expirado/usado ou destinado a outro usuário não ativa vínculo. Cadastro sem autorização é negado mesmo quando chamado diretamente.

Para fechar a integração faltam versões de n8n/PostgREST, configuração efetiva do nó JWT sem revelar a chave, contrato das tabelas de identidade/permissões e topologia de publicação da VPS. Não é necessário enviar segredos para definir esses contratos.
