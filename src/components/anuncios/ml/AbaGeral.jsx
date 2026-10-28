"use client";

import { MarcaDaPropostaNoCampo, SugestaoDaProposta } from "@/components/anuncios/PropostaDoAnuncio";
import { useId, useState } from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";

import Campo, { CLASSE_CAMPO, bordaDoCampo } from "@/components/cadastros/Campo";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { aplicarComposicao } from "@/lib/canaisDeVenda/ml/rascunho";
import { TIPOS_DE_ANUNCIO_ML } from "@/lib/canaisDeVenda/ml/rotulos";
import { PRAZO_MAXIMO_DIAS, limiteDoTitulo } from "@/lib/canaisDeVenda/ml/validacao";
import BlocoComposicao from "./BlocoComposicao";
import MensagensDoCampo, { problemasDoCampo } from "./MensagensDoCampo";
import SecaoDoAnuncio from "./SecaoDoAnuncio";
import SugestaoDeCategoria from "./SugestaoDeCategoria";
import SugestaoDeTitulo from "./SugestaoDeTitulo";

// Ligar a caixa cria um kit de duas unidades do produto principal: a composicao precisa de ao
// menos duas, e o dono ajusta a quantidade e inclui os demais itens.
const composicaoDoKitNovo = (produtoId) => ({
  itens: [{ produtoId, quantidade: 2 }],
  codigo: "",
  blingProdutoId: null,
});

/**
 * Duas ou tres opcoes lado a lado, como o `EscolhaDoTipo` do cadastro de Cliente: sao
 * <input type="radio"> de verdade (escondidos, o rotulo e o alvo do clique), entao o teclado
 * (setas, Tab) continua funcionando. O nome do grupo e gerado: o editor pode estar numa janela
 * sobre uma tela que ja tenha outro grupo com o mesmo nome.
 */
// `oculto`: o rotulo so para o leitor de tela, quando o titulo do cartao ja o diz.
function EscolhaEntre({ rotulo, opcoes, valor, aoMudar, oculto = false }) {
  const nome = useId();
  return (
    <div>
      <p id={`${nome}-rotulo`} className={oculto ? "sr-only" : "text-sm font-semibold"}>
        {rotulo}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={`${nome}-rotulo`}
        className={`${oculto ? "" : "mt-1"} inline-flex overflow-hidden rounded border border-borda text-sm`}
      >
        {opcoes.map((opcao) => (
          <label
            key={opcao.valor}
            className={`cursor-pointer px-4 py-2 font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-acento ${
              valor === opcao.valor ? "bg-acento text-white" : "bg-superficie text-suave hover:bg-fundo"
            }`}
          >
            <input
              type="radio"
              name={nome}
              value={opcao.valor}
              checked={valor === opcao.valor}
              onChange={() => aoMudar(opcao.valor)}
              className="sr-only"
            />
            {opcao.rotulo}
          </label>
        ))}
      </div>
    </div>
  );
}

/**
 * Prazo de disponibilidade em dias (pedido do dono em 26/10/2026, padrao 1): vai ao ML como MANUFACTURING_TIME. So
 * digitos; o texto digitado fica na tela enquanto o rascunho recebe o numero (vazio = null, e a validacao acusa).
 */
function CampoPrazo({ valor, erro, aoMudar }) {
  const [digitado, setDigitado] = useState(null);
  const mostrado = digitado ?? (valor === null || valor === undefined ? "" : String(valor));
  return (
    <Campo
      nome="ml-prazo"
      rotulo="Prazo de disponibilidade (dias)"
      ajuda={`Em quantos dias o produto fica pronto para envio depois da venda. 0 é pronta entrega. Vai ao Mercado Livre como disponibilidade de estoque; até ${PRAZO_MAXIMO_DIAS} dias.`}
    >
      {/* O CLASSE_CAMPO traz w-full: a largura curta vem do involucro. */}
      <div className="w-28">
        <input
          id="ml-prazo"
          inputMode="numeric"
          autoComplete="off"
          value={mostrado}
          onChange={(evento) => {
            const texto = evento.target.value.replace(/\D/g, "").slice(0, 3);
            setDigitado(texto);
            aoMudar(texto === "" ? null : Number(texto));
          }}
          onBlur={() => setDigitado(null)}
          className={`${CLASSE_CAMPO} ${bordaDoCampo(erro)}`}
        />
      </div>
    </Campo>
  );
}

/**
 * A garantia do PRODUTO BASE, so leitura (era a aba Garantia; foi para o lado do Tipo de anuncio em 26/10/2026, pedido do
 * dono). Vai ao ML nos termos de venda (`termosDeVenda`, payload.js): "Garantia do vendedor" e os meses. Produto sem garantia
 * nao manda nada. Mudar e no cadastro do produto.
 */
function GarantiaDoProduto({ rascunho, contexto }) {
  const meses = Number(contexto.produtos?.[rascunho.produtoId]?.garantiaMeses);
  const temGarantia = Number.isInteger(meses) && meses > 0;
  return (
    <SecaoDoAnuncio
      titulo="Garantia"
      ajuda="A do cadastro do produto. Vai ao Mercado Livre na publicação; no kit, vale a do produto principal."
      acao={
        rascunho.produtoId && (
          <Link href={`/produtos/${rascunho.produtoId}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-acento hover:bg-superficie">
            <Pencil size={12} />
            Editar no produto
          </Link>
        )
      }
    >
      {temGarantia ? (
        <p className="flex h-10 items-center text-sm">
          Garantia do vendedor · <span className="ml-1 font-medium">{meses} {meses === 1 ? "mês" : "meses"}</span>
        </p>
      ) : (
        <p className="flex h-10 items-center text-sm text-amber-700">Sem garantia no cadastro: nada vai ao Mercado Livre.</p>
      )}
    </SecaoDoAnuncio>
  );
}

/**
 * Aba Caracteristicas do editor (era "Geral"; pedido do dono em 26/10/2026): um cartao por assunto. O produto base fica
 * no cabecalho da janela, e a condicao saiu (o anuncio e sempre novo). Cada problema aparece embaixo do campo a que se
 * refere; o do produto (nao Conferido, sem blingId) no topo, so quando existe.
 */
export default function AbaGeral({ rascunho, contexto, alterar, setContexto, problemas, anuncioId, carregandoCategoria, jaNoML = false }) {
  // Anuncio ja no ML (28/10/2026): o ML nao aceita trocar titulo, categoria nem tipo, e a composicao mudaria o produto. So o
  // prazo de disponibilidade continua editavel aqui; o resto fica a vista, travado.
  const travaNoML = jaNoML ? { inert: true, className: "opacity-60" } : {};
  const primeiro = (campo) => problemasDoCampo(problemas, campo)[0]?.problema;

  const emKit = Boolean(rascunho.composicao);
  const titulo = rascunho.titulo ?? "";
  // O limite vem da categoria lida do ML (60 enquanto ela nao chega), o mesmo que a validacao usa.
  const LIMITE_TITULO = limiteDoTitulo(rascunho, contexto);
  const categoriaLida = contexto.categoria?.id === rascunho.categoriaId ? contexto.categoria : null;
  // O mesmo tamanho que a validacao confere (sem os brancos das pontas).
  const tamanhoDoTitulo = titulo.trim().length;
  const erroDoTitulo = primeiro("titulo");

  function alternarComposicao(ligada) {
    // O codigo em uso era de outra composicao (ou de nenhuma): nao pode acusar a nova.
    setContexto((atual) => (atual.codigoEmUso === null ? atual : { ...atual, codigoEmUso: null }));
    alterar((atual) =>
      aplicarComposicao(atual, ligada ? composicaoDoKitNovo(atual.produtoId) : null, contexto.produtos),
    );
  }

  // Desenho de 26/10/2026 (pedido do dono, "que caiba tudo na mesma janela, inclusive a composicao"): o Sugerir ao lado do
  // campo, Tipo de anuncio e Garantia lado a lado, Categoria e Disponibilidade lado a lado, cada um no seu cartao.
  return (
    <div className="space-y-3">
      <MensagensDoCampo problemas={problemas} campo={["produto", "blingId"]} />

      {jaNoML && (
        <p className="text-xs text-suave">Título, tipo, categoria e composição já foram ao Mercado Livre e não mudam: para mudar, clone o anúncio.</p>
      )}
      <div {...travaNoML}>
      <SecaoDoAnuncio
        titulo="Título"
        // Medido em 26/10/2026 no MLB7881037020 (100104, pausado, sem vendas): PUT de `title` da 400 "You cannot modify the
        // title if the item has a family_name" e PUT de `family_name` da 400 "The field family name is invalid". Na conta
        // User Products o titulo nao muda pela API depois de publicado, com ou sem venda.
        ajuda="Vai ao Mercado Livre como o nome da família (family_name). No modelo User Products, o ML monta o título final a partir dele e dos atributos da ficha técnica. Depois de publicado, o Mercado Livre não aceita trocar o título (nem sem vendas): para outro título, clone o anúncio."
        acao={
          <span className={`text-[11px] tabular-nums ${tamanhoDoTitulo > LIMITE_TITULO ? "font-medium text-red-700" : "text-suave"}`}>
            {tamanhoDoTitulo}/{LIMITE_TITULO}
          </span>
        }
      >
        <SugestaoDeTitulo rascunho={rascunho} contexto={contexto} alterar={alterar} limite={LIMITE_TITULO}>
          <input
            id="ml-titulo"
            aria-label="Título"
            value={titulo}
            onChange={(evento) => alterar({ titulo: evento.target.value })}
            className={`${CLASSE_CAMPO} ${bordaDoCampo(erroDoTitulo)}`}
          />
        </SugestaoDeTitulo>
        {erroDoTitulo && <p className="mt-1 text-[11px] text-red-700">{erroDoTitulo}</p>}
        <MarcaDaPropostaNoCampo proposta={contexto.proposta} caminho="titulo" valorAtual={rascunho.titulo} />
        <SugestaoDaProposta proposta={contexto.proposta} caminho="titulo" valorAtual={rascunho.titulo} aoUsar={(valor) => alterar({ titulo: String(valor) })} />
      </SecaoDoAnuncio>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <SecaoDoAnuncio titulo="Tipo de anúncio">
          <div {...travaNoML}>
          <EscolhaEntre rotulo="Tipo de anúncio" oculto opcoes={TIPOS_DE_ANUNCIO_ML} valor={rascunho.tipoAnuncio} aoMudar={(tipoAnuncio) => alterar({ tipoAnuncio })} />
          </div>
        </SecaoDoAnuncio>
        <GarantiaDoProduto rascunho={rascunho} contexto={contexto} />
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <SecaoDoAnuncio titulo="Categoria do ML" ajuda="Use 'Sugerir categoria' ou digite o código (MLB seguido de números). Só categoria final aceita anúncio.">
          <div {...travaNoML}>
          <SugestaoDeCategoria rascunho={rascunho} alterar={alterar}>
            <input
              id="ml-categoria"
              aria-label="Categoria do ML"
              value={rascunho.categoriaId ?? ""}
              // O codigo da categoria e sempre MLB em maiusculas: "mlb1234" so daria erro na validacao.
              // Digitado a mao, o nome que veio com a sugestao deixa de valer.
              onChange={(evento) => alterar({ categoriaId: evento.target.value.toUpperCase() || null, categoriaNome: null })}
              placeholder="MLB1234"
              className={`${CLASSE_CAMPO} ${bordaDoCampo(primeiro("categoria"))}`}
            />
          </SugestaoDeCategoria>
          </div>
          {primeiro("categoria") && <p className="mt-1 text-[11px] text-red-700">{primeiro("categoria")}</p>}
          {carregandoCategoria ? (
            <p className="mt-1 text-[11px] text-suave">Lendo a categoria no Mercado Livre...</p>
          ) : (
            categoriaLida && <p className="mt-1 truncate text-[11px] text-suave">{categoriaLida.caminho.join(" > ")}</p>
          )}
          <MarcaDaPropostaNoCampo proposta={contexto.proposta} caminho="categoriaId" valorAtual={rascunho.categoriaId} />
          <SugestaoDaProposta proposta={contexto.proposta} caminho="categoriaId" valorAtual={rascunho.categoriaId} aoUsar={(valor) => alterar({ categoriaId: String(valor), categoriaNome: contexto.proposta?.sugestoes?.categoriaNome ?? null })} />
        </SecaoDoAnuncio>

        <SecaoDoAnuncio titulo="Disponibilidade">
          <CampoPrazo valor={rascunho.prazoDisponibilidadeDias} erro={primeiro("prazoDisponibilidade")} aoMudar={(prazoDisponibilidadeDias) => alterar({ prazoDisponibilidadeDias })} />
          <MensagensDoCampo problemas={problemas} campo="prazoDisponibilidade" />
        </SecaoDoAnuncio>
      </div>

      <div {...travaNoML}>
      <SecaoDoAnuncio
        titulo="Composição (kit)"
        acao={
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={emKit} onChange={(evento) => alternarComposicao(evento.target.checked)} className="h-4 w-4 accent-acento" />
            Anúncio de composição
          </label>
        }
      >
        {emKit ? (
          <BlocoComposicao rascunho={rascunho} contexto={contexto} alterar={alterar} setContexto={setContexto} problemas={problemas} anuncioId={anuncioId} />
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-suave">
            Anúncio de um produto só.
            <BolhaDeAjuda
              variante="inline"
              texto="Marque para vender várias unidades, ou produtos diferentes, num anúncio só. Desmarcar devolve a descrição, o estoque, as fotos e as medidas do produto principal."
            />
          </p>
        )}
      </SecaoDoAnuncio>
      </div>
    </div>
  );
}
