import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Faz o Node puro entender os imports que o bundler do Next resolve sozinho:
 *
 *  1. o alias "@/..." apontando para src/;
 *  2. imports sem extensao ("./bling"), que o Node ESM exige completos.
 *
 * Usado apenas pelo script de diagnostico, que roda fora do Next.
 */

const RAIZ_SRC = path.resolve(process.cwd(), "src");
const EXTENSOES = [".js", ".jsx", ".ts", ".tsx"];

function completarExtensao(caminho) {
  if (existsSync(caminho) && path.extname(caminho)) return caminho;

  for (const extensao of EXTENSOES) {
    const tentativa = `${caminho}${extensao}`;
    if (existsSync(tentativa)) return tentativa;
  }

  for (const extensao of EXTENSOES) {
    const tentativa = path.join(caminho, `index${extensao}`);
    if (existsSync(tentativa)) return tentativa;
  }

  return caminho;
}

export function resolve(especificador, contexto, proximo) {
  if (especificador.startsWith("@/")) {
    const destino = completarExtensao(
      path.join(RAIZ_SRC, especificador.slice(2)),
    );
    return proximo(pathToFileURL(destino).href, contexto);
  }

  if (especificador.startsWith(".") && contexto.parentURL) {
    const base = path.dirname(fileURLToPath(contexto.parentURL));
    const destino = completarExtensao(path.resolve(base, especificador));
    if (existsSync(destino)) {
      return proximo(pathToFileURL(destino).href, contexto);
    }
  }

  return proximo(especificador, contexto);
}
