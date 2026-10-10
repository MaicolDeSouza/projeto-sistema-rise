"use client";

import { propsDoFundo } from "@/lib/fundoDaJanela";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  ImageOff,
  Loader,
  PackageCheck,
  PackageX,
  TrendingDown,
  TrendingUp,
  X,
  ZoomIn,
} from "lucide-react";

import Badge from "@/components/ui/Badge";
import Copiar from "@/components/ui/Copiar";
import RegrasDeCompra from "@/components/mercados/RegrasDeCompra";
import { precoComImpostoTexto, precoDaFaixaTexto } from "@/components/mercados/precoTexto";
import { precoComImpostos } from "@/lib/coleta/impostos";
import { detalhePagina } from "@/app/mercados/acoes";

const MOEDA = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function comoMoeda(valor) {
  return valor === null || valor === undefined ? "—" : MOEDA.format(valor);
}

function comoData(valor) {
  if (!valor) return "—";
  return new Date(valor).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

/**
 * Galeria do produto: TODAS as fotos que a loja publica.
 *
 * Mostrava so a primeira, e as outras — quatro no XL6009, nove em produto da
 * Tray — ficavam coletadas e invisiveis. A foto e o que resolve "e o mesmo
 * produto?" quando o nome do concorrente e diferente do nosso.
 *
 * A miniatura TROCA a principal em vez de abrir direto: assim se percorre a
 * galeria sem abrir e fechar nada. Ampliar fica no clique da principal, que e
 * o gesto que quem usa ja espera de uma foto grande — e funciona no toque, ao
 * contrario do zoom por passagem de mouse.
 */
function Galeria({ imagens, alt, atual, aoTrocar, aoAmpliar }) {
  if (!imagens?.length) {
    return (
      <div className="flex h-48 w-48 items-center justify-center rounded border border-borda bg-fundo text-suave">
        <ImageOff size={24} />
      </div>
    );
  }

  const indice = Math.min(atual, imagens.length - 1);
  const principal = imagens[indice];

  return (
    <div className="w-48 shrink-0">
      <button
        type="button"
        onClick={aoAmpliar}
        title="Clique para ampliar"
        className="group relative block h-48 w-48 cursor-zoom-in overflow-hidden rounded border border-borda bg-superficie"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={principal}
          alt={alt ?? ""}
          className="absolute inset-0 h-full w-full object-contain transition group-hover:scale-105"
        />
        <span className="absolute right-1.5 bottom-1.5 rounded bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100">
          <ZoomIn size={14} />
        </span>
      </button>

      {imagens.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {imagens.map((url, posicao) => (
            <button
              key={url}
              type="button"
              onClick={() => aoTrocar(posicao)}
              aria-label={`Foto ${posicao + 1} de ${imagens.length}`}
              className={`relative h-10 w-10 overflow-hidden rounded border bg-superficie ${
                posicao === indice ? "border-acento" : "border-borda hover:border-suave"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                className="absolute inset-0 h-full w-full object-contain"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A foto ampliada, por cima da janela do detalhe.
 *
 * Fecha no clique do FUNDO: as setas e a foto nao fecham, senao mirar a proxima
 * imagem derrubaria a janela no primeiro clique fora do alvo.
 *
 * NAO OUVE O ESCAPE. Quem ouve e a Janela, uma vez so: com um ouvinte em cada
 * uma, o Escape disparava os dois e fechava a foto E a janela de uma vez —
 * quem so queria voltar da foto perdia o produto que estava lendo. As SETAS,
 * sim, sao daqui: ninguem mais as usa.
 */
function FotoAmpliada({ imagens, indice, alt, aoTrocar, aoFechar }) {
  const total = imagens?.length ?? 0;
  const aberta = indice !== null && total > 0;

  // Circular: da ultima passa para a primeira. Percorrer quatro fotos e ficar
  // preso na ponta obrigaria a voltar clicando tudo de novo.
  const anterior = useCallback(() => {
    aoTrocar((indice - 1 + total) % total);
  }, [aoTrocar, indice, total]);

  const proxima = useCallback(() => {
    aoTrocar((indice + 1) % total);
  }, [aoTrocar, indice, total]);

  useEffect(() => {
    if (!aberta) return undefined;

    const naTecla = (evento) => {
      if (evento.key === "ArrowLeft") anterior();
      if (evento.key === "ArrowRight") proxima();
    };

    document.addEventListener("keydown", naTecla);
    return () => document.removeEventListener("keydown", naTecla);
  }, [aberta, anterior, proxima]);

  if (!aberta) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Foto ampliada"
      onClick={aoFechar}
      className="fixed inset-0 z-[60] flex cursor-zoom-out items-center justify-center bg-black/80 p-6"
    >
      {total > 1 && (
        <button
          type="button"
          onClick={(evento) => {
            evento.stopPropagation();
            anterior();
          }}
          aria-label="Foto anterior"
          className="absolute left-4 cursor-pointer rounded-full bg-white/10 p-3 text-white transition hover:bg-white/25"
        >
          <ChevronLeft size={28} />
        </button>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imagens[indice]}
        alt={alt ?? ""}
        onClick={(evento) => evento.stopPropagation()}
        className="max-h-full max-w-full cursor-default object-contain"
      />

      {total > 1 && (
        <>
          <button
            type="button"
            onClick={(evento) => {
              evento.stopPropagation();
              proxima();
            }}
            aria-label="Próxima foto"
            className="absolute right-4 cursor-pointer rounded-full bg-white/10 p-3 text-white transition hover:bg-white/25"
          >
            <ChevronRight size={28} />
          </button>

          {/* Sem o contador nao da para saber se ainda ha foto adiante. */}
          <span className="absolute bottom-6 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
            {indice + 1} / {total}
          </span>
        </>
      )}
    </div>
  );
}

/**
 * Miniatura da linha, no tamanho da tabela de Produtos.
 *
 * SEMPRE <img>, nunca next/image, pela mesma razao da Imagem grande: a foto vem
 * de host externo arbitrario, e o next/image LANCA EXCECAO quando o host nao
 * esta em images.remotePatterns. Aqui o pior caso e uma miniatura quebrada numa
 * linha; com next/image, seria a tela inteira caindo por causa de uma loja.
 */
function Miniatura({ url, alt }) {
  if (!url) {
    return (
      <div className="flex h-11 w-11 items-center justify-center rounded border border-borda bg-fundo text-suave">
        <ImageOff size={16} />
      </div>
    );
  }

  return (
    <div className="relative h-11 w-11 overflow-hidden rounded border border-borda bg-superficie">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        className="absolute inset-0 h-full w-full object-contain"
      />
    </div>
  );
}

/**
 * Uma letra: F de fornecedor, C de concorrente.
 *
 * O mesmo lugar e tamanho dos selos de canal da tela de Produtos. A distincao
 * importa em toda linha — preco de fornecedor e custo, preco de concorrente e
 * mercado —, e a palavra inteira ocupava mais espaco que o nome da loja.
 * A cor repete a do Badge: fornecedor em azul, concorrente em cinza.
 */
function SeloFonte({ tipo }) {
  const ehFornecedor = tipo === "FORNECEDOR";

  return (
    <span
      title={ehFornecedor ? "Fornecedor" : "Concorrente"}
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-semibold ${
        ehFornecedor ? "bg-sky-100 text-sky-800" : "bg-borda text-suave"
      }`}
    >
      {ehFornecedor ? "F" : "C"}
    </span>
  );
}

/**
 * Situacao de estoque na loja de origem.
 *
 * "Sem estoque", nao "fora do ar": o produto continua publicado, o que acabou e
 * a mercadoria — e as duas coisas levam a decisoes diferentes.
 *
 * TRES estados, nao dois. A loja que nao declara disponibilidade nenhuma nao
 * aparece aqui: dizer "disponivel" seria afirmar o que ela nao disse, e dizer
 * "sem estoque" seria pior ainda.
 */
function Estoque({ semEstoque, disponivel, quantidade, aChegar, semMargem }) {
  const margem = semMargem ? "" : "mt-0.5 ";

  if (semEstoque) {
    return (
      <span className={`${margem}flex items-center gap-1 text-xs text-red-600`}>
        <PackageX size={12} /> sem estoque
      </span>
    );
  }

  // Pronta entrega desconhecida (produto que so veio na lista de RESERVA, sem
  // linha na de pronta entrega) nao e o mesmo que "nada para mostrar": o
  // fornecedor pode ter declarado quanto vai chegar, e esconder isso deixava a
  // reserva invisivel na lista — o unico jeito de ve-la era abrir o detalhe.
  if (!disponivel) {
    if (typeof aChegar !== "number") {
      return semMargem ? <span className="text-sm text-suave">—</span> : null;
    }
    return (
      <span className={`${margem}flex items-center gap-1 text-xs text-amber-700`}>
        <PackageCheck size={12} /> Estoque a chegar: {aChegar}
      </span>
    );
  }

  return (
    <div className={margem}>
      <span className="flex items-center gap-1 text-xs text-emerald-700">
        <PackageCheck size={12} />
        {typeof quantidade === "number"
          ? `Estoque disponível: ${quantidade}`
          : "Estoque disponível"}
      </span>
      {/* Linha PROPRIA, nao mais "· N a chegar" na mesma linha (pedido do
          dono, 22/09/2026) — pronta entrega e reserva sao numeros de
          decisoes diferentes, e o rotulo repetido deixa isso explicito.
          A chegar NUNCA soma com a pronta entrega: um numero so prometeria
          entrega que nao existe. */}
      {typeof aChegar === "number" && (
        <span className="mt-1 flex items-center gap-1 text-xs text-amber-700">
          <PackageCheck size={12} /> Estoque a chegar: {aChegar}
        </span>
      )}
    </div>
  );
}

/**
 * Coluna Estoque da lista (21/09/2026, pedido do dono): pronta entrega numa
 * linha, a chegar (reserva) noutra, com um traco entre as duas SO quando as
 * duas existem — produto com uma so (ex.: so na lista de reserva, ou
 * concorrente, que nunca tem "a chegar") mostra ela sozinha, sem o traco
 * insinuando uma segunda informacao que nao veio.
 */
function ColunaEstoque({ semEstoque, disponivel, quantidade, aChegar }) {
  const linhaPronta = semEstoque
    ? { cor: "text-red-600", Icone: PackageX, texto: "sem estoque" }
    : disponivel
      ? {
          cor: "text-emerald-700",
          Icone: PackageCheck,
          texto: typeof quantidade === "number" ? String(quantidade) : "disponivel",
        }
      : null;
  const temAChegar = typeof aChegar === "number";

  if (!linhaPronta && !temAChegar) return <span className="text-sm text-suave">—</span>;

  return (
    <div className="text-xs">
      {linhaPronta && (
        <span className={`flex items-center gap-1 ${linhaPronta.cor}`}>
          <linhaPronta.Icone size={12} /> {linhaPronta.texto}
        </span>
      )}
      {linhaPronta && temAChegar && <div className="my-1 h-px bg-borda" />}
      {temAChegar && (
        <span className="flex items-center gap-1 text-amber-700">
          <PackageCheck size={12} /> {aChegar} a chegar
        </span>
      )}
    </div>
  );
}

/**
 * Link do SITE: a URL do proprio PRODUTO quando existe; sem ela — a Fortek e
 * um portal fechado, nenhum produto de lá tem pagina publica —, cai na home
 * da fonte (pedido do dono, 22/09/2026), para nao deixar so um traco sem
 * nenhum jeito de conferir a loja. `dominio` vem da fonte, e a Santana ja o
 * guarda com o protocolo em teste local, entao so prefixa quando falta.
 */
function linkDaFonte(linha) {
  if (linha.url) return { url: linha.url, titulo: `Abrir em ${linha.fonteNome}` };
  if (!linha.fonteDominio) return null;
  const url = /^https?:\/\//i.test(linha.fonteDominio)
    ? linha.fonteDominio
    : `https://${linha.fonteDominio}`;
  return { url, titulo: `Abrir o site de ${linha.fonteNome} (sem link direto deste produto)` };
}

/**
 * Uma linha por faixa de quantidade (pedido do dono, 22/09/2026, depois de ver
 * so a mais barata em uso: a Santana publica 3-4 e 5+ un., e ele quer as duas
 * visiveis, nao so um resumo). Ordem CRESCENTE de quantidade — a de 1 unidade
 * ja e a linha de cima (o preco normal do produto), entao nao repete aqui.
 * Cada linha leva o MESMO imposto do produto, e termina dizendo quantas
 * unidades pedem aquele preco.
 */
function DicaFaixas({ precosPorQuantidade, impostos }) {
  const faixas = (precosPorQuantidade ?? [])
    .filter((faixa) => typeof faixa.preco === "number")
    .sort((a, b) => (a.minimo ?? 0) - (b.minimo ?? 0));
  if (faixas.length === 0) return null;

  return (
    <div className="mt-1 space-y-0.5">
      {faixas.map((faixa) => (
        <span key={`${faixa.minimo}-${faixa.maximo}-${faixa.rotulo}`} className="block text-[10px] text-suave">
          {precoDaFaixaTexto(faixa, impostos)}
        </span>
      ))}
    </div>
  );
}

/**
 * Coluna Valor do FORNECEDOR (22/09/2026, pedido do dono): preco total com o
 * "sem imposto + imposto" entre parenteses, numa linha so, no lugar das tres
 * linhas separadas de antes. Pronta entrega em cima, reserva embaixo com um
 * traco entre as duas — mesma regra da coluna Estoque: uma so, sem traco,
 * quando so uma existe.
 *
 * O "com impostos" da RESERVA nao e gravado no banco (so o da pronta entrega
 * e) — o detalhe da tela ja calcula na hora com `precoComImpostos`, e aqui e
 * o mesmo caminho: guardar um terceiro numero que e só a soma de outros dois
 * arriscaria ficar desatualizado sem ninguem perceber.
 */
function ColunaValorFornecedor({ linha }) {
  const prontaTexto = precoComImpostoTexto(linha.precoAtual, linha.precoComImpostos, linha.impostos);
  const comImpostosDaReserva =
    typeof linha.precoReserva === "number"
      ? precoComImpostos(linha.precoReserva, linha.impostos)
      : null;
  const reservaTexto = precoComImpostoTexto(linha.precoReserva, comImpostosDaReserva, linha.impostos);

  if (!prontaTexto && !reservaTexto) {
    return <span className="block text-xs text-suave">—</span>;
  }

  return (
    <div>
      {prontaTexto && (
        <span className="block text-xs font-medium text-texto">{prontaTexto}</span>
      )}
      {prontaTexto && reservaTexto && <div className="my-1 h-px bg-borda" />}
      {reservaTexto && (
        <span className="block text-xs font-medium text-amber-700">
          {reservaTexto}
          <span className="ml-1 text-[10px] font-normal text-suave">reserva</span>
        </span>
      )}
      <DicaFaixas precosPorQuantidade={linha.precosPorQuantidade} impostos={linha.impostos} />
    </div>
  );
}

/**
 * Preco do fornecedor no detalhe: UMA coluna, pedido do dono em 22/09/2026
 * depois de ver a Pronta entrega e a Reserva cada uma com Preco/Com
 * impostos/Quantidade em caixas separadas. "PRONTA ENTREGA" e "Quantidade"
 * saem daqui — o titulo nao faz falta numa coluna so, e a quantidade foi
 * para a caixa Estoque ao lado (ver `CaixaEstoque`).
 *
 * Cada linha usa o MESMO texto do preco normal ("R$ 17,24 (R$ 16,90 + 2%
 * IPI)") — pronta entrega, reserva (se houver) e as faixas de lote, todas no
 * mesmo formato, para nao repetir o mesmo dado em desenhos diferentes.
 */
function CaixaDePreco({
  precoAtual,
  precoComImpostos: totalComImposto,
  taxes,
  temReserva,
  precoReserva,
  reservaHerdada,
  precosPorQuantidade,
}) {
  const prontaTexto = precoComImpostoTexto(precoAtual, totalComImposto, taxes);
  const reservaTexto = temReserva
    ? precoComImpostoTexto(precoReserva, precoComImpostos(precoReserva, taxes), taxes)
    : null;

  return (
    <div className="min-w-[14rem] flex-1 rounded border border-borda px-3 py-2.5">
      <p className="mb-2 text-xs font-medium tracking-wide text-suave uppercase">Preço</p>

      {prontaTexto && <p className="text-lg font-semibold tabular-nums">{prontaTexto}</p>}

      {reservaTexto && (
        <p className="mt-1 text-lg font-semibold tabular-nums text-amber-700">
          {reservaTexto}
          {/*
            Fornecedor que nao publica preco separado para o que vai chegar
            cobra o mesmo da pronta entrega. Dizer de onde veio evita que o
            numero repetido pareca erro de leitura.
          */}
          <span className="ml-1 text-xs font-normal text-suave">
            reserva{reservaHerdada ? " (mesmo da pronta entrega)" : ""}
          </span>
        </p>
      )}

      <DicaFaixas precosPorQuantidade={precosPorQuantidade} impostos={taxes} />
    </div>
  );
}

/**
 * Estoque do fornecedor no detalhe, ao lado da caixa Preco (22/09/2026,
 * pedido do dono): antes vivia no campo Status, no alto — a seta do desenho
 * dele mostrou que o lugar certo e aqui, no espaco vazio entre Preco e
 * Multiplo de venda. So para FORNECEDOR: o concorrente nao tem essa fileira
 * de caixas, e o Status dele continua no grid de identificadores.
 *
 * Reaproveita o mesmo componente `Estoque` do campo Status (mesma regra dos
 * tres estados), so envolvido na caixa com titulo.
 */
function CaixaEstoque({ semEstoque, disponivel, quantidade, aChegar }) {
  return (
    <div className="min-w-[11rem] rounded border border-borda px-3 py-2.5">
      <p className="mb-2 text-xs font-medium tracking-wide text-suave uppercase">Estoque</p>
      <Estoque
        semEstoque={semEstoque}
        disponivel={disponivel}
        quantidade={quantidade}
        aChegar={aChegar}
        semMargem
      />
    </div>
  );
}

function VariacaoPreco({ atual, anterior }) {
  if (atual === null || anterior === null || atual === anterior) return null;

  const caiu = atual < anterior;
  const Icone = caiu ? TrendingDown : TrendingUp;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${
        caiu ? "text-emerald-700" : "text-red-700"
      }`}
    >
      <Icone size={13} />
      antes {comoMoeda(anterior)}
    </span>
  );
}

/**
 * As abas do detalhe: descricao, especificacoes e documentos.
 *
 * Empilhadas, os tres blocos somavam uma janela de rolagem longa — a descricao
 * sozinha passa de quatro mil caracteres na Usinainfo — e a ficha tecnica, que
 * e o que se consulta mais, ficava sempre embaixo dela. Lado a lado, cada uma
 * comeca no topo.
 *
 * Aba sem conteudo NAO aparece: produto sem documento nao ganha uma aba vazia
 * para o operador clicar e nao achar nada.
 *
 * O estado mora aqui, e nao no Detalhe: assim o Detalhe segue sem hook antes
 * dos retornos curtos dele.
 */
function Abas({ abas }) {
  const disponiveis = abas.filter((aba) => aba.conteudo);
  const [ativa, setAtiva] = useState(0);

  if (disponiveis.length === 0) return null;

  const indice = Math.min(ativa, disponiveis.length - 1);

  return (
    <div className="mt-5">
      <div
        role="tablist"
        className="flex flex-wrap gap-1 border-b border-borda"
      >
        {disponiveis.map((aba, posicao) => (
          <button
            key={aba.id}
            type="button"
            role="tab"
            aria-selected={posicao === indice}
            onClick={() => setAtiva(posicao)}
            className={`-mb-px border-b-2 px-3 py-2 text-xs font-medium tracking-wide uppercase transition ${
              posicao === indice
                ? "border-acento text-acento"
                : "border-transparent text-suave hover:text-texto"
            }`}
          >
            {aba.titulo}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="pt-4">
        {disponiveis[indice].conteudo}
      </div>
    </div>
  );
}

/**
 * Janela do detalhe.
 *
 * Substitui o painel que abria no FIM da pagina: com cento e vinte linhas, o
 * detalhe do produto clicado ficava a uma rolagem inteira de distancia, e o
 * operador perdia de vista a linha que abriu.
 *
 * Fecha por Escape, por clique no fundo e pelo X — os tres caminhos que quem
 * usa espera. O clique de dentro nao fecha, senao selecionar um texto do
 * datasheet derrubaria a janela.
 *
 * O `useEffect` aqui so registra ouvinte de teclado; nao ha setState em render,
 * que o React 19 barra.
 */
function Janela({ aberta, aoFechar, children }) {
  // A funcao de fechar muda de identidade a cada render do pai. Guardada em
  // ref — escrita DENTRO de um efeito, nunca no render —, o ouvinte de teclado
  // e registrado uma vez por abertura em vez de ser trocado a cada render.
  const fecharRef = useRef(aoFechar);
  useEffect(() => {
    fecharRef.current = aoFechar;
  }, [aoFechar]);

  useEffect(() => {
    if (!aberta) return undefined;

    const naTecla = (evento) => {
      if (evento.key === "Escape") fecharRef.current();
    };

    document.addEventListener("keydown", naTecla);
    // A pagina atras nao rola junto: sem isto, a roda do mouse move a tabela
    // enquanto se le a janela.
    const rolagem = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", naTecla);
      document.body.style.overflow = rolagem;
    };
  }, [aberta]);

  if (!aberta) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Detalhe do produto coletado"
      {...propsDoFundo(aoFechar)}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8"
    >
      <div
        onClick={(evento) => evento.stopPropagation()}
        className="relative w-full max-w-5xl rounded-lg border border-borda bg-superficie shadow-xl"
      >
        <button
          type="button"
          onClick={aoFechar}
          aria-label="Fechar"
          className="absolute top-3 right-3 rounded p-1.5 text-suave hover:bg-fundo hover:text-texto"
        >
          <X size={18} />
        </button>
        {children}
      </div>
    </div>
  );
}

/**
 * Conteudo do detalhe.
 *
 * A descricao e renderizada como TEXTO — nunca por dangerouslySetInnerHTML. E
 * HTML de terceiro: renderizar cru transformaria uma pagina de concorrente
 * comprometida em execucao de script dentro do sistema. Como filho de um
 * elemento React, o texto e escapado sozinho.
 */
function Detalhe({ dados, carregando, foto, aoTrocarFoto, aoAmpliar }) {
  // ANTES dos retornos curtos: hook depois de `return` condicional quebra a
  // ordem entre renders.
  const conteudoRef = useRef(null);
  const [rolou, setRolou] = useState(false);

  if (carregando) {
    return (
      <div className="flex items-center gap-2 px-5 py-10 text-sm text-suave">
        <Loader size={15} className="animate-spin" />
        Carregando os dados da página...
      </div>
    );
  }

  if (!dados) return null;

  /**
   * O que identifica o produto, no bloco principal.
   *
   * SEMPRE TODOS, com travessao no que falta — nunca escondendo o campo vazio.
   * Saber que o concorrente NAO publica o EAN e uma resposta, e quem confere
   * precisa distinguir "a loja nao informa" de "nao fomos buscar". Era por isso
   * que existia a secao de parametros; com os campos aqui, ela some.
   */
  const ehFornecedor = dados.fonte?.tipo === "FORNECEDOR";

  /**
   * O terceiro item diz se o campo ganha botao de copiar.
   *
   * SO O QUE SE COLA EM OUTRO LUGAR. Codigo, MPN, EAN e NCM sao chaves: o
   * codigo e o ponto de acesso ao produto na loja do concorrente, o MPN e o EAN
   * reconhecem o mesmo item noutra loja, e o NCM vai para o cadastro fiscal.
   * Marca e categoria se leem, nao se colam — um icone em cada campo encheria
   * a janela de ruido e faria os que importam sumirem no meio.
   */
  const identificadores = [
    ["Código / SKU", dados.skuFonte, true],
    ["MPN", dados.mpn, true],
    ["EAN", dados.ean, true, "ean"],
    ["Marca", dados.marca, false, "brand"],
    ["Modelo", dados.modelo],
    ["Categoria", dados.categoria],
    ["NCM", dados.ncm, true, "ncm"],
    /**
     * SO PARA FORNECEDOR: sao campos de compra, nao de mercado.
     *
     * Do concorrente interessa a que preco ele vende; do fornecedor interessa
     * quanto custa para nos, com o imposto que ele cobra por fora, e quanto da
     * para despachar hoje contra o que ainda vai chegar. Numa linha de
     * concorrente os tres viriam vazios e so ocupariam espaco.
     */
  ];

  /**
   * Pronta entrega e reserva, no mesmo desenho da previa do teste de fonte.
   *
   * SAO DECISOES DE COMPRA DIFERENTES: repor o que vendeu e planejar importacao
   * nao se comparam pelo mesmo numero. Cada caixa tem o preco e a quantidade
   * DELA — medido na Fortek, o 65-276 custa 79,90 na reserva e 82,90 na pronta
   * entrega, e num campo so essa inversao sumiria.
   *
   * A caixa de reserva so aparece quando o arquivo trouxe o dado. Mostra-la
   * vazia sugeriria que o fornecedor nao tem nada a chegar, quando a verdade e
   * que a lista nao trouxe isso.
   */
  const temReserva =
    typeof dados.aChegar === "number" || typeof dados.precoReserva === "number";

  // Sem preco proprio de reserva, vale o da pronta entrega: e o que o
  // fornecedor cobra quando nao diferencia.
  const reservaHerdada = typeof dados.precoReserva !== "number";
  const precoDeReserva = reservaHerdada ? dados.precoAtual : dados.precoReserva;

  const resumoDeImpostos = (dados.taxes ?? [])
    .map((imposto) => `${imposto.nome} ${String(imposto.percentual).replace(".", ",")}%`)
    .join(" + ");

  return (
    // Teto de altura com rolagem propria: ficha de quinze itens mais descricao
    // de quatro mil caracteres passa da tela, e sem isto a janela crescia para
    // fora dela e o botao de fechar sumia.
    <div
      ref={conteudoRef}
      // O estado sai do proprio evento de rolagem, nao de um efeito: e o
      // caminho que o React 19 aceita, e o botao so precisa saber "ja desceu?".
      onScroll={(evento) => setRolou(evento.currentTarget.scrollTop > 200)}
      className="max-h-[88vh] overflow-y-auto p-6"
    >
      <div className="pr-8">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <Badge tom={dados.fonte.tipo === "FORNECEDOR" ? "info" : "neutro"}>
            {dados.fonte.tipo === "FORNECEDOR" ? "Fornecedor" : "Concorrente"}
          </Badge>
          <span className="text-sm text-suave">{dados.fonte.nome}</span>
          {!dados.disponivel && <Badge tom="alerta">Sem estoque</Badge>}
        </div>
        {/*
          O nome e o que se cola numa busca para achar o mesmo produto noutra
          loja — e o titulo do concorrente costuma ser longo demais para
          transcrever a mao sem errar.
        */}
        <h2 className="group flex items-start gap-1 text-lg font-semibold">
          <span>{dados.titulo ?? "Sem título"}</span>
          {dados.titulo && (
            <span className="mt-1.5">
              <Copiar texto={dados.titulo} rotulo="o nome" />
            </span>
          )}
        </h2>
      </div>

      <div className="mt-4 flex flex-wrap gap-5">
        <Galeria
          imagens={dados.imagens}
          alt={dados.titulo}
          atual={foto}
          aoTrocar={aoTrocarFoto}
          aoAmpliar={aoAmpliar}
        />

        <div className="min-w-0 flex-1 space-y-3">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-4">
            {identificadores.map(([rotulo, valor, copiavel, campo]) => (
              <div key={rotulo} className="group min-w-0">
                <dt className="text-xs text-suave">{rotulo}</dt>
                <dd className="flex items-center gap-1">
                  <span
                    className={`min-w-0 truncate ${valor ? "" : "text-suave"}`}
                    title={valor ?? ""}
                  >
                    {valor || "—"}
                  </span>
                  {/* Campo vazio nao ganha botao: nao ha o que copiar. */}
                  {copiavel && valor && <Copiar texto={valor} rotulo={rotulo} />}
                </dd>
                {/* Campo vazio que o site tem em outro lugar (Santana: so na pagina do produto). */}
                {!valor && campo && dados.origens?.[campo] && (
                  <p className="text-[10px] text-amber-700">{dados.origens[campo]}</p>
                )}
              </div>
            ))}

            {/*
              Status com a mesma cara da lista: verde com o saldo, vermelho
              quando esgotou. Ler "Disponivel" em texto cinza aqui e o rotulo
              colorido la fazia parecer que eram dois campos diferentes.

              SO PARA CONCORRENTE (22/09/2026): o fornecedor tem a caixa
              Estoque propria, ao lado da caixa Preco — a seta do desenho do
              dono mostrou que a quantidade sai DAQUI para la, e nao repete
              nos dois lugares.
            */}
            {!ehFornecedor && (
              <div className="min-w-0">
                <dt className="text-xs text-suave">Status</dt>
                <dd>
                  <Estoque
                    semEstoque={dados.semEstoque}
                    disponivel={dados.estoqueConhecido}
                    quantidade={dados.quantidade}
                    semMargem
                  />
                </dd>
              </div>
            )}
          </dl>

          {/*
            O PRECO VEM LOGO DEPOIS DOS CODIGOS, e nao no alto a direita: quem
            abre o detalhe le codigo e preco na mesma pergunta — "quanto o
            concorrente cobra por este item?" — e no canto oposto os dois nao se
            liam juntos.

            Vermelho e o preco de tabela; verde, maior, e o que o cliente paga a
            vista, que e o numero que decide a comparacao.
          */}
          {ehFornecedor ? (
            <div className="flex flex-wrap gap-3 border-t border-borda pt-3">
              <CaixaDePreco
                precoAtual={dados.precoAtual}
                precoComImpostos={dados.precoComImpostos}
                taxes={dados.taxes}
                temReserva={temReserva}
                precoReserva={precoDeReserva}
                reservaHerdada={reservaHerdada}
                precosPorQuantidade={dados.precosPorQuantidade}
              />

              <CaixaEstoque
                semEstoque={dados.semEstoque}
                disponivel={dados.estoqueConhecido}
                quantidade={dados.quantidade}
                aChegar={dados.aChegar}
              />

              {/*
                So o Multiplo de venda: as faixas de lote saem daqui (ja
                estao na CaixaDePreco, acima) — sem passar precosPorQuantidade
                a caixa "Compra em lote" do RegrasDeCompra nao renderiza,
                porque a lista de faixas vem vazia.
              */}
              <RegrasDeCompra multiploVenda={dados.multiploVenda} />
            </div>
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-3 border-t border-borda pt-3">
              <div>
                <p className="text-xs text-suave">Preço de tabela</p>
                <p className="text-base tabular-nums text-red-600">
                  {comoMoeda(dados.precoAtual)}
                </p>
              </div>
              {dados.precoPromocional !== null && (
                <div>
                  <p className="text-xs text-suave">À vista</p>
                  <p className="text-2xl font-semibold tabular-nums text-emerald-700">
                    {comoMoeda(dados.precoPromocional)}
                  </p>
                </div>
              )}
              {/*
                Distribuidor cobra imposto por fora ("Preco unit. sem IPI"): o
                valor somado fica aqui, com o que entrou na conta entre
                parenteses. Sem dizer o que entrou, o numero maior parece preco
                inflado sem explicacao.
              */}
              {dados.precoComImpostos !== null && (
                <div>
                  <p className="text-xs text-suave">Com impostos</p>
                  <p className="text-base tabular-nums">
                    {comoMoeda(dados.precoComImpostos)}
                  </p>
                  {resumoDeImpostos && (
                    <p className="text-xs text-suave">({resumoDeImpostos})</p>
                  )}
                </div>
              )}
              <VariacaoPreco atual={dados.precoAtual} anterior={dados.precoAnterior} />
            </div>
          )}

          {/*
            Abrir e copiar sao coisas diferentes: abrir e para conferir agora,
            copiar e para mandar o endereco a alguem ou guardar num chamado.
          */}
          {/*
            SEM ENDERECO NAO HA LINK — havia um, e ele nao levava a lugar nenhum.

            O <a> era montado sempre, e com `url` nulo o href sumia: sobrava um
            texto azul que convidava ao clique e nao fazia nada. Acontece nos
            1.911 produtos da Fortek, que vieram de um ARQUIVO de portal atras de
            login — nao existe pagina publica para abrir, e nao e defeito de
            coleta. Dizer isso e mais util que um link morto, e evita alguem
            reportar de novo o mesmo "link quebrado".
          */}
          {dados.url ? (
            <div className="group flex items-center gap-1">
              <a
                href={dados.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-acento hover:underline"
              >
                <ExternalLink size={14} />
                Abrir no site {dados.fonte.dominio}
              </a>
              <Copiar texto={dados.url} rotulo="o endereço" />
            </div>
          ) : (
            <p className="text-sm text-suave">
              Sem página pública — este produto veio da lista enviada pelo fornecedor.
            </p>
          )}
        </div>
      </div>

      <Abas
        abas={[
          {
            id: "descricao",
            titulo: "Descrição",
            conteudo: dados.descricao ? (
              <div className="group">
                {/*
                  O texto inteiro num clique: e o material que se reaproveita
                  para escrever o nosso anuncio, e sao milhares de caracteres —
                  selecionar a mao numa caixa que rola e trabalhoso e falha.
                */}
                <div className="mb-1 flex justify-end">
                  <Copiar texto={dados.descricao} rotulo="a descrição" />
                </div>
                <p className="max-h-96 overflow-y-auto rounded border border-borda bg-fundo p-3 text-sm whitespace-pre-wrap">
                  {dados.descricao}
                </p>
              </div>
            ) : (
              <p className="text-sm text-suave">
                A loja não publica descrição nesta página.
              </p>
            ),
          },
          {
            id: "caracteristicas",
            titulo: `Características (${dados.especificacoes?.length ?? 0})`,
            /*
              LISTA ORDENADA, nao objeto: a ficha tem linha sem rotulo
              ("Tecnologia ultra silenciosa"), que objeto nenhum comporta sem
              inventar uma chave. Essas aparecem com marcador.
            */
            conteudo: dados.especificacoes?.length > 0 && (
              // Por coluna, como na previa do teste de fonte: a primeira metade na esquerda.
              <dl
                className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-flow-col sm:grid-cols-2 sm:[grid-template-rows:repeat(var(--linhas),auto)]"
                style={{ "--linhas": Math.ceil(dados.especificacoes.length / 2) }}
              >
                {dados.especificacoes.map((item, indice) => (
                  <div
                    key={`${item.nome ?? "item"}-${indice}`}
                    className="group flex items-center gap-2 border-b border-borda py-1"
                  >
                    <dt className="shrink-0 text-suave">
                      {item.nome ? `${item.nome}:` : "·"}
                    </dt>
                    <dd className="min-w-0 flex-1 truncate" title={String(item.valor)}>
                      {String(item.valor)}
                    </dd>
                    {/*
                      COPIA A LINHA INTEIRA — "Tensao de entrada: 3.5 V - 32 V
                      DC" —, e nao so o valor: a caracteristica se reaproveita
                      na descricao do nosso anuncio, e ali "3.5 V - 32 V DC"
                      sozinho nao diz de que grandeza se trata.

                      Aqui o botao vale ainda mais que nos outros lugares: valor
                      comprido aparece cortado na tela ("10/100 Mbps, comutacao
                      automatica entre conexao ..."), e sem copiar nao ha como
                      ler o texto inteiro.

                      Linha sem rotulo copia so o valor: nao ha nome a prefixar.
                    */}
                    <Copiar
                      texto={item.nome ? `${item.nome}: ${item.valor}` : String(item.valor)}
                      rotulo={item.nome ?? "a característica"}
                    />
                  </div>
                ))}
              </dl>
            ),
          },
          {
            id: "documentos",
            titulo: `Documentos (${dados.documentos?.length ?? 0})`,
            /*
              Datasheet, manual, biblioteca. E o que permite conferir se o
              produto do concorrente e o MESMO que o nosso: dois modulos com
              nome diferente e o mesmo CI sao o mesmo item.
            */
            conteudo: dados.documentos?.length > 0 && (
              <ul className="space-y-1">
                {dados.documentos.map((documento) => (
                  <li key={documento.url}>
                    <a
                      href={documento.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-full items-center gap-1.5 text-sm text-acento hover:underline"
                      title={documento.url}
                    >
                      <Download size={14} className="shrink-0" />
                      <span className="truncate">{documento.titulo}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ),
          },
          {
            id: "seo",
            titulo: "SEO",
            /*
              COMO O CONCORRENTE SE APRESENTA AO BUSCADOR, com o conteudo e nao
              so com os nomes dos campos: e o texto que disputa posicao com o
              nosso anuncio, e saber que existe um `title` nao diz nada — o que
              interessa e qual ele escolheu.

              Cada campo com botao proprio: sao textos longos que se colam
              inteiros ao escrever o nosso, um de cada vez.
            */
            conteudo: dados.seo && Object.values(dados.seo).some(Boolean) && (
              <dl className="space-y-2 text-sm">
                {/*
                  O artigo vem escrito, e nao colado na frente do rotulo: "o
                  descricao" e "o url canonica" era o que saia no titulo do
                  botao e no leitor de tela.
                */}
                {[
                  ["Título", "o título", dados.seo.title],
                  ["Descrição", "a descrição", dados.seo.description],
                  ["Palavras-chave", "as palavras-chave", dados.seo.keywords],
                  ["URL canônica", "a URL canônica", dados.seo.canonical],
                ]
                  .filter(([, , valor]) => valor)
                  .map(([rotulo, artigo, valor]) => (
                    <div
                      key={rotulo}
                      className="group flex flex-wrap items-start gap-2 border-b border-borda pb-2"
                    >
                      <dt className="w-28 shrink-0 text-xs text-suave">{rotulo}</dt>
                      <dd className="min-w-0 flex-1 break-words">{valor}</dd>
                      <Copiar texto={valor} rotulo={artigo} />
                    </div>
                  ))}
              </dl>
            ),
          },
        ]}
      />

      <p className="mt-4 text-xs text-suave">
        Coletado em {comoData(dados.vistoEm)}
        {dados.mudouEm && ` · última mudança de preço em ${comoData(dados.mudouEm)}`}
      </p>

      {/*
        Voltar ao topo.

        `sticky` e nao `absolute`: dentro de um container que rola, o absoluto
        sobe junto com o conteudo e some da tela — justamente quando ele passa a
        ser util. Assim ele fica preso ao rodape da area visivel.

        So aparece depois de 200px de rolagem: no alto da janela ele nao teria
        para onde levar, e ficaria tapando a foto.

        O `pointer-events-none` na faixa deixa o clique passar para o conteudo
        atras dela; so o botao recebe clique.
      */}
      <div className="pointer-events-none sticky bottom-0 flex justify-end">
        {rolou && (
          <button
            type="button"
            onClick={() => conteudoRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
            title="Voltar ao topo"
            aria-label="Voltar ao topo"
            className="pointer-events-auto rounded-full border border-borda bg-superficie p-2 text-suave shadow-md transition hover:text-texto"
          >
            <ArrowUp size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function TabelaMercados({ linhas }) {
  const [selecionada, setSelecionada] = useState(null);
  const [detalhe, setDetalhe] = useState(null);
  /**
   * QUAL FOTO, num lugar so.
   *
   * A galeria e a foto ampliada guardavam indices separados: navegar na
   * ampliada e fechar devolvia a galeria na foto antiga, como se o passeio nao
   * tivesse acontecido. `ampliada` diz apenas se a camada de cima esta aberta.
   */
  const [foto, setFoto] = useState(0);
  const [ampliada, setAmpliada] = useState(false);
  const [pendente, iniciarTransicao] = useTransition();

  /**
   * Busca o detalhe no clique, e nao junto com a listagem: a descricao tem uns
   * 10 KB por linha, e traze-la para cinquenta resultados seria meio megabyte
   * quase todo nunca lido.
   *
   * O estado e definido dentro da transicao disparada pelo clique — nao em
   * efeito, que o React 19 barra.
   */
  function abrir(id) {
    setSelecionada(id);
    setDetalhe(null);
    // Produto novo comeca na primeira foto: sem isto, abrir um item de quatro
    // fotos depois de outro em que se navegou ate a quarta mostraria a quarta
    // — ou nenhuma, se o novo tiver menos.
    setFoto(0);
    iniciarTransicao(async () => {
      setDetalhe(await detalhePagina(id));
    });
  }

  /**
   * Fecha UMA camada por vez.
   *
   * O Escape tem um dono so — a Janela — e ele decide o que fechar: com a foto
   * ampliada aberta, fecha a foto e deixa o produto na tela; sem ela, fecha o
   * detalhe. Com um ouvinte em cada componente, o Escape disparava os dois e
   * quem so queria voltar da foto perdia o produto que estava lendo.
   *
   * Nao ha problema em esta funcao mudar de identidade a cada render: quem a
   * usa no ouvinte de teclado e a Janela, que a guarda numa ref propria.
   */
  const fechar = useCallback(() => {
    if (ampliada) {
      setAmpliada(false);
      return;
    }
    setSelecionada(null);
    setDetalhe(null);
  }, [ampliada]);

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
        <table className="w-full text-sm">
          {/*
            CADA CABECALHO ALINHA COMO A CELULA DELE. Com o alinhamento so no
            <thead>, "CODIGO" ficava centralizado sobre valores a esquerda e
            "VALOR" sobre numeros a direita — a coluna parecia torta.
          */}
          <thead className="border-b border-borda bg-fundo text-xs tracking-wide text-suave uppercase">
            <tr className="divide-x divide-borda">
              <th className="w-16 px-3 py-2.5 text-center font-medium">Imagem</th>
              <th className="px-3 py-2.5 text-left font-medium">Nome</th>
              <th className="px-3 py-2.5 text-left font-medium">Código</th>
              <th className="w-32 px-3 py-2.5 text-left font-medium">Estoque</th>
              <th className="px-3 py-2.5 text-left font-medium">Valor</th>
              <th className="w-12 px-3 py-2.5 text-center font-medium">Site</th>
              <th className="w-28 px-3 py-2.5 text-center font-medium">Atualizado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {linhas.map((linha) => (
              <tr
                key={linha.id}
                onClick={() => abrir(linha.id)}
                aria-selected={selecionada === linha.id}
                // Sem estoque NAO esmaece a linha: o produto continua sendo
                // referencia de preco e de codigo, e o esmaecido dava a
                // entender que a linha valia menos que as outras. Quem diz que
                // esta esgotado e o rotulo, com todas as letras.
                className={`cursor-pointer hover:bg-fundo ${
                  selecionada === linha.id ? "bg-fundo" : ""
                }`}
              >
                <td className="px-3 py-2.5">
                  <div className="flex justify-center">
                    <Miniatura url={linha.imagem} alt={linha.titulo ?? ""} />
                  </div>
                </td>
                {/*
                  A LOJA VAI EMBAIXO DO NOME, com a letra C ou F colada nela —
                  e nao em coluna propria. O tipo e um adjetivo da loja ("o
                  concorrente Smartkits"), entao os dois se leem juntos; numa
                  coluna separada, o olho ia e voltava para juntar os dois.
                */}
                <td className="group max-w-md px-3 py-2.5">
                  <span className="flex items-start gap-1">
                    <span className="line-clamp-2">{linha.titulo ?? "—"}</span>
                    {linha.titulo && (
                      <Copiar texto={linha.titulo} rotulo="o nome" />
                    )}
                  </span>
                  <span className="mt-1 flex items-center gap-1.5 text-xs text-suave">
                    <SeloFonte tipo={linha.fonteTipo} />
                    <span className="truncate">{linha.fonteNome}</span>
                  </span>
                  {/* Busca ampla (09/10/2026): achado so no texto da loja, e nao no nome. */}
                  {linha.achado && (
                    <span className="mt-1 inline-block rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-800">
                      {linha.achado}
                    </span>
                  )}
                </td>
                {/* CODIGO antes de ESTOQUE (pedido do dono, 22/09/2026): e o
                    ponto de acesso ao produto, lido primeiro que a quantidade. */}
                <td className="group px-3 py-2.5 font-mono text-xs">
                  <span className="flex items-center gap-1">
                    {linha.skuFonte ?? linha.mpn ?? "—"}
                    {(linha.skuFonte || linha.mpn) && (
                      <Copiar texto={linha.skuFonte ?? linha.mpn} rotulo="o código" />
                    )}
                  </span>
                </td>
                {/*
                  Coluna propria (21/09/2026, pedido do dono): antes ficava
                  embutido embaixo do nome, disputando espaco com titulo longo.
                  "a chegar" so para FORNECEDOR: e a reserva que ele declara na
                  lista. Concorrente nao publica isso, e o campo nunca vem
                  preenchido — passar assim mesmo nao quebraria nada, mas
                  deixaria a regra implicita no dado em vez de escrita.
                */}
                <td className="px-3 py-2.5">
                  <ColunaEstoque
                    semEstoque={linha.semEstoque}
                    disponivel={linha.estoqueConhecido}
                    quantidade={linha.quantidade}
                    aChegar={linha.fonteTipo === "FORNECEDOR" ? linha.aChegar : null}
                  />
                </td>
                {/*
                  Vermelho e o preco de tabela; verde e o que o cliente paga a
                  vista. Sem o traco: risco diz "este valor nao vale mais", e
                  nao e o caso — quem paga no cartao paga o de cima.

                  O verde e maior que o vermelho porque e o numero que decide a
                  comparacao: o de tabela e referencia, o a vista e o que o
                  cliente do concorrente paga.

                  FORNECEDOR TEM DESENHO PROPRIO (ColunaValorFornecedor,
                  22/09/2026): o distribuidor cobra imposto por fora — a Benser
                  escreve "Preco unit. sem IPI" — e o numero que decide e o
                  total COM imposto, numa linha so ("R$ 8,06 (R$ 7,90 + 2%
                  IPI)"), com pronta entrega e reserva divididas como na coluna
                  Estoque.
                */}
                <td className="px-3 py-2.5 text-left tabular-nums">
                  {linha.fonteTipo === "FORNECEDOR" ? (
                    <ColunaValorFornecedor linha={linha} />
                  ) : (
                    <>
                      <span className="block text-xs text-red-600">
                        {comoMoeda(linha.precoAtual)}
                      </span>
                      {linha.precoPromocional !== null &&
                        linha.precoPromocional !== undefined && (
                          <span className="block font-medium text-emerald-700">
                            {comoMoeda(linha.precoPromocional)}
                          </span>
                        )}
                      <DicaFaixas precosPorQuantidade={linha.precosPorQuantidade} impostos={linha.impostos} />
                    </>
                  )}
                </td>
                {/*
                  O clique no link NAO pode abrir o detalhe junto: sao duas
                  intencoes diferentes, e sem o stopPropagation o painel abria
                  atras da aba nova toda vez.
                */}
                <td className="px-3 py-2.5 text-center">
                  {(() => {
                    const link = linkDaFonte(linha);
                    return link ? (
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(evento) => evento.stopPropagation()}
                        title={link.titulo}
                        className="inline-flex text-acento hover:opacity-70"
                      >
                        <ExternalLink size={15} />
                      </a>
                    ) : (
                      <span className="text-suave">—</span>
                    );
                  })()}
                </td>
                <td className="px-3 py-2.5 text-center text-suave">
                  {comoData(linha.vistoEm)}
                  {/* Fora da ultima varredura da loja (pedido do dono em 07/10/2026: mostrar, e nao esconder). */}
                  {linha.naoVistoDesde && (
                    <span
                      title="A ultima varredura desta loja nao passou por este produto. Preco e estoque sao do dia em que ele foi visto pela ultima vez."
                      className="mt-1 block rounded bg-amber-50 px-1 py-0.5 text-[11px] leading-tight font-medium text-amber-800"
                    >
                      Não visto desde {comoData(linha.naoVistoDesde)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Janela aberta={selecionada !== null} aoFechar={fechar}>
        <Detalhe
          dados={detalhe}
          carregando={pendente}
          foto={foto}
          aoTrocarFoto={setFoto}
          aoAmpliar={() => setAmpliada(true)}
        />
      </Janela>

      {/*
        A foto ampliada mora AQUI, e nao dentro do Detalhe: e a camada de cima,
        e o estado dela precisa estar no mesmo lugar que decide o que o Escape
        fecha.
      */}
      <FotoAmpliada
        imagens={detalhe?.imagens}
        indice={ampliada ? Math.min(foto, (detalhe?.imagens?.length ?? 1) - 1) : null}
        alt={detalhe?.titulo}
        aoTrocar={setFoto}
        aoFechar={() => setAmpliada(false)}
      />
    </>
  );
}
