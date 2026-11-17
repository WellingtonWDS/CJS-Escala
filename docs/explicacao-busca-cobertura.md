# Entenda a busca de ajustes de cobertura

Entrega de **17/11/2026**. Depois de **Buscar ajustes de cobertura**, o resultado oferece **Entenda a busca: tentativas e impedimentos**, nas escalas fixa e dinâmica. O cálculo continua em Worker, com cancelamento, prévia, aplicação confirmada e desfazer.

## Testar a redistribuição

Ao lado da busca inicial, **Testar redistribuição ampliada** permite avaliar combinações de até duas operações. A busca inicial exige melhoria segura a cada passo; a ampliada também considera uma etapa interna que abra uma lacuna e outra que a resolva. O resultado conjunto precisa melhorar a cobertura ou o saldo contratual sem criar/agravar lacunas e passar pelas mesmas validações legais e operacionais. As etapas intermediárias não são aplicadas nem apresentadas como escalas prontas.

Exemplo validado: dois atendentes de 20h semanais trabalham 08–12 e 12–16, e a demanda é 09–17. Mover apenas o segundo para 13–17 descobre 12–13; mover apenas o primeiro para 09–13 não fecha 16–17. A combinação 09–13 e 13–17 cobre a operação sem alterar a carga. A entrega verifica esse caso nos modelos fixo/dinâmico e em um mês completo com 22 lacunas diárias.

A nova ação funciona sobre o quadro atual, sem aplicar uma prévia anterior não confirmada. Mostra nova prévia, permite aplicar/desfazer e registra a modalidade no histórico dos ajustes aplicados. A escala de origem é preservada ao ajustar a proposta.

O texto **“Há margem para testar uma redistribuição”** não aparece mais como conclusão genérica no resultado da busca. A análise informa se a busca inicial ou ampliada ainda não fechou a cobertura. Capacidade agregada suficiente é uma condição favorável, não garantia de que os horários se encaixem.

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

A busca inicial mantém seu orçamento padrão de 600 avaliações e 20 ajustes. A ampliada reserva parte das avaliações para combinações e usa até **2.400 avaliações e 40 ajustes**, mantendo até 12 alternativas intermediárias, com diversidade por colaborador/dia. Explora até oito lacunas e 160 candidatos secundários por alternativa intermediária. Esses limites preservam o processamento e o cancelamento no navegador; não constituem prova de que todas as distribuições possíveis foram examinadas. Os estados intermediários também precisam respeitar as regras individuais de jornada e descanso. Folgas fixas e indisponibilidades não são liberadas automaticamente.

Exemplos são ilustrativos dos descartes, não sugestões para aplicar. Contagens incluem todas as avaliações realizadas; armazenamento dos exemplos é limitado a dois por motivo, dois colaboradores por exemplo e quatro alocações de função por dia. A triagem exibe até 16 padrões de lacuna e informa quando há outros.

O resultado sem aplicação fica disponível na aba enquanto a prévia estiver aberta. Quando ajustes são aplicados, a explicação integra o registro existente de `ajustesCobertura` e pode ser consultada novamente após salvar/reabrir o preenchimento; aplica-se a mesma persistência já usada pela escala. Não há histórico permanente de todas as buscas não aplicadas.

Textos de colaboradores, funções e validações são escapados ao renderizar. Visualização expansível, tabela com rolagem própria no celular, foco por teclado e cores nos dois temas. Sem SQL, RPC, variável de ambiente ou alteração da versão de regras.

## Validação

Validação da explicação inicial: **613 testes unitários**, build e regressões de navegador. A ampliação acrescenta casos de redistribuição em duas operações, mês completo, aplicação atômica/desfazer, limites de busca, funcionamento reduzido, restrições, folgas fixas, dias manuais e planos obsoletos/adulterados.

Validação da busca ampliada: **619 testes unitários**, build e navegador aprovados. Worker real nos dois modelos, cancelamento sem aplicar etapas internas, prévia, aplicação, recarga/desfazer, explicação atualizada e layout móvel. No caso mensal, 22 lacunas diárias de uma hora foram fechadas sem alterar a origem nem os contratos.

Cenário com sete colaboradores, motoristas/vendedores e sábado 08–14, nos dois modelos; folgas fixas, triagem sem alternativas, ausência de habilitação, teto contratual e contratos menores. Contagens conciliadas com avaliações/ações, exemplos limitados, serialização, HTML seguro, busca em Worker e dados preservados. Regressões de aplicação/desfazer, recarga, cobertura e edição manual; tema claro/escuro e celular.

Implementação: `assets/js/domain/explicacao-busca.js`, `assets/js/domain/ajustes-cobertura.js`, `assets/js/ui/explicacao-busca.js` e integração em `assets/js/ui/ajustes-cobertura.js`.
