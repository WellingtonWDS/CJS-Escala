# Estado do projeto — CJS Escala

Atualizado em **23/10/2026**. Base funcional: commit [`1cfc8d7`](https://github.com/WellingtonWDS/CJS-Escala/commit/1cfc8d7). Esta página resume o andamento; o [README](../README.md) detalha operação, arquitetura, configuração e testes.

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
| Restrições individuais | Férias, afastamentos, indisponibilidade e folga por período; dias indisponíveis e folgas obrigatórias recorrentes; uma janela permitida por dia da semana. Aplicação na geração, conversão, cobertura, edição e exportação. |
| Jornadas e escalas | Modelos 6×1, 5×2, 12×36 e personalizado; horários por dia, sábado reduzido, turnos A/B, jornadas noturnas e ciclos individuais importados. |
| Folgas e feriados | Folgas fixas/rotativas, opção 5×2 com sábado e domingo fixos, feriados nacionais e locais, escolha de trabalho no feriado e políticas de distribuição. Abono do feriado dispensado quando havia trabalho previsto. |
| Regras e validações | Fases por data e simulações de 44h/42h/40h conforme o texto fornecido da EC 141; verificações de jornada, intervalos, repousos e condições declaradas de ACT/CCT. Contrato de referência preservado. |
| Condições específicas de CCT | Intervalo computado e crédito noturno fixo de 1h por plantão quando declarados e aplicáveis ao 12×36, separados da presença efetiva na cobertura. |
| Geração e revisão | Grade mensal, semanas civis completas, resumo semanal com horas, abonos e ausências, ocorrências por colaborador e ajustes manuais com recálculo. Bloqueios individuais não podem ser ultrapassados pela edição. |
| Cobertura operacional | Cadastro opcional de mínimos por função, horário e dia; identificação de faixas descobertas, considerando pausas e viradas de dia. As funções vêm do cadastro dos colaboradores. |
| Conversão e comparação | Origem 6×1 preservada, proposta 5×2 em período próprio, busca de distribuição de folgas e comparação de horas, dias e cobertura. Diagnóstico de suficiência, insuficiência demonstrável, necessidade de ajustes, incompatibilidade ou ausência de base para avaliação. |
| Exportação e armazenamento | CSV detalhado, impressão e persistência local no navegador. Alterações invalidam resultados dependentes; versões antigas das regras exigem nova geração. |
| Estrutura técnica | Módulos separados de domínio, interface, importação, exportação e estado; build dos arquivos públicos e autenticação no servidor da Vercel. |

## Limitações atuais

- **Armazenamento local:** não há banco de dados central, sincronização entre dispositivos, backup automático, carteira de empresas separadas ou histórico de versões com recuperação. Trocar de domínio ou navegador não transfere os dados locais.
- **Acesso compartilhado:** não há contas individuais, permissões por usuário, recuperação de senha ou trilha de auditoria de autoria das alterações.
- **Busca limitada:** a conversão busca distribuir folgas, com limite de tentativas. Ainda não sugere automaticamente trocas completas de turno/horário nem garante encontrar toda solução viável.
- **Horários restritos:** a janela individual recorta a jornada disponível sem estender o expediente ou mover a pausa. Horas perdidas não são integralmente redistribuídas. Plantão 12×36 incompatível é retirado inteiro, com explicação.
- **Capacidade e funções:** cada pessoa possui uma função cadastrada. Não há matriz de habilitações para múltiplas funções nem dimensionamento exato de contratações. Lacuna na proposta gerada, isoladamente, não prova falta de pessoal.
- **Ausências:** férias e afastamentos ajustam a meta operacional de alocação; não há cálculo de folha, benefícios ou efeitos previdenciários.
- **Regimes importados:** a conversão atende à origem 6×1 compatível. Importar um ciclo diferente não significa convertê-lo automaticamente para 5×2; âncoras e informações ambíguas precisam ser conferidas.
- **Conferência normativa:** a implementação usa o texto da EC 141 fornecido para o projeto. Cláusulas coletivas, exceções e efeitos específicos do trabalho noturno continuam sujeitos às verificações indicadas no relatório. A análise individual avançada de enquadramento permanece oculta e desativada por padrão.
- **Publicação:** o login depende do middleware, da função de autenticação e de `AUTH_SESSION_SECRET` na Vercel. O build estático sozinho não fornece essa proteção. Fontes e Tailwind ainda dependem de CDN.
- **Publicação de escalas:** ainda não há fluxo de rascunho → revisão → aprovação/publicação com registro de responsáveis.

## Próximos passos propostos

A implementação das restrições individuais foi concluída no escopo acima. Os itens abaixo são propostas de evolução, **ainda não implementadas**, sem prazo definido. A ordem pode ser revista conforme os testes com usuários.

| Prioridade | Evolução | Resultado esperado |
| --- | --- | --- |
| 1 | Ajustes automáticos para cobertura | Sugerir trocas de folga e turno/horário entre pessoas aptas, respeitando restrições, jornadas e descansos; explicar as lacunas remanescentes. |
| 2 | Diagnóstico de pessoal mais preciso | Distinguir melhor a distribuição inadequada de uma capacidade insuficiente e apresentar alternativas por função, dia e horário. Os horários descobertos já são exibidos hoje. |
| 3 | Comparação visual mais detalhada | Destacar as mudanças de cada dia e colaborador entre origem e proposta, além das tabelas e grades já disponíveis. |
| 4 | Empresas, contas e versões salvas | Adicionar banco de dados, separação de empresas e usuários, persistência central e recuperação de versões. |
| 5 | Revisão e publicação da escala | Registrar revisão, aprovação e publicação, com histórico de alterações e identificação dos responsáveis. |

## Última validação registrada

Na implementação das restrições individuais, em **23/10/2026**, foram registrados:

- **342 testes unitários aprovados**, sem falhas, com `npm test`.
- Build e suíte completa de interface aprovados com `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser`.
- Cenários de férias parciais e integrais, afastamentos, feriados durante ausências, folgas fixas, janelas diurnas/noturnas, plantões 12×36/CCT, turnos A/B, virada de mês, admissão, importação Domínio, cobertura, conversão, CSV, persistência e bloqueio de edição incompatível.

Este é o registro daquela validação, não uma execução contínua nem uma confirmação do estado do deploy na Vercel. Os comandos para novas execuções e para a suíte específica de autenticação estão no [README](../README.md#testes). Os testes de interface simulam serviços externos e não validam integralmente a aparência ou a disponibilidade das CDNs.

## Documentos de referência e manutenção

- [README](../README.md): referência de uso e configuração atual.
- [Auditoria EC 141 de 21/10/2026](auditorias/ec141-2026-10-21/relatorio.md) e [correções correspondentes](auditorias/ec141-2026-10-21/correcoes.md): achados e correções dos commits auditados; consultar em conjunto, como histórico.
- [Onda de cenários setoriais de 21/10/2026](cenarios/onda-setorial-2026-10-21.md): validação histórica de operações de padaria, comércio, farmácia e outros perfis; a contagem de testes desse relatório se refere àquela data.
- [Fontes e critérios da base de nomes](../assets/js/data/FONTES-NOMES.md): proveniência e reprodução dos dados locais.

Ao entregar uma funcionalidade, atualizar esta página e o trecho correspondente do README: mover somente o escopo efetivamente entregue para Implementado, registrar limitações, revisar os próximos passos e atualizar data, commit de referência e evidências de validação. Manter relatórios históricos identificados pela data, sem sobrescrever seus resultados com números atuais. Nunca registrar senhas ou valores de segredos na documentação.
