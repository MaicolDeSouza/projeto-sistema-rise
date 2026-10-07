function textoOuNulo(valor) {
  if (valor === undefined || valor === null) return null;
  const texto = String(valor).trim();
  return texto || null;
}

function numeroOuNulo(valor) {
  if (valor === undefined || valor === null || valor === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function booleano(valor, padrao = false) {
  if (typeof valor === "boolean") return valor;
  if (valor === 1 || valor === "1" || valor === "true") return true;
  if (valor === 0 || valor === "0" || valor === "false") return false;
  return padrao;
}

function dataIsoOuNulo(valor) {
  if (!valor) return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

export function idDeRecursoLojaIntegrada(valor) {
  if (valor && typeof valor === "object") {
    if (valor.id !== undefined && valor.id !== null) return String(valor.id);
    valor = valor.resource_uri ?? valor.uri;
  }
  if (!valor) return null;

  const caminho = String(valor).split("?")[0].replace(/\/+$/, "");
  const id = caminho.split("/").filter(Boolean).at(-1);
  return id ? decodeURIComponent(id) : null;
}

function normalizarUris(valores) {
  return (Array.isArray(valores) ? valores : [])
    .map((valor) => ({
      id: idDeRecursoLojaIntegrada(valor),
      uri: textoOuNulo(valor?.resource_uri ?? valor?.uri ?? valor),
    }))
    .filter(({ id, uri }) => id || uri);
}

function normalizarImagens(valores) {
  return (Array.isArray(valores) ? valores : [])
    .map((imagem) => ({
      id: idDeRecursoLojaIntegrada(imagem),
      url: textoOuNulo(
        imagem?.url ??
          imagem?.grande ??
          imagem?.media ??
          imagem?.pequena ??
          imagem?.imagem ??
          imagem?.src,
      ),
      principal: booleano(imagem?.principal),
      posicao: numeroOuNulo(imagem?.posicao),
    }))
    .filter(({ id, url }) => id || url);
}

export function normalizarProdutoLojaIntegrada(produto) {
  if (!produto || typeof produto !== "object") {
    throw new TypeError("Produto da Loja Integrada invalido.");
  }

  const idItem = textoOuNulo(produto.id);
  if (!idItem) throw new TypeError("Produto da Loja Integrada sem id.");

  const idPai = idDeRecursoLojaIntegrada(produto.pai);
  const ehVariacao = produto.tipo === "atributo_opcao" || Boolean(idPai);

  return {
    provedor: "LOJA_INTEGRADA",
    idProdutoExterno: idPai ?? idItem,
    idVariacaoExterna: ehVariacao ? idItem : null,
    idItemExterno: idItem,
    idProdutoPaiExterno: idPai,
    uri: textoOuNulo(produto.resource_uri),
    sku: textoOuNulo(produto.sku),
    nome: textoOuNulo(produto.nome),
    descricaoHtml: textoOuNulo(produto.descricao_completa ?? produto.descricao),
    tipo: textoOuNulo(produto.tipo),
    ativo: booleano(produto.ativo, true),
    removido: booleano(produto.removido),
    destaque: booleano(produto.destaque),
    url: textoOuNulo(produto.url),
    gtin: textoOuNulo(produto.gtin),
    mpn: textoOuNulo(produto.mpn),
    ncm: textoOuNulo(produto.ncm),
    marca: {
      id: idDeRecursoLojaIntegrada(produto.marca),
      uri: textoOuNulo(produto.marca?.resource_uri ?? produto.marca),
    },
    precos: {
      cheio: numeroOuNulo(produto.preco_cheio),
      promocional: numeroOuNulo(produto.preco_promocional),
      custo: numeroOuNulo(produto.preco_custo),
    },
    estoque: {
      gerenciado: booleano(produto.estoque_gerenciado ?? produto.gerenciado),
      quantidade: numeroOuNulo(produto.estoque_quantidade),
      disponivel: numeroOuNulo(
        produto.estoque_quantidade_disponivel ?? produto.estoque_disponivel,
      ),
      reservada: numeroOuNulo(produto.estoque_quantidade_reservada),
    },
    pesoKg: numeroOuNulo(produto.peso),
    dimensoesCm: {
      altura: numeroOuNulo(produto.altura),
      largura: numeroOuNulo(produto.largura),
      comprimento: numeroOuNulo(produto.profundidade ?? produto.comprimento),
    },
    categorias: normalizarUris(produto.categorias),
    variacoes: normalizarUris(produto.variacoes),
    imagens: normalizarImagens(produto.imagens),
    criadoEm: dataIsoOuNulo(produto.data_criacao),
    atualizadoEm: dataIsoOuNulo(produto.data_modificacao),
  };
}

export function normalizarPrecoLojaIntegrada(preco) {
  if (!preco || typeof preco !== "object") {
    throw new TypeError("Preco da Loja Integrada invalido.");
  }
  return {
    id: textoOuNulo(preco.id),
    idProdutoExterno: idDeRecursoLojaIntegrada(preco.produto),
    cheio: numeroOuNulo(preco.cheio),
    promocional: numeroOuNulo(preco.promocional),
    custo: numeroOuNulo(preco.custo),
    sobConsulta: booleano(preco.sob_consulta),
  };
}

export function normalizarEstoqueLojaIntegrada(estoque) {
  if (!estoque || typeof estoque !== "object") {
    throw new TypeError("Estoque da Loja Integrada invalido.");
  }
  return {
    id: textoOuNulo(estoque.id),
    idProdutoExterno: idDeRecursoLojaIntegrada(estoque.produto),
    gerenciado: booleano(estoque.gerenciado),
    quantidade: numeroOuNulo(estoque.quantidade),
    quantidadeDisponivel: numeroOuNulo(estoque.quantidade_disponivel),
    quantidadeReservada: numeroOuNulo(estoque.quantidade_reservada),
    prazoEmEstoqueDias: numeroOuNulo(estoque.situacao_em_estoque),
    prazoSemEstoqueDias: numeroOuNulo(estoque.situacao_sem_estoque),
  };
}

function documentoDoCliente(cliente) {
  return textoOuNulo(cliente?.cpf ?? cliente?.cnpj);
}

export function normalizarClienteLojaIntegrada(cliente) {
  if (!cliente || typeof cliente !== "object") {
    throw new TypeError("Cliente da Loja Integrada invalido.");
  }
  const id = textoOuNulo(cliente.id) ?? idDeRecursoLojaIntegrada(cliente.resource_uri);
  if (!id) throw new TypeError("Cliente da Loja Integrada sem id.");

  return {
    provedor: "LOJA_INTEGRADA",
    idExterno: id,
    nome: textoOuNulo(cliente.nome),
    razaoSocial: textoOuNulo(cliente.razao_social),
    tipoPessoa: cliente.tipo === "PJ" || cliente.cnpj ? "JURIDICA" : "FISICA",
    documento: documentoDoCliente(cliente),
    email: textoOuNulo(cliente.email),
    telefone: textoOuNulo(
      cliente.telefone_celular ??
        cliente.telefone_principal ??
        cliente.telefone_comercial,
    ),
    sexo: textoOuNulo(cliente.sexo),
    nascimento: textoOuNulo(cliente.data_nascimento),
    enderecos: (Array.isArray(cliente.enderecos) ? cliente.enderecos : []).map(
      (endereco) => ({
        idExterno: textoOuNulo(endereco.id),
        principal: booleano(endereco.principal),
        cep: textoOuNulo(endereco.cep),
        uf: textoOuNulo(endereco.estado),
        cidade: textoOuNulo(endereco.cidade),
        bairro: textoOuNulo(endereco.bairro),
        logradouro: textoOuNulo(endereco.endereco),
        numero: textoOuNulo(endereco.numero),
        complemento: textoOuNulo(endereco.complemento),
      }),
    ),
    criadoEm: dataIsoOuNulo(cliente.data_criacao),
    atualizadoEm: dataIsoOuNulo(cliente.data_modificacao),
  };
}

export function normalizarPedidoLojaIntegrada(pedido) {
  if (!pedido || typeof pedido !== "object") {
    throw new TypeError("Pedido da Loja Integrada invalido.");
  }
  const numero = textoOuNulo(pedido.numero);
  const id = idDeRecursoLojaIntegrada(pedido.resource_uri) ?? numero;
  if (!id) throw new TypeError("Pedido da Loja Integrada sem identificador.");

  const cliente =
    pedido.cliente && typeof pedido.cliente === "object"
      ? normalizarClienteLojaIntegrada(pedido.cliente)
      : {
          provedor: "LOJA_INTEGRADA",
          idExterno: idDeRecursoLojaIntegrada(pedido.cliente),
        };
  const envio = Array.isArray(pedido.envios) ? pedido.envios[0] : null;

  return {
    provedor: "LOJA_INTEGRADA",
    idExterno: id,
    numero,
    cliente,
    itens: (Array.isArray(pedido.itens) ? pedido.itens : []).map((item) => ({
      idExterno: textoOuNulo(item.id),
      idProdutoExterno:
        textoOuNulo(item.produto?.id_externo) ??
        idDeRecursoLojaIntegrada(item.produto?.resource_uri ?? item.produto),
      idProdutoPaiExterno: idDeRecursoLojaIntegrada(item.produto_pai),
      sku: textoOuNulo(item.sku),
      nome: textoOuNulo(item.nome),
      quantidade: numeroOuNulo(item.quantidade),
      precoUnitario: numeroOuNulo(item.preco_venda),
      precoCheio: numeroOuNulo(item.preco_cheio),
      precoPromocional: numeroOuNulo(item.preco_promocional),
      subtotal: numeroOuNulo(item.preco_subtotal),
    })),
    valores: {
      subtotal: numeroOuNulo(pedido.valor_subtotal),
      frete: numeroOuNulo(pedido.valor_envio),
      desconto: numeroOuNulo(pedido.valor_desconto),
      total: numeroOuNulo(pedido.valor_total),
    },
    pagamento: (Array.isArray(pedido.pagamentos) ? pedido.pagamentos : []).map(
      (pagamento) => ({
        idExterno: textoOuNulo(pagamento.id),
        forma: textoOuNulo(pagamento.forma_pagamento?.nome),
        tipo: textoOuNulo(pagamento.pagamento_tipo),
        valor: numeroOuNulo(pagamento.valor),
        valorPago: numeroOuNulo(pagamento.valor_pago),
        parcelas: numeroOuNulo(pagamento.parcelamento?.numero_parcelas),
      }),
    ),
    envio: envio
      ? {
          idExterno: textoOuNulo(envio.id),
          forma: textoOuNulo(envio.forma_envio?.nome),
          codigo: textoOuNulo(envio.forma_envio?.code),
          rastreamento: textoOuNulo(envio.objeto),
          prazoDias: numeroOuNulo(envio.prazo),
          valor: numeroOuNulo(envio.valor),
        }
      : null,
    status: textoOuNulo(pedido.situacao?.codigo),
    statusNome: textoOuNulo(pedido.situacao?.nome),
    criadoEm: dataIsoOuNulo(pedido.data_criacao),
    atualizadoEm: dataIsoOuNulo(pedido.data_modificacao),
  };
}
