import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Guarda o resultado da coleta em JSON, enquanto o banco nao entra.
 *
 * Um arquivo por fonte, em dados/coleta/<dominio>/produtos.json — a mesma
 * convencao de dados/produtos/<SKU>/: fora de public/ (que nao sobrevive a
 * deploy com Docker), ja no .gitignore, e vira volume no VPS.
 *
 * O arquivo guarda a COLETA INTEIRA, nao so os produtos: quando o banco entrar,
 * a carga vai ler daqui, e sem saber quando e de onde os dados vieram nao daria
 * para decidir o que ainda vale.
 */

const RAIZ = path.join(process.cwd(), "dados", "coleta");

/** Nome de pasta seguro a partir do dominio. */
function pasta(dominio) {
  const limpo = String(dominio).replace(/[^a-z0-9.-]/gi, "_");
  return path.join(RAIZ, limpo);
}

export function caminhoDoArquivo(dominio) {
  return path.join(pasta(dominio), "produtos.json");
}

/**
 * Grava a coleta.
 *
 * Sobrescreve o arquivo da fonte: enquanto estamos em teste, o que interessa e
 * a ultima coleta. Historico e assunto do banco, na etapa seguinte.
 */
export async function salvarColeta({
  fonte,
  produtos,
  resumo,
  origem = "site",
  listaEnviadaEm = null,
  duracaoMs = null,
}) {
  const destino = caminhoDoArquivo(fonte.dominio);
  await mkdir(path.dirname(destino), { recursive: true });

  const conteudo = {
    fonte: {
      nome: fonte.nome,
      dominio: fonte.dominio,
      tipo: fonte.tipo,
      url: fonte.url,
      secao: fonte.secao ?? null,
    },
    coletadoEm: new Date().toISOString(),
    // De onde veio esta coleta. E o que permite a trava de queda comparar
    // arquivo com arquivo: colheita do site traz 20 produtos e arquivo traz
    // 1.900, e comparar os dois acusaria queda em toda troca de caminho.
    origem,
    // Quando o FORNECEDOR mandou a lista — diferente de quando ela foi
    // reprocessada. Sem este numero, lista de tres semanas atras parece tao
    // fresca quanto vitrine varrida agora.
    listaEnviadaEm,
    // Quanto a coleta desta fonte demorou. E o numero que separa "o site e
    // lento" de "o site pede 10s entre visitas" — o Eletrogate leva quatro
    // vezes o tempo da Smartkits pelo mesmo trabalho, e sem isto a diferenca
    // some.
    duracaoMs,
    resumo: resumo ?? null,
    total: produtos.length,
    produtos,
  };

  await writeFile(destino, `${JSON.stringify(conteudo, null, 2)}\n`, "utf-8");
  return destino;
}

export async function lerColeta(dominio) {
  try {
    return JSON.parse(await readFile(caminhoDoArquivo(dominio), "utf-8"));
  } catch {
    return null;
  }
}

/** Todas as coletas guardadas, para a tela listar sem depender do banco. */
export async function listarColetas() {
  let dominios;
  try {
    dominios = await readdir(RAIZ, { withFileTypes: true });
  } catch {
    return [];
  }

  const coletas = [];
  for (const entrada of dominios) {
    if (!entrada.isDirectory()) continue;
    const coleta = await lerColeta(entrada.name);
    if (coleta) coletas.push(coleta);
  }

  return coletas.sort((a, b) => String(b.coletadoEm).localeCompare(String(a.coletadoEm)));
}

/**
 * Identificador estavel de um produto dentro das coletas.
 *
 * O JSON nao tem chave primaria — quem tinha id era a linha do banco. A tela
 * precisa de uma para abrir o detalhe no clique, e ela tem que sobreviver a uma
 * coleta nova: por isso e composta do que identifica o produto (dominio, codigo
 * e endereco), e nao da POSICAO na lista. Com o indice, uma varredura entre a
 * listagem e o clique abriria o produto errado.
 */
export function idDoProduto(dominio, produto) {
  return `${dominio}|${produto.code ?? ""}|${produto.url ?? ""}`;
}

/**
 * Todos os produtos coletados, de todas as fontes, achatados para a tela.
 *
 * Le os arquivos JSON — o banco fica parado ate os testes terminarem. Sao
 * poucos: vinte por fonte, entao caber tudo em memoria e filtrar aqui e mais
 * simples e mais rapido que qualquer indice. Quando o banco entrar, e esta
 * funcao que muda, e a tela nao precisa saber.
 */
export async function produtosColetados() {
  const coletas = await listarColetas();

  return coletas.flatMap((coleta) =>
    (coleta.produtos ?? []).map((produto) => ({
      ...produto,
      id: idDoProduto(coleta.fonte?.dominio ?? "", produto),
      fonte: coleta.fonte,
      coletadoEm: coleta.coletadoEm,
      // De onde o dado veio. O campo declarado vence; sem ele, quem responde e
      // o endereco: produto varrido do site sempre tem `url`, e produto lido de
      // arquivo de fornecedor vem com `url: null`, porque planilha e PDF nao
      // publicam endereco de pagina.
      origem: coleta.origem ?? (produto.url ? "site" : "arquivo"),
    })),
  );
}

// ---------------------------------------------------------------------------
// Arquivos que o fornecedor manda
// ---------------------------------------------------------------------------

/// Onde ficam os arquivos CRUS de uma fonte, ao lado do produtos.json dela.
function pastaDeArquivos(dominio) {
  return path.join(pasta(dominio), "arquivos");
}

/**
 * Guarda os arquivos que o fornecedor mandou.
 *
 * O ORIGINAL, e nao so o resultado da leitura. Os leitores mudam: so nesta
 * semana a extracao ganhou tres correcoes (ficha cortada, titulo sem
 * dois-pontos, campo vazio derrubando a fonte). Guardando so o produto lido,
 * cada melhoria exigiria pedir o arquivo ao fornecedor de novo; guardando o
 * original, basta reprocessar.
 *
 * SUBSTITUI O CONJUNTO. A Fortek manda duas listas — pronta entrega e reserva —
 * que so fazem sentido juntas: acumulando, uma reserva velha se juntaria a uma
 * pronta entrega nova em silencio, e o preco de reserva venceria onde nao devia.
 * Cada envio e o conjunto inteiro daquele dia.
 */
export async function salvarArquivosDaFonte(dominio, arquivos) {
  const destino = pastaDeArquivos(dominio);

  // Limpa o conjunto anterior antes de gravar o novo.
  await rm(destino, { recursive: true, force: true });
  await mkdir(destino, { recursive: true });

  const guardados = [];

  for (const arquivo of arquivos) {
    // Nome de arquivo vem do operador: so o nome base, e sem nada que suba de
    // diretorio. Sem isto, "../../.env" seria um caminho valido para escrever.
    const nome = path.basename(String(arquivo.nome)).replace(/[^\w.\- ]/g, "_");
    await writeFile(path.join(destino, nome), arquivo.bytes);
    guardados.push({ nome, bytes: arquivo.bytes.length });
  }

  const manifesto = {
    dominio,
    // A data em que o fornecedor mandou a lista, que NAO e a data em que ela
    // foi reprocessada. Um preco de tres semanas atras parece atual na tela sem
    // este numero.
    enviadoEm: new Date().toISOString(),
    arquivos: guardados,
  };

  await writeFile(
    path.join(destino, "manifesto.json"),
    `${JSON.stringify(manifesto, null, 2)}\n`,
    "utf-8",
  );

  return manifesto;
}

/** O manifesto do ultimo envio, para a tela. Sem ler os arquivos. */
export async function manifestoDaFonte(dominio) {
  try {
    return JSON.parse(
      await readFile(path.join(pastaDeArquivos(dominio), "manifesto.json"), "utf-8"),
    );
  } catch {
    return null;
  }
}

/** Os arquivos guardados, com o conteudo, para reprocessar. */
export async function lerArquivosDaFonte(dominio) {
  const manifesto = await manifestoDaFonte(dominio);
  if (!manifesto) return { manifesto: null, arquivos: [] };

  const arquivos = [];
  for (const item of manifesto.arquivos ?? []) {
    try {
      const bytes = await readFile(path.join(pastaDeArquivos(dominio), item.nome));
      arquivos.push({ nome: item.nome, bytes: new Uint8Array(bytes) });
    } catch {
      // Arquivo sumiu do disco: segue com os que restaram, e o manifesto
      // continua dizendo quantos deveriam existir.
    }
  }

  return { manifesto, arquivos };
}

/** Apaga os arquivos guardados de uma fonte. */
export async function apagarArquivosDaFonte(dominio) {
  await rm(pastaDeArquivos(dominio), { recursive: true, force: true });
}
