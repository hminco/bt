from importlib.util import find_spec
from shutil import which

from fastapi import APIRouter

from app.config import get_settings


router = APIRouter(tags=["system"])


@router.get("/health")
async def health_check() -> dict:
    settings = get_settings()
    return {
        "status": "ok",
        "service": settings.app_name,
        "dependencies": {
            "ffmpeg": which("ffmpeg") is not None,
            "ffprobe": which("ffprobe") is not None,
            "ytDlp": find_spec("yt_dlp") is not None,
            "openaiKeyConfigured": bool(settings.openai_api_key),
        },
    }
