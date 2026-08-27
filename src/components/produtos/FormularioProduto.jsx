"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  FileText,
  Hammer,
  ImageOff,
  ImagePlus,
  Loader,
  Trash2,
  Upload,
} from "lucide-react";

import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { UNIDADES } from "@/lib/unidades";
import { ORIGENS, TIPOS_ITEM } from "@/lib/fiscal";
import { LIMITE_TITULO_ML, MAXIMO_IMAGENS } from "@/lib/limites";
import EditorDescricao from "./EditorDescricao";
import Fornecedores from "./Fornecedores";
import {
  definirImagemPrincipal,
  enviarArquivo,
  excluirProduto,
  removerArquivo,
  salvarProduto,
} from "@/app/produtos/acoes";

const ABAS = [
  { id: "caracteristicas", rotulo: "Caracteristicas" },
  { id: "descricao", rotulo: "Descricao" },
  { id: "dimensoes", rotulo: "Peso e dimensoes" },
  { id: "tributacao", rotulo: "Tributacao" },
  { id: "fornecedores", rotulo: "Fornecedores" },
];

/**
 * Executa uma acao de servidor e devolve o erro em vez de deixa-lo escapar.
 *
 * Sem isso, uma falha dentro de uma transicao vira excecao nao tratada e a
 * pagina inteira cai — foi o que acontecia quando o arquivo estourava o limite
 * de corpo da requisicao: o usuario perdia a tela em vez de ler o motivo.
 */
async function tentar(acao) {
  try {
    return await acao();
  } catch (erro) {
    return {
      ok: false,
      erro:
        erro?.message?.includes("Body exceeded") || erro?.name === "TypeError"
          ? "Falha ao enviar o arquivo. Ele pode ser grande demais para a conexao."
          : (erro?.message ?? "Falha inesperada ao executar a acao."),
    };
  }
}

const CLASSE_CAMPO =
  "mt-1 w-full rounded border px-2.5 py-2 text-[15px] font-medium focus:outline-none";

function Campo({ nome, rotulo, erro, ajuda, children, ...props }) {
  return (
    <div>
      <label htmlFor={nome} className="block text-sm font-semibold">
        {rotulo}
      </label>
      {children ?? (
        <input
          id={nome}
          name={nome}
          className={`${CLASSE_CAMPO} ${
            erro ? "border-red-400" : "border-borda focus:border-acento"
          }`}
          {...props}
        />
      )}
      {ajuda && !erro && <p className="mt-1 text-[11px] text-suave">{ajuda}</p>}
      {erro && <p className="mt-1 text-[11px] text-red-700">{erro}</p>}
    </div>
  );
}

function Selecao({ nome, rotulo, opcoes, inicial, ajuda }) {
  return (
    <Campo nome={nome} rotulo={rotulo} ajuda={ajuda}>
      <select
        id={nome}
        name={nome}
        defaultValue={inicial ?? ""}
        className={`${CLASSE_CAMPO} border-borda focus:border-acento`}
      >
        <option value="">Selecione</option>
        {opcoes.map((opcao) => (
          <option key={opcao.valor} value={opcao.valor}>
            {opcao.rotulo}
          </option>
        ))}
      </select>
    </Campo>
  );
}

/** Interruptor de situacao, no lugar da caixa de selecao. */
function Interruptor({ nome, inicial }) {
  const [ligado, setLigado] = useState(inicial ?? true);

  return (
    <div>
      <span className="block text-sm font-semibold">Situacao</span>
      <input type="hidden" name={nome} value={ligado ? "on" : ""} />
      <button
        type="button"
        onClick={() => setLigado((atual) => !atual)}
        role="switch"
        aria-checked={ligado}
        className="mt-2 inline-flex items-center gap-2"
      >
        <span
          className={`relative h-5 w-9 rounded-full transition ${
            ligado ? "bg-emerald-500" : "bg-slate-300"
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
              ligado ? "left-4.5" : "left-0.5"
            }`}
          />
        </span>
        <span
          className={`text-[15px] font-medium ${
            ligado ? "text-emerald-700" : "text-suave"
          }`}
        >
          {ligado ? "Ativado" : "Desativado"}
        </span>
      </button>
    </div>
  );
}

function CampoNome({ inicial, erro }) {
  const [tamanho, setTamanho] = useState((inicial ?? "").length);
  const excedeu = tamanho > LIMITE_TITULO_ML;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor="tituloBase" className="block text-sm font-semibold">
          Nome *
        </label>
        <span
          className={`text-[11px] tabular-nums ${
            excedeu ? "font-medium text-amber-700" : "text-suave"
          }`}
        >
          {tamanho}
          {excedeu && ` · acima dos ${LIMITE_TITULO_ML} do Mercado Livre`}
        </span>
      </div>
      <input
        id="tituloBase"
        name="tituloBase"
        defaultValue={inicial ?? ""}
        onChange={(evento) => setTamanho(evento.target.value.length)}
        className={`${CLASSE_CAMPO} ${
          excedeu ? "border-amber-400" : "border-borda focus:border-acento"
        }`}
      />
      {erro && <p className="mt-1 text-[11px] text-red-700">{erro}</p>}
    </div>
  );
}

/** Link da Loja Integrada, com botao que abre a pagina quando preenchido. */
function LinkLojaIntegrada({ inicial, dominio, erro }) {
  const [valor, setValor] = useState(inicial ?? "");

  const valido = /^https?:\/\//i.test(valor);
  const outroDominio =
    valido && dominio && !valor.toLowerCase().includes(dominio.toLowerCase());

  return (
    <div>
      <label htmlFor="urlLojaIntegrada" className="block text-sm font-semibold">
        Link na Loja Integrada
      </label>
      <div className="mt-1 flex items-center gap-1.5">
        <input
          id="urlLojaIntegrada"
          name="urlLojaIntegrada"
          value={valor}
          onChange={(evento) => setValor(evento.target.value)}
          placeholder="https://..."
          className={`w-full rounded border px-2.5 py-2 text-[15px] font-medium focus:outline-none ${
            erro ? "border-red-400" : "border-borda focus:border-acento"
          }`}
        />
        {valido && (
          <a
            href={valor}
            target="_blank"
            rel="noreferrer"
            title="Abrir na loja"
            className="shrink-0 rounded border border-borda p-2 text-acento hover:bg-fundo"
          >
            <ExternalLink size={16} />
          </a>
        )}
      </div>
      {outroDominio && (
        <p className="mt-1 text-[11px] text-amber-700">
          Este link nao aponta para {dominio}. Confira se e o endereco certo.
        </p>
      )}
      {erro && <p className="mt-1 text-[11px] text-red-700">{erro}</p>}
    </div>
  );
}

/**
 * Imagem grande com miniaturas abaixo.
 *
 * Clicar numa miniatura troca a imagem grande em ESTADO DE CLIENTE — instantaneo
 * — e persiste a escolha em segundo plano. Antes, o clique ia ao servidor,
 * reordenava tudo e revalidava a rota: as miniaturas dancavam e cada clique
 * levava de 500ms a 3s.
 */
function Imagens({ produtoId, imagens, aoFalhar }) {
  const [pendente, iniciarTransicao] = useTransition();
  const [erro, setErro] = useState(null);
  const entrada = useRef(null);

  const inicial = imagens.find((imagem) => imagem.principal) ?? imagens[0] ?? null;
  const [selecionada, setSelecionada] = useState(inicial?.id ?? null);

  const emFoco =
    imagens.find((imagem) => imagem.id === selecionada) ?? inicial ?? null;
  const cheio = imagens.length >= MAXIMO_IMAGENS;

  function escolher(imagem) {
    setSelecionada(imagem.id); // troca visual imediata
    iniciarTransicao(async () => {
      const r = await tentar(() => definirImagemPrincipal(imagem.id));
      if (!r.ok) aoFalhar?.(r.erro);
    });
  }

  function aoEscolherArquivo(evento) {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;

    const dados = new FormData();
    dados.set("arquivo", arquivo);

    iniciarTransicao(async () => {
      const resultado = await tentar(() =>
        enviarArquivo(produtoId, "IMAGEM", null, dados),
      );
      setErro(resultado.ok ? null : resultado.erro);
      if (entrada.current) entrada.current.value = "";
    });
  }

  return (
    <div>
      <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded border border-borda bg-superficie">
        {emFoco ? (
          <Image
            src={emFoco.url}
            alt=""
            fill
            sizes="(max-width: 1024px) 100vw, 320px"
            className="object-contain p-2"
          />
        ) : (
          <span className="flex flex-col items-center gap-1 text-suave">
            <ImageOff size={28} />
            <span className="text-xs">Sem imagem</span>
          </span>
        )}
      </div>

      {/* Ordem fixa: a selecionada ganha borda, nunca muda de lugar. */}
      <div className="mt-2 flex flex-wrap gap-2">
        {imagens.map((imagem) => (
          <div key={imagem.id} className="group relative">
            <button
              type="button"
              onClick={() => escolher(imagem)}
              title={
                imagem.id === emFoco?.id
                  ? "Imagem principal"
                  : "Usar como imagem principal"
              }
              className={`relative block h-14 w-14 overflow-hidden rounded border-2 bg-superficie ${
                imagem.id === emFoco?.id
                  ? "border-acento"
                  : "border-borda hover:border-acento/50"
              }`}
            >
              <Image
                src={imagem.url}
                alt=""
                fill
                sizes="56px"
                className="object-contain p-0.5"
              />
            </button>
            <button
              type="button"
              onClick={() =>
                iniciarTransicao(async () => {
                  const r = await tentar(() => removerArquivo(imagem.id));
                  if (!r.ok) setErro(r.erro);
                })
              }
              aria-label="Remover imagem"
              className="absolute -top-1.5 -right-1.5 rounded-full bg-red-600 p-0.5 text-white opacity-0 transition group-hover:opacity-100"
            >
              <Trash2 size={10} />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => entrada.current?.click()}
          disabled={pendente || cheio}
          title={cheio ? `Limite de ${MAXIMO_IMAGENS} imagens` : "Adicionar imagem"}
          className="flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded border border-dashed border-borda text-suave hover:border-acento hover:text-acento disabled:opacity-40"
        >
          {pendente ? (
            <Loader size={15} className="animate-spin" />
          ) : (
            <>
              <ImagePlus size={15} />
              <span className="text-[9px]">
                {imagens.length}/{MAXIMO_IMAGENS}
              </span>
            </>
          )}
        </button>
      </div>

      <input
        ref={entrada}
        type="file"
        accept="image/jpeg,image/png"
        onChange={aoEscolherArquivo}
        className="hidden"
      />

      {erro && (
        <p className="mt-2 rounded bg-red-50 p-2 text-[11px] text-red-800">{erro}</p>
      )}
    </div>
  );
}

/** Envio de documento (manual, ficha tecnica, certificado). */
function Documento({ produtoId, tipo, rotulo, ajuda, arquivos }) {
  const [pendente, iniciarTransicao] = useTransition();
  const [erro, setErro] = useState(null);
  const entrada = useRef(null);

  function aoEscolher(evento) {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;

    const dados = new FormData();
    dados.set("arquivo", arquivo);

    iniciarTransicao(async () => {
      const resultado = await tentar(() =>
        enviarArquivo(produtoId, tipo, null, dados),
      );
      setErro(resultado.ok ? null : resultado.erro);
      if (entrada.current) entrada.current.value = "";
    });
  }

  return (
    <div>
      <span className="block text-sm font-semibold">{rotulo}</span>

      <div className="mt-1 space-y-1">
        {arquivos.map((arquivo) => (
          <div
            key={arquivo.id}
            className="flex items-center gap-2 rounded border border-borda px-2 py-1.5"
          >
            <FileText size={14} className="shrink-0 text-suave" />
            <a
              href={arquivo.url}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate text-sm hover:text-acento"
            >
              {arquivo.nomeOriginal ?? arquivo.arquivo}
            </a>
            <button
              type="button"
              onClick={() =>
                iniciarTransicao(async () => {
                  const r = await tentar(() => removerArquivo(arquivo.id));
                  if (!r.ok) setErro(r.erro);
                })
              }
              aria-label="Remover"
              className="shrink-0 rounded p-1 text-suave hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => entrada.current?.click()}
        disabled={pendente}
        className="mt-1.5 inline-flex items-center gap-1.5 rounded border border-borda px-2.5 py-1.5 text-xs hover:bg-fundo disabled:opacity-50"
      >
        {pendente ? (
          <Loader size={12} className="animate-spin" />
        ) : (
          <Upload size={12} />
        )}
        Enviar arquivo
      </button>

      <input
        ref={entrada}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        onChange={aoEscolher}
        className="hidden"
      />

      {ajuda && !erro && <p className="mt-1 text-[11px] text-suave">{ajuda}</p>}
      {erro && (
        <p className="mt-1 rounded bg-red-50 p-2 text-[11px] text-red-800">{erro}</p>
      )}
    </div>
  );
}

export default function FormularioProduto({
  produto,
  arquivos = {},
  fornecedores = [],
  catalogoFornecedores = [],
  dominioLojaIntegrada = "",
}) {
  const router = useRouter();
  const [aba, setAba] = useState("caracteristicas");
  const [alterado, setAlterado] = useState(false);
  const [erroAcao, setErroAcao] = useState(null);
  const [pendenteExcluir, iniciarExcluir] = useTransition();

  // O resultado e tratado dentro da propria acao, e nao num efeito: reagir a
  // mudanca de estado com setState dentro de useEffect provoca renderizacoes em
  // cascata (e a regra do React 19 barra).
  const [estado, acao, enviando] = useActionState(async (anterior, formData) => {
    const resultado = await salvarProduto(produto?.id ?? null, anterior, formData);

    if (resultado.ok) {
      setAlterado(false);

      // Produto existente volta para a lista. Produto novo FICA na tela: e so
      // depois de existir que imagens, documentos e fornecedores ficam
      // liberados — devolver a lista obrigaria a procura-lo de novo.
      if (produto) router.push("/produtos");
      else if (resultado.id) router.replace(`/produtos/${resultado.id}`);
    }

    return resultado;
  }, null);

  const erros = estado?.erros ?? {};
  const v = (campo) => produto?.[campo] ?? "";
  const novo = !produto;

  function cancelar() {
    if (
      alterado &&
      !confirm(
        "Descartar as alteracoes deste formulario?\n\n" +
          "Imagens, documentos e fornecedores ja enviados NAO sao desfeitos — " +
          "eles sao gravados no momento do envio.",
      )
    ) {
      return;
    }
    router.push("/produtos");
  }

  function aoExcluir() {
    if (!confirm("Excluir este produto? Os arquivos enviados tambem serao apagados.")) {
      return;
    }

    iniciarExcluir(async () => {
      const resultado = await tentar(() => excluirProduto(produto.id));
      if (resultado.ok) router.push("/produtos");
      else setErroAcao(resultado.erro);
    });
  }

  return (
    <form action={acao} onChange={() => setAlterado(true)} className="space-y-4">
      {/* ---------- Acoes no topo ---------- */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={enviando}
          className="inline-flex items-center gap-1.5 rounded bg-acento px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {enviando && <Loader size={14} className="animate-spin" />}
          Salvar
        </button>
        <button
          type="button"
          onClick={cancelar}
          className="rounded border border-borda px-4 py-2 text-sm hover:bg-fundo"
        >
          Cancelar
        </button>

        {estado?.ok && (
          <span className="text-sm text-emerald-700">Produto salvo.</span>
        )}
        {estado?.erro && (
          <span className="text-sm text-red-700">{estado.erro}</span>
        )}
      </div>

      {erroAcao && (
        <p className="rounded bg-red-50 p-3 text-sm text-red-800">{erroAcao}</p>
      )}

      {/* ---------- Visao geral ---------- */}
      <Card>
        <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
          <div className="lg:col-span-2">
            {/* Metade da coluna de campos: alinha o fim do Nome com o fim do SKU */}
            <div className="lg:w-[calc(18rem+1.25rem+((100%-18rem-1.25rem)/2))]">
              <CampoNome inicial={v("tituloBase")} erro={erros.tituloBase} />
            </div>
          </div>

          <div>
            {novo ? (
              <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded border border-dashed border-borda text-suave">
                <ImageOff size={26} />
                <span className="px-4 text-center text-xs">
                  Salve o produto para enviar imagens
                </span>
              </div>
            ) : (
              <Imagens
                produtoId={produto.id}
                imagens={arquivos.IMAGEM ?? []}
                aoFalhar={setErroAcao}
              />
            )}
          </div>

          <div className="grid content-start gap-4 sm:grid-cols-2">
            <Campo
              nome="sku"
              rotulo="Codigo (SKU) *"
              defaultValue={v("sku")}
              erro={erros.sku}
              ajuda="Letras, numeros, ponto, hifen e sublinhado. E o nome da pasta de arquivos."
            />
            <Campo
              nome="localizacao"
              rotulo="Localizacao"
              defaultValue={v("localizacao")}
              ajuda="Ex.: R14"
            />

            <Campo
              nome="precoVenda"
              rotulo="Preco venda"
              type="number"
              step="0.01"
              min="0"
              defaultValue={v("precoVenda")}
              erro={erros.precoVenda}
            />
            <Campo nome="unidade" rotulo="Unidade">
              <select
                id="unidade"
                name="unidade"
                defaultValue={produto?.unidade ?? "UN"}
                className={`${CLASSE_CAMPO} border-borda focus:border-acento`}
              >
                {UNIDADES.map((unidade) => (
                  <option key={unidade} value={unidade}>
                    {unidade}
                  </option>
                ))}
              </select>
            </Campo>

            <Interruptor nome="ativo" inicial={produto?.ativo ?? true} />
            <LinkLojaIntegrada
              inicial={v("urlLojaIntegrada")}
              dominio={dominioLojaIntegrada}
              erro={erros.urlLojaIntegrada}
            />
          </div>
        </div>
      </Card>

      {/* ---------- Abas ---------- */}
      <Card className="p-0">
        <div className="flex overflow-x-auto border-b border-borda">
          {ABAS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setAba(item.id)}
              className={`shrink-0 border-b-2 px-4 py-3 text-sm whitespace-nowrap ${
                aba === item.id
                  ? "border-acento font-medium text-texto"
                  : "border-transparent text-suave hover:text-texto"
              }`}
            >
              {item.rotulo}
            </button>
          ))}
        </div>

        {/* Todas as abas ficam montadas e apenas escondidas: campo desmontado
            nao entra no FormData, e salvar de uma aba invalidaria as outras. */}
        <div className="p-5">
          <div className={aba === "caracteristicas" ? "space-y-5" : "hidden"}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo nome="marca" rotulo="Marca" defaultValue={v("marca")} />
              <Campo nome="modelo" rotulo="Modelo" defaultValue={v("modelo")} />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {novo ? (
                <p className="rounded border border-borda bg-fundo p-3 text-sm text-suave sm:col-span-2">
                  Salve o produto para enviar manual e ficha tecnica.
                </p>
              ) : (
                <>
                  <Documento
                    produtoId={produto.id}
                    tipo="MANUAL"
                    rotulo="Manual do produto"
                    ajuda="PDF, JPG ou PNG, ate 20 MB."
                    arquivos={arquivos.MANUAL ?? []}
                  />
                  <Documento
                    produtoId={produto.id}
                    tipo="FICHA_TECNICA"
                    rotulo="Ficha tecnica"
                    arquivos={arquivos.FICHA_TECNICA ?? []}
                  />
                </>
              )}
              <Campo
                nome="garantiaMeses"
                rotulo="Garantia (meses)"
                type="number"
                step="1"
                min="0"
                defaultValue={v("garantiaMeses")}
              />
            </div>

            <Campo
              nome="videoUrl"
              rotulo="Video (link do YouTube)"
              defaultValue={v("videoUrl")}
              placeholder="https://www.youtube.com/watch?v=..."
            />

            <div className="grid gap-4 border-t border-borda pt-5 sm:grid-cols-3">
              <Campo
                nome="numeroHomologacao"
                rotulo="Numero de homologacao"
                defaultValue={v("numeroHomologacao")}
                ajuda="Anatel/INMETRO. O Mercado Livre pede o numero em varias categorias."
              />
              {!novo && (
                <Documento
                  produtoId={produto.id}
                  tipo="CERTIFICADO"
                  rotulo="Certificado de homologacao"
                  arquivos={arquivos.CERTIFICADO ?? []}
                />
              )}
              <Campo nome="ean" rotulo="GTIN / EAN" defaultValue={v("ean")} />
            </div>
          </div>

          <div className={aba === "descricao" ? "" : "hidden"}>
            <EditorDescricao nome="descricaoBase" valorInicial={v("descricaoBase")} />
          </div>

          <div className={aba === "dimensoes" ? "" : "hidden"}>
            <div className="grid gap-4 sm:grid-cols-4">
              <Campo
                nome="pesoKg"
                rotulo="Peso (kg)"
                type="number"
                step="0.001"
                min="0"
                defaultValue={v("pesoKg")}
              />
              <Campo
                nome="alturaCm"
                rotulo="Altura (cm)"
                type="number"
                step="0.01"
                min="0"
                defaultValue={v("alturaCm")}
              />
              <Campo
                nome="larguraCm"
                rotulo="Largura (cm)"
                type="number"
                step="0.01"
                min="0"
                defaultValue={v("larguraCm")}
              />
              <Campo
                nome="comprimentoCm"
                rotulo="Comprimento (cm)"
                type="number"
                step="0.01"
                min="0"
                defaultValue={v("comprimentoCm")}
              />
            </div>
          </div>

          <div className={aba === "tributacao" ? "space-y-4" : "hidden"}>
            <p className="rounded border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
              <strong>Dados da nota fiscal.</strong> Quem emite a nota e o Bling —
              aqui ficam so os campos que identificam o produto e viajam com ele.
              Os valores calculados de imposto continuam no Bling, que tem as
              regras tributarias.
            </p>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <Selecao
                  nome="origem"
                  rotulo="Origem"
                  opcoes={ORIGENS}
                  inicial={produto?.origem}
                />
              </div>
              <Campo
                nome="ncm"
                rotulo="NCM"
                defaultValue={v("ncm")}
                placeholder="0000.00.00"
                ajuda="Obrigatorio para emitir nota."
              />
              <Campo
                nome="cest"
                rotulo="CEST"
                defaultValue={v("cest")}
                placeholder="00.000.00"
                ajuda="So para produtos sujeitos a substituicao tributaria."
              />
              <Campo
                nome="percentualTributos"
                rotulo="% Tributos"
                type="number"
                step="0.01"
                min="0"
                defaultValue={v("percentualTributos")}
                ajuda="Lei da Transparencia."
              />
              <div className="sm:col-span-3">
                <Selecao
                  nome="spedTipoItem"
                  rotulo="Tipo do item"
                  opcoes={TIPOS_ITEM}
                  inicial={produto?.spedTipoItem}
                  ajuda="Usado na geracao do SPED PIS/COFINS."
                />
              </div>
            </div>
          </div>

          <div className={aba === "fornecedores" ? "space-y-5" : "hidden"}>
            <div className="grid gap-4 sm:grid-cols-4">
              <Campo
                nome="estoqueMinimo"
                rotulo="Estoque minimo"
                type="number"
                step="1"
                min="0"
                defaultValue={v("estoqueMinimo")}
                ajuda="Quanto voce quer ter em estoque, no minimo."
              />
              <Campo
                nome="estoqueMaximo"
                rotulo="Estoque maximo"
                type="number"
                step="1"
                min="0"
                defaultValue={v("estoqueMaximo")}
              />
            </div>

            {novo ? (
              <p className="rounded border border-borda bg-fundo p-3 text-sm text-suave">
                Salve o produto para cadastrar fornecedores.
              </p>
            ) : (
              <Fornecedores
                produtoId={produto.id}
                vinculos={fornecedores}
                catalogo={catalogoFornecedores}
                aoFalhar={setErroAcao}
              />
            )}
          </div>
        </div>
      </Card>

      {/* ---------- Excluir fica no rodape, longe do Salvar ---------- */}
      {produto && (
        <div className="border-t border-borda pt-4">
          <button
            type="button"
            onClick={aoExcluir}
            disabled={pendenteExcluir}
            className="rounded border border-borda px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Excluir produto
          </button>
        </div>
      )}
    </form>
  );
}
