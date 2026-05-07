import { redirect } from "next/navigation";

/**
 * Raiz do app: redireciona para /login.
 * Se o usuário já estiver autenticado, o /login detecta o token e
 * redireciona para /dashboard automaticamente (ver login/page.tsx).
 */
export default function Root() {
  redirect("/login");
}
