import { readFile } from "node:fs/promises";

import { TIPOS_POR_PASTA, caminhoDe } from "@/lib/arquivos";

const CONTEUDO = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
};

/**
 * Serve os arquivos de dados/produtos/<SKU>/<pasta>/<nome>.
 *
 * Os tres segmentos sao validados ANTES de o disco ser tocado: o SKU pelo
 * padrao de nome seguro, a pasta pela lista conhecida, e o nome pelo formato
 * que o sistema gera. Qualquer outra coisa e recusada — sem isso, um caminho
 * como "../../.env" viraria leitura de arquivo arbitrario, e o .env guarda as
 * credenciais do Bling e do Mercado Livre.
 */
export async function GET(requisicao, { params }) {
  const { caminho } = await params;

  if (!Array.isArray(caminho) || caminho.length !== 3) {
    return new Response("Caminho invalido.", { status: 400 });
  }

  const [sku, pasta, nome] = caminho;
  const tipo = TIPOS_POR_PASTA[pasta];

  if (!tipo) return new Response("Pasta desconhecida.", { status: 400 });

  const absoluto = caminhoDe(decodeURIComponent(sku), tipo, nome);
  if (!absoluto) return new Response("Caminho invalido.", { status: 400 });

  try {
    const bytes = await readFile(absoluto);
    const extensao = nome.slice(nome.lastIndexOf("."));

    return new Response(bytes, {
      headers: {
        "Content-Type": CONTEUDO[extensao] ?? "application/octet-stream",
        // ZIP nunca abre na pagina: baixa.
        ...(extensao === ".zip" ? { "Content-Disposition": `attachment; filename="${nome}"` } : {}),
        // O nome e gerado no envio e nunca reutilizado: pode cachear para sempre.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (erro) {
    if (erro.code === "ENOENT") {
      return new Response("Arquivo nao encontrado.", { status: 404 });
    }
    throw erro;
  }
}
