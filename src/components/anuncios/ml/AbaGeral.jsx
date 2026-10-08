"use client";

import { useId } from "react";

import Campo, { CLASSE_CAMPO, bordaDoCampo } from "@/components/cadastros/Campo";
import Badge from "@/components/ui/Badge";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { aplicarComposicao } from "@/lib/canaisDeVenda/ml/rascunho";
import { TIPOS_DE_ANUNCIO_ML } from "@/lib/canaisDeVenda/ml/rotulos";
import { limiteDoTitulo } from "@/lib/canaisDeVenda/ml/validacao";
import BlocoComposicao from "./BlocoComposicao";
import MensagensDoCampo, { problemasDoCampo } from "./MensagensDoCampo";
import SugestaoDeCategoria from "./SugestaoDeCategoria";
import SugestaoDeTitulo from "./SugestaoDeTitulo";

const CONDICOES = [
  { valor: "new", rotulo: "Novo" },
  { valor: "used", rotulo: "Usado" },
];

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

function ProdutoPrincipal({ produto, problemas }) {
  const blingId = String(produto?.blingId ?? "").trim();
  return (
    <div className="rounded border border-borda bg-fundo p-3">
      <p className="text-xs text-suave">Produto principal</p>
      {produto ? (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
          <span className="font-mono font-medium">{produto.sku}</span>
          <span className="min-w-0 flex-1 truncate">{produto.tituloBase}</span>
          <Badge tom={produto.conferido === true ? "sucesso" : "erro"}>
            {produto.conferido === true ? "Conferido" : "Não conferido"}
          </Badge>
          <span className={`text-xs ${blingId ? "text-suave" : "font-medium text-amber-700"}`}>
            {blingId ? `Bling ${blingId}` : "sem blingId"}
          </span>
        </div>
      ) : (
        <p className="mt-1 text-sm text-red-700">Produto não encontrado. Ele pode ter sido excluído.</p>
      )}
      <MensagensDoCampo problemas={problemas} campo={["produto", "blingId"]} />
    </div>
  );
}

/**
 * Aba Geral do editor: o produto principal, a caixa da composicao (kit) e os campos que
 * identificam o anuncio. Cada problema da aba aparece embaixo do campo a que se refere.
 */
export default function AbaGeral({ rascunho, contexto, alterar, setContexto, problemas, anuncioId, carregandoCategoria }) {
  const produto = contexto.produtos[rascunho.produtoId];
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
      <ProdutoPrincipal produto={produto} problemas={problemas} />

      <div>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={emKit}
              onChange={(evento) => alternarComposicao(evento.target.checked)}
              className="h-4 w-4 accent-acento"
            />
            Anúncio de composição (kit)
          </label>
          <BolhaDeAjuda
            variante="inline"
            texto="Vende várias unidades, ou produtos diferentes, num anúncio só. Desligar devolve a descrição, o estoque, as fotos e as medidas do produto principal."
          />
        </div>
        {emKit && (
          <div className="mt-3">
            <BlocoComposicao
              rascunho={rascunho}
              contexto={contexto}
              alterar={alterar}
              setContexto={setContexto}
              problemas={problemas}
              anuncioId={anuncioId}
            />
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <Campo
            nome="ml-titulo"
            rotulo="Título"
            ajuda="Vai ao Mercado Livre como o nome da família (family_name). No modelo User Products, o ML monta o título final a partir dele e dos atributos da ficha técnica."
          >
            <input
              id="ml-titulo"
              value={titulo}
              onChange={(evento) => alterar({ titulo: evento.target.value })}
              className={`${CLASSE_CAMPO} ${bordaDoCampo(erroDoTitulo)}`}
            />
            <div className="mt-1 flex items-start gap-3">
              {erroDoTitulo && <p className="text-[11px] text-red-700">{erroDoTitulo}</p>}
              <span
                className={`ml-auto shrink-0 text-[11px] tabular-nums ${
                  tamanhoDoTitulo > LIMITE_TITULO ? "font-medium text-red-700" : "text-suave"
                }`}
              >
                {tamanhoDoTitulo}/{LIMITE_TITULO}
              </span>
            </div>
          </Campo>
          <SugestaoDeTitulo rascunho={rascunho} contexto={contexto} alterar={alterar} limite={LIMITE_TITULO} />
        </div>

        <EscolhaEntre
          rotulo="Tipo de anúncio"
          opcoes={TIPOS_DE_ANUNCIO_ML}
          valor={rascunho.tipoAnuncio}
          aoMudar={(tipoAnuncio) => alterar({ tipoAnuncio })}
        />
        <EscolhaEntre
          rotulo="Condição"
          opcoes={CONDICOES}
          valor={rascunho.condicao}
          aoMudar={(condicao) => alterar({ condicao })}
        />

        <div className="md:col-span-2">
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
          <SugestaoDeCategoria rascunho={rascunho} alterar={alterar} />
        </div>
      </div>
    </div>
  );
}
