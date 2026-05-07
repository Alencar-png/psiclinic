"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Lock, Eye, EyeOff, Brain } from "lucide-react";
import { api, tokenStore } from "@/lib/api";
import type { TokenPair } from "@/types";

/* ─── Animations (mesmo padrão do Emotion Care) ──────────────── */
const loginAnimations = `
@keyframes login-fade-up {
  from { opacity: 0; transform: translateY(30px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes login-fade-left {
  from { opacity: 0; transform: translateX(-40px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes login-fade-right {
  from { opacity: 0; transform: translateX(40px) scale(0.96); }
  to   { opacity: 1; transform: translateX(0) scale(1); }
}
@keyframes login-stagger-1 { 0%, 15% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: translateY(0); } }
@keyframes login-stagger-2 { 0%, 30% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: translateY(0); } }
@keyframes login-stagger-3 { 0%, 45% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: translateY(0); } }
@keyframes login-stagger-4 { 0%, 55% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: translateY(0); } }
@keyframes login-stagger-5 { 0%, 65% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: translateY(0); } }
@keyframes float-blob {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33%      { transform: translate(25px, -20px) scale(1.08); }
  66%      { transform: translate(-15px, 12px) scale(0.95); }
}
@keyframes float-blob-r {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33%      { transform: translate(-20px, 18px) scale(1.05); }
  66%      { transform: translate(18px, -10px) scale(0.97); }
}
@keyframes particle-drift {
  0%, 100% { transform: translateY(0) translateX(0); opacity: 0; }
  10%      { opacity: 0.8; }
  50%      { transform: translateY(-100px) translateX(30px); opacity: 0.4; }
  90%      { opacity: 0; }
}
@keyframes shimmer-btn {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
@keyframes pulse-ring {
  0%   { box-shadow: 0 0 0 0 rgba(14, 116, 144, 0.35); }
  70%  { box-shadow: 0 0 0 18px rgba(14, 116, 144, 0); }
  100% { box-shadow: 0 0 0 0 rgba(14, 116, 144, 0); }
}

.login-left  { animation: login-fade-left 0.9s cubic-bezier(0.16, 1, 0.3, 1) both; }
.login-card  { animation: login-fade-right 1s cubic-bezier(0.16, 1, 0.3, 1) both; }
.login-s1    { animation: login-stagger-1 1.2s cubic-bezier(0.16, 1, 0.3, 1) both; }
.login-s2    { animation: login-stagger-2 1.4s cubic-bezier(0.16, 1, 0.3, 1) both; }
.login-s3    { animation: login-stagger-3 1.6s cubic-bezier(0.16, 1, 0.3, 1) both; }
.login-s4    { animation: login-stagger-4 1.8s cubic-bezier(0.16, 1, 0.3, 1) both; }
.login-s5    { animation: login-stagger-5 2.0s cubic-bezier(0.16, 1, 0.3, 1) both; }
.login-float { animation: float-blob 12s ease-in-out infinite; }
.login-float-r { animation: float-blob-r 14s ease-in-out infinite; }

.login-btn-shimmer { position: relative; overflow: hidden; }
.login-btn-shimmer::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(14, 116, 144, 0.12), transparent);
  animation: shimmer-btn 3s ease-in-out infinite;
}

.login-card-glow { animation: pulse-ring 3s ease-in-out infinite; }
`;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Se já estiver logado, manda direto pro dashboard.
  useEffect(() => {
    if (tokenStore.access) router.replace("/dashboard");
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const tokens = await api<TokenPair>("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      tokenStore.set(tokens.access_token, tokens.refresh_token);
      router.push("/dashboard");
    } catch (e: any) {
      setError(e.message || "Erro ao fazer login.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col-reverse lg:flex-row relative overflow-hidden bg-white">
      <style dangerouslySetInnerHTML={{ __html: loginAnimations }} />

      {/* Background particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-primary/[0.06]"
            style={{
              width: `${Math.random() * 5 + 2}px`,
              height: `${Math.random() * 5 + 2}px`,
              left: `${50 + Math.random() * 50}%`,
              top: `${Math.random() * 100}%`,
              animation: `particle-drift ${Math.random() * 8 + 6}s ease-in-out ${Math.random() * 5}s infinite`,
            }}
          />
        ))}
      </div>

      {/* ─── Painel Esquerdo — Branding ─── */}
      <div className="flex-1 bg-white flex items-center justify-center p-8 lg:p-16 relative">
        <div className="absolute top-20 left-10 w-48 h-48 bg-primary/[0.05] rounded-full blur-3xl login-float pointer-events-none" />
        <div className="absolute bottom-20 right-10 w-64 h-64 bg-accent/[0.05] rounded-full blur-3xl login-float-r pointer-events-none" />

        <div className="max-w-md login-left relative">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Brain className="w-7 h-7 text-primary-900" strokeWidth={1.6} />
            </div>
            <div>
              <h1 className="text-3xl font-semibold text-primary-900 tracking-tight">PsiClinic</h1>
              <p className="text-xs text-stone-500 mt-0.5">Prontuário psiquiátrico</p>
            </div>
          </div>
          <p className="text-stone-500 mt-6 text-sm leading-relaxed">
            Plataforma multi-tenant para clínicas psiquiátricas — ficha de
            anamnese versionada, sessões com sigilo médico, criptografia
            ponta-a-ponta e auditoria LGPD.
          </p>
        </div>
      </div>

      {/* ─── Painel Direito — Card de Login ─── */}
      <div className="flex-1 flex items-center justify-center p-8 lg:p-16 bg-white relative">
        <div className="absolute w-[500px] h-[500px] bg-primary/[0.04] rounded-full blur-3xl login-float-r pointer-events-none" />

        <div
          className="login-card login-card-glow w-full max-w-[420px] rounded-3xl p-8 sm:p-10 relative"
          style={{
            backgroundColor: "#164e63", /* primary-900 */
            boxShadow: "0 25px 70px rgba(14, 116, 144, 0.3)",
          }}
        >
          {/* Floating blobs internos */}
          <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/[0.04] rounded-full blur-2xl login-float" />
            <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-cyan-300/[0.10] rounded-full blur-2xl login-float-r" />
          </div>

          {/* Logo no card */}
          <div className="mb-8 login-s1 relative flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-white text-xl font-semibold tracking-tight">PsiClinic</p>
              <p className="text-white/60 text-xs">Acesso clínico</p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 relative">
            {/* E-mail */}
            <div className="login-s2">
              <label className="block text-xs font-medium text-white/80 mb-1.5">
                E-mail
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-stone-400" />
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Digite seu e-mail"
                  required
                  autoComplete="username"
                  className="w-full h-12 pl-11 pr-4 rounded-xl bg-white border border-white/40 text-stone-800 text-sm placeholder:text-stone-400 outline-none transition-all duration-300 focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            {/* Senha */}
            <div className="login-s3">
              <label className="block text-xs font-medium text-white/80 mb-1.5">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-stone-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  required
                  minLength={4}
                  autoComplete="current-password"
                  className="w-full h-12 pl-11 pr-11 rounded-xl bg-white border border-white/40 text-stone-800 text-sm placeholder:text-stone-400 outline-none transition-all duration-300 focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-primary hover:scale-110 transition-all duration-200"
                  tabIndex={-1}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? (
                    <EyeOff className="w-[18px] h-[18px]" />
                  ) : (
                    <Eye className="w-[18px] h-[18px]" />
                  )}
                </button>
              </div>
            </div>

            {/* Esqueci minha senha */}
            <div className="flex justify-end login-s4">
              <button
                type="button"
                className="text-xs text-white/70 hover:text-white transition-colors duration-200"
              >
                Esqueci minha senha
              </button>
            </div>

            {/* Erro */}
            {error && (
              <div className="bg-white/15 border border-white/25 text-white text-sm p-3 rounded-xl animate-[login-fade-up_0.3s_ease-out]">
                {error}
              </div>
            )}

            {/* Submit */}
            <div className="login-s5">
              <button
                type="submit"
                disabled={loading}
                className="login-btn-shimmer w-full h-12 rounded-xl text-sm font-bold text-primary-900 bg-white hover:bg-white/90 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-primary-900/30 border-t-primary-900 rounded-full animate-spin" />
                    Entrando…
                  </>
                ) : (
                  "Entrar"
                )}
              </button>
            </div>
          </form>

          {/* Footer */}
          <p className="text-center text-xs text-white/60 mt-6 login-s5">
            Acesso restrito a profissionais autorizados
          </p>

          {/* Legal links */}
          <div className="flex items-center justify-center gap-3 mt-3 login-s5">
            <a
              href="#"
              className="text-[11px] text-white/40 hover:text-white/70 transition-colors duration-200"
            >
              Termos de Uso
            </a>
            <span className="text-white/20 text-[11px]">|</span>
            <a
              href="#"
              className="text-[11px] text-white/40 hover:text-white/70 transition-colors duration-200"
            >
              Política de Privacidade
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
