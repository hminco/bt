from __future__ import annotations

from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from app.schemas.seminar import AudioArtifact, SeminarMetadata


ALLOWED_YOUTUBE_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be",
}


class YouTubeServiceError(RuntimeError):
    """사용자에게 안전하게 전달할 수 있는 YouTube 처리 오류."""


class YouTubeService:
    def __init__(self, runtime_dir: Path) -> None:
        self.runtime_dir = runtime_dir.resolve()
        self.download_dir = self.runtime_dir / "downloads"

    @staticmethod
    def validate_url(source_url: str) -> str:
        parsed = urlparse(source_url.strip())
        host = (parsed.hostname or "").lower()
        if parsed.scheme not in {"http", "https"} or host not in ALLOWED_YOUTUBE_HOSTS:
            raise YouTubeServiceError("지원되는 YouTube URL을 입력해 주세요.")

        if host == "youtu.be":
            video_id = parsed.path.strip("/").split("/")[0]
        else:
            video_id = parse_qs(parsed.query).get("v", [""])[0]

        if not video_id or len(video_id) > 32 or not all(char.isalnum() or char in "_-" for char in video_id):
            raise YouTubeServiceError("YouTube video ID를 확인할 수 없습니다.")
        return video_id

    def get_metadata(self, source_url: str) -> SeminarMetadata:
        expected_video_id = self.validate_url(source_url)
        info = self._extract_info(source_url, download=False)
        actual_video_id = str(info.get("id") or "")
        if actual_video_id != expected_video_id:
            raise YouTubeServiceError("요청한 영상과 조회된 metadata가 일치하지 않습니다.")

        return SeminarMetadata(
            id=actual_video_id,
            sourceUrl=str(info.get("webpage_url") or source_url),
            title=str(info.get("title") or "제목 없음"),
            speaker=info.get("uploader") or info.get("channel"),
            specialty=None,
            durationSeconds=self._to_int(info.get("duration")),
            language=info.get("language"),
            seminarDate=self._format_upload_date(info.get("upload_date")),
            thumbnailUrl=info.get("thumbnail"),
        )

    def download_audio(self, source_url: str) -> AudioArtifact:
        video_id = self.validate_url(source_url)
        self.download_dir.mkdir(parents=True, exist_ok=True)
        output_template = str(self.download_dir / f"{video_id}.%(ext)s")
        options = {
            "format": "bestaudio/best",
            "noplaylist": True,
            "outtmpl": output_template,
            "restrictfilenames": True,
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "64",
                }
            ],
            "quiet": True,
            "no_warnings": True,
        }
        self._extract_info(source_url, download=True, options=options)

        audio_path = (self.download_dir / f"{video_id}.mp3").resolve()
        if audio_path.parent != self.download_dir or not audio_path.is_file():
            raise YouTubeServiceError("오디오 파일 생성 결과를 확인할 수 없습니다.")

        return AudioArtifact(
            seminarId=video_id,
            fileName=audio_path.name,
            relativePath=f"downloads/{audio_path.name}",
            mediaType="audio/mpeg",
            sizeBytes=audio_path.stat().st_size,
        )

    @staticmethod
    def _extract_info(source_url: str, download: bool, options: dict | None = None) -> dict:
        try:
            import yt_dlp

            downloader_options = {
                "quiet": True,
                "no_warnings": True,
                "noplaylist": True,
                "compat_opts": ["no-certifi"],
            }
            downloader_options.update(options or {})
            with yt_dlp.YoutubeDL(downloader_options) as downloader:
                info = downloader.extract_info(source_url, download=download)
        except ImportError as error:
            raise YouTubeServiceError("yt-dlp가 설치되지 않았습니다.") from error
        except Exception as error:
            raise YouTubeServiceError(f"YouTube 처리에 실패했습니다: {error}") from error

        if not isinstance(info, dict):
            raise YouTubeServiceError("YouTube 응답 형식을 확인할 수 없습니다.")
        return info

    @staticmethod
    def _format_upload_date(value: object) -> str | None:
        if not isinstance(value, str) or len(value) != 8:
            return None
        try:
            return datetime.strptime(value, "%Y%m%d").date().isoformat()
        except ValueError:
            return None

    @staticmethod
    def _to_int(value: object) -> int | None:
        try:
            return int(value) if value is not None else None
        except (TypeError, ValueError):
            return None
