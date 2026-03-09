
-- Drop restrictive policies and recreate as permissive
DROP POLICY IF EXISTS "acesso_publico_kpi_historico" ON public.kpi_historico;
DROP POLICY IF EXISTS "acesso_publico_pipe2_excecoes" ON public.pipe2_excecoes;

CREATE POLICY "acesso_publico_kpi_historico"
ON public.kpi_historico
FOR ALL
TO public
USING (true)
WITH CHECK (true);

CREATE POLICY "acesso_publico_pipe2_excecoes"
ON public.pipe2_excecoes
FOR ALL
TO public
USING (true)
WITH CHECK (true);
