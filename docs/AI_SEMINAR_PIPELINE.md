# Medical Seminar AI Lab Pipeline

## 1. Prototype 목적

Medical Seminar AI Lab은 긴 의료 세미나를 근거 출처가 연결된 Clinical Brief로 변환하는 과정을 단계별로 실험하기 위한 내부 프로토타입이다.

현재 INGEST, audio 준비, TRANSCRIBE는 FastAPI backend에서 실제 처리한다. SLIDE EXTRACT부터 VERIFY까지는 UI, 상태 전환, 데이터 계약을 검증하는 mock 범위이며 OCR, 의료 정보 추출, 요약, 검증 모델은 호출하지 않는다.

`data/ai-seminar/sample-seminar.json`에 포함된 의학 내용은 화면과 schema 검증을 위한 mock이며 실제 의료 정보나 진료 권고가 아니다.

## 2. Pipeline 상태

각 단계는 아래 상태 중 하나를 가진다.

| 상태 | 의미 |
|---|---|
| `waiting` | 실행 전 또는 이전 단계 대기 |
| `running` | backend 또는 client-side mock 실행 중 |
| `completed` | 실제 또는 mock 결과 확인 가능 |
| `error` | backend 연결이나 단계 실행 오류 |

단계는 순차 실행한다. 바로 앞 단계가 `completed`가 아니면 다음 단계를 실행할 수 없다.

## 3. 8단계 Pipeline 정의

### 01 INGEST

- 목적: YouTube URL을 입력받고 세미나 기본 정보를 확보한다.
- Input: `sourceUrl`
- Output: `seminar`
- 현재 backend: URL allowlist를 검증하고 yt-dlp metadata adapter 결과를 표시한다.
- 향후 backend: 콘텐츠 접근 권한 검증과 metadata 영속화를 추가한다.

### 02 TRANSCRIBE

- 목적: 오디오를 timestamp가 포함된 transcript로 변환한다.
- Input: seminar media/audio reference
- Output: `transcript[]`
- 주요 필드: `id`, `start`, `end`, `text`, `speaker`
- 현재 backend: OpenAI `whisper-1`의 segment timestamp 결과를 사용한다.
- API: `POST /api/seminars/{videoId}/transcribe`
- 조회 API: `GET /api/seminars/{videoId}/transcript` (OpenAI 호출 없음)
- 기본 동작: 저장 결과가 있으면 `cached: true`로 반환하고 재과금하지 않는다.
- 강제 재전사: POST body에 `{"force": true}`를 전달할 때만 실행한다.
- 저장 위치: `backend/data/transcripts/{videoId}.json` (Git 추적 제외)
- 향후 backend: 긴 파일 분할, 재시도, 작업 큐를 포함한 STT worker로 확장한다.

### 03 SLIDE EXTRACT

- 목적: 슬라이드 전환을 감지하고 대표 프레임과 OCR 결과를 추출한다.
- Input: seminar video reference
- Output: `slides[]`
- 주요 필드: `id`, `start`, `end`, `image`, `title`, `text`, `numbers`, `references`
- 향후 backend: frame extraction, vision, OCR worker 결과로 교체한다.

### 04 ALIGN

- 목적: transcript와 slide를 timestamp 기준으로 연결한다.
- Input: `transcript[]`, `slides[]`
- Output: `timeline[]`
- 주요 필드: `start`, `end`, `transcriptIds`, `slideIds`, `confidence`
- 향후 backend: alignment service 결과로 교체한다.

### 05 MEDICAL FACTS

- 목적: 세미나에서 의료적으로 검토할 fact 후보를 구조화한다.
- Input: `timeline[]`, transcript, slide OCR
- Output: `medicalFacts[]`
- 유형 예시: guideline recommendation, drug/dosage, threshold, contraindication, clinical case, evidence
- 모든 fact는 `source.start`, `source.end`, `transcriptIds`, `slideIds`를 가진다.
- 향후 backend: medical information extraction model 결과로 교체한다.

### 06 IMPORTANCE SCORE

- 목적: fact 후보의 임상적 중요도와 활용도를 평가한다.
- Input: `medicalFacts[]`
- Output: `scoredFacts[]`
- 점수 필드: `clinicalImportance`, `speakerEmphasis`, `guidelineRelevance`, `novelty`, `actionability`, `totalScore`
- 향후 backend: scoring model 또는 rule/model hybrid 결과로 교체한다.

### 07 CLINICAL BRIEF

- 목적: 우선순위가 높은 fact를 30초 요약과 5분 Clinical Brief 구조로 정리한다.
- Input: `scoredFacts[]`, source timeline
- Output: `clinicalBrief`
- 분류: `bottomLine`, `keyTakeaways`, `guidelineUpdates`, `diagnosis`, `treatment`, `drugAndDosage`, `thresholds`, `contraindications`, `clinicalCases`
- 각 summary item은 transcript/slide로 돌아갈 수 있는 `source`를 반드시 가진다.
- 향후 backend: grounded generation 결과로 교체한다.

### 08 VERIFY

- 목적: 생성된 claim이 transcript와 slide source에 의해 지지되는지 확인한다.
- Input: `clinicalBrief`, transcript, slides, timeline
- Output: `verification.claims[]`
- 주요 필드: `claimId`, `status`, `supported`, `source`, `issues`
- 향후 backend: claim verification service와 human review 상태로 교체한다.

## 4. sample-seminar.json Schema

최상위 구조는 다음과 같다.

```text
schemaVersion
dataMode
disclaimer
seminar
pipeline
transcript[]
slides[]
timeline[]
medicalFacts[]
scoredFacts[]
clinicalBrief
verification
```

### seminar

세미나의 출처와 표시용 metadata를 보관한다. `id`는 현재 YouTube video ID를 사용하며 향후 내부 seminar ID와 외부 source ID를 분리할 수 있다.

### pipeline

전체 실행 상태와 단계별 상태를 보관한다. 각 stage는 순서, 상태, output key, 시작·완료 시각, 오류를 가진다.

### source contract

fact, summary, verification claim은 아래 source 구조로 원본을 역추적할 수 있어야 한다.

```json
{
  "start": 15,
  "end": 42,
  "transcriptIds": ["tr_002"],
  "slideIds": ["slide_001"]
}
```

### 식별자 규칙

- Transcript: `tr_001`
- Slide: `slide_001`
- Alignment: `align_001`
- Medical fact: `fact_001`
- Brief item: `brief_{category}_001`

식별자는 단계 간 참조를 유지해야 하며 배열 순서를 식별자로 사용하지 않는다.

## 5. 현재 구현 범위

- frontend sample JSON을 초기 schema로 사용
- frontend 실제 metadata 표시
- 8단계 pipeline shell
- 실제 INGEST와 TRANSCRIBE 상태 전환 및 오류 표시
- 이전 단계 미완료 시 실행 차단
- 단계별 설명, Input, Expected Output 표시
- 단계별 sample JSON preview
- pipeline reset
- Transcript/JSON 결과 탭과 timestamp별 YouTube 링크
- FastAPI backend와 health endpoint
- backend YouTube URL allowlist 검증
- yt-dlp 기반 실제 seminar metadata 조회 endpoint
- ffmpeg 기반 audio-only 파일 준비 endpoint
- OpenAI `whisper-1` 기반 timestamp transcript endpoint
- 저장 Transcript 조회와 중복 과금 방지 캐시
- backend 전용 환경변수와 CORS 구조

구현하지 않는 항목:

- OCR, vision, 의료 정보 추출·요약·검증 LLM 호출
- 의료 지식 검색과 guideline 연결
- database, queue, authentication
- Slides, Medical Facts, Clinical Brief 상세 탐색 UI

## 6. 향후 Backend 연결 시 교체 지점

| 현재 frontend mock | 향후 교체 대상 |
|---|---|
| `sample-seminar.json` fetch | seminar job 생성·조회 API |
| sample metadata fallback | 영속화된 seminar job 응답 |
| 3~8단계 `setTimeout` 상태 변경 | job polling, SSE 또는 WebSocket 상태 |
| 3~8단계 sample output | 단계별 backend response |
| client-side 순차 실행 제한 | backend workflow orchestration |
| `error` 표시용 schema | 표준 API error와 retry 정책 |

API key와 의료 데이터는 정적 frontend에 저장하지 않는다. 실제 처리 단계는 backend와 비동기 worker에서 실행하고 frontend는 job 상태와 결과만 조회한다.
