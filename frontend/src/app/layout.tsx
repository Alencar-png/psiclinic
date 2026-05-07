import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PsiClinic — Gestão para Clínicas Psiquiátricas",
  description: "Plataforma multi-tenant de prontuário eletrônico psiquiátrico.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
