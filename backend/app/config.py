"""Settings read from the environment (backend/.env). Never hard-code the key."""

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    gemini_api_key: str | None
    # Check https://ai.google.dev/gemini-api/docs/models for the current
    # free-tier Flash model name and set GEMINI_MODEL in .env if this alias fails.
    gemini_model: str
    timeout_s: float
    retries: int
    temperature: float


def get_settings() -> Settings:
    return Settings(
        gemini_api_key=os.getenv("GEMINI_API_KEY") or None,
        gemini_model=os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite"),
        timeout_s=float(os.getenv("GEMINI_TIMEOUT_S", "20")),
        retries=int(os.getenv("GEMINI_RETRIES", "2")),
        temperature=float(os.getenv("GEMINI_TEMPERATURE", "0.3")),
    )
