-- "!" do kit quando uma peca muda (pedido do dono em 10/10/2026): como cada peca estava no ultimo Salvar do kit.
-- Migration feita a mao: o `migrate diff` propos tambem apagar "ProdutoColetado_buscaTexto_trgm" e
-- "ProdutoColetado_coletadoEm_idx", que so existem no SQL. Essas linhas foram tiradas.

-- AlterTable
ALTER TABLE "ProdutoComponente" ADD COLUMN "retrato" JSONB;

-- Os kits que ja existem comecam com a referencia de hoje, entao nascem sem "!". O formato e o de `retratoDaPeca`
-- (src/lib/composicaoBanco.js): md5 da descricao com a quebra de linha uniformizada em "\n" (o navegador manda "\r\n"),
-- md5 dos nomes das fotos em ordem de bytes, nomes dos documentos.
UPDATE "ProdutoComponente" AS pc
   SET "retrato" = jsonb_build_object(
     'tituloBase', p."tituloBase",
     'descricao', md5(regexp_replace(COALESCE(p."descricaoBase", ''), E'\r\n?', E'\n', 'g')),
     'precoVenda', p."precoVenda"::float8,
     'pesoKg', p."pesoKg"::float8,
     'comprimentoCm', p."comprimentoCm"::float8,
     'larguraCm', p."larguraCm"::float8,
     'alturaCm', p."alturaCm"::float8,
     'ncm', p."ncm",
     'ativo', p."ativo",
     'conferido', p."conferido",
     'fotos', (
       SELECT md5(string_agg(a."arquivo", ',' ORDER BY a."arquivo" COLLATE "C"))
         FROM "ProdutoArquivo" a
        WHERE a."produtoId" = p."id" AND a."tipo" = 'IMAGEM' AND a."papel" = 'FOTO'
     ),
     'quantidadeFotos', (
       SELECT COUNT(*)
         FROM "ProdutoArquivo" a
        WHERE a."produtoId" = p."id" AND a."tipo" = 'IMAGEM' AND a."papel" = 'FOTO'
     ),
     'documentos', COALESCE((
       SELECT jsonb_agg(COALESCE(a."nomeOriginal", a."arquivo") ORDER BY COALESCE(a."nomeOriginal", a."arquivo") COLLATE "C")
         FROM "ProdutoArquivo" a
        WHERE a."produtoId" = p."id" AND a."tipo" IN ('DOCUMENTO', 'CERTIFICADO')
     ), '[]'::jsonb)
   )
  FROM "Produto" AS p
 WHERE p."id" = pc."componenteId";
