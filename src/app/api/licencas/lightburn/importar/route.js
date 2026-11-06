import { conferirChaveDaExtensao } from "@/lib/ferramentas/licencas/chave";
import { lerCorpoDaLeitura } from "@/lib/ferramentas/licencas/esquema";
import { aplicarLeituraDoPortal } from "@/lib/ferramentas/licencas/portal";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const LIMITE_BYTES = 5 * 1024 * 1024;
const recusa = (erro, status = 400) => Response.json({ erro }, { status });

/**
 * O "Enviar ao Rise" da extensao "Rise LightBurn" (spec 2026-11-05, §6.4): as chaves e os PCs lidos do portal.
 * Autenticada pela chave da extensao, sem sessao. O corpo passa pelo esquema antes de qualquer gravacao, e a leitura
 * so importa: nenhuma rota da extensao apaga nada.
 */
export async function POST(requisicao) {
  const chave = await conferirChaveDaExtensao(requisicao);
  if (!chave.ok) return recusa(chave.erro, chave.status);
  if (Number(requisicao.headers.get("content-length") ?? 0) > LIMITE_BYTES) return recusa("Corpo acima de 5 MB.", 413);

  const texto = await requisicao.text();
  if (texto.length > LIMITE_BYTES) return recusa("Corpo acima de 5 MB.", 413);
  let json;
  try {
    json = JSON.parse(texto);
  } catch {
    return recusa("O corpo não é JSON.");
  }
  const corpo = lerCorpoDaLeitura(json);
  if (!corpo.ok) return recusa(`Formato inválido: ${corpo.erro}`);

  const resultado = await aplicarLeituraDoPortal(corpo.dados);
  if (!resultado.ok) return recusa(resultado.erro);
  return Response.json({ ok: true, leituraId: resultado.leituraId, ...resultado.resumo });
}
