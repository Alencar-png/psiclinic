// Tipos espelhando schemas do backend.
export type Role = "super_admin" | "clinic_admin" | "doctor" | "receptionist";

export interface Me {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  company_id: number | null;
  company_name: string | null;
  doctor_id: number | null;
  totp_enabled: boolean;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_at: string;
}

export type SessionStatus = "scheduled" | "in_progress" | "completed" | "cancelled" | "no_show";
export type PatientStatus = "active" | "inactive" | "discharged";
export type CompanyStatus = "active" | "suspended" | "cancelled";

export interface Company {
  id: number;
  name: string;
  trade_name: string | null;
  cnpj: string;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  technical_responsible_name: string;
  technical_responsible_crm: string;
  technical_responsible_uf: string;
  plan_id: number | null;
  status: CompanyStatus;
  session_lock_after_days: number;
  data_retention_days: number;
  doctors_see_all_patients: boolean;
  created_at: string;
}

export interface Doctor {
  id: number;
  full_name: string;
  crm: string;
  crm_uf: string;
  specialty: string | null;
  email: string;
  phone: string | null;
  photo_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface PatientListItem {
  id: string;
  full_name: string;
  birth_date: string;
  age: number;
  status: PatientStatus;
  primary_doctor_name: string | null;
  last_session_at: string | null;
}

export interface PatientDetail extends PatientListItem {
  cpf: string;
  gender: string | null;
  mother_name: string | null;
  father_name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  naturalidade: string | null;
  procedencia: string | null;
  profession: string | null;
  marital_status: string | null;
  religion: string | null;
  skin_color: string | null;
  primary_doctor_id: number | null;
  has_anamnesis: boolean;
  company_id: number;
  created_at: string;
}

export interface AgendaItem {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: SessionStatus;
  doctor_id: number;
  doctor_name: string;
  patient_id: string;
  patient_name: string;
  locked_at: string | null;
}

export interface SessionListItem {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: SessionStatus;
  doctor_name: string;
  locked_at: string | null;
}

export interface SessionDetail extends SessionListItem {
  patient_id: string;
  doctor_id: number;
  observations_html: string | null;
  next_session_suggestion: string | null;
  parent_session_id: string | null;
  created_at: string;
  updated_at: string | null;
  last_autosaved_at: string | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}
