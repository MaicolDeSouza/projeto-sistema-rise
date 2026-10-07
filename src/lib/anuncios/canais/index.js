import { createHash } from "node:crypto";

import * as bling from "./bling";
import * as lojaIntegrada from "./lojaintegrada";
import * as mercadoLivre from "./mercadolivre";

/**
 * Registro dos canais de anuncio — a mesma ideia do registro de conectores em
 * src/lib/integracoes/registro.js. Acrescentar um marketplace e criar um
 * arquivo aqui e uma linha nesta lista; as telas nao mudam.
 */
export const canais = [
  {
    id: "BLING",
    nome: "Bling",
    resumo: "ERP — mestre do cadastro e do estoque",
    obrigatorio: true,
    disponivel: true,
    regras: bling,
  },
  {
    id: "LOJA_INTEGRADA",
    nome: "Loja Integrada",
    resumo: "Loja própria — sincronizada pelo Bling",
    obrigatorio: false,
    disponivel: true,
    viaBling: true,
    regras: lojaIntegrada,
  },
  {
    id: "MERCADO_LIVRE",
    nome: "Mercado Livre",
    resumo: "Marketplace — publicação direta por API",
    obrigatorio: false,
    disponivel: true,
    regras: mercadoLivre,
  },
  {
    id: "SHOPEE",
    nome: "Shopee",
    resumo: "Marketplace — aguardando credenciais de parceiro",
    obrigatorio: false,
    disponivel: false,
    motivoIndisponivel:
      "Exige credenciais do Shopee Open Platform, que ainda não foram obtidas.",
    regras: null,
  },
];

export function obterCanal(id) {
  return canais.find((canal) => canal.id === id) ?? null;
}

/**
 * Hash do conteudo que define um anuncio.
 *
 * Guardado no momento da publicacao. Se o produto mudar depois, o hash deixa de
 * bater e a tela avisa "alteracoes nao publicadas" — sem isso, o registro local
 * afirmaria que esta tudo sincronizado enquanto o anuncio no ar esta velho.
 */
export function calcularHashConteudo(produto, anuncio) {
  const relevante = {
    titulo: anuncio?.titulo ?? produto?.tituloBase ?? "",
    descricao: anuncio?.descricao ?? produto?.descricaoBase ?? "",
    preco: String(produto?.precoVenda ?? ""),
    estoque: String(produto?.estoque ?? ""),
    categoria: anuncio?.categoriaExternaId ?? "",
    atributos: anuncio?.atributos ?? {},
    imagens: (produto?.imagens ?? []).map((imagem) => imagem.url),
  };

  return createHash("sha256")
    .update(JSON.stringify(relevante))
    .digest("hex")
    .slice(0, 32);
}

export function temAlteracoesNaoPublicadas(produto, anuncio) {
  if (anuncio?.status !== "PUBLICADO" || !anuncio?.hashConteudo) return false;
  return calcularHashConteudo(produto, anuncio) !== anuncio.hashConteudo;
}
