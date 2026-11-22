/* Hobi, o assistente da 4hobby. Arquivo gerado por scripts/montar-widget.js: nao editar. */
(function () {
"use strict";
/**
 * O NUCLEO do widget do chat da loja (o Hobi): tudo o que a janela decide sem tocar na tela.
 *
 * Mora separado da tela (tela.js) por um motivo: aqui esta o que protege a loja e o visitante (que link pode virar
 * link, que foto pode aparecer, como o fluxo do servidor e lido, quando o chat pode aparecer), e isso precisa de teste
 * por maquina (`npm run teste:widget`), nao de olho.
 *
 * Regras deste arquivo, que o montador (scripts/montar-widget.js) depende:
 *  - so `export function` e `export const` no nivel de cima (o montador tira a palavra `export` e cola tudo num arquivo);
 *  - nenhum `import`, nenhum `window`, `document`, `fetch` ou relogio: o que vem de fora entra por parametro.
 *
 * Dado do servidor e SEMPRE texto: nada aqui devolve HTML.
 */

const ORIGENS_DA_LOJA = ["https://www.4hobby.com.br", "https://4hobby.com.br"];
const ORIGEM_DAS_FOTOS = "https://rise.4hobby.com.br/";
const MAXIMO_DE_TROCAS_GUARDADAS = 30;
const TEXTO_DA_INTERRUPCAO = "A resposta foi interrompida quando a página mudou. Pergunte de novo.";

/** O id da sessao do visitante: 32 hexadecimais, dos 16 bytes aleatorios que o navegador deu. */
function novaSessaoId(bytes) {
  let texto = "";
  for (let i = 0; i < 16; i++) texto += (bytes[i] & 255).toString(16).padStart(2, "0");
  return texto;
}

/**
 * Le o fluxo de eventos do `/chat` (SSE) aos pedacos, como a rede entrega. Nunca lanca: bloco sem nome, com JSON
 * invalido ou com dado que nao e objeto (uma pagina de erro do proxy, por exemplo) e descartado.
 */
function criarLeitorDoFluxo() {
  let resto = "";
  return {
    alimentar(pedaco) {
      resto += String(pedaco == null ? "" : pedaco).replace(/\r\n/g, "\n");
      const eventos = [];
      let corte = resto.indexOf("\n\n");
      while (corte !== -1) {
        const bloco = resto.slice(0, corte);
        resto = resto.slice(corte + 2);
        corte = resto.indexOf("\n\n");
        let nome = "";
        let dados = "";
        for (const linha of bloco.split("\n")) {
          if (linha.startsWith("event:")) nome = linha.slice(6).trim();
          else if (linha.startsWith("data:")) dados += linha.slice(5).trim();
        }
        if (!nome || !dados) continue;
        try {
          const lido = JSON.parse(dados);
          if (lido && typeof lido === "object" && !Array.isArray(lido)) eventos.push({ evento: nome, dados: lido });
        } catch {
          // Bloco pela metade ou que nao e do nosso servico: fica de fora.
        }
      }
      return eventos;
    },
  };
}

const temClasse = (classes, nome) => ` ${String(classes == null ? "" : classes)} `.includes(` ${nome} `);

/**
 * O que a pagina da loja diz ao assistente: se e pagina de produto, qual o codigo e o nome. E dado da pagina: o codigo so
 * passa com cara de codigo, e o nome vira uma linha so, com no maximo 120 caracteres (a janela o mostra como texto).
 */
function contextoDaPagina({ classeDoBody, skuNaPagina, nomeNaPagina }) {
  if (!temClasse(classeDoBody, "pagina-produto")) return { pagina: "outra", skuAberto: "", nomeAberto: "" };
  const sku = String(skuNaPagina == null ? "" : skuNaPagina).trim();
  const nome = String(nomeNaPagina == null ? "" : nomeNaPagina).replace(/\s+/g, " ").trim().slice(0, 120);
  return { pagina: "produto", skuAberto: /^[A-Za-z0-9._-]{1,64}$/.test(sku) ? sku : "", nomeAberto: nome };
}

/**
 * Os atalhos da saudacao (pedido do dono em 22/11/2026). Cada um ABRE a conversa com uma fala do Hobi, feita aqui mesmo:
 * nao chama a IA e nao gasta. "Acompanhar meu pedido" entra na fase 3; o WhatsApp e um link a parte.
 */
const ATALHOS = [
  { id: "componente", rotulo: "Encontrar um componente" },
  { id: "duvida", rotulo: "Tirar dúvida técnica sobre um produto" },
  { id: "lista", rotulo: "Colar lista de peças" },
];

const FALAS_DOS_ATALHOS = {
  componente: "Qual componente você procura? Pode ser o nome, o código ou para que vai usar.",
  duvida: "Qual produto você está com dúvida? Pode me passar o nome ou o código.",
  // Texto escolhido pelo dono (Opcao 2, 22/11/2026): a lista pode vir em qualquer formato.
  lista: "Pode colar sua lista aqui. Eu analiso e te mostro em instantes o que temos.",
};

/**
 * A fala de abertura de um atalho. Na duvida tecnica, se o visitante esta na pagina de um produto, oferece "O produto desta
 * tela": um clique e a pergunta segue com ele (o codigo ja vai no contexto de toda mensagem).
 *
 * @returns {{ texto: string, sugestao: { rotulo: string, mensagem: string } | null, modoLista: boolean } | null}
 */
function aberturaDoAtalho(id, contexto) {
  const texto = FALAS_DOS_ATALHOS[id];
  if (!texto) return null;
  let sugestao = null;
  if (id === "duvida" && contexto && contexto.pagina === "produto" && contexto.skuAberto) {
    const nome = contexto.nomeAberto || `o produto ${contexto.skuAberto}`;
    sugestao = { rotulo: `O produto desta tela: ${nome}`, mensagem: `Tenho uma dúvida técnica sobre este produto: ${nome} (código ${contexto.skuAberto}).` };
  }
  return { texto, sugestao, modoLista: id === "lista" };
}

/** O chat nao existe no carrinho nem no checkout: nada de terceiro entre o cliente e o pagamento. */
function paginaProibida({ classeDoBody, caminho }) {
  const rota = String(caminho == null ? "" : caminho);
  return temClasse(classeDoBody, "pagina-carrinho") || rota.startsWith("/carrinho") || rota.startsWith("/checkout");
}

/** O botao aparece? So com o chat ligado, e para todos ou so para quem abriu a loja com `?assistente=1` (e segue lembrado na aba). */
function deveAparecer({ status, busca, lembrado }) {
  if (!status || status.ligado !== true) return false;
  if (status.publico === true) return true;
  return Boolean(lembrado) || /[?&]assistente=1(?:&|$)/.test(String(busca == null ? "" : busca));
}

function comoUrl(endereco) {
  try {
    return new URL(String(endereco));
  } catch {
    return null;
  }
}

/** O link de um cartao so vira link se for https e da loja (ou da propria pagina onde o widget roda). */
function linkDaLoja(url, origemDaPagina) {
  const lido = typeof url === "string" ? comoUrl(url) : null;
  if (!lido) return null;
  const daPagina = lido.origin === origemDaPagina && (lido.protocol === "https:" || lido.protocol === "http:");
  const daLoja = lido.protocol === "https:" && ORIGENS_DA_LOJA.includes(lido.origin);
  return daPagina || daLoja ? lido.href : null;
}

/** A foto de um cartao: so do Rise. Na loja de mentira do PC (servico em 127.0.0.1) vale tambem a dela mesma e qualquer https. */
function fotoPermitida(url, origemDoServico) {
  if (typeof url !== "string") return null;
  if (url.startsWith(ORIGEM_DAS_FOTOS)) return url;
  const servico = comoUrl(origemDoServico);
  const lida = comoUrl(url);
  if (!lida || !servico || (servico.hostname !== "127.0.0.1" && servico.hostname !== "localhost")) return null;
  return lida.protocol === "https:" || lida.origin === servico.origin ? url : null;
}

function linkDoWhatsApp(url) {
  return typeof url === "string" && /^https:\/\/wa\.me\/\d{10,15}(\?\S*)?$/.test(url) ? url : null;
}

/** O endereco de comprar da Loja Integrada (medido na loja em 20/11/2026): `/carrinho/produto/<id>/adicionar/<quantidade>`. */
function enderecoDoCarrinho(liId, quantidade) {
  const id = String(liId == null ? "" : liId);
  const quantos = Number(quantidade);
  if (!/^\d{1,12}$/.test(id) || !Number.isInteger(quantos) || quantos < 1 || quantos > 99) return null;
  return `/carrinho/produto/${id}/adicionar/${quantos}`;
}

function cpfValido(digitos) {
  if (/^(\d)\1{10}$/.test(digitos)) return false;
  const verificador = (quantos) => {
    let soma = 0;
    for (let i = 0; i < quantos; i++) soma += Number(digitos[i]) * (quantos + 1 - i);
    return ((soma * 10) % 11) % 10;
  };
  return verificador(9) === Number(digitos[9]) && verificador(10) === Number(digitos[10]);
}

function passaNoLuhn(digitos) {
  let soma = 0;
  for (let i = 0; i < digitos.length; i++) {
    let valor = Number(digitos[digitos.length - 1 - i]);
    if (i % 2 === 1) {
      valor *= 2;
      if (valor > 9) valor -= 9;
    }
    soma += valor;
  }
  return soma % 10 === 0;
}

/**
 * O texto parece trazer um CPF ou um numero de cartao? So para a janela PERGUNTAR antes de enviar (o servidor mascara de
 * todo jeito). Confere os digitos verificadores: uma lista de pecas com numeros nao pode disparar a pergunta.
 */
function pareceDadoSensivel(texto) {
  const lido = String(texto == null ? "" : texto);
  for (const achado of lido.matchAll(/(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/g)) {
    if (cpfValido(achado[0].replace(/\D/g, ""))) return "cpf";
  }
  for (const achado of lido.matchAll(/(?<!\d)(?:\d{13,19}|\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{1,7})(?!\d)/g)) {
    if (passaNoLuhn(achado[0].replace(/\D/g, ""))) return "cartao";
  }
  return null;
}

// ---------- a conversa (o que a tela desenha) ----------

function conversaVazia() {
  return { trocas: [] };
}

// `local`: a fala de abertura de um atalho (feita pela janela, sem pergunta e sem IA); `sugestao`: o botao que ela oferece.
const trocaNova = (pergunta) => ({ pergunta, status: "", cartoes: [], lista: null, texto: "", passagem: null, erro: null, mensagemId: null, nota: 0, local: false, sugestao: null, fechada: false });
const sugestaoLida = (bruta) => (ehObjeto(bruta) && typeof bruta.rotulo === "string" && typeof bruta.mensagem === "string" ? { rotulo: bruta.rotulo.slice(0, 200), mensagem: bruta.mensagem.slice(0, 400) } : null);
const passagemLida = (bruta) =>
  ehObjeto(bruta)
    ? { motivo: String(bruta.motivo == null ? "" : bruta.motivo), url: bruta.url == null ? null : String(bruta.url), tipo: bruta.tipo === "tecnico" ? "tecnico" : "comercial", foraDoHorario: bruta.foraDoHorario === true }
    : null;
const ehObjeto = (valor) => Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

/** Troca a ULTIMA troca, se ela ainda esta aberta; senao a conversa volta igual (evento fora de hora nao tem onde entrar). */
function naAberta(conversa, mudar) {
  const ultima = conversa.trocas[conversa.trocas.length - 1];
  if (!ultima || ultima.fechada) return conversa;
  return { trocas: [...conversa.trocas.slice(0, -1), { ...ultima, ...mudar(ultima) }] };
}

/**
 * A conversa depois de um evento. Nao altera a que recebeu. `pergunta` e `avaliacao` sao da propria janela; os demais
 * sao os eventos do `/chat`. O passe da verificacao de robo nao e conversa: fica de fora (a tela o guarda a parte).
 */
function aplicarEvento(conversa, { evento, dados }) {
  const d = ehObjeto(dados) ? dados : {};
  switch (evento) {
    case "pergunta":
      return { trocas: [...conversa.trocas, trocaNova(String(d.texto == null ? "" : d.texto))] };
    case "abertura":
      return { trocas: [...conversa.trocas, { ...trocaNova(""), texto: String(d.texto == null ? "" : d.texto), local: true, sugestao: sugestaoLida(d.sugestao), fechada: true }] };
    case "status":
      return naAberta(conversa, () => ({ status: String(d.texto == null ? "" : d.texto) }));
    case "cartoes":
      return naAberta(conversa, () => ({ cartoes: Array.isArray(d.itens) ? d.itens.filter(ehObjeto) : [] }));
    case "lista":
      return naAberta(conversa, () => ({ lista: Array.isArray(d.linhas) ? { linhas: d.linhas.filter(ehObjeto), total: Number(d.total) || 0 } : null }));
    case "texto":
      return naAberta(conversa, () => ({ texto: String(d.texto == null ? "" : d.texto) }));
    case "passagem":
      return naAberta(conversa, () => ({ passagem: passagemLida(d) }));
    case "erro":
      return naAberta(conversa, () => ({ status: "", erro: { texto: String(d.mensagem == null ? "" : d.mensagem), whatsapp: Boolean(d.whatsapp) }, fechada: true }));
    case "fim":
      return naAberta(conversa, () => ({ status: "", mensagemId: d.mensagemId == null ? null : String(d.mensagemId), fechada: true }));
    case "avaliacao": {
      if (d.nota !== 1 && d.nota !== -1) return conversa;
      return { trocas: conversa.trocas.map((troca) => (troca.mensagemId && troca.mensagemId === d.mensagemId && troca.nota === 0 ? { ...troca, nota: d.nota } : troca)) };
    }
    default:
      return conversa;
  }
}

/** A conversa como texto, para o `sessionStorage`: so as ultimas trocas (a aba nao pode crescer sem fim). */
function paraGuardar(conversa) {
  return JSON.stringify({ trocas: conversa.trocas.slice(-MAXIMO_DE_TROCAS_GUARDADAS) });
}

function trocaLida(bruta) {
  if (!ehObjeto(bruta) || typeof bruta.pergunta !== "string") return null;
  const troca = {
    pergunta: bruta.pergunta,
    status: "",
    cartoes: Array.isArray(bruta.cartoes) ? bruta.cartoes.filter(ehObjeto) : [],
    lista: ehObjeto(bruta.lista) && Array.isArray(bruta.lista.linhas) ? { linhas: bruta.lista.linhas.filter(ehObjeto), total: Number(bruta.lista.total) || 0 } : null,
    texto: typeof bruta.texto === "string" ? bruta.texto : "",
    passagem: passagemLida(bruta.passagem),
    erro: ehObjeto(bruta.erro) ? { texto: String(bruta.erro.texto == null ? "" : bruta.erro.texto), whatsapp: Boolean(bruta.erro.whatsapp) } : null,
    mensagemId: typeof bruta.mensagemId === "string" ? bruta.mensagemId : null,
    nota: bruta.nota === 1 || bruta.nota === -1 ? bruta.nota : 0,
    local: bruta.local === true,
    sugestao: sugestaoLida(bruta.sugestao),
    fechada: true,
  };
  // A pagina mudou no meio da resposta: a troca volta fechada, com o aviso, e a pergunta NAO e reenviada sozinha.
  if (bruta.fechada !== true) troca.erro = { texto: TEXTO_DA_INTERRUPCAO, whatsapp: false };
  return troca;
}

/** O que estava guardado, conferido campo a campo. Qualquer coisa estranha vira conversa vazia. */
function lerGuardada(texto) {
  try {
    const lido = JSON.parse(String(texto));
    if (!ehObjeto(lido) || !Array.isArray(lido.trocas)) return conversaVazia();
    return { trocas: lido.trocas.map(trocaLida).filter(Boolean).slice(-MAXIMO_DE_TROCAS_GUARDADAS) };
  } catch {
    return conversaVazia();
  }
}

const COM_WHATSAPP = " ou fale com a gente pelo WhatsApp.";

/** O que dizer ao visitante quando o `/chat` nao abriu o fluxo. `whatsapp`: a tela mostra o botao do WhatsApp junto. */
function textoDoErroHttp(status, corpo) {
  const erro = ehObjeto(corpo) ? corpo.erro : null;
  if (status === 409) return { texto: "Espere a resposta anterior terminar.", whatsapp: false };
  if (status === 413 || (status === 400 && erro === "longa")) return { texto: "A mensagem ficou longa demais. Mande em partes.", whatsapp: false };
  if (status === 400 && erro === "vazia") return { texto: "Escreva a sua pergunta.", whatsapp: false };
  if (status === 403 && erro === "robo") return { texto: "Não consegui confirmar que você não é um robô. Tente de novo.", whatsapp: false };
  if (status === 429) return { texto: `Você chegou ao limite de mensagens por agora. Tente mais tarde${COM_WHATSAPP}`, whatsapp: true };
  if (status === 503 && erro === "lotado") return { texto: `Muita gente por aqui agora. Tente em instantes${COM_WHATSAPP}`, whatsapp: true };
  if (status === 503) return { texto: "O assistente está indisponível agora. Fale com a gente pelo WhatsApp.", whatsapp: true };
  return { texto: `Não consegui responder agora. Tente de novo em instantes${COM_WHATSAPP}`, whatsapp: true };
}

/**
 * A TELA do widget do chat da loja (o Hobi). Este arquivo nao roda sozinho: o montador (scripts/montar-widget.js) o cola
 * depois do nucleo (nucleo.js), dentro de uma funcao unica, e troca o marcador das imagens pelo mascote embutido.
 *
 * Tres promessas a loja, cada uma escrita no codigo:
 *  - NUNCA quebra nem atrasa a pagina: tudo dentro de try/catch, nada e pedido a rede antes de a pagina estar pronta, o
 *    `/status` tem 4 s para responder (sem resposta, o botao simplesmente nao aparece) e o script da verificacao de robo
 *    so e carregado na primeira mensagem;
 *  - o CSS da loja nao entra aqui nem o daqui sai: a janela mora num Shadow DOM;
 *  - dado do servidor e SEMPRE texto: tudo o que vem da resposta entra por `textContent`; link e foto passam pelas
 *    regras do nucleo (`linkDaLoja`, `fotoPermitida`, `linkDoWhatsApp`) antes de virar `href` ou `src`.
 *
 * O visitante ve primeiro os produtos que resolvem o que ele pediu, e a acao principal e Adicionar ao carrinho; por isso
 * a resposta desenha os cartoes antes do texto.
 */

/* global window, document, fetch, location, sessionStorage, crypto, AbortController, TextDecoder, setTimeout, clearTimeout */
/* global ATALHOS, aberturaDoAtalho, aplicarEvento, contextoDaPagina, conversaVazia, criarLeitorDoFluxo, deveAparecer, enderecoDoCarrinho, fotoPermitida */
/* global lerGuardada, linkDaLoja, linkDoWhatsApp, novaSessaoId, paginaProibida, paraGuardar, pareceDadoSensivel, textoDoErroHttp */

var HOBI_IMAGENS = {"cabeca":"data:image/webp;base64,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","corpo":"data:image/webp;base64,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","feliz":"data:image/webp;base64,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","pensando":"data:image/webp;base64,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"};
// So existe enquanto o proprio arquivo esta sendo executado: e dele que sai o endereco do servico.
var HOBI_SCRIPT = document.currentScript;

var HOBI_AVISO_DE_IA = "Este é um assistente de IA. Preço e estoque vêm da loja. Não envie senha nem dados de cartão.";
var HOBI_ERRO_GERAL = "Não consegui responder agora. Tente de novo em instantes ou fale com a gente pelo WhatsApp.";
var HOBI_LIMITE_DE_CARACTERES = 2000;
var HOBI_AVISA_A_PARTIR_DE = 1800;

var HOBI_CSS = [
  ":host{all:initial}",
  "*,*::before,*::after{box-sizing:border-box}",
  ".hobi{--laranja:#c2410c;--laranja-forte:#9a3412;--laranja-vivo:#ff5000;--led:#ff5000;--tinta:#1a1a1a;--suave:#5f5f5f;--borda:#e4e0dd;--nevoa:#f6f4f2;--papel:#fff;--ambar:#b45309;--erro:#b42318;",
  "font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:1.45;color:var(--tinta);-webkit-font-smoothing:antialiased}",
  "button,textarea,input{font:inherit;color:inherit}",
  "button{cursor:pointer}",
  "button:focus-visible,a:focus-visible,textarea:focus-visible,input:focus-visible{outline:2px solid var(--led);outline-offset:2px}",
  "[hidden]{display:none!important}",
  // O botao flutuante: a cabeca do mascote sobre branco (o recorte so fica bem em superficie clara).
  ".botao{position:fixed;right:20px;bottom:20px;z-index:2147483000;width:64px;height:64px;padding:0;border:2px solid var(--laranja-vivo);border-radius:50%;background:var(--papel);",
  "box-shadow:0 6px 18px rgba(255,80,0,.25),0 1px 3px rgba(0,0,0,.12);display:grid;place-items:center;transition-property:transform,box-shadow;transition-duration:.15s;transition-timing-function:ease-out}",
  ".botao:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(255,80,0,.32),0 2px 4px rgba(0,0,0,.14)}",
  ".botao:active{transform:scale(.96)}",
  ".botao img{width:48px;height:48px;display:block}",
  ".botao svg{width:28px;height:28px;color:var(--laranja)}",
  ".painel{position:fixed;right:20px;bottom:96px;z-index:2147483000;width:380px;max-width:calc(100vw - 24px);height:600px;max-height:calc(100vh - 116px);",
  "display:flex;flex-direction:column;background:var(--papel);border:1px solid var(--borda);border-radius:16px;overflow:hidden;",
  "box-shadow:0 18px 48px rgba(26,26,26,.22),0 2px 8px rgba(0,0,0,.08);animation:hobi-entra .16s ease-out}",
  // So o deslocamento e animado: se o navegador segurar a animacao (aba em segundo plano), a janela nao fica transparente.
  "@keyframes hobi-entra{from{transform:translateY(8px)}to{transform:none}}",
  ".topo{display:flex;align-items:center;gap:10px;padding:10px 8px 10px 14px;background:var(--laranja-vivo);color:#fff}",
  ".avatar{width:38px;height:38px;border-radius:50%;background:var(--papel);display:grid;place-items:center;flex:none}",
  ".avatar img{width:30px;height:30px;display:block}",
  ".quem{flex:1;min-width:0;display:flex;flex-direction:column}",
  ".quem strong{font-size:16px;font-weight:700;display:flex;align-items:center;gap:6px}",
  ".quem strong::after{content:'';width:7px;height:7px;border-radius:50%;background:#fff;box-shadow:0 0 6px rgba(255,255,255,.9)}",
  ".quem span{font-size:12.5px;font-weight:600}",
  ".fechar{width:40px;height:40px;border:0;border-radius:10px;background:transparent;color:#fff;display:grid;place-items:center;transition-property:background-color;transition-duration:.15s}",
  ".fechar:hover{background:rgba(255,255,255,.14)}",
  ".fechar svg{width:20px;height:20px}",
  ".aviso{margin:0;padding:7px 14px;font-size:11.5px;line-height:1.35;color:var(--suave);background:var(--nevoa);border-bottom:1px solid var(--borda)}",
  ".conversa{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:14px;display:flex;flex-direction:column;gap:14px;background:var(--papel)}",
  ".ola{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;padding:6px 4px 0}",
  ".ola img{height:112px;width:auto;display:block}",
  ".ola p{margin:0;font-size:14.5px;max-width:36ch;text-wrap:balance}",
  ".atalhos{display:flex;flex-direction:column;gap:8px;width:100%;margin-top:4px}",
  ".atalho{display:flex;align-items:center;gap:10px;width:100%;min-height:42px;padding:7px 12px;border:1px solid var(--borda);border-radius:12px;background:var(--papel);text-align:left;text-decoration:none;color:var(--tinta);",
  "transition-property:border-color,background-color;transition-duration:.15s}",
  ".atalho:hover{border-color:var(--laranja);background:var(--nevoa)}",
  ".atalho svg{width:18px;height:18px;color:var(--laranja);flex:none}",
  ".pergunta{align-self:flex-end;max-width:86%;margin:0;padding:8px 12px;border-radius:14px 14px 4px 14px;background:var(--laranja);color:#fff;white-space:pre-wrap;overflow-wrap:anywhere}",
  ".resposta{display:flex;flex-direction:column;gap:10px;min-width:0}",
  ".pensando{display:flex;align-items:center;gap:8px;color:var(--suave);font-size:13px}",
  ".pensando img{width:34px;height:34px}",
  ".leds{display:inline-flex;gap:3px;margin-left:2px}",
  ".leds i{width:5px;height:5px;border-radius:1px;background:var(--led);animation:hobi-led 1s infinite both}",
  ".leds i:nth-child(2){animation-delay:.18s}.leds i:nth-child(3){animation-delay:.36s}",
  "@keyframes hobi-led{0%,100%{opacity:.25}40%{opacity:1}}",
  ".cartoes{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}",
  ".cartao{position:relative;display:grid;grid-template-columns:72px 1fr;gap:10px;padding:10px;border:1px solid var(--borda);border-radius:12px;background:var(--papel)}",
  ".numero{position:absolute;top:-7px;left:-7px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:var(--laranja);color:#fff;font-size:11px;font-weight:650;display:grid;place-items:center;font-variant-numeric:tabular-nums}",
  ".foto{width:72px;height:72px;border-radius:8px;background:var(--nevoa);object-fit:contain;outline:1px solid rgba(0,0,0,.08);outline-offset:-1px;display:block}",
  ".sem-foto{display:grid;place-items:center;color:var(--suave)}.sem-foto svg{width:26px;height:26px}",
  ".info{min-width:0;display:flex;flex-direction:column;gap:3px}",
  ".nome{font-weight:600;font-size:13.5px;line-height:1.3;color:var(--tinta);text-decoration:none;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}",
  "a.nome:hover{text-decoration:underline}",
  ".papel{font-size:12px;color:var(--suave)}",
  ".linha{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}",
  ".preco{font-size:15px;font-weight:700;font-variant-numeric:tabular-nums}",
  ".faixa{font-size:12px;font-weight:600;color:var(--laranja)}.faixa.poucas{color:var(--ambar)}.faixa.falta{color:var(--suave)}",
  ".acoes{grid-column:1/-1;display:flex;align-items:center;gap:8px;margin-top:2px}",
  ".ver{font-size:13px;color:var(--laranja);text-decoration:underline;text-underline-offset:2px;margin-right:auto;padding:10px 0}",
  ".qtd{display:inline-flex;align-items:center;border:1px solid var(--borda);border-radius:10px;overflow:hidden;height:40px}",
  ".qtd button{width:34px;height:100%;border:0;background:var(--papel);font-size:16px;line-height:1;transition-property:background-color;transition-duration:.15s}",
  ".qtd button:hover{background:var(--nevoa)}",
  ".qtd input{width:34px;height:100%;border:0;border-inline:1px solid var(--borda);text-align:center;background:var(--papel);font-variant-numeric:tabular-nums;-moz-appearance:textfield;padding:0}",
  ".qtd input::-webkit-outer-spin-button,.qtd input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}",
  ".principal{height:40px;padding:0 14px;border:0;border-radius:10px;background:var(--laranja);color:#fff;font-weight:600;white-space:nowrap;transition-property:background-color,transform;transition-duration:.15s}",
  ".principal:hover{background:var(--laranja-forte)}.principal:active{transform:scale(.97)}",
  ".principal[disabled]{opacity:.6;cursor:default;transform:none}",
  ".principal.feito{background:var(--nevoa);color:var(--laranja);border:1px solid var(--laranja)}",
  ".recado{grid-column:1/-1;margin:0;font-size:12px;color:var(--erro)}",
  ".lista{border:1px solid var(--borda);border-radius:12px;overflow:hidden}",
  ".lista table{width:100%;border-collapse:collapse;font-size:13px}",
  ".lista td{padding:7px 10px;border-bottom:1px solid var(--borda);vertical-align:top}",
  ".lista td.q{white-space:nowrap;color:var(--suave);font-variant-numeric:tabular-nums}",
  ".lista td.v{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}",
  ".lista small{display:block;color:var(--suave);font-size:12px}",
  ".lista .nada{color:var(--suave)}",
  ".lista tfoot td{border-bottom:0;font-weight:700;background:var(--nevoa)}",
  ".lista .pe{padding:10px;display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--borda)}",
  ".lista .pe .principal{width:100%}",
  ".texto{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;text-wrap:pretty}",
  ".erro{margin:0;color:var(--erro)}",
  ".whats{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:0 14px;border:1px solid var(--laranja);border-radius:10px;color:var(--laranja);font-weight:600;text-decoration:none;align-self:flex-start;",
  "transition-property:background-color;transition-duration:.15s}",
  ".whats:hover{background:var(--nevoa)}.whats svg{width:18px;height:18px}",
  ".fora{margin:0;font-size:12px;color:var(--suave)}",
  ".nota{display:flex;gap:4px;align-items:center}",
  ".nota button{width:40px;height:36px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--suave);display:grid;place-items:center;transition-property:background-color,color;transition-duration:.15s}",
  ".nota button:hover{background:var(--nevoa);color:var(--tinta)}",
  ".nota button svg{width:16px;height:16px}",
  ".nota button[aria-pressed=true]{color:var(--laranja);background:var(--nevoa);border-color:var(--borda)}",
  ".nota button[disabled]{cursor:default}",
  ".nota span{font-size:12px;color:var(--suave)}",
  ".confirma{display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fff7e6;border-top:1px solid #f1d9a6;font-size:13px}",
  ".confirma span{flex:1}",
  ".confirma button{height:36px;padding:0 10px;border:1px solid var(--borda);border-radius:8px;background:var(--papel)}",
  ".campo{display:flex;align-items:flex-end;gap:8px;padding:10px;border-top:1px solid var(--borda);background:var(--papel)}",
  ".campo textarea{flex:1;min-height:40px;max-height:140px;padding:9px 12px;border:1px solid var(--borda);border-radius:12px;resize:none;background:var(--papel);line-height:1.4}",
  ".campo textarea::placeholder{color:var(--suave)}",
  ".campo.em-lista textarea{min-height:104px}",
  ".enviar{width:40px;height:40px;flex:none;border:0;border-radius:12px;background:var(--laranja);color:#fff;display:grid;place-items:center;transition-property:background-color,transform;transition-duration:.15s}",
  ".enviar:hover{background:var(--laranja-forte)}.enviar:active{transform:scale(.96)}.enviar[disabled]{opacity:.5;cursor:default;transform:none}",
  ".enviar svg{width:18px;height:18px}",
  ".contador{position:absolute;right:62px;bottom:14px;font-size:11px;color:var(--suave);font-variant-numeric:tabular-nums;background:var(--papel);padding:0 4px}",
  ".contador.cheio{color:var(--erro)}",
  ".campo{position:relative}",
  // A chamada: balao a esquerda do robo; no lugar da "pontinha", tres arcos de sinal saem da antena dele (acendem uma vez).
  ".chamada{position:fixed;right:124px;bottom:30px;z-index:2147483000;max-width:240px;display:flex;align-items:flex-start;gap:6px;padding:10px 8px 10px 14px;background:var(--papel);",
  "border:1px solid var(--borda);border-radius:14px;box-shadow:0 8px 24px rgba(26,26,26,.16),0 1px 3px rgba(0,0,0,.08);animation:hobi-entra .2s ease-out;cursor:pointer}",
  ".chamada strong{display:block;font-size:15px;font-weight:700;color:var(--laranja)}",
  ".chamada span{display:block;font-size:13px;color:var(--tinta);text-wrap:balance}",
  ".chamada button{width:28px;height:28px;margin:-4px -2px 0 0;border:0;border-radius:8px;background:transparent;color:var(--suave);display:grid;place-items:center;flex:none}",
  ".chamada button:hover{background:var(--nevoa)}.chamada button svg{width:14px;height:14px}",
  ".sinal{position:absolute;right:-34px;top:12px;width:30px;height:40px;overflow:visible;color:var(--laranja-vivo)}",
  ".sinal path{fill:none;stroke:currentColor;stroke-width:3.2;stroke-linecap:round;opacity:.15;animation:hobi-sinal 1.6s ease-out .3s 1 forwards}",
  ".sinal path:nth-child(2){animation-delay:.55s}.sinal path:nth-child(3){animation-delay:.8s}",
  "@keyframes hobi-sinal{to{opacity:1}}",
  ".sugestao{align-self:flex-start;display:inline-flex;align-items:center;gap:8px;min-height:40px;max-width:100%;padding:8px 12px;border:1px solid var(--laranja);border-radius:10px;background:var(--papel);color:var(--laranja);font-weight:600;text-align:left;transition-property:background-color;transition-duration:.15s}",
  ".sugestao:hover{background:var(--nevoa)}",
  ".fala{margin:0;align-self:flex-start;max-width:90%;padding:8px 12px;border-radius:14px 14px 14px 4px;background:var(--nevoa);white-space:pre-wrap;overflow-wrap:anywhere}",
  "@media (max-width:480px){.chamada{right:108px;bottom:22px;max-width:190px;padding:8px 6px 8px 12px}.chamada strong{font-size:14px}.chamada span{font-size:12px}}",
  "@media (max-width:480px){.painel{inset:0;width:100%;max-width:none;height:100%;max-height:none;border:0;border-radius:0}.botao{right:14px;bottom:14px;width:58px;height:58px}.botao img{width:44px;height:44px}.aberto .botao{display:none}}",
  "@media (prefers-reduced-motion:reduce){.chamada{animation:none}.sinal path{animation:none;opacity:1}}",
  "@media (prefers-reduced-motion:reduce){.painel,.leds i{animation:none}.botao,.principal,.enviar{transition:none}.leds i{opacity:.8}}",
].join("");

// Os desenhos dos icones sao constantes deste arquivo (nunca dado do servidor).
var HOBI_ICONES = {
  conversa: "M4 5h16v11H9l-5 4z",
  fechar: "M6 6l12 12M18 6L6 18",
  enviar: "M4 12l16-8-6 16-3-7z",
  lupa: "M11 4a7 7 0 105 12l4 4M11 4a7 7 0 010 14",
  lista: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  duvida: "M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01M12 3a9 9 0 100 18 9 9 0 000-18z",
  telefone: "M5 4h4l2 5-3 2a12 12 0 005 5l2-3 5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z",
  caixa: "M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8",
  joia: "M7 11v8H4v-8zM7 11l4-7a2 2 0 013 2l-1 4h5a2 2 0 012 2l-2 6a2 2 0 01-2 1H7",
  ruim: "M17 13V5h3v8zM17 13l-4 7a2 2 0 01-3-2l1-4H6a2 2 0 01-2-2l2-6a2 2 0 012-1h9",
};

function hobiIcone(nome) {
  var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  var traco = document.createElementNS("http://www.w3.org/2000/svg", "path");
  traco.setAttribute("d", HOBI_ICONES[nome]);
  svg.appendChild(traco);
  return svg;
}

/** Um elemento com classe, texto (sempre `textContent`) e atributos. */
function hobiEl(tag, classe, texto, atributos) {
  var no = document.createElement(tag);
  if (classe) no.className = classe;
  if (texto != null) no.textContent = String(texto);
  if (atributos) Object.keys(atributos).forEach(function (nome) { no.setAttribute(nome, atributos[nome]); });
  return no;
}

function hobiImagem(nome, alt) {
  var imagem = hobiEl("img", null, null, { alt: alt || "" });
  imagem.src = HOBI_IMAGENS[nome];
  return imagem;
}

function hobiReais(valor) {
  var numero = Number(valor);
  if (valor == null || !isFinite(numero)) return "";
  return numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

var hobiGuardado = {
  ler: function (chave) {
    try {
      return sessionStorage.getItem("hobi:" + chave);
    } catch {
      return null;
    }
  },
  gravar: function (chave, valor) {
    try {
      sessionStorage.setItem("hobi:" + chave, valor);
    } catch {
      // Aba privada ou armazenamento cheio: a janela funciona, so nao lembra.
    }
  },
  apagar: function (chave) {
    try {
      sessionStorage.removeItem("hobi:" + chave);
    } catch {
      // idem
    }
  },
};

function hobiBuscarStatus(servico) {
  var controle = new AbortController();
  var prazo = setTimeout(function () { controle.abort(); }, 4000);
  return fetch(servico + "/status", { signal: controle.signal, credentials: "omit" })
    .then(function (resposta) { return resposta.ok ? resposta.json() : null; })
    .catch(function () { return null; })
    .then(function (status) {
      clearTimeout(prazo);
      return status && typeof status === "object" ? status : null;
    });
}

// ---------- a verificacao de robo (Cloudflare Turnstile), so na primeira mensagem ----------
var hobiRoboCarregando = null;
function hobiCarregarRobo() {
  if (window.turnstile) return Promise.resolve();
  if (!hobiRoboCarregando) {
    hobiRoboCarregando = new Promise(function (ok, falha) {
      var script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = function () { ok(); };
      script.onerror = function () {
        hobiRoboCarregando = null;
        falha(new Error("robo"));
      };
      document.head.appendChild(script);
    });
  }
  return hobiRoboCarregando;
}

/** O token do desafio. O contêiner fica FORA do Shadow DOM, por cima da janela: e onde o desafio aparece se for pedido. */
function hobiObterToken(chavePublica) {
  return hobiCarregarRobo().then(function () {
    return new Promise(function (ok, falha) {
      var caixa = document.createElement("div");
      caixa.id = "hobi-4hobby-robo";
      caixa.style.cssText = "position:fixed;right:32px;bottom:170px;z-index:2147483600;";
      document.body.appendChild(caixa);
      var id = null;
      var terminou = false;
      function terminar(como, valor) {
        if (terminou) return;
        terminou = true;
        clearTimeout(prazo);
        try {
          if (id != null) window.turnstile.remove(id);
        } catch {
          // o desafio ja saiu
        }
        caixa.remove();
        como(valor);
      }
      var prazo = setTimeout(function () { terminar(falha, new Error("robo")); }, 60000);
      try {
        id = window.turnstile.render(caixa, {
          sitekey: chavePublica,
          appearance: "interaction-only",
          callback: function (token) { terminar(ok, token); },
          "error-callback": function () { terminar(falha, new Error("robo")); },
        });
      } catch (erro) {
        terminar(falha, erro);
      }
    });
  });
}

function hobiIniciar(servico, status) {
  var whatsapp = linkDoWhatsApp(status.whatsapp);
  var nome = String(status.nome || "Assistente").slice(0, 40);
  var conversa = lerGuardada(hobiGuardado.ler("conversa"));
  var sessaoId = hobiGuardado.ler("sessao");
  if (!/^[a-f0-9]{32}$/.test(sessaoId || "")) {
    sessaoId = novaSessaoId(crypto.getRandomValues(new Uint8Array(16)));
    hobiGuardado.gravar("sessao", sessaoId);
  }
  var ocupado = false;
  var emLista = false;
  // Um no por troca. A troca fechada nao e redesenhada: e nela que moram a quantidade digitada e o "Adicionado".
  var nos = [];

  var hospedeiro = hobiEl("div", null, null, { id: "hobi-4hobby" });
  var raiz = hospedeiro.attachShadow({ mode: "open" });
  raiz.appendChild(hobiEl("style", null, HOBI_CSS));
  var base = hobiEl("div", "hobi");
  raiz.appendChild(base);

  var botao = hobiEl("button", "botao", null, { type: "button", "aria-label": "Abrir o chat com " + nome, "aria-expanded": "false" });
  botao.appendChild(HOBI_IMAGENS.cabeca ? hobiImagem("cabeca") : hobiIcone("conversa"));

  var painel = hobiEl("section", "painel", null, { role: "dialog", "aria-label": nome + ", Assistente virtual da 4hobby" });
  painel.hidden = true;
  var topo = hobiEl("header", "topo");
  var avatar = hobiEl("span", "avatar");
  avatar.appendChild(HOBI_IMAGENS.cabeca ? hobiImagem("cabeca") : hobiIcone("conversa"));
  var quem = hobiEl("div", "quem");
  quem.appendChild(hobiEl("strong", null, nome));
  quem.appendChild(hobiEl("span", null, "Assistente virtual da 4hobby"));
  var fechar = hobiEl("button", "fechar", null, { type: "button", "aria-label": "Fechar o chat" });
  fechar.appendChild(hobiIcone("fechar"));
  topo.appendChild(avatar);
  topo.appendChild(quem);
  topo.appendChild(fechar);

  var area = hobiEl("div", "conversa", null, { "aria-live": "polite" });
  var confirma = hobiEl("div", "confirma", null, { role: "alert" });
  confirma.hidden = true;
  var campo = hobiEl("form", "campo");
  var texto = hobiEl("textarea", null, null, { rows: "1", maxlength: String(HOBI_LIMITE_DE_CARACTERES), "aria-label": "Sua mensagem", placeholder: "Escreva o que você procura…" });
  var contador = hobiEl("span", "contador");
  contador.hidden = true;
  var enviar = hobiEl("button", "enviar", null, { type: "submit", "aria-label": "Enviar" });
  enviar.appendChild(hobiIcone("enviar"));
  campo.appendChild(texto);
  campo.appendChild(contador);
  campo.appendChild(enviar);

  painel.appendChild(topo);
  painel.appendChild(hobiEl("p", "aviso", HOBI_AVISO_DE_IA));
  painel.appendChild(area);
  painel.appendChild(confirma);
  painel.appendChild(campo);
  base.appendChild(painel);
  base.appendChild(botao);

  // A chamada ao lado do robo (pedido do dono em 22/11/2026). Aparece 4 s depois, so com a janela fechada; fechada no X ou
  // depois de o visitante abrir o chat, nao volta naquela aba.
  var chamada = hobiEl("div", "chamada", null, { role: "note" });
  chamada.hidden = true;
  var textoDaChamada = hobiEl("div");
  textoDaChamada.appendChild(hobiEl("strong", null, nome));
  textoDaChamada.appendChild(hobiEl("span", null, "Dúvida no seu projeto? Pergunta pra mim"));
  var dispensar = hobiEl("button", null, null, { type: "button", "aria-label": "Fechar o aviso" });
  dispensar.appendChild(hobiIcone("fechar"));
  var sinal = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  sinal.setAttribute("class", "sinal");
  sinal.setAttribute("viewBox", "0 0 24 30");
  sinal.setAttribute("aria-hidden", "true");
  ["M18 11a4 4 0 010 8", "M14 7a9 9 0 010 16", "M10 3a14 14 0 010 24"].forEach(function (desenho) {
    var arco = document.createElementNS("http://www.w3.org/2000/svg", "path");
    arco.setAttribute("d", desenho);
    sinal.appendChild(arco);
  });
  // Os arcos abrem PARA O BALAO: o sinal sai da antena do robo (a direita) em direcao a mensagem.
  sinal.setAttribute("transform", "scale(-1 1)");
  chamada.appendChild(textoDaChamada);
  chamada.appendChild(dispensar);
  chamada.appendChild(sinal);
  base.appendChild(chamada);
  function esconderChamada() {
    chamada.hidden = true;
    hobiGuardado.gravar("chamada", "vista");
  }
  dispensar.onclick = function (evento) {
    evento.stopPropagation();
    esconderChamada();
  };
  chamada.onclick = function () {
    esconderChamada();
    abrir();
  };
  if (hobiGuardado.ler("chamada") !== "vista") {
    setTimeout(function () {
      if (painel.hidden && hobiGuardado.ler("chamada") !== "vista") chamada.hidden = false;
    }, 4000);
  }

  function botaoDoWhatsApp(rotulo, endereco) {
    // `endereco`: o WhatsApp que o servidor escolheu (o tecnico, no suporte); sem ele, o comercial do /status.
    var destino = linkDoWhatsApp(endereco) || whatsapp;
    if (!destino) return null;
    var link = hobiEl("a", "whats", null, { href: destino, target: "_blank", rel: "noopener noreferrer" });
    link.appendChild(hobiIcone("telefone"));
    link.appendChild(hobiEl("span", null, rotulo || "Falar no WhatsApp"));
    return link;
  }

  function guardar() {
    hobiGuardado.gravar("conversa", paraGuardar(conversa));
  }

  function rolarParaOFim() {
    area.scrollTop = area.scrollHeight;
  }

  // ---------- carrinho da loja (o mesmo caminho do botao Comprar da Loja Integrada) ----------
  function comprar(liId, quantidade) {
    var endereco = enderecoDoCarrinho(liId, quantidade);
    if (!endereco) return Promise.resolve({ ok: false, mensagem: "Não consegui adicionar este item." });
    return fetch(endereco, { credentials: "same-origin", headers: { "X-Requested-With": "XMLHttpRequest", Accept: "application/json" } })
      .then(function (resposta) { return resposta.json(); })
      .then(function (corpo) {
        if (corpo && corpo.status === "sucesso") return { ok: true };
        return { ok: false, mensagem: String((corpo && corpo.mensagem) || "A loja não adicionou este item.") };
      })
      .catch(function () {
        // Sem resposta legivel: faz o que a propria loja faz, vai para o endereco de comprar.
        return { ok: false, navegar: endereco };
      });
  }

  function atualizarCarrinhoDoTopo() {
    try {
      var jq = window.jQuery;
      if (typeof jq === "function" && jq("#carrinho-mini").length) {
        jq("#carrinho-mini").load("/carrinho/mini", function () {
          if (typeof window.atualizarCarrinhoMini === "function") window.atualizarCarrinhoMini();
        });
      }
    } catch {
      // O carrinho do topo e da loja: se ela mudou, o item ja esta no carrinho do mesmo jeito.
    }
  }

  function desenharCartao(produto, posicao) {
    var item = hobiEl("li", "cartao");
    item.appendChild(hobiEl("span", "numero", String(posicao + 1)));
    var foto = fotoPermitida(produto.foto, servico);
    if (foto) {
      var imagem = hobiEl("img", "foto", null, { alt: "" });
      imagem.onerror = function () { imagem.replaceWith(semFoto()); };
      imagem.src = foto;
      item.appendChild(imagem);
    } else {
      item.appendChild(semFoto());
    }
    var info = hobiEl("div", "info");
    var link = linkDaLoja(produto.link, location.origin);
    var nomeDoProduto = String(produto.nome == null ? "" : produto.nome);
    info.appendChild(link ? hobiEl("a", "nome", nomeDoProduto, { href: link }) : hobiEl("span", "nome", nomeDoProduto));
    if (produto.papel) info.appendChild(hobiEl("span", "papel", String(produto.papel)));
    var linha = hobiEl("div", "linha");
    if (produto.preco != null) linha.appendChild(hobiEl("strong", "preco", hobiReais(produto.preco)));
    var faixa = String(produto.faixa == null ? "" : produto.faixa);
    var emFalta = faixa === "em falta";
    if (faixa) linha.appendChild(hobiEl("span", "faixa" + (emFalta ? " falta" : faixa === "poucas unidades" ? " poucas" : ""), faixa.charAt(0).toUpperCase() + faixa.slice(1)));
    info.appendChild(linha);
    item.appendChild(info);

    var acoes = hobiEl("div", "acoes");
    if (link) acoes.appendChild(hobiEl("a", "ver", "Ver produto", { href: link }));
    if (!emFalta && enderecoDoCarrinho(produto.liId, 1)) {
      var qtd = hobiEl("span", "qtd");
      var menos = hobiEl("button", null, "−", { type: "button", "aria-label": "Diminuir a quantidade" });
      var quantos = hobiEl("input", null, null, { type: "number", min: "1", max: "99", value: "1", inputmode: "numeric", "aria-label": "Quantidade" });
      var mais = hobiEl("button", null, "+", { type: "button", "aria-label": "Aumentar a quantidade" });
      var lida = function () { return Math.min(99, Math.max(1, Math.round(Number(quantos.value)) || 1)); };
      menos.onclick = function () { quantos.value = String(Math.max(1, lida() - 1)); };
      mais.onclick = function () { quantos.value = String(Math.min(99, lida() + 1)); };
      quantos.onchange = function () { quantos.value = String(lida()); };
      qtd.appendChild(menos);
      qtd.appendChild(quantos);
      qtd.appendChild(mais);
      var adicionar = hobiEl("button", "principal", "Adicionar", { type: "button" });
      var recado = hobiEl("p", "recado");
      recado.hidden = true;
      adicionar.onclick = function () {
        adicionar.disabled = true;
        recado.hidden = true;
        adicionar.textContent = "Adicionando…";
        comprar(produto.liId, lida()).then(function (resultado) {
          if (resultado.navegar) {
            location.href = resultado.navegar;
            return;
          }
          adicionar.disabled = false;
          if (resultado.ok) {
            adicionar.textContent = "Adicionado";
            adicionar.className = "principal feito";
            atualizarCarrinhoDoTopo();
          } else {
            adicionar.textContent = "Adicionar";
            recado.textContent = resultado.mensagem;
            recado.hidden = false;
          }
        });
      };
      acoes.appendChild(qtd);
      acoes.appendChild(adicionar);
      item.appendChild(acoes);
      item.appendChild(recado);
    } else if (link) {
      item.appendChild(acoes);
    }
    return item;
  }

  function semFoto() {
    var vazio = hobiEl("div", "foto sem-foto");
    vazio.appendChild(hobiIcone("caixa"));
    return vazio;
  }

  function desenharLista(lista) {
    var caixa = hobiEl("div", "lista");
    var tabela = hobiEl("table");
    var corpo = hobiEl("tbody");
    var paraComprar = [];
    lista.linhas.forEach(function (linha) {
      var tr = hobiEl("tr");
      var quantidade = Math.max(1, Math.round(Number(linha.quantidade)) || 1);
      tr.appendChild(hobiEl("td", "q", quantidade + "×"));
      var meio = hobiEl("td");
      var achado = linha.achado && typeof linha.achado === "object" ? linha.achado : null;
      if (achado) {
        var link = linkDaLoja(achado.link, location.origin);
        meio.appendChild(link ? hobiEl("a", "nome", String(achado.nome || ""), { href: link }) : hobiEl("span", "nome", String(achado.nome || "")));
        meio.appendChild(hobiEl("small", null, "Pedido: " + String(linha.pedido == null ? "" : linha.pedido) + (achado.faixa ? " · " + achado.faixa : "")));
        if (achado.faixa !== "em falta" && enderecoDoCarrinho(achado.liId, Math.min(99, quantidade))) paraComprar.push({ liId: achado.liId, quantidade: Math.min(99, quantidade) });
      } else {
        meio.appendChild(hobiEl("span", "nada", String(linha.pedido == null ? "" : linha.pedido)));
        meio.appendChild(hobiEl("small", null, "Não achei na loja"));
      }
      tr.appendChild(meio);
      tr.appendChild(hobiEl("td", "v", linha.subtotal == null ? "" : hobiReais(linha.subtotal)));
      corpo.appendChild(tr);
    });
    tabela.appendChild(corpo);
    var pe = hobiEl("tfoot");
    var total = hobiEl("tr");
    total.appendChild(hobiEl("td", null, "Total", { colspan: "2" }));
    total.appendChild(hobiEl("td", "v", hobiReais(lista.total)));
    pe.appendChild(total);
    tabela.appendChild(pe);
    caixa.appendChild(tabela);
    if (paraComprar.length) {
      var rodape = hobiEl("div", "pe");
      var todos = hobiEl("button", "principal", paraComprar.length === 1 ? "Adicionar o item ao carrinho" : "Adicionar os " + paraComprar.length + " itens ao carrinho", { type: "button" });
      var recado = hobiEl("p", "recado");
      recado.hidden = true;
      todos.onclick = function () {
        todos.disabled = true;
        recado.hidden = true;
        var feitos = 0;
        var falhas = 0;
        // Um por vez: e o mesmo endereco de comprar da loja, e ela guarda o carrinho na sessao do visitante.
        var seguir = function (posicao) {
          if (posicao >= paraComprar.length) {
            atualizarCarrinhoDoTopo();
            todos.disabled = falhas === 0;
            todos.textContent = falhas === 0 ? (feitos === 1 ? "Item adicionado" : feitos + " itens adicionados") : "Tentar de novo";
            if (falhas === 0) todos.className = "principal feito";
            if (falhas > 0) {
              recado.textContent = falhas === 1 ? "1 item não entrou no carrinho." : falhas + " itens não entraram no carrinho.";
              recado.hidden = false;
            }
            return;
          }
          todos.textContent = "Adicionando " + (posicao + 1) + " de " + paraComprar.length + "…";
          comprar(paraComprar[posicao].liId, paraComprar[posicao].quantidade).then(function (resultado) {
            if (resultado.ok) feitos++;
            else falhas++;
            seguir(posicao + 1);
          });
        };
        seguir(0);
      };
      rodape.appendChild(todos);
      rodape.appendChild(recado);
      caixa.appendChild(rodape);
    }
    return caixa;
  }

  function desenharNota(troca) {
    var caixa = hobiEl("div", "nota");
    var boa = hobiEl("button", null, null, { type: "button", "aria-label": "Resposta útil", "aria-pressed": String(troca.nota === 1) });
    boa.appendChild(hobiIcone("joia"));
    var ruim = hobiEl("button", null, null, { type: "button", "aria-label": "Resposta ruim", "aria-pressed": String(troca.nota === -1) });
    ruim.appendChild(hobiIcone("ruim"));
    var obrigado = hobiEl("span", null, troca.nota ? "Obrigado pela avaliação." : "");
    function travar() {
      boa.disabled = true;
      ruim.disabled = true;
    }
    if (troca.nota) travar();
    function avaliar(nota) {
      boa.setAttribute("aria-pressed", String(nota === 1));
      ruim.setAttribute("aria-pressed", String(nota === -1));
      travar();
      obrigado.textContent = "Obrigado pela avaliação.";
      conversa = aplicarEvento(conversa, { evento: "avaliacao", dados: { mensagemId: troca.mensagemId, nota: nota } });
      guardar();
      fetch(servico + "/avaliar", { method: "POST", credentials: "omit", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessaoId: sessaoId, mensagemId: troca.mensagemId, nota: nota }) }).catch(function () {});
    }
    boa.onclick = function () { avaliar(1); };
    ruim.onclick = function () { avaliar(-1); };
    caixa.appendChild(boa);
    caixa.appendChild(ruim);
    caixa.appendChild(obrigado);
    return caixa;
  }

  function desenharTroca(troca) {
    var no = hobiEl("div", "resposta");
    if (troca.local) {
      // A fala de abertura de um atalho: do Hobi, sem pergunta, sem nota (nao passou pela IA).
      no.appendChild(hobiEl("p", "fala", troca.texto));
      if (troca.sugestao) {
        var sugerido = hobiEl("button", "sugestao", null, { type: "button" });
        sugerido.appendChild(hobiIcone("caixa"));
        sugerido.appendChild(hobiEl("span", null, troca.sugestao.rotulo));
        sugerido.onclick = function () { perguntar(troca.sugestao.mensagem); };
        no.appendChild(sugerido);
      }
      no.__fechada = true;
      return no;
    }
    no.appendChild(hobiEl("p", "pergunta", troca.pergunta));
    if (troca.cartoes.length) {
      var cartoes = hobiEl("ol", "cartoes");
      troca.cartoes.forEach(function (produto, posicao) { cartoes.appendChild(desenharCartao(produto, posicao)); });
      no.appendChild(cartoes);
    }
    if (troca.lista) no.appendChild(desenharLista(troca.lista));
    if (troca.texto) no.appendChild(hobiEl("p", "texto", troca.texto));
    if (troca.erro) {
      no.appendChild(hobiEl("p", "erro", troca.erro.texto || HOBI_ERRO_GERAL));
      var socorro = troca.erro.whatsapp ? botaoDoWhatsApp() : null;
      if (socorro) no.appendChild(socorro);
    }
    if (troca.passagem) {
      var tecnico = troca.passagem.tipo === "tecnico";
      var passar = botaoDoWhatsApp(tecnico ? "Falar com o suporte técnico" : "Continuar no WhatsApp", troca.passagem.url);
      if (passar) no.appendChild(passar);
      if (troca.passagem.foraDoHorario) no.appendChild(hobiEl("p", "fora", "Estamos fora do horário de atendimento: respondemos no próximo dia útil."));
    }
    if (!troca.fechada) {
      var pensando = hobiEl("div", "pensando");
      if (HOBI_IMAGENS.pensando) pensando.appendChild(hobiImagem("pensando"));
      pensando.appendChild(hobiEl("span", null, troca.status || "Pensando…"));
      var leds = hobiEl("span", "leds", null, { "aria-hidden": "true" });
      leds.appendChild(hobiEl("i"));
      leds.appendChild(hobiEl("i"));
      leds.appendChild(hobiEl("i"));
      pensando.appendChild(leds);
      no.appendChild(pensando);
    } else if (troca.mensagemId && !troca.erro) {
      no.appendChild(desenharNota(troca));
    }
    no.__fechada = troca.fechada;
    return no;
  }

  function desenharSaudacao() {
    var ola = hobiEl("div", "ola");
    if (HOBI_IMAGENS.corpo) ola.appendChild(hobiImagem("corpo", nome + ", o robô assistente da 4hobby"));
    ola.appendChild(hobiEl("p", null, String(status.boasVindas || "")));
    var atalhos = hobiEl("div", "atalhos");
    var ICONE_DO_ATALHO = { componente: "lupa", duvida: "duvida", lista: "lista" };
    // Todo atalho ABRE a conversa: o Hobi fala primeiro (fala feita aqui, sem IA) e o campo fica pronto para a resposta.
    ATALHOS.forEach(function (atalho) {
      var botaoDoAtalho = hobiEl("button", "atalho", null, { type: "button" });
      botaoDoAtalho.appendChild(hobiIcone(ICONE_DO_ATALHO[atalho.id]));
      botaoDoAtalho.appendChild(hobiEl("span", null, atalho.rotulo));
      botaoDoAtalho.onclick = function () {
        var abertura = aberturaDoAtalho(atalho.id, contextoAtual());
        if (!abertura) return;
        aplicar("abertura", { texto: abertura.texto, sugestao: abertura.sugestao });
        modoLista(abertura.modoLista);
        texto.focus();
      };
      atalhos.appendChild(botaoDoAtalho);
    });
    if (whatsapp) {
      var falar = hobiEl("a", "atalho", null, { href: whatsapp, target: "_blank", rel: "noopener noreferrer" });
      falar.appendChild(hobiIcone("telefone"));
      falar.appendChild(hobiEl("span", null, "Falar no WhatsApp"));
      atalhos.appendChild(falar);
    }
    ola.appendChild(atalhos);
    return ola;
  }

  function modoLista(ligar) {
    emLista = ligar;
    campo.className = ligar ? "campo em-lista" : "campo";
    texto.placeholder = ligar ? "Cole sua lista aqui" : "Escreva o que você procura…";
    ajustarAltura();
  }

  /** Poe a tela de acordo com a conversa: so a troca aberta (e o que ainda nao foi desenhado) e refeita. */
  function desenhar() {
    if (conversa.trocas.length === 0) {
      nos = [];
      area.replaceChildren(desenharSaudacao());
      return;
    }
    if (nos.length === 0) area.replaceChildren();
    conversa.trocas.forEach(function (troca, posicao) {
      var atual = nos[posicao];
      if (atual && atual.__fechada) return;
      var novo = desenharTroca(troca);
      if (atual) atual.replaceWith(novo);
      else area.appendChild(novo);
      nos[posicao] = novo;
    });
    rolarParaOFim();
  }

  function aplicar(evento, dadosDoEvento) {
    conversa = aplicarEvento(conversa, { evento: evento, dados: dadosDoEvento });
    guardar();
    desenhar();
  }

  function ocupar(sim) {
    ocupado = sim;
    enviar.disabled = sim;
    texto.disabled = sim;
    if (!sim && !painel.hidden) texto.focus();
  }

  function contextoAtual() {
    var sku = document.querySelector("[itemprop=sku]");
    var nomeDoProduto = document.querySelector("h1.nome-produto, .produto h1, [itemprop=name]");
    return contextoDaPagina({ classeDoBody: document.body.className, skuNaPagina: sku ? sku.textContent : "", nomeNaPagina: nomeDoProduto ? nomeDoProduto.textContent : "" });
  }

  /** Le o fluxo do `/chat` ate o fim. Devolve `true` se algum evento chegou. */
  function lerFluxo(resposta) {
    var leitor = criarLeitorDoFluxo();
    var chegou = false;
    function receber(pedaco) {
      leitor.alimentar(pedaco).forEach(function (item) {
        chegou = true;
        if (item.evento === "passe") {
          if (typeof item.dados.passe === "string") hobiGuardado.gravar("passe", item.dados.passe);
          return;
        }
        aplicar(item.evento, item.dados);
      });
    }
    if (!resposta.body || !resposta.body.getReader) return resposta.text().then(function (tudo) { receber(tudo); return chegou; });
    var corrente = resposta.body.getReader();
    var decodificador = new TextDecoder();
    function proximo() {
      return corrente.read().then(function (parte) {
        if (parte.done) {
          receber(decodificador.decode());
          return chegou;
        }
        receber(decodificador.decode(parte.value, { stream: true }));
        return proximo();
      });
    }
    return proximo();
  }

  function falhar(resultado) {
    aplicar("erro", { mensagem: resultado.texto, whatsapp: resultado.whatsapp });
  }

  /** Uma tentativa de mandar a mensagem. `repetir`: ainda pode refazer o desafio do robo uma vez se o passe for recusado. */
  function mandar(mensagem, repetir) {
    var passe = hobiGuardado.ler("passe");
    var comToken = passe
      ? Promise.resolve(null)
      : (aplicar("status", { texto: "Conferindo…" }), hobiObterToken(String(status.turnstileSiteKey || "")));
    return comToken
      .then(function (token) {
        aplicar("status", { texto: "Pensando…" });
        var corpo = { sessaoId: sessaoId, mensagem: mensagem, contexto: contextoAtual() };
        if (passe) corpo.passe = passe;
        else corpo.turnstileToken = token;
        return fetch(servico + "/chat", { method: "POST", credentials: "omit", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      })
      .then(function (resposta) {
        var tipo = resposta.headers.get("content-type") || "";
        if (resposta.ok && tipo.indexOf("text/event-stream") === 0) return lerFluxo(resposta).then(function () { return null; });
        return resposta
          .json()
          .catch(function () { return null; })
          .then(function (corpo) {
            if (resposta.status === 403 && corpo && corpo.erro === "robo" && passe && repetir) {
              hobiGuardado.apagar("passe");
              return mandar(mensagem, false);
            }
            falhar(textoDoErroHttp(resposta.status, corpo));
            return null;
          });
      })
      .catch(function (erro) {
        falhar(erro && erro.message === "robo" ? textoDoErroHttp(403, { erro: "robo" }) : textoDoErroHttp(0, null));
      });
  }

  function perguntar(mensagem) {
    if (ocupado) return;
    ocupar(true);
    confirma.hidden = true;
    texto.value = "";
    modoLista(false);
    atualizarContador();
    aplicar("pergunta", { texto: mensagem });
    mandar(mensagem, true).then(function () {
      // O fluxo acabou sem `fim` nem `erro` (cortado no meio): a troca nao pode ficar "pensando" para sempre.
      var ultima = conversa.trocas[conversa.trocas.length - 1];
      if (ultima && !ultima.fechada) falhar(textoDoErroHttp(0, null));
      ocupar(false);
    });
  }

  function tentarEnviar() {
    var mensagem = texto.value.trim();
    if (!mensagem || ocupado) return;
    var sensivel = pareceDadoSensivel(mensagem);
    if (sensivel && confirma.hidden) {
      confirma.replaceChildren();
      confirma.appendChild(hobiEl("span", null, sensivel === "cpf" ? "Parece um CPF. Enviar mesmo assim?" : "Parece um número de cartão. Enviar mesmo assim?"));
      var sim = hobiEl("button", null, "Enviar", { type: "button" });
      var nao = hobiEl("button", null, "Corrigir", { type: "button" });
      sim.onclick = function () { perguntar(mensagem); };
      nao.onclick = function () {
        confirma.hidden = true;
        texto.focus();
      };
      confirma.appendChild(nao);
      confirma.appendChild(sim);
      confirma.hidden = false;
      nao.focus();
      return;
    }
    perguntar(mensagem);
  }

  function ajustarAltura() {
    texto.style.height = "auto";
    texto.style.height = Math.min(140, Math.max(emLista ? 104 : 40, texto.scrollHeight + 2)) + "px";
  }

  function atualizarContador() {
    var tamanho = texto.value.length;
    contador.hidden = tamanho < HOBI_AVISA_A_PARTIR_DE;
    contador.textContent = tamanho.toLocaleString("pt-BR") + " / " + HOBI_LIMITE_DE_CARACTERES.toLocaleString("pt-BR");
    contador.className = tamanho >= HOBI_LIMITE_DE_CARACTERES ? "contador cheio" : "contador";
  }

  function abrir() {
    painel.hidden = false;
    esconderChamada();
    // No celular a janela ocupa a tela inteira: o botao flutuante sai (ficaria em cima do Enviar) e o X do topo fecha.
    base.className = "hobi aberto";
    botao.setAttribute("aria-expanded", "true");
    botao.setAttribute("aria-label", "Fechar o chat com " + nome);
    hobiGuardado.gravar("aberto", "1");
    desenhar();
    ajustarAltura();
    if (!ocupado) texto.focus();
  }

  function fecharPainel() {
    painel.hidden = true;
    base.className = "hobi";
    botao.setAttribute("aria-expanded", "false");
    botao.setAttribute("aria-label", "Abrir o chat com " + nome);
    hobiGuardado.apagar("aberto");
    botao.focus();
  }

  botao.onclick = function () {
    if (painel.hidden) abrir();
    else fecharPainel();
  };
  fechar.onclick = fecharPainel;
  painel.addEventListener("keydown", function (evento) {
    if (evento.key === "Escape") {
      evento.stopPropagation();
      fecharPainel();
    }
  });
  campo.addEventListener("submit", function (evento) {
    evento.preventDefault();
    tentarEnviar();
  });
  texto.addEventListener("keydown", function (evento) {
    if (evento.key === "Enter" && !evento.shiftKey && !evento.isComposing && !emLista) {
      evento.preventDefault();
      tentarEnviar();
    }
  });
  texto.addEventListener("input", function () {
    confirma.hidden = true;
    // Colou varias linhas: e uma lista, e o Enter passa a quebrar linha.
    if (!emLista && texto.value.indexOf("\n") !== -1) modoLista(true);
    ajustarAltura();
    atualizarContador();
  });

  document.body.appendChild(hospedeiro);
  if (hobiGuardado.ler("aberto") === "1") abrir();
}

try {
  if (!window.__hobi4hobby && HOBI_SCRIPT && HOBI_SCRIPT.src) {
    window.__hobi4hobby = true;
    var hobiServico = new URL(HOBI_SCRIPT.src).origin;
    var hobiPartida = function () {
      try {
        if (paginaProibida({ classeDoBody: document.body.className, caminho: location.pathname })) return;
        hobiBuscarStatus(hobiServico).then(function (status) {
          try {
            var lembrado = hobiGuardado.ler("teste") === "1";
            if (!deveAparecer({ status: status, busca: location.search, lembrado: lembrado })) return;
            if (/[?&]assistente=1(?:&|$)/.test(location.search)) hobiGuardado.gravar("teste", "1");
            hobiIniciar(hobiServico, status);
          } catch {
            // Nunca quebra a pagina da loja.
          }
        });
      } catch {
        // Nunca quebra a pagina da loja.
      }
    };
    if (document.body) hobiPartida();
    else document.addEventListener("DOMContentLoaded", hobiPartida);
  }
} catch {
  // Nunca quebra a pagina da loja.
}

})();
