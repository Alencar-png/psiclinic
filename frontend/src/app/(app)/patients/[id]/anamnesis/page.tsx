"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  User, Heart, Users as UsersIcon, Activity, Brain, FileText, Stethoscope, Pill, Save,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  Button, PageHeader, Tabs, TabsList, TabsTrigger, TabsContent, Textarea, useToast,
} from "@/components/ui";

type AnamnesisOut = {
  id: number;
  current_version: { id: number; version_number: number; created_at: string } | null;
  locked_at: string | null;
  versions_count: number;
  payload: any | null;
};

const EMPTY_DRAFT = {
  identification: {} as any,
  hda: "",
  family_history: "",
  personal_antecedents: {} as any,
  social_antecedents: { parents: {} as any, patient_life: {} as any } as any,
  physical_exam: {} as any,
  mental_exam: {} as any,
  complementary_exams: { notes: "", attachment_ids: [] as number[] },
  diagnostic_hypothesis: "",
  cid10_codes: [] as string[],
  conduct: { notes: "", prescription_items: [] as any[] },
  change_reason: "",
};

function normalizePayload(p: any): typeof EMPTY_DRAFT {
  if (!p) return JSON.parse(JSON.stringify(EMPTY_DRAFT));
  return {
    identification: p.identification ?? {},
    hda: p.hda ?? "",
    family_history: p.family_history ?? "",
    personal_antecedents: p.personal_antecedents ?? {},
    social_antecedents: {
      ...(p.social_antecedents ?? {}),
      parents: p.social_antecedents?.parents ?? {},
      patient_life: p.social_antecedents?.patient_life ?? {},
    },
    physical_exam: p.physical_exam ?? {},
    mental_exam: p.mental_exam ?? {},
    complementary_exams: {
      notes: p.complementary_exams?.notes ?? "",
      attachment_ids: p.complementary_exams?.attachment_ids ?? [],
    },
    diagnostic_hypothesis: p.diagnostic_hypothesis ?? "",
    cid10_codes: p.cid10_codes ?? [],
    conduct: {
      notes: p.conduct?.notes ?? "",
      prescription_items: p.conduct?.prescription_items ?? [],
    },
    change_reason: p.change_reason ?? "",
  };
}

const TAB_DEFS = [
  { value: "identificacao", label: "Identificação", icon: User },
  { value: "hda",           label: "HDA",            icon: FileText },
  { value: "familiares",    label: "Antec. Familiares", icon: UsersIcon },
  { value: "pessoais",      label: "Antec. Pessoais",   icon: Heart },
  { value: "sociais",       label: "Antec. Sociais",    icon: UsersIcon },
  { value: "exame_fisico",  label: "Exame Físico",      icon: Stethoscope },
  { value: "exame_mental",  label: "Exame Mental",      icon: Brain },
  { value: "complementares",label: "Exames Compl.",     icon: Activity },
  { value: "diagnostico",   label: "Diagnóstico",       icon: FileText },
  { value: "conduta",       label: "Conduta",           icon: Pill },
] as const;

export default function AnamnesisPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [data, setData] = useState<AnamnesisOut | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [draft, setDraft] = useState<any>(JSON.parse(JSON.stringify(EMPTY_DRAFT)));
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<string>("identificacao");

  useEffect(() => {
    api<AnamnesisOut>(`/patients/${id}/anamnesis`)
      .then((d) => { setData(d); setDraft(normalizePayload(d.payload)); })
      .catch((e: any) => {
        if (e.status === 404) { setIsNew(true); setData(null); }
        else toast("error", e.message);
      });
  }, [id, toast]);

  async function save() {
    setSaving(true);
    try {
      const r = await api<AnamnesisOut>(`/patients/${id}/anamnesis`, { method: "PUT", body: draft });
      setData(r); setDraft(normalizePayload(r.payload)); setIsNew(false);
      toast("success", "Anamnese salva — versão " + (r.current_version?.version_number ?? 1));
    } catch (e: any) {
      toast("error", e.message || "Erro ao salvar");
    } finally { setSaving(false); }
  }

  if (data === null && !isNew) {
    return <p className="text-brand-muted text-body-sm">Carregando…</p>;
  }

  const versionInfo = data?.current_version
    ? `v${data.current_version.version_number} • criada em ${new Date(data.current_version.created_at).toLocaleString("pt-BR")}`
    : "Nova ficha (será salva como v1)";

  return (
    <>
      <PageHeader
        title="Ficha de Anamnese Psiquiátrica"
        description={versionInfo}
        back={{ href: `/patients/${id}` }}
        actions={
          <Button leftIcon={<Save className="w-4 h-4" />} onClick={save} loading={saving}>
            {isNew ? "Criar v1" : "Salvar nova versão"}
          </Button>
        }
      />

      <div className="max-w-5xl">
        <Tabs value={tab} onValueChange={setTab}>
          {/* Lista de tabs com scroll horizontal em telas estreitas */}
          <div className="overflow-x-auto pb-2 -mx-1 px-1">
            <TabsList className="flex w-max">
              {TAB_DEFS.map(({ value, label, icon: Icon }) => (
                <TabsTrigger key={value} value={value}>
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="identificacao">
            <Card>
              <Grid>
                <Field label="Nome completo" v={draft.identification?.full_name}
                  on={(v) => setDraft({ ...draft, identification: { ...(draft.identification ?? {}), full_name: v } })} />
                <Field label="Idade" type="number" v={draft.identification?.age}
                  on={(v) => setDraft({ ...draft, identification: { ...(draft.identification ?? {}), age: Number(v) } })} />
                <Field label="Pai" v={draft.identification?.father_name}
                  on={(v) => setDraft({ ...draft, identification: { ...(draft.identification ?? {}), father_name: v } })} />
                <Field label="Mãe" v={draft.identification?.mother_name}
                  on={(v) => setDraft({ ...draft, identification: { ...(draft.identification ?? {}), mother_name: v } })} />
                <Field label="Endereço" v={draft.identification?.address} colSpan={2}
                  on={(v) => setDraft({ ...draft, identification: { ...(draft.identification ?? {}), address: v } })} />
                <Field label="Profissão" v={draft.identification?.profession}
                  on={(v) => setDraft({ ...draft, identification: { ...(draft.identification ?? {}), profession: v } })} />
                <Field label="Naturalidade" v={draft.identification?.naturalidade}
                  on={(v) => setDraft({ ...draft, identification: { ...(draft.identification ?? {}), naturalidade: v } })} />
                <Field label="Procedência" v={draft.identification?.procedencia}
                  on={(v) => setDraft({ ...draft, identification: { ...(draft.identification ?? {}), procedencia: v } })} />
                <Field label="Estado civil" v={draft.identification?.marital_status}
                  on={(v) => setDraft({ ...draft, identification: { ...(draft.identification ?? {}), marital_status: v } })} />
                <Field label="Cor / etnia" v={draft.identification?.skin_color}
                  on={(v) => setDraft({ ...draft, identification: { ...(draft.identification ?? {}), skin_color: v } })} />
                <Field label="Religião" v={draft.identification?.religion}
                  on={(v) => setDraft({ ...draft, identification: { ...(draft.identification ?? {}), religion: v } })} />
              </Grid>
            </Card>
          </TabsContent>

          <TabsContent value="hda">
            <Card>
              <Textarea
                label="História da Doença Atual (HDA)"
                value={draft.hda ?? ""}
                onChange={(e) => setDraft({ ...draft, hda: e.target.value })}
                rows={10}
                placeholder="Descreva o quadro clínico, início, evolução, sintomas associados…"
              />
            </Card>
          </TabsContent>

          <TabsContent value="familiares">
            <Card>
              <Textarea
                label="Antecedentes Familiares"
                value={draft.family_history ?? ""}
                onChange={(e) => setDraft({ ...draft, family_history: e.target.value })}
                rows={8}
                placeholder="Histórico psiquiátrico/neurológico familiar, padrões genéticos relevantes…"
              />
            </Card>
          </TabsContent>

          <TabsContent value="pessoais">
            <Card title="Antecedentes Pessoais">
              <Grid>
                {[
                  ["gestation","Gestação"], ["birth","Parto"], ["breastfeeding","Amamentação"],
                  ["psychomotor_dev","Desenvolvimento neuropsicomotor"], ["childhood_diseases","Doenças da infância"],
                  ["convulsions","Passado comicial (convulsões)"], ["head_trauma","TCE"],
                  ["blood_transfusion","Hemotransfusão"], ["stds","DSTs"], ["surgeries","Cirurgias"],
                  ["menarca","Menarca"], ["menopausa","Menopausa"], ["catamenios","Catamênios"],
                  ["first_sex","Primeira relação sexual"], ["sexual_preference","Preferência sexual"],
                  ["migraine","Enxaqueca"], ["pms","TPM"], ["smoking","Tabagismo"],
                  ["alcohol","Etilismo"], ["illicit_drugs","Drogas ilícitas"],
                ].map(([k, l]) => (
                  <Field key={k} label={l} v={draft.personal_antecedents?.[k]}
                    on={(v) => setDraft({ ...draft, personal_antecedents: { ...(draft.personal_antecedents ?? {}), [k]: v } })} />
                ))}
              </Grid>
            </Card>
          </TabsContent>

          <TabsContent value="sociais">
            <div className="space-y-4">
              <Card title="Pais">
                <Grid>
                  {[
                    ["relationship","Relacionamento"], ["socioeconomic_status","Situação econômico-social"],
                    ["children_predilection","Predileção por filhos"],
                  ].map(([k, l]) => (
                    <Field key={k} label={l} v={draft.social_antecedents?.parents?.[k]}
                      on={(v) => setDraft({
                        ...draft,
                        social_antecedents: {
                          ...(draft.social_antecedents ?? {}),
                          parents: { ...(draft.social_antecedents?.parents ?? {}), [k]: v },
                        },
                      })} />
                  ))}
                </Grid>
              </Card>
              <Card title="Paciente">
                <Grid>
                  <Field label="Vida com os pais" v={draft.social_antecedents?.patient_life?.life_with_parents}
                    on={(v) => setDraft({ ...draft, social_antecedents: { ...(draft.social_antecedents ?? {}),
                      patient_life: { ...(draft.social_antecedents?.patient_life ?? {}), life_with_parents: v } } })} />
                  <Field label="Relacionamento familiar" v={draft.social_antecedents?.patient_life?.family_relationship}
                    on={(v) => setDraft({ ...draft, social_antecedents: { ...(draft.social_antecedents ?? {}),
                      patient_life: { ...(draft.social_antecedents?.patient_life ?? {}), family_relationship: v } } })} />
                  {[
                    ["childhood","Infância"], ["school_life","Vida estudantil"],
                    ["professional_life","Vida profissional"], ["social_life","Vida social"],
                    ["psychosexuality","Psicossexualidade"], ["premorbid_personality","Personalidade pré-mórbida"],
                  ].map(([k, l]) => (
                    <Field key={k} label={l} v={draft.social_antecedents?.[k]}
                      on={(v) => setDraft({ ...draft, social_antecedents: { ...(draft.social_antecedents ?? {}), [k]: v } })} />
                  ))}
                </Grid>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="exame_fisico">
            <Card title="Exame Físico Geral">
              <Grid>
                {[
                  ["general_state","Estado geral"], ["skin_mucosa","Pele e mucosas"], ["biotype","Biotipo"],
                  ["head_neck","Cabeça e pescoço"], ["cardiovascular","Cardiovascular"],
                  ["respiratory","Respiratório"], ["digestive","Digestivo"], ["genitourinary","Genito-urinário"],
                  ["locomotor","Locomotor"],
                ].map(([k, l]) => (
                  <Field key={k} label={l} v={draft.physical_exam?.[k]}
                    on={(v) => setDraft({ ...draft, physical_exam: { ...(draft.physical_exam ?? {}), [k]: v } })} />
                ))}
              </Grid>
              <h4 className="mt-6 mb-2 text-label-upper uppercase text-brand-muted">Exame neurológico</h4>
              <Grid>
                {[
                  ["neurological_gait","Marcha"], ["neurological_static","Estática"],
                  ["neurological_tremors","Tremores"], ["neurological_tone","Tônus"],
                  ["neurological_reflexes","Reflexos"],
                ].map(([k, l]) => (
                  <Field key={k} label={l} v={draft.physical_exam?.[k]}
                    on={(v) => setDraft({ ...draft, physical_exam: { ...(draft.physical_exam ?? {}), [k]: v } })} />
                ))}
              </Grid>
            </Card>
          </TabsContent>

          <TabsContent value="exame_mental">
            <Card title="Exame Mental ou Psíquico">
              <Grid>
                {[
                  ["appearance","Aparência"], ["attendance_circumstance","Circunstância de atendimento"],
                  ["psychomotricity","Psicomotricidade"], ["mood","Humor"],
                  ["perception","Sensopercepção"], ["thought","Pensamento"], ["language","Linguagem"],
                  ["orientation","Orientação"], ["intelligence","Inteligência"], ["behavior","Comportamento"],
                  ["consciousness","Consciência"], ["memory","Memória"], ["will","Vontade"],
                  ["judgment","Juízo"], ["self_consciousness","Consciência do eu"],
                  ["rapport","Rapport"], ["insight","Insight"],
                ].map(([k, l]) => (
                  <Field key={k} label={l} v={draft.mental_exam?.[k]}
                    on={(v) => setDraft({ ...draft, mental_exam: { ...(draft.mental_exam ?? {}), [k]: v } })} />
                ))}
              </Grid>
            </Card>
          </TabsContent>

          <TabsContent value="complementares">
            <Card>
              <Textarea
                label="Exames Complementares"
                value={draft.complementary_exams?.notes ?? ""}
                onChange={(e) => setDraft({ ...draft, complementary_exams: { ...(draft.complementary_exams ?? { attachment_ids: [] }), notes: e.target.value } })}
                rows={8}
                placeholder="Resultados de exames laboratoriais, neuroimagem, etc."
              />
              <p className="mt-3 text-caption text-brand-muted">📎 Anexos (PDF, imagens) — em breve.</p>
            </Card>
          </TabsContent>

          <TabsContent value="diagnostico">
            <Card title="Hipótese Diagnóstica">
              <Textarea
                label="Hipótese diagnóstica"
                value={draft.diagnostic_hypothesis ?? ""}
                onChange={(e) => setDraft({ ...draft, diagnostic_hypothesis: e.target.value })}
                rows={4}
                placeholder="Ex: Episódio depressivo moderado, com sintomas ansiosos…"
              />
              <CidPicker
                values={draft.cid10_codes ?? []}
                onChange={(codes) => setDraft({ ...draft, cid10_codes: codes })}
              />
            </Card>
          </TabsContent>

          <TabsContent value="conduta">
            <Card title="Conduta terapêutica">
              <Textarea
                label="Conduta"
                value={draft.conduct?.notes ?? ""}
                onChange={(e) => setDraft({ ...draft, conduct: { ...(draft.conduct ?? { prescription_items: [] }), notes: e.target.value } })}
                rows={6}
                placeholder="Plano terapêutico, retornos, orientações…"
              />
              <p className="mt-3 text-caption text-brand-muted">
                💊 Prescrição estruturada (medicamento, dose, frequência) — ferramenta dedicada em breve.
              </p>
              {!isNew && data && data.current_version && (
                <div className="mt-6 pt-5 border-t border-brand-border">
                  <Textarea
                    label="Motivo desta nova versão"
                    required
                    value={draft.change_reason ?? ""}
                    onChange={(e) => setDraft({ ...draft, change_reason: e.target.value })}
                    rows={2}
                    placeholder="Ex: paciente trouxe novo exame, ajuste do diagnóstico…"
                    hint="Obrigatório a partir da v2 (auditoria de prontuário)."
                  />
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

/* ─── Subcomponentes ─── */

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="card-psiclinic card-body">
      {title && <h3 className="text-heading-3 text-brand-text mb-4">{title}</h3>}
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-4">{children}</div>;
}

function Field({ label, v, on, type = "text", colSpan = 1 }: any) {
  return (
    <label className={`block ${colSpan === 2 ? "md:col-span-2" : ""}`}>
      <span className="label-psiclinic">{label}</span>
      <input
        type={type}
        value={v ?? ""}
        onChange={(e) => on(e.target.value)}
        className="input-psiclinic w-full"
      />
    </label>
  );
}

function CidPicker({ values, onChange }: { values: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ code: string; description: string }[]>([]);

  useEffect(() => {
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(
      () => api<any[]>("/cid10", { query: { q, limit: 10 } }).then(setResults).catch(() => {}),
      250,
    );
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="mt-4">
      <p className="label-psiclinic">CID-10</p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {values.map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5 rounded-full bg-primary-light text-primary-dark border border-primary-border px-3 py-1 text-xs font-medium">
            {c}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== c))}
              className="text-primary hover:text-primary-active">×</button>
          </span>
        ))}
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar CID-10 (ex: F32, depressão…)"
        className="input-psiclinic-sm w-full"
      />
      {results.length > 0 && (
        <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-brand-border bg-white text-body-sm shadow-sm">
          {results.map((r) => (
            <li key={r.code}>
              <button
                type="button"
                onClick={() => { onChange(Array.from(new Set([...values, r.code]))); setQ(""); setResults([]); }}
                className="w-full px-3 py-1.5 text-left hover:bg-brand-bg-subtle"
              >
                <code className="text-primary-dark font-medium">{r.code}</code> — {r.description}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
