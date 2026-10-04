import "dotenv/config";

/**
 * Investigacao de LEITURA da API do Bling para a sincronizacao Rise <-> Bling.
 *
 *   node scripts/investigar-bling-sync.js --codigo=<sku> [--cnpj=<14 digitos>]
 *   node scripts/investigar-bling-sync.js --criterios=-,1,2,3,4,5 [--contar]   (qual criterio traz ativos e inativos)
 *   node scripts/investigar-bling-sync.js --lotes=1,100,101,200                (quantos ids cabem em /estoques/saldos)
 *   node scripts/investigar-bling-sync.js --fornecedores                       (o CNPJ liga fornecedor do Rise e contato do Bling?)
 *   node scripts/investigar-bling-sync.js --porcodigo=100                      (da para pedir direto pelos SKUs do Rise?)
 *
 * So faz GET (`blingGet`): nunca importa `blingPost`/`blingPut`, entao nao passa pela
 * trava BLING_ESCRITA e nao altera nada no Bling. A conexao OAuth e a do banco.
 *
 * Privacidade: o que sai no terminal sao CHAVES e TIPOS dos valores (`string(14)`,
 * `number`, `array(2)`), nunca o conteudo. So aparece o valor de campos que nao sao
 * pessoais e que o relatorio precisa (unidade, situacao, formato, saldos...), listados
 * em `LIBERADOS`. Nome, CNPJ, telefone e e-mail de contato nunca saem daqui; o CNPJ
 * passado em --cnpj nem e repetido na tela.
 *
 * O limite de 3 chamadas por segundo ja e aplicado por `blingGet` (fila `limitar`),
 * entao os lacos abaixo nao precisam de espera propria.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { blingGet } = await import("../src/lib/integracoes/bling.js");
const { mascarar } = await import("../src/lib/integracoes/httpClient.js");
const { prisma } = await import("../src/lib/db.js");

/// Campos cujo valor pode ser mostrado em qualquer endpoint: sao codigos de
/// enumeracao e numeros de estoque, nunca dado de pessoa.
const LIBERADOS = new Set([
  "situacao",
  "tipo",
  "formato",
  "unidade",
  "unidadeMedida",
  "origem",
  "condicao",
  "tipoProducao",
  "tipoEstoque",
  "lancamentoEstoque",
  "spedTipoItem",
  "padrao",
  "tipoPessoa",
  "operacao",
  "criterio",
  "saldoFisico",
  "saldoVirtual",
  "saldoFisicoTotal",
  "saldoVirtualTotal",
]);

const MAXIMO_PAGINAS = 200;

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------

const argumentos = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((argumento) => argumento.startsWith("--"))
    .map((argumento) => {
      const [chave, ...resto] = argumento.slice(2).split("=");
      return [chave, resto.length ? resto.join("=") : true];
    }),
);

const codigo = typeof argumentos.codigo === "string" ? argumentos.codigo.trim() : "";
const cnpj = typeof argumentos.cnpj === "string" ? argumentos.cnpj.replace(/\D/g, "") : "";

const sondagem = Boolean(
  argumentos.criterios || argumentos.lotes || argumentos.fornecedores || argumentos.porcodigo,
);
if (!codigo && !sondagem) {
  console.error("Uso: node scripts/investigar-bling-sync.js --codigo=<sku> [--cnpj=<14 digitos>]");
  console.error("     ou --criterios=-,1,2,3,4,5 [--contar] | --lotes=1,100,101 | --fornecedores");
  process.exit(1);
}
if (argumentos.cnpj && cnpj.length !== 14) {
  console.error("--cnpj precisa de 14 digitos.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Forma de um valor: chaves e tipos, sem conteudo
// ---------------------------------------------------------------------------

/// Descreve o valor como arvore de formas. Matriz de objetos vira UMA forma que
/// junta as chaves de todos os elementos (chave que falta em algum vira "opcional").
function formaDe(valor, chave, liberar) {
  if (valor === null) return { tipo: "null" };

  if (Array.isArray(valor)) {
    return {
      tipo: "array",
      tamanhos: new Set([valor.length]),
      item: valor.map((item) => formaDe(item, chave, liberar)).reduce(unirFormas, null),
    };
  }

  if (typeof valor === "object") {
    return {
      tipo: "objeto",
      campos: Object.fromEntries(
        Object.entries(valor).map(([nome, filho]) => [nome, formaDe(filho, nome, liberar)]),
      ),
    };
  }

  const forma = { tipo: typeof valor };
  if (typeof valor === "string") forma.tamanhos = new Set([valor.length]);
  if (LIBERADOS.has(chave) || liberar.has(chave)) forma.valores = new Set([valor]);
  return forma;
}

function unirConjuntos(a, b) {
  if (!a && !b) return undefined;
  return new Set([...(a ?? []), ...(b ?? [])]);
}

function unirFormas(a, b) {
  if (!a) return b;
  if (!b) return a;

  if (a.tipo === "objeto" && b.tipo === "objeto") {
    const campos = {};
    for (const nome of new Set([...Object.keys(a.campos), ...Object.keys(b.campos)])) {
      const dos = [a.campos[nome], b.campos[nome]].filter(Boolean);
      campos[nome] = dos.reduce(unirFormas, null);
      if (dos.length < 2) campos[nome] = { ...campos[nome], opcional: true };
    }
    return { tipo: "objeto", campos };
  }

  if (a.tipo === b.tipo) {
    return {
      tipo: a.tipo,
      tamanhos: unirConjuntos(a.tamanhos, b.tamanhos),
      valores: unirConjuntos(a.valores, b.valores),
      item: a.item || b.item ? unirFormas(a.item ?? null, b.item ?? null) : undefined,
      opcional: a.opcional || b.opcional,
    };
  }

  return { tipo: `${a.tipo}|${b.tipo}`, opcional: a.opcional || b.opcional };
}

const intervalo = (conjunto) => {
  const numeros = [...conjunto].sort((x, y) => x - y);
  return numeros.length === 1 ? String(numeros[0]) : `${numeros[0]}..${numeros[numeros.length - 1]}`;
};

function descreverFolha(forma) {
  let texto = forma.tipo;
  if (forma.tamanhos) texto += `(${intervalo(forma.tamanhos)})`;
  if (forma.valores) texto += ` = ${[...forma.valores].map((v) => JSON.stringify(v)).join(" | ")}`;
  return texto;
}

function imprimirForma(forma, recuo = "  ", profundidade = 0) {
  if (!forma) return;
  if (profundidade > 7) {
    console.log(`${recuo}...`);
    return;
  }

  if (forma.tipo === "objeto") {
    for (const [nome, filho] of Object.entries(forma.campos)) {
      const sufixo = filho.opcional ? " (opcional)" : "";
      if (filho.tipo === "objeto") {
        console.log(`${recuo}${nome}: objeto${sufixo}`);
        imprimirForma(filho, `${recuo}  `, profundidade + 1);
      } else if (filho.tipo === "array") {
        console.log(`${recuo}${nome}: array(${intervalo(filho.tamanhos)})${sufixo}`);
        if (filho.item) imprimirItem(filho.item, recuo, profundidade);
      } else {
        console.log(`${recuo}${nome}: ${descreverFolha(filho)}${sufixo}`);
      }
    }
    return;
  }

  console.log(`${recuo}${descreverFolha(forma)}`);
}

function imprimirItem(item, recuo, profundidade) {
  if (item.tipo === "objeto") {
    console.log(`${recuo}  [item]`);
    imprimirForma(item, `${recuo}    `, profundidade + 2);
  } else if (item.tipo === "array") {
    console.log(`${recuo}  [item]: array(${intervalo(item.tamanhos)})`);
  } else {
    console.log(`${recuo}  [item]: ${descreverFolha(item)}`);
  }
}

// ---------------------------------------------------------------------------
// Chamada de leitura
// ---------------------------------------------------------------------------

/// Texto de erro do Bling (type/message/description): e mensagem da API, nao dado de pessoa.
function imprimirErro(dados) {
  const erro = dados?.error ?? dados;
  if (!erro || typeof erro !== "object") {
    console.log(`  erro: ${String(erro).slice(0, 300)}`);
    return;
  }
  for (const campo of ["type", "message", "description"]) {
    if (typeof erro[campo] === "string") {
      console.log(`  error.${campo}: ${mascarar(erro[campo]).slice(0, 300)}`);
    }
  }
  if (erro.fields !== undefined) {
    console.log("  error.fields:");
    imprimirForma(formaDe(erro.fields, "fields", new Set(["element", "msg"])), "    ");
  }
}

/// Faz o GET e devolve `dados` (ou null se falhar). Nunca lanca: uma falha de rede
/// numa secao nao pode derrubar as outras.
async function ler(titulo, caminho, params, liberar = []) {
  console.log(`\n=== ${titulo} ===`);
  try {
    const { ok, status, duracaoMs, dados } = await blingGet(caminho, params);
    console.log(`HTTP ${status} em ${duracaoMs} ms`);
    if (!ok) {
      imprimirErro(dados);
      return null;
    }
    const seguro = mascarar(dados);
    console.log("chaves e tipos:");
    imprimirForma(formaDe(seguro, "", new Set(liberar)));
    return seguro;
  } catch (erro) {
    console.log(`FALHA DE REDE: ${erro.message}`);
    return null;
  }
}

/// Como o relatorio precisa saber se a descricao do Bling e HTML (o PUT tem que
/// devolver HTML, e a do Rise vai escapada), descreve a ESTRUTURA do texto: quais
/// tags existem, se ha quebras de linha, o tamanho. Nunca o conteudo.
function perfilDoHtml(nome, texto) {
  if (typeof texto !== "string" || !texto) {
    console.log(`  ${nome}: vazio`);
    return;
  }
  const tags = {};
  for (const [, tag] of texto.matchAll(/<\/?([a-z][a-z0-9]*)/gi)) {
    const minuscula = tag.toLowerCase();
    tags[minuscula] = (tags[minuscula] ?? 0) + 1;
  }
  console.log(
    `  ${nome}: ${texto.length} caracteres; tags ${JSON.stringify(tags)}; ` +
      `\\r\\n=${(texto.match(/\r\n/g) ?? []).length} \\n=${(texto.match(/\n/g) ?? []).length}; ` +
      `entidades &...;=${(texto.match(/&[a-z#0-9]+;/gi) ?? []).length}`,
  );
}

/// As imagens do Bling sao links do S3 que expiram: so o host e o NOME dos
/// parametros (mais a validade), nunca o endereco inteiro.
function perfilDoLink(nome, link) {
  if (typeof link !== "string") return;
  try {
    const url = new URL(link);
    const validade = url.searchParams.get("X-Amz-Expires") ?? url.searchParams.get("Expires");
    console.log(
      `  ${nome}: host ${url.host}; parametros [${[...url.searchParams.keys()].join(", ")}]` +
        (validade ? `; validade ${validade}` : ""),
    );
  } catch {
    console.log(`  ${nome}: nao e URL (${link.length} caracteres)`);
  }
}

/// `idsProdutos[]` se repete, e o objeto `params` de `blingGet` usa `searchParams.set`,
/// que so guarda UM valor por chave. Por isso a consulta vai montada no proprio caminho.
const consultaComLista = (chave, valores) =>
  valores.map((valor) => `${encodeURIComponent(`${chave}[]`)}=${encodeURIComponent(valor)}`).join("&");

// ---------------------------------------------------------------------------
// Roteiro principal
// ---------------------------------------------------------------------------

async function investigarProduto() {
  console.log(`Produto investigado: codigo ${codigo}`);

  const listagem = await ler(
    `GET /produtos?codigo=${codigo}`,
    "/produtos",
    { codigo },
  );
  const encontrados = listagem?.data ?? [];
  console.log(`produtos com esse codigo: ${encontrados.length}`);
  if (encontrados.length !== 1) {
    console.log("Sem produto unico: as secoes seguintes dependem do id do Bling e foram puladas.");
    return null;
  }

  const id = encontrados[0].id;
  console.log(`id do Bling: ${id}`);

  const produto = await ler(`GET /produtos/${id}`, `/produtos/${id}`, undefined, ["codigo"]);
  const dados = produto?.data;
  if (dados) {
    console.log("\nperfil de campos de texto e imagens:");
    perfilDoHtml("descricaoCurta", dados.descricaoCurta);
    perfilDoHtml("descricaoComplementar", dados.descricaoComplementar);
    perfilDoHtml("observacoes", dados.observacoes);
    const imagens = dados.midia?.imagens ?? {};
    console.log(
      `  imagens: internas=${(imagens.internas ?? []).length} externas=${(imagens.externas ?? []).length} ` +
        `imagensURL=${(imagens.imagensURL ?? []).length}`,
    );
    perfilDoLink("internas[0].link", imagens.internas?.[0]?.link);
    perfilDoLink("externas[0].link", imagens.externas?.[0]?.link);
  }

  const fornecedores = await ler(
    `GET /produtos/fornecedores?idProduto=${id}`,
    "/produtos/fornecedores",
    { idProduto: id },
  );
  console.log(`vinculos de fornecedor no Bling: ${(fornecedores?.data ?? []).length}`);

  return { id, contatoId: dados?.fornecedor?.contato?.id ?? null };
}

async function investigarDepositos() {
  const depositos = await ler("GET /depositos", "/depositos", undefined, [
    "descricao",
    "desconsiderarSaldo",
  ]);
  const lista = depositos?.data ?? [];
  console.log(
    `depositos: ${lista.length}; marcados como padrao: ${lista.filter((d) => d.padrao === true).length}`,
  );
  // O nome do deposito e do negocio, nao de pessoa. O que importa aqui e QUAL deles e o padrao.
  for (const deposito of lista) {
    console.log(
      `  deposito "${deposito.descricao}": padrao=${deposito.padrao} desconsiderarSaldo=${deposito.desconsiderarSaldo} situacao=${deposito.situacao}`,
    );
  }
}

/// So conta quantos itens voltaram: usada onde o resultado e uma lista de pessoas,
/// que nao precisa nem do desenho das chaves repetido.
async function contar(titulo, caminho, params) {
  try {
    const { ok, status, dados } = await blingGet(caminho, params);
    console.log(`${titulo}: HTTP ${status}, ${ok ? (dados?.data ?? []).length : "erro"} item(ns)`);
    if (!ok) imprimirErro(dados);
    return ok ? (dados?.data ?? []).length : null;
  } catch (erro) {
    console.log(`${titulo}: FALHA DE REDE ${erro.message}`);
    return null;
  }
}

/// O fornecedor que o Bling ja tem no produto: le o contato dele e confere como a busca
/// por documento se comporta. Responde "o CNPJ do Rise acha o contato que o Bling ja
/// usa?", que decide se o envio cria um contato novo ou reaproveita o existente.
/// Mostra so o formato do documento (tamanho, digitos) e contagens, nunca o numero.
async function investigarContatoDoProduto(contatoId) {
  if (!contatoId) {
    console.log("\n(produto sem fornecedor no Bling: leitura do contato pulada)");
    return;
  }

  const resposta = await ler(`GET /contatos/${contatoId}`, `/contatos/${contatoId}`);
  const contato = resposta?.data;
  if (!contato) return;

  const documento = typeof contato.numeroDocumento === "string" ? contato.numeroDocumento : "";
  const digitos = documento.replace(/\D/g, "");
  console.log(
    `  numeroDocumento: ${documento ? `${documento.length} caracteres, ${digitos.length} digitos` : "vazio"}`,
  );
  if (cnpj) {
    console.log(`  --cnpj igual ao documento deste contato: ${digitos === cnpj ? "sim" : "nao"}`);
  }

  // Cada fornecedor que o Rise tem para este produto, contra o contato que o Bling ja
  // usa: so "sim/nao". Mostra se o CNPJ (ou o nome) acha o contato existente.
  const semAcento = (texto) =>
    String(texto ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .toLowerCase();
  const produtoRise = await prisma.produto.findUnique({
    where: { sku: codigo },
    select: { fornecedores: { select: { fornecedor: { select: { nome: true, cnpj: true } } } } },
  });
  let numero = 0;
  for (const { fornecedor } of produtoRise?.fornecedores ?? []) {
    numero++;
    const mesmoCnpj = digitos && fornecedor.cnpj?.replace(/\D/g, "") === digitos;
    const mesmoNome = semAcento(fornecedor.nome) === semAcento(contato.nome);
    console.log(
      `  fornecedor do Rise #${numero} deste produto: CNPJ igual ao do contato do Bling = ${mesmoCnpj ? "sim" : "nao"}; nome igual = ${mesmoNome ? "sim" : "nao"}`,
    );
  }

  if (digitos.length !== 14) return;
  const formatado = digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  const variantes = [
    ["como esta guardado", documento],
    ["so 14 digitos", digitos],
    ["formatado", formatado],
  ];
  for (const [rotulo, valor] of variantes) {
    await contar(`  busca pelo documento do proprio contato (${rotulo})`, "/contatos", {
      numeroDocumento: valor,
    });
  }
}

async function investigarSaldos(id) {
  if (!id) return;
  const caminho = `/estoques/saldos?${consultaComLista("idsProdutos", [id])}`;
  const saldos = await ler("GET /estoques/saldos com idsProdutos[] (1 id)", caminho, undefined, [
    "descricao",
    "desconsiderarSaldo",
  ]);
  console.log(`itens devolvidos: ${(saldos?.data ?? []).length}`);
}

async function investigarContatos() {
  await ler("GET /contatos/tipos", "/contatos/tipos", undefined, ["descricao", "id"]);

  if (!cnpj) {
    console.log("\n(sem --cnpj: busca de contato por documento pulada)");
    return;
  }

  // O Rise guarda o CNPJ formatado; o Bling pode guardar de qualquer um dos dois
  // jeitos. Tenta os dois e conta so quantos achou.
  const formatado = cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  console.log("\n=== GET /contatos?numeroDocumento= com o --cnpj ===");
  for (const [rotulo, valor] of [
    ["14 digitos", cnpj],
    ["formatado", formatado],
  ]) {
    await contar(`busca com o CNPJ do Rise (${rotulo})`, "/contatos", { numeroDocumento: valor });
  }
}

/// Qual valor de `criterio` devolve ativos E inativos? "-" = parametro omitido.
/// Sem --contar le so a primeira pagina de cada valor; com --contar percorre o
/// catalogo inteiro (cerca de 19 paginas por valor) e totaliza.
async function sondarCriterios(lista, contar) {
  console.log("\n=== Sondagem do parametro criterio de GET /produtos (limite 100) ===");
  for (const criterio of lista) {
    const situacoes = {};
    const formatos = {};
    // Codigo -> situacoes em que aparece: produto excluido que reaproveita o codigo de um
    // ativo faria o mapa codigo -> id apontar para o produto errado.
    const situacoesDoCodigo = new Map();
    let total = 0;
    let paginasLidas = 0;
    let falhou = false;

    for (let pagina = 1; pagina <= (contar ? MAXIMO_PAGINAS : 1); pagina++) {
      const params = { pagina, limite: 100 };
      if (criterio !== "-") params.criterio = criterio;

      let resposta;
      try {
        resposta = await blingGet("/produtos", params);
      } catch (erro) {
        console.log(`criterio ${criterio}: FALHA DE REDE ${erro.message}`);
        falhou = true;
        break;
      }
      if (!resposta.ok) {
        console.log(`criterio ${criterio}: HTTP ${resposta.status}`);
        imprimirErro(resposta.dados);
        falhou = true;
        break;
      }

      const pagina_ = resposta.dados?.data ?? [];
      paginasLidas++;
      total += pagina_.length;
      for (const produto of pagina_) {
        situacoes[produto.situacao] = (situacoes[produto.situacao] ?? 0) + 1;
        formatos[produto.formato] = (formatos[produto.formato] ?? 0) + 1;
        const chave = String(produto.codigo ?? "").trim().toLowerCase();
        if (!situacoesDoCodigo.has(chave)) situacoesDoCodigo.set(chave, new Set());
        situacoesDoCodigo.get(chave).add(produto.situacao);
      }
      // Fim pelo tamanho da pagina CRUA, como o importador.
      if (pagina_.length < 100) break;
    }

    if (!falhou) {
      console.log(
        `criterio ${criterio}: paginas ${paginasLidas}, itens ${total}${contar ? "" : " (so a 1a pagina)"}; ` +
          `situacao ${JSON.stringify(situacoes)}; formato ${JSON.stringify(formatos)}`,
      );
      const combinacoes = {};
      for (const conjunto of situacoesDoCodigo.values()) {
        if (conjunto.size < 2) continue;
        const nome = [...conjunto].sort().join("+");
        combinacoes[nome] = (combinacoes[nome] ?? 0) + 1;
      }
      const semCodigo = situacoesDoCodigo.get("")?.size ? "sim" : "nao";
      console.log(
        `  codigos distintos ${situacoesDoCodigo.size}; codigos em mais de uma situacao: ${JSON.stringify(combinacoes)}; ha item sem codigo: ${semCodigo}`,
      );
    }
  }
}

/// Quantos ids cabem em UMA chamada de /estoques/saldos? Pega ids do catalogo e
/// pede os N primeiros de cada tamanho da lista, mostrando o status e quantos itens voltaram.
async function sondarLotes(tamanhos) {
  const maior = Math.max(...tamanhos);
  console.log(`\n=== Sondagem do limite de ids de /estoques/saldos (tamanhos ${tamanhos.join(", ")}) ===`);

  const ids = [];
  for (let pagina = 1; ids.length < maior && pagina <= MAXIMO_PAGINAS; pagina++) {
    const resposta = await blingGet("/produtos", { pagina, limite: 100, criterio: 2 });
    if (!resposta.ok) {
      console.log(`nao deu para reunir ids: HTTP ${resposta.status}`);
      imprimirErro(resposta.dados);
      return;
    }
    const lote = resposta.dados?.data ?? [];
    ids.push(...lote.map((produto) => produto.id));
    if (lote.length < 100) break;
  }
  console.log(`ids reunidos: ${ids.length}`);

  for (const tamanho of tamanhos) {
    if (tamanho > ids.length) {
      console.log(`tamanho ${tamanho}: pulado (so ha ${ids.length} ids)`);
      continue;
    }
    const caminho = `/estoques/saldos?${consultaComLista("idsProdutos", ids.slice(0, tamanho))}`;
    try {
      const resposta = await blingGet(caminho);
      const itens = resposta.dados?.data ?? [];
      // A documentacao diz que filtroSaldoEstoque vale 1 (so positivo) por padrao: se for
      // verdade, itens zerados e negativos nao voltariam e a conta de ids nao fecharia.
      const sinais = {
        positivo: itens.filter((item) => item.saldoVirtualTotal > 0).length,
        zero: itens.filter((item) => item.saldoVirtualTotal === 0).length,
        negativo: itens.filter((item) => item.saldoVirtualTotal < 0).length,
      };
      console.log(
        `tamanho ${tamanho}: HTTP ${resposta.status} em ${resposta.duracaoMs} ms; ` +
          `url de ${caminho.length} caracteres; itens devolvidos ${itens.length}; saldo virtual ${JSON.stringify(sinais)}`,
      );
      if (!resposta.ok) imprimirErro(resposta.dados);
    } catch (erro) {
      console.log(`tamanho ${tamanho}: FALHA DE REDE ${erro.message}`);
    }
  }
}

/// Da para pedir direto pelos codigos do Rise, sem ler o catalogo do Bling inteiro?
/// Testa `codigos[]` em /produtos (varios codigos de uma vez, com e sem criterio=5) e em
/// /estoques/saldos (que na documentacao exige idsProdutos[] mas tambem aceita codigos[]).
async function sondarPorCodigo(quantos) {
  console.log(`\n=== Consulta em lote pelos codigos do Rise (${quantos} primeiros SKUs) ===`);
  const produtos = await prisma.produto.findMany({
    select: { sku: true, blingId: true },
    orderBy: { sku: "asc" },
    take: quantos,
  });
  const pedidos = new Set(produtos.map((produto) => produto.sku.toLowerCase()));
  const blingIdDoCodigo = new Map(produtos.map((produto) => [produto.sku.toLowerCase(), produto.blingId]));
  console.log(`codigos pedidos: ${pedidos.size}`);

  // Resume o que voltou: quantos dos codigos pedidos, quantos codigos vieram mais de uma
  // vez (gemeo excluido) e se o id e o mesmo que o Rise guardou em Produto.blingId.
  const resumir = (itens, idDe, codigoDe) => {
    const porCodigo = new Map();
    for (const item of itens) {
      const chave = String(codigoDe(item)).toLowerCase();
      porCodigo.set(chave, [...(porCodigo.get(chave) ?? []), String(idDe(item))]);
    }
    const achados = [...porCodigo.keys()].filter((chave) => pedidos.has(chave));
    const repetidos = [...porCodigo.values()].filter((ids) => ids.length > 1).length;
    const iguais = achados.filter((chave) => porCodigo.get(chave).includes(String(blingIdDoCodigo.get(chave)))).length;
    return `codigos pedidos que voltaram ${achados.length} de ${pedidos.size}; codigos repetidos ${repetidos}; ` +
      `id igual ao Produto.blingId do Rise ${iguais} de ${achados.length}`;
  };

  for (const criterio of [undefined, 5]) {
    const consulta = consultaComLista("codigos", produtos.map((produto) => produto.sku));
    const caminho = `/produtos?${consulta}${criterio ? `&criterio=${criterio}` : ""}&limite=100`;
    try {
      const resposta = await blingGet(caminho);
      const itens = resposta.dados?.data ?? [];
      const situacoes = {};
      for (const item of itens) situacoes[item.situacao] = (situacoes[item.situacao] ?? 0) + 1;
      console.log(
        `GET /produtos?codigos[]=... criterio ${criterio ?? "(omitido)"}: HTTP ${resposta.status}; url de ${caminho.length} caracteres; ` +
          `itens ${itens.length}; situacao ${JSON.stringify(situacoes)}; ${resumir(itens, (i) => i.id, (i) => i.codigo)}`,
      );
      if (!resposta.ok) imprimirErro(resposta.dados);
    } catch (erro) {
      console.log(`GET /produtos?codigos[]=...: FALHA DE REDE ${erro.message}`);
    }
  }

  // Saldos so pelos codigos, sem idsProdutos[]: com 3 e com o lote inteiro.
  for (const quantidade of [3, produtos.length]) {
    const lista = produtos.slice(0, quantidade).map((produto) => produto.sku);
    try {
      const resposta = await blingGet(`/estoques/saldos?${consultaComLista("codigos", lista)}`);
      const itens = resposta.dados?.data ?? [];
      console.log(
        `GET /estoques/saldos?codigos[]=<${lista.length} codigos> (sem idsProdutos[]): HTTP ${resposta.status}; itens ${itens.length}; ` +
          resumir(itens, (i) => i.produto?.id, (i) => i.produto?.codigo),
      );
      if (!resposta.ok) imprimirErro(resposta.dados);
    } catch (erro) {
      console.log(`GET /estoques/saldos?codigos[]=: FALHA DE REDE ${erro.message}`);
    }
  }

  // Casos de borda dos saldos por codigo: codigo que nao existe e produto INATIVO no Bling.
  const inativos = await blingGet("/produtos", { pagina: 1, limite: 5, criterio: 3 });
  const codigoInativo = inativos.dados?.data?.[0]?.codigo;
  const idInativo = inativos.dados?.data?.[0]?.id;
  const casos = [
    ["codigos[]: codigo inexistente + 1 real", "codigos", ["ZZ-NAO-EXISTE-0", produtos[0].sku]],
    ["codigos[]: produto inativo no Bling", "codigos", codigoInativo ? [codigoInativo] : []],
    ["idsProdutos[]: produto inativo no Bling", "idsProdutos", idInativo ? [idInativo] : []],
    ["idsProdutos[]: id inexistente", "idsProdutos", [1]],
  ];
  for (const [rotulo, chave, lista] of casos) {
    if (!lista.length) continue;
    try {
      const resposta = await blingGet(`/estoques/saldos?${consultaComLista(chave, lista)}`);
      console.log(
        `GET /estoques/saldos (${rotulo}): HTTP ${resposta.status}; pedidos ${lista.length}; itens ${(resposta.dados?.data ?? []).length}`,
      );
      if (!resposta.ok) imprimirErro(resposta.dados);
    } catch (erro) {
      console.log(`GET /estoques/saldos (${rotulo}): FALHA DE REDE ${erro.message}`);
    }
  }
}

const classeDoDocumento = (valor) => {
  if (typeof valor !== "string" || !valor.trim()) return "vazio";
  const digitos = valor.replace(/\D/g, "");
  const formatado = digitos.length !== valor.length;
  if (digitos.length === 14) return formatado ? "CNPJ formatado" : "CNPJ so digitos";
  if (digitos.length === 11) return formatado ? "CPF formatado" : "CPF so digitos";
  return "outro";
};

/// Os contatos do tipo Fornecedor do Bling guardam o CNPJ? E o CNPJ dos fornecedores
/// do Rise acha algum deles? So contagens: nome, CNPJ e telefone nao saem daqui.
async function sondarFornecedores() {
  console.log("\n=== Fornecedores: o CNPJ e a chave certa para ligar Rise e Bling? ===");

  const tipos = await blingGet("/contatos/tipos");
  const tipoFornecedor = (tipos.dados?.data ?? []).find((tipo) => /fornecedor/i.test(tipo.descricao));
  if (!tipoFornecedor) {
    console.log("tipo de contato Fornecedor nao encontrado em /contatos/tipos");
    return;
  }

  const classes = {};
  let total = 0;
  let desenhado = false;
  for (let pagina = 1; pagina <= MAXIMO_PAGINAS; pagina++) {
    const resposta = await blingGet("/contatos", {
      pagina,
      limite: 100,
      idTipoContato: tipoFornecedor.id,
    });
    if (!resposta.ok) {
      console.log(`GET /contatos?idTipoContato=<Fornecedor>: HTTP ${resposta.status}`);
      imprimirErro(resposta.dados);
      break;
    }
    const lote = resposta.dados?.data ?? [];
    if (!desenhado && lote.length) {
      console.log("GET /contatos?idTipoContato=<Fornecedor> (item da lista), chaves e tipos:");
      imprimirForma(formaDe({ data: mascarar(lote) }, "", new Set()));
      desenhado = true;
    }
    total += lote.length;
    for (const contato of lote) {
      const classe = classeDoDocumento(contato.numeroDocumento);
      classes[classe] = (classes[classe] ?? 0) + 1;
    }
    if (lote.length < 100) break;
  }
  console.log(`contatos do tipo Fornecedor no Bling: ${total}; documento: ${JSON.stringify(classes)}`);

  const fornecedoresDoRise = await prisma.fornecedor.findMany({
    where: { cnpj: { not: null } },
    select: { cnpj: true },
    orderBy: { criadoEm: "asc" },
  });
  console.log(`fornecedores do Rise com CNPJ: ${fornecedoresDoRise.length}`);
  let numero = 0;
  for (const { cnpj: bruto } of fornecedoresDoRise) {
    numero++;
    const digitos = bruto.replace(/\D/g, "");
    if (digitos.length !== 14) {
      console.log(`  fornecedor do Rise #${numero}: CNPJ sem 14 digitos, pulado`);
      continue;
    }
    const formatado = digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    const porDigitos = await contar(`  fornecedor do Rise #${numero}, busca por 14 digitos`, "/contatos", {
      numeroDocumento: digitos,
    });
    const porFormato = await contar(`  fornecedor do Rise #${numero}, busca formatada`, "/contatos", {
      numeroDocumento: formatado,
    });
    // O criterio padrao de /contatos e 3 ("ultimos incluidos"); o 1 e "todos". Confere se
    // a busca padrao deixa de fora contato que existe.
    const emTodos = await contar(`  fornecedor do Rise #${numero}, busca por 14 digitos com criterio 1 (todos)`, "/contatos", {
      numeroDocumento: digitos,
      criterio: 1,
    });
    console.log(`  => #${numero} achado no Bling: ${porDigitos || porFormato || emTodos ? "SIM" : "nao"}`);
  }
}

try {
  if (argumentos.fornecedores) {
    await sondarFornecedores();
  } else if (argumentos.porcodigo) {
    await sondarPorCodigo(Number(argumentos.porcodigo) || 100);
  } else if (argumentos.criterios) {
    await sondarCriterios(String(argumentos.criterios).split(","), Boolean(argumentos.contar));
  } else if (argumentos.lotes) {
    await sondarLotes(String(argumentos.lotes).split(",").map(Number).filter((n) => n > 0));
  } else {
    const produto = await investigarProduto();
    await investigarDepositos();
    await investigarSaldos(produto?.id);
    await investigarContatos();
    await investigarContatoDoProduto(produto?.contatoId);
  }
} finally {
  // O cliente HTTP grava LogIntegracao pelo Prisma: sem isto o processo nao encerra.
  await prisma.$disconnect();
}
