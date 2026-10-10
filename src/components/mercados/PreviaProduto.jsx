"use client";

import { useState } from "react";
import { Check, ImageOff, X } from "lucide-react";

import { AmpliacaoDeFoto } from "@/components/produtos/ImagemComZoom";

import Badge from "@/components/ui/Badge";
import RegrasDeCompra from "@/components/mercados/RegrasDeCompra";
import { precoComImpostos } from "@/lib/coleta/impostos";
import { ROTULOS_CAMPOS, valoresDoProduto } from "@/lib/coleta/campos";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const SITUACAO = {
  AVAILABLE: { rotulo: "Disponível", tom: "sucesso" },
  // O mesmo fato com o nome dos leitores de fornecedor: sem esta linha, produto
  // compravel na Santana aparecia "Indeterminado".
  IN_STOCK: { rotulo: "Disponível", tom: "sucesso" },
  OUT_OF_STOCK: { rotulo: "Sem estoque", tom: "alerta" },
  PAUSED: { rotulo: "Pausado", tom: "erro" },
  UNKNOWN: { rotulo: "Indeterminado", tom: "neutro" },
};

/// Campos que ja aparecem com destaque proprio (preco, estoque, descricao,
/// imagens) saem da grade de identificacao para nao serem ditos duas vezes.
const NA_GRADE = ["name", "code", "mpn", "ean", "brand", "model", "category", "ncm"];

/**
 * Imagem vinda do site do concorrente.
 *
 * SEMPRE <img>, nunca next/image: o host e arbitrario, e o next/image LANCA
 * EXCECAO quando ele nao esta em images.remotePatterns — uma URL de loja
 * desconhecida derrubaria a tela do teste inteira. O onError cobre o link
 * quebrado, para que uma imagem fora do ar nao deixe um buraco sem explicacao.
 */
function Imagem({ url, alt, tamanho = "h-28 w-28", aoClicar = null }) {
  if (!url) {
    return (
      <div
        className={`${tamanho} flex shrink-0 items-center justify-center rounded border border-borda bg-fundo text-suave`}
      >
        <ImageOff size={18} />
      </div>
    );
  }

  const foto = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt ?? ""}
      onError={(evento) => {
        evento.currentTarget.style.display = "none";
      }}
      className={`${tamanho} shrink-0 rounded border border-borda bg-superficie object-contain`}
    />
  );

  if (!aoClicar) return foto;

  // Clique abre a foto grande, com setas (pedido do dono em 10/10/2026, no padrao
  // das fotos de Produtos). Botao de verdade, para o teclado alcancar.
  return (
    <button
      type="button"
      onClick={aoClicar}
      className="shrink-0 cursor-zoom-in rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-acento"
      aria-label={alt ? `Ampliar foto: ${alt}` : "Ampliar foto"}
    >
      {foto}
    </button>
  );
}

/**
 * Uma celula da grade. Campo nao coletado aparece como "—", nunca some.
 *
 * Mostra DE ONDE o valor veio. Sem isso, um campo derivado — o "Codigo", que e
 * copia do SKU quando a loja nao publica codigo proprio — aparecia identico a um
 * campo lido da pagina, e nao havia como saber qual era qual sem abrir o HTML.
 */
function Campo({ rotulo, valor, origem, mono = false }) {
  const vazio = valor === null || valor === undefined || valor === "";
  const derivado = origem?.startsWith("copiado");

  return (
    <div className="min-w-0">
      <dt className="text-xs text-suave">{rotulo}</dt>
      <dd
        className={`truncate text-sm ${vazio ? "text-suave" : ""} ${
          mono && !vazio ? "font-mono text-xs" : ""
        }`}
        title={vazio ? "não publicado por este site" : String(valor)}
      >
        {vazio ? "—" : valor}
      </dd>
      {/* Vazio com origem: o site tem o dado, mas em outro lugar (o link do produto). */}
      {vazio && origem && (
        <p className="text-[10px] text-amber-700" title={origem}>
          {origem}
        </p>
      )}
      {!vazio && origem && (
        <p
          className={`truncate text-[10px] ${derivado ? "text-amber-700" : "text-suave"}`}
          title={origem}
        >
          {derivado ? "⚠ " : ""}
          {origem}
        </p>
      )}
    </div>
  );
}

export default function PreviaProduto({ produto, indice }) {
  // O que vai chegar so tem caixa quando o arquivo trouxe o dado.
  const temReserva =
    typeof produto.stock?.aChegar === "number" ||
    typeof produto.prices?.reserva === "number";

  // Sem preco proprio de reserva, vale o da pronta entrega: e o que o
  // fornecedor cobra quando nao diferencia.
  const reservaHerdada = typeof produto.prices?.reserva !== "number";
  const precoDeReserva = reservaHerdada ? produto.prices?.normal : produto.prices.reserva;

  const reservaComImpostos = precoComImpostos(precoDeReserva, produto.taxes);

  const resumoDeImpostos = (produto.taxes ?? [])
    .map((imposto) => `${imposto.nome} ${String(imposto.percentual).replace(".", ",")}%`)
    .join(" + ");
  const situacao = SITUACAO[produto.stock?.status] ?? SITUACAO.UNKNOWN;
  const temPromocional = typeof produto.prices?.promotional === "number";
  // O "promocional" que e so o DESCONTO A VISTA (pix, boleto, deposito) nao e promocao:
  // a Policomp mostra R$ 632,90 na pagina e o 601,26 so no popup "Ver meios de
  // pagamento" (10/10/2026). Riscar o preco normal fazia parecer liquidacao. Quem diz
  // qual dos dois casos e a origem gravada pelo leitor de cada plataforma.
  const ehAVista =
    temPromocional &&
    /pix|vista|boleto|pagamento|dep[oó]sito|transfer[eê]ncia|desconto de [\d.,]+% da loja/i.test(
      produto.origens?.precoPromocional ?? "",
    );
  const fotos = produto.images ?? [];
  const [ampliada, setAmpliada] = useState(null);
  const valores = valoresDoProduto(produto);
  const especificacoes = produto.specifications ?? [];
  const documentos = produto.documentos ?? [];

  return (
    <div className="rounded-lg border border-borda bg-superficie p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs tracking-wide text-suave uppercase">
          Produto {indice}
          {/*
            Quando link e arquivo sao testados juntos, os produtos aparecem
            lado a lado. Sem dizer de onde veio cada um, a previa sugeriria que
            o site entrega o que so o arquivo entregou.
          */}
          {produto.origemDaLeitura && (
            <span className="ml-2 rounded border border-borda px-1.5 py-0.5 text-[10px] normal-case">
              {produto.origemDaLeitura}
            </span>
          )}
        </p>
        <p className="text-xs text-suave">
          Coletado em{" "}
          {new Date(produto.collectedAt).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1.5">
          <Imagem
            url={fotos[0]}
            alt={produto.name}
            aoClicar={fotos[0] ? () => setAmpliada(0) : null}
          />
          {fotos.length > 1 && (
            <div className="flex max-w-28 flex-wrap gap-1">
              {fotos.slice(1, 5).map((url, posicao) => (
                <Imagem
                  key={url}
                  url={url}
                  alt=""
                  tamanho="h-6 w-6"
                  aoClicar={() => setAmpliada(posicao + 1)}
                />
              ))}
              {fotos.length > 5 && (
                <button
                  type="button"
                  onClick={() => setAmpliada(5)}
                  className="self-center text-xs text-suave hover:text-texto"
                  title="Ver as outras fotos"
                >
                  +{fotos.length - 5}
                </button>
              )}
            </div>
          )}
        </div>

        {ampliada !== null && fotos[ampliada] && (
          <AmpliacaoDeFoto
            src={fotos[ampliada]}
            alt={produto.name ?? ""}
            posicao={ampliada}
            total={fotos.length}
            aoFechar={() => setAmpliada(null)}
            aoNavegar={(passo) => setAmpliada((atual) => atual + passo)}
          />
        )}

        <div className="min-w-56 flex-1 space-y-3">
          <p className="font-medium">{produto.name}</p>

          {/* Identificacao: todos os campos, inclusive os que o site nao deu. */}
          <dl className="grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-4">
            {NA_GRADE.filter((campo) => campo !== "name").map((campo) => (
              <Campo
                key={campo}
                rotulo={ROTULOS_CAMPOS[campo]}
                valor={produto[campo]}
                origem={produto.origens?.[campo]}
                mono={["code", "mpn", "ean", "ncm"].includes(campo)}
              />
            ))}
          </dl>

          {/*
            Duas caixas: o que da para despachar hoje e o que ainda vai chegar.
            Cada uma com o preco e a quantidade DELA, porque sao decisoes de
            compra diferentes — repor o que vendeu e planejar importacao nao se
            comparam pelo mesmo numero.

            A caixa de reserva so aparece quando o arquivo trouxe esse dado.
            Mostra-la vazia sugeriria que o fornecedor nao tem nada a chegar,
            quando a verdade e que a lista nao foi carregada.
          */}
          {/*
            As caixas acompanham o proprio conteudo, sem `flex-1`.
            Esticando-as, a de pronta entrega ocupava a largura inteira da tela
            quando vinha sozinha, e a moldura sugeria campos a direita que nao
            existem. O `min-w` continua garantindo que preco e quantidade caibam
            lado a lado antes de quebrar.
          */}
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-[15rem] rounded border border-borda px-3 py-2.5">
              <p className="mb-2 text-xs font-medium tracking-wide text-suave uppercase">
                Pronta entrega
              </p>

              <div className="flex flex-wrap items-start gap-x-5 gap-y-2">
                <div>
                  <p className="text-xs text-suave">Preço</p>
                  <p
                    className={
                      temPromocional && !ehAVista
                        ? "text-sm text-suave line-through"
                        : "text-lg font-semibold tabular-nums"
                    }
                  >
                    {/*
                      Preco ausente e travessao, nunca R$ 0,00: fornecedor de
                      portal fechado nao publica preco, e formatar null como
                      zero diria que o produto e de graca.
                    */}
                    {typeof produto.prices.normal === "number"
                      ? MOEDA.format(produto.prices.normal)
                      : "—"}
                  </p>
                </div>

                {temPromocional && (
                  <div>
                    <p className="text-xs text-suave" title={produto.origens?.precoPromocional ?? undefined}>
                      {ehAVista ? "À vista (pix/boleto)" : ROTULOS_CAMPOS.precoPromocional}
                    </p>
                    <p className="text-lg font-semibold tabular-nums text-emerald-700">
                      {MOEDA.format(produto.prices.promotional)}
                    </p>
                  </div>
                )}

                {/*
                  Imposto por fora: o preco de tabela e um numero, o que se
                  paga e outro. O que entrou na conta vem entre parenteses —
                  sem isso, o valor maior parece preco inflado sem explicacao.
                */}
                {typeof produto.prices?.comImpostos === "number" && (
                  <div>
                    <p className="text-xs text-suave">Com impostos</p>
                    <p className="text-lg font-semibold tabular-nums">
                      {MOEDA.format(produto.prices.comImpostos)}
                    </p>
                    {(produto.taxes ?? []).length > 0 && (
                      <p className="text-xs text-suave">({resumoDeImpostos})</p>
                    )}
                  </div>
                )}

                <div>
                  <p className="text-xs text-suave">Quantidade</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {typeof produto.stock?.quantity === "number" ? (
                      produto.stock.quantity
                    ) : (
                      <span className="text-sm font-normal text-suave">não informada</span>
                    )}
                  </p>
                </div>

              </div>
            </div>

            {temReserva && (
              <div className="min-w-[13rem] rounded border border-amber-200 bg-amber-50/40 px-3 py-2.5">
                <p className="mb-2 text-xs font-medium tracking-wide text-amber-800 uppercase">
                  Reserva
                </p>

                <div className="flex flex-wrap items-start gap-x-5 gap-y-2">
                  <div>
                    <p className="text-xs text-suave">Preço</p>
                    <p className="text-lg font-semibold tabular-nums">
                      {typeof precoDeReserva === "number" ? MOEDA.format(precoDeReserva) : "—"}
                    </p>
                    {/*
                      Fornecedor que nao publica preco separado para o que vai
                      chegar cobra o mesmo da pronta entrega. Dizer de onde veio
                      evita que o numero repetido pareca erro de leitura.
                    */}
                    {reservaHerdada && (
                      <p className="text-xs text-suave">(mesmo da pronta entrega)</p>
                    )}
                  </div>

                  {/*
                    O imposto e do produto, nao da modalidade: a mesma aliquota
                    incide sobre o que chega depois. Mostrar so na pronta
                    entrega faria o custo da reserva parecer menor do que e.
                  */}
                  {typeof reservaComImpostos === "number" && (
                    <div>
                      <p className="text-xs text-suave">Com impostos</p>
                      <p className="text-lg font-semibold tabular-nums">
                        {MOEDA.format(reservaComImpostos)}
                      </p>
                      {resumoDeImpostos && (
                        <p className="text-xs text-suave">({resumoDeImpostos})</p>
                      )}
                    </div>
                  )}

                  <div>
                    <p className="text-xs text-suave">Quantidade</p>
                    <p className="text-lg font-semibold tabular-nums">
                      {typeof produto.stock?.aChegar === "number" ? (
                        produto.stock.aChegar
                      ) : (
                        <span className="text-sm font-normal text-suave">não informada</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <RegrasDeCompra
              precoNormal={produto.prices?.normal}
              precosPorQuantidade={produto.precosPorQuantidade}
              multiploVenda={produto.multiploVenda}
            />
          </div>

          {/*
            Status fica FORA das caixas: ele descreve o produto, nao a
            modalidade. Dentro da pronta entrega, sugeria que a reserva teria um
            status proprio — e o campo e um so.
          */}
          <div className="mt-3">
            <p className="text-xs text-suave">{ROTULOS_CAMPOS.status}</p>
            <div className="mt-0.5">
              <Badge tom={situacao.tom}>{situacao.rotulo}</Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-1 text-xs text-suave">{ROTULOS_CAMPOS.url}</p>
        {/*
          Produto vindo de arquivo nao tem endereco: o catalogo do fornecedor
          nao publica um. Campo vazio parecia falha de leitura; travessao diz
          o mesmo que os outros campos ausentes dizem.
        */}
        {produto.url ? (
          <a
            href={produto.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-xs text-acento hover:underline"
          >
            {produto.url}
          </a>
        ) : (
          <p className="text-xs text-suave">—</p>
        )}
      </div>

      <div className="mt-3">
        <p className="mb-1 text-xs text-suave">
          {ROTULOS_CAMPOS.description}
          {produto.description && (
            <span className="ml-1">({produto.description.length} caracteres)</span>
          )}
        </p>
        {produto.description ? (
          // Texto puro, nunca dangerouslySetInnerHTML: e conteudo de terceiro, e
          // renderizar cru transformaria uma pagina comprometida em execucao de
          // script dentro do sistema. Como filho de um elemento, o React escapa.
          <p className="max-h-40 overflow-y-auto rounded border border-borda bg-fundo p-2 text-xs whitespace-pre-wrap">
            {produto.description}
          </p>
        ) : (
          <p className="text-sm text-suave">—</p>
        )}
      </div>

      <div className="mt-3">
        <p className="mb-1 text-xs text-suave">
          {ROTULOS_CAMPOS.specifications}
          {especificacoes.length > 0 && (
            <span className="ml-1">({especificacoes.length})</span>
          )}
        </p>
        {especificacoes.length > 0 ? (
          // Preenche POR COLUNA (pedido do dono, 10/10/2026): a primeira metade, em ordem,
          // na esquerda e o resto na direita. Com numero impar, a linha a mais fica na
          // esquerda. No celular continua uma coluna so, na mesma ordem.
          <dl
            className="grid grid-cols-1 gap-x-6 text-xs sm:grid-flow-col sm:grid-cols-2 sm:[grid-template-rows:repeat(var(--linhas),auto)]"
            style={{ "--linhas": Math.ceil(especificacoes.length / 2) }}
          >
            {especificacoes.map((item, indice) => (
              <div
                key={`${item.nome ?? "item"}-${indice}`}
                className="flex gap-2 border-b border-borda py-1"
              >
                {/*
                  Linha sem rotulo e caracteristica solta da ficha ("Tecnologia
                  ultra silenciosa"). Aparece com marcador, e nao com um nome
                  inventado do lado esquerdo.
                */}
                {item.nome ? (
                  <>
                    <dt className="shrink-0 text-suave">{item.nome}:</dt>
                    <dd className="min-w-0 truncate" title={String(item.valor)}>
                      {String(item.valor)}
                    </dd>
                  </>
                ) : (
                  <>
                    <dt className="shrink-0 text-suave">·</dt>
                    <dd className="min-w-0 truncate" title={String(item.valor)}>
                      {String(item.valor)}
                    </dd>
                  </>
                )}
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-suave">—</p>
        )}
      </div>

      {/*
        Documentos: o datasheet do concorrente, clicavel.

        E o que permite conferir se o produto dele e o MESMO que o nosso — dois
        modulos com nome diferente e o mesmo CI sao o mesmo item. So aparece
        quando a pagina publica algum: secao vazia sugeriria que a loja nao tem
        material tecnico, quando a verdade e que este produto nao tem.
      */}
      {documentos.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs text-suave">
            {ROTULOS_CAMPOS.documentos}
            <span className="ml-1">({documentos.length})</span>
          </p>
          <ul className="space-y-1">
            {documentos.map((documento) => (
              <li key={documento.url}>
                <a
                  href={documento.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full items-center gap-1.5 text-xs text-acento hover:underline"
                  title={documento.url}
                >
                  <span aria-hidden>↓</span>
                  <span className="truncate">{documento.titulo}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/*
        SEO nao descreve o produto: descreve como a loja tenta ser achada. Fica
        num bloco proprio para nao se confundir com dado do item — o titulo de
        SEO costuma ser diferente do nome do produto, e mistura-los faria
        parecer que a loja publica dois nomes.
      */}
      <div className="mt-3">
        <p className="mb-1 text-xs text-suave">
          {ROTULOS_CAMPOS.seo}
          <span className="ml-1">(como o concorrente se apresenta ao buscador)</span>
        </p>
        {produto.origens?.seo && (
          <p className="mb-1 text-xs text-suave">{produto.origens.seo}</p>
        )}
        {Object.values(produto.seo ?? {}).some(Boolean) ? (
          <dl className="space-y-0.5 rounded border border-borda bg-fundo p-2 text-xs">
            {[
              ["Título", produto.seo.title],
              ["Descrição", produto.seo.description],
              ["Palavras-chave", produto.seo.keywords],
              ["URL canônica", produto.seo.canonical],
            ]
              .filter(([, valor]) => valor)
              .map(([rotulo, valor]) => (
                <div key={rotulo} className="flex gap-2">
                  <dt className="shrink-0 text-suave">{rotulo}:</dt>
                  <dd className="min-w-0 truncate" title={valor}>
                    {valor}
                  </dd>
                </div>
              ))}
          </dl>
        ) : (
          <p className="text-sm text-suave">—</p>
        )}
      </div>

      <div className="mt-3">
        <p className="mb-1 text-xs text-suave">Variações</p>
        {produto.variants?.length > 0 ? (
          <ul className="text-xs">
            {produto.variants.map((variacao) => (
              <li key={variacao.name}>
                {variacao.name}: {variacao.options.join(" / ")}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-suave">
            — <span className="text-xs">(sem variação agrupada nesta página)</span>
          </p>
        )}
      </div>

      {/*
        Fecha com o placar do proprio produto. O relatorio de cima diz o que a
        LOJA publica em algum lugar; aqui diz o que ESTE item trouxe — e os dois
        divergem quando parte do catalogo e mais completa que o resto.
      */}
      <div className="mt-4 space-y-1.5 border-t border-borda pt-2.5 text-xs">
        {/*
          Achados e ausentes em linhas separadas. Misturados, era preciso ler
          o icone de cada um para saber o que a fonte entregou; separados, a
          resposta esta na primeira linha.
        */}
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {Object.entries(ROTULOS_CAMPOS)
            .filter(([campo]) => valores[campo] !== null)
            .map(([campo, rotulo]) => (
              <span key={campo} className="inline-flex items-center gap-1 text-emerald-700">
                <Check size={12} />
                {rotulo}
              </span>
            ))}
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {Object.entries(ROTULOS_CAMPOS)
            .filter(([campo]) => valores[campo] === null)
            .map(([campo, rotulo]) => (
              <span key={campo} className="inline-flex items-center gap-1 text-red-300">
                <X size={12} />
                {rotulo}
              </span>
            ))}
        </div>
      </div>
    </div>
  );
}
