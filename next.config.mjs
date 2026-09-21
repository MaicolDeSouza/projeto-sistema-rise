/** @type {import('next').NextConfig} */
const nextConfig = {
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
