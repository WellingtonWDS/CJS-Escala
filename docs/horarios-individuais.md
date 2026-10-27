# Horários individuais, compensação do sábado e intervalos

## Informar horários por colaborador

Na Configuração, abra a ficha em **Colaboradores cadastrados/importados**. Quem veio da Domínio já possui **Horário individual importado da Domínio**. Para cadastro manual/CSV, clique em **Definir horário individual por dia**. A geração passa a usar esse perfil enquanto **Usar este horário individual na geração e cobertura** estiver marcado.

Para um turno contínuo das 08h às 12h, são aceitos:

| Campo | Forma direta | Forma do primeiro período |
| --- | --- | --- |
| Entrada | 08:00 | 08:00 |
| Intervalo início | vazio | 12:00 |
| Intervalo fim | vazio | vazio |
| Saída | 12:00 | vazio |

Uma pausa parcialmente preenchida continua exigindo correção: Entrada 08:00, Intervalo início 12:00 e Saída 18:00 com Intervalo fim vazio não informa quando o almoço termina. Meia-noite `00:00` é um horário válido, não um campo ausente. O formato legado de turno único com os dois últimos campos zerados continua aceito.

## Carga contratual de referência

A opção agora se chama **Manter a carga contratual informada, sem recalculá-la ao editar os horários**:

- Marcada: conserva a quantidade de horas do contrato ao editar o perfil.
- Desmarcada: estima essa quantidade pela soma dos horários (ou média do ciclo, com o cômputo declarado aplicável).
- Os horários efetivos continuam sendo considerados, e a proposta continua sujeita aos limites de jornada. Confirmar o contrato não ajusta automaticamente o expediente, não transforma o intervalo em trabalho e não autoriza excesso.

A ficha compara a soma dos horários com a carga mantida e mostra a divergência. A carga contratual cadastrável vai de 1 a **44h semanais**, em passos de 0,5h. CSV/manual recusam carga superior a 44h. Na Domínio, os horários físicos do relatório são preservados: se sua estimativa superar 44h, a ficha mostra erro e a conversão é bloqueada até corrigir a referência contratual. A prévia permite diagnosticar a jornada real, sem encurtá-la para ocultar excessos. Carga contratual e horas efetivas são medidas distintas.

## Sábado compensado

No perfil semanal, selecione **Compensado** no sábado. O sábado deixa de ser trabalho fixo; a carga devida deve ser cumprida nos demais dias. Selecionar essa situação na edição conserva uma referência contratual válida já informada, para evitar que a retirada do trabalho fixo reduza o contrato silenciosamente. É possível escolher depois a estimativa automática pelo checkbox descrito acima.

Exemplo com 1h de almoço:

| Dias | Entrada | Saída | Trabalho |
| --- | --- | --- | --- |
| Segunda a quinta | 07:00 | 17:00 | 9h por dia, 36h no total |
| Sexta | 07:00 | 16:00 | 8h |
| Sábado | Compensado | — | 0h |
| Semana | — | — | **44h** |

A grade identifica **FC — Sábado compensado**, sem acrescentar crédito fictício. A distribuição deve ter base legal adequada; a marcação não substitui as verificações de ACT/CCT ou elimina excesso diário/semanal.

Os horários preenchidos na linha de sábado passam a indicar a **disponibilidade para reposição**. Se a semana não atingir o alvo, a geração pode usar apenas o saldo faltante dentro dessa janela. Exemplo: 40h de segunda a sexta, contrato confirmado de 44h e sábado disponível das 08h às 12h geram 4h no sábado. Com falta de apenas 1h, a reposição usa 1h, sem prolongar a saída.

A reposição respeita bloqueios, férias/afastamentos, admissão, intervalos, limite diário, descanso de 11h entre jornadas e sequência de trabalho. Feriados dispensados abonam o trabalho previsto, evitando reposição indevida; um sábado feriado não vira reposição automática. Sem disponibilidade informada, a ferramenta não inventa um horário. Se a capacidade não fechar a carga, o resumo e as validações mostram o déficit. A referência usada na comparação preserva a reposição parcial e a proposta respeita a janela de sábado declarada.

Na importação Domínio, sábado explicitamente Compensado conserva essa situação. Descansos de ciclos como 12×36 conservam sua interpretação de folga, inclusive quando o relatório usa o termo compensado; isso não transforma o repouso do ciclo em reposição semanal.

## Sugestões de intervalo para cobertura

Com cobertura ativa, a geração da **proposta 5×2** também procura escalonar os intervalos. Entrada, saída, horas trabalhadas, duração da pausa, dias e função permanecem preservados nessa busca. A escala atual mantém seus intervalos. A grade identifica **Intervalo sugerido para cobertura** e a comparação informa quantas pausas foram redistribuídas. Quando há sugestões, o CSV inclui início/fim do intervalo e sua identificação; também distingue sábado compensado e reposição.

A busca de **Ajustes de cobertura** também oferece alterações de intervalo, com prévia e aplicação/desfazer existentes. Dias editados manualmente e restrições são preservados. Plantões/ciclos diferenciados e créditos específicos de CCT continuam fora dessa alteração automática.

A busca de pausas trabalha em passos de 15 minutos, com pelo menos 1h de trabalho antes/depois e até 6h consecutivas em cada trecho, sem encurtar a pausa. Só aceita redução de lacunas sem abrir ou agravar outra. É uma busca limitada (até 1.200 alternativas na geração), não uma prova de que toda solução possível foi encontrada. Cobertura impossível continua indicada; a ferramenta não elimina o almoço para declarar suficiência.

## Testes e dados anteriores

Regras atualizadas para `ec141-2026-10-27-6`: resultados antigos precisam ser gerados novamente; cadastros e configurações permanecem. Não há migração nova no PostgreSQL.

Os testes incluem o exemplo 9h/9h/9h/9h/8h, reposição integral/parcial/sem capacidade, feriado, bloqueios, descanso após turno noturno, limites de pausa, formatos parciais, manutenção/estimativa do contrato, importação de sábado/ciclo, intervalo escalonado, falta de solução, CSV, preservação da origem e edição manual.
