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
 * nao chama a IA e nao gasta. "Acompanhar meu pedido" (fase 3) abre o formulario do pedido; o WhatsApp e um link a parte.
 */
const ATALHOS = [
  { id: "componente", rotulo: "Encontrar um componente" },
  { id: "duvida", rotulo: "Tirar dúvida técnica sobre um produto" },
  { id: "pedido", rotulo: "Acompanhar meu pedido" },
  { id: "lista", rotulo: "Colar lista de peças" },
];

const FALAS_DOS_ATALHOS = {
  componente: "Qual componente você procura? Pode ser o nome, o código ou para que vai usar.",
  duvida: "Qual produto você está com dúvida? Pode me passar o nome ou o código.",
  pedido: "Me passe o número do pedido e o CPF, CNPJ ou e-mail usado na compra.",
  // Texto escolhido pelo dono (Opcao 2, 22/11/2026): a lista pode vir em qualquer formato.
  lista: "Pode colar sua lista aqui. Eu analiso e te mostro em instantes o que temos.",
};

/**
 * A fala de abertura de um atalho. Na duvida tecnica, se o visitante esta na pagina de um produto, oferece "O produto desta
 * tela": um clique e a pergunta segue com ele (o codigo ja vai no contexto de toda mensagem).
 *
 * @returns {{ texto: string, sugestao: { rotulo: string, mensagem: string } | null, modoLista: boolean, formulario: "pedido" | null } | null}
 */
function aberturaDoAtalho(id, contexto) {
  const texto = FALAS_DOS_ATALHOS[id];
  if (!texto) return null;
  let sugestao = null;
  if (id === "duvida" && contexto && contexto.pagina === "produto" && contexto.skuAberto) {
    const nome = contexto.nomeAberto || `o produto ${contexto.skuAberto}`;
    sugestao = { rotulo: `O produto desta tela: ${nome}`, mensagem: `Tenho uma dúvida técnica sobre este produto: ${nome} (código ${contexto.skuAberto}).` };
  }
  return { texto, sugestao, modoLista: id === "lista", formulario: id === "pedido" ? "pedido" : null };
}

/** Os textos do acompanhar pedido. O do limite termina em ":" porque o botao do WhatsApp vem logo depois (pedido do dono). */
const TEXTOS_DO_PEDIDO = {
  naoAchado: "Não encontrei este pedido. Confira o número e o CPF, CNPJ ou e-mail da compra.",
  limite: "Não consigo consultar mais pedidos agora. Fale com a gente pelo WhatsApp:",
  prova: "Confira o CPF, CNPJ ou e-mail da compra.",
  numero: "Confira o número do pedido.",
  robo: "Não consegui confirmar que você não é um robô. Tente de novo.",
  indisponivel: "Não consegui consultar agora. Fale com a gente pelo WhatsApp:",
};

const linhaCurta = (valor, teto) => (valor == null ? null : String(valor).replace(/\s+/g, " ").trim().slice(0, teto) || null);

function rastreioLido(bruto) {
  if (!ehObjeto(bruto) || bruto.codigo == null) return null;
  const link = typeof bruto.link === "string" && comoUrl(bruto.link)?.protocol === "https:" ? bruto.link : null;
  return { codigo: linhaCurta(bruto.codigo, 60), link };
}

/** Os textos do anexo. Tamanho e limite terminam em ":" porque o botao do WhatsApp vem logo depois (pedido do dono). */
const TEXTOS_DO_ANEXO = {
  grande: "Arquivo maior que 5 MB. Envie pelo WhatsApp:",
  limite: "Você chegou ao limite de arquivos de hoje. Envie pelo WhatsApp:",
  tipo: "Tipo de arquivo não aceito. Envie foto, PDF, planilha (.xlsx), CSV ou TXT.",
  vazio: "Este arquivo está vazio.",
  escaneado: "Este PDF é uma imagem escaneada. Mande uma foto da lista ou a lista em texto.",
  ilegivel: "Não consegui ler este arquivo.",
  robo: "Não consegui confirmar que você não é um robô. Tente de novo.",
  indisponivel: "Não consegui receber o arquivo agora. Envie pelo WhatsApp:",
};
const TAMANHO_MAXIMO_DO_ANEXO = 5 * 1024 * 1024;
const TIPOS_DO_ANEXO = ["image/jpeg", "image/png", "image/webp", "application/pdf", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv", "text/plain"];
const EXTENSOES_DO_ANEXO = /\.(jpe?g|png|webp|pdf|xlsx|csv|txt)$/i;

/**
 * O arquivo escolhido pode subir? So a conferencia da janela (tamanho e cara do tipo); quem decide pelos bytes e o servico.
 * @returns {{ ok: true } | { ok: false, texto: string, whatsapp: boolean }}
 */
function anexoPermitido({ nome, tamanho, tipo }) {
  if (!(Number(tamanho) > 0)) return { ok: false, texto: TEXTOS_DO_ANEXO.vazio, whatsapp: false };
  if (Number(tamanho) > TAMANHO_MAXIMO_DO_ANEXO) return { ok: false, texto: TEXTOS_DO_ANEXO.grande, whatsapp: true };
  if (!TIPOS_DO_ANEXO.includes(String(tipo == null ? "" : tipo)) && !EXTENSOES_DO_ANEXO.test(String(nome == null ? "" : nome))) return { ok: false, texto: TEXTOS_DO_ANEXO.tipo, whatsapp: false };
  return { ok: true };
}

/** A resposta do `POST /anexo` para a janela. */
function resultadoDoAnexo(status, corpo) {
  const c = ehObjeto(corpo) ? corpo : {};
  const falha = (texto, whatsapp) => ({ ok: false, texto, whatsapp });
  if (status === 200 && typeof c.anexoId === "string") return { ok: true, anexoId: c.anexoId, nome: linhaCurta(c.nome, 80) || "arquivo", resumo: linhaCurta(c.resumo, 40) || "" };
  if (status === 413) return falha(TEXTOS_DO_ANEXO.grande, true);
  if (status === 429) return falha(TEXTOS_DO_ANEXO.limite, true);
  if (status === 415) return falha(TEXTOS_DO_ANEXO.tipo, false);
  if (status === 422) return falha(c.erro === "escaneado" ? TEXTOS_DO_ANEXO.escaneado : TEXTOS_DO_ANEXO.ilegivel, false);
  if (status === 403) return falha(TEXTOS_DO_ANEXO.robo, false);
  return falha(TEXTOS_DO_ANEXO.indisponivel, true);
}

/** O resultado do pedido como a janela o guarda e desenha, conferido campo a campo (vem do servico ou da aba). */
function pedidoLido(bruto) {
  if (!ehObjeto(bruto) || typeof bruto.situacao !== "string") return null;
  return {
    situacao: bruto.situacao.slice(0, 20),
    titulo: linhaCurta(bruto.titulo, 120),
    tom: bruto.tom === "ok" || bruto.tom === "andamento" ? bruto.tom : "alerta",
    linhas: Array.isArray(bruto.linhas) ? bruto.linhas.map((linha) => linhaCurta(linha, 200)).filter(Boolean).slice(0, 6) : [],
    rastreio: rastreioLido(bruto.rastreio),
    texto: linhaCurta(bruto.texto, 300),
    whatsapp: bruto.whatsapp === true,
  };
}

/**
 * A resposta do `POST /pedido` em resultado para a janela. Todo limite (e o servico fora do ar) mostra o texto com o botao do
 * WhatsApp (pedido do dono em 22/11/2026, ao aprovar o plano); "nao achei" nao diz se foi o numero ou o documento.
 */
function resultadoDoPedido(status, corpo) {
  const c = ehObjeto(corpo) ? corpo : {};
  const aviso = (situacao, texto, whatsapp) => ({ situacao, titulo: null, tom: "alerta", linhas: [], rastreio: null, texto, whatsapp });
  if (status === 200 && c.situacao === "achado") return pedidoLido({ ...c, situacao: "achado", tom: c.tom ?? "andamento", texto: null, whatsapp: false });
  if (status === 200) return aviso("nao_achado", TEXTOS_DO_PEDIDO.naoAchado, false);
  if (status === 429) return aviso("limite", TEXTOS_DO_PEDIDO.limite, true);
  if (status === 400 && (c.erro === "prova" || c.erro === "numero")) return aviso("invalido", TEXTOS_DO_PEDIDO[c.erro], false);
  if (status === 403) return aviso("robo", TEXTOS_DO_PEDIDO.robo, false);
  return aviso("indisponivel", TEXTOS_DO_PEDIDO.indisponivel, true);
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
// `formulario`: "pedido" quando a troca mostra o formulario do pedido; `pedido`: o resultado de uma consulta (troca local).
// `anexo`: { nome, resumo } do arquivo que foi junto da pergunta (o conteudo nunca fica na janela).
const trocaNova = (pergunta) => ({ pergunta, status: "", cartoes: [], lista: null, texto: "", passagem: null, erro: null, mensagemId: null, nota: 0, local: false, sugestao: null, formulario: null, pedido: null, anexo: null, fechada: false });
const anexoLido = (bruto) => (ehObjeto(bruto) && bruto.nome != null ? { nome: linhaCurta(bruto.nome, 80) || "arquivo", resumo: linhaCurta(bruto.resumo, 40) || "" } : null);
const formularioLido = (bruto) => (bruto === "pedido" ? "pedido" : null);
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
      return { trocas: [...conversa.trocas, { ...trocaNova(String(d.texto == null ? "" : d.texto)), anexo: anexoLido(d.anexo) }] };
    case "anexoLido":
      return naAberta(conversa, (troca) => ({ anexo: troca.anexo ? { ...troca.anexo, resumo: linhaCurta(d.resumo, 40) || "" } : null }));
    case "abertura":
      return { trocas: [...conversa.trocas, { ...trocaNova(""), texto: String(d.texto == null ? "" : d.texto), local: true, sugestao: sugestaoLida(d.sugestao), formulario: formularioLido(d.formulario), fechada: true }] };
    case "formulario":
      return naAberta(conversa, () => ({ formulario: formularioLido(d.tipo) }));
    case "pedidoConsultado": {
      const resultado = pedidoLido(d);
      return resultado ? { trocas: [...conversa.trocas, { ...trocaNova(""), local: true, pedido: resultado, fechada: true }] } : conversa;
    }
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
      return { trocas: conversa.trocas.map((troca) => (troca.mensagemId && troca.mensagemId === d.mensagemId ? { ...troca, nota: d.nota } : troca)) };
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
    formulario: formularioLido(bruta.formulario),
    pedido: pedidoLido(bruta.pedido),
    anexo: anexoLido(bruta.anexo),
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
  if (status === 400 && erro === "anexo") return { texto: "O arquivo expirou. Envie de novo.", whatsapp: false };
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
/* global anexoPermitido, resultadoDoAnexo, resultadoDoPedido */

var HOBI_IMAGENS = {"cabeca":"data:image/webp;base64,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","corpo":"data:image/webp;base64,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","feliz":"data:image/webp;base64,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","pensando":"data:image/webp;base64,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"};
// So existe enquanto o proprio arquivo esta sendo executado: e dele que sai o endereco do servico.
var HOBI_SCRIPT = document.currentScript;

var HOBI_AVISO_DE_IA = "Este é um assistente de IA. Preço e estoque vêm da loja. Não envie senha nem dados de cartão.";
var HOBI_ERRO_GERAL = "Não consegui responder agora. Tente de novo em instantes ou fale com a gente pelo WhatsApp.";
var HOBI_LIMITE_DE_CARACTERES = 2000;
// Cabem numa linha do campo (~38 caracteres); cada um comeca com maiuscula depois do "Ex.:" (pedido do dono).
var HOBI_EXEMPLOS = ["Ex.: Sensor de umidade para Arduino", "Ex.: Quero ligar um LED com Arduino", "Ex.: Fonte 12V 5A, relé 5V, LM7805"];
var HOBI_AVISA_A_PARTIR_DE = 1800;

var HOBI_CSS = [
  ":host{all:initial}",
  "*,*::before,*::after{box-sizing:border-box}",
  ".hobi{--verde:#14532d;--verde-forte:#0f3f22;--led:#22c55e;--tinta:#1c2622;--suave:#5c6a63;--borda:#dbe3de;--nevoa:#f2f5f3;--papel:#fff;--ambar:#b45309;--erro:#b42318;",
  "font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:1.45;color:var(--tinta);-webkit-font-smoothing:antialiased}",
  "button,textarea,input{font:inherit;color:inherit}",
  "button{cursor:pointer}",
  "button:focus-visible,a:focus-visible,textarea:focus-visible,input:focus-visible{outline:2px solid var(--led);outline-offset:2px}",
  "[hidden]{display:none!important}",
  // O botao flutuante: a cabeca do mascote sobre branco (o recorte so fica bem em superficie clara).
  ".botao{position:fixed;right:20px;bottom:20px;z-index:2147483000;width:64px;height:64px;padding:0;border:2px solid var(--verde);border-radius:50%;background:var(--papel);",
  "box-shadow:0 6px 18px rgba(20,83,45,.22),0 1px 3px rgba(0,0,0,.12);display:grid;place-items:center;transition-property:transform,box-shadow;transition-duration:.15s;transition-timing-function:ease-out}",
  ".botao:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(20,83,45,.28),0 2px 4px rgba(0,0,0,.14)}",
  ".botao:active{transform:scale(.96)}",
  ".botao img{width:48px;height:48px;display:block}",
  ".botao svg{width:28px;height:28px;color:var(--verde)}",
  ".painel{position:fixed;right:20px;bottom:96px;z-index:2147483000;width:380px;max-width:calc(100vw - 24px);height:600px;max-height:calc(100vh - 116px);",
  "display:flex;flex-direction:column;background:var(--papel);border:1px solid var(--borda);border-radius:16px;overflow:hidden;",
  "box-shadow:0 18px 48px rgba(16,40,28,.22),0 2px 8px rgba(0,0,0,.08);animation:hobi-entra .16s ease-out}",
  // So o deslocamento e animado: se o navegador segurar a animacao (aba em segundo plano), a janela nao fica transparente.
  "@keyframes hobi-entra{from{transform:translateY(8px)}to{transform:none}}",
  ".topo{display:flex;align-items:center;gap:10px;padding:10px 8px 10px 14px;background:var(--verde);color:#fff}",
  ".avatar{width:38px;height:38px;border-radius:50%;background:var(--papel);display:grid;place-items:center;flex:none}",
  ".avatar img{width:30px;height:30px;display:block}",
  ".quem{flex:1;min-width:0;display:flex;flex-direction:column}",
  // O cabecalho (foto + nome) volta a tela inicial; a conversa continua guardada (pedido do dono em 22/11/2026).
  ".inicio{flex:1;min-width:0;display:flex;align-items:center;gap:10px;padding:2px 4px 2px 0;border:0;border-radius:10px;background:transparent;color:inherit;text-align:left;transition-property:opacity;transition-duration:.15s}",
  ".inicio:hover{opacity:.85}",
  ".quem strong{font-size:16px;font-weight:700;display:flex;align-items:center;gap:6px}",
  ".quem strong::after{content:'';width:7px;height:7px;border-radius:50%;background:var(--led);box-shadow:0 0 6px var(--led)}",
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
  ".atalho:hover{border-color:var(--verde);background:var(--nevoa)}",
  ".atalho svg{width:18px;height:18px;color:var(--verde);flex:none}",
  ".pergunta{align-self:flex-end;max-width:86%;margin:0;padding:8px 12px;border-radius:14px 14px 4px 14px;background:var(--verde);color:#fff;white-space:pre-wrap;overflow-wrap:anywhere}",
  ".resposta{display:flex;flex-direction:column;gap:10px;min-width:0}",
  ".pensando{display:flex;align-items:center;gap:8px;color:var(--suave);font-size:13px}",
  ".pensando img{width:34px;height:34px}",
  ".leds{display:inline-flex;gap:3px;margin-left:2px}",
  ".leds i{width:5px;height:5px;border-radius:1px;background:var(--led);animation:hobi-led 1s infinite both}",
  ".leds i:nth-child(2){animation-delay:.18s}.leds i:nth-child(3){animation-delay:.36s}",
  "@keyframes hobi-led{0%,100%{opacity:.25}40%{opacity:1}}",
  ".cartoes{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}",
  ".cartao{position:relative;display:grid;grid-template-columns:72px 1fr;gap:10px;padding:10px;border:1px solid var(--borda);border-radius:12px;background:var(--papel)}",
  ".numero{position:absolute;top:-7px;left:-7px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:var(--verde);color:#fff;font-size:11px;font-weight:650;display:grid;place-items:center;font-variant-numeric:tabular-nums}",
  ".foto{width:72px;height:72px;border-radius:8px;background:var(--nevoa);object-fit:contain;outline:1px solid rgba(0,0,0,.08);outline-offset:-1px;display:block}",
  ".sem-foto{display:grid;place-items:center;color:var(--suave)}.sem-foto svg{width:26px;height:26px}",
  ".info{min-width:0;display:flex;flex-direction:column;gap:3px}",
  ".nome{font-weight:600;font-size:13.5px;line-height:1.3;color:var(--tinta);text-decoration:none;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}",
  "a.nome:hover{text-decoration:underline}",
  ".papel{font-size:12px;color:var(--suave)}",
  ".linha{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}",
  ".preco{font-size:15px;font-weight:700;font-variant-numeric:tabular-nums}",
  ".faixa{font-size:12px;font-weight:600;color:var(--verde)}.faixa.poucas{color:var(--ambar)}.faixa.falta{color:var(--suave)}",
  ".acoes{grid-column:1/-1;display:flex;align-items:center;gap:8px;margin-top:2px}",
  ".ver{font-size:13px;color:var(--verde);text-decoration:underline;text-underline-offset:2px;margin-right:auto;padding:10px 0}",
  ".qtd{display:inline-flex;align-items:center;border:1px solid var(--borda);border-radius:10px;overflow:hidden;height:40px}",
  ".qtd button{width:34px;height:100%;border:0;background:var(--papel);font-size:16px;line-height:1;transition-property:background-color;transition-duration:.15s}",
  ".qtd button:hover{background:var(--nevoa)}",
  ".qtd input{width:34px;height:100%;border:0;border-inline:1px solid var(--borda);text-align:center;background:var(--papel);font-variant-numeric:tabular-nums;-moz-appearance:textfield;padding:0}",
  ".qtd input::-webkit-outer-spin-button,.qtd input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}",
  ".principal{height:40px;padding:0 14px;border:0;border-radius:10px;background:var(--verde);color:#fff;font-weight:600;white-space:nowrap;transition-property:background-color,transform;transition-duration:.15s}",
  ".principal:hover{background:var(--verde-forte)}.principal:active{transform:scale(.97)}",
  ".principal[disabled]{opacity:.6;cursor:default;transform:none}",
  ".principal.feito{background:var(--nevoa);color:var(--verde);border:1px solid var(--verde)}",
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
  ".whats{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:0 14px;border:1px solid var(--verde);border-radius:10px;color:var(--verde);font-weight:600;text-decoration:none;align-self:flex-start;",
  "transition-property:background-color;transition-duration:.15s}",
  ".whats:hover{background:var(--nevoa)}.whats svg{width:18px;height:18px}",
  ".fora{margin:0;font-size:12px;color:var(--suave)}",
  ".nota{display:flex;gap:4px;align-items:center}",
  ".nota button{width:40px;height:36px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--suave);display:grid;place-items:center;transition-property:background-color,color;transition-duration:.15s}",
  ".nota button:hover{background:var(--nevoa);color:var(--tinta)}",
  ".nota button svg{width:16px;height:16px}",
  ".nota button[aria-pressed=true]{color:var(--verde);background:var(--nevoa);border-color:var(--borda)}",
  ".nota button[disabled]{cursor:default}",
  ".nota span{font-size:12px;color:var(--suave)}",
  ".confirma{display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fff7e6;border-top:1px solid #f1d9a6;font-size:13px}",
  ".confirma span{flex:1}",
  ".confirma button{height:36px;padding:0 10px;border:1px solid var(--borda);border-radius:8px;background:var(--papel)}",
  ".campo{display:flex;align-items:flex-end;gap:8px;padding:10px;border-top:1px solid var(--borda);background:var(--papel)}",
  ".campo textarea{flex:1;min-height:40px;max-height:140px;padding:9px 12px;border:1px solid var(--borda);border-radius:12px;resize:none;background:var(--papel);line-height:1.4}",
  ".campo textarea::placeholder{color:var(--suave)}",
  ".campo.em-lista textarea{min-height:104px}",
  ".enviar{width:40px;height:40px;flex:none;border:0;border-radius:12px;background:var(--verde);color:#fff;display:grid;place-items:center;transition-property:background-color,transform;transition-duration:.15s}",
  ".enviar:hover{background:var(--verde-forte)}.enviar:active{transform:scale(.96)}.enviar[disabled]{opacity:.5;cursor:default;transform:none}",
  ".enviar svg{width:18px;height:18px}",
  ".contador{position:absolute;right:62px;bottom:14px;font-size:11px;color:var(--suave);font-variant-numeric:tabular-nums;background:var(--papel);padding:0 4px}",
  ".contador.cheio{color:var(--erro)}",
  ".campo{position:relative}",
  // A chamada: balao a esquerda do robo; no lugar da "pontinha", tres arcos de sinal saem da antena dele (acendem uma vez).
  ".chamada{position:fixed;right:72px;bottom:112px;z-index:2147483000;max-width:240px;display:flex;align-items:flex-start;gap:6px;padding:10px 8px 10px 14px;background:var(--papel);",
  "border:1px solid var(--borda);border-radius:14px;box-shadow:0 8px 24px rgba(16,40,28,.16),0 1px 3px rgba(0,0,0,.08);animation:hobi-entra .2s ease-out;cursor:pointer}",
  ".chamada strong{display:block;font-size:15px;font-weight:700;color:var(--verde)}",
  ".chamada span{display:block;font-size:13px;color:var(--tinta);text-wrap:balance}",
  ".chamada button{width:28px;height:28px;margin:-4px -2px 0 0;border:0;border-radius:8px;background:transparent;color:var(--suave);display:grid;place-items:center;flex:none}",
  ".chamada button:hover{background:var(--nevoa)}.chamada button svg{width:14px;height:14px}",
  // O sinal de wi-fi (no desenho dos icones que o dono mandou): em pe, com o ponto logo acima da antena do robo; acende do ponto
  // para os arcos, uma vez. Mora fora do balao, preso ao canto do robo.
  ".sinal{position:fixed;right:36px;bottom:86px;z-index:2147483000;width:32px;height:28px;overflow:visible;color:var(--verde)}",
  ".sinal circle{fill:currentColor;opacity:.2;animation:hobi-sinal .4s ease-out .1s 1 forwards}",
  ".sinal path{fill:none;stroke:currentColor;stroke-width:3.4;stroke-linecap:round;opacity:.2;animation:hobi-sinal .4s ease-out .35s 1 forwards}",
  ".sinal path:nth-of-type(2){animation-delay:.6s}",
  "@keyframes hobi-sinal{to{opacity:1}}",
  ".sugestao{align-self:flex-start;display:inline-flex;align-items:center;gap:8px;min-height:40px;max-width:100%;padding:8px 12px;border:1px solid var(--verde);border-radius:10px;background:var(--papel);color:var(--verde);font-weight:600;text-align:left;transition-property:background-color;transition-duration:.15s}",
  ".sugestao:hover{background:var(--nevoa)}",
  ".fala{margin:0;align-self:flex-start;max-width:90%;padding:8px 12px;border-radius:14px 14px 14px 4px;background:var(--nevoa);white-space:pre-wrap;overflow-wrap:anywhere}",
  // Acompanhar pedido (fase 3): o formulario dentro da conversa e o cartao da situacao. A cor da borda diz o estado.
  ".form-pedido{display:grid;gap:10px;padding:12px;border:1px solid var(--borda);border-radius:12px;background:var(--papel)}",
  ".form-pedido label{display:grid;gap:4px;font-size:12px;font-weight:600;color:var(--suave)}",
  ".form-pedido input{height:40px;padding:0 12px;border:1px solid var(--borda);border-radius:10px;font:inherit;font-size:14px;font-weight:400;color:var(--tinta);background:var(--papel)}",
  ".form-pedido input:focus{outline:2px solid var(--verde);outline-offset:1px;border-color:var(--verde)}",
  ".form-pedido .principal{justify-self:start}",
  ".situacao{display:grid;gap:3px;padding:12px 12px 12px 14px;border:1px solid var(--borda);border-left:4px solid var(--verde);border-radius:12px;background:var(--papel)}",
  ".situacao.ok{border-left-color:var(--led)}.situacao.alerta{border-left-color:var(--ambar)}",
  ".situacao strong{font-size:15px;color:var(--tinta)}",
  ".situacao span{font-size:13px;color:var(--suave);font-variant-numeric:tabular-nums}",
  ".situacao .codigo{color:var(--tinta)}",
  ".situacao .acoes{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}",
  ".situacao .acoes a{display:inline-flex;align-items:center;min-height:36px;padding:0 12px;border:1px solid var(--verde);border-radius:10px;color:var(--verde);font-weight:600;text-decoration:none;transition-property:background-color;transition-duration:.15s}",
  ".situacao .acoes a:hover{background:var(--nevoa)}",
  // Anexar arquivo (fase 3): o clipe a esquerda do campo, a faixa do arquivo escolhido e o arquivo junto da pergunta.
  ".clipe{width:40px;height:40px;flex:none;border:0;border-radius:12px;background:transparent;color:var(--suave);display:grid;place-items:center;transition-property:background-color,color;transition-duration:.15s}",
  ".clipe:hover{background:var(--nevoa);color:var(--verde)}.clipe[disabled]{opacity:.5;cursor:default}",
  ".clipe svg{width:20px;height:20px}",
  ".anexado{display:flex;align-items:center;gap:8px;padding:6px 8px 6px 12px;border-top:1px solid var(--borda);background:var(--nevoa);font-size:13px}",
  ".anexado>svg{width:16px;height:16px;flex:none;color:var(--verde)}",
  ".anexado .nome{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}",
  ".anexado .tamanho{color:var(--suave);font-variant-numeric:tabular-nums}",
  ".anexado button{width:32px;height:32px;flex:none;border:0;border-radius:8px;background:transparent;color:var(--suave);display:grid;place-items:center}",
  ".anexado button:hover{background:var(--papel)}.anexado button svg{width:14px;height:14px}",
  ".anexado.com-erro{background:#fff4f2;color:var(--erro);flex-wrap:wrap}",
  ".anexado.com-erro .aviso-do-arquivo{flex:1;min-width:0}",
  ".anexado.com-erro .whats{min-height:34px}",
  ".arquivo{align-self:flex-end;display:inline-flex;align-items:center;gap:6px;max-width:85%;padding:6px 10px;border:1px solid var(--borda);border-radius:10px;background:var(--papel);font-size:12px;color:var(--suave)}",
  ".arquivo svg{width:14px;height:14px;flex:none;color:var(--verde)}",
  ".arquivo span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  "@media (max-width:480px){.chamada{right:60px;bottom:100px;max-width:200px;padding:8px 6px 8px 12px}.chamada strong{font-size:14px}.chamada span{font-size:12px}.sinal{right:27px;bottom:76px}}",
  "@media (max-width:480px){.painel{inset:0;width:100%;max-width:none;height:100%;max-height:none;border:0;border-radius:0}.botao{right:14px;bottom:14px;width:58px;height:58px}.botao img{width:44px;height:44px}.aberto .botao{display:none}}",
  "@media (prefers-reduced-motion:reduce){.chamada{animation:none}.sinal path,.sinal circle{animation:none;opacity:1}}",
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
  pedido: "M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z",
  clipe: "M21 11.5l-8.6 8.6a5 5 0 01-7.1-7.1l8.6-8.6a3.3 3.3 0 014.7 4.7l-8.6 8.6a1.7 1.7 0 01-2.4-2.4l7.9-7.9",
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
  // Sem espaco depois do R$ (regra do dono em 22/11/2026, a mesma do src/lib/dinheiro.js; a janela nao importa nada).
  return numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/(R\$)[\s ]+/, "$1");
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
  // A tela inicial (saudacao e atalhos) por cima da conversa: o historico fica guardado e volta inteiro na proxima pergunta.
  var noInicio = false;
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
  var irAoInicio = hobiEl("button", "inicio", null, { type: "button", "aria-label": "Voltar para o início" });
  irAoInicio.appendChild(avatar);
  irAoInicio.appendChild(quem);
  topo.appendChild(irAoInicio);
  topo.appendChild(fechar);

  var area = hobiEl("div", "conversa", null, { "aria-live": "polite" });
  var confirma = hobiEl("div", "confirma", null, { role: "alert" });
  confirma.hidden = true;
  var campo = hobiEl("form", "campo");
  var texto = hobiEl("textarea", null, null, { rows: "1", maxlength: String(HOBI_LIMITE_DE_CARACTERES), "aria-label": "Sua mensagem", placeholder: HOBI_EXEMPLOS[0] });
  var contador = hobiEl("span", "contador");
  contador.hidden = true;
  var enviar = hobiEl("button", "enviar", null, { type: "submit", "aria-label": "Enviar" });
  enviar.appendChild(hobiIcone("enviar"));
  // O clipe (fase 3): foto, PDF, planilha, CSV ou TXT de ate 5 MB. Colar uma imagem no campo (Ctrl+V) tambem anexa.
  var clipe = hobiEl("button", "clipe", null, { type: "button", "aria-label": "Anexar arquivo", title: "Anexar foto, PDF, planilha, CSV ou TXT (até 5 MB)" });
  clipe.appendChild(hobiIcone("clipe"));
  var escolher = hobiEl("input", null, null, { type: "file", accept: "image/jpeg,image/png,image/webp,.pdf,.xlsx,.csv,.txt", tabindex: "-1", "aria-hidden": "true" });
  escolher.hidden = true;
  var anexado = hobiEl("div", "anexado", null, { role: "status" });
  anexado.hidden = true;
  campo.appendChild(clipe);
  campo.appendChild(texto);
  campo.appendChild(contador);
  campo.appendChild(enviar);
  campo.appendChild(escolher);

  painel.appendChild(topo);
  painel.appendChild(hobiEl("p", "aviso", HOBI_AVISO_DE_IA));
  painel.appendChild(area);
  painel.appendChild(confirma);
  painel.appendChild(anexado);
  painel.appendChild(campo);
  base.appendChild(painel);
  base.appendChild(botao);

  // A chamada acima do robo (pedido do dono em 22/11/2026). Aparece 1 s depois de a pagina abrir, com a janela fechada; o X e
  // abrir o chat a escondem so nesta pagina.
  var chamada = hobiEl("div", "chamada", null, { role: "note" });
  var textoDaChamada = hobiEl("div");
  textoDaChamada.appendChild(hobiEl("strong", null, nome));
  textoDaChamada.appendChild(hobiEl("span", null, "Olá! Está com alguma dúvida? Me pergunte que eu te ajudo."));
  var dispensar = hobiEl("button", null, null, { type: "button", "aria-label": "Fechar o aviso" });
  dispensar.appendChild(hobiIcone("fechar"));
  var sinal = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  sinal.setAttribute("class", "sinal");
  sinal.setAttribute("viewBox", "0 0 32 28");
  sinal.setAttribute("aria-hidden", "true");
  var ponto = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  ponto.setAttribute("cx", "16");
  ponto.setAttribute("cy", "24");
  ponto.setAttribute("r", "2.8");
  sinal.appendChild(ponto);
  ["M9.5 17.5A9.5 9.5 0 0122.5 17.5", "M3.5 11A17.5 17.5 0 0128.5 11"].forEach(function (desenho) {
    var arco = document.createElementNS("http://www.w3.org/2000/svg", "path");
    arco.setAttribute("d", desenho);
    sinal.appendChild(arco);
  });
  chamada.appendChild(textoDaChamada);
  chamada.appendChild(dispensar);
  // O balao e o sinal aparecem e somem juntos.
  var grupoDaChamada = hobiEl("div");
  grupoDaChamada.hidden = true;
  grupoDaChamada.appendChild(chamada);
  grupoDaChamada.appendChild(sinal);
  base.appendChild(grupoDaChamada);
  // Fechada so nesta pagina: ao atualizar ou ir para outra pagina, ela aparece de novo (pedido do dono em 22/11/2026).
  function esconderChamada() {
    grupoDaChamada.hidden = true;
  }
  dispensar.onclick = function (evento) {
    evento.stopPropagation();
    esconderChamada();
  };
  chamada.onclick = function () {
    esconderChamada();
    abrir();
  };
  // 1 s depois de a pagina abrir, se a janela do chat estiver fechada.
  setTimeout(function () {
    if (painel.hidden) grupoDaChamada.hidden = false;
  }, 1000);

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
    // A nota pode ser trocada (pedido do dono em 22/11/2026); clicar de novo na mesma nao manda nada.
    function avaliar(nota) {
      if (boa.getAttribute("aria-pressed") === String(nota === 1) && ruim.getAttribute("aria-pressed") === String(nota === -1)) return;
      boa.setAttribute("aria-pressed", String(nota === 1));
      ruim.setAttribute("aria-pressed", String(nota === -1));
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
      // A fala de abertura de um atalho, ou o resultado de uma consulta de pedido: do Hobi, sem pergunta, sem nota (nao
      // passou pela IA).
      if (troca.texto) no.appendChild(hobiEl("p", "fala", troca.texto));
      if (troca.formulario) no.appendChild(desenharFormularioDoPedido());
      if (troca.pedido) no.appendChild(desenharSituacao(troca.pedido));
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
    if (troca.anexo) {
      var arquivo = hobiEl("div", "arquivo");
      arquivo.appendChild(hobiIcone("clipe"));
      arquivo.appendChild(hobiEl("span", null, troca.anexo.resumo ? troca.anexo.nome + " (" + troca.anexo.resumo + ")" : troca.anexo.nome));
      no.appendChild(arquivo);
    }
    if (troca.cartoes.length) {
      var cartoes = hobiEl("ol", "cartoes");
      troca.cartoes.forEach(function (produto, posicao) { cartoes.appendChild(desenharCartao(produto, posicao)); });
      no.appendChild(cartoes);
    }
    if (troca.lista) no.appendChild(desenharLista(troca.lista));
    if (troca.texto) no.appendChild(hobiEl("p", "texto", troca.texto));
    if (troca.formulario) no.appendChild(desenharFormularioDoPedido());
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

  // ---------- acompanhar pedido (fase 3): o formulario fala direto com o servico; a IA nunca ve o numero nem o documento ----------
  function comRobo() {
    var passe = hobiGuardado.ler("passe");
    if (passe) return Promise.resolve({ passe: passe });
    return hobiObterToken(String(status.turnstileSiteKey || "")).then(function (token) { return { turnstileToken: token }; });
  }

  /** Uma consulta. `repetir`: refaz o desafio do robo uma vez se o passe guardado for recusado. */
  function consultarPedido(numero, prova, repetir) {
    return comRobo()
      .then(function (robo) {
        var corpo = { sessaoId: sessaoId, numero: numero, prova: prova };
        if (robo.passe) corpo.passe = robo.passe;
        else corpo.turnstileToken = robo.turnstileToken;
        return fetch(servico + "/pedido", { method: "POST", credentials: "omit", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).then(function (resposta) {
          return resposta
            .json()
            .catch(function () { return null; })
            .then(function (lido) {
              if (lido && typeof lido.passe === "string") hobiGuardado.gravar("passe", lido.passe);
              if (resposta.status === 403 && robo.passe && repetir) {
                hobiGuardado.apagar("passe");
                return consultarPedido(numero, prova, false);
              }
              return resultadoDoPedido(resposta.status, lido);
            });
        });
      })
      .catch(function (erro) {
        return resultadoDoPedido(erro && erro.message === "robo" ? 403 : 0, null);
      });
  }

  function desenharFormularioDoPedido() {
    var formulario = hobiEl("form", "form-pedido", null, { novalidate: "" });
    var rotuloDoNumero = hobiEl("label", null, "Número do pedido");
    var numero = hobiEl("input", null, null, { type: "text", maxlength: "30", autocomplete: "off", spellcheck: "false" });
    rotuloDoNumero.appendChild(numero);
    var rotuloDaProva = hobiEl("label", null, "CPF, CNPJ ou e-mail da compra");
    var prova = hobiEl("input", null, null, { type: "text", maxlength: "120", autocomplete: "off", spellcheck: "false" });
    rotuloDaProva.appendChild(prova);
    var consultar = hobiEl("button", "principal", "Consultar", { type: "submit" });
    var recado = hobiEl("p", "recado", null, { role: "alert" });
    recado.hidden = true;
    var consultando = false;
    formulario.onsubmit = function (evento) {
      evento.preventDefault();
      if (consultando) return;
      if (!numero.value.trim() || !prova.value.trim()) {
        recado.textContent = "Preencha o número do pedido e o CPF, CNPJ ou e-mail.";
        recado.hidden = false;
        return;
      }
      recado.hidden = true;
      consultando = true;
      consultar.disabled = true;
      consultar.textContent = "Consultando…";
      consultarPedido(numero.value, prova.value, true).then(function (resultado) {
        consultando = false;
        consultar.disabled = false;
        consultar.textContent = "Consultar";
        // Erro de digitacao e robo ficam no proprio formulario: nao sao resposta, so pedem para corrigir.
        if (resultado.situacao === "invalido" || resultado.situacao === "robo") {
          recado.textContent = resultado.texto;
          recado.hidden = false;
          return;
        }
        // O documento nao fica na tela depois da consulta.
        prova.value = "";
        aplicar("pedidoConsultado", resultado);
      });
    };
    formulario.appendChild(rotuloDoNumero);
    formulario.appendChild(rotuloDaProva);
    formulario.appendChild(consultar);
    formulario.appendChild(recado);
    return formulario;
  }

  function desenharSituacao(pedido) {
    if (pedido.situacao !== "achado") {
      var aviso = hobiEl("div", "resposta");
      aviso.appendChild(hobiEl("p", "fala", pedido.texto || ""));
      // Todo limite mostra o WhatsApp com o link (pedido do dono em 22/11/2026, ao aprovar o plano).
      var socorro = pedido.whatsapp ? botaoDoWhatsApp("Falar no WhatsApp") : null;
      if (socorro) aviso.appendChild(socorro);
      return aviso;
    }
    var cartao = hobiEl("div", "situacao " + pedido.tom);
    cartao.appendChild(hobiEl("strong", null, pedido.titulo || "Pedido encontrado"));
    pedido.linhas.forEach(function (linha) { cartao.appendChild(hobiEl("span", null, linha)); });
    if (pedido.rastreio && pedido.rastreio.codigo) cartao.appendChild(hobiEl("span", "codigo", "Rastreio: " + pedido.rastreio.codigo));
    var acoes = hobiEl("div", "acoes");
    if (pedido.rastreio && pedido.rastreio.link) acoes.appendChild(hobiEl("a", null, "Rastrear", { href: pedido.rastreio.link, target: "_blank", rel: "noopener noreferrer" }));
    // A area de pedidos do cliente na Loja Integrada (medido em 22/11/2026: pede o login e volta para a lista).
    var naLoja = linkDaLoja(location.origin + "/conta/pedido/listar", location.origin);
    if (naLoja) acoes.appendChild(hobiEl("a", null, "Ver na loja", { href: naLoja }));
    if (acoes.childNodes.length) cartao.appendChild(acoes);
    return cartao;
  }

  function desenharSaudacao() {
    var ola = hobiEl("div", "ola");
    if (HOBI_IMAGENS.corpo) ola.appendChild(hobiImagem("corpo", nome + ", o robô assistente da 4hobby"));
    ola.appendChild(hobiEl("p", null, String(status.boasVindas || "")));
    var atalhos = hobiEl("div", "atalhos");
    var ICONE_DO_ATALHO = { componente: "lupa", duvida: "duvida", pedido: "pedido", lista: "lista" };
    // Todo atalho ABRE a conversa: o Hobi fala primeiro (fala feita aqui, sem IA) e o campo fica pronto para a resposta.
    ATALHOS.forEach(function (atalho) {
      var botaoDoAtalho = hobiEl("button", "atalho", null, { type: "button" });
      botaoDoAtalho.appendChild(hobiIcone(ICONE_DO_ATALHO[atalho.id]));
      botaoDoAtalho.appendChild(hobiEl("span", null, atalho.rotulo));
      botaoDoAtalho.onclick = function () {
        var abertura = aberturaDoAtalho(atalho.id, contextoAtual());
        if (!abertura) return;
        voltarParaAConversa();
        aplicar("abertura", { texto: abertura.texto, sugestao: abertura.sugestao, formulario: abertura.formulario });
        modoLista(abertura.modoLista);
        // O atalho do pedido abre o formulario: o foco vai ao numero do pedido, e nao ao campo da conversa.
        var formularios = abertura.formulario ? area.querySelectorAll(".form-pedido") : [];
        var primeiroCampo = formularios.length ? formularios[formularios.length - 1].querySelector("input") : null;
        (primeiroCampo || texto).focus();
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
    texto.placeholder = ligar ? "Cole sua lista aqui" : HOBI_EXEMPLOS[exemploDaVez];
    ajustarAltura();
  }

  /** Poe a tela de acordo com a conversa: so a troca aberta (e o que ainda nao foi desenhado) e refeita. */
  function irParaOInicio() {
    noInicio = true;
    nos = [];
    desenhar();
    area.scrollTop = 0;
  }

  // Sai da tela inicial: a conversa e redesenhada inteira (nos = []), e a proxima troca entra depois dela.
  function voltarParaAConversa() {
    if (!noInicio) return;
    noInicio = false;
    nos = [];
  }

  function desenhar() {
    if (noInicio || conversa.trocas.length === 0) {
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
    clipe.disabled = sim;
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

  // ---------- o arquivo do visitante (fase 3) ----------
  var pendente = null;

  function tamanhoLegivel(bytes) {
    return bytes < 1024 * 1024 ? Math.max(1, Math.round(bytes / 1024)) + " KB" : (bytes / (1024 * 1024)).toFixed(1).replace(".", ",") + " MB";
  }

  /** A faixa acima do campo: o arquivo escolhido (com o X), ou o aviso de por que ele nao pode ir (com o WhatsApp quando e limite). */
  function mostrarAnexado() {
    anexado.replaceChildren();
    // Escolher o arquivo so o prepara; quem envia e a seta (o dono esperou resposta so de escolher, 22/11/2026).
    texto.placeholder = pendente && pendente.arquivo ? "Escreva sobre o arquivo ou clique em enviar" : emLista ? "Cole sua lista aqui" : HOBI_EXEMPLOS[exemploDaVez];
    if (!pendente) {
      anexado.hidden = true;
      return;
    }
    anexado.hidden = false;
    if (pendente.erro) {
      anexado.className = "anexado com-erro";
      anexado.appendChild(hobiEl("span", "aviso-do-arquivo", pendente.erro.texto));
      var socorro = pendente.erro.whatsapp ? botaoDoWhatsApp("Falar no WhatsApp") : null;
      if (socorro) anexado.appendChild(socorro);
    } else {
      anexado.className = "anexado";
      anexado.appendChild(hobiIcone("clipe"));
      anexado.appendChild(hobiEl("span", "nome", pendente.arquivo.name || "arquivo"));
      anexado.appendChild(hobiEl("span", "tamanho", tamanhoLegivel(pendente.arquivo.size)));
    }
    var tirar = hobiEl("button", null, null, { type: "button", "aria-label": pendente.erro ? "Fechar o aviso" : "Tirar o arquivo" });
    tirar.appendChild(hobiIcone("fechar"));
    tirar.onclick = function () {
      escolherArquivo(null);
      texto.focus();
    };
    anexado.appendChild(tirar);
  }

  function escolherArquivo(arquivo) {
    if (!arquivo) pendente = null;
    else {
      var conferido = anexoPermitido({ nome: arquivo.name, tamanho: arquivo.size, tipo: arquivo.type });
      pendente = conferido.ok ? { arquivo: arquivo } : { erro: conferido };
    }
    mostrarAnexado();
  }

  /** Sobe o arquivo ao `/anexo`. `repetir`: refaz o desafio do robo uma vez se o passe guardado for recusado. */
  function enviarArquivo(arquivo, repetir) {
    return comRobo()
      .then(function (robo) {
        var cabecalhos = { "Content-Type": arquivo.type || "application/octet-stream", "X-Sessao": sessaoId, "X-Nome": encodeURIComponent(arquivo.name || "arquivo") };
        if (robo.passe) cabecalhos["X-Passe"] = robo.passe;
        else cabecalhos["X-Turnstile"] = robo.turnstileToken;
        return fetch(servico + "/anexo", { method: "POST", credentials: "omit", headers: cabecalhos, body: arquivo }).then(function (resposta) {
          return resposta
            .json()
            .catch(function () { return null; })
            .then(function (lido) {
              if (lido && typeof lido.passe === "string") hobiGuardado.gravar("passe", lido.passe);
              if (resposta.status === 403 && robo.passe && repetir) {
                hobiGuardado.apagar("passe");
                return enviarArquivo(arquivo, false);
              }
              return resultadoDoAnexo(resposta.status, lido);
            });
        });
      })
      .catch(function (erro) {
        return resultadoDoAnexo(erro && erro.message === "robo" ? 403 : 0, null);
      });
  }

  /** Uma tentativa de mandar a mensagem. `repetir`: ainda pode refazer o desafio do robo uma vez se o passe for recusado. */
  function mandar(mensagem, repetir, anexoId) {
    var passe = hobiGuardado.ler("passe");
    var comToken = passe
      ? Promise.resolve(null)
      : (aplicar("status", { texto: "Conferindo…" }), hobiObterToken(String(status.turnstileSiteKey || "")));
    return comToken
      .then(function (token) {
        aplicar("status", { texto: "Pensando…" });
        var corpo = { sessaoId: sessaoId, mensagem: mensagem, contexto: contextoAtual() };
        if (anexoId) corpo.anexoId = anexoId;
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
              return mandar(mensagem, false, anexoId);
            }
            falhar(textoDoErroHttp(resposta.status, corpo));
            return null;
          });
      })
      .catch(function (erro) {
        falhar(erro && erro.message === "robo" ? textoDoErroHttp(403, { erro: "robo" }) : textoDoErroHttp(0, null));
      });
  }

  function perguntar(mensagem, arquivo) {
    if (ocupado) return;
    ocupar(true);
    confirma.hidden = true;
    texto.value = "";
    modoLista(false);
    atualizarContador();
    voltarParaAConversa();
    pendente = null;
    mostrarAnexado();
    aplicar("pergunta", { texto: mensagem, anexo: arquivo ? { nome: arquivo.name || "arquivo" } : null });
    // Com arquivo, ele sobe primeiro (e lido no servico); a pergunta vai depois, com o `anexoId`.
    var antes = arquivo ? (aplicar("status", { texto: "Lendo o arquivo…" }), enviarArquivo(arquivo, true)) : Promise.resolve(null);
    antes
      .then(function (subido) {
        if (subido && !subido.ok) {
          falhar({ texto: subido.texto, whatsapp: subido.whatsapp });
          return null;
        }
        if (subido) aplicar("anexoLido", { resumo: subido.resumo });
        return mandar(mensagem, true, subido ? subido.anexoId : null);
      })
      .then(function () {
      // O fluxo acabou sem `fim` nem `erro` (cortado no meio): a troca nao pode ficar "pensando" para sempre.
      var ultima = conversa.trocas[conversa.trocas.length - 1];
      if (ultima && !ultima.fechada) falhar(textoDoErroHttp(0, null));
      ocupar(false);
    });
  }

  function tentarEnviar() {
    var mensagem = texto.value.trim();
    var arquivo = pendente && pendente.arquivo ? pendente.arquivo : null;
    if (ocupado || (!mensagem && !arquivo)) return;
    // So o arquivo, sem texto: a pergunta vai com uma frase padrao.
    if (!mensagem) mensagem = "Veja o arquivo que enviei";
    var sensivel = pareceDadoSensivel(mensagem);
    if (sensivel && confirma.hidden) {
      confirma.replaceChildren();
      confirma.appendChild(hobiEl("span", null, sensivel === "cpf" ? "Parece um CPF. Enviar mesmo assim?" : "Parece um número de cartão. Enviar mesmo assim?"));
      var sim = hobiEl("button", null, "Enviar", { type: "button" });
      var nao = hobiEl("button", null, "Corrigir", { type: "button" });
      sim.onclick = function () { perguntar(mensagem, arquivo); };
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
    perguntar(mensagem, arquivo);
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
  irAoInicio.onclick = irParaOInicio;
  clipe.onclick = function () {
    if (!ocupado) escolher.click();
  };
  escolher.onchange = function () {
    escolherArquivo(escolher.files && escolher.files[0] ? escolher.files[0] : null);
    escolher.value = "";
    texto.focus();
  };
  // Colar um print (Ctrl+V) no campo anexa a imagem; colar texto continua colando texto.
  texto.addEventListener("paste", function (evento) {
    var arquivos = evento.clipboardData && evento.clipboardData.files;
    if (arquivos && arquivos.length) {
      evento.preventDefault();
      escolherArquivo(arquivos[0]);
    }
  });
  // Os exemplos se revezam no campo vazio (escolha do dono em 22/11/2026): mostram as tres coisas que o Hobi faz.
  var exemploDaVez = 0;
  setInterval(function () {
    if (emLista || texto.value || pendente) return;
    exemploDaVez = (exemploDaVez + 1) % HOBI_EXEMPLOS.length;
    texto.placeholder = HOBI_EXEMPLOS[exemploDaVez];
  }, 4000);
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
