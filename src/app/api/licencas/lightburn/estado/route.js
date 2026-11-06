import { conferirChaveDaExtensao } from "@/lib/ferramentas/licencas/chave";
import { estadoDaLeitura } from "@/lib/ferramentas/licencas/portal";

export const dynamic = "force-dynamic";

/**
 * O que a extensao "Rise LightBurn" pergunta antes de ler o portal: a ultima leitura e quantas chaves o Rise tem
 * (spec 2026-11-05, §6.4). Autenticada pela chave da extensao (`conferirChaveDaExtensao`), sem sessao.
 */
export async function GET(requisicao) {
  const chave = await conferirChaveDaExtensao(requisicao);
  if (!chave.ok) return Response.json({ erro: chave.erro }, { status: chave.status });
  return Response.json(await estadoDaLeitura());
}
