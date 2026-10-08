import { execSync } from "node:child_process";

import { versaoDoDeploy } from "./src/lib/versao.js";

// Versao no pe do menu. Na VPS o script de deploy passa RISE_VERSAO (a hora do deploy) e RISE_COMMIT; no PC
// nada vem e a versao e "dev" mais a hora do ultimo commit, lida do git. A imagem Docker nao leva o .git nem
// tem git, entao la tudo vem das variaveis. Lido UMA vez, na partida: commit novo so aparece depois de reiniciar.
function gitLocal() {
  const git = (argumentos) => {
    try {
      return execSync(`git ${argumentos}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {
      return "";
    }
  };
  const commit = git("rev-parse --short HEAD");
  if (!commit) return {};
  return {
    commit,
    dataDoCommit: git("log -1 --format=%cI"),
    // So arquivo versionado: um .docx solto na pasta nao e mudanca no sistema.
    alterado: git("status --porcelain --untracked-files=no") !== "",
  };
}

const deploy = versaoDoDeploy(process.env, gitLocal());

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Sem o "X-Powered-By: Next.js" em toda resposta: nao serve ao dono e diz a quem pergunta o que atacar.
  poweredByHeader: false,

  // Embutido no codigo no build: a versao e a do build que esta no ar, e nao muda sem um deploy novo.
  env: {
    NEXT_PUBLIC_RISE_VERSAO: deploy.versao,
    NEXT_PUBLIC_RISE_COMMIT: deploy.commit ?? "",
  },

  // O pdf-parse usa o pdfjs por baixo, que carrega um WORKER em arquivo
  // separado. Empacotado pelo Turbopack, o caminho do worker se perde e a
  // leitura morre com "Cannot find module .../pdf.worker.mjs" — mesmo com a
  // biblioteca instalada e funcionando fora do Next.
  //
  // Deixando fora do pacote, ele e carregado por require() nativo do Node e
  // acha os proprios arquivos. E a saida que a documentacao indica para
  // dependencia que usa recurso especifico de Node.
  //
  // Mesma razao para o vtracer (conversor de imagem para SVG): o pacote e um
  // WASM gerado pelo wasm-pack que le o proprio `.wasm` do disco, relativo ao
  // arquivo. Empacotado, o caminho se perde. O `sharp` traz binario nativo
  // (libvips) e nao pode ser empacotado de jeito nenhum.
  serverExternalPackages: ["pdf-parse", "@visioncortex/vtracer", "sharp"],

  experimental: {
    serverActions: {
      // O envio de arquivo passa por Server Action, e o limite padrao e 1 MB —
      // um manual em PDF estoura isso e o framework responde 413 antes de o
      // nosso codigo rodar.
      //
      // Fica ACIMA do limite da aplicacao (20 MB para documento): assim quem
      // recusa um arquivo grande demais e a nossa validacao, com mensagem
      // explicando o motivo, e nao um erro de rede sem contexto. A folga extra
      // cobre o overhead de bordas e cabecalhos do multipart.
      bodySizeLimit: "24mb",
    },
  },
};

export default nextConfig;
