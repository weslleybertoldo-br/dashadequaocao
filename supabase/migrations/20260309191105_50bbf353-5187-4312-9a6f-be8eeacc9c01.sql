
DROP POLICY IF EXISTS "kpi_historico_public_access" ON public.kpi_historico;
DROP POLICY IF EXISTS "pipe2_excecoes_public_access" ON public.pipe2_excecoes;

CREATE POLICY "kpi_historico_public_access"
ON public.kpi_historico
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "pipe2_excecoes_public_access"
ON public.pipe2_excecoes
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);
