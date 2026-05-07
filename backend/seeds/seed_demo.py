"""
Seed de desenvolvimento — popula a clínica demo com dados realistas.

Cria:
  - Plano Standard
  - Clínica "Clínica Demo Psiquiatria"
  - Super-admin: super@psiclinic.local / Super@1234567
  - Clinic-admin: admin@demo.local    / Admin@1234567
  - Recepção:    recepcao@demo.local  / Recep@1234567
  - 3 médicos: Dra. Marília (dr.marilia@demo / 12345), Dr. Rafael, Dra. Helena
  - 20 pacientes brasileiros com PII coerente (nomes, CPFs válidos, profissões)
  - ~6-10 sessões por paciente distribuídas em -45d → +30d com status variados
    (completed com observações, scheduled, cancelled, no_show)
  - Anamnese v1 para todos os pacientes ativos
  - Aniversariantes ajustados para cair no mês corrente em alguns casos

USO:
    cd backend
    python -m seeds.seed_demo

Idempotente: se já houver pacientes na clínica, não duplica nada.

Em prod, este arquivo NÃO é executado.
"""
from __future__ import annotations

import os
import random
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

# permite rodar como `python -m seeds.seed_demo`
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from app.config.database import db_session, set_tenant_context  # noqa: E402
from app.models import (  # noqa: E402
    Company,
    Doctor,
    DoctorClinic,
    Patient,
    PatientDoctor,
    Plan,
    User,
    ClinicalSession,
)
from app.models.enums import PatientStatus, SessionStatus, UserRole  # noqa: E402
from app.repositories import anamnesis_repo, patient_repo, session_repo  # noqa: E402
from app.services import crypto, security as sec  # noqa: E402

# Seed precisa de uma master key válida
if not os.getenv("MASTER_ENCRYPTION_KEY_B64"):
    import base64
    os.environ["MASTER_ENCRYPTION_KEY_B64"] = base64.b64encode(b"\x00" * 32).decode()
    print("[seed] MASTER_ENCRYPTION_KEY_B64 não definida — usando chave dev (32 bytes nulos).")

random.seed(42)  # reprodutibilidade — mesma distribuição em cada run


# ─────────────────────────────────────────────────────────────────────────
# Dados de pacientes — CPFs válidos (algoritmo da Receita) e PII brasileira
# ─────────────────────────────────────────────────────────────────────────
PATIENTS_DATA = [
    # CPF, full_name, birth (Y, M, D), gender, mother, father, profession, addr, phone, email, civil, religion, skin
    ("39053344705", "João da Silva",            (1985,  4, 12), "M", "Maria da Silva",       "José da Silva",         "Engenheiro de Software",   "Rua das Acácias, 100, São Paulo/SP",       "11988887777", "joao.silva@example.com",        "Casado",     "Católico",    "Branca"),
    ("82896842055", "Ana Beatriz Ferreira",      (1992,  9, 23), "F", "Helena Ferreira",      "Carlos Ferreira",       "Professora",                "Av. Brigadeiro, 1450, ap 82, São Paulo/SP","11977776666", "ana.ferreira@example.com",      "Solteira",   "Espírita",    "Parda"),
    ("47393545077", "Pedro Henrique Souza",      (1978,  1, 30), "M", "Lúcia Souza",          "Antônio Souza",         "Advogado",                  "R. Augusta, 2300, São Paulo/SP",           "11966665555", "pedro.souza@example.com",       "Divorciado", "Sem religião", "Negra"),
    ("06298994098", "Mariana Costa Lima",        (1996,  6,  4), "F", "Beatriz Lima",         "Fernando Costa",        "Designer Gráfica",          "R. Bela Cintra, 870, São Paulo/SP",        "11955554444", "mari.lima@example.com",         "Solteira",   "Católica",    "Parda"),
    ("11144477735", "Carlos Eduardo Almeida",    (1971, 11, 18), "M", "Sandra Almeida",       "Roberto Almeida",       "Médico (cardiologista)",    "R. Oscar Freire, 200, São Paulo/SP",       "11944443333", "carlos.almeida@example.com",    "Casado",     "Católico",    "Branca"),
    ("52998224725", "Juliana Ribeiro",           (2000,  3,  9), "F", "Cláudia Ribeiro",      "Marcos Ribeiro",        "Estudante de Psicologia",   "R. Haddock Lobo, 400, São Paulo/SP",       "11933332222", "juliana.r@example.com",         "Solteira",   "Espírita",    "Branca"),
    ("82593002030", "Lucas Martins",             (1989,  7, 27), "M", "Rosa Martins",         "Eduardo Martins",       "Analista Financeiro",       "Al. Santos, 1500, São Paulo/SP",           "11922221111", "lucas.martins@example.com",     "Solteiro",   "Sem religião", "Branca"),
    ("18175228077", "Fernanda Oliveira Pires",   (1983,  5, 14), "F", "Carmen Pires",         "João Oliveira",         "Arquiteta",                 "R. Pamplona, 850, São Paulo/SP",           "11911110000", "fer.pires@example.com",         "Casada",     "Católica",    "Branca"),
    ("53444141048", "Rafael Gonçalves",          (1995, 10,  2), "M", "Patrícia Gonçalves",   "Sérgio Gonçalves",      "Programador",               "R. Teodoro Sampaio, 1100, São Paulo/SP",   "11900009999", "rafa.g@example.com",            "Solteiro",   "Sem religião", "Parda"),
    ("99645762001", "Camila Barbosa",            (1987,  2, 28), "F", "Tereza Barbosa",       "Nelson Barbosa",        "Enfermeira",                "R. Heitor Penteado, 320, São Paulo/SP",    "11899998888", "camila.b@example.com",          "Casada",     "Evangélica",  "Negra"),
    ("48767995026", "Gustavo Tavares",           (1965,  8, 20), "M", "Olga Tavares",         "Artur Tavares",         "Aposentado",                "R. Cardeal Arcoverde, 80, São Paulo/SP",   "11888887777", "gtavares@example.com",          "Casado",     "Católico",    "Branca"),
    ("12693244073", "Beatriz Cardoso",           (1998, 12, 11), "F", "Renata Cardoso",       "Júlio Cardoso",         "Jornalista",                "R. Aspicuelta, 200, São Paulo/SP",         "11877776666", "bia.cardoso@example.com",       "Solteira",   "Sem religião", "Branca"),
    ("80986489023", "Diego Nascimento",          (1990,  3, 17), "M", "Vanessa Nascimento",   "Paulo Nascimento",      "Personal Trainer",          "R. Diana, 540, São Paulo/SP",              "11866665555", "diego.n@example.com",           "Solteiro",   "Católico",    "Parda"),
    ("80366574030", "Larissa Mendes",            (1993,  9,  5), "F", "Yara Mendes",          "Ronaldo Mendes",        "Bancária",                  "R. Cunha Gago, 980, São Paulo/SP",         "11855554444", "lari.mendes@example.com",       "União estável", "Espírita", "Parda"),
    ("57247534098", "Marcos Vinícius Rocha",     (1980,  1, 24), "M", "Luiza Rocha",          "Hugo Rocha",            "Empresário",                "R. Gomes de Carvalho, 1200, São Paulo/SP", "11844443333", "marcos.rocha@example.com",      "Divorciado", "Católico",    "Branca"),
    ("80794373033", "Patrícia Lopes",            (1976,  6,  8), "F", "Maria Lopes",          "Wilson Lopes",          "Psicóloga (escolar)",       "R. Capote Valente, 75, São Paulo/SP",      "11833332222", "patricia.lopes@example.com",    "Casada",     "Católica",    "Branca"),
    ("70948004058", "Henrique Carvalho",         (2002,  4, 19), "M", "Adriana Carvalho",     "Bruno Carvalho",        "Estudante (ensino médio)",  "R. Atílio Innocenti, 50, São Paulo/SP",    "11822221111", "h.carvalho@example.com",        "Solteiro",   "Católico",    "Branca"),
    ("85574906005", "Vanessa Pinheiro",          (1988,  7, 30), "F", "Eliana Pinheiro",      "Ricardo Pinheiro",      "Veterinária",               "R. Mateus Grou, 800, São Paulo/SP",        "11811110000", "vanessa.p@example.com",         "Casada",     "Sem religião", "Branca"),
    ("79636462000", "Tiago Moreira",             (1972, 10, 15), "M", "Sônia Moreira",        "Alberto Moreira",       "Professor universitário",   "R. Inácio Pereira da Rocha, 220, São Paulo/SP", "11800009999", "tiago.m@example.com",     "Casado",     "Espírita",    "Negra"),
    ("78535868050", "Isabela Araújo",            (1999, 11,  3), "F", "Cristina Araújo",      "Felipe Araújo",         "Nutricionista",             "R. Wisard, 350, São Paulo/SP",             "11799998888", "isa.araujo@example.com",        "Solteira",   "Espírita",    "Branca"),
]

# (full_name, email, password, crm, uf, specialty)
DOCTORS_DATA = [
    ("Dra. Marília Santos",  "dr.marilia@demo",  "12345",          "123456", "SP", "Psiquiatria geral"),
    ("Dr. Rafael Oliveira",  "dr.rafael@demo",   "Doctor@1234567", "234567", "SP", "Psiquiatria - transtornos do humor"),
    ("Dra. Helena Costa",    "dra.helena@demo",  "Doctor@1234567", "345678", "SP", "Psiquiatria infantojuvenil"),
]

# Observações clínicas variadas (texto plano para FTS + HTML idêntico)
SESSION_NOTES = [
    "Paciente comparece pontualmente. Refere melhora do quadro de ansiedade após início da sertralina. Sono mais regular nas últimas duas semanas. Mantém medicação na mesma posologia. Retorno em 30 dias.",
    "Humor levemente deprimido. Refere conflito conjugal recente, com piora do sono. Mantém ISRS. Discutidas estratégias de higiene do sono. Encaminhada para psicoterapia complementar.",
    "Quadro de pânico em remissão parcial. Reduzida frequência de crises (de 3x/sem para 1x/quinzena). Paciente relata efeito colateral leve (boca seca). Mantida conduta.",
    "Avaliação inicial. Queixa principal: insônia há 6 meses, irritabilidade e queda de rendimento profissional. Hipótese diagnóstica: episódio depressivo moderado. Iniciado ISRS. Solicitados exames laboratoriais.",
    "Retorno após 30 dias. Refere boa adesão ao tratamento. Negou ideação suicida ou efeitos colaterais relevantes. Aumentada dose para 100mg/dia.",
    "Paciente relata episódios de ansiedade antecipatória relacionados ao trabalho. Discussão sobre técnicas de mindfulness. Mantida conduta. Próximo retorno em 21 dias.",
    "Sessão focada em manejo de luto recente (perda do pai há 2 meses). Paciente colaborativa, com bom insight. Sem indicação de ajuste medicamentoso. Encaminhada para grupo de luto.",
    "Avaliação para TDAH adulto. Questionários ASRS aplicados. Pontuação compatível. Solicitada avaliação neuropsicológica antes de iniciar metilfenidato.",
    "Acompanhamento de transtorno bipolar tipo II. Paciente em eutimia há 4 meses. Mantém lítio 600mg/dia. Litemia dentro do alvo terapêutico. Retorno em 60 dias.",
    "Paciente refere ganho de peso (5kg em 3 meses) com olanzapina. Discutida troca para alternativa com menor impacto metabólico. Solicitados exames.",
]


# ─────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────
def ensure_user(db, email: str, full_name: str, password: str, role: str, company_id: int | None) -> User:
    u = db.scalar(select(User).where(User.email == email))
    if u:
        return u
    u = User(
        email=email,
        full_name=full_name,
        password_hash=sec.hash_password(password),
        role=role,
        company_id=company_id,
    )
    db.add(u)
    db.flush()
    return u


def ensure_doctor(db, *, user: User, clinic_id: int, full_name: str, crm: str, uf: str, specialty: str) -> Doctor:
    d = db.scalar(select(Doctor).where(Doctor.user_id == user.id))
    if d:
        return d
    d = Doctor(
        user_id=user.id,
        cpf=crypto.hmac_cpf(_fake_doctor_cpf(crm)),
        full_name=full_name,
        crm=crm,
        crm_uf=uf,
        specialty=specialty,
    )
    db.add(d)
    db.flush()
    db.add(DoctorClinic(doctor_id=d.id, company_id=clinic_id))
    db.flush()
    return d


def _fake_doctor_cpf(crm: str) -> str:
    """CPF placeholder único por CRM — usa apenas o hash, não precisa ser válido para o repo."""
    return f"{int(crm):011d}"


def main() -> None:
    with db_session() as db:
        # ── Plano ──
        plan = db.scalar(select(Plan).where(Plan.name == "Standard"))
        if not plan:
            plan = Plan(name="Standard", max_doctors=10, max_patients=500, price_cents=49900)
            db.add(plan)
            db.flush()

        # ── Super-admin ──
        super_admin = ensure_user(
            db, "super@psiclinic.local", "Super Admin", "Super@1234567",
            UserRole.SUPER_ADMIN.value, company_id=None,
        )
        set_tenant_context(db, tenant_id=None, user_id=super_admin.id, user_role="super_admin")

        # ── Clínica ──
        clinic = db.scalar(select(Company).where(Company.cnpj == "00000000000191"))
        if not clinic:
            clinic = Company(
                name="Clínica Demo Psiquiatria Ltda",
                trade_name="Clínica Demo",
                cnpj="00000000000191",
                email="contato@demo.local",
                phone="11999999999",
                address="Av. Paulista, 1000",
                city="São Paulo",
                state="SP",
                zip_code="01310100",
                technical_responsible_name="Dra. Marília Santos",
                technical_responsible_crm="123456",
                technical_responsible_uf="SP",
                plan_id=plan.id,
            )
            db.add(clinic)
            db.flush()

        # ── Clinic-admin ──
        admin = ensure_user(
            db, "admin@demo.local", "Admin Demo", "Admin@1234567",
            UserRole.CLINIC_ADMIN.value, company_id=clinic.id,
        )

        # ── Recepção ──
        receptionist = ensure_user(
            db, "recepcao@demo.local", "Camila Recepção", "Recep@1234567",
            UserRole.RECEPTIONIST.value, company_id=clinic.id,
        )

        # ── Médicos ──
        doctors: list[Doctor] = []
        for full_name, email, password, crm, uf, specialty in DOCTORS_DATA:
            duser = ensure_user(db, email, full_name, password, UserRole.DOCTOR.value, company_id=clinic.id)
            d = ensure_doctor(
                db, user=duser, clinic_id=clinic.id,
                full_name=full_name, crm=crm, uf=uf, specialty=specialty,
            )
            doctors.append(d)
        db.flush()

        # ── Pacientes ──
        # Trocar contexto para a clínica (RLS) usando o admin
        set_tenant_context(db, tenant_id=clinic.id, user_id=admin.id, user_role="clinic_admin")

        existing_count = db.scalar(
            select(__import__("sqlalchemy").func.count(Patient.id)).where(Patient.company_id == clinic.id)
        ) or 0

        if existing_count >= len(PATIENTS_DATA):
            print(f"[seed] {existing_count} pacientes já existentes — pulando criação.")
            print_logins()
            return

        created_patients: list[Patient] = []
        now = datetime.now(timezone.utc)

        for idx, p in enumerate(PATIENTS_DATA):
            (cpf, name, (yy, mm, dd), gender, mother, father, profession,
             addr, phone, email, civil, religion, skin) = p

            cpf_hash = crypto.hmac_cpf(cpf)
            already = db.scalar(
                select(Patient).where(Patient.cpf_hash == cpf_hash, Patient.company_id == clinic.id)
            )
            if already:
                created_patients.append(already)
                continue

            # Ajusta uns aniversariantes para o mês corrente (visual no dashboard)
            if idx in (1, 5, 9, 14, 18):
                # Coloca aniversário no mês atual em diferentes dias
                today = date.today()
                bd = date(yy, today.month, max(1, min(28, (idx * 3 + 7) % 28 or 1)))
            else:
                bd = date(yy, mm, dd)

            primary_doctor = doctors[idx % len(doctors)]

            patient = patient_repo.create_patient(
                db,
                company_id=clinic.id,
                payload={
                    "full_name": name,
                    "cpf": cpf,
                    "birth_date": bd,
                    "gender": gender,
                    "mother_name": mother,
                    "father_name": father,
                    "address": addr,
                    "phone": phone,
                    "email": email,
                    "naturalidade": "São Paulo",
                    "procedencia": "São Paulo",
                    "profession": profession,
                    "marital_status": civil,
                    "religion": religion,
                    "skin_color": skin,
                },
                creator_user_id=admin.id,
                primary_doctor_id=primary_doctor.id,
            )

            # Marca alguns como inativos / alta pra o gráfico de status
            if idx in (10,):
                patient.status = PatientStatus.INACTIVE.value
            elif idx in (17,):
                patient.status = PatientStatus.DISCHARGED.value
                patient.discharged_at = now - timedelta(days=20)

            db.flush()
            created_patients.append(patient)

        # ── Anamnese e Sessões ──
        # Cada paciente ativo: 1 anamnese + 4-8 sessões
        for idx, patient in enumerate(created_patients):
            if patient.status != PatientStatus.ACTIVE.value:
                continue

            primary_doctor = doctors[idx % len(doctors)]
            doc_user_id = primary_doctor.user_id

            set_tenant_context(db, tenant_id=clinic.id, user_id=doc_user_id, user_role="doctor")

            # ── Anamnese v1 ──
            existing_anamnesis = patient.anamnesis is not None
            if not existing_anamnesis:
                header = anamnesis_repo.get_or_create_header(
                    db, patient_id=patient.id, company_id=clinic.id, created_by=doc_user_id
                )
                cid_options = ["F32.1", "F41.1", "F33.1", "F31.81", "F90.0", "F43.2"]
                cid = random.choice(cid_options)
                anamnesis_repo.create_version(
                    db,
                    header=header,
                    payload={
                        "identification": {"full_name": "(cifrado)", "age": (date.today().year - patient.birth_date.year)},
                        "hda": random.choice(SESSION_NOTES),
                        "family_history": "Avalição familiar disponível em prontuário detalhado.",
                        "diagnostic_hypothesis": {
                            "F32.1": "Episódio depressivo moderado",
                            "F41.1": "Transtorno de ansiedade generalizada",
                            "F33.1": "Transtorno depressivo recorrente, episódio atual moderado",
                            "F31.81": "Transtorno bipolar tipo II",
                            "F90.0": "TDAH",
                            "F43.2": "Transtorno de ajustamento",
                        }[cid],
                        "cid10_codes": [cid],
                        "conduct": {
                            "notes": "Acompanhamento mensal. Higiene do sono. Considerar psicoterapia.",
                            "prescription_items": [
                                {"drug": "Sertralina", "dose": "50mg", "route": "VO",
                                 "frequency": "1x/dia pela manhã", "duration_days": 30}
                            ],
                        },
                    },
                    created_by=doc_user_id,
                )

            # ── Sessões ──
            # Distribuição:
            #   - 4-7 sessões no passado, espalhadas entre -1d e -28d
            #     (o dashboard mostra os últimos 14 dias, então metade cai
            #      dentro dessa janela e o restante alimenta as agregações
            #      mensais e a distribuição semanal)
            #   - 1 ocasionalmente cancelada/no-show
            #   - 2-3 agendadas no futuro (+1d a +30d)
            past_count = random.randint(4, 7)
            future_count = random.randint(2, 4)

            # Pré-sorteia offsets únicos no passado (sem repetir o mesmo dia)
            past_offsets = random.sample(range(1, 28), past_count)

            for day_offset_raw in past_offsets:
                day_offset = -day_offset_raw
                hour = random.choice([8, 9, 10, 11, 14, 15, 16, 17])
                minute = random.choice([0, 30])
                scheduled = (now + timedelta(days=day_offset)).replace(
                    hour=hour, minute=minute, second=0, microsecond=0
                )

                # 10% das sessões viram no_show, 5% cancelled
                roll = random.random()
                if roll < 0.05:
                    status = SessionStatus.CANCELLED
                elif roll < 0.15:
                    status = SessionStatus.NO_SHOW
                else:
                    status = SessionStatus.COMPLETED

                s = session_repo.create_session(
                    db,
                    company_id=clinic.id,
                    patient_id=patient.id,
                    doctor_id=primary_doctor.id,
                    scheduled_at=scheduled,
                    status=status,
                )

                if status == SessionStatus.COMPLETED:
                    note = random.choice(SESSION_NOTES)
                    session_repo.update_observations(
                        db, session=s,
                        html=f"<p>{note}</p>",
                        plain=note,
                    )

            for k in range(future_count):
                # Espalha entre +1 e +30 dias; pelo menos uma em "hoje" para o admin/recepcionista
                if k == 0 and idx < 6:
                    day_offset = 0  # algumas sessões hoje (visual rico no dashboard)
                else:
                    day_offset = random.randint(1, 30)
                hour = random.choice([8, 9, 10, 11, 14, 15, 16, 17])
                minute = random.choice([0, 30])
                scheduled = (now + timedelta(days=day_offset)).replace(
                    hour=hour, minute=minute, second=0, microsecond=0
                )
                session_repo.create_session(
                    db,
                    company_id=clinic.id,
                    patient_id=patient.id,
                    doctor_id=primary_doctor.id,
                    scheduled_at=scheduled,
                    status=SessionStatus.SCHEDULED,
                )

        # Volta o contexto para o admin para encerrar limpinho
        set_tenant_context(db, tenant_id=clinic.id, user_id=admin.id, user_role="clinic_admin")

        print(f"[seed] OK. {len(created_patients)} pacientes, {len(doctors)} médicos.")
        print_logins()


def print_logins() -> None:
    print("[seed] Logins disponíveis:")
    print("  super-admin   super@psiclinic.local  / Super@1234567")
    print("  clinic-admin  admin@demo.local       / Admin@1234567")
    print("  recepção      recepcao@demo.local    / Recep@1234567")
    print("  médica        dr.marilia@demo        / 12345  (preferida)")
    print("  médico        dr.rafael@demo         / Doctor@1234567")
    print("  médica inf.   dra.helena@demo        / Doctor@1234567")


if __name__ == "__main__":
    main()
