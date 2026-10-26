"use client";

import { MarcaDaPropostaNoCampo, SugestaoDaProposta } from "@/components/anuncios/PropostaDoAnuncio";
import { useId, useState } from "react";

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
function EscolhaEntre({ rotulo, opcoes, valor, aoMudar }) {
  const nome = useId();
  return (
    <div>
      <p id={`${nome}-rotulo`} className="text-sm font-semibold">
        {rotulo}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={`${nome}-rotulo`}
        className="mt-1 inline-flex overflow-hidden rounded border border-borda text-sm"
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
 * Aba Caracteristicas do editor (era "Geral"; pedido do dono em 26/10/2026): um cartao por assunto. O produto base fica
 * no cabecalho da janela, e a condicao saiu (o anuncio e sempre novo). Cada problema aparece embaixo do campo a que se
 * refere; o do produto (nao Conferido, sem blingId) no topo, so quando existe.
 */
export default function AbaGeral({ rascunho, contexto, alterar, setContexto, problemas, anuncioId, carregandoCategoria }) {
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

  return (
    <div className="space-y-4">
      <MensagensDoCampo problemas={problemas} campo={["produto", "blingId"]} />

      <SecaoDoAnuncio
        titulo="Título"
        ajuda="Vai ao Mercado Livre como o nome da família (family_name). No modelo User Products, o ML monta o título final a partir dele e dos atributos da ficha técnica."
      >
        <input
          id="ml-titulo"
          aria-label="Título"
          value={titulo}
          onChange={(evento) => alterar({ titulo: evento.target.value })}
          className={`${CLASSE_CAMPO} ${bordaDoCampo(erroDoTitulo)}`}
        />
        <div className="mt-1 flex items-start gap-3">
          {erroDoTitulo && <p className="text-[11px] text-red-700">{erroDoTitulo}</p>}
          <span className={`ml-auto shrink-0 text-[11px] tabular-nums ${tamanhoDoTitulo > LIMITE_TITULO ? "font-medium text-red-700" : "text-suave"}`}>
            {tamanhoDoTitulo}/{LIMITE_TITULO}
          </span>
        </div>
        <MarcaDaPropostaNoCampo proposta={contexto.proposta} caminho="titulo" valorAtual={rascunho.titulo} />
        <SugestaoDaProposta proposta={contexto.proposta} caminho="titulo" valorAtual={rascunho.titulo} aoUsar={(valor) => alterar({ titulo: String(valor) })} />
        <SugestaoDeTitulo rascunho={rascunho} contexto={contexto} alterar={alterar} limite={LIMITE_TITULO} />
      </SecaoDoAnuncio>

      <SecaoDoAnuncio titulo="Tipo e categoria">
        <div className="grid items-start gap-4 md:grid-cols-[auto_minmax(0,1fr)]">
          <EscolhaEntre rotulo="Tipo de anúncio" opcoes={TIPOS_DE_ANUNCIO_ML} valor={rascunho.tipoAnuncio} aoMudar={(tipoAnuncio) => alterar({ tipoAnuncio })} />
          <div>
            <Campo
              nome="ml-categoria"
              rotulo="Categoria do ML"
              ajuda="Use 'Sugerir categoria' ou digite o código (MLB seguido de números). Só categoria final aceita anúncio."
              erro={primeiro("categoria")}
              value={rascunho.categoriaId ?? ""}
              // O codigo da categoria e sempre MLB em maiusculas: "mlb1234" so daria erro na validacao.
              // Digitado a mao, o nome que veio com a sugestao deixa de valer.
              onChange={(evento) => alterar({ categoriaId: evento.target.value.toUpperCase() || null, categoriaNome: null })}
              placeholder="MLB1234"
            />
            {carregandoCategoria ? (
              <p className="mt-1 text-[11px] text-suave">Lendo a categoria no Mercado Livre...</p>
            ) : (
              categoriaLida && <p className="mt-1 text-[11px] text-suave">{categoriaLida.caminho.join(" > ")}</p>
            )}
            <MarcaDaPropostaNoCampo proposta={contexto.proposta} caminho="categoriaId" valorAtual={rascunho.categoriaId} />
            <SugestaoDaProposta proposta={contexto.proposta} caminho="categoriaId" valorAtual={rascunho.categoriaId} aoUsar={(valor) => alterar({ categoriaId: String(valor), categoriaNome: contexto.proposta?.sugestoes?.categoriaNome ?? null })} />
            <SugestaoDeCategoria rascunho={rascunho} alterar={alterar} />
          </div>
        </div>
      </SecaoDoAnuncio>

      <SecaoDoAnuncio titulo="Disponibilidade">
        <CampoPrazo valor={rascunho.prazoDisponibilidadeDias} erro={primeiro("prazoDisponibilidade")} aoMudar={(prazoDisponibilidadeDias) => alterar({ prazoDisponibilidadeDias })} />
        <MensagensDoCampo problemas={problemas} campo="prazoDisponibilidade" />
      </SecaoDoAnuncio>

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
  );
}
