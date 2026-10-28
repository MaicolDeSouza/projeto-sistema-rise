import { conferirChaveDaExtensao } from "@/lib/compras/aliexpress/chave";
import { estadoDaImportacao } from "@/lib/compras/aliexpress/importacao";

export const dynamic = "force-dynamic";

/**
 * O que a extensao "Rise AliExpress" pergunta antes de ler a pagina: ate que data ler (spec 2026-10-28, §6.1).
 * Autenticada pela chave da extensao (`conferirChaveDaExtensao`), sem sessao: a extensao nao tem o login do Rise.
 */
export async function GET(requisicao) {
  const chave = await conferirChaveDaExtensao(requisicao);
  if (!chave.ok) return Response.json({ erro: chave.erro }, { status: chave.status });
  return Response.json(await estadoDaImportacao());
}
