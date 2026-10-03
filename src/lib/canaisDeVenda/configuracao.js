import { prisma } from "@/lib/db";

/**
 * Configuracao do canal Mercado Livre no banco: as frases fixas das descricoes. Fica aqui, e
 * nao dentro das Server Actions, porque as acoes, a tela de configuracao e a criacao do
 * rascunho leem as mesmas funcoes, e porque o teste (scripts/teste-anuncios-ml.js) as chama
 * direto, sem o Next.
 *
 * Quem grava devolve `{ ok, erro }` e nunca lanca por falha de banco. Quem so le deixa o
 * erro subir: a pagina ou a acao que chamou ja tem o aviso de banco, e um erro engolido
 * aqui viraria "lista vazia" na tela, parecendo que a configuracao sumiu.
 */

const CANAL = "MERCADO_LIVRE";

// A descricao tem que continuar sendo do produto: frase fixa demais ou longa demais a
// transforma em texto da loja.
const MAXIMO_DE_FRASES = 10;
const MAXIMO_DA_FRASE = 200;

function falha(erro) {
  console.error("[canais de venda]", erro);
  return { ok: false, erro: "Nao foi possivel salvar. Tente de novo." };
}

/** Sem linha no banco devolve a lista vazia e NAO cria a linha: ler nao escreve. */
export async function lerConfigML() {
  const linha = await prisma.configCanal.findUnique({ where: { canal: CANAL } });
  return { frases: linha?.frasesFixas ?? [] };
}

/** Uma frase por linha. Linha vazia sai e frase repetida vira uma so. */
export async function gravarFrases(texto) {
  const frases = [
    ...new Set(
      String(texto ?? "")
        .split(/\r?\n/)
        .map((linha) => linha.trim())
        .filter(Boolean),
    ),
  ];

  if (frases.length > MAXIMO_DE_FRASES) {
    return { ok: false, erro: `Use ate ${MAXIMO_DE_FRASES} frases.` };
  }
  const longa = frases.findIndex((frase) => frase.length > MAXIMO_DA_FRASE);
  if (longa >= 0) {
    return {
      ok: false,
      erro: `A frase ${longa + 1} tem ${frases[longa].length} caracteres. O limite e ${MAXIMO_DA_FRASE}.`,
    };
  }

  try {
    const linha = await prisma.configCanal.upsert({
      where: { canal: CANAL },
      create: { canal: CANAL, frasesFixas: frases },
      update: { frasesFixas: frases },
    });
    return { ok: true, frases: linha.frasesFixas };
  } catch (erro) {
    return falha(erro);
  }
}
