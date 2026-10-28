#!/usr/bin/env python3
"""
Gera o data.json do Ad Legem a partir do repositório ctresb/leis.

Uso (na raiz do projeto):
    python3 scripts/gerar_dados.py

Baixa a Constituição e os códigos listados em CODIGOS, separa os textos por
artigo e grava data.json. Só usa a biblioteca padrão do Python 3.8+.
Para incluir outra lei, acrescente uma linha em CODIGOS com o caminho do
arquivo dentro do repositório (veja a pasta federal/ no GitHub).
"""
import json, re, sys, datetime, urllib.request
from pathlib import Path

REPO = "https://raw.githubusercontent.com/ctresb/leis/main/"

# id, sigla, nome, caminho no repositório
CODIGOS = [
    ("cf",    "CF",    "Constituição Federal",                                 "constituicao.md"),
    ("lindb", "LINDB", "Lei de Introdução às Normas do Direito Brasileiro",    "federal/decretos-lei/1942/del-4657-1942-09-04.md"),
    ("cc",    "CC",    "Código Civil",                                         "federal/leis-ordinarias/2002/lei-10406-2002-01-10.md"),
    ("cp",    "CP",    "Código Penal",                                         "federal/decretos-lei/1940/del-2848-1940-12-07.md"),
    ("cpc",   "CPC",   "Código de Processo Civil",                             "federal/leis-ordinarias/2015/lei-13105-2015-03-16.md"),
    ("cpp",   "CPP",   "Código de Processo Penal",                             "federal/decretos-lei/1941/del-3689-1941-10-03.md"),
    ("cdc",   "CDC",   "Código de Defesa do Consumidor",                       "federal/leis-ordinarias/1990/lei-8078-1990-09-11.md"),
    ("clt",   "CLT",   "Consolidação das Leis do Trabalho",                    "federal/decretos-lei/1943/del-5452-1943-05-01.md"),
    ("eca",   "ECA",   "Estatuto da Criança e do Adolescente",                 "federal/leis-ordinarias/1990/lei-8069-1990-07-13.md"),
    ("ctn",   "CTN",   "Código Tributário Nacional",                           "federal/leis-ordinarias/1966/lei-5172-1966-10-25.md"),
]
FONTE_CF = "https://www.planalto.gov.br/ccivil_03/constituicao/constituicaocompilado.htm"
ORDEM = ["cf", "adct", "lindb", "cc", "cp", "cpc", "cpp", "cdc", "clt", "eca", "ctn"]

ART = re.compile(r'^(?:\*\*)?Art\.\s*([0-9l][0-9l\.]*)(º|°|o)?((?:-[A-Z])*)\.?\s*(?:\*\*)?\s*', re.I)
ASSINATURA = re.compile(r'^(Brasília|Rio de Janeiro),')

def baixar(caminho):
    print("  baixando", caminho, file=sys.stderr)
    with urllib.request.urlopen(REPO + caminho, timeout=120) as r:
        return r.read().decode("utf-8")

def revogado(t):
    cab = re.sub(r'^[^a-z(]*', '', t[:160].lower())
    return bool(re.match(r'^\(?\*?\(?(revogad|vetad)', cab)) or (len(t) < 90 and 'revogad' in cab)

def separar(cid, txt, meta):
    linhas = txt.split("\n"); i0 = 0
    if linhas and linhas[0] == "---":
        i0 = linhas.index("---", 1) + 1
    arts, cab, atual, viu_titulo, codigo = [], {}, None, False, cid

    def fechar():
        if atual is None: return
        t = re.sub(r'\n{3,}', '\n\n', "\n".join(atual["t"]).strip())
        if t.startswith("*."): t = "*" + t[2:].lstrip()
        atual["t"] = t; atual["r"] = 1 if revogado(t) else 0
        arts.append(atual)

    for ln in linhas[i0:]:
        if ln.startswith("#"):
            nivel = len(ln) - len(ln.lstrip("#")); titulo = ln.lstrip("#").strip()
            if cid == "cf" and nivel == 1 and titulo.upper().startswith("ATO DAS DISPOSI"):
                fechar(); atual = None; codigo = "adct"; cab = {}; viu_titulo = True
                meta["adct"] = dict(id="adct", sigla="ADCT", nome="Ato das Disposições Constitucionais Transitórias", fonte=meta["cf"]["fonte"])
                continue
            if nivel == 1: continue
            fechar(); atual = None; viu_titulo = True
            cab[nivel] = titulo
            for k in [k for k in cab if k > nivel]: del cab[k]
            continue
        if ASSINATURA.match(ln):
            fechar(); atual = None; continue
        m = ART.match(ln)
        # Na CLT, os dois primeiros artigos são do decreto que a aprova; ficam de fora.
        if m and not (cid == "clt" and not viu_titulo):
            fechar()
            num = m.group(1).replace("l", "1").rstrip(".")
            k = int(num.replace(".", "")) if num.replace(".", "").isdigit() else 0
            rotulo = num + ("º" if m.group(2) else "") + (m.group(3) or "")
            atual = dict(c=codigo, n=rotulo, k=k, h=" › ".join(cab[x] for x in sorted(cab)), t=[ln[m.end():]])
            continue
        if atual is not None:
            atual["t"].append(ln)
    fechar()
    return arts

def main():
    meta, arts = {}, []
    for cid, sigla, nome, caminho in CODIGOS:
        txt = baixar(caminho)
        m = re.search(r'^fonte:\s*"([^"]+)"', txt, re.M)
        meta[cid] = dict(id=cid, sigla=sigla, nome=nome, fonte=FONTE_CF if cid == "cf" else (m.group(1) if m else ""))
        arts += separar(cid, txt, meta)
    vistos = {}
    for a in arts:
        base = f'{a["c"]}:{a["n"]}'; vistos[base] = vistos.get(base, 0) + 1
        a["id"] = base if vistos[base] == 1 else f"{base}~{vistos[base]}"
    codigos = [meta[o] for o in ORDEM if o in meta]
    # data no horário de Brasília (UTC−3)
    saida = dict(versao=1, gerado_em=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-3))).date().isoformat(),
                 origem="https://github.com/ctresb/leis", codes=codigos, arts=arts)
    destino = Path(__file__).resolve().parent.parent / "data.json"
    destino.write_text(json.dumps(saida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for c in codigos:
        print(f'{c["sigla"]:6} {sum(1 for a in arts if a["c"] == c["id"]):5} artigos', file=sys.stderr)
    print(f"data.json gravado ({destino.stat().st_size/1e6:.1f} MB). Lembre de aumentar VERSION no sw.js.", file=sys.stderr)

if __name__ == "__main__":
    main()
