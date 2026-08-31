import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
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
export async function salvarColeta({ fonte, produtos, resumo }) {
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
