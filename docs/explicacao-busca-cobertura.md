# Entenda a busca de ajustes de cobertura

Entrega de **17/11/2026**. Depois de **Buscar ajustes de cobertura**, o resultado oferece **Entenda a busca: tentativas e impedimentos**, nas escalas fixa e dinâmica. O cálculo continua em Worker, com cancelamento, prévia, aplicação confirmada e desfazer.

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

A entrega acrescenta explicações às alternativas efetivamente avaliadas e à triagem final. Não amplia a busca nem relaxa suas regras. Exemplos são ilustrativos dos descartes, não sugestões para aplicar. Contagens incluem todas as avaliações realizadas; armazenamento dos exemplos é limitado a dois por motivo, dois colaboradores por exemplo e quatro alocações de função por dia. A triagem exibe até 16 padrões de lacuna e informa quando há outros.

O resultado sem aplicação fica disponível na aba enquanto a prévia estiver aberta. Quando ajustes são aplicados, a explicação integra o registro existente de `ajustesCobertura` e pode ser consultada novamente após salvar/reabrir o preenchimento; aplica-se a mesma persistência já usada pela escala. Não há histórico permanente de todas as buscas não aplicadas.

Textos de colaboradores, funções e validações são escapados ao renderizar. Visualização expansível, tabela com rolagem própria no celular, foco por teclado e cores nos dois temas. Sem SQL, RPC, variável de ambiente ou alteração da versão de regras.

## Validação

**613 testes unitários**, build e regressões de navegador aprovados nesta entrega.

Cenário com sete colaboradores, motoristas/vendedores e sábado 08–14, nos dois modelos; folgas fixas, triagem sem alternativas, ausência de habilitação, teto contratual e contratos menores. Contagens conciliadas com avaliações/ações, exemplos limitados, serialização, HTML seguro, busca em Worker e dados preservados. Regressões de aplicação/desfazer, recarga, cobertura e edição manual; tema claro/escuro e celular.

Implementação: `assets/js/domain/explicacao-busca.js`, `assets/js/domain/ajustes-cobertura.js`, `assets/js/ui/explicacao-busca.js` e integração em `assets/js/ui/ajustes-cobertura.js`.
