import { stat } from "node:fs/promises";

import { prisma } from "@/lib/db";
import {
  PASTA_RESERVA,
  TIPOS_POR_PASTA,
  TIPO_POR_EXTENSAO,
  cabecalhoDeArquivo,
  caminhoDaReserva,
  caminhoDe,
  fluxoDeArquivo,
} from "@/lib/arquivos";

/// Tamanho do arquivo, ou null se ele nao existe. Conferido ANTES de montar a resposta: o fluxo (`fluxoDeArquivo`,
/// que serve do disco em vez de ler o arquivo inteiro na memoria) so abre o arquivo quando alguem le o corpo, e um
/// 404 precisa sair antes dos cabecalhos.
async function tamanhoDe(absoluto) {
  try {
    const info = await stat(absoluto);
    return info.isFile() ? info.size : null;
  } catch (erro) {
    if (erro.code === "ENOENT") return null;
    throw erro;
  }
}

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
 *
 * O Next ja entrega os segmentos DECODIFICADOS. Decodificar de novo (como esta rota fazia) lancava URIError, e
 * a rota PUBLICA respondia 500 a qualquer "%" solto no endereco (`/api/arquivos/%25zz/...`, medido em
 * 08/10/2026). SKU valido so tem letras, numeros, ponto, hifen e sublinhado: nunca precisou de decodificacao.
 */
export async function GET(requisicao, { params }) {
  const { caminho } = await params;

  if (!Array.isArray(caminho) || caminho.length !== 3) {
    return new Response("Caminho inválido.", { status: 400 });
  }

  const [sku, pasta, nome] = caminho;

  // Reserva de imagens (Nano Banana): sempre JPEG com nome gerado por nos, sempre aberta na pagina. Nao
  // consulta o banco: nao ha nome real para mostrar, so a imagem.
  if (pasta === PASTA_RESERVA) {
    const absolutoReserva = caminhoDaReserva(sku, nome);
    if (!absolutoReserva) return new Response("Caminho inválido.", { status: 400 });
    const tamanhoReserva = await tamanhoDe(absolutoReserva);
    if (tamanhoReserva === null) return new Response("Arquivo não encontrado.", { status: 404 });
    return new Response(fluxoDeArquivo(absolutoReserva), {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(tamanhoReserva),
        // O nome e gerado na gravacao e nunca reutilizado: pode cachear para sempre.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  const tipo = TIPOS_POR_PASTA[pasta];

  if (!tipo) return new Response("Pasta desconhecida.", { status: 400 });

  const absoluto = caminhoDe(sku, tipo, nome);
  if (!absoluto) return new Response("Caminho inválido.", { status: 400 });

  try {
    const tamanho = await tamanhoDe(absoluto);
    if (tamanho === null) return new Response("Arquivo não encontrado.", { status: 404 });
    const extensao = nome.slice(nome.lastIndexOf("."));

    // O nome real, se houver (foto importada nao tem). So depois de o arquivo existir: nome de arquivo
    // que nao existe nao justifica ida ao banco. Foto abre na pagina e nao mostra nome nenhum: sem ida ao
    // banco, que numa rota publica seria uma consulta por foto de cada visitante da loja.
    let nomeOriginal = null;
    if (tipo !== "IMAGEM") {
      try {
        const linha = await prisma.produtoArquivo.findFirst({
          where: { arquivo: nome, produto: { sku } },
          select: { nomeOriginal: true },
        });
        nomeOriginal = linha?.nomeOriginal ?? null;
      } catch {
        // Sem o banco, o download segue com o nome do endereco.
      }
    }

    // ZIP nunca abre na pagina: baixa. O resto abre, e o nome real vai junto para o "Salvar como".
    const disposicao = extensao === ".zip" ? "attachment" : "inline";
    const cabecalho = cabecalhoDeArquivo(nomeOriginal, disposicao);
    const comNome = cabecalho !== disposicao;

    return new Response(fluxoDeArquivo(absoluto), {
      headers: {
        "Content-Type": TIPO_POR_EXTENSAO[extensao] ?? "application/octet-stream",
        "Content-Length": String(tamanho),
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
      return new Response("Arquivo não encontrado.", { status: 404 });
    }
    throw erro;
  }
}
