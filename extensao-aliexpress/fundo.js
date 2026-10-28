/**
 * Service worker da extensao "Rise AliExpress": o unico que fala com o Rise, com a chave guardada no
 * `chrome.storage.local`. So aceita os dois caminhos da extensao (a pagina do AliExpress poderia pedir outros).
 */
const CAMINHOS = {
  "GET /api/compras/aliexpress/estado": true,
  "POST /api/compras/aliexpress/importar": true,
};

async function pedirAoRise({ metodo, caminho, corpo }) {
  if (!CAMINHOS[`${metodo} ${caminho}`]) return { status: 0, corpo: { erro: "Caminho não permitido pela extensão." } };
  const { endereco, chave } = await chrome.storage.local.get(["endereco", "chave"]);
  if (!endereco || !chave) return { status: 0, corpo: { erro: "Configure o endereço do Rise e a chave no ícone da extensão." } };
  try {
    const resposta = await fetch(`${String(endereco).replace(/\/+$/, "")}${caminho}`, {
      method: metodo,
      headers: { authorization: `Bearer ${chave}`, ...(corpo ? { "content-type": "application/json" } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
      redirect: "error",
    });
    const texto = await resposta.text();
    let json = null;
    try {
      json = JSON.parse(texto);
    } catch {
      json = { erro: resposta.status === 200 ? "O Rise não respondeu JSON (tela de login?)." : `O Rise respondeu ${resposta.status}.` };
    }
    return { status: resposta.status, corpo: json };
  } catch (erro) {
    return { status: 0, corpo: { erro: `Não foi possível falar com o Rise: ${erro?.message ?? erro}` } };
  }
}

chrome.runtime.onMessage.addListener((mensagem, _remetente, responder) => {
  if (mensagem?.tipo !== "rise") return false;
  pedirAoRise(mensagem).then(responder);
  return true;
});
