"""Contrôle de disponibilité du processus applicatif."""

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api")


class HealthStatus(BaseModel):
    status: Literal["ok"] = "ok"


@router.get("/health", response_model=HealthStatus)
async def health() -> HealthStatus:
    return HealthStatus()
