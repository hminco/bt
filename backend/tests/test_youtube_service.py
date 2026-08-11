import pytest

from app.services.youtube_service import YouTubeService, YouTubeServiceError


@pytest.mark.parametrize(
    ("source_url", "expected"),
    [
        ("https://www.youtube.com/watch?v=YsFmWWHc6Yc", "YsFmWWHc6Yc"),
        ("https://youtu.be/YsFmWWHc6Yc", "YsFmWWHc6Yc"),
    ],
)
def test_validate_url_accepts_youtube_urls(source_url: str, expected: str) -> None:
    assert YouTubeService.validate_url(source_url) == expected


@pytest.mark.parametrize(
    "source_url",
    [
        "https://example.com/watch?v=YsFmWWHc6Yc",
        "file:///etc/passwd",
        "https://www.youtube.com/watch",
    ],
)
def test_validate_url_rejects_unsupported_urls(source_url: str) -> None:
    with pytest.raises(YouTubeServiceError):
        YouTubeService.validate_url(source_url)
