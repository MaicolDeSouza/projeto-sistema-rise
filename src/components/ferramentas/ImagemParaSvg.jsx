"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Copy, Download, Upload } from "lucide-react";

import { converterImagemAcao } from "@/app/ferramentas/acoes";
import Card from "@/components/ui/Card";
import LogoSvg from "@/components/ui/LogoSvg";
import { TETO_BYTES_SVG, TETO_MB_SVG } from "@/lib/ferramentas/presetsSvg";

const TIPOS_ACEITOS = ["image/png", "image/jpeg", "image/webp"];

const numero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const emKb = (bytes) => `${numero.format(bytes / 1024)} KB`;

/**
 * Executa a acao de servidor e devolve o erro em vez de deixa-lo escapar. Sem
 * isso, um arquivo que estoura o limite de corpo da requisicao vira excecao
 * nao tratada dentro da transicao e a pagina inteira cai (mesmo padrao do
 * FormularioProduto).
 */
async function tentar(acao) {
  try {
    return await acao();
  } catch (erro) {
    return {
      ok: false,
      erro:
        erro?.message?.includes("Body exceeded") || erro?.name === "TypeError"
          ? "Falha ao enviar o arquivo. Ele pode ser grande demais para a conexão."
          : (erro?.message ?? "Falha inesperada ao converter."),
    };
  }
}

/** Nome do download: o do arquivo enviado, sem extensao e sem caracteres estranhos. */
function nomeDoSvg(nomeOriginal) {
  const base = String(nomeOriginal ?? "")
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "imagem"}.svg`;
}

/** Fundo xadrez: sem ele, imagem transparente parece ter fundo branco. */
const XADREZ =
  "bg-[conic-gradient(#e5e7eb_25%,#ffffff_0_50%,#e5e7eb_0_75%,#ffffff_0)] bg-[length:16px_16px]";

/**
 * Conversor de imagem para SVG (Ferramentas), para LOGOS: o SVG sai com fundo
 * transparente e as cores exatas da imagem, sem nenhum ajuste na tela — o dono
 * decidiu em 20/09/2026 que nao precisa dos campos de tipo, cores fixas, limite
 * de cores nem transparencia. Por isso a conversao comeca ao escolher o arquivo.
 *
 * Nada e gravado: o arquivo vai ao servidor, volta o SVG, e os dois so existem
 * nesta tela. As previas usam `<img src="blob:...">` e NUNCA
 * `dangerouslySetInnerHTML`: <img> nao executa script de SVG, e o projeto evita
 * servir SVG de terceiro do proprio dominio.
 */
export default function ImagemParaSvg() {
  const [arquivo, setArquivo] = useState(null);
  const [urlOriginal, setUrlOriginal] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [aparencia, setAparencia] = useState("original");
  const [erro, setErro] = useState(null);
  const [arrastando, setArrastando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [pendente, iniciarTransicao] = useTransition();

  const entrada = useRef(null);
  // Enderecos blob: criados por esta tela. Ficam num objeto mutavel para poder
  // revoga-los ao trocar de arquivo e ao sair da pagina (senao vazam memoria).
  const urls = useRef({ original: null, svg: null });

  useEffect(() => {
    const guardadas = urls.current;
    return () => {
      if (guardadas.original) URL.revokeObjectURL(guardadas.original);
      if (guardadas.svg) URL.revokeObjectURL(guardadas.svg);
    };
  }, []);

  /** Guarda o endereco novo, revoga o anterior e devolve o novo. */
  function trocarUrl(chave, nova) {
    if (urls.current[chave]) URL.revokeObjectURL(urls.current[chave]);
    urls.current[chave] = nova;
    return nova;
  }

  function limparResultado() {
    setResultado(null);
    setErro(null);
    setCopiado(false);
    setAparencia("original");
    trocarUrl("svg", null);
  }

  function converter(alvo) {
    const dados = new FormData();
    dados.append("arquivo", alvo);

    iniciarTransicao(async () => {
      const resposta = await tentar(() => converterImagemAcao(dados));
      if (!resposta.ok) {
        setErro(resposta.erro);
        return;
      }
      const url = URL.createObjectURL(new Blob([resposta.svg], { type: "image/svg+xml" }));
      setResultado({ ...resposta, urlSvg: trocarUrl("svg", url) });
    });
  }

  function escolher(novo) {
    limparResultado();
    if (!novo) return;

    if (novo.size > TETO_BYTES_SVG) {
      setErro(`O arquivo tem ${numero.format(novo.size / 1024 / 1024)} MB e o limite é ${TETO_MB_SVG} MB.`);
      return;
    }
    // So um aviso antecipado: quem decide de verdade e o servidor, pelos bytes.
    if (novo.type && !TIPOS_ACEITOS.includes(novo.type)) {
      setErro("Formato não aceito. Envie uma imagem PNG, JPG ou WebP.");
      return;
    }
    setArquivo(novo);
    setUrlOriginal(trocarUrl("original", URL.createObjectURL(novo)));
    converter(novo);
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(resultado.svg);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro("Não foi possível copiar o código. Baixe o arquivo.");
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[20rem_1fr]">
      {/* ---------- Envio ---------- */}
      <Card className="space-y-3 self-start">
        <div
          role="button"
          tabIndex={0}
          onClick={() => entrada.current?.click()}
          onKeyDown={(evento) => {
            if (evento.key === "Enter" || evento.key === " ") {
              evento.preventDefault();
              entrada.current?.click();
            }
          }}
          onDragOver={(evento) => {
            evento.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(evento) => {
            evento.preventDefault();
            setArrastando(false);
            escolher(evento.dataTransfer.files?.[0]);
          }}
          className={`cursor-pointer rounded-lg border-2 border-dashed px-4 py-8 text-center transition ${
            arrastando ? "border-acento bg-fundo" : "border-borda hover:border-acento hover:bg-fundo"
          }`}
        >
          <Upload size={22} className="mx-auto mb-2 text-suave" />
          {arquivo ? (
            <>
              <p className="truncate text-sm font-medium">{arquivo.name}</p>
              <p className="mt-0.5 text-xs text-suave">{emKb(arquivo.size)} · clique para trocar</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">Escolher imagem</p>
              <p className="mt-0.5 text-xs text-suave">ou arraste aqui · PNG, JPG ou WebP, até {TETO_MB_SVG} MB</p>
            </>
          )}
          <input
            ref={entrada}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(evento) => {
              escolher(evento.target.files?.[0]);
              // Sem zerar, escolher o MESMO arquivo de novo nao dispara o onChange.
              evento.target.value = "";
            }}
          />
        </div>

        <p className="text-xs text-suave">
          A conversão começa ao escolher a imagem. O fundo vira transparente e as cores saem exatas.
        </p>

        {erro && (
          <p role="alert" className="text-sm text-red-700">
            {erro}
          </p>
        )}
      </Card>

      {/* ---------- Resultado ---------- */}
      <div className="min-w-0 space-y-4">
        {arquivo && (
          <div className="grid gap-4 md:grid-cols-2">
            <Painel titulo="Imagem enviada" rodape={emKb(arquivo.size)}>
              {/* <img> de blob: proprio: next/image nao serve para endereco local. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urlOriginal} alt="Imagem enviada" className="max-h-80 w-auto max-w-full object-contain" />
            </Painel>

            <Painel
              titulo="SVG"
              rodape={resultado ? emKb(resultado.bytesSvg) : pendente ? "convertendo..." : "sem resultado"}
              acao={
                resultado && (
                  <div role="group" aria-label="Aparência do logo" className="flex overflow-hidden rounded border border-borda text-[11px]">
                    {[
                      ["original", "Cores originais"],
                      ["fosco", "Fosco"],
                    ].map(([valor, rotulo]) => (
                      <button
                        key={valor}
                        type="button"
                        aria-pressed={aparencia === valor}
                        onClick={() => setAparencia(valor)}
                        className={`px-2 py-1 font-medium normal-case tracking-normal transition ${
                          aparencia === valor ? "bg-acento text-white" : "bg-superficie text-suave hover:bg-fundo"
                        }`}
                      >
                        {rotulo}
                      </button>
                    ))}
                  </div>
                )
              }
            >
              {resultado ? (
                <LogoSvg
                  src={resultado.urlSvg}
                  alt="SVG gerado"
                  estado={aparencia}
                  className="max-h-80 w-auto max-w-full object-contain"
                />
              ) : (
                <p className="px-4 py-16 text-sm text-suave">
                  {pendente ? "Convertendo..." : "O resultado aparece aqui."}
                </p>
              )}
            </Painel>
          </div>
        )}

        {resultado && (
          <Card className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={resultado.urlSvg}
                download={nomeDoSvg(arquivo.name)}
                className="inline-flex items-center gap-1.5 rounded bg-acento px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                <Download size={15} />
                Baixar SVG
              </a>
              <button
                type="button"
                onClick={copiar}
                className="inline-flex items-center gap-1.5 rounded border border-borda px-4 py-2 text-sm hover:bg-fundo"
              >
                {copiado ? <Check size={15} className="text-emerald-700" /> : <Copy size={15} />}
                {copiado ? "Copiado" : "Copiar código"}
              </button>
            </div>

            <p className="text-sm text-suave">
              {emKb(resultado.bytesOriginal)} → <strong className="text-texto">{emKb(resultado.bytesSvg)}</strong> ·{" "}
              {resultado.caminhos} {resultado.caminhos === 1 ? "caminho" : "caminhos"} · {resultado.cores.length}{" "}
              {resultado.cores.length === 1 ? "cor" : "cores"} · {resultado.ms} ms · {resultado.largura} ×{" "}
              {resultado.altura} px
            </p>

            <p className="text-xs text-suave">
              {resultado.fundoRemovido
                ? `Fundo removido (cor ${resultado.fundoRemovido}): o SVG é transparente.`
                : resultado.jaTransparente
                  ? "A imagem já tinha fundo transparente."
                  : "O fundo não é de uma cor só, então foi mantido."}
              {resultado.reduzida &&
                ` A imagem foi reduzida de ${resultado.larguraOriginal} × ${resultado.alturaOriginal} para ${resultado.largura} × ${resultado.altura} px antes de converter; o SVG escala sem perda.`}
            </p>

            <ul className="flex flex-wrap gap-1.5">
              {resultado.cores.map((cor) => (
                <li
                  key={cor}
                  className="inline-flex items-center gap-1.5 rounded border border-borda px-2 py-1 font-mono text-[11px]"
                >
                  <span className="h-3 w-3 rounded-sm border border-borda" style={{ backgroundColor: cor }} />
                  {cor}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

function Painel({ titulo, rodape, acao, children }) {
  return (
    <div className="overflow-hidden rounded-lg border border-borda bg-superficie">
      <div className="flex min-h-9 items-center justify-between gap-2 border-b border-borda px-3 py-1.5 text-xs text-suave">
        <span className="font-medium uppercase tracking-wide">{titulo}</span>
        <span className="flex items-center gap-2">
          {acao}
          <span className="tabular-nums">{rodape}</span>
        </span>
      </div>
      <div className={`flex min-h-64 items-center justify-center p-3 ${XADREZ}`}>{children}</div>
    </div>
  );
}
