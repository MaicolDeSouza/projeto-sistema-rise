"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  FileUp,
  Check,
  CircleAlert,
  CircleCheck,
  CircleX,
  Loader,
  Plus,
  RotateCcw,
  Shuffle,
  TestTube,
  TriangleAlert,
  X,
} from "lucide-react";

import {
  salvarFonte,
  salvarFonteComArquivos,
  testarArquivoAcao,
  testarFonteAcao,
  testarPortalAcao,
} from "@/app/mercados/acoes";
import { portalDoEndereco, regrasDoFornecedor } from "@/lib/coleta/fornecedores";
import { mesclarNoExistente } from "@/lib/coleta/mesclar";

import PreviaProduto from "./PreviaProduto";

const CAMPO =
  "w-full rounded border border-borda bg-superficie px-2.5 py-2 text-sm focus:border-acento focus:outline-none";

const TIPOS = [
  { valor: "CONCORRENTE", rotulo: "Concorrente" },
  { valor: "FORNECEDOR", rotulo: "Fornecedor" },
  { valor: "OUTRO", rotulo: "Outro" },
];

const CABECALHO = {
  SUCESSO: {
    icone: CircleCheck,
    titulo: "Fonte compativel",
    classe: "border-emerald-200 bg-emerald-50 text-emerald-900",
  },
  PARCIAL: {
    icone: CircleAlert,
    titulo: "Fonte parcialmente compativel",
    classe: "border-amber-300 bg-amber-50 text-amber-900",
  },
  FALHA: {
    icone: CircleX,
    titulo: "Nao foi possivel validar a fonte",
    classe: "border-red-200 bg-red-50 text-red-900",
  },
};

const CONFIANCA = {
  alta: { rotulo: "confianca alta", classe: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  media: { rotulo: "confianca media", classe: "bg-amber-50 text-amber-800 border-amber-300" },
  baixa: { rotulo: "confianca baixa", classe: "bg-amber-50 text-amber-800 border-amber-300" },
  nenhuma: { rotulo: "nao identificada", classe: "bg-fundo text-suave border-borda" },
};

/**
 * O que a plataforma da loja entrega, e como.
 *
 * Fica acima dos campos de proposito: e a resposta que explica os campos. "Nao
 * disponiveis: Preco" nao diz nada sozinho; ao lado de "a Tray publica o preco
 * num input escondido" vira uma pergunta com endereco — ou o site mudou, ou a
 * nossa leitura falhou naquele ponto.
 */
function CartaoPlataforma({ teste }) {
  const { plataforma, catalogoPublico } = teste;
  const marca = CONFIANCA[plataforma.confianca] ?? CONFIANCA.nenhuma;
  const entrega = plataforma.entrega ?? {};

  return (
    <div className="rounded border border-borda p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Boxes size={15} className="text-suave" />
        <p className="text-sm font-medium">Plataforma: {plataforma.nome}</p>
        <span className={`rounded border px-1.5 py-0.5 text-[11px] ${marca.classe}`}>
          {marca.rotulo}
        </span>
        {plataforma.familia && (
          <span className="text-xs text-suave">{plataforma.familia}</span>
        )}
      </div>

      {plataforma.sinais.length > 0 && (
        <p className="mb-2 text-xs text-suave">
          Reconhecida por: {plataforma.sinais.join(" · ")}
        </p>
      )}

      {entrega.resumo && <p className="text-sm">{entrega.resumo}</p>}

      {typeof teste.produtosNoSite === "number" && (
        <p className="mt-2 text-sm">
          <span className="font-medium">Catalogo da loja: </span>
          <span className="tabular-nums">
            {teste.produtosNoSite.toLocaleString("pt-BR")}
            {teste.produtosNoSiteParcial ? "+" : ""}
          </span>{" "}
          produto(s){" "}
          {teste.produtosNoSiteFonte === "catalogo"
            ? "no catalogo publico da loja"
            : "publicados no sitemap"}
          {teste.produtosNoSiteParcial
            ? " — a leitura parou no teto, entao o catalogo e maior que isso"
            : ""}
        </p>
      )}

      <dl className="mt-2 space-y-1 text-xs">
        {entrega.preco && (
          <div>
            <dt className="inline font-medium">Preco: </dt>
            <dd className="inline text-suave">{entrega.preco}</dd>
          </div>
        )}
        {entrega.imagens && (
          <div>
            <dt className="inline font-medium">Imagens: </dt>
            <dd className="inline text-suave">{entrega.imagens}</dd>
          </div>
        )}
        {entrega.sitemap && (
          <div>
            <dt className="inline font-medium">Sitemap: </dt>
            <dd className="inline text-suave">{entrega.sitemap}</dd>
          </div>
        )}
      </dl>

      {catalogoPublico && (
        <p
          className={`mt-3 rounded border px-2.5 py-2 text-xs ${
            catalogoPublico.disponivel
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-borda text-suave"
          }`}
        >
          {catalogoPublico.disponivel ? (
            <>
              <span className="font-medium">
                Esta loja publica o catalogo em JSON, sem credencial
              </span>{" "}
              — {catalogoPublico.url}
              {catalogoPublico.total ? ` · ${catalogoPublico.total} produto(s)` : ""}. A coleta
              atual nao usa esse caminho: ler o catalogo em vez de abrir pagina por pagina e
              uma decisao a parte.
            </>
          ) : (
            <>
              A plataforma costuma publicar catalogo em {catalogoPublico.url}, mas nesta loja
              nao respondeu ({catalogoPublico.motivo}).
            </>
          )}
        </p>
      )}

      {(entrega.cuidados ?? []).length > 0 && (
        <ul className="mt-3 space-y-0.5 text-xs text-suave">
          {entrega.cuidados.map((cuidado) => (
            <li key={cuidado} className="flex items-start gap-1.5">
              <TriangleAlert size={12} className="mt-0.5 shrink-0" />
              <span>{cuidado}</span>
            </li>
          ))}
        </ul>
      )}

      {!plataforma.conferidaEm && plataforma.id !== "desconhecida" && (
        <p className="mt-2 text-xs text-amber-700">
          As regras desta plataforma ainda nao foram conferidas em loja real — confira a
          previa antes de confiar.
        </p>
      )}
    </div>
  );
}

/** Sugere um nome a partir do dominio: "loja.com.br" vira "Loja". */
function nomeSugerido(endereco) {
  try {
    const alvo = new URL(/^https?:\/\//i.test(endereco) ? endereco : `https://${endereco}`);
    const raiz = alvo.hostname.replace(/^www\./, "").split(".")[0];
    return raiz.charAt(0).toUpperCase() + raiz.slice(1);
  } catch {
    return "";
  }
}

/// Melhor desfecho primeiro. Se um dos caminhos entrega produto, a fonte
/// serve — mesmo que o outro tenha falhado.
const ORDEM_DO_RESULTADO = { SUCESSO: 3, PARCIAL: 2, FALHA: 1 };

/**
 * Server Action nao aceita File solto: vai como FormData.
 *
 * Varios arquivos na MESMA chave, lidos com getAll() do outro lado. E o caso
 * do fornecedor que manda a pronta entrega e a reserva separadas.
 */
function comArquivos(arquivos, nome, tipo, url) {
  const dados = new FormData();
  for (const arquivo of arquivos) dados.append("arquivo", arquivo);
  dados.set("nome", nome);
  dados.set("tipo", tipo);
  // O endereco identifica o fornecedor no registro de regras, mesmo quando o
  // cadastro entra so por arquivo.
  if (url) dados.set("url", url);
  return dados;
}

/**
 * Junta o teste do site com o do arquivo num resultado so.
 *
 * Cada produto carrega de onde veio, e cada passo fica rotulado: sem isso,
 * "Sitemap identificado" e "Arquivo recebido" cairiam na mesma lista sem dizer
 * de quem sao, e a previa sugeriria que o site entrega o que so o arquivo
 * entregou.
 *
 * Campo ausente e o que faltou nos DOIS. O que um traz e o outro nao, a fonte
 * tem — e a pergunta do teste e sobre a fonte, nao sobre o caminho.
 */
/**
 * Junta os produtos do site com os do arquivo num registro so, por codigo.
 *
 * Regra de fornecedor, nao geral: a Nightech descreve o mesmo produto nos dois
 * lugares pela metade — o site tem foto grande, texto de venda e endereco; a
 * planilha tem preco, saldo e previsao de chegada.
 *
 * A mesclagem usa o INDICE do arquivo inteiro, e nao a previa. A previa traz
 * tres produtos e o arquivo tem centenas: casar so os tres sorteados com os
 * tres do site quase nunca acerta, e foi por isso que a mesclagem parecia nao
 * funcionar.
 *
 * O produto do site vem primeiro porque descreve melhor; a planilha entra com
 * o que so ela tem. A mesclagem em si e a de mesclar.js, a mesma que junta
 * duas listas de arquivo no servidor.
 */
function mesclarComArquivo(doSite, doArquivo, indice) {
  const juntos = [];
  const usados = new Set();

  for (const produto of doSite) {
    const copia = { ...produto };
    const daPlanilha = copia.code ? indice?.[copia.code] : null;

    if (daPlanilha) {
      mesclarNoExistente(copia, daPlanilha);
      usados.add(copia.code);

      // Passou a vir dos dois lugares, e a previa precisa dizer isso — senao
      // parece que o site sozinho entregou o saldo que so a planilha tem.
      copia.origemDaLeitura = "Link + Upload";
    }

    juntos.push(copia);
  }

  // Os do arquivo que ja apareceram mesclados nao entram de novo.
  for (const produto of doArquivo) {
    if (produto.code && usados.has(produto.code)) continue;
    juntos.push({ ...produto });
  }

  return { juntos, casados: usados.size };
}

/**
 * Quantos produtos a fonte tem, somando site e arquivo.
 *
 * O mesmo codigo nos dois lugares e UM produto, entao a soma desconta o que
 * casou. Mas o desconto so alcanca o que foi conferido: o teste abre tres
 * paginas do site, e os outros produtos dele podem estar no arquivo tambem.
 *
 * Por isso o numero e um TETO, nao um total exato — e o passo na tela diz
 * quantos casamentos foram confirmados, para o operador saber o quanto da
 * sobreposicao ainda nao foi medida.
 */
function totalDaFonte(doLink, doArquivo, casados) {
  const doSite = doLink?.produtosNoSite ?? 0;
  const doFornecedor = doArquivo?.produtosNoSite ?? 0;

  if (!doSite || !doFornecedor) return doSite || doFornecedor || null;
  return doSite + doFornecedor - (casados ?? 0);
}
function juntarTestes(doLink, doArquivo, regras = {}) {
  const presentes = [doLink, doArquivo].filter(Boolean);
  if (presentes.length === 0) return null;
  if (presentes.length === 1) return presentes[0];

  const marcar = (teste, origem) =>
    (teste?.produtos ?? []).map((produto) => ({ ...produto, origemDaLeitura: origem }));

  const melhor = [...presentes].sort(
    (a, b) =>
      (ORDEM_DO_RESULTADO[b.resultado] ?? 0) - (ORDEM_DO_RESULTADO[a.resultado] ?? 0),
  )[0];

  const mesclado = regras.mesclarSiteComArquivo
    ? mesclarComArquivo(
        marcar(doLink, "Link"),
        marcar(doArquivo, "Upload"),
        doArquivo?.porCodigo,
      )
    : {
        juntos: [...marcar(doLink, "Link"), ...marcar(doArquivo, "Upload")],
        casados: 0,
      };

  const encontrados = new Set();
  for (const teste of presentes) {
    for (const campo of teste.campos?.encontrados ?? []) encontrados.add(campo);
  }

  const ausentes = new Set();
  for (const teste of presentes) {
    for (const campo of teste.campos?.ausentes ?? []) {
      if (!encontrados.has(campo)) ausentes.add(campo);
    }
  }

  return {
    ...melhor,
    passos: [
      ...(doLink?.passos ?? []).map((passo) => ({ ...passo, origem: "Link" })),
      ...(doArquivo?.passos ?? []).map((passo) => ({ ...passo, origem: "Upload" })),
      ...(regras.mesclarSiteComArquivo
        ? [
            {
              nome: "Site e arquivo mesclados",
              ok: true,
              detalhe:
                `${doLink?.produtosNoSite ?? 0} do site + ${doArquivo?.produtosNoSite ?? 0} do arquivo` +
                ` — ${mesclado.casados} codigo(s) conferido(s) nos dois viraram um produto so`,
            },
          ]
        : []),
    ],
    produtos: mesclado.juntos,

    // Site mais arquivo, descontando o mesmo codigo nos dois. Sem isso a tela
    // mostrava so o total do site, ignorando as centenas de itens que so
    // existem na planilha.
    produtosNoSite: regras.mesclarSiteComArquivo
      ? totalDaFonte(doLink, doArquivo, mesclado.casados)
      : (doLink?.produtosNoSite ?? doArquivo?.produtosNoSite ?? null),
    campos: { encontrados: [...encontrados], ausentes: [...ausentes] },
  };
}
/** "Fornecedor", "Concorrente" ou "Outro", como o seletor escreve. */
function rotuloDoTipo(valor) {
  return TIPOS.find((item) => item.valor === valor)?.rotulo ?? "fonte";
}
export default function FormularioFonte({ tipoInicial = "CONCORRENTE" }) {
  const router = useRouter();
  const [testando, iniciarTeste] = useTransition();
  const [salvando, iniciarSalvamento] = useTransition();

  // FECHADO POR PADRAO: a tela existe para acompanhar as fontes ja cadastradas,
  // e o cadastro e eventual. Aberto, o formulario empurrava a tabela inteira
  // para baixo da dobra.
  const [aberto, setAberto] = useState(false);

  const [nome, setNome] = useState("");
  // O tipo vem da aba em que o operador estava: quem clica em cadastrar dentro
  // de "Fornecedores" quer cadastrar um fornecedor. Um passo a menos, e um erro
  // a menos.
  const [tipo, setTipo] = useState(tipoInicial);
  const [url, setUrl] = useState("");
  const [secao, setSecao] = useState("");
  const [teste, setTeste] = useState(null);
  const [arquivos, setArquivos] = useState([]);
  const [erro, setErro] = useState(null);
  // AMOSTRA VARIADA: desligado, "Buscar dados" sempre volta aos mesmos tres
  // produtos (o de sempre, pela ordem do catalogo/sitemap do site). Ligado,
  // cada clique evita os produtos ja mostrados e traz tres novos — para
  // revisar varios produtos da fonte, um trio de cada vez, antes de decidir
  // se salva. produtosVistos so cresce enquanto o toggle esta ligado.
  const [amostraVariada, setAmostraVariada] = useState(false);
  const [produtosVistos, setProdutosVistos] = useState([]);
  // Login de PORTAL de fornecedor (a Santana): so existe no formulario enquanto
  // o cadastro nao e salvo, e vai cifrado para a fonte.
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");

  /*
    FORNECEDOR COM PORTAL DE LOGIN, reconhecido pelo endereco (fornecedores.js).
    O link e o de uma CATEGORIA, o teste entra com o login e le a lista dela, e
    as demais categorias entram depois, na linha da fonte.
  */
  const ehPortal = Boolean(portalDoEndereco(url));

  /**
   * O resultado do teste e limpo a cada mudanca de endereco.
   *
   * Sem isso, editar a URL depois de testar deixaria na tela a aprovacao de
   * OUTRO site — e o botao de cadastrar gravaria o endereco novo com o aval do
   * antigo.
   */
  function mudarUrl(valor) {
    setUrl(valor);
    setTeste(null);
    setErro(null);
    // Site diferente: o que foi visto na fonte anterior nao tem por que ser
    // evitado nesta.
    setProdutosVistos([]);
    if (!nome) setNome(nomeSugerido(valor));
  }

  /**
   * Arquivo tem prioridade sobre o site.
   *
   * Se o operador ja trouxe o catalogo, navegar seria trabalho repetido — e
   * no caso que motivou isto, impossivel: o portal do fornecedor exige login.
   * Sem arquivo, segue o caminho de sempre.
   */
  /**
   * Testa os DOIS caminhos quando os dois existem.
   *
   * Nao e um no lugar do outro: eles respondem coisas diferentes. O site diz o
   * que o publico ve; o arquivo diz o que o fornecedor entrega a quem compra.
   * Ver os dois lado a lado e o que permite comparar — e, no fornecedor de
   * portal fechado, o site sozinho nao responde nada.
   *
   * Em paralelo porque sao independentes: ler o arquivo nao espera a rede.
   */
  function testar() {
    setErro(null);
    setTeste(null);

    iniciarTeste(async () => {
      if (ehPortal) {
        setTeste(await testarPortalAcao({ url, usuario, senha, nome, tipo }));
        return;
      }

      const [doLink, doArquivo] = await Promise.all([
        url.trim()
          ? testarFonteAcao({
              url,
              secao,
              nome,
              tipo,
              // So manda evitar com o toggle ligado: desligado, o teste tem
              // que voltar aos mesmos tres de sempre.
              evitar: amostraVariada ? produtosVistos : undefined,
            })
          : null,
        arquivos.length > 0 ? testarArquivoAcao(comArquivos(arquivos, nome, tipo, url)) : null,
      ]);

      // Particularidades declaradas para este fornecedor, se houver.
      const regras = regrasDoFornecedor({ nome, url });
      const resultado = juntarTestes(doLink, doArquivo, regras);
      setTeste(resultado);
      if (!url.trim() && doArquivo?.siteSugerido) setUrl(doArquivo.siteSugerido);

      // Acumula o que foi mostrado desta vez, para o proximo clique evitar e
      // trazer outros tres.
      if (amostraVariada && resultado?.produtos?.length) {
        const enderecos = resultado.produtos.map((produto) => produto.url).filter(Boolean);
        setProdutosVistos((atuais) => [...new Set([...atuais, ...enderecos])]);
      }
    });
  }

  function cadastrar() {
    setErro(null);
    iniciarSalvamento(async () => {
      const dados = {
        nome,
        url,
        tipo,
        secao,
        resumo: teste?.campos
          ? `${teste.resultado} · ${teste.produtos.length} produto(s) testado(s) · ${teste.formatos?.join(", ")}`
          : null,
        produtosNoSite: teste?.produtosNoSite ?? null,
        produtosNoSiteParcial: teste?.produtosNoSiteParcial ?? false,
        ...(ehPortal ? { usuario, senha } : {}),
      };
      let resultado;
      if (arquivos.length > 0) {
        const formulario = comArquivos(arquivos, nome, tipo, url);
        formulario.set("secao", secao);
        formulario.set("resumo", dados.resumo ?? "");
        formulario.set("produtosNoSite", String(dados.produtosNoSite ?? ""));
        resultado = await salvarFonteComArquivos(formulario);
      } else {
        resultado = await salvarFonte(dados);
      }

      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }

      setUrl("");
      setNome("");
      setSecao("");
      setTeste(null);
      setArquivos([]);
      setUsuario("");
      setSenha("");
      // Recolhe depois de salvar: o trabalho terminou, e a fonte nova ja
      // aparece na tabela logo abaixo.
      setAberto(false);
      router.refresh();
    });
  }

  const cabecalho = teste ? CABECALHO[teste.resultado] : null;
  const Icone = cabecalho?.icone;
  const podeCadastrar = teste && teste.resultado !== "FALHA";

  /**
   * NAO RECOLHE COM TESTE RODANDO OU RESULTADO NA TELA.
   *
   * O teste demora — medido: 19s na Smartkits, 62s na Usinainfo, 82s no
   * Eletrogate, que pede 10s entre visitas. Fechar sob os pes de quem esta
   * esperando, ou lendo o relatorio, jogaria fora esse tempo com um clique.
   */
  const emUso = testando || Boolean(teste) || arquivos.length > 0;

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="mb-4 inline-flex items-center gap-1.5 rounded border border-borda bg-superficie px-3 py-2 text-sm font-medium hover:bg-fundo"
      >
        <Plus size={15} />
        Cadastrar fonte
      </button>
    );
  }

  return (
    <div className="mb-6 rounded-lg border border-borda bg-superficie p-5">
      <div className="mb-1 flex items-start justify-between gap-3">
        <p className="font-medium">Cadastrar uma fonte</p>
        <button
          type="button"
          onClick={() => setAberto(false)}
          disabled={emUso}
          title={
            emUso
              ? "Termine ou descarte o teste antes de recolher"
              : "Recolher"
          }
          aria-label="Recolher o cadastro"
          className="rounded p-1 text-suave hover:bg-fundo hover:text-texto disabled:cursor-not-allowed disabled:opacity-40"
        >
          <X size={16} />
        </button>
      </div>
      <p className="mb-4 text-sm text-suave">
        Informe o site de um concorrente ou fornecedor. Antes de gravar, o sistema abre
        algumas paginas de produto para confirmar que consegue extrair dados uteis dali.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="mb-1 block text-xs text-suave">Nome</span>
          <input
            type="text"
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
            placeholder="4hobby"
            className={CAMPO}
          />
        </label>

        <label>
          <span className="mb-1 block text-xs text-suave">Tipo</span>
          <select
            value={tipo}
            onChange={(evento) => setTipo(evento.target.value)}
            className={CAMPO}
          >
            {TIPOS.map((item) => (
              <option key={item.valor} value={item.valor}>
                {item.rotulo}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="mb-1 block text-xs text-suave">URL</span>
          <input
            type="url"
            value={url}
            onChange={(evento) => mudarUrl(evento.target.value)}
            placeholder={arquivos.length > 0 ? "Opcional ao enviar um catálogo" : "https://site-do-fornecedor.com.br/"}
            className={CAMPO}
          />
        </label>

        {ehPortal ? (
          <div className="grid gap-3">
            <label>
              <span className="mb-1 block text-xs text-suave">E-mail do portal</span>
              <input
                type="email"
                autoComplete="off"
                value={usuario}
                onChange={(evento) => {
                  setUsuario(evento.target.value);
                  setTeste(null);
                }}
                className={CAMPO}
              />
            </label>
            <label>
              <span className="mb-1 block text-xs text-suave">Senha do portal</span>
              <input
                type="password"
                autoComplete="new-password"
                value={senha}
                onChange={(evento) => {
                  setSenha(evento.target.value);
                  setTeste(null);
                }}
                className={CAMPO}
              />
            </label>
            <span className="text-xs text-suave">
              Este fornecedor so mostra preco com login. Cole no campo URL o link de UMA
              categoria (ex.: https://santanaimport.com.br/componentes.html); as outras voce
              adiciona depois, em Categorias, na linha da fonte. O login fica cifrado.
            </span>
          </div>
        ) : (
        <label>
          <span className="mb-1 block text-xs text-suave">
            Secao / categoria <span className="text-suave">(opcional)</span>
          </span>
          <input
            type="text"
            value={secao}
            onChange={(evento) => {
              setSecao(evento.target.value);
              setTeste(null);
            }}
            placeholder="/arduino-74"
            className={CAMPO}
          />
          <span className="mt-1 block text-xs text-suave">
            Limita a coleta a um trecho do site. Em branco, cobre a loja inteira.
          </span>
        </label>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={testar}
          disabled={
            testando ||
            (arquivos.length === 0 && !url.trim()) ||
            (ehPortal && (!usuario.trim() || !senha))
          }
          className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {testando ? <Loader size={15} className="animate-spin" /> : <TestTube size={15} />}
          {ehPortal
            ? "Entrar e ler a categoria"
            : arquivos.length > 0 && url.trim()
            ? "Buscar dados do site e dos arquivos"
            : arquivos.length > 0
              ? `Ler ${arquivos.length} arquivo(s)`
              : "Buscar dados"}
        </button>

        {/*
          AMOSTRA VARIADA: portal de login nao usa colherProdutos (e uma
          categoria paginada, nao amostra de tres), entao o toggle nao se
          aplica ali.
        */}
        {!ehPortal && (
          <button
            type="button"
            onClick={() => setAmostraVariada((atual) => !atual)}
            disabled={testando}
            role="switch"
            aria-checked={amostraVariada}
            title={
              amostraVariada
                ? "Ligado: cada Buscar dados traz tres produtos diferentes dos ja vistos"
                : "Desligado: Buscar dados sempre traz os mesmos tres produtos"
            }
            className="inline-flex items-center gap-1.5 rounded border border-borda px-3 py-2 text-sm hover:bg-fundo disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Shuffle size={15} className={amostraVariada ? "text-acento" : "text-suave"} />
            <span
              className={amostraVariada ? "font-medium text-acento" : "text-suave"}
            >
              Amostra variada
            </span>
            <span
              className={`relative ml-0.5 h-5 w-9 shrink-0 rounded-full transition ${
                amostraVariada ? "bg-emerald-500" : "bg-slate-300"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
                  amostraVariada ? "left-4.5" : "left-0.5"
                }`}
              />
            </span>
          </button>
        )}

        {/*
          Fornecedor de portal fechado nao tem vitrine para navegar: a Benser e a
          Santana Import so mostram catalogo depois do login. O operador salva a
          pagina ou baixa o catalogo, e o arquivo entra por aqui — nenhuma
          credencial passa pelo sistema.
        */}
        {/*
          So aparece para FORNECEDOR e OUTRO. Concorrente nao manda arquivo:
          o que se acompanha nele e a vitrine publica, e oferecer upload ali
          sugeriria um caminho que nao existe.
        */}
        {tipo === "FORNECEDOR" && !ehPortal && (
        <label
          className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-borda px-3 py-2 text-sm hover:bg-fundo"
          title="Ler de um arquivo do fornecedor (HTML salvo, PDF ou JSON)"
        >
          <FileUp size={15} />
          {arquivos.length > 0 ? "Trocar arquivos" : "Upload de arquivo"}
          {/*
            Varios de uma vez: fornecedor que importa manda a pronta entrega e
            a reserva em arquivos separados, e as duas listas precisam ser
            lidas juntas para o mesmo produto reunir os dois estoques.
          */}
          <input
            type="file"
            multiple
            accept=".html,.htm,.pdf,.json,.xlsx,.xlsm"
            className="hidden"
            onChange={(evento) => {
              setArquivos([...(evento.target.files ?? [])]);
              setTeste(null);
              setErro(null);
            }}
          />
        </label>
        )}

        {/*
          Salvar fica AO LADO de buscar, e nao no fim do relatorio: depois de
          um teste bom, a previa tem tres produtos e dezenas de campos, e o
          botao ficava abaixo de tudo isso — quem acabou de ver que a fonte
          serve tinha de rolar a tela para dizer sim.
        */}
        {podeCadastrar && (
          <button
            type="button"
            onClick={cadastrar}
            disabled={salvando || !nome.trim()}
            className="inline-flex items-center gap-1.5 rounded bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {salvando ? <Loader size={15} className="animate-spin" /> : <Plus size={15} />}
            Salvar {rotuloDoTipo(tipo).toLowerCase()}
          </button>
        )}

        {teste && !podeCadastrar && (
          <button
            type="button"
            onClick={testar}
            disabled={testando}
            className="inline-flex items-center gap-1.5 rounded border border-borda px-3 py-2 text-sm font-medium hover:bg-fundo"
          >
            <RotateCcw size={15} />
            Tentar novamente
          </button>
        )}

        {arquivos.length > 0 && (
          <div className="flex w-full flex-col gap-1">
            {arquivos.map((item, indice) => (
              <span
                key={`${item.name}-${item.size}`}
                className="inline-flex items-center gap-2 text-xs text-suave"
              >
                <span className="font-mono">{item.name}</span>
                <span>({(item.size / 1024 / 1024).toFixed(1)} MB)</span>
                <button
                  type="button"
                  onClick={() => {
                    setArquivos((antes) => antes.filter((_, i) => i !== indice));
                    setTeste(null);
                  }}
                  className="text-red-700 hover:underline"
                >
                  remover
                </button>
              </span>
            ))}
          </div>
        )}

        {erro && <p role="alert" className="w-full text-sm text-red-700">{erro}</p>}

        {testando && ehPortal && (
          <span className="text-xs text-suave">
            Entrando no portal e lendo a primeira pagina da categoria. Leva uns 15 segundos.
          </span>
        )}

        {testando && arquivos.length === 0 && !ehPortal && (
          <span className="text-xs text-suave">
            Abrindo robots.txt, sitemap e algumas paginas de produto. As visitas sao
            espacadas para nao pesar no site, entao leva de um a cinco minutos — sites que
            pedem ritmo mais lento no robots.txt (Crawl-delay) demoram mais, e nos
            respeitamos o que eles pedem.
          </span>
        )}
      </div>

      {teste && (
        <div className="mt-4 space-y-4">
          <div className={`rounded border px-4 py-3 ${cabecalho.classe}`}>
            <p className="flex items-center gap-2 font-medium">
              <Icone size={17} />
              {cabecalho.titulo}
            </p>

            {teste.motivo && <p className="mt-1 text-sm">{teste.motivo}</p>}

            <ul className="mt-2.5 space-y-0.5 text-xs">
              {teste.passos.map((passo) => (
                <li key={passo.nome} className="flex items-start gap-1.5">
                  {passo.ok ? (
                    <Check size={13} className="mt-0.5 shrink-0" />
                  ) : (
                    <X size={13} className="mt-0.5 shrink-0" />
                  )}
                  <span>
                    {passo.nome}
                    {passo.detalhe && <span className="opacity-75"> — {passo.detalhe}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {teste.plataforma && <CartaoPlataforma teste={teste} />}

          {teste.campos && (
            <div className="rounded border border-borda p-4">
              <p className="mb-2 text-sm font-medium">Campos identificados</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {teste.campos.encontrados.map((campo) => (
                  <span key={campo} className="inline-flex items-center gap-1 text-emerald-700">
                    <Check size={12} /> {campo}
                  </span>
                ))}
              </div>

              {teste.campos.ausentes.length > 0 && (
                <>
                  <p className="mt-3 mb-1.5 text-sm font-medium">
                    Nao disponiveis nesta fonte
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    {teste.campos.ausentes.map((campo) => (
                      <span key={campo} className="inline-flex items-center gap-1 text-amber-700">
                        <TriangleAlert size={12} /> {campo}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-suave">
                    Campo ausente nao invalida a fonte: sites publicam informacoes
                    diferentes, e o que falta fica null em vez de ser inventado.
                  </p>
                </>
              )}
            </div>
          )}

          {teste.produtos.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium">
                Previa dos produtos coletados ({teste.produtos.length})
              </p>
              {teste.produtos.map((produto, indice) => (
                <PreviaProduto
                  key={`${produto.url}-${produto.code ?? indice}`}
                  produto={produto}
                  indice={indice + 1}
                />
              ))}
            </div>
          )}


        </div>
      )}

    </div>
  );
}
