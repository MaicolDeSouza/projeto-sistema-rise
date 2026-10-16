/**
 * Preencher produto do Rise pelo servidor (pedido do dono em 14/10/2026): o dono faz a varredura dos concorrentes e
 * passa o codigo; este script LE o que ha no banco e, com plano aprovado, GRAVA o cadastro (fotos, descricao, EAN,
 * NCM...) com as mesmas funcoes do Rise, sem passar pela tela. Hoje tem dois comandos:
 *
 *   ler <sku>                      so consulta e imprime o produto (nada e gravado)
 *   clonar <sku> <novo> [--simular]  cria um produto de TESTE copiado de <sku> (como o "Clonar" da tela)
 *
 * COMO RODA NA VPS (o arquivo viaja pela entrada do comando e NAO fica la):
 *
 *   ssh -i ~/.ssh/rise_vps rise@179.199.150.221 \
 *     "cd /srv/rise/app && docker compose exec -T app node --input-type=module - ler 100103" < scripts/preencher-produto.js
 *
 * Dentro do contêiner `app` o banco e as chaves ja estao no ambiente: o script nunca le nem imprime segredo. No PC roda
 * com `node scripts/preencher-produto.js ler <sku>` (usa o .env).
 *
 * O CLONE leva o que o botao Clonar leva (campos, fotos e documentos, fornecedores, concorrentes, pecas de kit) e NAO
 * leva o que e daquela peca: estoque, localizacao, Conferido, vinculo com o Bling, link da Loja Integrada, anuncios e a
 * reserva de imagens. O EAN fica VAZIO, porque o Salvar do Rise recusa o mesmo GTIN em dois produtos. Nunca chama
 * Bling, Mercado Livre nem Loja Integrada.
 */
import { existsSync } from "node:fs";
import { copyFile, mkdir, rm, stat } from "node:fs/promises";
import { register } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Na VPS o codigo mora em /app; no PC, na pasta atual.
const RAIZ = existsSync("/app/scripts/resolver-alias.js") ? "/app" : process.cwd();
if (RAIZ !== "/app") await import("dotenv/config");
register(pathToFileURL(`${RAIZ}/scripts/resolver-alias.js`), pathToFileURL(`${RAIZ}/`));

const { prisma } = await import(pathToFileURL(`${RAIZ}/src/lib/db.js`).href);
const { caminhoDe, pastaDoProduto, skuValido } = await import(pathToFileURL(`${RAIZ}/src/lib/arquivos.js`).href);

// O que NAO vai para a copia (ver o cabecalho). O resto dos campos escalares vai como esta, sem citar nenhuma coluna
// recente: a VPS pode estar com o banco atras do PC.
const NAO_COPIA = new Set([
  "id", "sku", "ean", "estoque", "localizacao", "urlLojaIntegrada", "blingId", "blingSincronizadoEm", "blingAssinatura",
  "blingSaldo", "blingSaldoLidoEm", "conferido", "fornecedorRascunho", "gastoIA", "criadoEm", "atualizadoEm",
]);

const COMANDOS = new Set(["ler", "ofertas", "clonar"]);
const inicio = process.argv.findIndex((arg, posicao) => posicao >= 1 && COMANDOS.has(arg));
const [comando, ...resto] = inicio >= 0 ? process.argv.slice(inicio) : [];
const simular = resto.includes("--simular");
const argumentos = resto.filter((arg) => !arg.startsWith("--"));

function sair(codigo, mensagem) {
  if (mensagem) console[codigo === 0 ? "log" : "error"](mensagem);
  return prisma.$disconnect().finally(() => process.exit(codigo));
}

async function tamanhoEmDisco(sku, arquivo) {
  const caminho = caminhoDe(sku, arquivo.tipo, arquivo.arquivo);
  if (!caminho) return null;
  try {
    return (await stat(caminho)).size;
  } catch {
    return null;
  }
}

async function ler(sku) {
  const produto = await prisma.produto.findUnique({ where: { sku } });
  if (!produto) return sair(1, `Produto ${sku} nao existe.`);
  const [arquivos, fornecedores, concorrentes, pecas, anuncios] = await Promise.all([
    prisma.produtoArquivo.findMany({ where: { produtoId: produto.id }, orderBy: [{ tipo: "asc" }, { ordem: "asc" }] }),
    prisma.produtoFornecedor.findMany({ where: { produtoId: produto.id }, include: { fornecedor: { select: { nome: true } } } }),
    prisma.produtoConcorrente.findMany({ where: { produtoId: produto.id }, include: { produtoColetado: { select: { nome: true, codigo: true, precoNormal: true, fonte: { select: { nome: true } } } } } }),
    prisma.produtoComponente.findMany({ where: { kitId: produto.id }, include: { componente: { select: { sku: true } } } }),
    prisma.anuncio.findMany({ where: { produtoId: produto.id }, select: { canal: true, status: true, situacaoCanal: true, idExterno: true } }),
  ]);
  const arquivosComTamanho = [];
  for (const arquivo of arquivos) {
    arquivosComTamanho.push({
      tipo: arquivo.tipo, papel: arquivo.papel, versao: arquivo.versao, ordem: arquivo.ordem, principal: arquivo.principal,
      nomeOriginal: arquivo.nomeOriginal, arquivo: arquivo.arquivo, bytesNoBanco: arquivo.tamanhoBytes, bytesEmDisco: await tamanhoEmDisco(sku, arquivo),
    });
  }
  const { fornecedorRascunho, ...campos } = produto;
  console.log(JSON.stringify({
    produto: campos,
    temFornecedorEmRascunho: Boolean(fornecedorRascunho),
    arquivos: arquivosComTamanho,
    fornecedores: fornecedores.map((v) => ({ fornecedor: v.fornecedor.nome, codigo: v.codigo, precoCusto: v.precoCusto, padrao: v.padrao, link: v.link })),
    concorrentes: concorrentes.map((v) => (v.produtoColetado
      ? { loja: v.produtoColetado.fonte.nome, nome: v.produtoColetado.nome, codigo: v.produtoColetado.codigo, preco: v.produtoColetado.precoNormal }
      : { loja: v.fonteManual, nome: v.nomeManual, codigo: v.codigoManual, preco: v.precoManual, manual: true })),
    pecasDoKit: pecas.map((p) => ({ sku: p.componente.sku, quantidade: p.quantidade })),
    anuncios,
  }, null, 2));
  return sair(0);
}

/**
 * O que os concorrentes VINCULADOS ao produto publicam (so leitura): cada oferta (loja, preco, estoque, fotos, descricao)
 * e, por campo, os valores achados com as lojas que os publicam. Os valores agregados vem de
 * `lerCamposDasReferencias`, a mesma funcao das indicacoes da lupa do cadastro (EAN so com tamanho de codigo de barras,
 * marca igual ao nome da loja descartada, medidas lidas da ficha e do texto), para o relatorio bater com a tela.
 */
async function ofertas(sku) {
  const produto = await prisma.produto.findUnique({ where: { sku }, select: { id: true, sku: true, tituloBase: true } });
  if (!produto) return sair(1, `Produto ${sku} nao existe.`);
  const vinculos = await prisma.produtoConcorrente.findMany({ where: { produtoId: produto.id } });
  const ids = vinculos.map((v) => v.produtoColetadoId).filter(Boolean);
  const { lerCamposDasReferencias } = await import(pathToFileURL(`${RAIZ}/src/lib/camposDasReferencias.js`).href);
  const campos = await lerCamposDasReferencias(ids);
  const linhas = await prisma.produtoColetado.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, codigo: true, nome: true, marca: true, modelo: true, ean: true, ncm: true, url: true, precoNormal: true, precoPromocional: true,
      estoqueStatus: true, quantidade: true, imagens: true, descricao: true, especificacoes: true, documentos: true, ausenteDesde: true, vistoEm: true,
      fonte: { select: { nome: true } },
    },
  });
  const listaDeImagens = (valor) => (Array.isArray(valor) ? valor.map((i) => (typeof i === "string" ? i : i?.url ?? i?.src ?? null)).filter(Boolean) : []);
  console.log(JSON.stringify({
    produto: { sku: produto.sku, titulo: produto.tituloBase },
    vinculados: { doRise: ids.length, manuais: vinculos.length - ids.length },
    agregado: Object.fromEntries(Object.entries(campos).map(([nome, lista]) => [nome, lista.map((i) => ({ valor: i.valor, lojas: i.fontes, ...(i.origem ? { origem: i.origem } : {}) }))])),
    ofertas: linhas.map((l) => ({
      loja: l.fonte.nome, codigo: l.codigo, nome: l.nome, marca: l.marca, modelo: l.modelo, ean: l.ean, ncm: l.ncm,
      precoNormal: l.precoNormal, precoPromocional: l.precoPromocional, estoque: l.estoqueStatus, quantidade: l.quantidade,
      ausenteDesde: l.ausenteDesde, vistoEm: l.vistoEm, url: l.url,
      fotos: listaDeImagens(l.imagens).length, descricaoCaracteres: (l.descricao ?? "").length,
      fichaItens: Array.isArray(l.especificacoes) ? l.especificacoes.length : 0, documentos: Array.isArray(l.documentos) ? l.documentos.length : 0,
    })),
  }, null, 2));
  return sair(0);
}

async function clonar(origem, novo) {
  if (!skuValido(origem) || !skuValido(novo)) return sair(2, "Codigo invalido: use letras, numeros, ponto, hifen e sublinhado.");
  if (origem.toLowerCase() === novo.toLowerCase()) return sair(2, "O codigo novo precisa ser diferente do original.");

  const fonte = await prisma.produto.findUnique({ where: { sku: origem } });
  if (!fonte) return sair(1, `Produto ${origem} nao existe.`);
  // O SKU e unico no banco, mas o Rise o compara sem caixa nas telas: recusa tambem "100103-TESTE".
  const igual = await prisma.produto.findFirst({ where: { sku: { equals: novo, mode: "insensitive" } }, select: { sku: true } });
  if (igual) return sair(1, `Ja existe o produto ${igual.sku}. Nada foi feito.`);
  const pastaNova = pastaDoProduto(novo);
  if (existsSync(pastaNova)) return sair(1, `A pasta de arquivos ${novo} ja existe no disco. Nada foi feito.`);

  const [arquivos, fornecedores, concorrentes, pecas] = await Promise.all([
    // A reserva (originais e versoes nao escolhidas) nao e foto do produto e nao vai na copia.
    prisma.produtoArquivo.findMany({ where: { produtoId: fonte.id, papel: { not: "RESERVA" } }, orderBy: [{ tipo: "asc" }, { ordem: "asc" }] }),
    prisma.produtoFornecedor.findMany({ where: { produtoId: fonte.id } }),
    prisma.produtoConcorrente.findMany({ where: { produtoId: fonte.id } }),
    prisma.produtoComponente.findMany({ where: { kitId: fonte.id }, orderBy: { ordem: "asc" } }),
  ]);

  // Todo arquivo do banco tem de existir no disco: foto que falta na origem nao pode virar linha na copia.
  const faltando = [];
  for (const arquivo of arquivos) if ((await tamanhoEmDisco(origem, arquivo)) === null) faltando.push(`${arquivo.tipo} ${arquivo.arquivo}`);
  if (faltando.length > 0) return sair(1, `Arquivos da origem que nao estao no disco (nada foi feito): ${faltando.join(", ")}`);

  const campos = Object.fromEntries(Object.entries(fonte).filter(([nome]) => !NAO_COPIA.has(nome)));
  const plano = {
    de: origem, para: novo, tituloBase: fonte.tituloBase,
    camposCopiados: Object.keys(campos).length,
    arquivos: arquivos.length, fornecedores: fornecedores.length, concorrentes: concorrentes.length, pecasDoKit: pecas.length,
    naoCopiado: [...NAO_COPIA].filter((n) => n in fonte),
  };
  console.log("PLANO:", JSON.stringify(plano));
  if (simular) return sair(0, "Simulacao: nada foi gravado.");

  // Arquivos primeiro (nome novo, nunca mexe no que ja existe) e o banco depois, numa transacao: se o banco falhar, a
  // pasta nova e apagada e o produto de origem fica intacto.
  await mkdir(pastaNova, { recursive: true });
  try {
    for (const arquivo of arquivos) {
      const destino = caminhoDe(novo, arquivo.tipo, arquivo.arquivo);
      await mkdir(path.dirname(destino), { recursive: true });
      await copyFile(caminhoDe(origem, arquivo.tipo, arquivo.arquivo), destino);
    }
    const criado = await prisma.$transaction(async (tx) => {
      const produto = await tx.produto.create({ data: { ...campos, sku: novo, ean: null, estoque: 0, conferido: false } });
      if (arquivos.length > 0) {
        await tx.produtoArquivo.createMany({
          data: arquivos.map((a) => ({
            produtoId: produto.id, tipo: a.tipo, arquivo: a.arquivo, nomeOriginal: a.nomeOriginal, mimeType: a.mimeType,
            tamanhoBytes: a.tamanhoBytes, principal: a.principal, ordem: a.ordem, papel: a.papel, versao: a.versao, grupo: null,
          })),
        });
      }
      if (fornecedores.length > 0) {
        await tx.produtoFornecedor.createMany({
          data: fornecedores.map((v) => ({ produtoId: produto.id, fornecedorId: v.fornecedorId, descricao: v.descricao, codigo: v.codigo, precoCusto: v.precoCusto, link: v.link, padrao: v.padrao })),
        });
      }
      if (concorrentes.length > 0) {
        await tx.produtoConcorrente.createMany({
          data: concorrentes.map((v) => ({ produtoId: produto.id, produtoColetadoId: v.produtoColetadoId, fonteManual: v.fonteManual, nomeManual: v.nomeManual, codigoManual: v.codigoManual, precoManual: v.precoManual, linkManual: v.linkManual })),
        });
      }
      if (pecas.length > 0) {
        await tx.produtoComponente.createMany({ data: pecas.map((p) => ({ kitId: produto.id, componenteId: p.componenteId, quantidade: p.quantidade, ordem: p.ordem })) });
      }
      return produto;
    });
    console.log(`CRIADO: ${criado.sku} (id ${criado.id}). Confira com: ler ${novo}`);
  } catch (erro) {
    await rm(pastaNova, { recursive: true, force: true });
    return sair(1, `Falhou e a pasta nova foi apagada (o produto de origem nao mudou): ${erro.message}`);
  }
  return sair(0);
}

if (comando === "ler" && argumentos.length === 1) await ler(argumentos[0]);
else if (comando === "ofertas" && argumentos.length === 1) await ofertas(argumentos[0]);
else if (comando === "clonar" && argumentos.length === 2) await clonar(argumentos[0], argumentos[1]);
else await sair(2, "Uso:\n  ler <sku>\n  ofertas <sku>\n  clonar <sku> <novo> [--simular]");
