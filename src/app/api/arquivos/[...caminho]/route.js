import { readFile } from "node:fs/promises";

import { prisma } from "@/lib/db";
import { PASTA_RESERVA, TIPOS_POR_PASTA, cabecalhoDeArquivo, caminhoDaReserva, caminhoDe } from "@/lib/arquivos";

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
 *
 * O arquivo mora no disco com o nome gerado por nos (hash), mas quem baixa espera o NOME REAL que o dono
 * enviou ("Datasheet ATmega328P.pdf"): ele esta no banco (`ProdutoArquivo.nomeOriginal`) e vai no
 * `Content-Disposition` (pedido do dono em 05/10/2026). A busca do nome nao pode derrubar o download: se o
 * banco falhar, o arquivo sai com o nome do endereco, como antes.
 */
export async function GET(requisicao, { params }) {
  const { caminho } = await params;

  if (!Array.isArray(caminho) || caminho.length !== 3) {
    return new Response("Caminho invalido.", { status: 400 });
  }

  const [sku, pasta, nome] = caminho;

  // Reserva de imagens (Nano Banana): sempre JPEG com nome gerado por nos, sempre aberta na pagina. Nao
  // consulta o banco: nao ha nome real para mostrar, so a imagem.
  if (pasta === PASTA_RESERVA) {
    const absolutoReserva = caminhoDaReserva(decodeURIComponent(sku), nome);
    if (!absolutoReserva) return new Response("Caminho invalido.", { status: 400 });
    try {
      return new Response(await readFile(absolutoReserva), {
        headers: {
          "Content-Type": "image/jpeg",
          // O nome e gerado na gravacao e nunca reutilizado: pode cachear para sempre.
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    } catch (erro) {
      if (erro.code === "ENOENT") return new Response("Arquivo nao encontrado.", { status: 404 });
      throw erro;
    }
  }

  const tipo = TIPOS_POR_PASTA[pasta];

  if (!tipo) return new Response("Pasta desconhecida.", { status: 400 });

  const skuDecodificado = decodeURIComponent(sku);
  const absoluto = caminhoDe(skuDecodificado, tipo, nome);
  if (!absoluto) return new Response("Caminho invalido.", { status: 400 });

  try {
    const bytes = await readFile(absoluto);
    const extensao = nome.slice(nome.lastIndexOf("."));

    // O nome real, se houver (foto importada nao tem). So depois de o arquivo existir: nome de arquivo
    // que nao existe nao justifica ida ao banco.
    let nomeOriginal = null;
    try {
      const linha = await prisma.produtoArquivo.findFirst({
        where: { arquivo: nome, produto: { sku: skuDecodificado } },
        select: { nomeOriginal: true },
      });
      nomeOriginal = linha?.nomeOriginal ?? null;
    } catch {
      // Sem o banco, o download segue com o nome do endereco.
    }

    // ZIP nunca abre na pagina: baixa. O resto abre, e o nome real vai junto para o "Salvar como".
    const disposicao = extensao === ".zip" ? "attachment" : "inline";
    const cabecalho = cabecalhoDeArquivo(nomeOriginal, disposicao);
    const comNome = cabecalho !== disposicao;

    return new Response(bytes, {
      headers: {
        "Content-Type": CONTEUDO[extensao] ?? "application/octet-stream",
        // Sem nome real, o ZIP mantem o comportamento de antes (nome do endereco); o resto nao precisa de cabecalho.
        ...(comNome
          ? { "Content-Disposition": cabecalho }
          : extensao === ".zip"
            ? { "Content-Disposition": `attachment; filename="${nome}"` }
            : {}),
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
