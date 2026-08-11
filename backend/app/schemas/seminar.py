from pydantic import BaseModel, Field


class SeminarRequest(BaseModel):
    source_url: str = Field(alias="sourceUrl", min_length=1, max_length=500)


class SeminarMetadata(BaseModel):
    id: str
    source: str = "youtube"
    source_url: str = Field(alias="sourceUrl")
    title: str
    speaker: str | None = None
    specialty: str | None = None
    duration_seconds: int | None = Field(default=None, alias="durationSeconds")
    language: str | None = None
    seminar_date: str | None = Field(default=None, alias="seminarDate")
    thumbnail_url: str | None = Field(default=None, alias="thumbnailUrl")

    model_config = {"populate_by_name": True}


class AudioArtifact(BaseModel):
    seminar_id: str = Field(alias="seminarId")
    file_name: str = Field(alias="fileName")
    relative_path: str = Field(alias="relativePath")
    media_type: str = Field(alias="mediaType")
    size_bytes: int = Field(alias="sizeBytes")

    model_config = {"populate_by_name": True}


class TranscriptionRequest(BaseModel):
    prompt: str | None = Field(default=None, max_length=1000)
    force: bool = False


class TranscriptSegment(BaseModel):
    id: str
    start: float
    end: float
    text: str
    speaker: str = "lecturer"


class TranscriptResult(BaseModel):
    seminar_id: str = Field(alias="seminarId")
    provider: str = "openai"
    model: str
    language: str
    duration_seconds: float = Field(alias="durationSeconds")
    text: str
    transcript: list[TranscriptSegment]
    relative_path: str = Field(alias="relativePath")
    cached: bool = False

    model_config = {"populate_by_name": True}
