/**
 * Regras do Bling.
 *
 * O Bling nao e um marketplace: e o mestre do cadastro e do estoque. Por isso
 * "publicar no Bling" significa criar/atualizar o produto no ERP, e e
 * pre-requisito dos demais canais — sem o produto la, os marketplaces nao tem
 * onde gravar o codigo de retorno que liga os dois lados.
 */

export function camposEditaveis() {
  // O Bling aceita atualizar tudo pelo proprio ERP.
  return {
    titulo: { editavel: true },
    descricao: { editavel: true },
    preco: { editavel: true },
    estoque: { editavel: true },
  };
}

export function validar(produto) {
  const problemas = [];

  if (!produto?.sku?.trim()) {
    problemas.push({
      campo: "sku",
      problema: "O SKU e obrigatorio: e ele que liga o produto aos canais.",
      bloqueante: true,
    });
  }

  if (!produto?.tituloBase?.trim()) {
    problemas.push({
      campo: "tituloBase",
      problema: "Informe a descricao do produto.",
      bloqueante: true,
    });
  }

  const preco = Number(produto?.precoVenda ?? 0);
  if (!preco || preco <= 0) {
    problemas.push({
      campo: "preco",
      problema: "Informe o preco de venda.",
      bloqueante: true,
    });
  }

  if (!produto?.custo) {
    problemas.push({
      campo: "custo",
      problema: "Sem custo cadastrado nao da para acompanhar a margem.",
      bloqueante: false,
    });
  }

  return problemas;
}

/** Corpo do POST/PUT /produtos da API v3. */
export function montarPayload(produto) {
  return {
    item: {
      nome: produto?.tituloBase ?? "",
      codigo: produto?.sku ?? "",
      preco: Number(produto?.precoVenda ?? 0),
      tipo: "P",
      situacao: produto?.ativo ? "A" : "I",
      formato: "S",
      unidade: "UN",
      gtin: produto?.ean ?? undefined,
      marca: produto?.marca ?? undefined,
      descricaoCurta: produto?.descricaoBase ?? undefined,
      pesoLiquido: produto?.pesoKg ? Number(produto.pesoKg) : undefined,
      dimensoes: {
        largura: produto?.larguraCm ? Number(produto.larguraCm) : undefined,
        altura: produto?.alturaCm ? Number(produto.alturaCm) : undefined,
        profundidade: produto?.comprimentoCm
          ? Number(produto.comprimentoCm)
          : undefined,
      },
      estoque: { minimo: 0 },
    },
  };
}
