# Auditoria da adaptação à EC 141 — 21/10/2026

O sistema está **parcialmente adaptado** ao texto fornecido da EC 141. Ele compara cenários e sinaliza parte das incompatibilidades, mas ainda não determina a regra aplicável pela data, nem cobre todas as exceções. Não deve ser apresentado como uma validação completa de adequação à emenda.

A revisão considerou o commit `b02e1fa1c6f5793f4ab97b2471f8c5511e051c23`, o código de domínio, geração, formulários, persistência, comparativo, exportação e testes. Esta auditoria não altera as regras da aplicação.

**Base normativa:** texto integral fornecido pelo usuário, identificado como EC 141, de 16/10/2026, publicada no DOU da mesma data, edição extra. A tentativa de consultar o [endereço oficial indicado](https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc141.htm) foi bloqueada com erro 403 neste ambiente. Portanto, a correspondência com a publicação oficial não foi confirmada de forma independente nesta execução. As conclusões normativas abaixo são condicionadas ao texto fornecido.

Nesse texto, 42h e o segundo repouso começam em 16/12/2026; 40h começam em 16/12/2027. Em 21/10/2026, usar a referência geral de 44h e um repouso ainda é coerente com essa transição. O problema é manter essa referência como válida em períodos posteriores ou ignorar dispositivos já vigentes.

## Verificações executadas

- `npm test`: **94 testes passaram**, sem falhas ou testes ignorados.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser`: build e todos os fluxos existentes passaram, incluindo folgas, feriados, turnos, cobertura, persistência e exportação.
- Oito sondagens específicas, A–H, registradas em [evidencias.json](evidencias.json). Sete expõem comportamentos ou lacunas; uma confirma a preservação de contrato inferior a 40h.
- Reprodução: `node docs/auditorias/ec141-2026-10-21/reproduzir.mjs`. Esse script arquiva os comportamentos encontrados no commit auditado: suas asserções confirmam os achados, não significam aprovação de conformidade. Ele não integra a suíte de regressão e deve ser revisado depois das correções.

Os testes existentes verificam o comportamento implementado. Sua aprovação não demonstra que todas as exigências da emenda estejam modeladas.

## Correspondência entre o texto e o produto

| Dispositivo do texto fornecido | Situação encontrada |
| --- | --- |
| Art. 1º, XIII: 8h diárias e 40h semanais, com compensação coletiva | Referências cadastradas. Excesso diário sem instrumento é apenas alerta; ACT/CCT ou banco de horas rebaixam excesso semanal sem examinar fundamento, período ou compensação efetiva. |
| Art. 1º, XV e art. 10, I: segundo repouso após dois meses | Validado quando a fase correta é selecionada manualmente. A data não determina a exigência. |
| Art. 1º, § 2º: compensação excepcional dos repousos dentro do mês | Descrita na página. Não há apuração mensal dessa modalidade nem cadastro da cláusula que a autoriza. |
| Art. 1º, § 3º: regimes diferenciados sujeitos aos limites constitucionais | Não existe enquadramento específico. O 12×36 é dispensado da validação semanal e da contagem geral de repousos. |
| Art. 2º: contratos vigentes e irredutibilidade salarial, inclusive pisos | Informação correta em relação ao texto fornecido. Salário, piso e histórico contratual não são cadastrados; não há verificação operacional dessa proteção. |
| Art. 3º: cláusulas incompatíveis sem efeito após dois meses | Texto presente. Não há dados sobre vigência ou conteúdo dos instrumentos para verificar incompatibilidade. |
| Art. 4º: não reduzir proporcionalmente jornadas de até 40h | O contrato informado é preservado; a sonda E manteve 30h. A aplicação do segundo repouso depende da escala e da fase escolhidas. |
| Art. 5º: possíveis medidas por lei complementar | Apenas informativo. Nenhuma mitigação é aplicada automaticamente, o que evita presumir uma autorização inexistente no texto da emenda por si só. |
| Art. 6º: fases de 42h e 40h | Datas e valores presentes, mas a referência é única para o mês inteiro e depende do seletor. |
| Art. 7º: ampliação diária na transição por ACT/CCT | Alerta genérico; não há verificação da cláusula, da vigência ou das condições da transição. |
| Art. 8º: exceção de diploma superior/remuneração e ressalvas | Apenas informativo. Não há enquadramento, referência ao teto do RGPS, condição remuneratória, liberalidade patronal ou identificação de empregado público. |
| Art. 9º: contratos públicos, aditamento e prazo máximo | Apenas informativo. Não há cadastro do contrato, alocação do empregado, data de aditamento ou aplicação individual dos marcos. |
| Art. 10: vigências distintas | Datas descritas, sem motor de vigência por período. |

## Achados que impedem considerar a adaptação completa

### 1. Alta prioridade — fase legal não depende da data e não trata meses de transição

Fontes: [estado inicial](../../../assets/js/state/store.js#L27), [regimeAtual](../../../assets/js/domain/jornada.js#L50) e [aviso da própria página](../../../index.html#L220).

A referência inicial é sempre `atual44`. `regimeAtual()` consulta apenas o seletor, sem comparar ano, mês ou data do dia. O calendário inteiro recebe a mesma referência.

**Reprodução A:** 07–13/02/2028, padrão 6×1, contrato de 44h, segunda a sábado operacionais. Resultado: 44h, um repouso e **nenhuma ocorrência em `validarLegal`**. Segundo o texto fornecido, a referência geral nessa data já seria 40h e dois repousos. O aviso verde pode, assim, aparecer por uso de uma fase inadequada ao período.

**Reproduções F e G:** com `transicao42`, a semana de 07–13/12/2026 recebe a exigência de dois repousos antes de 16/12; com `atual44`, a semana de 21–27/12/2026 não recebe a nova exigência. A página reconhece essa limitação, mas ela permanece no cálculo.

**Ajuste necessário:** separar modo de comparação de cenários da validação aplicável; resolver vigência pelas datas da escala e tratar os marcos dentro do mês. A política para semanas que atravessam o dia 16 deve ser definida explicitamente, sem inventar proporcionalidade que o texto não estabeleça. A referência inicial deve acompanhar o período e o enquadramento, preservando jornadas contratuais menores.

### 2. Alta prioridade — ACT/CCT e banco de horas atenuam excesso semanal sem demonstrar compensação

Fonte: [validação semanal](../../../assets/js/domain/validar-escala.js#L341).

**Reprodução B:** fase de 40h, escala 5×2, contrato de 44h e `act_cct`. O gerador distribui 44h; `LIMITE_SEMANAL` é apenas `alerta`, e não há ocorrência com severidade `erro` nesse cenário. A opção `banco` recebe a mesma atenuação no código.

O seletor, sozinho, não demonstra que o instrumento permite aquela distribuição, que é compatível com a emenda nem que houve compensação no período pertinente. O texto fornecido não autoriza presumir qualquer excesso simplesmente porque existe um instrumento selecionado.

**Ajuste necessário:** cadastrar o alcance e a vigência da compensação e apurar sua efetivação. Enquanto não houver esse enquadramento, manter o excesso como incompatibilidade com a referência geral ou indicar explicitamente que a conformidade não pôde ser avaliada. Diferenciar a jornada contratual cadastrada da carga programada para a fase; não alterar silenciosamente contratos ou salários.

### 3. Alta prioridade — jornada diária acima de 8h sem ACT/CCT recebe somente alerta

Fonte: [validação diária](../../../assets/js/domain/validar-escala.js#L50).

**Reprodução C:** fase de 42h, 5×2, contrato de 42h e nenhuma compensação. São geradas 8h24 por dia. Surgem cinco alertas `JORNADA_DIARIA`, mas nenhum erro. O sistema não exige o instrumento coletivo previsto no texto fornecido para essa distribuição.

**Ajuste necessário:** distinguir distribuição ordinária de jornada extraordinária e de compensação autorizada; não tratar a simples divisão de 42h por cinco dias como adequação demonstrada. A geração e a classificação devem considerar as condições do art. 7º da emenda.

### 4. Alta prioridade — 12×36 é dispensado de verificações sem enquadramento na EC

Fontes: [dispensa do limite semanal](../../../assets/js/domain/validar-escala.js#L303) e tratamento especial em `validarRepousoSemanal`.

**Reprodução D:** fase de 40h, âncora 07/02/2028, quatro plantões de 12h de permanência com uma hora de intervalo. São 44h efetivas na semana. Não há `LIMITE_SEMANAL` nem avaliação geral do segundo repouso.

Esse resultado não prova, isoladamente, que todo regime 12×36 seja inválido: sua admissibilidade e eventual critério de compensação dependem do enquadramento específico. O achado é que o programa dispensa os controles sem modelar esse enquadramento. O texto fornecido inclui trabalhadores de regimes diferenciados na discussão dos repousos e não concede uma dispensa automática de todos os limites ao 12×36.

**Ajuste necessário:** modelar a base do regime especial e sua compatibilidade com a emenda ou marcar a adequação à EC como não avaliada, em vez de usar a exclusão como validação suficiente.

### 5. Alta prioridade — descanso na primeira jornada perde o contexto anterior

Fontes: [contexto gerado e chamada da validação](../../../assets/js/domain/gerar-escala.js#L285) e [revalidações da interface](../../../assets/js/ui/calendario.js#L138).

A geração fornece `diasContexto`, mas a validação legal recebe somente `r.dias`.

**Reprodução H:** calendário de fevereiro/2028, operação diária, folga às terças e alternância A/B. O plantão de 30/01 termina às 22h20; o primeiro plantão da grade, 31/01, começa às 8h. O descanso real é 9h40. A validação da grade não aponta o problema nessa primeira data; a mesma função, recebendo contexto e grade juntos, acusa `INTERJORNADA` abaixo de 11h.

É uma falha de descanso já existente, além da adaptação à EC. **Ajuste necessário:** usar contexto anterior na verificação de interjornada e de trabalho consecutivo, atribuindo à grade apenas os achados do período exibido. Preservar continuidade entre períodos e alterações manuais.

### 6. Prioridade média — compensação mensal excepcional dos repousos não é modelada

Fonte: [contagem semanal](../../../assets/js/domain/validar-escala.js#L230) e explicação do § 2º na seção 7.

Na fase futura, toda semana completa com menos de dois repousos recebe erro, mesmo com ACT/CCT selecionado. Não há avaliação da média mensal e do repouso mínimo dentro do período máximo de uma semana previstos na exceção fornecida.

A regra funciona como verificação da modalidade geral, mas não representa a exceção coletiva. Pode apontar incompatibilidade em um arranjo que precisaria de uma análise mensal específica.

**Ajuste necessário:** modalidade coletiva explícita, com cláusula, vigência e apuração mensal fundamentada. Não liberar o 6×1 inteiro apenas porque ACT/CCT foi selecionado, nem presumir um número fixo de oito repousos para qualquer mês.

### 7. Regra de negócio a validar — feriado substitui automaticamente uma folga

Fonte: [planejamento das folgas](../../../assets/js/domain/folgas-semana.js#L24).

Conforme solicitação anterior, no modo normal o feriado não trabalhado ocupa uma vaga de repouso; outra folga pode ser liberada para trabalho. O modelo de sábado e domingo mantém os dois dias fixos, mesmo havendo feriado.

O texto fornecido da EC 141 não estabelece que todo feriado deva substituir automaticamente um dos repousos semanais. Portanto, a configuração de negócio não deve ser apresentada como uma exigência ou autorização geral da emenda. Feriado, repouso semanal e folga compensatória precisam de tratamento compatível com o enquadramento aplicável. Esta auditoria não conclui que qualquer coincidência seja inválida; aponta a ausência de fundamento modelado para a substituição automática em todos os casos.

**Ajuste necessário:** explicitar a política adotada e sua base, diferenciar os tipos de ausência no domínio e no relatório e verificar a aplicação à atividade/instrumento. Preservar a distinção entre abono de horas e efetivo repouso.

### 8. Cobertura parcial declarada — salários, exceções e contratos públicos são somente informativos

Fontes: [cadastro de colaboradores](../../../assets/js/ui/colaboradores.js#L20), [condições da emenda](../../../index.html#L222) e [comparativo salarial](../../../assets/js/ui/transicao.js#L66).

Não há dados para conferir salários/pisos antes e depois, diploma/remuneração e ressalvas do art. 8º, cláusulas incompatíveis do art. 3º ou aditamentos do art. 9º. A página avisa que exceções não são aplicadas automaticamente; isso é correto, mas impede afirmar cobertura integral.

A proteção salarial pode permanecer fora do escopo do simulador, desde que o produto limite sua afirmação de adequação às regras efetivamente verificadas. Exceções não implementadas devem ter enquadramento explícito como não avaliado, sem aparentar aprovação ou reprovação definitiva.

### 9. Rastreabilidade — exportação não carrega a análise de adequação

Fontes: [CSV](../../../assets/js/export/csv.js#L17) e [download](../../../assets/js/export/download.js#L5).

O CSV contém nome, cargo e status diário; não inclui horários, horas, abonos, fase de vigência ou ocorrências. A exportação verifica apenas se há escala gerada e continua disponível quando existem erros. Não é, portanto, um comprovante da análise de adequação.

**Melhoria recomendada:** exportar a referência aplicada, período, jornadas, repousos e pendências, distinguindo rascunho de escala revisada. É uma melhoria de rastreabilidade do produto, não uma obrigação de formato afirmada a partir da EC.

## O que está funcional e coerente com a referência fornecida

- Os valores 44h/42h/40h e os marcos de 16/12/2026 e 16/12/2027 estão descritos de forma consistente entre opções e seção de transição.
- Há validação de dois repousos quando uma fase futura é escolhida, para a modalidade geral fora do 12×36.
- Uma jornada contratual de 30h permanece em 30h na fase de 40h: não há redução proporcional automática demonstrada na sonda E.
- A geração respeita janelas por dia, inclusive sábado reduzido, e identifica déficit quando a carga não cabe.
- Trabalho efetivo e abono de feriado são separados na apuração; abono não cobre presença na análise operacional.
- Jornada diária, intervalo, interjornada dentro da grade e sete dias consecutivos possuem verificações, com a limitação de contexto identificada acima.
- A opção de acordo individual foi removida, e seleções antigas são migradas para nenhuma compensação, com invalidação da escala anterior.
- Os textos abrangem proteção de salário/pisos e as principais condições e exceções; não afirmam implementar automaticamente essas exceções.

## Ordem recomendada para a adequação

1. Motor de vigência por data e modo de simulação separado, incluindo meses e semanas que cruzam os marcos.
2. Classificação dos limites diário/semanal e critérios de compensação efetivamente verificáveis.
3. Contexto de descanso e enquadramento explícito do 12×36.
4. Modalidade de compensação mensal dos repousos e política fundamentada para feriados.
5. Enquadramentos dos arts. 8º e 9º e rastreabilidade da revisão/exportação, conforme o escopo assumido pelo produto.
6. Testes de aceitação derivados dessas regras: 15/16 de dezembro nos dois anos, contrato abaixo de 40h, ACT/CCT válido/inválido, semanas adjacentes, regimes especiais e exceções.

A adaptação textual está avançada; a adequação automática de escalas à emenda ainda precisa dessas etapas. Nenhuma regra de produção foi alterada durante esta verificação.
