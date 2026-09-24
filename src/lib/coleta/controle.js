import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const MARCADOR = process.env.COLETA_PAUSA_ARQUIVO || path.join(process.cwd(), "dados", "coleta.pausada");

export function coletaPausada() {
  return existsSync(MARCADOR);
}

export async function definirPausaColeta(pausada) {
  if (pausada) {
    await mkdir(path.dirname(MARCADOR), { recursive: true });
    await writeFile(MARCADOR, new Date().toISOString());
  } else {
    await rm(MARCADOR, { force: true });
  }
}
