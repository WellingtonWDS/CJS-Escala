# Marca do escritório nos relatórios

O Gerente (ou o Admin) define a identidade visual do escritório em **Empresas → Marca do escritório**. Ela é usada nos relatórios PDF de escala (equipe completa e individuais) de todas as empresas do escritório.

## O que pode ser definido

- **Logomarca**: aparece em destaque no canto superior direito de cada página.
- **Nome exibido** (opcional): aparece no rodapé e substitui a logomarca quando nenhuma imagem foi enviada.
- **Cor principal**: faixa do topo, títulos e cabeçalho das tabelas.
- **Cor de destaque**: fundo das linhas de folga.

O rodapé de cada página indica, de forma discreta, que o relatório foi **elaborado no Reescala** (com a versão das regras e a data de emissão). Sem marca configurada, o relatório mantém a identidade padrão do Reescala.

## Orientações para a imagem

| Item | Orientação |
| --- | --- |
| Formato | PNG com fundo transparente (recomendado), JPG ou WebP. SVG e PDF não são aceitos. |
| Tamanho do arquivo | Até 2 MB. |
| Dimensões | Logomarca horizontal, proporção próxima de 3:1. Mínimo de 300 px de largura; ideal 1200 × 400 px. |
| Recorte | Sem margens vazias ao redor. A imagem é convertida no navegador para PNG de até 1200 × 400 px, preservando a proporção e a transparência. |
| Cores da logomarca | Prefira a versão para fundo claro: o cabeçalho do relatório é branco. |

## Legibilidade

As cores escolhidas são conferidas automaticamente: se a cor principal for clara demais para texto sobre branco, os títulos usam um tom mais escuro da mesma cor, e o texto do cabeçalho das tabelas alterna entre branco e escuro conforme o contraste. O texto corrido permanece em tom neutro.

## Permissões

Qualquer usuário do escritório gera relatórios com a marca; somente Gerente ou Admin alteram. A gravação é protegida contra edição simultânea (revisão).

## Ativação no banco da VPS

Aplicar a migração **012_office_branding.sql** após a 011:

```bash
curl -fsSL https://raw.githubusercontent.com/WellingtonWDS/CJS-Escala/main/database/migrations/012_office_branding.sql -o /tmp/012_office_branding.sql
docker cp /tmp/012_office_branding.sql postgres_apps:/tmp/012_office_branding.sql
docker exec postgres_apps psql -U postgres -d cjs_escala -v ON_ERROR_STOP=1 -f /tmp/012_office_branding.sql
```

Antes da migração, os relatórios continuam com a identidade padrão e a tela informa que a marca ainda não está disponível. Sem variável de ambiente nova; a nova função Vercel é `api/branding.js`.

## Validação

`database/tests/branding.sql` (permissões, revisão, só PNG, cores hexadecimais, remoção), `tests/marca-escritorio.test.cjs` (contraste com cores extremas, validação da API, PDF com logomarca, cores e rodapé) e o cenário de marca em `tests/browser-empresas.cjs`.
