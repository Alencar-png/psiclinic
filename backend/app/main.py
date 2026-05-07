"""Entrada FastAPI — PsiClinic API."""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config.settings import get_settings
from app.routers import (
    anamnesis,
    auth,
    catalog,
    companies,
    dashboard,
    doctors,
    patients,
    sessions as sessions_router,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

settings = get_settings()

app = FastAPI(
    title=f"{settings.app_name} — Sistema multi-tenant para clínicas psiquiátricas",
    version="0.1.0",
    docs_url=f"{settings.api_prefix}/docs",
    redoc_url=f"{settings.api_prefix}/redoc",
    openapi_url=f"{settings.api_prefix}/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-Id"],
)

# Routers
prefix = settings.api_prefix
app.include_router(auth.router, prefix=prefix)
app.include_router(companies.router, prefix=prefix)
app.include_router(doctors.router, prefix=prefix)
app.include_router(patients.router, prefix=prefix)
app.include_router(anamnesis.router, prefix=prefix)
app.include_router(sessions_router.patients_router, prefix=prefix)
app.include_router(sessions_router.sessions_router, prefix=prefix)
app.include_router(catalog.router, prefix=prefix)
app.include_router(dashboard.router, prefix=prefix)


@app.get(f"{prefix}/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok", "app": settings.app_name, "env": settings.app_env}
