import { conferirChaveDaExtensao } from "@/lib/compras/aliexpress/chave";
import { lerCorpo } from "@/lib/compras/aliexpress/esquema";
import { importarDetalhes, importarLista } from "@/lib/compras/aliexpress/importacao";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const LIMITE_BYTES = 5 * 1024 * 1024;
const recusa = (erro, status = 400) => Response.json({ erro }, { status });

/**
 * O "Enviar ao Rise" da extensao (spec 2026-10-28, §6.1 e §6.3): fase `lista` e depois fase `detalhes`. Autenticada
 * pela chave da extensao (`conferirChaveDaExtensao`), sem sessao. O corpo passa pelo esquema antes de qualquer
 * gravacao; o que a importacao recusa volta com o motivo, que o popup mostra.
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
  const corpo = lerCorpo(json);
  if (!corpo.ok) return recusa(`Formato inválido: ${corpo.erro}`);

  const resultado = corpo.fase === "lista" ? await importarLista(corpo.dados) : await importarDetalhes(corpo.dados);
  if (!resultado.ok) return recusa(resultado.erro);
  return Response.json(resultado);
}
