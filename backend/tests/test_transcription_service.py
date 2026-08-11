from pathlib import Path
from types import SimpleNamespace

import pytest

from app.services.transcription_service import (
    AudioArtifactNotFoundError,
    TranscriptNotFoundError,
    TranscriptionService,
)


def make_service(runtime_dir: Path) -> TranscriptionService:
    return TranscriptionService(
        runtime_dir=runtime_dir,
        api_key="test-key",
        model="whisper-1",
        language="ko",
        system_ca_bundle=Path("/etc/ssl/certs/ca-certificates.crt"),
    )


def test_rejects_invalid_video_id(tmp_path: Path) -> None:
    service = make_service(tmp_path)

    with pytest.raises(AudioArtifactNotFoundError, match="유효하지 않은"):
        service._resolve_audio_path("../unsafe")


def test_requires_downloaded_audio(tmp_path: Path) -> None:
    service = make_service(tmp_path)

    with pytest.raises(AudioArtifactNotFoundError, match="먼저 audio"):
        service._resolve_audio_path("YsFmWWHc6Yc")


def test_builds_timestamp_transcript_and_preserves_korean(tmp_path: Path) -> None:
    service = make_service(tmp_path)
    response = SimpleNamespace(
        text="고혈압 치료 기준을 설명합니다.",
        language="ko",
        duration=12.5,
        segments=[
            SimpleNamespace(start=0.0, end=6.2, text=" 고혈압 치료 기준 "),
            SimpleNamespace(start=6.2, end=12.5, text="용량을 확인합니다."),
        ],
    )

    result = service._build_result("YsFmWWHc6Yc", response)

    assert result.duration_seconds == 12.5
    assert result.transcript[0].id == "tr_0001"
    assert result.transcript[0].text == "고혈압 치료 기준"
    assert result.transcript[1].start == 6.2


def test_reads_saved_transcript_without_api_call(tmp_path: Path) -> None:
    service = make_service(tmp_path)
    response = SimpleNamespace(
        text="저장된 전사 결과입니다.",
        language="ko",
        duration=3.0,
        segments=[SimpleNamespace(start=0.0, end=3.0, text="저장된 전사 결과입니다.")],
    )
    service._save_result(service._build_result("YsFmWWHc6Yc", response))

    result = service.transcribe("YsFmWWHc6Yc")

    assert result.cached is True
    assert result.text == "저장된 전사 결과입니다."


def test_force_bypasses_saved_transcript(tmp_path: Path) -> None:
    service = make_service(tmp_path)
    response = SimpleNamespace(
        text="기존 결과",
        language="ko",
        duration=1.0,
        segments=[SimpleNamespace(start=0.0, end=1.0, text="기존 결과")],
    )
    service._save_result(service._build_result("YsFmWWHc6Yc", response))

    with pytest.raises(AudioArtifactNotFoundError, match="먼저 audio"):
        service.transcribe("YsFmWWHc6Yc", force=True)


def test_reports_missing_saved_transcript(tmp_path: Path) -> None:
    service = make_service(tmp_path)

    with pytest.raises(TranscriptNotFoundError, match="저장된 transcript"):
        service.get_transcript("YsFmWWHc6Yc")
