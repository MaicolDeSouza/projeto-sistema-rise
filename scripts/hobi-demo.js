import "dotenv/config";

/**
 * A LOJA DE MENTIRA do chat da loja (o Hobi): uma pagina com cara de Loja Integrada, com a janela do chat de verdade,
 * so neste computador. E onde o dono ve o chat antes de ele ir para a loja, e onde a tela do widget e conferida.
 *
 *   npm run hobi:demo                       http://127.0.0.1:8790  (respostas de ROTEIRO, sem IA e sem gasto)
 *   npm run hobi:demo -- --real             usa a chave da OpenAI cadastrada no Rise do PC: GASTA de verdade
 *   npm run hobi:demo -- --roteiro=barrada  o roteiro escreve um preco inventado (o filtro tem de barrar)
 *   npm run hobi:demo -- --roteiro=marcacao o roteiro escreve marcacao HTML (tem de aparecer como texto)
 *
 * NAO e o servico `ia`: e uma ferramenta de desenvolvimento. Usa o banco do PC com o usuario do `.env` (as mesmas
 * visoes publicas `ia_*`), troca a configuracao do canal EM MEMORIA (ligado, visivel para todos) e aceita a chave de
 * teste da Cloudflare, que sempre passa. Por isso so atende em 127.0.0.1 e se recusa a subir na producao.
 *
 * O que ela grava no banco do PC e o que o servico gravaria: a conversa (`loja:<sessao>`) e o gasto do canal. E de
 * proposito: assim a Revisao do dia e o Consumo do Rise do PC mostram as conversas da demonstracao.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

if (process.env.RISE_PRODUCAO) {
  console.error("A loja de mentira nao roda na producao.");
  process.exit(2);
}

const http = await import("node:http");
const { readFileSync } = await import("node:fs");
const { prisma } = await import("../src/lib/db.js");
const { criarDadosDoCliente } = await import("../src/lib/riseAi/cliente/dados.js");
const { responderAoCliente } = await import("../src/lib/riseAi/cliente/cerebro.js");
const { criarConversasDoCanal } = await import("../src/lib/riseAi/cliente/conversasDoCanal.js");
const { criarOrcamentoDoCliente } = await import("../src/lib/riseAi/cliente/orcamentoDoCliente.js");
const { criarServidorDoAssistente } = await import("../src/lib/riseAi/cliente/servidorHttp.js");
const { lerPublicados } = await import("../src/lib/riseAi/cliente/widgetPublicado.js");
const { lerLinhasDaLista } = await import("../src/lib/riseAi/cliente/lista.js");

const PORTA = 8790;
const ORIGEM = `http://127.0.0.1:${PORTA}`;
// As chaves de TESTE que a Cloudflare publica para o Turnstile: esta chave publica sempre passa, sem desafio.
const CHAVE_DE_TESTE_DO_TURNSTILE = "1x00000000000000000000AA";
const argumento = (nome) => process.argv.find((item) => item.startsWith(`--${nome}=`))?.split("=")[1] ?? null;
const real = process.argv.includes("--real");
const roteiro = argumento("roteiro");

// As fotos saem do disco deste computador (dados/produtos), pela propria loja de mentira: as do banco do PC nem sempre
// existem no Rise da VPS com o mesmo nome de arquivo.
const reais = criarDadosDoCliente({ baseDasFotos: ORIGEM });
const dados = {
  ...reais,
  async configuracaoDoCanal() {
    const config = await reais.configuracaoDoCanal();
    return { ...config, canal: { ...config.canal, ligado: true, publico: true, whatsapp: config.canal.whatsapp || "https://wa.me/5554999990000", turnstileSiteKey: CHAVE_DE_TESTE_DO_TURNSTILE } };
  },
  // A porta so confere que os segredos EXISTEM; o provedor desta demonstracao e injetado mais abaixo.
  segredos: async () => ({ openai: "demonstracao", anthropic: "demonstracao", turnstile: "demonstracao" }),
};

// ---------- o provedor de roteiro: mostra a janela funcionando sem chamar IA nenhuma ----------
const PALAVRAS_VAZIAS = new Set("a o e um uma uns umas de do da dos das para pra por com sem em no na nos nas que quero queria preciso gostaria fazer ligar montar usar ter tem voce voces vocês você projeto meu minha como qual quais sobre me ao aos mais barato algum alguma pecas peças isso esse essa este esta".split(" "));
const palavrasDe = (texto) => [...new Set(String(texto).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((palavra) => palavra.length > 1 && !PALAVRAS_VAZIAS.has(palavra)))];
let numeroDaChamada = 0;
const chamar = (nome, argumentos) => ({ id: `demo-${++numeroDaChamada}`, nome, argumentos });

function provedorDeRoteiro() {
  return {
    id: "openai",
    async conversar({ modelo, mensagens, ferramentas }) {
      const resposta = (campos) => ({ texto: "", chamadasDeFerramenta: [], uso: { entrada: 400, saida: 80 }, modelo, motivoParada: "fim", ...campos });
      const ultimaDoVisitante = mensagens.findLastIndex((mensagem) => mensagem.papel === "usuario");
      const pergunta = String(mensagens[ultimaDoVisitante]?.conteudo ?? "").split("\n\n[O sistema leu")[0];
      const depois = mensagens.slice(ultimaDoVisitante + 1);
      const resultados = depois.filter((mensagem) => mensagem.papel === "ferramenta");
      const feitas = new Set(resultados.map((mensagem) => mensagem.nome));
      const lido = (mensagem) => {
        try {
          return JSON.parse(mensagem.conteudo);
        } catch {
          return null;
        }
      };
      if (ferramentas.length === 0) return resposta({ texto: "Veja o que encontrei acima." });

      if (/\b(atendente|pessoa|humano|whatsapp)\b/i.test(pergunta)) {
        if (!feitas.has("passarParaAtendente")) return resposta({ chamadasDeFerramenta: [chamar("passarParaAtendente", { motivo: "pediu_pessoa" })] });
        return resposta({ texto: "Claro! A nossa equipe continua com você pelo WhatsApp." });
      }

      const linhas = pergunta.includes("\n") ? lerLinhasDaLista(pergunta) : [];
      if (linhas.length >= 2) {
        if (!feitas.has("orcarLista")) return resposta({ chamadasDeFerramenta: [chamar("orcarLista", { itens: linhas.slice(0, 50).map((linha) => ({ termos: linha.termos, quantidade: linha.quantidade })) })] });
        const orcada = lido(resultados.at(-1));
        const achados = (orcada?.linhas ?? []).filter((linha) => linha.achado).length;
        return resposta({ texto: `Achei ${achados} de ${orcada?.linhas?.length ?? 0} itens da sua lista. Confira as quantidades antes de adicionar. (Resposta de demonstração, sem IA.)` });
      }

      if (!feitas.has("buscarProdutos")) {
        const termos = palavrasDe(pergunta).slice(0, 3);
        if (termos.length === 0) return resposta({ texto: "Me diga o que você quer montar ou qual componente procura. (Resposta de demonstração, sem IA.)" });
        return resposta({ chamadasDeFerramenta: termos.map((termo) => chamar("buscarProdutos", { termos: termo, limite: 3 })) });
      }
      if (!feitas.has("mostrarProdutos")) {
        const buscas = resultados.filter((mensagem) => mensagem.nome === "buscarProdutos").map(lido).filter(Array.isArray);
        // O primeiro de cada busca, depois os segundos: e o que da variedade aos cartoes.
        const escolhidos = [];
        for (let posicao = 0; posicao < 3 && escolhidos.length < 4; posicao++) {
          for (const busca of buscas) {
            const produto = busca[posicao];
            if (produto && !escolhidos.some((item) => item.sku === produto.sku) && escolhidos.length < 4) escolhidos.push({ sku: produto.sku, papel: "opção" });
          }
        }
        if (escolhidos.length === 0) return resposta({ texto: "Não achei esse item no catálogo da loja. Tente outro nome, ou fale com a nossa equipe. (Resposta de demonstração, sem IA.)" });
        return resposta({ chamadasDeFerramenta: [chamar("mostrarProdutos", { itens: escolhidos })] });
      }
      // O roteiro tambem pode ser pedido na propria mensagem ("#barrada", "#marcacao"), sem reiniciar a loja de mentira.
      const modo = roteiro ?? (pergunta.includes("#barrada") ? "barrada" : pergunta.includes("#marcacao") ? "marcacao" : null);
      if (modo === "barrada") return resposta({ texto: "O primeiro sai por R$ 1.234,56 na promoção de hoje." });
      if (modo === "marcacao") return resposta({ texto: 'Veja <img src=x onerror="alert(1)"> os <b>produtos</b> acima.' });
      return resposta({ texto: "Separei estes produtos da loja para você. (Resposta de demonstração, sem IA.)" });
    },
  };
}

let criarProvedor = async () => provedorDeRoteiro();
if (real) {
  const { lerChave } = await import("../src/lib/riseAi/configuracao.js");
  const { criarProvedor: criarProvedorReal } = await import("../src/lib/riseAi/provedores/index.js");
  const { endpointPadrao } = await import("../src/lib/riseAi/modelos.js");
  criarProvedor = async (id) => {
    const chave = await lerChave(id);
    if (!chave) throw new Error(`O Rise do PC nao tem a chave do provedor ${id}.`);
    return criarProvedorReal(id, { endpoint: endpointPadrao(id, "vps"), chave });
  };
}

const conversas = criarConversasDoCanal();
const orcamento = criarOrcamentoDoCliente();
const assistente = criarServidorDoAssistente({
  dados,
  responder: ({ sessaoId, mensagem, contexto, aoEvento, limites }) => responderAoCliente({ canal: "LOJA", sessaoId, mensagem, contexto, aoEvento, dependencias: { dados, conversas, orcamento, limites, criarProvedor } }),
  avaliar: (mensagemId, sessaoId, nota) => conversas.avaliar(mensagemId, sessaoId, nota),
  // So a chave de teste chega aqui: basta o navegador ter devolvido um token.
  verificarRobo: async ({ token }) => typeof token === "string" && token.length > 0,
  chaveHex: "de".repeat(32),
  origens: [ORIGEM],
  versao: "demonstracao",
  widgets: lerPublicados().arquivos,
});

// ---------- as paginas da loja de mentira ----------
const modelo = readFileSync(new URL("../assistente/demo/loja.html", import.meta.url), "utf8");
const [produtoDeExemplo] = await reais.buscarProdutos("arduino", { limite: 1 }).catch(() => []);
function pagina({ classe, titulo, sku = "" }) {
  const atual = lerPublicados().atual;
  const etiqueta = atual ? `<script defer src="/${atual.arquivo}" integrity="${atual.integridade}" crossorigin="anonymous"></script>` : "<!-- sem widget publicado: rode npm run hobi:montar -->";
  return modelo.replaceAll("{{CLASSE}}", classe).replaceAll("{{TITULO}}", titulo).replaceAll("{{SKU}}", sku).replaceAll("{{NOME}}", sku ? (produtoDeExemplo?.nome ?? "Produto de exemplo") : "").replaceAll("{{ETIQUETA}}", etiqueta);
}
const html = (resposta, corpo) => {
  resposta.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  resposta.end(corpo);
};
const carrinho = new Map();

const servidor = http.createServer((requisicao, resposta) => {
  const caminho = new URL(requisicao.url ?? "/", ORIGEM).pathname;
  if (caminho === "/favicon.ico") {
    resposta.writeHead(204);
    return resposta.end();
  }
  if (caminho === "/") return html(resposta, pagina({ classe: "pagina-inicial", titulo: "Loja de mentira" }));
  if (caminho === "/produto") return html(resposta, pagina({ classe: "pagina-produto produto-1", titulo: "Página de produto", sku: produtoDeExemplo?.sku ?? "" }));
  // O endereco de comprar e o trecho do carrinho, como a Loja Integrada os devolve (medido em 20/11/2026).
  const compra = /^\/carrinho\/produto\/(\d+)\/adicionar\/(\d+)$/.exec(caminho);
  if (compra) {
    carrinho.set(compra[1], (carrinho.get(compra[1]) ?? 0) + Number(compra[2]));
    resposta.writeHead(200, { "Content-Type": "application/json" });
    return resposta.end(JSON.stringify({ status: "sucesso", tipo: "adicionar", mensagem: "Produto adicionado ao carrinho.", carrinho_id: "demonstracao", produto: { id: Number(compra[1]), sku: "", nome: "", preco: "0.00", quantidade: Number(compra[2]) } }));
  }
  if (caminho === "/carrinho/mini") {
    const total = [...carrinho.values()].reduce((soma, quantidade) => soma + quantidade, 0);
    return html(resposta, `<span class="qtd-carrinho">${total}</span> item(ns) no carrinho`);
  }
  // A foto do produto, do disco do PC. O mesmo formato de endereco que o Caddy da VPS deixa passar, e nada alem dele.
  const foto = /^\/api\/arquivos\/([A-Za-z0-9._-]{1,64})\/imagens\/([0-9a-f]{32})\.(jpg|png)$/.exec(caminho);
  if (foto) {
    try {
      const bytes = readFileSync(new URL(`../dados/produtos/${foto[1]}/imagens/${foto[2]}.${foto[3]}`, import.meta.url));
      resposta.writeHead(200, { "Content-Type": foto[3] === "png" ? "image/png" : "image/jpeg", "Cache-Control": "max-age=300" });
      return resposta.end(bytes);
    } catch {
      resposta.writeHead(404);
      return resposta.end();
    }
  }
  if (caminho.startsWith("/carrinho")) return html(resposta, pagina({ classe: "pagina-carrinho", titulo: "Carrinho (aqui o chat não aparece)" }));
  // Todo o resto e do servico do chat: /status, /chat, /avaliar e o arquivo do widget.
  assistente.emit("request", requisicao, resposta);
});

servidor.listen(PORTA, "127.0.0.1", () => {
  console.log(`Loja de mentira em ${ORIGEM}  (${real ? "IA DE VERDADE: gasta" : `respostas de roteiro${roteiro ? `: ${roteiro}` : ""}, sem gasto`})`);
});
const sair = async () => {
  servidor.close();
  await prisma.$disconnect().catch(() => null);
  process.exit(0);
};
process.on("SIGINT", sair);
process.on("SIGTERM", sair);
