import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Os arquivos ORIGINAIS que o fornecedor manda — HTML salvo, PDF, planilha.
 *
 * So eles moram em disco. O que se le deles vai para o banco (`banco.js`), e a
 * lista de quais arquivos formam o ultimo envio fica na propria fonte
 * (`FonteColeta.listaArquivos`). Os produtos.json e o manifesto.json que
 * existiam aqui sairam em 15/09/2026.
 *
 * Em dados/coleta/<dominio>/arquivos/ — a mesma convencao de dados/produtos/:
 * fora de public/ (que nao sobrevive a deploy com Docker), ja no .gitignore, e
 * vira volume no VPS.
 */

const RAIZ = path.join(process.cwd(), "dados", "coleta");

/// Onde ficam os arquivos crus de uma fonte.
function pastaDeArquivos(dominio) {
  const limpo = String(dominio).replace(/[^a-z0-9.-]/gi, "_");
  return path.join(RAIZ, limpo, "arquivos");
}

/**
 * Guarda os arquivos que o fornecedor mandou.
 *
 * O ORIGINAL, e nao so o resultado da leitura. Os leitores mudam: numa semana a
 * extracao ganhou tres correcoes (ficha cortada, titulo sem dois-pontos, campo
 * vazio derrubando a fonte). Guardando so o produto lido, cada melhoria exigiria
 * pedir o arquivo ao fornecedor de novo; guardando o original, basta reprocessar.
 *
 * SUBSTITUI O CONJUNTO. A Fortek manda duas listas — pronta entrega e reserva —
 * que so fazem sentido juntas: acumulando, uma reserva velha se juntaria a uma
 * pronta entrega nova em silencio, e o preco de reserva venceria onde nao devia.
 *
 * @returns {Promise<{nome: string, bytes: number}[]>} o que vai para
 *   `FonteColeta.listaArquivos`
 */
export async function guardarArquivosOriginais(dominio, arquivos) {
  const destino = pastaDeArquivos(dominio);

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

  return guardados;
}

/**
 * Le os arquivos do ultimo envio, com o conteudo, para reprocessar.
 *
 * @param {string} dominio
 * @param {{nome: string}[]|null} lista  `FonteColeta.listaArquivos`
 */
export async function lerArquivosOriginais(dominio, lista) {
  const arquivos = [];

  for (const item of lista ?? []) {
    try {
      const bytes = await readFile(path.join(pastaDeArquivos(dominio), item.nome));
      arquivos.push({ nome: item.nome, bytes: new Uint8Array(bytes) });
    } catch {
      // Arquivo sumiu do disco: segue com os que restaram, e a lista na fonte
      // continua dizendo quantos deveriam existir.
    }
  }

  return arquivos;
}

/** Apaga os arquivos guardados de uma fonte. */
export async function apagarArquivosOriginais(dominio) {
  await rm(pastaDeArquivos(dominio), { recursive: true, force: true });
}
