# Frequências de prenomes para sugestão de sexo

A base usa o arquivo bruto **`nomes_ibge.csv`** do espelho **ggustavowerlangg/ibge-nomes-2022**, revisão fixa `a1e2df8b26aaf626e0f35be1f66b72f83c8f696f` (04/06/2026): https://github.com/ggustavowerlangg/ibge-nomes-2022/tree/a1e2df8b26aaf626e0f35be1f66b72f83c8f696f.

O mantenedor identifica a origem como **IBGE — Censo 2022 / Nomes no Brasil**. A aplicação utiliza as frequências agregadas disponibilizadas nesse espelho; a identificação da origem segue sua documentação. Referência institucional: https://censo2022.ibge.gov.br/nomes/.

Apenas fatos estatísticos públicos de prenomes, sexo e frequência são incorporados. Nenhum código do espelho, texto gerado por modelos, nome completo de colaborador ou relatório enviado pelo usuário integra a base. O arquivo tratado do espelho, que já classifica por predominância de 75%, **não é utilizado**.

O arquivo bruto tem 134.315 linhas de dados, com 123.733 prenomes distintos. Conservamos **10.582 prenomes com frequências positivas explícitas em ambos os sexos**, substituindo integralmente a base anterior de 1.040 pares do Censo 2010. **2.655** atendem aos critérios atuais: predominância de **pelo menos 99%** e **pelo menos 1.000 registros** no total. Lucas, Tiago, Thamires e Hellen estão entre eles. Uma frequência ausente continua desconhecida, nunca vira zero ou predominância de 100%. Não combinamos contagens de censos distintos.

A predominância é uma proporção observada nas frequências da fonte, não uma probabilidade comprovada de acertar o sexo de uma pessoa. Grafias não cobertas, iniciais e combinações com evidências divergentes ficam sem preenchimento. Não usamos sufixos nem sobrenomes para decidir. Valores informados pelo usuário são preservados; as estimativas podem ser corrigidas e sua origem é identificada.

O SHA-256 do arquivo bruto é `dbd34d9dde656a8b0df95174e5a8deb0b9e6b035b0e42da313e844566f129cd1`, verificado antes de gerar a base. A revisão e as contagens estão em `nomes-ibge-fontes.json`.

Para reproduzir: `node scripts/gerar-base-nomes.js`. Para usar uma cópia local de `nomes_ibge.csv`: `node scripts/gerar-base-nomes.js --source-dir=/caminho/da/fonte`. O gerador valida cabeçalho, contagens, duplicações e integridade antes de escrever. O aplicativo consulta apenas o arquivo local gerado, sem enviar nomes a serviços externos.
