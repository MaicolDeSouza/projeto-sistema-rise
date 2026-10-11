import { prisma } from "@/lib/db";

/**
 * A trava que impede dois processos de renovarem o MESMO token ao mesmo tempo.
 *
 * O refresh token do Bling (e do Mercado Livre) é de uso único: cada renovação invalida o anterior. Com o site, o worker
 * (que desde a Tarefa 14 lê o estoque do Bling de hora em hora) e os scripts usando a mesma conexão, dois deles podem
 * achar o token vencido no mesmo instante: o primeiro renova, o segundo manda um refresh token que já foi queimado, o
 * Bling recusa e a conexão morre, exigindo reautorizar à mão. Foi o que aconteceu no teste real de 08/10/2026 (o token
 * foi invalidado no meio do teste).
 *
 * A trava é do Postgres (`pg_advisory_xact_lock`), então vale entre processos e entre contêineres que usam o mesmo
 * banco, e solta sozinha no fim da transação — mesmo se o processo cair no meio, a conexão com o banco cai e a trava com
 * ela (nunca fica presa).
 */

/**
 * Roda `fn` com a trava de `chave` tomada. Quem chegar depois ESPERA a transação de quem está dentro e só então entra.
 * `fn` recebe o cliente da transação: o que ela lê e grava vale na mesma transação.
 *
 * O tempo da transação é de 30 s (o padrão do Prisma é 5 s): dentro dela há um pedido de token à API.
 *
 * @template T
 * @param {string} chave  o que se renova ("conexao:BLING")
 * @param {(tx: import("@/generated/prisma/client").Prisma.TransactionClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function comTravaDeRenovacao(chave, fn) {
  return prisma.$transaction(
    async (tx) => {
      // `$executeRaw` e não `$queryRaw`: o Prisma não sabe ler o tipo `void` que a função devolve.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${chave}))`;
      return fn(tx);
    },
    { timeout: 30000, maxWait: 30000 },
  );
}

/**
 * O padrão de toda renovação de token: lê FORA da trava e devolve se ainda vale (o caso de quase toda chamada, sem custo);
 * senão entra na trava, RELÊ — quem esperou pode encontrar o token já renovado por outro processo — e só então renova.
 *
 * @template T
 * @param {string} chave
 * @param {{
 *   ler: (db: object) => Promise<T>,
 *   tokenValido: (lido: T) => string | null,
 *   renovar: (lido: T, tx: object) => Promise<string>,
 * }} passos
 *   `ler(db)`: o estado guardado (segredo e validade), pelo cliente `db` (o do banco, ou o da transação);
 *   `tokenValido(lido)`: o token se ainda vale, `null` se precisa renovar (e lança se não há conexão);
 *   `renovar(lido, tx)`: pede o token novo, guarda (pela transação `tx`) e devolve.
 * @returns {Promise<string>}
 */
export async function obterTokenSobTrava(chave, { ler, tokenValido, renovar }) {
  const lido = await ler(prisma);
  const valido = tokenValido(lido);
  if (valido) return valido;

  return comTravaDeRenovacao(chave, async (tx) => {
    const relido = await ler(tx);
    const renovadoPorOutro = tokenValido(relido);
    if (renovadoPorOutro) return renovadoPorOutro;
    return renovar(relido, tx);
  });
}
