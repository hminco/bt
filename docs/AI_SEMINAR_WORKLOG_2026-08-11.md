# 의료 세미나 AI Lab 기획 및 작업 기록

작성일: 2026년 8월 11일

## 프로젝트를 시작한 이유

의료 세미나는 한 편의 길이가 길고, 실제 진료에 참고할 만한 내용이 영상 여러 구간에 흩어져 있다. 필요한 내용을 다시 찾으려면 영상을 처음부터 확인해야 하고, 요약문만으로는 그 내용이 강연의 어느 시점에서 나왔는지 검증하기 어렵다.

Medical Seminar AI Lab은 이 문제를 해결할 수 있는지 단계별로 실험하기 위해 기획했다. 최종적으로는 긴 의료 세미나를 짧은 Clinical Brief로 정리하되, 요약된 주장마다 원본 음성이나 슬라이드의 시간을 연결하여 사람이 다시 확인할 수 있도록 만드는 것이 목표다.

처음부터 완성된 AI 서비스를 만드는 대신 각 처리 단계를 따로 실행하고 결과 JSON을 살펴볼 수 있는 내부 실험 도구로 시작했다. 결과가 잘못되었을 때 어느 단계에서 문제가 생겼는지 확인하기 쉽고, 모델이나 처리 방식을 단계별로 교체하기에도 유리하기 때문이다.

## 기획한 처리 흐름

전체 과정은 여덟 단계로 구상했다.

첫 번째 INGEST 단계에서는 YouTube URL을 입력받아 영상 제목, 발표자, 재생 시간, 언어 같은 기본 정보를 확보한다. 두 번째 TRANSCRIBE 단계에서는 영상의 오디오를 추출하고 시간 정보가 포함된 Transcript를 만든다.

세 번째 SLIDE EXTRACT 단계에서는 슬라이드 전환을 감지하고 대표 화면과 글자, 숫자, 참고문헌을 추출한다. 네 번째 ALIGN 단계에서는 Transcript와 슬라이드를 같은 시간축에 배치한다.

다섯 번째 MEDICAL FACTS 단계에서는 진료지침 권고, 약물과 용량, 수치 기준, 금기, 임상 사례, 근거 같은 의료 정보 후보를 구조화한다. 여섯 번째 IMPORTANCE SCORE 단계에서는 각 정보가 임상적으로 얼마나 중요한지, 발표자가 얼마나 강조했는지, 실제 행동으로 이어질 수 있는지를 평가한다.

일곱 번째 CLINICAL BRIEF 단계에서는 우선순위가 높은 내용을 30초 핵심 요약과 5분 분량의 구조화된 요약으로 정리한다. 마지막 VERIFY 단계에서는 생성된 문장을 원본 Transcript와 슬라이드에 다시 대조하여 근거가 충분한지 확인한다.

이 구조에서 가장 중요한 원칙은 요약 결과만 제공하지 않는 것이다. 의료 정보는 검증 가능성이 중요하므로 모든 주요 결과가 원본 timestamp로 돌아갈 수 있어야 한다.

## 화면과 기술 구조를 결정한 과정

기존 저장소는 별도의 frontend framework 없이 HTML, CSS, JavaScript로 구성된 정적 사이트였다. 기존 GA4 정의서와 주간 페이지별 리포트의 디자인과 라우팅을 유지하기 위해 새로운 framework로 교체하지 않고 `#/ai-seminar-lab` 라우트를 추가했다.

AI Lab 화면은 장식적인 서비스 화면보다 상태와 데이터를 빠르게 확인할 수 있는 내부 도구에 가깝게 설계했다. YouTube URL 입력, 세미나 정보, 여덟 단계의 실행 상태, 단계별 입력과 예상 출력, JSON Preview를 한 화면에서 확인할 수 있도록 했다. 각 단계는 `waiting`, `running`, `completed`, `error` 상태로 구분하며 앞 단계가 완료되어야 다음 단계를 실행할 수 있다.

실제 영상과 OpenAI API를 정적 페이지에서 직접 처리하면 API key가 노출된다. 이를 막기 위해 Python과 FastAPI로 별도의 backend를 구성했다. API key는 `backend/.env`에서만 읽으며 Git에 포함되지 않는다. YouTube 처리에는 yt-dlp와 ffmpeg를 사용하고, 음성 전사는 OpenAI `whisper-1`을 사용한다.

## 오늘까지 구현한 내용

처음에는 여덟 단계 전체를 mock 데이터와 client-side 상태 전환으로 실행하는 화면 골격을 만들었다. 이 단계에서 향후 backend 응답의 기준이 될 `sample-seminar.json` 구조도 함께 정의했다. Seminar, Transcript, Slides, Timeline, Medical Facts, Scored Facts, Clinical Brief, Verification 결과가 하나의 흐름으로 연결되도록 구성했다.

이후 첫 번째 실제 실험 범위를 YouTube URL에서 timestamp Transcript를 얻는 구간으로 정했다. Ubuntu 환경에 Python 가상환경, FastAPI, yt-dlp, ffmpeg, OpenAI SDK를 준비했고 metadata 조회와 audio-only 파일 추출 기능을 구현했다.

테스트 영상 `https://www.youtube.com/watch?v=YsFmWWHc6Yc`을 실제로 처리했다. 영상 metadata를 정상적으로 가져왔고 약 20분 분량의 MP3 오디오를 추출했다. 이 오디오를 OpenAI STT로 전사하여 1,215.88초 분량, 252개의 timestamp 세그먼트를 생성했다. 결과는 `backend/data/transcripts/YsFmWWHc6Yc.json`에 저장되어 있다.

같은 영상을 반복 실행할 때 다시 과금되지 않도록 저장 결과를 우선 사용하는 캐시도 추가했다. 기본 전사 요청은 기존 JSON이 있으면 `cached: true`와 함께 즉시 반환한다. 사용자가 `force: true`를 명시한 경우에만 새 전사를 실행한다. 저장 결과를 OpenAI 호출 없이 읽을 수 있는 조회 API도 별도로 만들었다.

마지막으로 이 backend를 AI Lab 화면에 연결했다. `Load Seminar`를 누르면 실제 metadata를 조회하여 INGEST 단계가 완료된다. `Run Transcribe`를 누르면 먼저 저장된 Transcript를 찾고, 없을 때만 오디오 추출과 STT를 실행한다. 결과는 화면 아래 Transcript 탭에서 시간순으로 볼 수 있고 JSON 탭에서는 backend 원본 응답을 확인할 수 있다. 각 timestamp를 누르면 YouTube의 해당 재생 시점으로 이동한다.

현재 Python 테스트는 11개가 통과하며, 저장된 252개 Transcript 구간 조회와 CORS 설정도 확인했다. JavaScript 문법, 함수 정의와 호출 관계, HTML ID 중복, CSS 구조, 한글 UTF-8 표시도 점검했다.

## 지금 사용할 수 있는 범위

현재 실제로 동작하는 범위는 다음과 같다.

YouTube URL을 입력하면 실제 metadata를 가져올 수 있다. 해당 영상의 오디오를 MP3로 추출할 수 있으며, OpenAI STT를 통해 timestamp가 포함된 Transcript를 생성하고 저장할 수 있다. 저장된 결과는 추가 과금 없이 다시 조회할 수 있고 AI Lab 화면의 Transcript와 JSON 탭에서 확인할 수 있다.

여덟 단계 중 INGEST와 TRANSCRIBE는 실제 backend에 연결되어 있다. SLIDE EXTRACT부터 VERIFY까지의 여섯 단계는 아직 mock 상태 전환과 sample JSON을 확인하는 수준이다.

로컬에서는 정적 페이지 서버와 FastAPI 서버를 함께 실행해야 한다. 정적 페이지는 8000번 포트, FastAPI는 8001번 포트를 사용한다. GitHub Pages는 정적 frontend만 제공하므로 현재의 실제 AI 처리 기능은 로컬 환경에서만 동작한다.

## 현재 한계와 주의할 점

입력 소스는 현재 YouTube URL로 제한되어 있다. 로컬 MP3나 MP4 파일, Vimeo, Google Drive, Zoom 녹화 파일은 아직 지원하지 않는다. 로그인이나 연령 확인이 필요한 YouTube 영상도 정상 처리를 보장하지 않는다.

현재 테스트 영상은 OpenAI 전사 API의 파일 크기 제한 안에 들어가지만 1시간 이상의 영상은 오디오 압축이나 구간 분할이 필요할 수 있다. 긴 영상 처리에는 작업 큐, 진행률 조회, 실패 재시도 기능도 필요하다.

자동 전사는 완벽하지 않다. 테스트 결과에서 본 강의가 시작되기 전의 인트로 구간에는 짧은 오인식이 있었고, 치과·의학 전문용어에도 일부 보정이 필요하다. 이후에는 전문용어 사전, 문맥 기반 교정, 원본 대조 절차를 추가해야 한다.

현재 생성된 Transcript는 실험 결과이며 의료적 판단이나 진료 권고로 사용해서는 안 된다. Medical Facts, Clinical Brief, Verification 단계가 구현되더라도 최종 결과에는 사람의 검토 과정이 필요하다.

## 다음 작업 방향

다음 핵심 실험은 SLIDE EXTRACT다. 영상에서 슬라이드가 바뀌는 시점을 감지하고 대표 프레임을 저장한 뒤 OCR로 제목, 문장, 수치와 참고문헌을 읽어야 한다. 이후 Transcript와 슬라이드를 timestamp 기준으로 연결하는 ALIGN 단계로 이어진다.

그 다음에는 의료 정보 후보 추출, 중요도 평가, Clinical Brief 생성, 근거 검증을 순서대로 실제 처리로 교체할 예정이다. 각 단계는 한 번에 모두 구현하기보다 샘플 한 편으로 결과 품질을 확인한 뒤 다음 단계로 넘어가는 방식이 적절하다.

입력 방식은 향후 사용자가 처리 권한을 가진 MP3·MP4 파일을 직접 올릴 수 있도록 확장할 수 있다. 이 기능이 추가되면 YouTube 다운로드 제한과 관계없이 세미나 원본 파일로 실험할 수 있다.

## 현재 상태 요약

Medical Seminar AI Lab은 아이디어와 화면 골격만 있는 상태를 지나, 실제 YouTube 영상 한 편에서 metadata, audio, timestamp Transcript를 생성하고 화면에서 확인할 수 있는 첫 번째 동작 가능한 prototype 단계에 도달했다. 앞으로는 이 Transcript에 슬라이드와 의료적 의미를 차례로 연결하는 작업이 남아 있다.

## 관련 문서와 파일

- Pipeline 기술 정의: `docs/AI_SEMINAR_PIPELINE.md`
- AI Lab frontend 로직: `assets/js/seminar-lab.js`
- AI Lab 화면 스타일: `assets/css/seminar-lab.css`
- FastAPI backend: `backend/app/`
- Backend 실행 안내: `backend/README.md`
- Sample schema: `data/ai-seminar/sample-seminar.json`
- 실제 Transcript 결과: `backend/data/transcripts/YsFmWWHc6Yc.json` (Git 추적 제외)
