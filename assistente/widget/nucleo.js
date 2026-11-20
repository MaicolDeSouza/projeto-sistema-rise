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

export const ORIGENS_DA_LOJA = ["https://www.4hobby.com.br", "https://4hobby.com.br"];
export const ORIGEM_DAS_FOTOS = "https://rise.4hobby.com.br/";
export const MAXIMO_DE_TROCAS_GUARDADAS = 30;
export const TEXTO_DA_INTERRUPCAO = "A resposta foi interrompida quando a página mudou. Pergunte de novo.";

/** O id da sessao do visitante: 32 hexadecimais, dos 16 bytes aleatorios que o navegador deu. */
export function novaSessaoId(bytes) {
  let texto = "";
  for (let i = 0; i < 16; i++) texto += (bytes[i] & 255).toString(16).padStart(2, "0");
  return texto;
}

/**
 * Le o fluxo de eventos do `/chat` (SSE) aos pedacos, como a rede entrega. Nunca lanca: bloco sem nome, com JSON
 * invalido ou com dado que nao e objeto (uma pagina de erro do proxy, por exemplo) e descartado.
 */
export function criarLeitorDoFluxo() {
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

/** O que a pagina da loja diz ao assistente: se e pagina de produto e qual o codigo. O codigo e dado da pagina: so passa com cara de codigo. */
export function contextoDaPagina({ classeDoBody, skuNaPagina }) {
  if (!temClasse(classeDoBody, "pagina-produto")) return { pagina: "outra", skuAberto: "" };
  const sku = String(skuNaPagina == null ? "" : skuNaPagina).trim();
  return { pagina: "produto", skuAberto: /^[A-Za-z0-9._-]{1,64}$/.test(sku) ? sku : "" };
}

/** O chat nao existe no carrinho nem no checkout: nada de terceiro entre o cliente e o pagamento. */
export function paginaProibida({ classeDoBody, caminho }) {
  const rota = String(caminho == null ? "" : caminho);
  return temClasse(classeDoBody, "pagina-carrinho") || rota.startsWith("/carrinho") || rota.startsWith("/checkout");
}

/** O botao aparece? So com o chat ligado, e para todos ou so para quem abriu a loja com `?assistente=1` (e segue lembrado na aba). */
export function deveAparecer({ status, busca, lembrado }) {
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
export function linkDaLoja(url, origemDaPagina) {
  const lido = typeof url === "string" ? comoUrl(url) : null;
  if (!lido) return null;
  const daPagina = lido.origin === origemDaPagina && (lido.protocol === "https:" || lido.protocol === "http:");
  const daLoja = lido.protocol === "https:" && ORIGENS_DA_LOJA.includes(lido.origin);
  return daPagina || daLoja ? lido.href : null;
}

/** A foto de um cartao: so do Rise. Na loja de mentira do PC (servico em 127.0.0.1) vale qualquer https. */
export function fotoPermitida(url, origemDoServico) {
  if (typeof url !== "string") return null;
  if (url.startsWith(ORIGEM_DAS_FOTOS)) return url;
  const servico = comoUrl(origemDoServico);
  const local = servico && (servico.hostname === "127.0.0.1" || servico.hostname === "localhost");
  return local && url.startsWith("https://") && comoUrl(url) ? url : null;
}

export function linkDoWhatsApp(url) {
  return typeof url === "string" && /^https:\/\/wa\.me\/\d{10,15}(\?\S*)?$/.test(url) ? url : null;
}

/** O endereco de comprar da Loja Integrada (medido na loja em 20/11/2026): `/carrinho/produto/<id>/adicionar/<quantidade>`. */
export function enderecoDoCarrinho(liId, quantidade) {
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
export function pareceDadoSensivel(texto) {
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

export function conversaVazia() {
  return { trocas: [] };
}

const trocaNova = (pergunta) => ({ pergunta, status: "", cartoes: [], lista: null, texto: "", passagem: null, erro: null, mensagemId: null, nota: 0, fechada: false });
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
export function aplicarEvento(conversa, { evento, dados }) {
  const d = ehObjeto(dados) ? dados : {};
  switch (evento) {
    case "pergunta":
      return { trocas: [...conversa.trocas, trocaNova(String(d.texto == null ? "" : d.texto))] };
    case "status":
      return naAberta(conversa, () => ({ status: String(d.texto == null ? "" : d.texto) }));
    case "cartoes":
      return naAberta(conversa, () => ({ cartoes: Array.isArray(d.itens) ? d.itens.filter(ehObjeto) : [] }));
    case "lista":
      return naAberta(conversa, () => ({ lista: Array.isArray(d.linhas) ? { linhas: d.linhas.filter(ehObjeto), total: Number(d.total) || 0 } : null }));
    case "texto":
      return naAberta(conversa, () => ({ texto: String(d.texto == null ? "" : d.texto) }));
    case "passagem":
      return naAberta(conversa, () => ({ passagem: { motivo: String(d.motivo == null ? "" : d.motivo), url: d.url == null ? null : String(d.url), foraDoHorario: d.foraDoHorario === true } }));
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
export function paraGuardar(conversa) {
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
    passagem: ehObjeto(bruta.passagem) ? { motivo: String(bruta.passagem.motivo == null ? "" : bruta.passagem.motivo), url: bruta.passagem.url == null ? null : String(bruta.passagem.url), foraDoHorario: bruta.passagem.foraDoHorario === true } : null,
    erro: ehObjeto(bruta.erro) ? { texto: String(bruta.erro.texto == null ? "" : bruta.erro.texto), whatsapp: Boolean(bruta.erro.whatsapp) } : null,
    mensagemId: typeof bruta.mensagemId === "string" ? bruta.mensagemId : null,
    nota: bruta.nota === 1 || bruta.nota === -1 ? bruta.nota : 0,
    fechada: true,
  };
  // A pagina mudou no meio da resposta: a troca volta fechada, com o aviso, e a pergunta NAO e reenviada sozinha.
  if (bruta.fechada !== true) troca.erro = { texto: TEXTO_DA_INTERRUPCAO, whatsapp: false };
  return troca;
}

/** O que estava guardado, conferido campo a campo. Qualquer coisa estranha vira conversa vazia. */
export function lerGuardada(texto) {
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
export function textoDoErroHttp(status, corpo) {
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
