/**
 * Particularidades de cada fornecedor.
 *
 * Modulo de DADOS, nao de codigo. Fornecedor novo entra somando uma entrada
 * aqui — nunca escrevendo leitor novo. E o desenho combinado com o dono: loja
 * publica tem padrao comum (schema.org) e o generico ganha; fornecedor nao tem
 * padrao nenhum, porque a lista e o que o ERP dele exporta.
 *
 * Cada regra existe porque um arquivo real exigiu. Nada aqui e preventivo: se
 * uma chave nao tem caso que a justifique, ela sai.
 */

export const FORNECEDORES = [
  {
    id: "fortek",
    nome: "Fortek",

    /// Como reconhecer. O dominio e mais estavel que o nome, que o operador
    /// escreve como quiser — mas o nome ajuda quando o cadastro so tem arquivo.
    dominios: ["benser.com.br"],
    nomes: [/fortek/i, /benser/i],

    /**
     * O sufixo do codigo identifica a CARGA, nao o produto.
     *
     * Medido nos dois arquivos reais: "02-268-A" na lista de reserva e o mesmo
     * item que "02-268" na pronta entrega. Juntando por essa regra, 153 pares a
     * mais se reconhecem como um produto so.
     *
     * Confirmado pelo dono em 31/08/2026. Vale SO para este fornecedor: noutro,
     * "-2" pode ser voltagem, tamanho ou versao, e juntar apagaria produto.
     */
    sufixoDeCarga: /-(?:A\d*|\d)$/i,
  },
  {
    id: "nightech",
    nome: "Nightech",

    dominios: ["nightech.com.br"],
    nomes: [/nightech/i],

    /**
     * O site e a planilha descrevem os MESMOS produtos, cada um pela metade.
     *
     * O site tem nome, descricao de venda, foto grande e endereco, mas nao
     * publica preco (a Nightech vende no atacado). A planilha tem preco,
     * saldo de pronta entrega e previsao de chegada, com descricao curta.
     *
     * Casando pelo codigo, um produto so reune os dois. Sem isso, o mesmo
     * item aparece duas vezes na lista — uma sem preco, outra sem descricao —
     * e a busca por codigo devolve os dois sem dizer qual usar.
     */
    mesclarSiteComArquivo: true,
  },
  {
    id: "santana",
    nome: "Santana",

    dominios: ["santanaimport.com.br"],
    nomes: [/santana/i],

    /**
     * PORTAL COM LOGIN, varrido por CATEGORIA (17/09/2026).
     *
     * Sem login a Santana mostra "Faca o login para visualizar o preco", e o
     * dono nao trabalha com o catalogo inteiro (11 mil itens): cadastra os links
     * das categorias que interessam. A lista da categoria ja traz preco, IPI, ST,
     * faixas e multiplo, entao a pagina do produto nao e aberta. O leitor esta em
     * portal-addsuite.js (plataforma Add Suite, ASP.NET WebForms).
     *
     * RITMO DE 30 s: a 2 s, ~150 pedidos no dia (listas de 1,5 a 15 MB) fizeram a
     * Santana cortar a conexao do nosso user-agent. Voltou em menos de uma hora.
     */
    portal: {
      plataforma: "addsuite",
      ritmoMs: 30000,
      porPagina: 50,
    },
  },
  {
    id: "rac",
    nome: "R&AC",

    dominios: ["rac.tec.br"],
    nomes: [/r&ac/i],

    /**
     * CATALOGO EM ARQUIVO JAVASCRIPT (10/10/2026).
     *
     * O site nao tem pagina por produto nem preco (atacado por orcamento no WhatsApp):
     * `index.html` carrega `js/produtos-data.js` com os 2.195 itens ({codigo,
     * descricao, imagem}) e a busca roda no navegador. O leitor esta em catalogo-js.js.
     */
    catalogoJs: { caminho: "js/produtos-data.js", familias: "js/catalogo-inicial.js" },

    /**
     * O PRECO vem do orcamento em PDF que o fornecedor manda (so os itens orcados, cada preco valido para
     * a quantidade pedida); o catalogo do site traz codigo, nome, categoria e foto. Mesmo codigo = um produto,
     * a regra da Nightech. O leitor do orcamento esta em arquivos.js (`orcamentoDoPdf`).
     */
    mesclarSiteComArquivo: true,
  },
  {
    id: "prado",
    nome: "Prado Automação Industrial",

    // O site publico, a loja (loja.*) que so redireciona para ele e o endereco do Shopify.
    dominios: ["pradoautomacaoindustrial.com.br", "prado-automacao-industrial.myshopify.com"],

    /**
     * LOJA SHOPIFY POR TRAS DE UM SITE PROPRIO (11/10/2026).
     *
     * O site monta a pagina no navegador (casca de 3,8 KB, sem produto); as paginas HTML do
     * Shopify redirecionam para ele. So o catalogo publico em JSON do Shopify responde, e e
     * dele que vem tudo (nome, sku, preco, foto, descricao, categoria, disponibilidade). O
     * leitor esta em catalogo-shopify.js. O endereco gravado em cada produto e o do site
     * publico (/produto/{handle}, como no sitemap dele).
     */
    catalogoShopify: {
      loja: "prado-automacao-industrial.myshopify.com",
      urlProduto: "https://pradoautomacaoindustrial.com.br/produto/{handle}",
      /**
       * OS DOCUMENTOS NAO ESTAO NO SHOPIFY: desenho tecnico, tabela de especificacoes (em imagem),
       * arquivo 3D (.IGS) e o PDF "Ficha Tecnica" moram na base Supabase do proprio site, nas tabelas
       * `product_technical_data` e `product_pdfs`, ligadas ao produto pelo `product_handle` (289 de
       * 581 produtos em 11/10/2026). A chave e a PUBLICA do site (papel `anon`, embutida no JavaScript
       * que todo visitante baixa, valida ate 2035); a leitura foi autorizada pelo dono em 11/10/2026.
       * So leitura, duas requisicoes por coleta. Se a chave um dia mudar, os documentos ficam de fora e
       * o catalogo continua: ver `extrasDoSupabase` em catalogo-shopify.js.
       */
      supabase: {
        url: "https://odtixfahgbyohtznjvhw.supabase.co",
        chaveAnonima: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kdGl4ZmFoZ2J5b2h0em5qdmh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MjAzOTMsImV4cCI6MjA4MTQ5NjM5M30.7hgRiweC0NoYXbjrWa2Lim8XRa2RKt-7-7vWYrq6K-I",
      },
    },
  },
];

/**
 * As regras do fornecedor que casa com este cadastro.
 *
 * Devolve um objeto vazio quando nao ha entrada — o caminho generico e o
 * padrao, e fornecedor sem particularidade nao precisa aparecer aqui.
 */
export function regrasDoFornecedor({ nome, url } = {}) {
  const dominio = (() => {
    if (!url) return null;
    try {
      return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(
        /^www\./i,
        "",
      );
    } catch {
      return null;
    }
  })();

  const achado = FORNECEDORES.find((fornecedor) => {
    if (dominio && fornecedor.dominios?.some((d) => dominio.endsWith(d))) return true;
    if (nome && fornecedor.nomes?.some((padrao) => padrao.test(nome))) return true;
    return false;
  });

  return achado ?? {};
}

/**
 * A configuracao de PORTAL COM LOGIN do fornecedor deste endereco, ou null.
 *
 * So pelo DOMINIO, nunca pelo nome: `regrasDoFornecedor` aceita o nome porque
 * o cadastro por arquivo pode nao ter endereco, mas um concorrente chamado
 * "Santana Eletronicos" viraria portal com login por engano.
 */
export function portalDoEndereco(url) {
  if (!url) return null;
  const regras = regrasDoFornecedor({ url });
  return regras.portal ? { id: regras.id, nome: regras.nome, ...regras.portal } : null;
}

/**
 * A configuracao de CATALOGO EM ARQUIVO JS do fornecedor deste endereco, ou null.
 *
 * So pelo DOMINIO, como `portalDoEndereco`: um concorrente chamado "R&AC" nao pode
 * virar leitor de arquivo.
 */
export function catalogoJsDoEndereco(url) {
  if (!url) return null;
  const regras = regrasDoFornecedor({ url });
  return regras.catalogoJs ? { id: regras.id, nome: regras.nome, ...regras.catalogoJs } : null;
}

/** A configuracao de LOJA SHOPIFY POR TRAS DO SITE deste endereco, ou null. So pelo dominio, como as outras. */
export function catalogoShopifyDoEndereco(url) {
  if (!url) return null;
  const regras = regrasDoFornecedor({ url });
  return regras.catalogoShopify ? { id: regras.id, nome: regras.nome, ...regras.catalogoShopify } : null;
}
