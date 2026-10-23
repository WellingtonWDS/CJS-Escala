# Estado do projeto — CJS Escala

Atualizado em **23/10/2026**. Referência funcional: versão de regras `ec141-2026-10-23-4` ([histórico do projeto](https://github.com/WellingtonWDS/CJS-Escala/commits/main/)). Esta página resume o andamento; o [README](../README.md) detalha operação, arquitetura, configuração e testes.

## Objetivo e estágio atual

Ajudar o escritório e suas empresas clientes a preencher a escala praticada atualmente, principalmente no modelo 6×1, e gerar uma proposta 5×2, respeitando as condições cadastradas e explicando a cobertura e as incompatibilidades encontradas.

O fluxo principal está implementado e continua em evolução. Já permite importar colaboradores, conferir jornadas, declarar restrições, gerar e ajustar a proposta e avaliar a suficiência do quadro nas faixas informadas. Isso não representa conclusão de todo o produto nem aprovação automática das condições jurídicas de uma escala.

## Funcionalidades implementadas

| Área | O que já está disponível |
| --- | --- |
| Acesso | Login por senha compartilhada, sessão fixa de 12 horas, cookie assinado, bloqueio no servidor e na interface ao expirar e botão Sair. |
| Navegação | Oito etapas com avançar/voltar, acesso direto pela barra horizontal e preservação dos dados. Tutorial guiado de nove passos e indicadores de preenchimento obrigatório pendente. |
| Colaboradores | Cadastro manual, modelo/importação CSV e importação Domínio, com lista única para revisar, editar e remover pessoas. Os painéis de entrada começam fechados. |
| Importação Domínio | Relatórios Quadro de Horário de Trabalho em XLS/XLSX, prévia e confirmação, metadados da empresa, jornadas individuais, admissão e ciclos. Dias semanais omitidos são considerados folga; dados ambíguos exigem revisão. |
| Sexo por prenome | Sugestão conservadora por base local de nomes, limiar de 99% e requisitos de volume/disponibilidade dos dados, indicação de preenchimento automático e preservação de escolhas manuais. |
| Habilitações por função | Função principal e funções adicionais selecionadas na ficha, com alocação de uma função por plantão e sem contagem simultânea. |
| Restrições individuais | Férias, afastamentos, indisponibilidade e folga por período; dias indisponíveis e folgas obrigatórias recorrentes; uma janela permitida por dia da semana. Aplicação na geração, conversão, cobertura, edição e exportação. |
| Jornadas e escalas | Modelos 6×1, 5×2, 12×36 e personalizado; horários por dia, sábado reduzido, turnos A/B, jornadas noturnas e ciclos individuais importados. |
| Folgas e feriados | Folgas fixas/rotativas, opção 5×2 com sábado e domingo fixos, feriados nacionais e locais, escolha de trabalho no feriado e políticas de distribuição. Abono do feriado dispensado quando havia trabalho previsto. |
| Regras e validações | Fases por data e simulações de 44h/42h/40h conforme o texto fornecido da EC 141; verificações de jornada, intervalos, repousos e condições declaradas de ACT/CCT. Contrato de referência preservado. |
| Condições específicas de CCT | Intervalo computado e crédito noturno fixo de 1h por plantão quando declarados e aplicáveis ao 12×36, separados da presença efetiva na cobertura. |
| Geração e revisão | Grade mensal, semanas civis completas, resumo semanal com horas, abonos e ausências, ocorrências por colaborador e ajustes manuais com recálculo. Bloqueios individuais não podem ser ultrapassados pela edição. |
| Cobertura operacional | Cadastro opcional de mínimos por função, horário e dia; identificação de faixas descobertas, considerando pausas e viradas de dia. As funções vêm do cadastro dos colaboradores. |
| Ajustes de cobertura | Sugestões de troca de folga, horário/turno e função habilitada; prévia antes/depois, aplicar e desfazer a última aplicação, validação de dados atuais e carregamento com progresso/cancelamento em segundo plano. |
| Diagnóstico de pessoal | Lacunas agrupadas por função, dias, horário e quantidade, com datas; diferencia capacidade insuficiente, disponibilidade, habilitações compartilhadas e redistribuição. Verifica simultaneidade, horas e dias-pessoa sem duplicar a equipe. Presente na escala, comparação e CSV. |
| Conversão e comparação | Origem 6×1 preservada, com contexto 44h da referência automática mantido na grade, resumo, CSV e ajustes; proposta 5×2 em período próprio, busca de distribuição de folgas e comparação de horas, dias e cobertura. Diagnóstico de suficiência, insuficiência demonstrável, necessidade de ajustes, incompatibilidade ou ausência de base para avaliação. |
| Exportação e armazenamento | CSV detalhado, impressão/PDF da etapa aberta pelo cabeçalho ou navegador (incluindo painéis expandidos) e persistência local no navegador. Alterações invalidam resultados dependentes; versões antigas das regras exigem nova geração. |
| Estrutura técnica | Módulos separados de domínio, interface, importação, exportação e estado; build dos arquivos públicos e autenticação no servidor da Vercel. |

## Limitações atuais

- **Armazenamento local:** não há banco de dados central, sincronização entre dispositivos, backup automático, carteira de empresas separadas ou histórico de versões com recuperação. Trocar de domínio ou navegador não transfere os dados locais.
- **Acesso compartilhado:** não há contas individuais, permissões por usuário, recuperação de senha ou trilha de auditoria de autoria das alterações.
- **Busca limitada:** além da distribuição inicial de folgas, há sugestões de troca de folga, horário/turno e função. O motor usa até 600 avaliações e 20 ajustes por execução, mantém as horas e dias semanais e não aceita abrir outra lacuna. Ainda não há otimização global ou garantia de encontrar toda solução possível; 12×36 e ciclos diferenciados não são alterados automaticamente.
- **Horários restritos:** na geração inicial, a janela individual recorta a jornada sem estender o expediente ou mover a pausa. As sugestões podem deslocar entrada, pausa e saída dentro dos limites declarados, mediante aplicação da prévia, mas não aumentam as horas para suprir déficits. Plantão 12×36 incompatível é retirado inteiro, com explicação.
- **Diagnóstico:** os tetos potenciais não garantem viabilidade; férias podem exigir reforço temporário. Em noites/ciclos especiais, usa disponibilidade simultânea sem presumir rateio de horas/dias semanais. O limite de processamento ou dados inválidos suspendem a conclusão; as lacunas continuam disponíveis.
- **Capacidade e funções:** há habilitações adicionais e uma função alocada por plantão, sem divisão de funções em faixas dentro do dia. Não há dimensionamento exato de contratações. A capacidade potencial por função não implica disponibilidade simultânea de uma mesma pessoa em várias funções; lacuna na proposta gerada, isoladamente, não prova falta de pessoal.
- **Ausências:** férias e afastamentos ajustam a meta operacional de alocação; não há cálculo de folha, benefícios ou efeitos previdenciários.
- **Regimes importados:** a conversão atende à origem 6×1 compatível. Importar um ciclo diferente não significa convertê-lo automaticamente para 5×2; âncoras e informações ambíguas precisam ser conferidas.
- **Conferência normativa:** a implementação usa o texto da EC 141 fornecido para o projeto. Cláusulas coletivas, exceções e efeitos específicos do trabalho noturno continuam sujeitos às verificações indicadas no relatório. A análise individual avançada de enquadramento permanece oculta e desativada por padrão.
- **Publicação:** o login depende do middleware, da função de autenticação e de `AUTH_SESSION_SECRET` na Vercel. O build estático sozinho não fornece essa proteção. Fontes e Tailwind ainda dependem de CDN.
- **Publicação de escalas:** ainda não há fluxo de rascunho → revisão → aprovação/publicação com registro de responsáveis.

## Próximos passos propostos

As implementações de restrições individuais, sugestões de ajustes de cobertura e diagnóstico de pessoal foram concluídas no escopo acima. Os itens abaixo são propostas de evolução, **ainda não implementadas**, sem prazo definido. A ordem pode ser revista conforme os testes com usuários.

| Prioridade | Evolução | Resultado esperado |
| --- | --- | --- |
| 1 | Comparação visual mais detalhada | Destacar as mudanças de cada dia e colaborador entre origem e proposta, além das tabelas e grades já disponíveis. |
| 2 | Empresas, contas e versões salvas | Adicionar banco de dados, separação de empresas e usuários, persistência central e recuperação de versões. |
| 3 | Revisão e publicação da escala | Registrar revisão, aprovação e publicação, com histórico de alterações e identificação dos responsáveis. |

## Última validação registrada

Na correção do contexto de validação da referência atual, em **23/10/2026**, foram registrados:

- **389 testes unitários aprovados**, sem falhas, com `npm test`.
- A suíte específica de autenticação foi aprovada na etapa anterior das sugestões de ajuste. Esta entrega não altera o login.
- Build e suíte completa de interface aprovados com `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser`.
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
