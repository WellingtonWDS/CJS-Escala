# Distribuição transitória de 42h — 12/11/2026

A implementação foi conferida com o **item I do dispositivo, página 28**, do PDF `downloadPeca.pdf` anexado pelo cliente: decisão de 12/11/2026, ADI 8041 MC/DF, que também decide a cautelar na ADI 8042. O item final declara eficácia imediata e submissão a referendo (p. 32). O PDF fornecido foi lido; a assinatura digital não foi validada neste ambiente.

Referências: [ADI 8041](https://portal.stf.jus.br/processos/detalhe.asp?incidente=7740896), [ADI 8042](https://portal.stf.jus.br/processos/detalhe.asp?incidente=7741658) e [decisão](https://portal.stf.jus.br/processos/downloadPeca.asp?id=15392248509&ext=.pdf). O portal e o download direto retornaram 403 no proxy de saída; a conferência foi possível após o envio do anexo. SHA-256 do arquivo recebido: `218b0b1a0628da2bb6a946c9b20b02c6abc78652ee80439d5b4e58c9a8522000`.

## Regra implementada

- 5×2, referência de 42h, **16/12/2026 a 15/12/2027**, na ausência de ACT/CCT celebrado até **15/12/2026**: até **504 minutos (8h24) por dia**. O excedente de 24 minutos integra a jornada ordinária nessa hipótese.
- O rateio completa 2.520 minutos em cinco dias quando contrato, disponibilidades, intervalos e repousos permitem. Não aumenta contratos menores nem ignora restrições explícitas; impossibilidades continuam indicadas.
- O seletor de conversão libera a fase de 42h nessa janela. No dinâmico, meses de fronteira não estendem a exceção para todas as datas: cada dia conserva seu limite. No fixo, vale a data de referência jurídica, independentemente das datas internas do quadro.
- A busca de ajustes utiliza o mesmo teto. Uma edição acima de 8h24 gera erro sem outra base; mais de cinco dias trabalhados invalida o uso da exceção na semana.
- Para ausência de acordo, use **Nenhuma compensação informada**. Um ACT/CCT selecionado não é descartado silenciosamente: sua identificação, vigência e teto continuam verificados. Banco de horas não equivale à declaração de ausência de acordo.
- A dispensa não se aplica automaticamente à referência atual 6×1/44h, a 12×36, à compensação de repousos, ao banco de horas ou a jornadas maiores. Intervalos, descanso entre jornadas, salário e duas folgas continuam sujeitos às respectivas regras.
- O resultado explica a aplicação provisória. Fora do período, a hipótese sem acordo retorna ao limite geral de 8h; a simulação explícita não prolonga a liminar.

## Reversibilidade e publicação

`TRANSICAO_42_SEM_ACT`, em `assets/js/domain/ec141.js`, concentra vigência, teto e ativação. O limite diário anterior e a antiga exigência do seletor permanecem em blocos comentados; o ramo coletivo continua ativo para os demais casos. Para desativar a exceção, alterar `ativa` para `false`, atualizar a versão de regras, revisar as orientações e repetir os testes.

Versão **ec141-2026-11-12-14**. O controle já existente de versões invalida resultados antigos, preservando cadastros. Gere novamente as escalas e salve o preenchimento para confirmar o novo resultado no servidor. Não há migração SQL nem variável nova.

## Outros pontos do dispositivo — fora da alteração de 42h desta entrega

A notícia e o PDF também tratam de hipóteses diferentes da distribuição de 42h sem acordo. Ficam registradas para evolução específica, sem afirmar que seus algoritmos já foram adaptados:

- **Item II, pp. 28–29:** 90 dias contados de 16/12/2026 para renegociar contrapartidas; cláusulas incompatíveis deixam de produzir efeitos em 16/12/2026. Não se autoriza retirada unilateral das contrapartidas. Orientação da página atualizada.
- **Item III, p. 29:** neutralidade salarial, inclusive pisos; a preservação não gera equiparação automática com contratos distintos. O sistema preserva cargas contratuais e não calcula equiparação salarial.
- **Item IV, p. 30:** afastamento das travas semanal/mensal da compensação de repousos por ACT/CCT, mantida a integralidade dos dois repousos; eventual portaria conjunta é subsidiária, pressupõe frustração comprovada da negociação e não existe automaticamente só pela decisão. As verificações antigas da compensação mensal foram preservadas; não usar esse módulo como homologação do regime judicialmente flexibilizado.
- **Itens V e VI, pp. 30–31:** 180 dias contados da publicação da **decisão** para atuação legislativa em regimes diferenciados e pequenas empresas. Não é dispensa automática dos limites.
- **Item VII, pp. 31–32:** contratos administrativos vigentes: 180 dias desde a publicação da **emenda**; licitações já em andamento: desde a assinatura do respectivo contrato. A análise avançada de contratos públicos ainda usa o prazo anterior da EC 141 e necessita atualização própria antes de uso nesses enquadramentos.
- **Item VIII, p. 32:** extensão do art. 8º às empresas estatais exploradoras de atividade econômica em regime concorrencial, cumpridos os requisitos de formação e remuneração. O cadastro avançado ainda não distingue esse tipo de estatal e conserva a exclusão geral de empregado público.

Esses pontos não modificam a regra geral 5×2 implementada nesta entrega. A entrega não representa implementação integral da liminar.

## Verificação

**581 testes unitários**, build e suíte completa de navegador aprovados. Depois da conferência do PDF e da orientação sobre o marco de 15/12/2026, repetidos os unitários e os testes de navegador de transição e layout móvel.

Testes de domínio e navegador cobrem: datas inicial/final e vésperas, referências fixa/dinâmica, seleção de 42h partindo de 6×1, meses de fronteira, preservação da origem/contratos menores, 8h24 com duas horas de intervalo, edição acima do teto, seis dias trabalhados, ACT com teto próprio/vencido, banco de horas e recuperação de saldo pela busca de ajustes. As suítes gerais continuam verificando os demais regimes.
