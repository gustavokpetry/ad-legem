# Ad Legem

App de estudo de lei seca (Constituição e principais códigos) para celular.
Funciona offline e pode ser instalado na tela inicial. Publicado no GitHub Pages.

## Arquivos

- `index.html`: estrutura das telas
- `styles.css`: visual (tema claro e escuro)
- `app.js`: estante e busca, página do artigo, caderno/trilhas/lições/prova/certidão, configurações, botão voltar, backup
- `perguntas.js`: gera as perguntas das lições a partir do texto da lei (regras, sem IA)
- `data.json`: texto das leis, gerado pelo script abaixo
- `sw.js`: cache offline · `manifest.webmanifest` + ícones: instalação como app
- `fonts/`: EB Garamond e Forum (licença SIL OFL)
- `scripts/gerar_dados.py`: gera o `data.json`

## Atualizar o texto das leis

1. `python3 scripts/gerar_dados.py` (só precisa do Python 3, sem bibliotecas extras)
2. No `sw.js`, aumente `VERSION` (ex.: `ad-legem-v10` → `ad-legem-v11`)
3. Faça o commit de `data.json` e `sw.js`

Para incluir outra lei, acrescente uma linha em `CODIGOS` no script.

## Dados salvos no aparelho

Grifos (por dispositivo, com cor), trechos estudados, revisões e as configurações ficam no `localStorage`
(prefixo `leiseca:`). Em Configurações (ícone de três riscos) há "Salvar uma cópia", "Restaurar uma cópia" e "Apagar lições e revisões".

Fonte dos textos: https://github.com/ctresb/leis. Os textos têm caráter
informativo e não substituem a publicação oficial.

## Como as perguntas são geradas

`perguntas.js` procura no texto de cada artigo:
- prazos e idades ("16 (dezesseis) anos", "quarenta e cinco dias") e troca por outro valor plausível;
- pares de termos que as provas costumam trocar (absolutamente/relativamente, nulo/anulável,
  móveis/imóveis, dolo/culpa, decadência/prescrição…), listados em `PAIRS`;
- artigos muito conhecidos (lista `FAMOSOS`) para a pergunta "qual é o artigo?".

Para melhorar as perguntas, acrescente pares em `PAIRS` ou artigos em `FAMOSOS`.
Artigos sem nenhum desses elementos entram só na etapa de leitura da lição.

## Identidade visual

Base comum: verde e ouro, EB Garamond e Forum, filete duplo dourado e o selo.
Cada código tem uma cor de couro (`LEATHER` em `app.js`), usada na lombada, na página,
na capa do caderno e na trilha. Cada tela tem sua metáfora: estante (busca), página de
livro (artigo), caderno e trilha (estudo), folha de prova (questões), certidão (resultado)
e ficha catalográfica (configurações).

## Ao publicar uma versão nova do app

Aumente juntos, com o mesmo número: `VERSION` no `sw.js`, `data-build` no `<html>` do
`index.html` e `BUILD` no início do `app.js`. Se o celular juntar arquivos de versões
diferentes, o app percebe, limpa o cache de arquivos e recarrega sozinho (o progresso não é apagado).

## Grifos e paletas

- Grifo é por dispositivo (caput, inciso, parágrafo, alínea): chave `artigo|bloco` em `marks`,
  com a cor (`y`, `g`, `p`) e a data. Os nomes das cores ficam em `markNames` e podem ser trocados
  nas configurações. A aba Grifos lista, filtra, copia a citação e gera a prova com os trechos.
- Paletas: Clássico, Grafite, Marinho, Bordô e Sépia, definidas em `styles.css` (`data-palette`),
  cada uma com versão clara e escura. O selo é desenhado em linha com as cores da paleta.
