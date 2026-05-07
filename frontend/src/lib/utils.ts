import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCpf(d: string): string {
  const x = d.replace(/\D/g, "").padStart(11, "0").slice(0, 11);
  return `${x.slice(0,3)}.${x.slice(3,6)}.${x.slice(6,9)}-${x.slice(9,11)}`;
}

export function formatPhone(d: string | null | undefined): string {
  if (!d) return "";
  const x = d.replace(/\D/g, "");
  if (x.length === 11) return `(${x.slice(0,2)}) ${x.slice(2,7)}-${x.slice(7,11)}`;
  if (x.length === 10) return `(${x.slice(0,2)}) ${x.slice(2,6)}-${x.slice(6,10)}`;
  return d;
}
