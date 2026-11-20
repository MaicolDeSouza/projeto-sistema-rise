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

/** O que a pagina da loja diz ao assistente: se e pagina de produto e qual o codigo. O codigo e dado da pagina: so passa com cara de codigo. */
function contextoDaPagina({ classeDoBody, skuNaPagina }) {
  if (!temClasse(classeDoBody, "pagina-produto")) return { pagina: "outra", skuAberto: "" };
  const sku = String(skuNaPagina == null ? "" : skuNaPagina).trim();
  return { pagina: "produto", skuAberto: /^[A-Za-z0-9._-]{1,64}$/.test(sku) ? sku : "" };
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

/** A foto de um cartao: so do Rise. Na loja de mentira do PC (servico em 127.0.0.1) vale qualquer https. */
function fotoPermitida(url, origemDoServico) {
  if (typeof url !== "string") return null;
  if (url.startsWith(ORIGEM_DAS_FOTOS)) return url;
  const servico = comoUrl(origemDoServico);
  const local = servico && (servico.hostname === "127.0.0.1" || servico.hostname === "localhost");
  return local && url.startsWith("https://") && comoUrl(url) ? url : null;
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
function aplicarEvento(conversa, { evento, dados }) {
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
 * Esqueleto da Tarefa 2 do plano da fase 2: so marca que o arquivo carregou. A janela de verdade entra na Tarefa 3.
 */

/* global window */

var HOBI_IMAGENS = {"cabeca":"data:image/webp;base64,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","corpo":"data:image/webp;base64,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","feliz":"data:image/webp;base64,UklGRqoMAABXRUJQVlA4WAoAAAAQAAAAXwAAXwAAQUxQSJcEAAAB8Dbbtmnb1rYPqZRoLcaIuW3btm3btm3bts0Z29772Ni2bXsvr9qilA8Te4w+WkRMAJrJfOL33/zhikuJShOL/WjJI5Zmu0pE6xwXKfzhimCV2jN9ZVkKXwGwQu0J1xhh2ZZf76tSxpbWgPCNIKq8yvMDFL64Upxjhndc5F8/m7tSmGzW1108eu2tpkCt86Ln/Gyv0s7VQsK69imoWMbS9j1gvYhFx/j1NlixSb9wrFwxEI/bN4OsVkK/fQ5a9co40X4abLFSeQJc4eLHr1oFqUpMu75uWfKPqyCngTkn1oJsYauwbEf4x3lADJ1yYq8xE0T7vx43wCp+uf+ee+65p/+gvZefFQNTZs+QmQAmnHfTK8JDSx5SI17rP27FyQAm9gYJcM4D7/lwjKxhuMSQsu3y1Z2bTwomNo6Z7dYcB/1thGWVGNYwJUXI8ofnzgsmNisR2PzJUZYiJHdVUeTfLp4ZTA0iMeHu/5IcRW6iQv7+wAmR2JRE7PyepZAbq5DfWhmJjWDCwv+wI+RGK6QzSDYgMR8zxiE3X+E/9CF1LWGmv7mE3IsKvzY/UpcyNvjGIfeowl/Mi1ZmFzJ2t4p7OPx8H4jOZ+zmIvd0+F9HHLcw2KGM3Sy5x6XwOUidydjcRe75Ms6fTQp2gljoW8s1LN4ZaTgcjJjwaRdX4g/gMBI5SMa5DtdRjsXBIcg8CLHkGKsSLr5xGBPuef2c4IB7XFxL+ZMJwcH2tK9DRsKmluspr4PMQY5zjFgIJO53qcqoPUEOuNnhRycGli5WRSz5b9OAAI5xOJYGzna4qgq/OhUI7OpSfAQmfcuqizXOFyEBS1vFr2Ijy7WVf5gTxFSfWfLF91fI4VOQgAdcLMkVlr+YCsDeDqtUyeETAaxoy5UufgAAXq2X/OEUmPX8ETXzotjUkqslbwqc71Ith4/ATF9Y9Sq+A0taFZPfxI4urtlLOMpRtddxROX+UrnwYXWTvFrl/PNMdSvuB1ayVCvJ6wKLyvXyay2g7+NqKXwUEiZ83qVOCv+8AAhc5qiUxzw21YDNXGokf7DftjkDwBTvWBUKX4VEAEg83qVC8trIGEjwDy7VkV8gOAiImX+0ahM+BQlDEnc7iqoij5gXHM5MpxWr1CR8ChKGm7Daa5bqUfzmxOCwmNC30t1WLSSvi4TfSWKKT6xKhE9Fwu9mC7u5VEHhh0B0lE+7VEDhR9sdIlaR1HMKnwYSnU0419FjCo8+GInoNHGrx6mHFMWfrIFMdI641aGeieIx162BjG6S6Rw51Asqkp9eEa2M7jJjp59dQg1TFNlPbkRkotvMmP/O0VaoOQpZ/uy/B4MkmsjUXu4pWRFFzbD181/3nh6ZCQ0lkVe7uVhWRJG6JL95xDoLTQOSaHAisMyeN74l21bpTvg0ZDATDScB9C198I3P/jjK6tKZaBO9yJwIIE2/2ztWd85GC2APgMyt3CJbE/zBpQvy5kgkyJzYLBKDTrHcSR9YXfnL5sshTU8ATM1qL3Pcdf+64v7vx7nb8pj/Pv3j0386dfk2Gkzs+NYYy7YV6lbItuXy+m6pIwBWUDgg7AcAALAiAJ0BKmAAYAA+bSySRiQiIaEvEP64gA2JZQDPDeA9pqNV+KfSB5af57wv8jXtOT333ZqPyfFZtg75fZf0AoB29J4ubxz2A/0R/xvVC/6/L19SewT/MP7N/zuwP6Ff67r0ALJrfK9pUv0FAwaJ4a6elaN5uoFugsQ9Ao+2b8zDir5oHqgsy3jo7ncn5VdG2NNBJbzg5XxZO24qd0fyAZzTnFCRujwQx+m2zvccQu1uACaGQS6XcFfiZ4TUXGY5tv7d9LxSSNBResGmCu+zCDxTPMzatY2PiCFvcITPBXLqjd/k6RsC7qkxcFDcnk/OhmVoK9xYwIb6rWl7RVdVrP5MSYX2Axfh/uSJQ9NxxMyzRA1ffJKGLi16/jyneFwA/v02bId8cGazkXDBpqUDkMXGyEW9Bel7OaWV0oXhoEMjPNp0uhvNT7a3/wyVUEHjdFIZp2pc1btn5yl2Ac1UXqWxvygsPBJ1NNzfhS5VPc8v+BIjwe7RhxZ58QCaaMNCig/W+va80s0I2Mv+OKz6Sl2yYG5rW3wSufiXnQn1NXksUNBNlyWnSiV3QbdMdz30HdZe15/PEGviBJyOJiKNzr5QvzHKcAaGkEY3VwLyb94bsWlwPTSCCMGIUAxdTcLPPkv5nIHTBvzdRbIlJ+oF/QWMY2dqPlkcnmEM3fbn/D0kaH9gSjKkQnpCfiC+d760C33xcC4ebd7ocPAIrU2W/GMpeMO4k9TI/prmj+Z2R6Sfd0FhMKco+5jBV2bsvTiEfAWmXOwA1P+7G5MohA1bsVJIzvq8Ot3cdyPgcu65B4kSSofzVN/3U5L1+x6st6jEitMP+fhEgFR0Ey/7TnAF+e62Q4rrdV/sxEexx7/hZOVAZd+RcpdT9thqpms/iA/Jngv/A35dj56Cdqi3M6/WyfxHP0uDZadxtbXBIYWAc2e1fRaI+AdUG038MX7l9i/+KHClracNCI70gBWUJJbz1nWIMTDIqnXrT2L/9n2TbNBXBwI0bn7GuHftw0kxuDn7GmBxN+Vf3ZWbBLdqbD6aT2V/fSwLoy9co44LvJ+xq2z5m5Np7/QCuD1KThiPpybRKrWNLbPne1U2WkQqA4Ae1acnhveRkWcThs2QXXm5rg0Rik4jc8hbLtSZY44QNX1/7X8we6XepMypmG9JUxMoqymHPE4gyQ1u5tfzTakvFtG8zgYO0Tpntpb+uTDfs/unkZSXN7tMPH01evDn+4zb783GgtnUrP18uhkkKTLrSmXA5/YeXa47+7ABL3/NHfZryCOcu0WRatR/ivX/i+/SGDA1Jais9s1Mhp405ajyZwPkCtjEMEnwUl1qajL2jiNgVDyDkrQP8LRqj22ogKuK9CjSUfSaYqL3rBR+cJrJ1yvfwFpuNSM/9bUl9Q5v2f+VIwBdrwAhmiQR4HEZPbxu/4P8CkRiOfjnA/g3Or6Zn7wwIsdgi+ZS4YRTNfUJoo6cmSpN+S/sj7+WgJ2ooeaX/96tmm6nqhl8AeXK/+qeL3KKX+is8Ix6PgbjLSYOaxEXNPQHsOSGFmJqysy2qJE8RL/qjYGGKhKhjlb0jzY4+uGfShESwhgxpPgRrBPf7dzHGdi/D9oidM3h5584IpLogABnb62uEIF0hz8UPc54RPSHRlK63S96bISI6qp8hQbBj863kcP6X0ML5i/P2Lv791uMMGvxINvclUC78ADJeWZjHAhMA9wmgggYhnYfZ0O2uv7egA7Jh99JWl5aF6LPqPl5ibyWaE5zUwjtXBoeWsLnqRlDP+jgeCHTgpSvwfRQ7QInGbUybrpTWP/mxpIcnmDevkomg2+exDshcr9RUsUG7fdy4Xwagj6CGyGk9Wrho2tc2JKFjBjbhB4J2orTanWVjgHOUdhwa22CZ1HwWD4wcDN9cP60hHGfE3E1Ge8AGu57eN9H44HSdJW8PD1Gpx0d/iBhKHzDflkkYr/qMVephhq8Zq/7ebefPzwqvjqG7DkAWlTpDyKV1qd1P+F81J3WeFoydrSK3o+drtWDouXF+VWbU4DOz8BrG5LwTkcsqUU82GQDGIJacM+n8cuEBW8M0por4D0vAkK/QD8HrDKum6+IveWuFubqSsqGrfm8eWlUbu33Wgh2esXI1NKMJTis1pljTbzDERouoAuK96ZSaJZEEWj7PqhisgBGQ/Iw04lBtev/NqJuctA5sjZt5YPVhRohW7E+V1xtwP5s+bZqbmLPPHWpPMvL4v1Yr38HajzBvKtMn6/qTIp/h6tBJSA63yKBz+zTUFfp90hc6c/AAEfaDfbTA3PFkoq61rCX8HrlNDE678F9UOa+JUZLvy+8TPvw3XBPGCJJtTuhFN7TLWWexbM5JEiwVBRC0qSUO7ThlkKQubuzqVcpYM3izT29madOOyPqrTZ2vRV3OpSNoboQEf1CMeEfjPwPW5lXOlmK7xx8ZnQ/+w83+H/K16Lq2L/z1Isf0evQO+T4gZ7ne7R/RBiYf/PWWxioORy4CSuvCS2HttppPbfEC6pP4eqcPgm6b/JBB7ZTmXRMoupPHRquBcnQGtvcKylJe7cmdgLALUrycKU9zCbSnf1MX8KSP/hSusm3erdusfFh6RqJpchN/PpyTbD/OLvDnkuB46tY1+FU9ibCnXzH16/HOOwvb1J5Cnhd7IYrued9vZOUygMm9kTvdATykWEvDHWH/elJNYef7s+EYwAAAA==","pensando":"data:image/webp;base64,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"};

try {
  if (!window.__hobi4hobby) window.__hobi4hobby = { imagens: Object.keys(HOBI_IMAGENS).length };
} catch {
  // Nunca quebra a pagina da loja.
}

})();
