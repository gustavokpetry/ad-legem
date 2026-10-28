# Ad Legem

App de estudo de lei seca (Constituição e principais códigos) para celular.
Funciona offline e pode ser instalado na tela inicial. Publicado no GitHub Pages.

## Arquivos

- `index.html`: estrutura das telas
- `styles.css`: visual (tema claro e escuro)
- `app.js`: busca, painel do artigo, fichas, botão voltar, backup
- `data.json`: texto das leis, gerado pelo script abaixo
- `sw.js`: cache offline · `manifest.webmanifest` + ícones: instalação como app
- `fonts/`: EB Garamond e Forum (licença SIL OFL)
- `scripts/gerar_dados.py`: gera o `data.json`

## Atualizar o texto das leis

1. `python3 scripts/gerar_dados.py` (só precisa do Python 3, sem bibliotecas extras)
2. No `sw.js`, aumente `VERSION` (ex.: `ad-legem-v3` → `ad-legem-v4`)
3. Faça o commit de `data.json` e `sw.js`

Para incluir outra lei, acrescente uma linha em `CODIGOS` no script.

## Dados salvos no aparelho

Grifos, progresso das fichas, tema e tamanho do texto ficam no `localStorage`
(prefixo `leiseca:`). Na aba Estudar há "Salvar uma cópia" e "Restaurar uma cópia".

Fonte dos textos: https://github.com/ctresb/leis. Os textos têm caráter
informativo e não substituem a publicação oficial.
