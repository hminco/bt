import asyncio

from fastapi import APIRouter, HTTPException

from app.config import get_settings
from app.schemas.seminar import (
    AudioArtifact,
    SeminarMetadata,
    SeminarRequest,
    TranscriptResult,
    TranscriptionRequest,
)
from app.services.transcription_service import (
    AudioArtifactNotFoundError,
    TranscriptNotFoundError,
    TranscriptionService,
    TranscriptionServiceError,
)
from app.services.youtube_service import YouTubeService, YouTubeServiceError


router = APIRouter(prefix="/seminars", tags=["seminars"])


def get_youtube_service() -> YouTubeService:
    return YouTubeService(get_settings().runtime_dir)


def get_transcription_service() -> TranscriptionService:
    settings = get_settings()
    return TranscriptionService(
        runtime_dir=settings.runtime_dir,
        api_key=settings.openai_api_key,
        model=settings.transcription_model,
        language=settings.transcription_language,
        system_ca_bundle=settings.system_ca_bundle,
    )


@router.post("/ingest", response_model=SeminarMetadata, response_model_by_alias=True)
async def ingest_seminar(payload: SeminarRequest) -> SeminarMetadata:
    try:
        return await asyncio.to_thread(get_youtube_service().get_metadata, payload.source_url)
    except YouTubeServiceError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post("/audio", response_model=AudioArtifact, response_model_by_alias=True)
async def prepare_audio(payload: SeminarRequest) -> AudioArtifact:
    try:
        return await asyncio.to_thread(get_youtube_service().download_audio, payload.source_url)
    except YouTubeServiceError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post(
    "/{seminar_id}/transcribe",
    response_model=TranscriptResult,
    response_model_by_alias=True,
)
async def transcribe_seminar(
    seminar_id: str,
    payload: TranscriptionRequest,
) -> TranscriptResult:
    settings = get_settings()
    prompt = payload.prompt or settings.transcription_prompt
    service = get_transcription_service()
    try:
        if not payload.force:
            try:
                return service.get_transcript(seminar_id)
            except TranscriptNotFoundError:
                pass

        return await asyncio.to_thread(
            service.transcribe,
            seminar_id,
            prompt,
            True,
        )
    except AudioArtifactNotFoundError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except TranscriptionServiceError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@router.get(
    "/{seminar_id}/transcript",
    response_model=TranscriptResult,
    response_model_by_alias=True,
)
async def get_seminar_transcript(seminar_id: str) -> TranscriptResult:
    try:
        return get_transcription_service().get_transcript(seminar_id)
    except TranscriptNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except TranscriptionServiceError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
