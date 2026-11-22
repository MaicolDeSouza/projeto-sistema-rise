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

/**
 * O que a pagina da loja diz ao assistente: se e pagina de produto, qual o codigo e o nome. E dado da pagina: o codigo so
 * passa com cara de codigo, e o nome vira uma linha so, com no maximo 120 caracteres (a janela o mostra como texto).
 */
export function contextoDaPagina({ classeDoBody, skuNaPagina, nomeNaPagina }) {
  if (!temClasse(classeDoBody, "pagina-produto")) return { pagina: "outra", skuAberto: "", nomeAberto: "" };
  const sku = String(skuNaPagina == null ? "" : skuNaPagina).trim();
  const nome = String(nomeNaPagina == null ? "" : nomeNaPagina).replace(/\s+/g, " ").trim().slice(0, 120);
  return { pagina: "produto", skuAberto: /^[A-Za-z0-9._-]{1,64}$/.test(sku) ? sku : "", nomeAberto: nome };
}

/**
 * Os atalhos da saudacao (pedido do dono em 22/11/2026). Cada um ABRE a conversa com uma fala do Hobi, feita aqui mesmo:
 * nao chama a IA e nao gasta. "Acompanhar meu pedido" (fase 3) abre o formulario do pedido; o WhatsApp e um link a parte.
 */
export const ATALHOS = [
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
export function aberturaDoAtalho(id, contexto) {
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
export const TEXTOS_DO_PEDIDO = {
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
export const TEXTOS_DO_ANEXO = {
  grande: "Arquivo maior que 5 MB. Envie pelo WhatsApp:",
  limite: "Você chegou ao limite de arquivos de hoje. Envie pelo WhatsApp:",
  tipo: "Tipo de arquivo não aceito. Envie foto, PDF, planilha (.xlsx), CSV ou TXT.",
  vazio: "Este arquivo está vazio.",
  escaneado: "Este PDF é uma imagem escaneada. Mande uma foto da lista ou a lista em texto.",
  ilegivel: "Não consegui ler este arquivo.",
  robo: "Não consegui confirmar que você não é um robô. Tente de novo.",
  indisponivel: "Não consegui receber o arquivo agora. Envie pelo WhatsApp:",
};
export const TAMANHO_MAXIMO_DO_ANEXO = 5 * 1024 * 1024;
const TIPOS_DO_ANEXO = ["image/jpeg", "image/png", "image/webp", "application/pdf", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv", "text/plain"];
const EXTENSOES_DO_ANEXO = /\.(jpe?g|png|webp|pdf|xlsx|csv|txt)$/i;

/**
 * O arquivo escolhido pode subir? So a conferencia da janela (tamanho e cara do tipo); quem decide pelos bytes e o servico.
 * @returns {{ ok: true } | { ok: false, texto: string, whatsapp: boolean }}
 */
export function anexoPermitido({ nome, tamanho, tipo }) {
  if (!(Number(tamanho) > 0)) return { ok: false, texto: TEXTOS_DO_ANEXO.vazio, whatsapp: false };
  if (Number(tamanho) > TAMANHO_MAXIMO_DO_ANEXO) return { ok: false, texto: TEXTOS_DO_ANEXO.grande, whatsapp: true };
  if (!TIPOS_DO_ANEXO.includes(String(tipo == null ? "" : tipo)) && !EXTENSOES_DO_ANEXO.test(String(nome == null ? "" : nome))) return { ok: false, texto: TEXTOS_DO_ANEXO.tipo, whatsapp: false };
  return { ok: true };
}

/** A resposta do `POST /anexo` para a janela. */
export function resultadoDoAnexo(status, corpo) {
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
export function resultadoDoPedido(status, corpo) {
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

/** A foto de um cartao: so do Rise. Na loja de mentira do PC (servico em 127.0.0.1) vale tambem a dela mesma e qualquer https. */
export function fotoPermitida(url, origemDoServico) {
  if (typeof url !== "string") return null;
  if (url.startsWith(ORIGEM_DAS_FOTOS)) return url;
  const servico = comoUrl(origemDoServico);
  const lida = comoUrl(url);
  if (!lida || !servico || (servico.hostname !== "127.0.0.1" && servico.hostname !== "localhost")) return null;
  return lida.protocol === "https:" || lida.origin === servico.origin ? url : null;
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
export function aplicarEvento(conversa, { evento, dados }) {
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
  if (status === 400 && erro === "anexo") return { texto: "O arquivo expirou. Envie de novo.", whatsapp: false };
  if (status === 403 && erro === "robo") return { texto: "Não consegui confirmar que você não é um robô. Tente de novo.", whatsapp: false };
  if (status === 429) return { texto: `Você chegou ao limite de mensagens por agora. Tente mais tarde${COM_WHATSAPP}`, whatsapp: true };
  if (status === 503 && erro === "lotado") return { texto: `Muita gente por aqui agora. Tente em instantes${COM_WHATSAPP}`, whatsapp: true };
  if (status === 503) return { texto: "O assistente está indisponível agora. Fale com a gente pelo WhatsApp.", whatsapp: true };
  return { texto: `Não consegui responder agora. Tente de novo em instantes${COM_WHATSAPP}`, whatsapp: true };
}
