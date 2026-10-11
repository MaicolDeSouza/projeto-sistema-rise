/**
 * O vigia do Rise do PC (11/10/2026): a cada minuto pergunta a VPS "tem pedido de varredura pelo PC?" e, se tem, liga o
 * worker do PC sozinho (`worker-pc.js --pedidos`). E o que deixa o dono clicar em "Varrer pelo PC" na tela da VPS e so
 * manter o Rise do localhost aberto: a VPS nao alcanca o PC (rede de casa), entao quem pergunta e o PC.
 *
 * A pergunta e UMA leitura (um `count`) pelo SSH que o worker do PC ja usa, dentro do contêiner do banco. Nao abre tunel
 * nem sobe nada enquanto nao ha pedido. Sem imports do projeto, so do Node.
 *
 * Variaveis opcionais, as mesmas do worker do PC: VPS_SSH (usuario@host), VPS_SSH_CHAVE. `RISE_VIGIA_PC=0` desliga.
 */

import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

export const INTERVALO_DO_VIGIA_MS = 60_000;

/// Jobs de coleta na fila (PENDENTE) de fontes ativas marcadas para o PC. Um job em andamento nao conta: ja tem worker.
export const CONSULTA_DE_PEDIDOS =
  'SELECT count(*) FROM "Job" j JOIN "FonteColeta" f ON f.id = j."fonteId" ' +
  "WHERE j.tipo = 'coleta' AND j.status = 'PENDENTE' AND f.\"varridaNoPc\" AND f.ativa";

/** A saida do psql (`-tA`) como numero de pedidos, ou null se nao for um numero. */
export function pedidosDaSaida(saida) {
  const texto = String(saida ?? "").trim();
  return /^\d{1,6}$/.test(texto) ? Number(texto) : null;
}

/** Quantos pedidos a VPS tem esperando. Devolve `{ pedidos }` ou `{ erro }`. */
export function perguntarAVps({ spawnSyncImpl = spawnSync, vps, chave } = {}) {
  const resposta = spawnSyncImpl(
    "ssh",
    [
      "-i", chave ?? path.join(os.homedir(), ".ssh", "rise_vps"),
      "-o", "BatchMode=yes",
      "-o", "StrictHostKeyChecking=yes",
      "-o", "ConnectTimeout=10",
      vps ?? "rise@179.199.150.221",
      "cd /srv/rise/app && docker compose exec -T db sh -s",
    ],
    {
      // O script vai pela entrada, e nao na linha de comando: aspas dentro de aspas, via ssh, quebram em silencio.
      input: `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "${CONSULTA_DE_PEDIDOS.replace(/"/g, '\\"')}"\n`,
      encoding: "utf8",
      timeout: 25_000,
      windowsHide: true,
    },
  );
  if (resposta.error) return { erro: resposta.error.message };
  if (resposta.status !== 0) return { erro: `ssh saiu com ${resposta.status}: ${String(resposta.stderr).trim().slice(0, 200)}` };
  const pedidos = pedidosDaSaida(resposta.stdout);
  return pedidos === null ? { erro: "resposta inesperada da VPS" } : { pedidos };
}

/**
 * Liga o vigia (uma vez por processo, mesmo com o `next dev` recarregando). `iniciar` e `situacao` vem de
 * `workerPc.js`; `pausada` diz se a coleta esta pausada neste PC.
 */
export function ligarVigiaDoPc({ pastaProjeto, iniciar, rodando, pausada = () => false, intervalo = INTERVALO_DO_VIGIA_MS }) {
  if (globalThis.__riseVigiaDoPc) return;
  globalThis.__riseVigiaDoPc = true;

  let ultimoErro = null;
  const olhar = () => {
    try {
      if (rodando() || pausada()) return;
      const resposta = perguntarAVps({ vps: process.env.VPS_SSH, chave: process.env.VPS_SSH_CHAVE });
      if (resposta.erro) {
        // Uma vez por mensagem: sem internet, o mesmo erro a cada minuto lotaria o terminal.
        if (resposta.erro !== ultimoErro) console.warn(`[vigia-pc] nao consegui perguntar a VPS: ${resposta.erro}`);
        ultimoErro = resposta.erro;
        return;
      }
      ultimoErro = null;
      if (resposta.pedidos > 0) {
        const resultado = iniciar({ pastaProjeto, pedidos: true });
        console.log(
          resultado.ok
            ? `[vigia-pc] ${resposta.pedidos} pedido(s) na VPS: worker do PC ligado`
            : `[vigia-pc] pedido na VPS, mas nao liguei o worker: ${resultado.erro}`,
        );
      }
    } catch (erro) {
      console.warn(`[vigia-pc] ${erro.message}`);
    }
  };

  const relogio = setInterval(olhar, intervalo);
  relogio.unref?.();
  // A primeira olhada 15 s depois de subir, para o servidor nao disputar CPU com a compilacao inicial.
  setTimeout(olhar, 15_000).unref?.();
}

