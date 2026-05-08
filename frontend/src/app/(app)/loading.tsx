/**
 * Loading boundary do Next App Router — disparado automaticamente
 * em transições de rota dentro de (app)/ enquanto o RSC carrega.
 *
 * Mostra o LoadingState centralizado, mantendo a sidebar visível
 * (este arquivo só substitui o `children` do layout).
 */
import { LoadingState } from "@/components/ui";

export default function AppLoading() {
  return <LoadingState variant="page" message="Carregando…" />;
}
