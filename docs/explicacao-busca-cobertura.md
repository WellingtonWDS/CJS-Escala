# Entenda a busca de ajustes de cobertura

Atualizado em **18/11/2026**. Depois de **Buscar ajustes de cobertura**, o resultado oferece **Entenda a busca: tentativas e impedimentos**, nas escalas fixa e dinâmica. O cálculo continua em Worker, com cancelamento, prévia, aplicação confirmada e desfazer.

## Testar a redistribuição

Há uma única ação: **Buscar ajustes de cobertura**. Ela começa por ajustes simples e também explora sequências encadeadas, sem um teto fixo de duas operações. Uma mudança interna pode abrir uma lacuna e ser seguida por outras que a resolvam. Só o resultado conjunto que melhore a cobertura ou o saldo contratual, sem criar/agravar lacunas e passando pelas mesmas validações legais e operacionais, pode ser sugerido. As etapas intermediárias não são aplicadas nem apresentadas como escalas prontas.

A busca tem janela de até **30 segundos**, com cancelamento disponível e progresso de tempo, avaliações e profundidade alcançada. Pode terminar antes se atender aos objetivos, esgotar as alternativas mantidas ou atingir o orçamento de avaliações. A preparação/finalização dos relatórios pode acrescentar um pequeno tempo ao processamento total; o prazo controla a exploração. Não é uma execução infinita nem uma prova de que todos os arranjos possíveis foram examinados.

Exemplo validado: dois atendentes de 20h semanais trabalham 08–12 e 12–16, e a demanda é 09–17. Mover apenas o segundo para 13–17 descobre 12–13; mover apenas o primeiro para 09–13 não fecha 16–17. A combinação 09–13 e 13–17 cobre a operação sem alterar a carga. A entrega verifica esse caso nos modelos fixo/dinâmico e em um mês completo com 22 lacunas diárias.

A ação funciona sobre o quadro atual, sem aplicar uma prévia anterior não confirmada. Mostra nova prévia, permite aplicar/desfazer e registra a modalidade no histórico dos ajustes aplicados. A escala de origem é preservada ao ajustar a proposta.

O texto **“Há margem para testar uma redistribuição”** não aparece mais como conclusão genérica no resultado da busca. A análise informa se a busca de redistribuição ainda não fechou a cobertura. Capacidade agregada suficiente é uma condição favorável, não garantia de que os horários se encaixem.

## O que aparece

- Motivo do encerramento: objetivos atendidos, nenhuma alternativa gerada, nenhuma melhoria segura ou limite de avaliações/ações atingido.
- Contagens por estratégia: rateio, intervalos, entrada/saída, folgas, funções e mudanças combinadas. Distingue alternativas avaliadas de filtros anteriores à avaliação completa.
- Motivos de descarte, com até dois exemplos reais por motivo: nome, data, horários/intervalos/funções antes e depois, regra legal concreta ou lacuna que surgiria em outro horário.
- Triagem das lacunas restantes: pessoas habilitadas e configurações que impedem avançar, incluindo folgas fixas de sábado/domingo, edições manuais, indisponibilidade e plantões preservados.
- Análise de capacidade nas condições cadastradas, reutilizando o diagnóstico de equipe e suas evidências. A falta de solução na busca não equivale a prova de necessidade de contratar.

Os grupos de lacuna mostram uma data de referência por padrão de função/dia/horário e o número de ocorrências. A triagem é diferente de uma tentativa completa: descreve as configurações preservadas, sem afirmar que o algoritmo simulou todas as combinações possíveis. Uma alternativa recebe o primeiro motivo decisivo encontrado; ela pode ter outros impedimentos.

## Exemplo: 42h e sábado reduzido

Se **Folgas da proposta** fixa sábado e domingo, a busca não troca silenciosamente essa escolha por folga em dia útil. O resultado explica como permitir um teste de rodízio: mudar essa opção e gerar novamente. Isso não assegura que o rodízio resolverá o restante.

Quando aplicável, a triagem também demonstra um limite superior para completar a referência contratual. Com cinco dias de trabalho, quatro deles limitados a 8h24 e sábado aberto somente por seis horas, a soma otimista é **39h36**, com diferença de **2h24** para a referência de 42h. O cálculo deixa explícito que ainda não descontou pausas; não sugere trabalhar seis horas sem o intervalo aplicável. Créditos específicos, ausências e semanas incompletas não recebem essa demonstração simplificada.

Esse conflito com a meta contratual é separado da quantidade de pessoas necessária para cobrir cada horário. Não autoriza reduzir contrato, descontar faltas, lançar abonos nem presumir que contratar seja a única solução. A demonstração simplificada é omitida em compensações coletivas de horas por período ou repousos mensais. As verificações legais e de funcionamento continuam sendo aplicadas às sugestões.

## Segurança, limites e conservação

A exploração usa uma fronteira iterativa de até 12 estados, evita revisitar estados operacionais e limita o registro de estados visitados a 4.096. Explora até oito lacunas e 160 candidatos seguintes por estado. Não impõe um número máximo fixo de operações por sequência; os limites são de recursos: tempo, memória e até **12.000 avaliações**. Não há um teto separado de 20/40 ajustes aceitos. Ramificações descartadas por limite de memória são informadas no diagnóstico.

Esses limites preservam o processamento e o cancelamento no navegador, mas podem deixar alternativas sem exame. Os estados intermediários também precisam respeitar as regras individuais de jornada e descanso. Folgas fixas e indisponibilidades não são liberadas automaticamente. Um resultado interrompido informa o motivo e conserva somente a prévia segura encontrada, sem aplicá-la sozinho.

Exemplos são ilustrativos dos descartes, não sugestões para aplicar. Contagens incluem todas as avaliações realizadas; armazenamento dos exemplos é limitado a dois por motivo, dois colaboradores por exemplo e quatro alocações de função por dia. A triagem exibe até 16 padrões de lacuna e informa quando há outros.

O resultado sem aplicação fica disponível na aba enquanto a prévia estiver aberta. Quando ajustes são aplicados, a explicação integra o registro existente de `ajustesCobertura` e pode ser consultada novamente após salvar/reabrir o preenchimento; aplica-se a mesma persistência já usada pela escala. Não há histórico permanente de todas as buscas não aplicadas.

Textos de colaboradores, funções e validações são escapados ao renderizar. Visualização expansível, tabela com rolagem própria no celular, foco por teclado e cores nos dois temas. Sem SQL, RPC, variável de ambiente ou alteração da versão de regras.

## Validação

**622 testes unitários**, build e testes de navegador aprovados em 18/11/2026.

A validação inclui cenários que exigem sequências de três e de cinco operações, virada noturna, prazo controlado por relógio determinístico, mês completo, aplicação atômica/desfazer, funcionamento reduzido, restrições, folgas fixas, dias manuais e planos obsoletos/adulterados. Navegador com botão único, cancelamento, prévia sem mutação, aplicação, recarga/desfazer e celular.

A seção **Escala atual / prévia avulsa** é verificada fechada no carregamento e após converter, com geração/exportações/quadro ocultos até o clique no título. A recarga a recolhe novamente. A proposta segue visível.

Cenário com sete colaboradores, motoristas/vendedores e sábado 08–14, nos dois modelos; folgas fixas, triagem sem alternativas, ausência de habilitação, teto contratual e contratos menores. Contagens conciliadas com avaliações/ações, exemplos limitados, serialização, HTML seguro, busca em Worker e dados preservados. Regressões de aplicação/desfazer, recarga, cobertura e edição manual; tema claro/escuro e celular.

Implementação: `assets/js/domain/explicacao-busca.js`, `assets/js/domain/ajustes-cobertura.js`, `assets/js/ui/explicacao-busca.js` e integração em `assets/js/ui/ajustes-cobertura.js`.
