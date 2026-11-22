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

var HOBI_IMAGENS = __HOBI_IMAGENS__;
// So existe enquanto o proprio arquivo esta sendo executado: e dele que sai o endereco do servico.
var HOBI_SCRIPT = document.currentScript;

var HOBI_AVISO_DE_IA = "Este é um assistente de IA. Preço e estoque vêm da loja. Não envie senha nem dados de cartão.";
var HOBI_ERRO_GERAL = "Não consegui responder agora. Tente de novo em instantes ou fale com a gente pelo WhatsApp.";
var HOBI_LIMITE_DE_CARACTERES = 2000;
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
        voltarParaAConversa();
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
    voltarParaAConversa();
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
  irAoInicio.onclick = irParaOInicio;
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
