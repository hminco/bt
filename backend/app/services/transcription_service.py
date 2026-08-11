import json
import re
import ssl
from pathlib import Path
from typing import Any

import httpx
from openai import APIConnectionError, APIStatusError, APITimeoutError, AuthenticationError, OpenAI
from pydantic import ValidationError

from app.schemas.seminar import TranscriptResult, TranscriptSegment


MAX_AUDIO_BYTES = 25 * 1024 * 1024
YOUTUBE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{11}$")


class TranscriptionServiceError(RuntimeError):
    pass


class AudioArtifactNotFoundError(TranscriptionServiceError):
    pass


class TranscriptNotFoundError(TranscriptionServiceError):
    pass


class TranscriptionService:
    def __init__(
        self,
        runtime_dir: Path,
        api_key: str | None,
        model: str,
        language: str,
        system_ca_bundle: Path,
    ) -> None:
        self.runtime_dir = runtime_dir.resolve()
        self.api_key = api_key
        self.model = model
        self.language = language
        self.system_ca_bundle = system_ca_bundle

    def transcribe(
        self,
        seminar_id: str,
        prompt: str | None = None,
        force: bool = False,
    ) -> TranscriptResult:
        if not force:
            try:
                return self.get_transcript(seminar_id)
            except TranscriptNotFoundError:
                pass

        audio_path = self._resolve_audio_path(seminar_id)
        if not self.api_key:
            raise TranscriptionServiceError("OPENAI_API_KEY가 설정되지 않았습니다.")

        if audio_path.stat().st_size > MAX_AUDIO_BYTES:
            raise TranscriptionServiceError(
                "오디오 파일이 OpenAI 전사 API의 25MB 제한을 초과했습니다."
            )

        ssl_context = self._create_ssl_context()
        try:
            with httpx.Client(
                verify=ssl_context,
                timeout=httpx.Timeout(300.0, connect=30.0),
            ) as http_client:
                client = OpenAI(api_key=self.api_key, http_client=http_client)
                with audio_path.open("rb") as audio_file:
                    response = client.audio.transcriptions.create(
                        file=audio_file,
                        model=self.model,
                        response_format="verbose_json",
                        timestamp_granularities=["segment"],
                        language=self.language,
                        prompt=prompt,
                    )
        except AuthenticationError as error:
            raise TranscriptionServiceError("OpenAI API key 인증에 실패했습니다.") from error
        except APITimeoutError as error:
            raise TranscriptionServiceError("OpenAI 전사 요청 시간이 초과되었습니다.") from error
        except APIConnectionError as error:
            raise TranscriptionServiceError("OpenAI 전사 API에 연결하지 못했습니다.") from error
        except APIStatusError as error:
            raise TranscriptionServiceError(
                f"OpenAI 전사 API가 오류 상태 {error.status_code}를 반환했습니다."
            ) from error

        result = self._build_result(seminar_id, response)
        self._save_result(result)
        return result

    def get_transcript(self, seminar_id: str) -> TranscriptResult:
        transcript_path = self._resolve_transcript_path(seminar_id)
        if not transcript_path.is_file():
            raise TranscriptNotFoundError("저장된 transcript가 없습니다.")

        try:
            payload = json.loads(transcript_path.read_text(encoding="utf-8"))
            result = TranscriptResult.model_validate(payload)
        except (OSError, json.JSONDecodeError, ValidationError) as error:
            raise TranscriptionServiceError("저장된 transcript JSON을 읽을 수 없습니다.") from error

        result.cached = True
        return result

    def _resolve_audio_path(self, seminar_id: str) -> Path:
        if not YOUTUBE_ID_PATTERN.fullmatch(seminar_id):
            raise AudioArtifactNotFoundError("유효하지 않은 YouTube video ID입니다.")

        downloads_dir = (self.runtime_dir / "downloads").resolve()
        audio_path = (downloads_dir / f"{seminar_id}.mp3").resolve()
        if audio_path.parent != downloads_dir or not audio_path.is_file():
            raise AudioArtifactNotFoundError(
                "전사할 오디오가 없습니다. 먼저 audio 단계를 실행해 주세요."
            )
        return audio_path

    def _resolve_transcript_path(self, seminar_id: str) -> Path:
        if not YOUTUBE_ID_PATTERN.fullmatch(seminar_id):
            raise TranscriptNotFoundError("유효하지 않은 YouTube video ID입니다.")

        transcripts_dir = (self.runtime_dir / "transcripts").resolve()
        transcript_path = (transcripts_dir / f"{seminar_id}.json").resolve()
        if transcript_path.parent != transcripts_dir:
            raise TranscriptNotFoundError("유효하지 않은 transcript 경로입니다.")
        return transcript_path

    def _create_ssl_context(self) -> ssl.SSLContext:
        if self.system_ca_bundle.is_file():
            return ssl.create_default_context(cafile=str(self.system_ca_bundle))
        return ssl.create_default_context()

    def _build_result(self, seminar_id: str, response: Any) -> TranscriptResult:
        segments: list[TranscriptSegment] = []
        for index, segment in enumerate(getattr(response, "segments", None) or [], start=1):
            segments.append(
                TranscriptSegment(
                    id=f"tr_{index:04d}",
                    start=float(getattr(segment, "start", 0.0)),
                    end=float(getattr(segment, "end", 0.0)),
                    text=str(getattr(segment, "text", "")).strip(),
                )
            )

        response_duration = getattr(response, "duration", None)
        duration = float(response_duration) if response_duration is not None else 0.0
        if not duration and segments:
            duration = segments[-1].end

        return TranscriptResult(
            seminarId=seminar_id,
            model=self.model,
            language=str(getattr(response, "language", None) or self.language),
            durationSeconds=duration,
            text=str(getattr(response, "text", "")).strip(),
            transcript=segments,
            relativePath=f"transcripts/{seminar_id}.json",
        )

    def _save_result(self, result: TranscriptResult) -> None:
        transcripts_dir = (self.runtime_dir / "transcripts").resolve()
        transcripts_dir.mkdir(parents=True, exist_ok=True)
        output_path = transcripts_dir / f"{result.seminar_id}.json"
        temporary_path = transcripts_dir / f".{result.seminar_id}.json.tmp"
        temporary_path.write_text(
            json.dumps(result.model_dump(by_alias=True), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        temporary_path.replace(output_path)
