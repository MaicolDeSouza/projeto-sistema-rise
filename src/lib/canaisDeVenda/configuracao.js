import { prisma } from "@/lib/db";
import { avisoDasFrases, frasesDoTexto } from "@/lib/canaisDeVenda/frases";

/**
 * Configuracao de cada canal no banco (`ConfigCanal`): as frases fixas das descricoes. Fica aqui, e
 * nao dentro das Server Actions, porque as acoes, a tela de configuracao e a criacao do
 * rascunho leem as mesmas funcoes, e porque o teste (scripts/teste-anuncios-ml.js) as chama
 * direto, sem o Next.
 *
 * Quem grava devolve `{ ok, erro }` e nunca lanca por falha de banco. Quem so le deixa o
 * erro subir: a pagina ou a acao que chamou ja tem o aviso de banco, e um erro engolido
 * aqui viraria "lista vazia" na tela, parecendo que a configuracao sumiu.
 */

// Os canais com frases fixas. Canal fora da lista e recusado: o valor vem de Server Action, e o
// enum do banco recusaria com um erro que a tela nao saberia explicar.
const CANAIS = new Set(["MERCADO_LIVRE", "LOJA_INTEGRADA"]);

function falha(erro) {
  console.error("[canais de venda]", erro);
  return { ok: false, erro: "Nao foi possivel salvar. Tente de novo." };
}

/** Sem linha no banco devolve a lista vazia e NAO cria a linha: ler nao escreve. */
export async function lerConfigCanal(canal) {
  if (!CANAIS.has(canal)) throw new Error(`Canal sem configuracao: ${canal}`);
  const linha = await prisma.configCanal.findUnique({ where: { canal } });
  return { frases: linha?.frasesFixas ?? [] };
}

export function lerConfigML() {
  return lerConfigCanal("MERCADO_LIVRE");
}

/** Uma frase por linha, limpa e conferida por `frases.js` (as mesmas regras que a tela mostra). */
export async function gravarFrasesDoCanal(canal, texto) {
  if (!CANAIS.has(canal)) return { ok: false, erro: "Canal desconhecido." };
  const frases = frasesDoTexto(texto);
  const aviso = avisoDasFrases(frases);
  if (aviso) return { ok: false, erro: aviso };

  try {
    const linha = await prisma.configCanal.upsert({
      where: { canal },
      create: { canal, frasesFixas: frases },
      update: { frasesFixas: frases },
    });
    return { ok: true, frases: linha.frasesFixas };
  } catch (erro) {
    return falha(erro);
  }
}

export function gravarFrases(texto) {
  return gravarFrasesDoCanal("MERCADO_LIVRE", texto);
}
