import { prisma } from "@/lib/db";

/// So formatos de imagem que o navegador desenha sem executar nada. SVG fica de
/// fora: e XML com script, e esta rota serve do NOSSO dominio conteudo que veio
/// de arquivo de terceiro.
const TIPOS = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * A foto principal de um produto coletado, pelo id.
 *
 * Existe para a janela de referencias do cadastro poder usar
 * <img loading="lazy">: a miniatura da Nightech e da Fortek e base64 gravado no
 * banco (media de 50 KB na Nightech, a maior com 1 MB), e mandar as 200 linhas
 * com a foto dentro da resposta da busca pesaria varios MB. Assim o navegador
 * so pede a foto das linhas que aparecem na tela.
 *
 * Foto de loja (endereco http) vira redirecionamento; base64 vira os bytes.
 */
export async function GET(requisicao, { params }) {
  const { id } = await params;

  const linha = await prisma.produtoColetado.findUnique({
    where: { id: String(id) },
    select: { miniatura: true },
  });
  const miniatura = linha?.miniatura;
  if (!miniatura) return new Response("Sem foto.", { status: 404 });

  if (/^https?:\/\//i.test(miniatura)) {
    return Response.redirect(miniatura, 302);
  }

  const casamento = /^data:([a-z0-9.+/-]+);base64,(.+)$/is.exec(miniatura);
  if (!casamento || !TIPOS.has(casamento[1].toLowerCase())) {
    return new Response("Formato de foto não suportado.", { status: 415 });
  }

  return new Response(Buffer.from(casamento[2], "base64"), {
    headers: {
      "Content-Type": casamento[1].toLowerCase(),
      // A foto muda quando a fonte e coletada de novo, entao nao e imutavel;
      // um dia de cache evita pedir de novo a cada busca.
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
