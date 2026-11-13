# Calendário sazonal — 13/11/2026

O login e o menu lateral escolhem automaticamente uma decoração conforme o calendário brasileiro. **Não são feriados operacionais:** este calendário visual não altera cadastros, escalas, horários, diagnóstico nem os feriados preenchidos na empresa.

A data usa **America/Sao_Paulo**, independentemente do fuso do computador. Com a página aberta, é conferida a cada minuto; ao voltar à aba, também é atualizada. Não é preciso publicar uma versão em cada festa. Fora das janelas abaixo, o ornamento fica oculto.

## Períodos iniciais

| Tema | Janela de exibição |
| --- | --- |
| Ano Novo | 26 de dezembro a 6 de janeiro do ano seguinte |
| Carnaval | Dez dias antes da terça de Carnaval até a Quarta-feira de Cinzas |
| Dia Internacional da Mulher | 6 a 8 de março |
| Páscoa | Quatorze dias antes até o domingo de Páscoa |
| Tiradentes | 21 de abril |
| Dia do Profissional da Contabilidade | 24 e 25 de abril |
| Dia do Trabalho | 28 de abril a 1º de maio |
| Dia das Mães | Cinco dias antes até o segundo domingo de maio |
| Festas juninas e julinas | 1º de junho a 7 de julho |
| Dia dos Namorados | 8 a 12 de junho |
| Dia do Amigo | 17 a 20 de julho |
| Dia dos Pais | Cinco dias antes até o segundo domingo de agosto |
| Independência do Brasil | 1º a 7 de setembro |
| Dia do Contador | 19 a 22 de setembro |
| Primavera | 23 a 27 de setembro |
| Dia das Crianças | 8 a 12 de outubro |
| Halloween | 25 a 31 de outubro |
| Proclamação da República | 15 de novembro |
| Consciência Negra | 20 de novembro |
| Natal | 1º de novembro a 25 de dezembro |

Páscoa é calculada pelo calendário gregoriano; a terça de Carnaval fica 47 dias antes. Mães/Pais seguem o segundo domingo dos respectivos meses. As janelas de primavera e demais homenagens são escolhas visuais do produto.

A prioridade é explícita no catálogo: Ano Novo, Carnaval e Dia da Mulher têm preferência sobre temporadas mais amplas; datas específicas substituem temporariamente Natal e festas juninas. O domingo de Páscoa prevalece se coincidir com outra homenagem. Assim, em novembro, República/Consciência Negra substituem o Natal nos próprios dias, e depois a guirlanda retorna. Dia dos Namorados interrompe o arraiá de 8 a 12 de junho.

## Interação e aparência

- Natal mantém a guirlanda com gorro vermelho/branco, sinos e **Feliz Natal!**.
- Ano Novo mostra **Feliz Ano Novo!** e fogos locais no hover/toque.
- Carnaval usa máscara e confetes; os outros temas recebem ilustrações próprias e um balanço leve.
- Efeitos têm duração limitada e não se repetem continuamente. Movimento reduzido desativa as animações; o tema e a mensagem permanecem.
- No toque/clique, a saudação fica destacada por 2,5 segundos. Tocar no ornamento do menu não aciona o link de início.
- Login usa 48px; menu, 28px; menu recolhido do desktop, 22px. Temas claro/escuro, telas de 320 a 1440px e impressão contemplados. Decorações não saem na impressão/PDF.

## Prévia antes da data — somente Admin

No menu lateral, o **Admin** encontra **Prévia das festividades**, acima do controle de tema. Gerentes e Operadores não recebem essa opção.

1. Escolha uma das 20 festividades no campo **Festividade**.
2. Veja o período e as amostras do login e do menu lateral.
3. Passe o mouse/toque no enfeite ou clique em **Reproduzir efeito** para rever a animação.
4. Use **Aparência da prévia** para conferir as amostras no modo claro/escuro.
5. Feche com **Fechar**, com o X ou com Escape.

A seleção é temporária e isolada dentro do modal: não muda o calendário real, a preferência de tema, a data do computador, os preenchimentos ou a aparência para outros usuários. Os efeitos respeitam movimento reduzido do dispositivo. O foco retorna ao botão de abertura ao fechar. Não há gravação de aprovação/reprovação; a janela serve à revisão visual dos efeitos.

Implementação em `assets/js/ui/seasonal-preview.js`, carregada ao abrir pelo menu do Admin. Não cria rota pública nem operação de banco. Navegador verifica os três perfis, 20 seleções, replay/fogos/confetes, amostras nos dois temas, telas de 320/390px, Escape/foco, menu sem rolagem indevida e preservação dos dados reais.

## Manutenção

- `assets/js/config/calendario-sazonal.js`: datas, prioridades, mensagens e seleção por fuso. Acrescentar novas festividades aqui.
- `assets/js/seasonal.js`: SVGs locais, efeitos e atualização dos dois pontos da interface. Novos ícones são definidos no catálogo local, sem APIs externas.
- `assets/css/theme.css`: dimensões, saudação, efeitos de fogos/confete/balanço e movimento reduzido.
- `server/auth.js`: liberação exata dos dois módulos visuais no login. Demais arquivos e dados continuam sob o guard existente.

Publicação normal pela `main`; sem migração SQL, RPC, variável de ambiente, n8n ou dependência nova. Regras de cálculo de escala preservadas.

## Verificação

**589 testes unitários**, build e testes de navegador de calendário, autenticação, paleta e identidade visual aprovados.

Testes de calendário incluem a meia-noite de 25/26 de dezembro em São Paulo, troca de ano, intervalos sem tema, sobreposições e datas móveis de 1900 a 2100. Navegador cobre os 20 temas, troca com página aberta em um computador configurado para Tóquio, fogos/confete, movimento reduzido, toque sem navegação, preservação do preenchimento, menu expandido/recolhido e celular. Também verificadas regressões de login, paleta/contraste e identidade visual.
