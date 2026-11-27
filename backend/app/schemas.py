"""Pydantic models for the API and for the LLM's structured output.

The LLM schema is deliberately flat and small (words + story). Gemini fills it
via `response_schema`, and Pydantic parses it. Everything the model returns is
still checked by validator.py before a teacher ever sees it.
"""

from typing import Literal

from pydantic import BaseModel, Field

Theme = Literal["Animals", "Food", "Family", "School", "Colors", "Nature", "Home", "Body"]


class LessonRequest(BaseModel):
    """Only dropdown values: no free text reaches the prompt, so no injection path."""

    theme: Theme
    level: int = Field(ge=1, le=3)
    count: int = Field(ge=5, le=8)


class LessonWord(BaseModel):
    word: str
    emoji: str
    sentence: str


class LLMLesson(BaseModel):
    """Exactly what the model must return."""

    words: list[LessonWord]
    story: list[str]


class Lesson(BaseModel):
    id: str
    theme: Theme
    level: int
    words: list[LessonWord]
    story: list[str]
    source: Literal["ai", "fallback"]
    warnings: list[str]
