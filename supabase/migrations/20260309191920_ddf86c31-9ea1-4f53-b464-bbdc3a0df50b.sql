
CREATE TABLE public.dashboard_settings (
  chave text PRIMARY KEY,
  valor text NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dashboard_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dashboard_settings_public_access"
ON public.dashboard_settings
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);
