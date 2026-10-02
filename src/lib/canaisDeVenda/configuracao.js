import { prisma } from "@/lib/db";
import {
  TETO_DE_VERSICULOS,
  contarVersiculos,
  errosDoVersiculo,
  podeAcrescentar,
  referenciaDoVersiculo,
  sortearVersiculo,
} from "./versiculos";

/**
 * Configuracao do canal Mercado Livre no banco: as frases fixas das descricoes e a lista
 * de versiculos da NVI. Fica aqui, e nao dentro das Server Actions, porque as acoes, a
 * tela de configuracao, a criacao do rascunho e a carga inicial leem as mesmas funcoes, e
 * porque o teste (scripts/teste-anuncios-ml.js) as chama direto, sem o Next.
 *
 * Quem grava devolve `{ ok, erro }` e nunca lanca por falha de banco. Quem so le deixa o
 * erro subir: a pagina ou a acao que chamou ja tem o aviso de banco, e um erro engolido
 * aqui viraria "lista vazia" na tela, parecendo que a configuracao sumiu.
 */

const CANAL = "MERCADO_LIVRE";

// A descricao tem que continuar sendo do produto: frase fixa demais ou longa demais a
// transforma em texto da loja. E as frases entram no denominador dos 25% do versiculo
// (o texto final inclui tudo), entao quanto mais frases, menos versiculos cabem.
const MAXIMO_DE_FRASES = 10;
const MAXIMO_DA_FRASE = 200;

const JA_ESTA_NA_LISTA = "Este versiculo ja esta na lista.";

function falha(erro) {
  console.error("[canais de venda]", erro);
  return { ok: false, erro: "Nao foi possivel salvar. Tente de novo." };
}

function naoEncontrado() {
  return { ok: false, erro: "Versiculo nao encontrado." };
}

/**
 * O versiculo e UMA linha no anuncio, entao o texto colado perde quebras de linha e
 * espacos repetidos (o NBSP de quem copia da web tambem). Sem `fim`, vale o `inicio`.
 */
function versiculoNormalizado(entrada) {
  return {
    livro: entrada?.livro,
    capitulo: entrada?.capitulo,
    inicio: entrada?.inicio,
    fim: entrada?.fim ?? entrada?.inicio,
    texto: String(entrada?.texto ?? "").replace(/\s+/g, " ").trim(),
  };
}

/** Sem linha no banco devolve listas vazias e NAO cria a linha: ler nao escreve. */
export async function lerConfigML() {
  const linha = await prisma.configCanal.findUnique({ where: { canal: CANAL } });
  return { frases: linha?.frasesFixas ?? [], usados: linha?.versiculosUsados ?? [] };
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

/** Ordem: livro, capitulo, inicio. Objetos simples, sem as datas do banco. */
export async function listarVersiculos() {
  return prisma.versiculo.findMany({
    orderBy: [{ livro: "asc" }, { capitulo: "asc" }, { inicio: "asc" }],
    select: { id: true, livro: true, capitulo: true, inicio: true, fim: true, texto: true },
  });
}

export async function adicionarVersiculo(entrada) {
  const novo = versiculoNormalizado(entrada);
  const erros = errosDoVersiculo(novo);
  if (erros.length > 0) return { ok: false, erro: erros.join(" ") };

  try {
    const lista = await listarVersiculos();
    // Repetido antes do teto: com a lista cheia, "ja esta na lista" e a causa de verdade.
    if (lista.some((v) => v.livro === novo.livro && v.capitulo === novo.capitulo && v.inicio === novo.inicio)) {
      return { ok: false, erro: JA_ESTA_NA_LISTA };
    }
    const cabe = podeAcrescentar(lista, novo);
    if (!cabe.ok) return cabe;

    const criado = await prisma.versiculo.create({ data: novo, select: { id: true } });
    return { ok: true, id: criado.id };
  } catch (erro) {
    // Duas inclusoes do mesmo versiculo ao mesmo tempo: o indice unico e quem decide.
    if (erro?.code === "P2002") return { ok: false, erro: JA_ESTA_NA_LISTA };
    return falha(erro);
  }
}

export async function removerVersiculo(id) {
  // `where: { id: undefined }` o Prisma le como "sem filtro": um id ausente nao pode chegar la.
  if (typeof id !== "string" || id === "") return naoEncontrado();

  try {
    await prisma.versiculo.delete({ where: { id } });
    return { ok: true };
  } catch (erro) {
    if (erro?.code === "P2025") return naoEncontrado();
    return falha(erro);
  }
}

/**
 * Carga da lista inicial (script da Tarefa 15). So carrega com a tabela VAZIA: depois da
 * primeira carga a lista e do dono, e recarregar devolveria o que ele tirou. Os problemas
 * da lista (versiculo invalido, mais de 500) lancam ANTES de gravar qualquer linha: quem
 * chama e um script que ja conferiu a lista, e aqui fica a ultima barreira do banco.
 * Versiculo repetido dentro da propria lista e ignorado, e `carregados` conta o gravado.
 */
export async function carregarVersiculosIniciais(lista) {
  const existentes = await prisma.versiculo.count();
  if (existentes > 0) return { carregados: 0, existentes };

  const versiculos = (Array.isArray(lista) ? lista : []).map(versiculoNormalizado);
  for (const v of versiculos) {
    const erros = errosDoVersiculo(v);
    if (erros.length > 0) throw new Error(`${referenciaDoVersiculo(v)}: ${erros.join(" ")}`);
  }
  const total = contarVersiculos(versiculos);
  if (total > TETO_DE_VERSICULOS) {
    throw new Error(
      `A carga tem ${total} versiculos. O limite da NVI sem autorizacao da Biblica e ${TETO_DE_VERSICULOS}.`,
    );
  }
  if (versiculos.length === 0) return { carregados: 0, existentes: 0 };

  const { count } = await prisma.versiculo.createMany({ data: versiculos, skipDuplicates: true });
  return { carregados: count, existentes: 0 };
}

/**
 * Sorteia da lista do banco, sem repetir os usados do canal. Sortear nao consome nada: o
 * historico so ganha o versiculo quando o anuncio e publicado (fase 3). O resultado de
 * `sortearVersiculo` volta como esta, inclusive os dois motivos de "sem versiculo".
 */
export async function sortearVersiculoDoBanco({ excluir = [], resto }) {
  const [lista, config] = await Promise.all([listarVersiculos(), lerConfigML()]);
  return sortearVersiculo({ lista, usados: config.usados, excluir, resto });
}
