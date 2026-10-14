import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
  serve(handler: (req: Request) => Promise<Response> | Response): void;
};

type AuthAction = "login" | "reset";

type RequestBody = {
  action?: string;
  nickname?: string;
  password?: string;
  redirectTo?: string;
};

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const reply = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
    },
  });

const getRequiredEnv = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (req.method !== "POST") {
    return reply({ error: "Método inválido." }, 405);
  }

  const url = getRequiredEnv("SUPABASE_URL");
  const anon = getRequiredEnv("SUPABASE_ANON_KEY");
  const service = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const auth = createClient(url, anon, { auth: { persistSession: false } });

  try {
    const body = (await req.json()) as RequestBody;
    const nickname = String(body.nickname ?? "").trim();

    if (!nickname || nickname.length > 40) {
      return reply({ error: "Credenciais inválidas." }, 400);
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("id,status,nickname")
      .eq("nickname", nickname)
      .maybeSingle();

    if (body.action === "login") {
      if (!profile || profile.status !== "active" || !body.password) {
        return reply({ error: "Credenciais inválidas." }, 401);
      }

      const { data: userData, error: userError } = await admin.auth.admin.getUserById(profile.id);
      const email = userData?.user?.email;

      if (userError || !email) {
        return reply({ error: "Credenciais inválidas." }, 401);
      }

      const { data, error } = await auth.auth.signInWithPassword({
        email,
        password: String(body.password),
      });

      if (error || !data.session) {
        return reply({ error: "Credenciais inválidas." }, 401);
      }

      return reply({ session: data.session });
    }

    if (body.action === "reset") {
      // Resposta uniforme impede descobrir se um nickname existe.
      if (profile?.status === "active") {
        const { data: userData } = await admin.auth.admin.getUserById(profile.id);
        const email = userData?.user?.email;

        if (email) {
          await auth.auth.resetPasswordForEmail(email, {
            redirectTo: String(body.redirectTo || url),
          });
        }
      }

      return reply({ ok: true });
    }

    return reply({ error: "Ação inválida." }, 400);
  } catch {
    return reply({ error: "Não foi possível processar a solicitação." }, 400);
  }
});

