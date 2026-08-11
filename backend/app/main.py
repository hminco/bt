from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import health, seminars
from app.config import get_settings


settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

app.include_router(health.router, prefix=settings.api_prefix)
app.include_router(seminars.router, prefix=settings.api_prefix)
