"""Compara modelos de remocao de fundo nas fotos de testes/amostras/.

    .venv/Scripts/python.exe benchmark.py [--modelos u2net,birefnet-general-lite,birefnet-general]

Para cada foto, cada modelo tira o fundo, o resultado e posto sobre branco (que e
como o produto sai no cadastro) e o tempo e medido. Grava em testes/resultado/ e
monta testes/comparacao.html para olhar lado a lado.

So modelos de licenca que permite uso comercial: u2net (Apache-2.0) e BiRefNet (MIT).
Ficam de fora, de proposito, o `bria-rmbg` (CC BY-NC, so nao comercial, e e o padrao do
rembg) e o `isnet-general-use` (restricao comercial).
"""

import argparse
import html
import json
import os
import time
from pathlib import Path

AQUI = Path(__file__).resolve().parent

# Os pesos ficam dentro da pasta do servico (fora do git), e nao no perfil do usuario.
# Tem que ser definido ANTES de importar o rembg, que le a variavel na importacao.
os.environ.setdefault("U2NET_HOME", str(AQUI / "modelos"))

from PIL import Image  # noqa: E402
from rembg import new_session, remove  # noqa: E402

PADRAO = ["u2net", "birefnet-general-lite", "birefnet-general"]
LADO_MINIATURA = 512


def sobre_branco(rgba: Image.Image) -> Image.Image:
    fundo = Image.new("RGB", rgba.size, (255, 255, 255))
    fundo.paste(rgba, mask=rgba.getchannel("A"))
    return fundo


def miniatura(imagem: Image.Image) -> Image.Image:
    copia = imagem.copy()
    copia.thumbnail((LADO_MINIATURA, LADO_MINIATURA))
    return copia


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--modelos", default=",".join(PADRAO))
    modelos = [m.strip() for m in parser.parse_args().modelos.split(",") if m.strip()]

    amostras = AQUI / "testes" / "amostras"
    saida = AQUI / "testes" / "resultado"
    saida.mkdir(parents=True, exist_ok=True)

    manifesto = json.loads((amostras / "manifesto.json").read_text(encoding="utf-8"))
    tempos: dict[str, list[float]] = {m: [] for m in modelos}
    carga: dict[str, float] = {}
    linhas = []

    for modelo in modelos:
        inicio = time.perf_counter()
        # A primeira chamada baixa os pesos (se ainda nao estao em modelos/) e abre a
        # sessao do onnxruntime; o tempo de carga e separado do tempo por foto.
        sessoes = new_session(modelo)
        carga[modelo] = time.perf_counter() - inicio
        print(f"[{modelo}] carregado em {carga[modelo]:.1f}s", flush=True)

        for item in manifesto:
            origem = Image.open(amostras / item["arquivo"]).convert("RGB")
            inicio = time.perf_counter()
            recorte = remove(origem, session=sessoes)
            duracao = time.perf_counter() - inicio
            tempos[modelo].append(duracao)

            nome = f"{Path(item['arquivo']).stem}-{modelo}.jpg"
            sobre_branco(recorte).save(saida / nome, quality=90)
            print(f"  {item['arquivo']} {origem.size[0]}x{origem.size[1]}  {duracao:.1f}s", flush=True)

    for item in manifesto:
        origem = Image.open(amostras / item["arquivo"]).convert("RGB")
        miniatura(origem).save(saida / f"{Path(item['arquivo']).stem}-original.jpg", quality=90)
        linhas.append(item)

    montar_html(saida.parent / "comparacao.html", linhas, modelos, tempos, carga)

    print("\nTempo medio por foto (CPU):")
    for modelo in modelos:
        lista = tempos[modelo]
        print(f"  {modelo:24s} {sum(lista) / len(lista):5.1f}s  (mais lenta {max(lista):.1f}s, carga {carga[modelo]:.1f}s)")
    print(f"\nAbra: {saida.parent / 'comparacao.html'}")


def montar_html(destino: Path, linhas, modelos, tempos, carga) -> None:
    cabecalho = "".join(f"<th>{html.escape(m)}</th>" for m in modelos)
    corpo = []
    for indice, item in enumerate(linhas):
        base = Path(item["arquivo"]).stem
        celulas = [
            f'<td><img src="resultado/{base}-original.jpg" loading="lazy"><small>original</small></td>'
        ]
        for modelo in modelos:
            celulas.append(
                f'<td><img src="resultado/{base}-{modelo}.jpg" loading="lazy">'
                f"<small>{tempos[modelo][indice]:.1f}s</small></td>"
            )
        legenda = f"{html.escape(item['fonte'])} | {html.escape(item['produto'][:70])}"
        corpo.append(f'<tr><th class="l">{base}<br><small>{legenda}</small></th>{"".join(celulas)}</tr>')

    medias = "".join(
        f"<li><b>{html.escape(m)}</b>: {sum(tempos[m]) / len(tempos[m]):.1f}s por foto "
        f"(carga {carga[m]:.1f}s)</li>"
        for m in modelos
    )
    destino.write_text(
        f"""<!doctype html><html lang="pt-BR"><meta charset="utf-8">
<title>Remocao de fundo: comparacao</title>
<style>
body{{font:14px system-ui;margin:16px;background:#f4f5f7;color:#1c2330}}
table{{border-collapse:collapse;background:#fff}}
th,td{{border:1px solid #d5d9e0;padding:6px;text-align:center;vertical-align:top}}
th.l{{text-align:left;max-width:170px;font-weight:600}}
img{{width:250px;height:250px;object-fit:contain;display:block;background:#fff}}
small{{color:#5b6472;font-weight:400}}
</style>
<h1>Remocao de fundo: comparacao dos modelos</h1>
<ul>{medias}</ul>
<table><tr><th></th><th>original</th>{cabecalho}</tr>{"".join(corpo)}</table></html>""",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
