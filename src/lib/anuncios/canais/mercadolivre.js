/**
 * Regras do Mercado Livre para montar, validar e editar um anuncio.
 *
 * Nao depende de rede: recebe o produto e o anuncio ja carregados e devolve
 * payload, problemas e campos editaveis. Isso permite validar tudo antes de
 * gastar uma chamada de API — e e o que a tela usa para mostrar os problemas
 * no campo certo, em portugues.
 */

export const LIMITE_TITULO = 60;

/**
 * O que o canal aceita alterar depois de publicado.
 *
 * O titulo do Mercado Livre NAO pode ser alterado depois que o anuncio tem
 * vendas (exceto lojas oficiais), e o tipo de anuncio so muda uma vez. Saber
 * disso antes evita oferecer um campo que a API vai recusar.
 */
export function camposEditaveis(anuncio) {
  const publicado = anuncio?.status === "PUBLICADO";
  const comVendas = Boolean(anuncio?.temVendas);

  return {
    titulo: comVendas
      ? { editavel: false, motivo: "O anúncio já tem vendas" }
      : { editavel: true },
    categoria: publicado
      ? { editavel: false, motivo: "Categoria não muda depois de publicado" }
      : { editavel: true },
    tipoAnuncio: comVendas
      ? { editavel: false, motivo: "O tipo de anúncio só pode mudar uma vez" }
      : { editavel: true },
    descricao: { editavel: true },
    preco: { editavel: true },
    atributos: { editavel: true },
  };
}

/**
 * Problemas que impediriam (ou atrapalhariam) a publicacao.
 * `bloqueante: true` impede publicar; false e so um alerta.
 *
 * @param {object} produto
 * @param {object} anuncio
 * @param {object[]} [atributosCategoria] ficha tecnica vinda de
 *        GET /categories/{id}/attributes — quando ausente, valida so o resto.
 */
export function validar(produto, anuncio, atributosCategoria) {
  const problemas = [];
  const titulo = anuncio?.titulo || produto?.tituloBase || "";

  if (!titulo.trim()) {
    problemas.push({
      campo: "titulo",
      problema: "O título é obrigatório.",
      bloqueante: true,
    });
  } else if (titulo.length > LIMITE_TITULO) {
    problemas.push({
      campo: "titulo",
      problema: `O título tem ${titulo.length} caracteres; o limite do Mercado Livre é ${LIMITE_TITULO}.`,
      bloqueante: true,
    });
  }

  if (!anuncio?.categoriaExternaId) {
    problemas.push({
      campo: "categoria",
      problema: "Escolha a categoria do Mercado Livre.",
      bloqueante: true,
    });
  }

  const preco = Number(produto?.precoVenda ?? 0);
  if (!preco || preco <= 0) {
    problemas.push({
      campo: "preco",
      problema: "Informe o preço de venda.",
      bloqueante: true,
    });
  }

  if ((produto?.imagens?.length ?? 0) === 0) {
    problemas.push({
      campo: "imagens",
      problema: "O anúncio precisa de ao menos uma imagem.",
      bloqueante: true,
    });
  }

  if (!produto?.ean) {
    problemas.push({
      campo: "ean",
      problema:
        "Sem EAN/GTIN. A maioria das categorias de eletrônicos exige o código universal.",
      bloqueante: false,
    });
  }

  if (!Number.isFinite(Number(produto?.estoque)) || Number(produto?.estoque) <= 0) {
    problemas.push({
      campo: "estoque",
      problema: "Estoque zerado: o anúncio seria publicado sem disponibilidade.",
      bloqueante: false,
    });
  }

  // family_name e obrigatorio no modelo User Products, que e o modelo desta
  // conta (confirmado no teste de conexao das Integracoes).
  if (!nomeFamilia(produto, anuncio)) {
    problemas.push({
      campo: "familyName",
      problema:
        "Informe o nome da família (family_name), obrigatório no modelo User Products.",
      bloqueante: true,
    });
  }

  const preenchidos = anuncio?.atributos ?? {};
  for (const atributo of atributosCategoria ?? []) {
    const exigido = atributo.tags?.required || atributo.tags?.catalog_required;
    if (exigido && !preenchidos[atributo.id]) {
      problemas.push({
        campo: `atributo:${atributo.id}`,
        problema: `"${atributo.name}" é obrigatório nesta categoria.`,
        bloqueante: true,
      });
    }
  }

  return problemas;
}

function nomeFamilia(produto, anuncio) {
  return (
    anuncio?.atributos?.family_name ||
    [produto?.marca, produto?.modelo].filter(Boolean).join(" ") ||
    null
  );
}

/**
 * Monta o corpo do POST /items.
 *
 * O preco fica FORA de proposito: desde marco de 2026 o Mercado Livre ignora
 * (ou rejeita) preco no corpo do item — ele vai em POST /items/{id}/prices/standard.
 * Publicamos como `paused` para que uma falha no meio da sequencia nao deixe um
 * anuncio incompleto e vendavel no ar.
 */
export function montarPayload(produto, anuncio) {
  const titulo = anuncio?.titulo || produto?.tituloBase || "";

  return {
    item: {
      title: titulo.slice(0, LIMITE_TITULO),
      category_id: anuncio?.categoriaExternaId ?? null,
      family_name: nomeFamilia(produto, anuncio),
      available_quantity: Number(produto?.estoque ?? 0),
      currency_id: "BRL",
      listing_type_id: anuncio?.atributos?.listing_type_id ?? "gold_special",
      condition: "new",
      status: "paused",
      pictures: (produto?.imagens ?? []).map((imagem) => ({ source: imagem.url })),
      attributes: Object.entries(anuncio?.atributos ?? {})
        .filter(([id]) => !["family_name", "listing_type_id"].includes(id))
        .map(([id, value_name]) => ({ id, value_name: String(value_name) })),
    },
    descricao: {
      endpoint: "PUT /items/{id}/description",
      plain_text: anuncio?.descricao || produto?.descricaoBase || "",
    },
    preco: {
      endpoint: "POST /items/{id}/prices/standard",
      prices: [
        {
          type: "standard",
          amount: Number(produto?.precoVenda ?? 0),
          currency_id: "BRL",
        },
      ],
    },
  };
}
