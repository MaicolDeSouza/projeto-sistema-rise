/**
 * Bling FALSO para os testes da sincronizacao Rise <-> Bling (plano de 04/10/2026).
 *
 * Nao e um servidor: e um objeto em memoria com o mesmo contrato do `clienteBling()`
 * (`get`, `post`, `put`, `patch`, `exigirEscrita`), porque as funcoes de sincronizacao
 * recebem o cliente por parametro. Testa a mesma logica sem porta, sem processo, sem
 * rede e sem banco. Por isso este arquivo NAO importa nada de `src/`.
 *
 * Responde, no formato do `requisitar` (`{ ok, status, duracaoMs, dados }`), aos endpoints
 * que a sincronizacao usa, com os formatos medidos em
 * `docs/superpowers/specs/2026-10-04-sincronizacao-bling-investigacao.md`:
 *
 *   GET   /produtos?codigos[]=         (so ativos; "codigo=" NAO e suportado, Emenda 8)
 *   GET   /produtos/{id}               PATCH /produtos/{id}        POST /produtos
 *   GET   /produtos/fornecedores?idProduto=   POST/PUT /produtos/fornecedores[/{id}]
 *   GET   /contatos?numeroDocumento= | ?pesquisa= | ?idTipoContato=   GET /contatos/{id}
 *   GET   /contatos/tipos              POST /contatos              PUT /contatos/{id}
 *   GET   /depositos
 *   GET   /estoques/saldos?codigos[]= | ?idsProdutos[]=             POST /estoques
 *
 * Id inexistente: `GET /produtos/{id}` da 404 `RESOURCE_NOT_FOUND` (medido no Bling real em
 * 04/10/2026), enquanto `GET /estoques/saldos?idsProdutos[]=` da 200 com `data: []`.
 *
 * Endpoint que ele nao conhece LANCA um erro ("nao suportado"): e erro do teste ou do
 * falso, e esconder isso atras de um 404 faria o teste passar sem provar nada.
 */

// Deposito da conta real: "Fisico" (padrao) e "Virtual" (nao entra no saldo total).
const DEPOSITOS_PADRAO = [
  { id: 14200000001, descricao: "Fisico", situacao: 1, padrao: true, desconsiderarSaldo: false },
  { id: 14200000002, descricao: "Virtual", situacao: 1, padrao: false, desconsiderarSaldo: true },
];

// Os 7 tipos de contato da conta real. Os ids sao da conta, nao universais: quem usa tem que
// le-los de GET /contatos/tipos (ou de `idDoTipoDeContato`), nunca fixar.
const TIPOS_DE_CONTATO_PADRAO = ["Cliente", "Desenvolvedor", "Fornecedor", "Padrao", "Tecnico", "Transportador", "Vendedor"].map(
  (descricao, indice) => ({ id: 14100000001 + indice, descricao }),
);

// Medido: 6.012 caracteres de URL passam e 9.012 dao 414. O falso corta no meio desse intervalo.
const LIMITE_DA_URL = 8000;

// O Bling ignora estes campos no corpo de produto (somente-leitura na documentacao).
const SOMENTE_LEITURA_DO_PRODUTO = new Set(["id", "imagemURL", "fornecedor"]);

// Chaves de um produto na LISTAGEM (GET /produtos), na ordem em que o Bling as devolve.
const CHAVES_DA_LISTAGEM = ["id", "nome", "codigo", "preco", "precoCusto", "estoque", "tipo", "situacao", "formato", "descricaoCurta", "imagemURL"];

function copia(valor) {
  return valor === undefined ? undefined : structuredClone(valor);
}

const minusculo = (texto) => String(texto ?? "").toLowerCase();

/// Sem caixa e sem acento, como a busca por nome do Bling (collation sem acento).
function paraBusca(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // marcas de acento separadas pelo NFD
    .toLowerCase();
}

function resposta(status, dados) {
  return { ok: status >= 200 && status < 300, status, duracaoMs: 0, dados };
}

/// Erro no formato do Bling: { error: { type, message, description, fields[] } }.
function erro(status, tipo, descricao, campos = []) {
  return resposta(status, {
    error: {
      type: tipo,
      message: descricao,
      description: descricao,
      fields: campos.map((campo) => ({ code: 1, msg: "Campo obrigatorio ou invalido", element: campo, namespace: "falso", collection: [] })),
    },
  });
}

const validacao = (descricao, campos) => erro(400, "VALIDATION_ERROR", descricao, campos);

/**
 * O 404 como o Bling real o devolve. Medido em 04/10/2026 com UM `GET /produtos/{id}` de id que
 * nao existe (Step 0 da Tarefa 7, so leitura): status 404 e este corpo, sem `fields` e com a
 * `message` curta diferente da `description`. So esse endpoint foi lido; o falso usa o mesmo corpo
 * nos outros 404 (PATCH, vinculo, contato), que e o que o gateway do Bling devolve para id
 * inexistente, mas la nao esta medido.
 */
const naoEncontrado = () =>
  resposta(404, {
    error: {
      type: "RESOURCE_NOT_FOUND",
      message: "Não encontrado.",
      description:
        "O recurso requisitado não foi encontrado. Verifique se o endpoint solicitado está correto ou se o ID informado realmente existe no sistema.",
    },
  });

function ausente(valor) {
  return valor === undefined || valor === null || valor === "";
}

/// "/estoques/saldos?codigos[]=a" -> { rota, consulta: { "codigos[]": ["a"] } }. O `[]` pode
/// vir escapado (%5B%5D), como o cliente real o manda.
function separarCaminho(caminho) {
  const texto = String(caminho);
  const indice = texto.indexOf("?");
  const rota = indice === -1 ? texto : texto.slice(0, indice);
  const consulta = {};
  if (indice !== -1) {
    for (const [chave, valor] of new URLSearchParams(texto.slice(indice + 1))) {
      (consulta[chave] ??= []).push(valor);
    }
  }
  return { rota, consulta };
}

/// Soma os `params` a consulta, com a mesma regra do cliente real: lista repete a chave e
/// valor vazio (vazio, null, undefined) nao vai.
function juntarParams(consulta, params) {
  for (const [chave, valor] of Object.entries(params ?? {})) {
    for (const item of Array.isArray(valor) ? valor : [valor]) {
      if (!ausente(item)) (consulta[chave] ??= []).push(String(item));
    }
  }
  return consulta;
}

/**
 * A consulta de uma chamada GET registrada, juntando a que veio no caminho com a que veio
 * em `params` (que o registro guarda em `corpo`): `{ chave: [valores em texto] }`. Serve para
 * o teste contar, por exemplo, quantos codigos foram num lote, venha o `codigos[]` do jeito
 * que vier.
 */
export function consultaDaChamada(chamada) {
  return juntarParams(separarCaminho(chamada.caminho).consulta, chamada.corpo);
}

/// O tamanho da URL como o cliente real a monta (caminho + consulta escapada).
function tamanhoDaUrl(rota, consulta) {
  const partes = [];
  for (const [chave, valores] of Object.entries(consulta)) {
    for (const valor of valores) partes.push(`${encodeURIComponent(chave)}=${encodeURIComponent(valor)}`);
  }
  return rota.length + (partes.length ? 1 + partes.join("&").length : 0);
}

/**
 * @param {object} [opcoes]
 * @param {object[]} [opcoes.produtos] produtos no formato do Bling (`id`, `codigo`, `nome`,
 *   `preco`, `situacao`, grupos...). Sem `id`, o falso gera um. `situacao` "A", `tipo` "P" e
 *   `formato` "S" sao o padrao. O saldo inicial vem de `saldos` ou de `estoque.saldoVirtualTotal`.
 * @param {object[]} [opcoes.contatos] contatos (`id`, `nome`, `numeroDocumento`, `tiposContato`
 *   como `[{descricao}]` ou `[{id, descricao}]`: o id e resolvido pela descricao).
 * @param {{id: number, descricao: string}[]} [opcoes.tiposDeContato] padrao: os 7 da conta real.
 * @param {object[]} [opcoes.depositos] padrao: "Fisico" (padrao) e "Virtual".
 * @param {object} [opcoes.saldos] por CODIGO do produto: um numero (virtual = fisico) ou
 *   `{ virtual, fisico }`.
 * @param {object[]} [opcoes.vinculos] vinculos produto-fornecedor ja existentes, no formato
 *   de `GET /produtos/fornecedores`.
 * @param {object[]} [opcoes.falhas] `{ metodo, caminho, status, mensagem, depois?, vezes? }`:
 *   a chamada do `metodo` cujo caminho COMECA por `caminho` devolve
 *   `{ ok: false, status, dados: { error: { description: mensagem } } }` e nao muda nada.
 *   `depois` = quantas chamadas correspondentes passam antes (padrao 0); `vezes` = quantas
 *   falham (padrao: todas).
 * @param {string[]} [opcoes.codigosLiberados] se preenchida, `exigirEscrita` recusa os codigos
 *   fora dela (a segunda trava do cliente real). Padrao: aceita todos.
 * @param {boolean} [opcoes.exigirEscritaObrigatorio] padrao `true`: `post`, `put` e `patch` LANCAM
 *   erro de teste se `exigirEscrita` nao foi chamada (e aceita) antes nesta instancia. `false` so
 *   para os testes que exercitam os endpoints do proprio falso sem ter um sku a pedir.
 */
export function criarBlingFalso(opcoes = {}) {
  const chamadas = [];
  const escritasExigidas = [];

  const tiposDeContato = copia(opcoes.tiposDeContato ?? TIPOS_DE_CONTATO_PADRAO);
  const depositos = copia(opcoes.depositos ?? DEPOSITOS_PADRAO);
  const codigosLiberados = (opcoes.codigosLiberados ?? []).map((codigo) => minusculo(codigo).trim());
  const exigirEscritaObrigatorio = opcoes.exigirEscritaObrigatorio ?? true;
  let escritaLiberada = false; // vira true na primeira exigirEscrita aceita desta instancia

  const produtos = new Map(); // id -> produto como o Bling o guarda (sem o saldo)
  const saldos = new Map(); // id do produto -> { virtual, fisico }
  const contatos = new Map();
  const vinculos = new Map();
  const vinculosDeLoja = new Map(); // /produtos/lojas: produto x canal de venda
  const lancamentos = [];

  // Ids com o tamanho dos reais (10 a 11 digitos): pegaria um erro de coluna de 32 bits.
  const contadores = { produto: 15000000001, contato: 16000000001, vinculo: 17000000001, lancamento: 18000000001 };
  function novoId(tipo, existe) {
    let id = contadores[tipo]++;
    while (existe(id)) id = contadores[tipo]++;
    return id;
  }

  // ---------------------------------------------------------------------------
  // Carga inicial
  // ---------------------------------------------------------------------------

  function saldoDe(valor) {
    if (typeof valor === "number") return { virtual: valor, fisico: valor };
    if (valor && typeof valor === "object") {
      const virtual = Number(valor.virtual ?? valor.fisico ?? 0);
      return { virtual, fisico: Number(valor.fisico ?? virtual) };
    }
    return { virtual: 0, fisico: 0 };
  }

  /// Aplica um corpo de produto: cada campo informado SUBSTITUI o valor, e isso vale para um
  /// grupo inteiro (`dimensoes`, `estoque`, `tributacao`...): o grupo informado troca o que
  /// havia, os subcampos que nao vieram somem. E o que se espera do Bling real, mas isso NAO
  /// esta confirmado na documentacao (so o teste real da Tarefa 12, num produto de teste, diz):
  /// o falso assume o pior caso para quem envia so parte de um grupo.
  function aplicarCampos(produto, corpo, { ignorarSomenteLeitura = true } = {}) {
    if (!corpo || typeof corpo !== "object") return;
    for (const [chave, valor] of Object.entries(corpo)) {
      if (ignorarSomenteLeitura && SOMENTE_LEITURA_DO_PRODUTO.has(chave)) continue;
      const novo = copia(valor);
      // O saldo e somente-leitura: so POST /estoques o muda.
      if (chave === "estoque" && novo && typeof novo === "object") delete novo.saldoVirtualTotal;
      produto[chave] = novo;
    }
  }

  /// `saldoInicial` e o que o Bling "ja tinha": a carga inicial usa `opcoes.saldos` (ou o
  /// `estoque.saldoVirtualTotal` do produto); um produto criado por POST nasce com 0.
  function guardarProduto(dados, saldoInicial, opcoesDeCampos) {
    const produto = { tipo: "P", situacao: "A", formato: "S" };
    const id = dados.id ?? novoId("produto", (candidato) => produtos.has(candidato));
    aplicarCampos(produto, dados, opcoesDeCampos);
    produto.id = id;
    produtos.set(id, produto);
    saldos.set(id, saldoDe(saldoInicial));
    return produto;
  }

  function normalizarTiposDoContato(tipos) {
    return (tipos ?? []).map((tipo) => {
      const achado = tipo.id !== undefined
        ? tiposDeContato.find((candidato) => candidato.id === tipo.id)
        : tiposDeContato.find((candidato) => candidato.descricao === tipo.descricao);
      if (!achado) throw new Error(`Bling falso: tipo de contato desconhecido (${JSON.stringify(tipo)})`);
      return { id: achado.id, descricao: achado.descricao };
    });
  }

  function guardarContato(dados) {
    const id = dados.id ?? novoId("contato", (candidato) => contatos.has(candidato));
    const contato = {
      codigo: "",
      situacao: "A",
      numeroDocumento: "",
      telefone: "",
      celular: "",
      fantasia: "",
      tipo: "J",
      email: "",
      ...copia(dados),
      id,
      tiposContato: normalizarTiposDoContato(dados.tiposContato),
    };
    contatos.set(id, contato);
    return contato;
  }

  function guardarVinculo(dados, id) {
    const vinculo = {
      id: id ?? dados.id ?? novoId("vinculo", (candidato) => vinculos.has(candidato)),
      descricao: dados.descricao ?? "",
      codigo: dados.codigo ?? "",
      precoCusto: dados.precoCusto ?? 0,
      precoCompra: dados.precoCompra ?? 0,
      padrao: dados.padrao ?? false,
      produto: { id: Number(dados.produto.id) },
      fornecedor: { id: Number(dados.fornecedor.id) },
    };
    vinculos.set(vinculo.id, vinculo);
    return vinculo;
  }

  function guardarVinculoDeLoja(dados) {
    const vinculo = {
      id: dados.id ?? novoId("vinculo", (candidato) => vinculosDeLoja.has(candidato) || vinculos.has(candidato)),
      codigo: String(dados.codigo ?? ""),
      preco: Number(dados.preco ?? 0),
      precoPromocional: Number(dados.precoPromocional ?? 0),
      produto: { id: Number(dados.produto.id) },
      loja: { id: Number(dados.loja.id) },
    };
    vinculosDeLoja.set(vinculo.id, vinculo);
    return vinculo;
  }

  // A carga inicial e o que o Bling ja tem, entao guarda tambem o que o PATCH ignoraria
  // (fornecedor, imagemURL).
  for (const dados of opcoes.produtos ?? []) {
    guardarProduto(dados, opcoes.saldos?.[dados.codigo] ?? dados.estoque?.saldoVirtualTotal, { ignorarSomenteLeitura: false });
  }
  for (const dados of opcoes.contatos ?? []) guardarContato(dados);
  for (const dados of opcoes.vinculos ?? []) guardarVinculo(dados);
  for (const dados of opcoes.vinculosDeLoja ?? []) guardarVinculoDeLoja(dados);

  // ---------------------------------------------------------------------------
  // Formatos de resposta
  // ---------------------------------------------------------------------------

  /// O produto como GET /produtos/{id} o devolve: o saldo vem junto, em estoque.saldoVirtualTotal.
  function produtoCompleto(produto) {
    const saida = copia(produto);
    saida.estoque = { ...(saida.estoque ?? {}), saldoVirtualTotal: saldos.get(produto.id).virtual };
    return saida;
  }

  /// O produto como GET /produtos (listagem) o devolve: so as chaves da listagem.
  function produtoDaListagem(produto) {
    const cheio = produtoCompleto(produto);
    const saida = {};
    for (const chave of CHAVES_DA_LISTAGEM) {
      if (chave === "estoque") saida.estoque = { saldoVirtualTotal: cheio.estoque.saldoVirtualTotal };
      else if (cheio[chave] !== undefined) saida[chave] = cheio[chave];
    }
    return saida;
  }

  const contatoDaListagem = (contato) => ({
    id: contato.id,
    nome: contato.nome,
    codigo: contato.codigo,
    situacao: contato.situacao,
    numeroDocumento: contato.numeroDocumento,
    telefone: contato.telefone,
    celular: contato.celular,
  });

  const acharProduto = (idOuCodigo) =>
    typeof idOuCodigo === "number"
      ? produtos.get(idOuCodigo)
      : [...produtos.values()].find((produto) => minusculo(produto.codigo) === minusculo(idOuCodigo));

  // Medido no Bling real (05/10/2026): `codigos[]` sem `criterio` so devolve ATIVOS; com `criterio=3`,
  // so INATIVOS (um codigo ativo ou inexistente volta vazio).
  const porCodigo = (codigos, situacao) => {
    const procurados = new Set(codigos.map(minusculo));
    return [...produtos.values()].filter((produto) => produto.situacao === situacao && procurados.has(minusculo(produto.codigo)));
  };
  const ativosPorCodigo = (codigos) => porCodigo(codigos, "A");

  // ---------------------------------------------------------------------------
  // Endpoints
  // ---------------------------------------------------------------------------

  function faltando(corpo, campos) {
    return campos.filter((campo) => ausente(corpo?.[campo]));
  }

  const rotas = [
    // ---- Produtos ----
    [
      "GET",
      /^\/produtos$/,
      (_partes, { consulta }) => {
        const codigos = consulta["codigos[]"];
        if (!codigos) {
          throw new Error(
            "Bling falso: GET /produtos so e suportado com codigos[]= (Emenda 8; nem `codigo=`, que nao esta documentado, nem a listagem do catalogo).",
          );
        }
        const situacao = consulta.criterio?.[0] === "3" ? "I" : "A";
        return resposta(200, { data: porCodigo(codigos, situacao).map(produtoDaListagem) });
      },
    ],
    [
      "GET",
      /^\/produtos\/(\d+)$/,
      ([, id]) => {
        const produto = produtos.get(Number(id));
        // Medido no Bling real: id que nao existe da 404. O `data: []` (200) e o formato de
        // /estoques/saldos?idsProdutos[]=, nao deste endpoint.
        return produto ? resposta(200, { data: produtoCompleto(produto) }) : naoEncontrado();
      },
    ],
    [
      "PATCH",
      /^\/produtos\/(\d+)$/,
      ([, id], { corpo }) => {
        const produto = produtos.get(Number(id));
        if (!produto) return naoEncontrado();
        aplicarCampos(produto, corpo);
        // O Bling responde 200 sem corpo; o requisitar entrega `dados: null` nesse caso.
        return resposta(200, null);
      },
    ],
    [
      "POST",
      /^\/produtos$/,
      (_partes, { corpo }) => {
        const campos = faltando(corpo, ["nome", "tipo", "situacao", "formato"]);
        if (campos.length) return validacao("Campos obrigatorios do produto nao informados.", campos);
        // O corpo nao traz o id (e o Bling quem o da) nem o saldo (somente-leitura).
        const semId = { ...corpo };
        delete semId.id;
        const produto = guardarProduto(semId, undefined);
        return resposta(201, { data: { id: produto.id, variations: { deleted: [], updated: [], saved: [] }, warnings: [] } });
      },
    ],

    // ---- Vinculo produto x loja (canal de venda) ----
    // Formato medido no Bling real em 03/10/2026 (investigacao B1): um registro por loja, com o
    // `codigo` do produto NO CANAL (o MLB no Mercado Livre).
    [
      "GET",
      /^\/produtos\/lojas$/,
      (_partes, { consulta }) => {
        const idProduto = consulta.idProduto?.[0];
        const lista = [...vinculosDeLoja.values()].filter((vinculo) => ausente(idProduto) || vinculo.produto.id === Number(idProduto));
        return resposta(200, { data: copia(lista) });
      },
    ],
    [
      "POST",
      /^\/produtos\/lojas$/,
      (_partes, { corpo }) => {
        if (ausente(corpo?.produto?.id) || ausente(corpo?.loja?.id) || ausente(corpo?.codigo)) {
          return validacao("codigo, produto.id e loja.id sao obrigatorios.", ["codigo", "produto.id", "loja.id"].filter((campo) => ausente(campo.split(".").reduce((valor, chave) => valor?.[chave], corpo))));
        }
        if (!produtos.has(Number(corpo.produto.id))) return validacao("O produto informado nao existe.", ["produto.id"]);
        return resposta(201, { data: { id: guardarVinculoDeLoja(corpo).id } });
      },
    ],

    // ---- Fornecedores do produto ----
    [
      "GET",
      /^\/produtos\/fornecedores$/,
      (_partes, { consulta }) => {
        const idProduto = consulta.idProduto?.[0];
        const lista = [...vinculos.values()].filter((vinculo) => ausente(idProduto) || vinculo.produto.id === Number(idProduto));
        return resposta(200, { data: copia(lista) });
      },
    ],
    [
      "POST",
      /^\/produtos\/fornecedores$/,
      (_partes, { corpo }) => {
        if (ausente(corpo?.produto?.id) || ausente(corpo?.fornecedor?.id)) {
          return validacao("produto.id e fornecedor.id sao obrigatorios.", [
            ...(ausente(corpo?.produto?.id) ? ["produto.id"] : []),
            ...(ausente(corpo?.fornecedor?.id) ? ["fornecedor.id"] : []),
          ]);
        }
        if (!produtos.has(Number(corpo.produto.id))) return validacao("O produto informado nao existe.", ["produto.id"]);
        if (!contatos.has(Number(corpo.fornecedor.id))) return validacao("O fornecedor (contato) informado nao existe.", ["fornecedor.id"]);
        return resposta(201, { data: { id: guardarVinculo(corpo).id } });
      },
    ],
    [
      "PUT",
      /^\/produtos\/fornecedores\/(\d+)$/,
      ([, id], { corpo }) => {
        const atual = vinculos.get(Number(id));
        if (!atual) return naoEncontrado();
        if (ausente(corpo?.produto?.id)) return validacao("produto.id e obrigatorio.", ["produto.id"]);
        // Os campos informados trocam; o que nao veio fica (o que o PUT faz com o omitido nao esta
        // documentado, e a sincronizacao sempre manda o vinculo inteiro).
        guardarVinculo({ ...atual, ...corpo, produto: { ...atual.produto, ...corpo.produto }, fornecedor: { ...atual.fornecedor, ...corpo.fornecedor } }, atual.id);
        return resposta(200, null);
      },
    ],

    // ---- Contatos ----
    [
      "GET",
      /^\/contatos$/,
      (_partes, { consulta }) => {
        const documento = consulta.numeroDocumento?.[0];
        const pesquisa = consulta.pesquisa?.[0];
        const tipo = consulta.idTipoContato?.[0];
        const lista = [...contatos.values()].filter((contato) => {
          // O Bling guarda e compara so os 14 digitos: com a pontuacao do CNPJ nao acha.
          if (!ausente(documento) && contato.numeroDocumento !== documento) return false;
          if (!ausente(tipo) && !contato.tiposContato.some((t) => t.id === Number(tipo))) return false;
          if (!ausente(pesquisa)) {
            const procurado = paraBusca(pesquisa);
            const campos = [contato.nome, contato.fantasia, contato.numeroDocumento, contato.email, contato.codigo];
            if (!campos.some((campo) => paraBusca(campo).includes(procurado))) return false;
          }
          return true;
        });
        return resposta(200, { data: lista.map(contatoDaListagem) });
      },
    ],
    ["GET", /^\/contatos\/tipos$/, () => resposta(200, { data: copia(tiposDeContato) })],
    [
      "GET",
      /^\/contatos\/(\d+)$/,
      ([, id]) => {
        const contato = contatos.get(Number(id));
        return contato ? resposta(200, { data: copia(contato) }) : naoEncontrado();
      },
    ],
    [
      "POST",
      /^\/contatos$/,
      (_partes, { corpo }) => {
        const campos = faltando(corpo, ["nome", "situacao", "tipo"]);
        if (campos.length) return validacao("Campos obrigatorios do contato nao informados.", campos);
        // O id do tipo e da conta: um id que ela nao tem e recusado (e prova que ninguem o fixou).
        const desconhecido = (corpo.tiposContato ?? []).find((tipo) => !tiposDeContato.some((t) => t.id === tipo.id));
        if (desconhecido) return validacao("Tipo de contato invalido.", ["tiposContato"]);
        return resposta(201, { data: { id: guardarContato({ ...corpo, id: undefined }).id } });
      },
    ],
    [
      "PUT",
      /^\/contatos\/(\d+)$/,
      ([, id], { corpo }) => {
        const atual = contatos.get(Number(id));
        if (!atual) return naoEncontrado();
        guardarContato({ ...atual, ...corpo, id: atual.id, tiposContato: corpo?.tiposContato ?? atual.tiposContato });
        return resposta(200, null);
      },
    ],

    // ---- Depositos ----
    ["GET", /^\/depositos$/, () => resposta(200, { data: copia(depositos) })],

    // ---- Estoque ----
    [
      "GET",
      /^\/estoques\/saldos$/,
      (_partes, { consulta }) => {
        const codigos = consulta["codigos[]"];
        const ids = consulta["idsProdutos[]"];
        if (!codigos && !ids) return validacao("nenhum produto foi informado", ["idsProdutos"]);

        const achados = new Map();
        // idsProdutos[] resolve o inativo tambem e ignora o id que nao existe.
        for (const id of ids ?? []) {
          const produto = produtos.get(Number(id));
          if (produto) achados.set(produto.id, produto);
        }
        // codigos[] so resolve produto ativo e ignora o codigo que nao existe.
        for (const produto of codigos ? ativosPorCodigo(codigos) : []) achados.set(produto.id, produto);

        // Medido: pedido por codigos[] em que NENHUM resolve da 400, e nao lista vazia.
        if (!ids && achados.size === 0) return validacao("nenhum produto foi informado", ["codigos"]);

        const padrao = depositos.find((deposito) => deposito.padrao) ?? depositos[0];
        const data = [...achados.values()].map((produto) => {
          const saldo = saldos.get(produto.id);
          return {
            produto: { id: produto.id, codigo: produto.codigo },
            saldoFisicoTotal: saldo.fisico,
            saldoVirtualTotal: saldo.virtual,
            depositos: padrao ? [{ id: padrao.id, saldoFisico: saldo.fisico, saldoVirtual: saldo.virtual }] : [],
          };
        });
        return resposta(200, { data });
      },
    ],
    [
      "POST",
      /^\/estoques$/,
      (_partes, { corpo }) => {
        const produto = produtos.get(Number(corpo?.produto?.id));
        if (!produto) return validacao("O produto informado nao existe.", ["produto.id"]);
        if (!depositos.some((deposito) => deposito.id === Number(corpo?.deposito?.id))) return validacao("O deposito informado nao existe.", ["deposito.id"]);
        if (!["B", "E", "S"].includes(corpo?.operacao)) return validacao("operacao tem que ser B (balanco), E (entrada) ou S (saida).", ["operacao"]);
        const quantidade = typeof corpo?.quantidade === "number" ? corpo.quantidade : Number.NaN;
        if (!Number.isFinite(quantidade) || quantidade < 0) return validacao("quantidade tem que ser um numero maior ou igual a zero.", ["quantidade"]);

        // Entrada soma e saida tira, nos DOIS saldos do mesmo tanto. O balanco (B) define o saldo
        // FISICO do deposito, e o virtual fica em `contagem - reservas` (investigacao da Tarefa 1,
        // §4.3 e B5: "um balanco de 12 deixa o fisico em 12 e o virtual em 12 - reservas").
        // As reservas (fisico - virtual) sao constantes: so o Bling real as muda, por pedido. Por
        // isso o virtual pode ficar negativo, e um balanco 5 num produto com fisico 0 e virtual -8
        // da fisico 5 e virtual -3, nao virtual 5.
        const saldo = saldos.get(produto.id);
        const delta = corpo.operacao === "E" ? quantidade : corpo.operacao === "S" ? -quantidade : quantidade - saldo.fisico;
        saldo.virtual += delta;
        saldo.fisico += delta;

        const lancamento = { ...copia(corpo), id: novoId("lancamento", () => false) };
        lancamentos.push(lancamento);
        return resposta(201, { data: { id: lancamento.id } });
      },
    ],
  ];

  // ---------------------------------------------------------------------------
  // Falhas simuladas e despacho
  // ---------------------------------------------------------------------------

  const falhas = (opcoes.falhas ?? []).map((falha) => ({
    metodo: String(falha.metodo).toUpperCase(),
    caminho: falha.caminho,
    status: falha.status ?? 400,
    mensagem: falha.mensagem ?? "Falha simulada pelo Bling falso.",
    depois: falha.depois ?? 0,
    vezes: falha.vezes ?? Number.POSITIVE_INFINITY,
    vistas: 0,
    disparadas: 0,
  }));

  function falhaDaChamada(metodo, rota) {
    for (const falha of falhas) {
      if (falha.metodo !== metodo || !rota.startsWith(falha.caminho)) continue;
      falha.vistas++;
      if (falha.vistas <= falha.depois || falha.disparadas >= falha.vezes) continue;
      falha.disparadas++;
      return falha;
    }
    return null;
  }

  async function despachar(metodo, caminho, segundo) {
    const { rota, consulta: daRota } = separarCaminho(caminho);

    // A segunda trava (a lista de codigos liberados) so vale se quem escreve chamar
    // `cliente.exigirEscrita(sku)` ANTES. O cliente real nao tem como saber se o chamador esqueceu,
    // entao o falso cobra: escrever sem ter pedido a trava e erro do teste, e nao entra em
    // `chamadas` (nao aconteceu). Leitura nao precisa.
    if (metodo !== "GET" && exigirEscritaObrigatorio && !escritaLiberada) {
      throw new Error(
        `Bling falso: ${metodo} ${rota} sem exigirEscrita(codigo) antes. A sincronizacao tem que chamar ` +
          "cliente.exigirEscrita(sku) antes de toda escrita (e a segunda trava, a lista de codigos liberados, " +
          "que so vale assim). Nos testes dos endpoints do proprio falso, chame falso.exigirEscrita(\"<codigo>\") " +
          "antes ou crie o falso com exigirEscritaObrigatorio: false.",
      );
    }

    // Registra antes de tudo, inclusive a que vai falhar: foi tentada.
    chamadas.push({ metodo, caminho, corpo: copia(segundo) });

    const falha = falhaDaChamada(metodo, rota);
    if (falha) return resposta(falha.status, { error: { description: falha.mensagem } });

    const consulta = metodo === "GET" ? juntarParams(daRota, segundo) : daRota;
    const corpo = metodo === "GET" ? undefined : copia(segundo);

    if (metodo === "GET" && tamanhoDaUrl(rota, consulta) > LIMITE_DA_URL) {
      return resposta(414, { textoBruto: "414 Request-URI Too Large" });
    }

    for (const [verbo, padrao, tratar] of rotas) {
      if (verbo !== metodo) continue;
      const partes = rota.match(padrao);
      if (partes) return tratar(partes, { consulta, corpo });
    }
    throw new Error(`Bling falso: ${metodo} ${rota} nao suportado.`);
  }

  return {
    get: (caminho, params) => despachar("GET", caminho, params),
    post: (caminho, corpo) => despachar("POST", caminho, corpo),
    put: (caminho, corpo) => despachar("PUT", caminho, corpo),
    patch: (caminho, corpo) => despachar("PATCH", caminho, corpo),

    /// Como o cliente real com as travas liberadas, nao devolve nada: o falso nunca fala com o
    /// Bling. Com `codigosLiberados`, recusa o que nao esta na lista (para testar "recusa antes de
    /// qualquer chamada"). Aceito, libera as escritas deste falso e entra em `chamadas` como
    /// `{ metodo: "exigirEscrita", caminho: codigo }`, para o teste afirmar que veio ANTES do
    /// primeiro patch, post ou put. Recusado, NAO libera e NAO entra em `chamadas` (o que a
    /// Tarefa 8 afirma, `chamadas.length === 0`); toda tentativa fica em `escritasExigidas`.
    exigirEscrita(codigo) {
      escritasExigidas.push(codigo);
      if (codigosLiberados.length && !codigosLiberados.includes(minusculo(codigo).trim())) {
        throw new Error(`Escrita bloqueada: o codigo ${codigo} nao esta na lista de codigos liberados (Bling falso).`);
      }
      escritaLiberada = true;
      chamadas.push({ metodo: "exigirEscrita", caminho: codigo, corpo: undefined });
    },

    /// [{ metodo, caminho, corpo }] na ordem. Para GET, `corpo` guarda os `params`.
    chamadas,
    /// Todo codigo que chegou a exigirEscrita, aceito ou recusado.
    escritasExigidas,
    consulta: consultaDaChamada,

    /// Para o teste conferir o que ficou guardado, sem passar por uma chamada (e sem entrar
    /// em `chamadas`).
    idDoTipoDeContato(descricao) {
      const tipo = tiposDeContato.find((candidato) => candidato.descricao === descricao);
      if (!tipo) throw new Error(`Bling falso: nao ha tipo de contato "${descricao}".`);
      return tipo.id;
    },
    /// Numero = id do Bling; texto = codigo (SKU). O produto como o GET o devolveria, ou null.
    produto(idOuCodigo) {
      const produto = acharProduto(idOuCodigo);
      return produto ? produtoCompleto(produto) : null;
    },
    /// O saldo virtual do produto (id ou codigo), ou null se ele nao existe.
    saldo(idOuCodigo) {
      const produto = acharProduto(idOuCodigo);
      return produto ? saldos.get(produto.id).virtual : null;
    },
    estado: { produtos, contatos, vinculos, vinculosDeLoja, saldos, lancamentos, depositos, tiposDeContato },
  };
}
