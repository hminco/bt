# Medical Seminar AI Lab Backend

정적 frontend와 분리된 FastAPI prototype server다. YouTube URL 검증, metadata 조회, audio-only 파일 준비, timestamp transcript 생성을 담당한다.

## 로컬 실행 준비

Ubuntu에서 시스템 패키지를 설치한다.

```bash
sudo apt-get update
sudo apt-get install -y python3-pip python3.12-venv ffmpeg
```

backend 가상환경과 Python dependency를 설치한다.

```bash
cd ~/bt/backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e '.[dev]'
cp .env.example .env
```

`backend/.env`의 `OPENAI_API_KEY`에 로컬 키를 입력한다. 실제 `.env`는 Git에 포함하지 않는다.

## 서버 실행

```bash
cd ~/bt/backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

- Health: `http://127.0.0.1:8001/api/health`
- OpenAPI: `http://127.0.0.1:8001/docs`

전사 API는 먼저 오디오를 준비한 뒤 호출한다.

```bash
curl -X POST http://127.0.0.1:8001/api/seminars/YsFmWWHc6Yc/transcribe \
  -H 'Content-Type: application/json' \
  -d '{}'
```

저장된 결과가 있으면 OpenAI를 다시 호출하지 않고 `cached: true`로 반환한다. 저장 결과만 조회할 때는 다음 API를 사용한다.

```bash
curl http://127.0.0.1:8001/api/seminars/YsFmWWHc6Yc/transcript
```

명시적으로 재전사할 때만 `force`를 사용한다.

```bash
curl -X POST http://127.0.0.1:8001/api/seminars/YsFmWWHc6Yc/transcribe \
  -H 'Content-Type: application/json' \
  -d '{"force": true}'
```

콘텐츠 소유권 또는 처리 권한이 있는 YouTube 영상만 사용한다. 다운로드 파일은 `backend/data/downloads/`에 저장되며 Git에서 제외된다.
