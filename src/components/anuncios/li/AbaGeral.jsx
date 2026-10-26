"use client";

import Campo, { CLASSE_CAMPO } from "@/components/cadastros/Campo";
import MensagensDoCampo from "@/components/anuncios/ml/MensagensDoCampo";
import Badge from "@/components/ui/Badge";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";

/**
 * Aba Caracteristicas do anuncio da Loja Integrada (pedido do dono em 26/10/2026, com um print marcado): o produto, a marca
 * (so leitura), o destaque, o video e o liga/desliga "Ativo na loja". O "Nome na loja" saiu da tela: o nome e a marca sao
 * sempre os do cadastro do produto (`rascunhoDoAnuncio`, em `banco.js`), como a descricao, as categorias e o SEO.
 * O nome ainda decide o endereco do produto novo na loja (slug); os problemas dele aparecem na caixa do produto.
 */

/** O interruptor do Rise (o mesmo desenho do "Ativo" do usuario e do bot do Telegram). */
function Interruptor({ ligado, aoMudar, rotulo }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      onClick={() => aoMudar(!ligado)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-[background-color] duration-150 focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-offset-2 focus-visible:outline-none ${ligado ? "bg-emerald-600" : "bg-slate-300"}`}
    >
      <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150 ${ligado ? "translate-x-5" : ""}`} />
    </button>
  );
}

export default function AbaGeral({ rascunho, contexto, alterar, problemas }) {
  const produto = contexto.produto;
  const ativo = rascunho.ativo !== false;

  return (
    <div className="space-y-4">
      <div className="rounded border border-borda bg-fundo p-3">
        <p className="text-xs text-suave">Produto</p>
        {produto ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
            <span className="font-mono font-medium">{produto.sku}</span>
            <span className="min-w-0 flex-1 truncate">{produto.tituloBase}</span>
            <Badge tom={produto.conferido ? "sucesso" : "erro"}>{produto.conferido ? "Conferido" : "Não conferido"}</Badge>
          </div>
        ) : (
          <p className="mt-1 text-sm text-red-700">Produto não encontrado. Ele pode ter sido excluído.</p>
        )}
        <MensagensDoCampo problemas={problemas} campo="produto" />
        <MensagensDoCampo problemas={problemas} campo="titulo" />
        <MensagensDoCampo problemas={problemas} campo="slug" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          {/* Marca so de leitura: vem do cadastro do produto, e o Sincronizar a acha na loja ou a cria. */}
          <Campo nome="li-marca" rotulo="Marca" ajuda="A marca é a do cadastro do produto. Se a loja ainda não a tem, o Sincronizar a cria na Loja Integrada.">
            <input id="li-marca" readOnly value={rascunho.marca ?? ""} className={`${CLASSE_CAMPO} border-borda bg-fundo text-suave`} />
          </Campo>
          <MensagensDoCampo problemas={problemas} campo="marca" />
          <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={Boolean(rascunho.destaque)}
              onChange={(evento) => alterar({ destaque: evento.target.checked })}
              className="h-4 w-4 accent-acento"
            />
            Produto em destaque na loja
          </label>
        </div>
        <div>
          <Campo
            nome="li-video"
            rotulo="Vídeo (YouTube)"
            placeholder="https://www.youtube.com/watch?v=..."
            value={rascunho.videoUrl ?? ""}
            onChange={(evento) => alterar({ videoUrl: evento.target.value || null })}
          />
          <div className="mt-4 flex items-center gap-3">
            <Interruptor ligado={ativo} aoMudar={(valor) => alterar({ ativo: valor })} rotulo="Ativo na loja" />
            <span className="flex items-center gap-1 text-sm font-medium">
              Ativo na loja
              <BolhaDeAjuda
                variante="inline"
                texto="Ligado: o produto aparece para o cliente. Desligado: o Sincronizar o deixa pausado na loja. O produto novo nasce ligado e o Cadastrar só o ativa depois de ligar no Bling e gravar o estoque."
              />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
