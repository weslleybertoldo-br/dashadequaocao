import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const ALLOWED_DOMAIN = "@seazone.com.br";

interface AuthGuardProps {
  children: React.ReactNode;
}

export const AuthGuard = ({ children }: AuthGuardProps) => {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!session?.user) {
          navigate("/login", { replace: true });
          return;
        }
        const email = session.user.email ?? "";
        if (!email.endsWith(ALLOWED_DOMAIN)) {
          await supabase.auth.signOut();
          navigate("/login", { replace: true });
          return;
        }
        setAuthorized(true);
        setChecked(true);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        navigate("/login", { replace: true });
        return;
      }
      const email = session.user.email ?? "";
      if (!email.endsWith(ALLOWED_DOMAIN)) {
        supabase.auth.signOut();
        navigate("/login", { replace: true });
        return;
      }
      setAuthorized(true);
      setChecked(true);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (!checked || !authorized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
};
