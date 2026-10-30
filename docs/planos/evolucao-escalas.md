# Próximas funcionalidades do Reescala

Registrado em **27/10/2026**, conforme solicitação do proprietário. **Atualizado em 29/10/2026:** primeira entrega da escala fixa implementada; PDFs para empregador e colaboradores implementados em 29/10/2026; quadro diário continua planejado, sem prazo definido.

## Ponto de partida

O modo dinâmico usa mês/ano, datas, semanas civis e feriados nacionais/locais. Desde 28/10/2026, também há modo fixo com padrão semanal recorrente. Há folgas fixas e rotativas dentro desse calendário, prévia da escala atual, proposta 6×1→5×2, cobertura por função/horário, diagnóstico e ajustes. A exportação atual oferece documentos PDF próprios em paisagem para empregador e colaboradores (ZIP), além da impressão da etapa aberta. CSV ficou como serializador interno. Existem persistência por escritório/empresa, usuários e permissões, com ativação dependente da infraestrutura configurada.

As três entregas abaixo ampliam esse produto. Folgas fixas no calendário atual não equivalem ao novo modo de escala fixa; a grade mensal já mostrar dias não equivale ao novo quadro diário. Os novos PDFs próprios são independentes do CSV e da impressão da interface.

## 1. Escala fixa com folgas fixas — primeira entrega implementada

Disponível desde **28/10/2026**. Seleção inicial **mensal dinâmica / mensal fixa**, data de referência jurídica, etapa Feriados omitida no fixo, tutorial e navegação condicionais, folgas/turnos fixos, restrições semanais, cobertura/diagnóstico/comparação por semana, intervalos sugeridos recorrentes, grade e resumo semanal, CSV sem datas por dia e impressão. Estado antigo permanece dinâmico; novos campos são persistidos no JSON existente, sem migração SQL.

Limites entregues: eventos por data e admissão não são aplicados ao padrão, mantendo o cadastro; a edição nos cards já permite mudar status e horários em todo o dia da semana correspondente, com revisão e desfazer. A busca de ajustes também mantém a recorrência no modo fixo (revisão de 30/10/2026); no dinâmico a edição dos relógios vale somente para a data escolhida. Ciclos alternados (12×36 inclusive) e compensações dependentes de período datado são rejeitados no fixo com orientação para usar o dinâmico. Há conferência de descanso na repetição, inclusive virada de semana, e incompatibilidade para trabalho fixo em todos os domingos no comércio/por colaboradoras. A data de referência serve à vigência, não transforma a grade em um calendário; exige revisão quando mudar a fase legal ou a vigência coletiva.

Os pontos abaixo registram o escopo que orientou essa entrega.

**Objetivo:** oferecer, além da escala mensal, um quadro recorrente de horários e folgas por dia da semana, adequado à nova legislação, sem depender de um mês ou de datas específicas.

Escopo solicitado:

- Selecionar entre **mensal** e **fixa**. O fluxo mensal continua considerando o calendário e seus feriados.
- No modo fixo, apresentar um padrão semanal recorrente: segunda a domingo, com jornadas, intervalos, funções e folgas fixas por colaborador.
- Não calcular o padrão a partir de feriados, número de dias do mês, semanas parciais ou exceções de datas específicas. Informações mensais já salvas não devem ser apagadas ao alternar modos.
- Usar uma referência explícita de jornada/fase legal para adequar a distribuição às novas regras, conferindo horas diárias/semanais, intervalos, repousos e condições coletivas aplicáveis. Não presumir autorização coletiva para fechar uma carga incompatível com os limites.
- Respeitar as condições individuais recorrentes: dias indisponíveis, folgas obrigatórias semanais, funções habilitadas e horários permitidos. Eventos de datas específicas ficam separados do padrão.
- Conferir a cobertura por horário/função no padrão semanal e explicar incompatibilidades e insuficiência da equipe, como já acontece no mensal.

O quadro fixo descreve um padrão, sem aplicar automaticamente a ele férias, afastamentos, admissões ou outros eventos datados. A definição de como aplicar um padrão a um mês real fica fora desta entrega inicial. A ausência de feriados no modelo não deve ser apresentada como autorização para trabalhar em qualquer feriado quando o padrão for utilizado em datas reais.

Critérios de aceite:

1. O mesmo padrão não muda ao trocar o mês/ano ou os feriados do preenchimento mensal.
2. Folgas e horários repetem-se nos dias da semana escolhidos, incluindo indicação de saída no dia seguinte em jornadas noturnas.
3. O quadro informa a referência legal usada e o total semanal por colaborador; incompatibilidades continuam visíveis.
4. Cobertura semanal considera os intervalos e não conta uma mesma pessoa em duas funções simultaneamente.
5. Mensal e fixo ficam identificados ao salvar/reabrir, sem interpretar um preenchimento mensal antigo como modelo fixo. A mudança usa campos com valores padrão no estado e nova versão de regras; o banco continua armazenando o JSON, sem alteração de schema.

Nesta primeira entrega, ciclos diferenciados, incluindo 12×36, permanecem no modo dinâmico: não transformar um ciclo alternado em uma semana repetida, pois isso alteraria seus descansos. Essa decisão é uma extensão a definir; a limitação atual da conversão mista não desaparece com este plano.

## 2. Visualização em quadro diário

**Objetivo:** detalhar a operação de um dia, complementando a visão mensal ou o padrão fixo.

Escopo solicitado:

- Selecionar uma **data**, na escala mensal, ou um **dia da semana**, no modelo fixo.
- Exibir colaboradores, funções, entradas, intervalos, saídas, folgas e ausências aplicáveis, com detalhamento dos horários ao longo do dia.
- Evidenciar a cobertura exigida, pessoas presentes e lacunas por função/horário. Funcionários em intervalo não contam como cobertura efetiva.
- Representar corretamente entradas/saídas que atravessam meia-noite e a continuidade de plantões iniciados no dia anterior.
- Usar o mesmo resultado da geração e dos ajustes: a visão diária não deve calcular uma escala independente.
- Manter leitura e navegação adequadas no desktop e no celular.

Critérios de aceite:

1. Os horários e estados diários coincidem com a grade e os resumos existentes.
2. Aplicar/desfazer uma edição ou ajuste atualiza a visão diária e as lacunas correspondentes.
3. Viradas de dia, pausas e mudanças de função já suportadas são exibidas sem duplicar presença.
4. O dia/data e o modo visualizado ficam claros na tela e nas futuras exportações.

O desenho final do quadro — tabela, faixas de horário ou combinação — será definido na implementação. A solicitação não inclui criar um novo fluxo de edição independente do resultado atual.

## 3. Exportação para empregador e colaboradores — implementada em 29/10/2026

**Entrega:** PDFs A4 em paisagem, gerados localmente com jsPDF/AutoTable, sem captura da interface ou serviço externo. Logo Reescala, empresa/CNPJ quando disponíveis, origem (atual/proposta), mês ou padrão fixo, horários, intervalos, função, folgas, totais semanais, pendências, identificação de rascunho e páginas. O empregador recebe um PDF com todas as pessoas e cobertura; os colaboradores recebem PDFs isolados em um único ZIP (fflate), com nomes que distinguem homônimos. Disponível nos dois modos, preservando edições aplicadas. Propostas desatualizadas são bloqueadas. Salvar/exportar não significa aprovar a escala.

**Objetivo:** distribuir a mesma escala em dois tipos de documento, adequados a quem vai recebê-los.

| Destino | Conteúdo esperado |
| --- | --- |
| Empregador | Arquivo completo da empresa/equipe, identificando modo e período ou padrão, colaboradores, funções, horários, intervalos, folgas, resumo e informações relevantes de cobertura e pendências. |
| Colaborador | Um arquivo separado para cada funcionário, com sua própria jornada, horários, intervalos e folgas, identificando empresa e período ou padrão. Não incluir cadastros ou escalas de outros colaboradores. |

Escopo solicitado:

- Escolher entre exportar o quadro completo e gerar arquivos individuais.
- Gerar os documentos a partir do resultado atual selecionado, incluindo ajustes aplicados. Identificar escala atual/proposta e modo mensal/fixo.
- Preservar indicação de rascunho, incompatibilidades e resultados desatualizados; não apresentar um arquivo como aprovado apenas por ter sido exportado.
- Respeitar o acesso do usuário à empresa e separar corretamente funcionários com nomes iguais.
- Definir diagramação legível para visualização e impressão, coerente com a identidade Reescala.

Critérios de aceite:

1. O documento completo corresponde à equipe e à versão de resultado escolhidas.
2. Cada arquivo individual contém somente o colaborador correto e as informações necessárias à leitura de sua escala.
3. Jornadas noturnas, intervalos, folgas, feriados do modo mensal e padrão sem datas do modo fixo são identificados corretamente.
4. Nomes dos arquivos distinguem empresa, período/padrão e colaborador, inclusive homônimos.
5. A exportação não usa silenciosamente um resultado antigo após alteração do preenchimento.

**Formato entregue:** PDF para o documento completo e ZIP contendo um PDF por colaborador. O CSV e a impressão do navegador permanecem disponíveis separadamente. Não há envio automático, assinatura, aprovação/publicação ou aplicação do padrão fixo a datas reais.

## Sequência e verificações

Prioridade indicada: **escala fixa → quadro diário → exportação completa e individual**. As visualizações e documentos devem consumir um resultado comum, para evitar divergências. Não é necessário esperar essas entregas para continuar usando ou corrigindo o modo mensal.

Na implementação, simular os cenários DEMO de escritório, comércio contínuo, fazenda com sábado compensado/almoço coletivo, entidade 24h e padaria, respeitando os regimes que cada novo modo efetivamente suportar. Conferir também dias fixos de folga, intervalos, cobertura insuficiente, mudanças de fase, plantões noturnos, homônimos, resultados desatualizados e isolamento por empresa. A entidade 12×36 continua sendo um caso que exige suporte explícito ao ciclo, não uma promessa de conversão automática.

Os testes da primeira entrega do modo fixo incluem escritório, comércio, fazenda e padaria; a entidade 12×36 confirma a rejeição explícita desse modo, preservando o dinâmico. Os critérios do quadro diário continuam futuros; a exportação PDF completa/individual já está implementada. A última validação dos recursos já implementados está em [Estado do projeto](../estado-do-projeto.md); os exemplos e instaladores estão em [Cenários DEMO](../cenarios-demo-segmentos.md).
