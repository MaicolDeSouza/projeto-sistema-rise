-- Chat da loja (o Hobi), fase 3: o acompanhar pedido. GERADO por src/lib/riseAi/cliente/sqlDoPapel.js
-- (`sqlDaMigracaoDoPedido`); o teste:ia-isolamento confere que este arquivo e igual a saida do gerador.
-- Feito a mao: o proximo `prisma migrate diff` vai propor apagar a funcao. O papel rise_ia so ganha EXECUTE nela.

CREATE TABLE "TentativaDePedidoIA" (
    "numeroHash" TEXT NOT NULL,
    "dia" DATE NOT NULL,
    "erros" INTEGER NOT NULL DEFAULT 0,
    "consultas" INTEGER NOT NULL DEFAULT 0,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TentativaDePedidoIA_pkey" PRIMARY KEY ("numeroHash","dia")
);

CREATE FUNCTION ia_situacao_do_pedido(p_numero text, p_prova text) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_numero text := upper(regexp_replace(coalesce(p_numero, ''), '[^0-9A-Za-z]', '', 'g'));
  v_prova text := lower(btrim(coalesce(p_prova, '')));
  v_digitos text := regexp_replace(coalesce(p_prova, ''), '[^0-9]', '', 'g');
  v_email boolean := position('@' in btrim(coalesce(p_prova, ''))) > 1;
  v_agora timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_hash text;
  v_usadas int;
  v_erros int;
  v_id text;
  v_numero_do_pedido text;
  v_canal text;
  v_data date;
  v_status text;
  v_status_do_envio text;
  v_envio jsonb;
  v_atualizado timestamp;
  v_transportadora text;
  v_rastreio text;
  v_link text;
BEGIN
  IF length(v_numero) NOT BETWEEN 1 AND 30 OR (NOT v_email AND length(v_digitos) NOT IN (11, 14)) THEN
    RETURN '{"situacao":"nao_achado"}'::jsonb;
  END IF;

  INSERT INTO "TentativaDePedidoIA" ("numeroHash", "dia", "consultas")
  VALUES ('hora-' || to_char(v_agora, 'HH24'), v_hoje, 1)
  ON CONFLICT ("numeroHash", "dia") DO UPDATE SET "consultas" = "TentativaDePedidoIA"."consultas" + 1, "atualizadoEm" = now()
  RETURNING "consultas" INTO v_usadas;
  IF v_usadas > 300 THEN
    RETURN '{"situacao":"limite"}'::jsonb;
  END IF;

  v_hash := encode(sha256(convert_to(v_numero, 'UTF8')), 'hex');
  SELECT t."erros" INTO v_erros FROM "TentativaDePedidoIA" t WHERE t."numeroHash" = v_hash AND t."dia" = v_hoje;
  IF coalesce(v_erros, 0) >= 5 THEN
    RETURN '{"situacao":"limite"}'::jsonb;
  END IF;

  SELECT p."id", p."numero", p."origem"::text, ((p."dataDaVenda" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date,
         p."status"::text, p."statusDoEnvio"::text, p."envio", p."atualizadoNaOrigemEm"
    INTO v_id, v_numero_do_pedido, v_canal, v_data, v_status, v_status_do_envio, v_envio, v_atualizado
    FROM "PedidoDeVenda" p
    LEFT JOIN "Cliente" c ON c."id" = p."clienteId"
   WHERE p."origem" IN ('LOJA_INTEGRADA', 'BLING')
     AND v_numero IN (
           upper(regexp_replace(p."numero", '[^0-9A-Za-z]', '', 'g')),
           upper(regexp_replace(p."idExterno", '[^0-9A-Za-z]', '', 'g')),
           upper(regexp_replace(coalesce(p."blingNumero", ''), '[^0-9A-Za-z]', '', 'g')))
     AND CASE WHEN v_email THEN
           lower(btrim(coalesce(p."emailDoComprador", ''))) = v_prova
           OR lower(btrim(coalesce(c."email", ''))) = v_prova
           OR v_prova = ANY (SELECT lower(btrim(x)) FROM unnest(coalesce(c."emailsAdicionais", ARRAY[]::text[])) AS x)
         ELSE
           regexp_replace(coalesce(p."documentoDoComprador", ''), '[^0-9]', '', 'g') = v_digitos
           OR regexp_replace(coalesce(c."documento", ''), '[^0-9]', '', 'g') = v_digitos
         END
   ORDER BY p."dataDaVenda" DESC
   LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO "TentativaDePedidoIA" ("numeroHash", "dia", "erros") VALUES (v_hash, v_hoje, 1)
    ON CONFLICT ("numeroHash", "dia") DO UPDATE SET "erros" = "TentativaDePedidoIA"."erros" + 1, "atualizadoEm" = now();
    RETURN '{"situacao":"nao_achado"}'::jsonb;
  END IF;

  -- O rastreio do envio feito pelo Rise (modulo de frete) vence o que a origem mandou.
  SELECT e."transportadoraNome", e."rastreio", e."linkDoRastreio" INTO v_transportadora, v_rastreio, v_link
    FROM "Envio" e
   WHERE e."pedidoDeVendaId" = v_id AND e."direcao" = 'IDA' AND e."rastreio" IS NOT NULL
   ORDER BY e."criadoEm" DESC
   LIMIT 1;

  RETURN jsonb_build_object('situacao', 'achado', 'pedido', jsonb_build_object(
    'numero', v_numero_do_pedido,
    'canal', v_canal,
    'data', to_char(v_data, 'YYYY-MM-DD'),
    'status', v_status,
    'statusDoEnvio', v_status_do_envio,
    'transportadora', coalesce(v_transportadora, nullif(v_envio->>'transportadora', '')),
    'rastreio', coalesce(v_rastreio, nullif(v_envio->>'rastreio', '')),
    'linkDoRastreio', coalesce(v_link, nullif(v_envio->>'link', '')),
    'atualizadoEm', to_char(v_atualizado, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')));
END;
$$;

REVOKE ALL ON FUNCTION ia_situacao_do_pedido(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ia_situacao_do_pedido(text, text) TO rise_ia;
