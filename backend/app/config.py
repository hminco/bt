from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    app_name: str = "Medical Seminar AI Lab API"
    api_prefix: str = "/api"
    frontend_origins: str = "http://localhost:8000,http://127.0.0.1:8000"
    runtime_dir: Path = BACKEND_DIR / "data"
    openai_api_key: str | None = None
    transcription_model: str = "whisper-1"
    transcription_language: str = "ko"
    transcription_prompt: str = (
        "한국어 의료 세미나, 임상 증례, 진단, 치료, 약물명, 용량, 수치, 가이드라인"
    )
    system_ca_bundle: Path = Path("/etc/ssl/certs/ca-certificates.crt")

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
