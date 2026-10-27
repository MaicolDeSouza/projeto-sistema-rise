import { recusarRota, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { lerFotoManual } from "@/lib/producao/fotosManuais";

/** A foto de um item manual da lista personalizada: so quem ve o cadastro de Produto (a rota fica atras do login). */
export async function GET(requisicao, { params }) {
  const { pode } = await sessaoDeAcessos();
  if (!pode("tela.produtos.cadastro", "ver")) return recusarRota();
  const { nome } = await params;
  const bytes = await lerFotoManual(nome);
  if (!bytes) return new Response("Sem foto.", { status: 404 });
  return new Response(bytes, {
    headers: {
      "Content-Type": "image/jpeg",
      // O nome e gerado por nos e o arquivo nunca muda: pode guardar.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
