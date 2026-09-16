import { prisma } from "@/lib/db";
import { medidasDoProdutoColetado, ncmFormatado } from "@/lib/medidas";
import { normalizar } from "@/lib/texto";

/**
 * Marca, modelo e numero de homologacao das referencias marcadas na lupa do
 * Nome, para o operador escolher no cadastro (pedido do dono em 16/09/2026).
 *
 * Cada valor vem uma vez so, com as fontes que o publicam: "Hikari" dito por
 * tres lojas e um valor, e o numero de lojas e o que ajuda a confiar nele.
 */

/**
 * Loja que se declara a propria marca nao diz nada do fabricante — o Eletrogate
 * poe "Eletrogate" nos 2.000 produtos, a Casa da Robotica e a Impacto CNC fazem
 * o mesmo.
 */
function marcaEhALoja(marca, nomeDaFonte) {
  const m = normalizar(marca).replace(/[^a-z0-9]/g, "");
  const f = normalizar(nomeDaFonte).replace(/[^a-z0-9]/g, "");
  return Boolean(m) && (f.startsWith(m) || m.startsWith(f));
}

/// Rotulo de especificacao que carrega o numero de homologacao.
const ROTULO_HOMOLOGACAO = /anatel|homologa|inmetro|certifica/i;
/// O numero da Anatel: grupos de digitos com hifen (ex.: 4556-15-1209, 01234-20-05678).
const NUMERO_HOMOLOGACAO = /\b\d{4,5}-\d{2}-\d{4,5}\b/g;

/**
 * Numeros de homologacao de um produto coletado.
 *
 * Medido em 16/09/2026: de 8.588 produtos, um so publica o numero (Saravati,
 * especificacao "Anatel: 4556-15-1209"); os outros dizem "certificado pela
 * Anatel", sem numero. Por isso so entra o que tem o FORMATO do numero — a frase
 * nao serve para o campo.
 */
function homologacoesDe(linha) {
  const achados = new Set();

  for (const item of Array.isArray(linha.especificacoes) ? linha.especificacoes : []) {
    const texto = `${item?.nome ?? ""} ${item?.valor ?? ""}`;
    if (!ROTULO_HOMOLOGACAO.test(texto)) continue;
    for (const numero of String(item?.valor ?? "").match(NUMERO_HOMOLOGACAO) ?? []) {
      achados.add(numero);
    }
  }

  // Na descricao, so o numero PERTO da palavra: numero solto com hifen pode ser
  // telefone ou codigo de peca.
  const descricao = linha.descricao ?? "";
  const perto = /(anatel|homologa\w*|inmetro)[^\d]{0,40}(\d{4,5}-\d{2}-\d{4,5})/gi;
  for (const casamento of descricao.matchAll(perto)) achados.add(casamento[2]);

  return [...achados];
}

/**
 * @param origem de onde saiu o valor ("Peso com embalagem: 32g"). Guardado so o
 *   primeiro: e o que a lista mostra para o operador saber se e a peca ou o
 *   pacote, e a ordem que foi presumida.
 */
function juntar(mapa, valor, fonte, origem = null) {
  const limpo = String(valor ?? "").trim();
  if (!limpo) return;
  const chave = normalizar(limpo);
  const atual = mapa.get(chave) ?? { valor: limpo, fontes: [], origem };
  if (!atual.fontes.includes(fonte)) atual.fontes.push(fonte);
  mapa.set(chave, atual);
}

const ordenar = (mapa) =>
  [...mapa.values()].sort(
    (a, b) => b.fontes.length - a.fontes.length || a.valor.localeCompare(b.valor, "pt-BR"),
  );

export async function lerCamposDasReferencias(ids) {
  const lista = [...new Set((ids ?? []).map(String))].slice(0, 50);
  const vazio = { marca: [], modelo: [], homologacao: [], peso: [], altura: [], largura: [], comprimento: [], ncm: [] };
  if (lista.length === 0) return vazio;

  const linhas = await prisma.produtoColetado.findMany({
    where: { id: { in: lista } },
    select: {
      marca: true,
      modelo: true,
      ncm: true,
      especificacoes: true,
      descricao: true,
      fonte: { select: { nome: true } },
    },
  });

  const mapas = Object.fromEntries(Object.keys(vazio).map((campo) => [campo, new Map()]));

  for (const linha of linhas) {
    const fonte = linha.fonte.nome;
    if (linha.marca && !marcaEhALoja(linha.marca, fonte)) juntar(mapas.marca, linha.marca, fonte);
    juntar(mapas.modelo, linha.modelo, fonte);
    for (const numero of homologacoesDe(linha)) juntar(mapas.homologacao, numero, fonte);
    juntar(mapas.ncm, ncmFormatado(linha.ncm), fonte);

    // Peso (kg) e dimensoes (cm) ja na unidade do formulario; o valor vai com
    // ponto decimal porque o campo e type="number".
    // Ficha e TEXTO da descricao: ha loja que so escreve medida no texto.
    const medidas = medidasDoProdutoColetado(linha);
    for (const campo of ["peso", "altura", "largura", "comprimento"]) {
      for (const achado of medidas[campo]) {
        juntar(mapas[campo], String(achado.valor), fonte, achado.origem);
      }
    }
  }

  return Object.fromEntries(Object.entries(mapas).map(([campo, mapa]) => [campo, ordenar(mapa)]));
}

/**
 * O que cada referencia marcada publica, para as secoes da janela "Criar
 * descricao": o operador le o texto e a ficha de cada loja antes de pedir a IA.
 *
 * Na ordem em que foram marcadas: e a ordem que o operador lembra.
 */
export async function lerDetalhesDasReferencias(ids) {
  const lista = [...new Set((ids ?? []).map(String))].slice(0, 50);
  if (lista.length === 0) return [];

  const linhas = await prisma.produtoColetado.findMany({
    where: { id: { in: lista } },
    select: {
      id: true,
      nome: true,
      codigo: true,
      marca: true,
      modelo: true,
      url: true,
      descricao: true,
      especificacoes: true,
      fonte: { select: { nome: true, tipo: true } },
    },
  });
  const porId = new Map(linhas.map((linha) => [linha.id, linha]));

  return lista
    .map((id) => porId.get(id))
    .filter(Boolean)
    .map((linha) => ({
      id: linha.id,
      nome: linha.nome,
      codigo: linha.codigo && linha.codigo !== "N/A" ? linha.codigo : null,
      marca: linha.marca,
      modelo: linha.modelo,
      url: linha.url,
      fonte: linha.fonte.nome,
      tipo: linha.fonte.tipo,
      descricao: linha.descricao,
      especificacoes: (Array.isArray(linha.especificacoes) ? linha.especificacoes : [])
        .filter((item) => item && (item.valor || item.nome))
        .map((item) => ({ nome: item.nome ?? null, valor: item.valor ?? "" })),
    }));
}
