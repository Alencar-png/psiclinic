"""Schemas reutilizáveis: paginação, erros."""
from __future__ import annotations

from typing import Generic, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int = Field(ge=1)
    size: int = Field(ge=1, le=100)


class ErrorResponse(BaseModel):
    detail: str
    code: str | None = None
