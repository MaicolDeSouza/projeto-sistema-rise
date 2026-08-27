/** @type {import('next').NextConfig} */
const nextConfig = {
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
