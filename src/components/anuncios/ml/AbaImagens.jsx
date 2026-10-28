"use client";

import { useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ImageOff, Loader, Trash2, Upload } from "lucide-react";

import { enviarFotoDoKitML, excluirFotoDoKitML } from "@/app/canais-de-venda/mercado-livre/acoes-fotos-do-kit";
import Badge from "@/components/ui/Badge";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import MensagensDoCampo from "./MensagensDoCampo";
import SecaoDoAnuncio from "./SecaoDoAnuncio";

const BOTAO_DA_LINHA =
  "rounded p-1.5 text-suave hover:bg-fundo hover:text-texto disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

// As fotos que o anuncio pode usar: no kit, primeiro as PROPRIAS do kit (enviadas aqui, 27/10/2026), depois as do
// produto principal e as de cada item. A mesma ordem que o rascunho usa ao montar a lista sozinho (`fotosEmOrdem`):
// produto a produto, a foto principal de cada um na frente, e a mesma foto nunca duas vezes.
function fotosDisponiveis(rascunho, contexto) {
  const itens = Array.isArray(rascunho.composicao?.itens) ? rascunho.composicao.itens : [];
  const vistas = new Set();
  const fotos = [];
  if (rascunho.composicao) {
    const principal = contexto.produtos[rascunho.produtoId];
    for (const foto of principal?.fotosDoKit ?? []) {
      vistas.add(foto.id);
      fotos.push({ ...foto, sku: "Kit", titulo: "Foto do kit", doKit: true });
    }
  }
  for (const produtoId of [rascunho.produtoId, ...itens.map((item) => item?.produtoId)].filter(Boolean)) {
    const produto = contexto.produtos[produtoId];
    const imagens = produto?.imagens ?? [];
    for (const imagem of [...imagens.filter((i) => i.principal), ...imagens.filter((i) => !i.principal)]) {
      if (vistas.has(imagem.id)) continue;
      vistas.add(imagem.id);
      fotos.push({ ...imagem, sku: produto.sku, titulo: produto.tituloBase });
    }
  }
  return fotos;
}

/**
 * Uma foto da lista. `posicao` e o lugar dela na ordem de envio (0 = capa), ou `null` quando
 * nao esta marcada. `foto` e `undefined` quando o rascunho guarda um id que o produto nao tem mais.
 */
export function LinhaDeFoto({ id, foto, posicao, total, aoAlternar, aoMover }) {
  const marcada = posicao !== null;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 p-2.5">
      {/* O rotulo cobre a miniatura: clicar na foto tambem marca. */}
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={marcada}
          onChange={(evento) => aoAlternar(id, evento.target.checked)}
          aria-label={foto ? `Usar a foto de ${foto.sku}` : "Usar a foto"}
          className="h-4 w-4 shrink-0 accent-acento"
        />
        {foto ? (
          // URL externa vai por <img> simples (como a lista de Produtos): o next/image lanca excecao
          // quando o host nao esta em images.remotePatterns, e uma foto ruim nao pode derrubar a aba.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={foto.url}
            alt={foto.titulo}
            loading="lazy"
            className="h-14 w-14 shrink-0 rounded border border-borda bg-superficie object-contain"
          />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded border border-borda bg-fundo text-suave">
            <ImageOff size={16} aria-hidden="true" />
          </span>
        )}
        <span className="min-w-0">
          {foto ? (
            <>
              <span className="font-mono font-medium">{foto.sku}</span>
              <span className="ml-2 truncate">{foto.titulo}</span>
            </>
          ) : (
            <span className="text-red-700">Foto não encontrada: ela pode ter sido excluída. Desmarque para tirar do anúncio.</span>
          )}
        </span>
      </label>

      {marcada && (
        <div className="flex items-center gap-2">
          {posicao === 0 ? <Badge tom="info">Capa</Badge> : <span className="text-xs text-suave">Foto {posicao + 1}</span>}
          <div className="flex">
            <button type="button" onClick={() => aoMover(posicao, -1)} disabled={posicao === 0} aria-label="Subir foto" title="Subir" className={BOTAO_DA_LINHA}>
              <ChevronUp size={16} />
            </button>
            <button type="button" onClick={() => aoMover(posicao, 1)} disabled={posicao === total - 1} aria-label="Descer foto" title="Descer" className={BOTAO_DA_LINHA}>
              <ChevronDown size={16} />
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

// Anuncio simples: as fotos sao sempre as validadas do produto, mas a ORDEM se muda aqui (pedido do dono em 28/10/2026; vale
// tambem depois de publicado: o Sincronizar manda a ordem nova). "Voltar a ordem do produto" volta a acompanhar o cadastro.
function FotosDoProduto({ rascunho, disponiveis, alterar, problemas }) {
  const porId = new Map(disponiveis.map((foto) => [foto.id, foto]));
  const ids = (Array.isArray(rascunho.imagens) ? rascunho.imagens : []).filter((id) => porId.has(id));
  const fotos = [...ids, ...disponiveis.map((foto) => foto.id).filter((id) => !ids.includes(id))].map((id) => porId.get(id));
  const mover = (posicao, passo) => {
    const destino = posicao + passo;
    if (destino < 0 || destino >= fotos.length) return;
    const ordem = fotos.map((foto) => foto.id);
    [ordem[posicao], ordem[destino]] = [ordem[destino], ordem[posicao]];
    alterar({ imagens: ordem, fotosReordenadas: true });
  };
  return (
    <SecaoDoAnuncio
      titulo={`Fotos do anúncio (${fotos.length})`}
      ajuda="As fotos do anúncio são as validadas do produto (para trocar uma foto, use Editar produto). A ordem se muda aqui, com as setas: a primeira é a capa. Acima do que a categoria aceita, vão as primeiras."
      acao={
        rascunho.fotosReordenadas ? (
          <button
            type="button"
            onClick={() => alterar({ imagens: disponiveis.map((foto) => foto.id), fotosReordenadas: false })}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-acento hover:bg-superficie"
          >
            Voltar à ordem do produto
          </button>
        ) : null
      }
    >
      {fotos.length > 0 ? (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {fotos.map((foto, posicao) => (
            <li key={foto.id} className="space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={foto.url} alt={foto.titulo} loading="lazy" className="aspect-square w-full rounded border border-borda bg-superficie object-contain" />
              <div className="flex items-center justify-between gap-1">
                {posicao === 0 ? <Badge tom="info">Capa</Badge> : <span className="text-xs text-suave">Foto {posicao + 1}</span>}
                <span className="flex">
                  <button type="button" onClick={() => mover(posicao, -1)} disabled={posicao === 0} aria-label="Foto para a esquerda" title="Para a esquerda" className={BOTAO_DA_LINHA}>
                    <ChevronLeft size={14} />
                  </button>
                  <button type="button" onClick={() => mover(posicao, 1)} disabled={posicao === fotos.length - 1} aria-label="Foto para a direita" title="Para a direita" className={BOTAO_DA_LINHA}>
                    <ChevronRight size={14} />
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-suave">O produto não tem foto validada.</p>
      )}
      <MensagensDoCampo problemas={problemas} campo="imagens" />
    </SecaoDoAnuncio>
  );
}

/**
 * Aba Imagens: as fotos que o anuncio envia, na ordem de envio (a primeira e a capa), e as demais
 * fotos disponiveis para marcar. O rascunho guarda so os ids, em ordem.
 */
/**
 * As fotos PROPRIAS do kit (pedido do dono em 27/10/2026): "Enviar fotos" padroniza cada uma como no cadastro de Produto
 * (1024x1024, fundo branco) e a grava na hora no produto principal (papel KIT); a foto nova ja entra marcada no anuncio,
 * depois das outras fotos do kit (a primeira e a capa). Excluir tira do disco e do anuncio.
 */
function FotosDoKit({ rascunho, contexto, alterar, setContexto, anuncioId }) {
  const produtoId = rascunho.produtoId;
  const fotos = contexto.produtos[produtoId]?.fotosDoKit ?? [];
  const [enviando, setEnviando] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [excluindo, setExcluindo] = useState(null);
  const entrada = useRef(null);

  async function enviar(arquivos) {
    const lista = [...(arquivos ?? [])];
    if (lista.length === 0) return;
    setAviso(null);
    const erros = [];
    // As enviadas nesta leva: a segunda foto entra depois da primeira (o `fotos` deste render ainda nao as tem).
    const enviadas = [];
    let ampliadas = 0;
    for (const [indice, arquivo] of lista.entries()) {
      setEnviando({ atual: indice + 1, total: lista.length });
      const dados = new FormData();
      dados.append("arquivo", arquivo);
      let resposta;
      try {
        resposta = await enviarFotoDoKitML(produtoId, dados);
      } catch {
        resposta = { ok: false, erro: "Não foi possível falar com o servidor." };
      }
      if (!resposta.ok) {
        erros.push(`${arquivo.name}: ${resposta.erro}`);
        continue;
      }
      if (resposta.ampliada) ampliadas += 1;
      const foto = resposta.foto;
      enviadas.push(foto.id);
      setContexto((atual) => {
        const produto = atual.produtos[produtoId] ?? {};
        return { ...atual, produtos: { ...atual.produtos, [produtoId]: { ...produto, fotosDoKit: [...(produto.fotosDoKit ?? []), foto] } } };
      });
      // A foto nova entra depois das outras fotos do kit ja marcadas: as do kit vem na frente das dos itens.
      alterar((atual) => {
        const marcadas = Array.isArray(atual.imagens) ? atual.imagens : [];
        const doKit = new Set([...fotos.map((outra) => outra.id), ...enviadas]);
        const posicao = marcadas.filter((id) => doKit.has(id)).length;
        return { imagens: [...marcadas.slice(0, posicao), foto.id, ...marcadas.slice(posicao)] };
      });
    }
    setEnviando(null);
    if (entrada.current) entrada.current.value = "";
    if (erros.length > 0) setAviso({ tipo: "erro", texto: erros.join(" · ") });
    else if (ampliadas > 0) setAviso({ tipo: "atencao", texto: `${ampliadas} foto(s) pequena(s) foram ampliadas para 1024×1024: confira a nitidez.` });
  }

  async function excluir(id) {
    setAviso(null);
    setExcluindo(id);
    let resposta;
    try {
      resposta = await excluirFotoDoKitML(produtoId, id, anuncioId ?? null);
    } catch {
      resposta = { ok: false, erro: "Não foi possível falar com o servidor." };
    }
    setExcluindo(null);
    if (!resposta.ok) {
      setAviso({ tipo: "erro", texto: resposta.erro });
      return;
    }
    setContexto((atual) => {
      const produto = atual.produtos[produtoId] ?? {};
      return { ...atual, produtos: { ...atual.produtos, [produtoId]: { ...produto, fotosDoKit: (produto.fotosDoKit ?? []).filter((foto) => foto.id !== id) } } };
    });
    alterar((atual) => ({ imagens: (Array.isArray(atual.imagens) ? atual.imagens : []).filter((outra) => outra !== id) }));
  }

  return (
    <SecaoDoAnuncio
      titulo={`Fotos do kit (${fotos.length})`}
      ajuda="Fotos próprias do kit (as dos produtos mostram uma unidade de cada). Ao enviar, cada foto é ajustada como no cadastro de Produto: 1024×1024, fundo branco. A foto enviada já entra no anúncio."
      acao={
        <>
          <input
            ref={entrada}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(evento) => enviar(evento.target.files)}
          />
          <button
            type="button"
            onClick={() => entrada.current?.click()}
            disabled={Boolean(enviando)}
            className="inline-flex items-center gap-1.5 rounded border border-borda bg-superficie px-3 py-1.5 text-sm font-medium text-acento hover:bg-fundo disabled:cursor-not-allowed disabled:opacity-60"
          >
            {enviando ? <Loader size={14} className="animate-spin" /> : <Upload size={14} />}
            {enviando ? `Ajustando ${enviando.atual} de ${enviando.total}...` : "Enviar fotos"}
          </button>
        </>
      }
    >
      {fotos.length > 0 ? (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {fotos.map((foto) => (
            <li key={foto.id} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={foto.url} alt="Foto do kit" loading="lazy" className="aspect-square w-full rounded border border-borda bg-white object-contain" />
              <button
                type="button"
                onClick={() => excluir(foto.id)}
                disabled={excluindo === foto.id}
                title="Excluir esta foto do kit"
                aria-label="Excluir esta foto do kit"
                className="absolute top-1 right-1 rounded bg-superficie/90 p-1 text-red-700 shadow-sm hover:bg-red-50 disabled:opacity-60"
              >
                {excluindo === foto.id ? <Loader size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-suave">Nenhuma foto do kit ainda. Use “Enviar fotos”.</p>
      )}
      {aviso && (
        <p role={aviso.tipo === "erro" ? "alert" : "status"} className={`mt-2 text-xs ${aviso.tipo === "erro" ? "text-red-700" : "text-amber-700"}`}>
          {aviso.texto}
        </p>
      )}
    </SecaoDoAnuncio>
  );
}

export default function AbaImagens({ rascunho, contexto, alterar, setContexto, anuncioId, problemas }) {
  const emKit = Boolean(rascunho.composicao);
  const disponiveis = fotosDisponiveis(rascunho, contexto);
  // Anuncio simples: as fotos sao SEMPRE as validadas do produto, na ordem do cadastro (decisao do dono em 24/10/2026,
  // "igual a LI"). A aba so mostra; mudar e no cadastro do produto.
  if (!emKit) return <FotosDoProduto rascunho={rascunho} disponiveis={disponiveis} alterar={alterar} problemas={problemas} />;
  const porId = new Map(disponiveis.map((foto) => [foto.id, foto]));
  const marcadas = Array.isArray(rascunho.imagens) ? rascunho.imagens : [];
  const naoUsadas = disponiveis.filter((foto) => !marcadas.includes(foto.id));

  // Marcar poe a foto no fim da fila; desmarcar tira e as de baixo sobem.
  function alternar(id, marcada) {
    if (marcada) alterar({ imagens: marcadas.includes(id) ? marcadas : [...marcadas, id] });
    else alterar({ imagens: marcadas.filter((outra) => outra !== id) });
  }

  function mover(posicao, passo) {
    const destino = posicao + passo;
    if (destino < 0 || destino >= marcadas.length) return;
    const reordenadas = [...marcadas];
    [reordenadas[posicao], reordenadas[destino]] = [reordenadas[destino], reordenadas[posicao]];
    alterar({ imagens: reordenadas });
  }

  return (
    <div className="space-y-4">
      <FotosDoKit rascunho={rascunho} contexto={contexto} alterar={alterar} setContexto={setContexto} anuncioId={anuncioId} />

      <SecaoDoAnuncio titulo={`Fotos do anúncio (${marcadas.length})`} ajuda="A ordem daqui é a ordem de envio: a primeira é a capa do anúncio. Use as setas para mudar.">
        {marcadas.length > 0 ? (
          <ul className="divide-y divide-borda rounded border border-borda">
            {marcadas.map((id, posicao) => (
              <LinhaDeFoto key={id} id={id} foto={porId.get(id)} posicao={posicao} total={marcadas.length} aoAlternar={alternar} aoMover={mover} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-suave">
            {disponiveis.length > 0 ? "Nenhuma foto marcada." : "Nenhuma foto cadastrada para este anúncio."}
          </p>
        )}
        <MensagensDoCampo problemas={problemas} campo="imagens" />
      </SecaoDoAnuncio>

      {naoUsadas.length > 0 && (
        <SecaoDoAnuncio titulo="Fotos disponíveis">
          <ul className="divide-y divide-borda rounded border border-borda">
            {naoUsadas.map((foto) => (
              <LinhaDeFoto key={foto.id} id={foto.id} foto={foto} posicao={null} total={marcadas.length} aoAlternar={alternar} aoMover={mover} />
            ))}
          </ul>
        </SecaoDoAnuncio>
      )}
    </div>
  );
}
