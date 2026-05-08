/**
 * Helpers de UI para profissionais clínicos (médicos e psicólogos).
 *
 * Centralizamos aqui toda a lógica que varia por `professional_type`
 * para evitar dispersão de strings mágicas pelo código.
 */
import type { ProfessionalType } from "@/types";

export const PROFESSIONAL_TYPES: Array<{ value: ProfessionalType; label: string }> = [
  { value: "doctor", label: "Médico" },
  { value: "psychologist", label: "Psicólogo" },
];

/** Rótulo do tipo profissional, com flexão de gênero quando o nome permite. */
export function professionalTypeLabel(
  type: ProfessionalType,
  fullName?: string,
): string {
  const isFemale = !!fullName && /^\s*(dra\.?|sra\.?)\s/i.test(fullName);
  if (type === "psychologist") return isFemale ? "Psicóloga" : "Psicólogo";
  return isFemale ? "Médica" : "Médico";
}

/** Sigla do conselho profissional (CRM ou CRP). */
export function registrationLabel(type: ProfessionalType): "CRM" | "CRP" {
  return type === "psychologist" ? "CRP" : "CRM";
}

/** "CRM 12345/SP" ou "CRP 12345/SP". */
export function formatRegistration(
  type: ProfessionalType,
  number: string,
  uf: string,
): string {
  return `${registrationLabel(type)} ${number}/${uf}`;
}

/** Especialidades pré-definidas por tipo de profissional. */
export const SPECIALTIES_BY_TYPE: Record<ProfessionalType, string[]> = {
  doctor: [
    "Psiquiatria",
    "Psiquiatria Infantil",
    "Psicogeriatria",
    "Neurologia",
    "Clínica Médica",
  ],
  psychologist: [
    "Psicologia Clínica",
    "Psicologia Infantil",
    "Neuropsicologia",
    "Psicologia Hospitalar",
    "Psicanálise",
    "Terapia Cognitivo-Comportamental",
  ],
};
