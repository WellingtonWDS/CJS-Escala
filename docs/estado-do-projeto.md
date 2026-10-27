# Estado do projeto — Reescala

Atualizado em **27/10/2026**. Referência funcional: versão de regras `ec141-2026-10-27-6` ([histórico do projeto](https://github.com/WellingtonWDS/CJS-Escala/commits/main/)). Esta página resume o andamento; o [README](../README.md) detalha operação, arquitetura, configuração e testes.

Identidade **Reescala** aplicada no login, cabeçalho, menu expandido/recolhido, carregamento, quadros de escala/impressão e ícone do navegador, usando os arquivos originais de `logos/`. A publicação inclui essa pasta e o login carrega suas imagens sem sessão; dados, chaves internas e permissões são preservados.

Logos com dimensões limitadas também no HTML para evitar crescimento com CSS antigo. Instalador administrativo do escritório/empresa **DEMO**, cinco colaboradores e preenchimento completo pronto para gerar/comparar: [ativação na VPS](empresa-demo.md). Instalador validado localmente; execução remota pendente.

Quatro novas empresas por segmento e onze preenchimentos DEMO para comércio contínuo, fazenda com sábado compensado, entidade 24h com 12×36/administrativo e padaria até 20h30. Casos de cobertura, readequação e contratação; os ciclos mistos são analisados na prévia e continuam fora da conversão automática. [Instalação e resultados esperados](cenarios-demo-segmentos.md). Instalador testado localmente; execução remota ainda pendente.

## Objetivo e estágio atual

Ajudar o escritório e suas empresas clientes a preencher a escala praticada atualmente, principalmente no modelo 6×1, e gerar uma proposta 5×2, respeitando as condições cadastradas e explicando a cobertura e as incompatibilidades encontradas.

O fluxo principal está implementado e continua em evolução. Já permite importar colaboradores, conferir jornadas, declarar restrições, gerar e ajustar a proposta e avaliar a suficiência do quadro nas faixas informadas. Isso não representa conclusão de todo o produto nem aprovação automática das condições jurídicas de uma escala.

Exclusão de preenchimentos implementada na seleção de empresa: confirmação por nome, permissão de edição, conflito de revisão, fechamento do aberto e preservação dos demais. Migração 007 necessária na VPS; aplicação remota ainda não confirmada. Validada com PostgreSQL/PostgREST e navegador reais locais, incluindo falha de rede, repetição, exclusão por colega e bloqueio de salvamento antigo. [Operação e ativação](exclusao-preenchimentos.md).

Novos nomes de preenchimento incluem data/hora local, sem renomear registros existentes. Seleção de empresa na janela usa um único controle com busca interna por razão social/CNPJ e teclado. Sair fica no final do menu lateral, inclusive recolhido. Alterações de interface não exigem migração adicional.

Janela **Usuários** unifica listagem, pesquisa por nome/escritório, cadastro, edição de nome/e-mail/perfil, situação por toggle e empresas autorizadas na edição. Admin global vê todos; Gerente gerencia seus vínculos, preservando outros escritórios; Operador não acessa. Revisão, auditoria e revogação de sessão protegem as alterações. Requer migração 008; aplicação na VPS ainda não confirmada.

Revisão visual aplicada a desktop e celular: cabeçalho claro, navegação e etapas, hierarquia de cartões/formulários, ações principais, modais, cadastros, grades, salvamento e login. CSS utilitário compilado localmente; lógica e dados preservados. [Guia de interface](interface.md).

Cadastro de colaboradores com explicações longas em ajuda contextual **?** (mouse, teclado e toque), sem série/visto fiscal e identificação da linha/arquivo na tela. Alertas de preenchimento e validação permanecem visíveis; dados importados são preservados.

Tutorial com janela arrastável pelo cabeçalho (mouse/toque), movimento por teclado, posição preservada entre etapas e limites da tela. Reabertura reinicia posicionamento automático; dados e visitas às etapas continuam preservados.

A etapa 7 mantém somente a orientação sobre a EC 141 e sua linha do tempo; o simulador de três referências foi removido. A comparação da escala atual com a proposta permanece na etapa 8.

Horários individuais disponíveis também para cadastro manual/CSV, turnos contínuos com campos vazios, sábado compensado/reposição do saldo com disponibilidade e descanso, conferência entre contrato/horários e teto contratual de 44h. A proposta redistribui intervalos para cobertura e a busca de ajustes também sugere pausas; origem, duração, jornada e edição manual são preservadas. [Operação e limites](horarios-individuais.md). Resultados antigos precisam ser gerados novamente; cadastros são preservados.

## Funcionalidades implementadas

| Área | O que já está disponível |
| --- | --- |
| Acesso | Modo compartilhado preservado; modo individual n8n configurável com cookie HttpOnly, sessão revogável no banco de até 12h, emissor/audiência explícitos e vínculo provisionado. Ativação depende de homologação. |
| Administração | Menu lateral por perfil e janela Usuários: diretório, pesquisa/filtros, cadastro, edição de nome/e-mail/perfil/situação e empresas autorizadas na edição. Senha bcrypt preservada, auditoria e conflito de revisão. Depende das migrações 004/008 e promoção explícita do proprietário; sem senha administrativa adicional ou cadastro público. |
| Empresas | Cadastro e edição de razão social/CNPJ para Gerente/Admin, criação de escritórios por Admin, unicidade por escritório, busca nos seletores e identificação na importação Domínio. Migrações 005/006 necessárias; empresas antigas sem CNPJ exigem confirmação do vínculo. |
| Carregamento e movimento | Overlay central animado, fundo escurecido/desfocado e bloqueio durante operações demoradas. Cancelamento de buscas preservado, confirmações não encobertas, saída em sucesso/erro e suporte a movimento reduzido; transições nas janelas e navegação. |
| Modais | Alertas, confirmações e prompts substituídos por janelas com estilo do sistema, fila de mensagens, foco/teclado e cancelamento preservado. Status do dia por select; horas por campo próprio. |
| Empresa atual e Preenchimentos | Barra inferior com razão social/CNPJ, escritório, nome e ações Salvar preenchimento/Salvar uma cópia. Janela separada para escolher e abrir; cópia pede nome e recuperação fica recolhida. Selecionar outra empresa sem abrir não muda o destino do salvamento. |
| Navegação | Menu lateral recolhível por perfil e oito etapas com avançar/voltar, acesso direto pela barra horizontal fixa no topo e compacta durante a rolagem, sem rolagem automática na troca, e preservação dos dados. Tutorial guiado de nove passos e indicadores de preenchimento obrigatório pendente. |
| Colaboradores | Cadastro manual, modelo/importação CSV e importação Domínio, com lista única para revisar, editar e remover pessoas. Os painéis de entrada começam fechados. |
| Importação Domínio | Relatórios Quadro de Horário de Trabalho em XLS/XLSX, prévia e confirmação, metadados da empresa, jornadas individuais, admissão e ciclos. Dias semanais omitidos são considerados folga; dados ambíguos exigem revisão. |
| Sexo por prenome | Sugestão conservadora por base local de nomes, limiar de 99% e requisitos de volume/disponibilidade dos dados, indicação de preenchimento automático e preservação de escolhas manuais. |
| Habilitações por função | Função principal e funções adicionais selecionadas na ficha, com alocação de uma função por plantão e sem contagem simultânea. |
| Restrições individuais | Férias, afastamentos, indisponibilidade e folga por período; dias indisponíveis e folgas obrigatórias recorrentes; uma janela permitida por dia da semana. Aplicação na geração, conversão, cobertura, edição e exportação. |
| Jornadas e escalas | Modelos 6×1, 5×2, 12×36 e personalizado; horários por dia, sábado reduzido, turnos A/B, jornadas noturnas e ciclos individuais importados. |
| Folgas e feriados | Folgas fixas/rotativas, opção 5×2 com sábado e domingo fixos, feriados nacionais e locais, escolha de trabalho no feriado e políticas de distribuição. Abono do feriado dispensado quando havia trabalho previsto. |
| Regras e validações | Fases por data e simulações de 44h/42h/40h conforme o texto fornecido da EC 141; verificações de jornada, intervalos, repousos e condições declaradas de ACT/CCT. Contrato de referência preservado. |
| Condições específicas de CCT | Intervalo computado e crédito noturno fixo de 1h por plantão quando declarados e aplicáveis ao 12×36, separados da presença efetiva na cobertura. |
| Geração e revisão | Grade mensal prioritária, erros antes da grade e análises recolhidas; rolagem nos dois eixos, barra superior e atalho para resumo; cartões de altura uniforme com nome e intervalo nas duas escalas; semanas civis completas, resumo semanal com horas, abonos e ausências, ocorrências por colaborador e ajustes manuais com recálculo. Bloqueios individuais não podem ser ultrapassados pela edição. |
| Cobertura operacional | Cadastro opcional de mínimos por função, horário e dia; identificação de faixas descobertas, considerando pausas e viradas de dia. As funções vêm do cadastro dos colaboradores. |
| Revisão manual | Aviso imediato de repousos/horas, busca de outra folga e de ajustes com colegas habilitados na mesma semana, prévia antes de aplicar, cancelamento e desfazer a última edição. Preserva o dia editado, demais edições e a cobertura anterior quando avaliada. |
| Ajustes de cobertura | Sugestões de troca de folga, horário/turno e função habilitada; prévia antes/depois, aplicar e desfazer a última aplicação, validação de dados atuais e carregamento com progresso/cancelamento em segundo plano. |
| Diagnóstico de pessoal | Lacunas agrupadas por função, dias, horário e quantidade, com datas; diferencia capacidade insuficiente, disponibilidade, habilitações compartilhadas e redistribuição. Verifica simultaneidade, horas e dias-pessoa sem duplicar a equipe. Presente na escala, comparação e CSV. |
| Conversão e comparação | Origem 6×1 preservada, com contexto 44h da referência automática mantido na grade, resumo, CSV e ajustes; proposta 5×2 em período próprio, busca de distribuição de folgas e comparação de horas, dias e cobertura. Diagnóstico de suficiência, insuficiência demonstrável, necessidade de ajustes, incompatibilidade ou ausência de base para avaliação. |
| Exportação e armazenamento | CSV detalhado, impressão/PDF da etapa aberta pelo navegador (incluindo painéis expandidos) e persistência local no navegador. Alterações invalidam resultados dependentes; versões antigas das regras exigem nova geração. |
| Estrutura técnica | Módulos separados de domínio, interface, importação, exportação e estado; build dos arquivos públicos e autenticação no servidor da Vercel. |

## Limitações atuais

- **Persistência:** no modo padrão, os dados continuam locais. O modo individual habilita rascunhos por escritório/empresa no servidor, com histórico interno, salvamento manual e reabertura em outro navegador; requer configurar n8n e banco. Não há sincronização automática, histórico navegável na interface ou backup remoto gerenciado pela aplicação. Trocar de domínio não transfere o cache local.
- **Provisionamento:** o modo individual tem contas vinculadas ao provedor, permissões e auditoria, há gestão integrada para criar novas contas e editar acessos dos operadores, dependente da migração 004 e dos perfis no banco; Admin pode criar escritórios; não há recuperação de senha ou convites. O provisionamento continua administrativo, sem cadastro público.
- **Busca limitada:** além da distribuição inicial de folgas, há sugestões de troca de folga, horário/turno e função. O motor usa até 600 avaliações e 20 ajustes por execução, mantém as horas e dias semanais e não aceita abrir outra lacuna. Ainda não há otimização global ou garantia de encontrar toda solução possível; 12×36 e ciclos diferenciados não são alterados automaticamente.
- **Horários restritos:** na geração inicial, a janela individual recorta a jornada sem estender o expediente ou mover a pausa. As sugestões podem deslocar entrada, pausa e saída dentro dos limites declarados, mediante aplicação da prévia, mas não aumentam as horas para suprir déficits. Plantão 12×36 incompatível é retirado inteiro, com explicação.
- **Diagnóstico:** os tetos potenciais não garantem viabilidade; férias podem exigir reforço temporário. Em noites/ciclos especiais, usa disponibilidade simultânea sem presumir rateio de horas/dias semanais. O limite de processamento ou dados inválidos suspendem a conclusão; as lacunas continuam disponíveis.
- **Capacidade e funções:** há habilitações adicionais e uma função alocada por plantão, sem divisão de funções em faixas dentro do dia. Não há dimensionamento exato de contratações. A capacidade potencial por função não implica disponibilidade simultânea de uma mesma pessoa em várias funções; lacuna na proposta gerada, isoladamente, não prova falta de pessoal.
- **Ausências:** férias e afastamentos ajustam a meta operacional de alocação; não há cálculo de folha, benefícios ou efeitos previdenciários.
- **Regimes importados:** a conversão atende à origem 6×1 compatível. Importar um ciclo diferente não significa convertê-lo automaticamente para 5×2; âncoras e informações ambíguas precisam ser conferidas.
- **Conferência normativa:** a implementação usa o texto da EC 141 fornecido para o projeto. Cláusulas coletivas, exceções e efeitos específicos do trabalho noturno continuam sujeitos às verificações indicadas no relatório. A análise individual avançada de enquadramento permanece oculta e desativada por padrão.
- **Publicação:** na Vercel, o login depende do middleware, das funções de API e das variáveis privadas. Há também adaptador Node.js para futura VPS, dependente de configuração HTTPS/proxy/supervisão; essa migração não foi executada. O build estático sozinho não fornece proteção. Fontes do Google são opcionais, com fallback; o Tailwind agora é compilado e servido localmente.
- **Publicação de escalas:** ainda não há fluxo de rascunho → revisão → aprovação/publicação com registro de responsáveis.

## Planejamento de persistência — 26/10/2026

O [registro de implantação](implantacao-atual.md) distingue código disponível, resultados confirmados pelo operador na VPS e validações de produção ainda pendentes. Consultá-lo antes de continuar a ativação.

Definida a evolução para várias contabilidades, com isolamento por escritório e empresas, usuários provisionados por administração autorizada e sem autocadastro público. Os fluxos de login/cadastro do n8n foram analisados estaticamente; sua reutilização exige adaptar tokens, sessões, permissões e provisionamento. A API deve ser portátil para a futura mudança da Vercel para a VPS, no domínio fintria.com.br. A primeira entrega já implementa a base de banco, RLS, RPCs de rascunhos, revisão/idempotência e histórico/auditoria, junto aos serviços portáteis de servidor/frontend. Foi validada localmente em PostgreSQL 17 e PostgREST 14.15, versão confirmada na VPS. O operador confirmou o login individual na Vercel e iniciou a validação de salvar rascunhos. A integração ponta a ponta continua sendo acompanhada pelo registro de implantação; não presumir homologação das funções novas. A infraestrutura foi configurada manualmente pelo operador; o registro de homologação abaixo distingue os resultados confirmados das etapas pendentes. Operação e limites: [database/README.md](../database/README.md). Detalhes: [plano de persistência](planos/persistencia-postgresql.md) e [análise n8n](planos/autenticacao-n8n.md).

O template de homologação usa o nó JWT nativo, com segredo em credencial e claims explícitos, sem exigir acesso às variáveis de ambiente nos nós Code. O caminho `auth/cjs-login` aproveita o proxy `/auth/*` existente.

O [guia de homologação n8n](../integrations/n8n/README.md) e o template de login independente estão disponíveis. `AUTH_MODE=shared` e `PERSISTENCE_ENABLED=false` preservam a configuração atual até a ativação.

## Próximos passos propostos

As implementações de restrições individuais, sugestões de ajustes de cobertura e diagnóstico de pessoal foram concluídas no escopo acima. Os itens abaixo são propostas de evolução, **ainda não implementadas**, sem prazo definido. A ordem pode ser revista conforme os testes com usuários.

| Prioridade | Evolução | Resultado esperado |
| --- | --- | --- |
| 1 | Comparação visual mais detalhada | Destacar as mudanças de cada dia e colaborador entre origem e proposta, além das tabelas e grades já disponíveis. |
| 2 | Empresas, contas e versões salvas | Adicionar banco de dados, separação de empresas e usuários, persistência central e recuperação de versões. |
| 3 | Revisão e publicação da escala | Registrar revisão, aprovação e publicação, com histórico de alterações e identificação dos responsáveis. |

## Última validação registrada

Na entrega de cadastro/busca de empresas e importação Domínio com vínculo por CNPJ, em **26/10/2026**, foram registrados:

- Janela Usuários validada em banco e navegador reais locais: pesquisa/filtros, edição, toggles com cancelamento, conta compartilhada, perfis, Consulta legada, escopos, e-mail duplicado com rollback, concorrência, revogação global, auditoria e layout móvel.
- **460 testes unitários aprovados**, sem falhas, com `npm test`.
- Integração real com PostgreSQL 17 e PostgREST 14.15 aprovada por `npm run test:persistence`: isolamento de escritórios/empresas, permissões, concorrência, idempotência, histórico/auditoria, FK cruzada, token inválido/expirado e sessão revogada.
- Edição de empresa e criação de escritório validadas em navegador e banco reais locais. Dois Operadores distintos abriram e atualizaram a mesma escala salva; revisão antiga foi bloqueada, edição da empresa preservou os rascunhos e retirada de acesso impediu nova leitura.
- Modais validados em navegador: Escape/Enter, foco restaurado, texto tratado sem HTML, fila, janelas sobrepostas, limpeza confirmada/cancelada e celular. Suíte completa de interface, login compartilhado e integração individual/banco passaram após a troca dos diálogos nativos.
- Overlay validado com gravação lenta e falha simulada, prevenção de envio repetido, operações simultâneas, confirmação durante processamento, cancelamento de cálculo e viewport móvel/movimento reduzido. Suíte completa de interface, login e integração individual com banco local passaram.
- Barra de empresa/preenchimento validada em desktop/celular: salvar sem abrir modal, cópia/cancelamento e seleção de outra empresa sem alterar título/destino atual. Integração com banco preservou repetição de envio sem duplicar, conflito entre sessões e recuperação local.
- Build atual aprovado com `npm run build`.
- `test:identity:browser` aprovado com PostgreSQL/PostgREST locais reais e provedor n8n simulado: perfis, menu recolhível, cadastro de empresas, CNPJ numérico/alfanumérico, duplicidade concorrente, busca e importação Domínio (existente/nova/cancelamento/sem acesso), isolamento de contextos e rascunhos. Testes de navegação/impressão e importação local dos três layouts também aprovados. O novo fluxo não foi executado na VPS real. Os cenários abaixo são registros de validações anteriores.
- Edição de folga para trabalho com 48h/um repouso: aviso, alternativas próprias e com colega, respeito a restrições e habilitações, cobertura preservada, dados obsoletos bloqueados, aplicação e desfazer após recarga. Cartões uniformes em desktop, celular e impressão.
- Prévia prioriza grade, mantém erros abertos antes dela e análises recolhidas depois. Barras sincronizadas e atalho para resumo testados em desktop, viewport equivalente a zoom ampliado e celular; impressão libera todas as semanas.
- ACT/CCT real na origem: preservação das condições vigentes, não aplicação de instrumentos futuros/expirados, sinalização de vigência inválida e exibição do intervalo descontado nos avisos de jornada diária.
- Regressão do contexto da referência atual: 11h–13h de intervalo, 44h em 6×1 versus simulação futura de 42h, ACT/CCT com vigência futura, resumo semanal, CSV, persistência, edição com excesso real, busca de ajustes e nova prévia avulsa.
- Cenários de lacunas recorrentes, capacidade por horário, funções compartilhadas, janelas restritas, férias, semanas e meses parciais, horas/dias-pessoa insuficientes, turnos noturnos, dados inválidos e exportação. Na interface: recálculo ao aplicar/desfazer ajustes e suspensão da conclusão desatualizada.
- Cenários de ajustes de horário/turno, habilitações e alocação sem duplicação, manutenção da cobertura existente, troca de folga, 11h de interjornada, sete dias consecutivos, janelas importadas, dados obsoletos, aplicar/desfazer e progresso/cancelamento na interface.
- Cenários de férias parciais e integrais, afastamentos, feriados durante ausências, folgas fixas, janelas diurnas/noturnas, plantões 12×36/CCT, turnos A/B, virada de mês, admissão, importação Domínio, cobertura, conversão, CSV, persistência e bloqueio de edição incompatível.

Este é o registro daquela validação, não uma execução contínua nem uma confirmação do estado do deploy na Vercel. Os comandos para novas execuções e para a suíte específica de autenticação estão no [README](../README.md#testes). Os testes de interface simulam serviços externos e não validam integralmente a aparência ou a disponibilidade das CDNs.

## Documentos de referência e manutenção

- [README](../README.md): referência de uso e configuração atual.
- [Auditoria EC 141 de 21/10/2026](auditorias/ec141-2026-10-21/relatorio.md) e [correções correspondentes](auditorias/ec141-2026-10-21/correcoes.md): achados e correções dos commits auditados; consultar em conjunto, como histórico.
- [Onda de cenários setoriais de 21/10/2026](cenarios/onda-setorial-2026-10-21.md): validação histórica de operações de padaria, comércio, farmácia e outros perfis; a contagem de testes desse relatório se refere àquela data.
- [Fontes e critérios da base de nomes](../assets/js/data/FONTES-NOMES.md): proveniência e reprodução dos dados locais.

Ao entregar uma funcionalidade, atualizar esta página e o trecho correspondente do README: mover somente o escopo efetivamente entregue para Implementado, registrar limitações, revisar os próximos passos e atualizar data, versão ou commit de referência e evidências de validação. Manter relatórios históricos identificados pela data, sem sobrescrever seus resultados com números atuais. Nunca registrar senhas ou valores de segredos na documentação.
