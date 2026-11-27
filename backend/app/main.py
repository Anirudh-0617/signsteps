"""SignSteps lesson API. Routes only; logic lives in generator.py / validator.py.

Run:  uvicorn app.main:app --reload --port 8000
Docs: http://localhost:8000/docs
"""

import logging
from functools import lru_cache

from fastapi import Depends, FastAPI

from .config import get_settings
from .generator import LessonModel, create_lesson, gemini_model
from .schemas import Lesson, LessonRequest

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

app = FastAPI(
    title="SignSteps lesson API",
    description=(
        "Generates short fingerspelling lessons for Deaf and hard-of-hearing children. "
        "Every AI draft is checked by deterministic rules; if it fails twice, or the AI is "
        "unavailable, a reviewed built-in list is returned instead. The response always says "
        "which (`source`)."
    ),
    version="0.1.0",
)


@lru_cache
def _model() -> LessonModel | None:
    settings = get_settings()
    return gemini_model(settings) if settings.gemini_api_key else None


def get_model() -> LessonModel | None:
    return _model()


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "ai_configured": get_settings().gemini_api_key is not None}


@app.post("/lessons/generate", response_model=Lesson)
def generate(req: LessonRequest, model: LessonModel | None = Depends(get_model)) -> Lesson:
    """Always returns a usable lesson (AI or fallback). Invalid input gets 422."""
    return create_lesson(req, model, retries=get_settings().retries)
