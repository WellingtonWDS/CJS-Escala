# Estado do projeto — Reescala

Atualizado em **29/10/2026**. Referência funcional: versão de regras `ec141-2026-10-29-10` ([histórico do projeto](https://github.com/WellingtonWDS/CJS-Escala/commits/main/)). Esta página resume o andamento; o [README](../README.md) detalha operação, arquitetura, configuração e testes.

Identidade **Reescala** aplicada no login, cabeçalho, menu expandido/recolhido, carregamento, quadros de escala/impressão e ícone do navegador, usando os arquivos originais de `logos/`. A publicação inclui essa pasta e o login carrega suas imagens sem sessão; dados, chaves internas e permissões são preservados.

Logos com dimensões limitadas também no HTML para evitar crescimento com CSS antigo. Instalador administrativo do escritório/empresa **DEMO**, cinco colaboradores e preenchimento completo pronto para gerar/comparar: [ativação na VPS](empresa-demo.md). Instalador validado localmente; execução remota pendente.

Quatro novas empresas por segmento e onze preenchimentos DEMO para comércio contínuo, fazenda com sábado compensado, entidade 24h com 12×36/administrativo e padaria até 20h30. Casos de cobertura, readequação e contratação; os ciclos mistos são analisados na prévia e continuam fora da conversão automática. [Instalação e resultados esperados](cenarios-demo-segmentos.md). Instalador testado localmente; execução remota ainda pendente.

Carregamento imediato na geração atual/proposta, cálculo em Worker local, bloqueio de duplicação, liberação em falhas e proteção contra resultados de dados alterados. Resumo da busca de cobertura aparece primeiro em modal e depois abaixo do botão, com aplicação separada. Regras de cálculo e versões de dados preservadas.

## Abertura remota com quota local esgotada — 29/10/2026

Corrigido o fluxo que ainda exigia `workspace.activate` gravar no localStorage e depois recarregava a página para abrir um preenchimento. A ativação tolerante agora mantém um snapshot isolado em memória; a aplicação lê essa cópia e reinicializa os formulários/grades no mesmo documento, com o período salvo preservado. Seleção durável e caches/pendências anteriores não são apagados quando falta espaço. A cópia local anterior continua recuperável, e a recuperação passa a acompanhar o cache durável quando o espaço volta.

A interface avisa sobre dados apenas na aba e orienta salvar no servidor antes de sair. Abertura nesse fallback não força reload; após uma recarga, o usuário deve selecionar novamente o preenchimento remoto. Salvamento e validação de acesso continuam no servidor, com os controles existentes. Sem migração, RPC, variável ou nova versão das regras.

Validação local: **510 testes unitários**, build, suíte completa de navegador e integração PostgreSQL 17/PostgREST 14.15 com navegador aprovados. O teste específico bloqueia a gravação local, abre um snapshot remoto com mês e escalas, preserva o cache anterior e salva no servidor; verifica também a troca para um preenchimento sem escala, limpando grades, rascunho manual e prévias de importação anteriores.

## FAB, horários replicados e troca de dias — 29/10/2026

Painel de salvamento inicialmente recolhido, aberto por FAB verde **Salvar preenchimento** no canto inferior direito, com **Minimizar** e espaço inferior reduzido. Mantidos contexto, cópia, recuperação, confirmação remota e permissões.

Horários individuais semanais podem ser replicados de outro colaborador com confirmação e cópia independente. Preserva dados pessoais, admissão, função e restrições; a referência contratual segue o checkbox existente. Alteração invalida a escala para nova geração.

Simulação explícita de 42h na conversão exige ACT/CCT identificado, compatível, vigente em todo destino/referência fixa, com compensação diária e teto >=8h24. Opção desabilitada quando não atende; seleção anterior inválida é substituída por 40h. Referência automática e contexto jurídico da origem preservados.

Arraste troca dois dias de trabalho/folga do mesmo colaborador; alternativa de seleção de dois cards permite teclado/toque. Confirmação com efeito nas lacunas, validação atômica, restrições/novos erros bloqueados, recálculo e desfazer com assinatura. Fixo altera o padrão recorrente, dinâmico altera as datas. Não troca identidades, não move ausências especiais nem readequa colegas automaticamente. Resultado e metadados acompanham o preenchimento/exports existentes. Sem migração SQL, variável ou mudança das regras de geração.

Validação local desta entrega: **508 testes unitários**, build, suíte completa de navegador e integração PostgreSQL 17/PostgREST 14.15 com navegador aprovados. Inclui FAB/minimização, cópia de horários, bloqueio de 42h, arraste/seleção, cancelamento/confirmar, desfazer, restrições, padrão fixo e preservação da origem.

## Persistência de resultados e seletor — 29/10/2026

Salvar preenchimento já incluía a escala atual e a proposta. Corrigida a distinção entre falha do cache automático e confirmação remota. No modo individual, resultados completos são compactados sem perda no cache, recuperação, pendências e transporte, mantendo leitura de estados antigos. Quota local não bloqueia o salvamento remoto: envio pendente fica em memória quando necessário, com aviso explícito para manter a aba aberta e repetição pela mesma chave. Confirmação depende da resposta do servidor e atualiza o aviso da geração quando a versão atual foi salva. Não há autosave remoto nem mudança de cálculo/permissões.

Nova correção do seletor cobre foco no próprio modal/body/contêiner de rolagem e pointerdown nativo redirecionado ao ancestral, além do caso anterior de foco nulo. Altura fixa mantida; seleção externa e teclado preservados.

504 testes unitários, build e suíte completa de navegador aprovados. PostgreSQL 17/PostgREST 14.15 e navegador reais locais: round-trip completo de 30 colaboradores (aprox. 4,3 MB → 630 KB), compartilhamento, revisões, idempotência e isolamento aprovados. Limite de 1 MiB por JSONB mantido, sem migração SQL. Codec documentado no [README do banco](../database/README.md). Não confirma implantação na VPS/Vercel.

## Correções de interface e intervalos — 29/10/2026

Seletor de empresas deixa de fechar quando a barra de rolagem provoca perda de foco com destino nulo; foco/clique externos continuam fechando. Modal com altura fixa de 85dvh e rolagem interna. Tabelas de comparação com largura mínima, explicação espaçosa, alinhamento superior e textos semanais em blocos. Botões CSV removidos da etapa; PDFs e ZIP permanecem. Serializador CSV interno continua com regressões independentes da interface.

Art. 71: mínimos de 15min para mais de 4h até 6h e 1h para mais de 6h preservados; teto geral de 2h validado, sem presumir exceção não cadastrada. Blocos contínuos maiores que 6h geram aviso preventivo para revisão do regime/categoria. Atualização posterior: para jornadas de 7h a 9h efetivas, sugestões automáticas iniciam a pausa entre 3h e 5h após entrada, inclusive trocas de horário/turno e noites. Exemplo 08h–18h/2h de pausa: início 11h–13h. Outras durações mantêm a política anterior de até quatro horas. É uma política de distribuição, não prazo fixado no artigo; preserva duração e limites de disponibilidade. Origem preservada. Versão `ec141-2026-10-29-10` exige nova geração, sem migração SQL. 498 testes unitários, build e suíte completa de navegador aprovados; navegador dedicado verifica barra de rolagem/foco nulo, altura fixa desktop/celular e ausência dos botões CSV.

Validação da atualização da faixa: **501 testes unitários**, build e testes de navegador de ajustes de cobertura, conversão, escala fixa e cobertura aprovados. A proposta também reposiciona pausas fora da faixa quando não há demanda operacional; a escala atual permanece preservada para comparação. A suíte completa de navegador citada acima pertence à entrega anterior de seleção/intervalos.

## Documentos PDF — 29/10/2026

Exportação própria em A4 paisagem com logo, empresa/período, horários, pausas, folgas, função, resumo semanal e pendências. Escala atual e proposta, nos modos dinâmico/fixo: um PDF completo para o empregador com cobertura e um ZIP com PDF individual por colaborador. Geração local com jsPDF/AutoTable/fflate, sem imprimir a interface. Proposta desatualizada bloqueada; rascunho permanece identificado. Não altera cálculo, versão das regras, banco ou permissões. 496 testes unitários aprovados, build, suíte completa de navegador e testes específicos de conteúdo/isolamento e downloads reais de PDF/ZIP no navegador. Quadro diário, assinatura e aprovação/publicação permanecem fora desta entrega.

## Modos de escala — entrega de 28/10/2026

Escolha inicial entre **mensal dinâmica** e **mensal fixa**. O modo fixo representa uma semana recorrente, independente do mês e feriados; retira Feriados das etapas e do tutorial, com contagem e navegação por teclado ajustadas. Referência jurídica explícita, fase automática nessa data ou simulação de 42h/40h na proposta. Campos e feriados mensais são preservados ao alternar; resultados dependentes exigem nova geração.

Cobertura e comparação semanais, grade segunda–domingo com horas/intervalos/folgas e resumo semanal, diagnóstico, sugestões recorrentes de intervalo, CSV fixo e impressão. Jornadas, descansos na virada semanal, restrições semanais e condições coletivas continuam verificados. Cadastros antigos permanecem dinâmicos; modo e referência são salvos no JSON do preenchimento, sem migração SQL. A mudança da versão de regras invalida cálculos antigos para nova geração.

Limites desta primeira entrega: eventos por data (inclusive admissão) não são aplicados ao padrão; 12×36/ciclos e compensações com apuração datada usam o dinâmico. A busca avulsa de cobertura continua no dinâmico. A edição nos cards já funciona nos dois modos: por data no dinâmico e por dia da semana em todo o padrão fixo, com revisão e desfazer. Domingos fixos trabalhados em comércio/por colaboradoras exigem rever o revezamento. Referência legal/CCT exige revisão quando mudar sua validade. Ignorar feriados no modelo não autoriza trabalhar em qualquer feriado real.

## Revisão da precisão — 28/10/2026

Conversão aprimorada para buscar carga compatível mesmo sem cobertura, considerando dias por perfil, sábado reduzido, limites diários por data do ACT/CCT, pausa e janela individual antes da distribuição. Prioridades: erros, lacunas e déficit. Busca com orçamento proporcional e cota por pessoa, sinalização de pesquisa parcial e cache de análises inalteradas. Nove novos testes incluem 24 combinações, contrato curto sem redução proporcional e semana de transição/Natal. [Relatório](auditorias/precisao-5x2-2026-10-28.md). Regras `ec141-2026-10-28-8` exigem nova geração; sem migração SQL.

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
| Acesso | Modo compartilhado preservado; modo individual n8n configurável com cookie HttpOnly, sessão revogável no banco de até 12h, emissor/audiência explícitos e vínculo provisionado. Login individual já confirmado pelo operador; novas implantações dependem de configuração e homologação. |
| Administração | Menu lateral por perfil e janela Usuários: diretório, pesquisa/filtros, cadastro, edição de nome/e-mail/perfil/situação e empresas autorizadas na edição. Senha bcrypt preservada, auditoria e conflito de revisão. Depende das migrações 004/008 e promoção explícita do proprietário; sem senha administrativa adicional ou cadastro público. |
| Empresas | Cadastro e edição de razão social/CNPJ para Gerente/Admin, criação de escritórios por Admin, unicidade por escritório, busca nos seletores e identificação na importação Domínio. Migrações 005/006 necessárias; empresas antigas sem CNPJ exigem confirmação do vínculo. |
| Carregamento e movimento | Geração atual/proposta em Worker com indicação imediata e proteção contra resultados obsoletos. Overlay central animado, fundo escurecido/desfocado e bloqueio durante operações demoradas. Cancelamento de buscas preservado, confirmações não encobertas, saída em sucesso/erro e suporte a movimento reduzido; transições nas janelas e navegação. |
| Modais | Alertas, confirmações e prompts substituídos por janelas com estilo do sistema, fila de mensagens, foco/teclado e cancelamento preservado. Status do dia por select; trabalho editado por entrada, início/fim de intervalo e saída, com pausa opcional e validação no formulário. |
| Empresa atual e Preenchimentos | Modal com 85% da tela no desktop e coluna única no celular. Barra inferior com razão social/CNPJ, escritório, nome e ações Salvar preenchimento/Salvar uma cópia. Janela separada para escolher e abrir; cópia pede nome e recuperação fica recolhida. Selecionar outra empresa sem abrir não muda o destino do salvamento. |
| Navegação | Menu lateral recolhível por perfil, oito etapas no dinâmico e sete no fixo, com avançar/voltar e acesso direto pela barra horizontal fixa e compacta durante a rolagem. Sem rolagem automática na troca. Tutorial com nove passos no dinâmico e oito no fixo; visitas do tutorial não acionam indicadores de preenchimento pendente. |
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
| Ajustes de cobertura | Resumo em modal antes do retorno/prévia abaixo do botão. Sugestões de troca de folga, horário/turno e função habilitada; prévia antes/depois, aplicar e desfazer a última aplicação, validação de dados atuais e carregamento com progresso/cancelamento em segundo plano. |
| Diagnóstico de pessoal | Lacunas agrupadas por função, dias, horário e quantidade, com datas; diferencia capacidade insuficiente, disponibilidade, habilitações compartilhadas e redistribuição. Verifica simultaneidade, horas e dias-pessoa sem duplicar a equipe. Presente na escala, comparação e CSV. |
| Conversão e comparação | Origem 6×1 preservada, com contexto 44h da referência automática mantido na grade, resumo, CSV e ajustes; proposta 5×2 em período próprio, busca de distribuição de folgas e comparação de horas, dias e cobertura. Diagnóstico de suficiência, insuficiência demonstrável, necessidade de ajustes, incompatibilidade ou ausência de base para avaliação. |
| Exportação e armazenamento | CSV detalhado, impressão/PDF da etapa aberta pelo navegador (incluindo painéis expandidos) e persistência local no navegador. Alterações invalidam resultados dependentes; versões antigas das regras exigem nova geração. |
| Estrutura técnica | Módulos separados de domínio, interface, importação, exportação e estado; build dos arquivos públicos e autenticação no servidor da Vercel. |

## Limitações atuais

- **Persistência:** no modo padrão, os dados continuam locais. O modo individual habilita rascunhos por escritório/empresa no servidor, com histórico interno, salvamento manual e reabertura em outro navegador; requer configurar n8n e banco. Não há sincronização automática, histórico navegável na interface ou backup remoto gerenciado pela aplicação. Trocar de domínio não transfere o cache local.
- **Provisionamento:** o modo individual tem contas vinculadas ao provedor, permissões e auditoria, há gestão integrada para criar novas contas e editar acessos dos operadores, dependente da migração 004 e dos perfis no banco; Admin pode criar escritórios; não há recuperação de senha ou convites. O provisionamento continua administrativo, sem cadastro público.
- **Busca limitada:** a conversão pesquisa folgas em até duas rodadas, com 120 a 2.400 avaliações e cota por colaborador, priorizando erros, lacunas e déficit semanal; pesquisa parcial é sinalizada. A busca avulsa de cobertura é outra operação: até 600 avaliações e 20 ajustes, mantendo horas/dias semanais e sem aceitar abrir outra lacuna. Nenhuma das buscas garante ótimo global ou encontrar toda solução possível; 12×36 e ciclos diferenciados não são alterados automaticamente.
- **Horários restritos:** na proposta 5×2, a janela individual, o turno e a pausa são considerados antes da distribuição das horas, permitindo repartir o saldo pelos demais dias disponíveis. Não estende o expediente nem presume pausa menor ou autorização coletiva. A escala atual conserva os horários informados para diagnóstico. Sugestões posteriores podem deslocar entrada, pausa e saída dentro dos limites declarados, mediante prévia, sem aumentar horas para suprir déficits. Plantão 12×36 incompatível é retirado inteiro, com explicação.
- **Diagnóstico:** os tetos potenciais não garantem viabilidade; férias podem exigir reforço temporário. Em noites/ciclos especiais, usa disponibilidade simultânea sem presumir rateio de horas/dias semanais. O limite de processamento ou dados inválidos suspendem a conclusão; as lacunas continuam disponíveis.
- **Capacidade e funções:** há habilitações adicionais e uma função alocada por plantão, sem divisão de funções em faixas dentro do dia. Não há dimensionamento exato de contratações. A capacidade potencial por função não implica disponibilidade simultânea de uma mesma pessoa em várias funções; lacuna na proposta gerada, isoladamente, não prova falta de pessoal.
- **Ausências:** férias e afastamentos ajustam a meta operacional de alocação; não há cálculo de folha, benefícios ou efeitos previdenciários.
- **Regimes importados:** a conversão atende à origem 6×1 compatível. Importar um ciclo diferente não significa convertê-lo automaticamente para 5×2; âncoras e informações ambíguas precisam ser conferidas.
- **Conferência normativa:** a implementação usa o texto da EC 141 fornecido para o projeto. Cláusulas coletivas, exceções e efeitos específicos do trabalho noturno continuam sujeitos às verificações indicadas no relatório. A análise individual avançada de enquadramento permanece oculta e desativada por padrão.
- **Publicação:** na Vercel, o login depende do middleware, das funções de API e das variáveis privadas. Há também adaptador Node.js para futura VPS, dependente de configuração HTTPS/proxy/supervisão; essa migração não foi executada. O build estático sozinho não fornece proteção. Fontes do Google são opcionais, com fallback; o Tailwind agora é compilado e servido localmente.
- **Próximas visualizações e documentos:** quadro diário dedicado ainda não implementado; PDFs completo/individuais entregues em 29/10/2026. A primeira entrega da escala fixa está disponível, com os limites acima.
- **Publicação de escalas:** ainda não há fluxo de rascunho → revisão → aprovação/publicação com registro de responsáveis.

## Planejamento de persistência — 26/10/2026

O [registro de implantação](implantacao-atual.md) distingue código disponível, resultados confirmados pelo operador na VPS e validações de produção ainda pendentes. Consultá-lo antes de continuar a ativação.

Definida a evolução para várias contabilidades, com isolamento por escritório e empresas, usuários provisionados por administração autorizada e sem autocadastro público. Os fluxos de login/cadastro do n8n foram analisados estaticamente; sua reutilização exige adaptar tokens, sessões, permissões e provisionamento. A API é portátil para a futura mudança da Vercel para a VPS. O proprietário informou o domínio público reescala.fintria.com.br; a hospedagem continua na Vercel e `APP_ORIGIN` precisa acompanhar essa origem após novo deploy. A primeira entrega já implementa a base de banco, RLS, RPCs de rascunhos, revisão/idempotência e histórico/auditoria, junto aos serviços portáteis de servidor/frontend. Foi validada localmente em PostgreSQL 17 e PostgREST 14.15, versão confirmada na VPS. O operador confirmou o login individual na Vercel e iniciou a validação de salvar rascunhos. A integração ponta a ponta continua sendo acompanhada pelo registro de implantação; não presumir homologação das funções novas. A infraestrutura foi configurada manualmente pelo operador; o registro de homologação abaixo distingue os resultados confirmados das etapas pendentes. Operação e limites: [database/README.md](../database/README.md). Detalhes: [plano de persistência](planos/persistencia-postgresql.md) e [análise n8n](planos/autenticacao-n8n.md).

O template de homologação usa o nó JWT nativo, com segredo em credencial e claims explícitos, sem exigir acesso às variáveis de ambiente nos nós Code. O caminho `auth/cjs-login` aproveita o proxy `/auth/*` existente.

O [guia de homologação n8n](../integrations/n8n/README.md) e o template de login independente estão disponíveis. `AUTH_MODE=shared` e `PERSISTENCE_ENABLED=false` preservam o modo local de compatibilidade. O login individual já foi confirmado pelo operador; novas implantações precisam configurar esse modo e a persistência conforme os guias.

## Próximos passos propostos

A primeira entrega da escala fixa solicitada em **27/10/2026** foi implementada em **28/10/2026**. Exportações PDF por público foram entregues em 29/10/2026. O quadro diário e as evoluções complementares abaixo são funcionalidades **ainda não implementadas**. Não têm prazo definido. O [plano detalhado](planos/evolucao-escalas.md) contém escopo, critérios de aceite e pontos a definir.

| Prioridade | Evolução | Resultado esperado |
| --- | --- | --- |
| 2 | Quadro diário detalhado | Exibir colaboradores, funções, entradas, intervalos, saídas, folgas e cobertura por horário de uma data ou dia do padrão fixo. |

| 4 | Comparação visual mais detalhada | Destacar mudanças de cada dia/colaborador entre origem e proposta, além das grades e tabelas existentes. |
| 5 | Evolução de versões e persistência | Histórico navegável/recuperação de versões, política de retenção e eventual sincronização automática. Banco, contas, empresas e salvamento central já estão implementados. |
| 6 | Revisão e publicação da escala | Registrar revisão, aprovação e publicação, com identificação dos responsáveis. |

O modo fixo tem apresentação semanal e referência jurídica próprias, sem aplicar os feriados do calendário. A visão diária ainda não tem uma tela dedicada. CSV e impressão/PDF pelo navegador continuam disponíveis; documentos PDF próprios por público foram entregues em 29/10/2026. Ciclos 12×36 exigem tratamento explícito e não são convertidos automaticamente por este plano.

## Última validação registrada

Última execução funcional em **28/10/2026**, na revisão da precisão de geração/conversão: **493 testes unitários**, build e suíte completa de navegador aprovados localmente. A integração PostgreSQL 17/PostgREST 14.15 com navegador passou na entrega do modo fixo; não foi repetida nas alterações posteriores de edição e cálculo, sem mudança de API ou schema. A revisão acrescentou nove testes de precisão com matriz de 24 combinações, além da suíte existente. A cobertura inclui os 16 testes do modelo fixo (oito cenários setoriais e rejeição dos três ciclos) e oito testes adicionais da edição de horários, além do navegador dedicado nos dois modos. A integração confirma também o round-trip do JSON fixo por RPC autenticada; não exige migração adicional. A consolidação documental não representa nova execução das suítes.

- Precisão 5×2: sábado reduzido sem cobertura, dias por perfil, validade parcial do ACT/CCT, janela permitida antes da distribuição, capacidade da pausa, turno B incompatível, contratos de 20h/30h/40h preservados e transição automática com abono do Natal. Simulação adicional de 100 colaboradores sem demanda operacional: 1.200 avaliações, pesquisa parcial sinalizada, nenhum erro objetivo ou déficit; cobertura não avaliada. [Evidências e limites](auditorias/precisao-5x2-2026-10-28.md).

- Edição de horários: formulário com quatro relógios e intervalo opcional, validação sem mutação, meio período, noite/meia-noite, restrições, cópias por data e recorrência semanal, desfazer, cores do resumo semanal, feriado/abono sem alterar colegas, CSV com pausas, preservação da origem, cancelamento, recarga e modal em 320px.
- Modo fixo: independência de mês/feriados, padrão repetido, fases 44/42/40h, ACT válido somente na referência, limites diários, descanso domingo–segunda, domingos com revezamento, eventos datados fora do padrão, restrições semanais, turnos, comparação/cobertura semanal, intervalos recorrentes, diagnóstico, CSV e persistência. Navegador: etapas/tutorial sem Feriados, volta ao dinâmico sem apagar campos mensais, loading/Worker, quadro/resumo, rolagem móvel, impressão e reabertura.
- Geração atual/proposta: overlay antes do cálculo, bloqueio de duplicação, Worker, fallback local, falha de rede, descarte de resultados quando os dados mudam e liberação da interface.
- Busca de cobertura: resumo em modal antes da mensagem/prévia, sucesso, ausência de sugestões, erro, preservação dos dados e aplicação separada.
- Onze modelos DEMO em quatro segmentos: geração atual, propostas compatíveis, diagnóstico, 12×36/administrativo, readequação e contratação; instaladores com idempotência, auditoria e isolamento validados em banco local.
- Modal de empresa/preenchimentos conferido em 1920/1440/1024px com 85% da largura; 390/320px com margens reduzidas. Logos também verificadas com CSS antigo.

O histórico de validações dos demais recursos implementados é mantido abaixo:

- Janela Usuários validada em banco e navegador reais locais: pesquisa/filtros, edição, toggles com cancelamento, conta compartilhada, perfis, Consulta legada, escopos, e-mail duplicado com rollback, concorrência, revogação global, auditoria e layout móvel.
- **493 testes unitários aprovados**, sem falhas, com `npm test`.
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

Estes são registros de validação local, não uma execução contínua nem confirmação do estado do deploy na Vercel ou das instalações na VPS. Os comandos para novas execuções e para a suíte específica de autenticação estão no [README](../README.md#testes). Os testes de interface simulam serviços externos e não validam integralmente a aparência ou a disponibilidade das CDNs.

## Documentos de referência e manutenção

- [README](../README.md): referência de uso e configuração atual.
- [Auditoria EC 141 de 21/10/2026](auditorias/ec141-2026-10-21/relatorio.md) e [correções correspondentes](auditorias/ec141-2026-10-21/correcoes.md): achados e correções dos commits auditados; consultar em conjunto, como histórico.
- [Onda de cenários setoriais de 21/10/2026](cenarios/onda-setorial-2026-10-21.md): validação histórica de operações de padaria, comércio, farmácia e outros perfis; a contagem de testes desse relatório se refere àquela data.
- [Fontes e critérios da base de nomes](../assets/js/data/FONTES-NOMES.md): proveniência e reprodução dos dados locais.

Ao entregar uma funcionalidade, atualizar esta página e o trecho correspondente do README: mover somente o escopo efetivamente entregue para Implementado, registrar limitações, revisar os próximos passos e atualizar data, versão ou commit de referência e evidências de validação. Manter relatórios históricos identificados pela data, sem sobrescrever seus resultados com números atuais. Nunca registrar senhas ou valores de segredos na documentação.
