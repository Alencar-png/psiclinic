/**
 * Helpers de UI para roles do sistema.
 * Reusados pela tela /users e por componentes que exibem o tipo de conta.
 */
import type { Role } from "@/types";

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super administrador",
  clinic_admin: "Administrador da clínica",
  doctor: "Médico/Psicólogo",
  receptionist: "Recepção",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  super_admin: "Gerencia o SaaS — acessa todas as empresas e usuários.",
  clinic_admin: "Gerencia a clínica — usuários, pacientes, profissionais e configuração.",
  doctor: "Atende pacientes e mantém prontuário. Criado em /profissionais.",
  receptionist: "Marca agendamentos e cadastra pacientes — sem acesso clínico.",
};

export const ROLE_BADGE_VARIANT: Record<Role, "primary" | "info" | "success" | "warning" | "muted"> = {
  super_admin: "warning",
  clinic_admin: "primary",
  doctor: "info",
  receptionist: "success",
};

/** Roles administrativos criáveis via /users (não-doctor). */
export const ADMINISTRATIVE_ROLES: Role[] = ["clinic_admin", "receptionist"];

/** Lista de roles que `actor` pode criar via tela /users. */
export function creatableRoles(actorRole: Role): Role[] {
  if (actorRole === "super_admin") {
    return ["super_admin", "clinic_admin", "receptionist"];
  }
  if (actorRole === "clinic_admin") {
    return ["clinic_admin", "receptionist"];
  }
  return [];
}
