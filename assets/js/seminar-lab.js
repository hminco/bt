(() => {
  const DATA_URL = "data/ai-seminar/sample-seminar.json";
  const API_BASE_URL = "http://127.0.0.1:8001/api";
  const MOCK_RUN_DELAY = 700;
  const LAB_ROUTE = "ai-seminar-lab";

  const STAGES = [
    {
      key: "ingest",
      order: "01",
      name: "INGEST",
      action: "Run Ingest",
      description: "YouTube URL을 검증하고 seminar metadata 계약을 준비합니다.",
      input: ["YouTube source URL"],
      output: ["seminar metadata", "source ID", "duration/language"],
      outputKey: "seminar",
    },
    {
      key: "transcribe",
      order: "02",
      name: "TRANSCRIBE",
      action: "Run Transcribe",
      description: "오디오를 speaker와 timestamp가 포함된 transcript 구조로 변환합니다.",
      input: ["seminar media reference", "language"],
      output: ["timestamp transcript[]", "speaker label"],
      outputKey: "transcript",
    },
    {
      key: "slideExtract",
      order: "03",
      name: "SLIDE EXTRACT",
      action: "Run Slide Extract",
      description: "슬라이드 전환을 감지하고 대표 프레임과 OCR 분석 결과를 구성합니다.",
      input: ["seminar video reference"],
      output: ["representative slides[]", "OCR text/numbers", "references"],
      outputKey: "slides",
    },
    {
      key: "align",
      order: "04",
      name: "ALIGN",
      action: "Run Align",
      description: "Transcript와 slide를 timestamp 기준으로 결합해 공통 timeline을 만듭니다.",
      input: ["transcript[]", "slides[]"],
      output: ["aligned timeline[]", "alignment confidence"],
      outputKey: "timeline",
    },
    {
      key: "medicalFacts",
      order: "05",
      name: "MEDICAL FACTS",
      action: "Run Medical Facts",
      description: "진료지침, 약물, 용량, 수치 기준, 금기, 임상 사례와 근거 fact 후보를 추출합니다.",
      input: ["timeline[]", "transcript and slide sources"],
      output: ["medicalFacts[]", "source timestamp references"],
      outputKey: "medicalFacts",
    },
    {
      key: "importanceScore",
      order: "06",
      name: "IMPORTANCE SCORE",
      action: "Run Importance Score",
      description: "각 medical fact의 임상적 중요도, 강조도, 관련성과 실행 가능성을 평가합니다.",
      input: ["medicalFacts[]"],
      output: ["scoredFacts[]", "totalScore"],
      outputKey: "scoredFacts",
    },
    {
      key: "clinicalBrief",
      order: "07",
      name: "CLINICAL BRIEF",
      action: "Run Clinical Brief",
      description: "우선순위 fact를 30초 핵심 요약과 구조화된 Clinical Brief로 정리합니다.",
      input: ["scoredFacts[]", "source timeline"],
      output: ["bottom line", "key takeaways", "clinicalBrief categories"],
      outputKey: "clinicalBrief",
    },
    {
      key: "verify",
      order: "08",
      name: "VERIFY",
      action: "Run Verify",
      description: "생성된 claim을 transcript와 slide source에 대조해 지지 여부와 이슈를 기록합니다.",
      input: ["clinicalBrief", "transcript/slides/timeline"],
      output: ["verification claims[]", "supported status", "issues[]"],
      outputKey: "verification",
    },
  ];

  const state = {
    data: null,
    selectedStageKey: STAGES[0].key,
    activeTimer: null,
    activeRequestId: 0,
    transcriptResult: null,
    activeResultTab: "transcript",
    initialized: false,
  };

  const elements = {
    view: document.querySelector('[data-view="ai-seminar-lab"]'),
    form: document.getElementById("seminar-url-form"),
    urlInput: document.getElementById("seminar-url"),
    loadMessage: document.getElementById("seminar-load-message"),
    metadata: [...document.querySelectorAll("[data-seminar-meta]")],
    steps: document.getElementById("pipeline-steps"),
    resetButton: document.getElementById("reset-pipeline"),
    detailOrder: document.getElementById("pipeline-detail-order"),
    detailTitle: document.getElementById("pipeline-detail-title"),
    detailStatus: document.getElementById("pipeline-detail-status"),
    detailDescription: document.getElementById("pipeline-detail-description"),
    detailInput: document.getElementById("pipeline-detail-input"),
    detailOutput: document.getElementById("pipeline-detail-output"),
    jsonKey: document.getElementById("pipeline-json-key"),
    jsonPreview: document.getElementById("pipeline-json-preview"),
    resultSummary: document.getElementById("transcript-result-summary"),
    resultTabs: [...document.querySelectorAll("[data-lab-result-tab]")],
    transcriptPanel: document.getElementById("transcript-panel"),
    transcriptJsonPanel: document.getElementById("transcript-json-panel"),
    transcriptEmpty: document.getElementById("transcript-empty"),
    transcriptList: document.getElementById("transcript-list"),
    transcriptJson: document.getElementById("transcript-json-preview"),
  };

  function createLabElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function parseYouTubeVideoId(value) {
    try {
      const url = new URL(value);
      const hostname = url.hostname.replace(/^www\./, "");
      let videoId = "";

      if (hostname === "youtu.be") videoId = url.pathname.split("/").filter(Boolean)[0] ?? "";
      if (hostname === "youtube.com" || hostname === "m.youtube.com") {
        videoId = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1] ?? "";
      }

      return /^[A-Za-z0-9_-]{11}$/.test(videoId) ? videoId : null;
    } catch {
      return null;
    }
  }

  async function requestLabApi(path, options = {}) {
    const requestOptions = { ...options };
    if (requestOptions.body) {
      requestOptions.headers = { "Content-Type": "application/json", ...requestOptions.headers };
    }

    let response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, requestOptions);
    } catch {
      throw new Error("FastAPI 서버에 연결할 수 없습니다. localhost:8001 실행 상태를 확인해 주세요.");
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.detail ?? `Backend 요청 실패: ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function validateLabData(data) {
    const requiredTopLevelKeys = ["seminar", "pipeline", "transcript", "slides", "timeline", "medicalFacts", "scoredFacts", "clinicalBrief", "verification"];
    const missingKey = requiredTopLevelKeys.find((key) => !(key in data));
    if (missingKey) throw new Error(`sample JSON 필수 키가 없습니다: ${missingKey}`);

    const missingStage = STAGES.find((stage) => !data.pipeline?.stages?.[stage.key]);
    if (missingStage) throw new Error(`pipeline stage가 없습니다: ${missingStage.key}`);
  }

  function formatLabDuration(seconds) {
    if (!Number.isFinite(seconds)) return "—";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    const time = [hours, minutes, remainingSeconds].map((value) => String(value).padStart(2, "0")).join(":");
    return `${time} (${new Intl.NumberFormat("ko-KR").format(seconds)}초)`;
  }

  function formatLabTimestamp(seconds) {
    const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const remainingSeconds = totalSeconds % 60;
    return hours > 0
      ? [hours, minutes, remainingSeconds].map((value) => String(value).padStart(2, "0")).join(":")
      : [minutes, remainingSeconds].map((value) => String(value).padStart(2, "0")).join(":");
  }

  function setLabMessage(message, tone = "neutral") {
    elements.loadMessage.textContent = message;
    elements.loadMessage.className = `is-${tone}`;
  }

  function renderLabMetadata() {
    const seminar = state.data.seminar;
    const values = {
      title: seminar.title,
      speaker: seminar.speaker,
      specialty: seminar.specialty,
      source: seminar.source,
      videoId: seminar.id,
      duration: formatLabDuration(seminar.durationSeconds),
      seminarDate: seminar.seminarDate ?? "미정",
      language: seminar.language,
    };

    elements.metadata.forEach((element) => {
      element.textContent = values[element.dataset.seminarMeta] ?? "—";
    });
  }

  function createTranscriptTimestampLink(segment) {
    const link = createLabElement("a", "lab-transcript-time", formatLabTimestamp(segment.start));
    try {
      const sourceUrl = new URL(state.data.seminar.sourceUrl);
      sourceUrl.searchParams.set("t", `${Math.floor(segment.start)}s`);
      link.href = sourceUrl.toString();
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.title = "YouTube에서 해당 시점 열기";
    } catch {
      link.removeAttribute("href");
    }
    return link;
  }

  function renderLabResultTabs() {
    elements.resultTabs.forEach((tab) => {
      const isActive = tab.dataset.labResultTab === state.activeResultTab;
      tab.setAttribute("aria-selected", String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
    });
    elements.transcriptPanel.hidden = state.activeResultTab !== "transcript";
    elements.transcriptJsonPanel.hidden = state.activeResultTab !== "json";
  }

  function renderTranscriptResult() {
    const result = state.transcriptResult;
    const transcript = result?.transcript ?? [];
    elements.transcriptList.replaceChildren();
    elements.transcriptEmpty.hidden = transcript.length > 0;

    if (!result) {
      elements.resultSummary.textContent = "전사 실행 전";
      elements.transcriptJson.textContent = "전사 결과가 없습니다.";
      renderLabResultTabs();
      return;
    }

    elements.resultSummary.textContent = `${transcript.length.toLocaleString("ko-KR")}개 구간 · ${result.cached ? "저장 결과 재사용" : "신규 전사"}`;
    elements.transcriptJson.textContent = JSON.stringify(result, null, 2);
    const fragment = document.createDocumentFragment();
    transcript.forEach((segment) => {
      const item = createLabElement("li", "lab-transcript-item");
      const range = createLabElement("div", "lab-transcript-range");
      range.append(
        createTranscriptTimestampLink(segment),
        createLabElement("span", "", `– ${formatLabTimestamp(segment.end)}`),
      );
      item.append(range, createLabElement("p", "", segment.text));
      fragment.append(item);
    });
    elements.transcriptList.append(fragment);
    renderLabResultTabs();
  }

  function selectLabResultTab(tabKey) {
    if (tabKey !== "transcript" && tabKey !== "json") return;
    state.activeResultTab = tabKey;
    renderLabResultTabs();
  }

  function getLabStageRecord(stageKey) {
    return state.data.pipeline.stages[stageKey];
  }

  function setLabStageStatus(stageKey, status, errorMessage = null) {
    const record = getLabStageRecord(stageKey);
    const now = new Date().toISOString();
    record.status = status;
    record.error = status === "error" ? errorMessage : null;

    if (status === "running") {
      record.startedAt = now;
      record.completedAt = null;
      state.data.pipeline.status = "running";
      state.data.pipeline.currentStage = stageKey;
      state.data.pipeline.startedAt ??= now;
      state.data.pipeline.completedAt = null;
    }

    if (status === "completed") {
      record.completedAt = now;
      const allCompleted = STAGES.every((stage) => getLabStageRecord(stage.key).status === "completed");
      state.data.pipeline.status = allCompleted ? "completed" : "waiting";
      state.data.pipeline.currentStage = null;
      if (allCompleted) state.data.pipeline.completedAt = now;
    }

    if (status === "error") {
      record.completedAt = null;
      state.data.pipeline.status = "error";
      state.data.pipeline.currentStage = null;
    }
  }

  function isLabStageRunnable(stageIndex) {
    const stage = STAGES[stageIndex];
    const status = getLabStageRecord(stage.key).status;
    const isAnyStageRunning = STAGES.some((item) => getLabStageRecord(item.key).status === "running");
    if ((status !== "waiting" && status !== "error") || isAnyStageRunning) return false;
    return stageIndex === 0 || getLabStageRecord(STAGES[stageIndex - 1].key).status === "completed";
  }

  function createLabList(items) {
    const fragment = document.createDocumentFragment();
    items.forEach((item) => fragment.append(createLabElement("li", "", item)));
    return fragment;
  }

  function getLabOutputPreview(stage) {
    return { [stage.outputKey]: state.data[stage.outputKey] };
  }

  function renderLabDetail() {
    const stage = STAGES.find((item) => item.key === state.selectedStageKey) ?? STAGES[0];
    const record = getLabStageRecord(stage.key);
    const status = record.status;
    elements.detailOrder.textContent = `STEP ${stage.order}`;
    elements.detailTitle.textContent = stage.name;
    elements.detailStatus.textContent = status;
    elements.detailStatus.className = `lab-status-badge is-${status}`;
    elements.detailDescription.textContent = record.error ? `${stage.description} 오류: ${record.error}` : stage.description;
    elements.detailInput.replaceChildren(createLabList(stage.input));
    elements.detailOutput.replaceChildren(createLabList(stage.output));
    elements.jsonKey.textContent = stage.outputKey;
    elements.jsonPreview.textContent = JSON.stringify(getLabOutputPreview(stage), null, 2);
  }

  function renderLabPipeline() {
    elements.steps.replaceChildren();
    const fragment = document.createDocumentFragment();

    STAGES.forEach((stage, stageIndex) => {
      const record = getLabStageRecord(stage.key);
      const item = createLabElement("li", `lab-step-item is-${record.status}${state.selectedStageKey === stage.key ? " is-selected" : ""}`);
      const selectButton = createLabElement("button", "lab-step-select");
      const order = createLabElement("span", "lab-step-order", stage.order);
      const copy = createLabElement("span", "lab-step-copy");
      const name = createLabElement("strong", "", stage.name);
      const output = createLabElement("small", "", stage.outputKey);
      const status = createLabElement("span", `lab-status-badge is-${record.status}`, record.status);
      const buttonLabel = record.status === "running"
        ? "Running…"
        : record.status === "completed"
          ? "Completed"
          : record.status === "error"
            ? `Retry ${stage.name}`
            : stage.action;
      const runButton = createLabElement("button", "lab-run-button", buttonLabel);

      selectButton.type = "button";
      selectButton.setAttribute("aria-pressed", String(state.selectedStageKey === stage.key));
      selectButton.setAttribute("aria-label", `${stage.order} ${stage.name} 상세 보기`);
      selectButton.addEventListener("click", () => selectLabStage(stage.key));
      copy.append(name, output);
      selectButton.append(order, copy, status);

      runButton.type = "button";
      runButton.disabled = !isLabStageRunnable(stageIndex);
      runButton.dataset.stageKey = stage.key;
      runButton.addEventListener("click", () => runLabStage(stage.key));
      if (runButton.disabled && record.status === "waiting") runButton.title = "이전 단계를 먼저 완료하세요.";

      item.append(selectButton, runButton);
      fragment.append(item);
    });

    elements.steps.append(fragment);
    renderLabDetail();
  }

  function selectLabStage(stageKey) {
    state.selectedStageKey = stageKey;
    renderLabPipeline();
  }

  async function executeLabIngest(sourceUrl) {
    const metadata = await requestLabApi("/seminars/ingest", {
      method: "POST",
      body: JSON.stringify({ sourceUrl }),
    });
    state.data.seminar = { ...state.data.seminar, ...metadata };
    renderLabMetadata();
    return `INGEST 완료 · ${metadata.title}`;
  }

  async function requestStoredTranscript(videoId) {
    try {
      return await requestLabApi(`/seminars/${encodeURIComponent(videoId)}/transcript`);
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  }

  async function executeLabTranscribe() {
    const seminar = state.data.seminar;
    let result = await requestStoredTranscript(seminar.id);

    if (!result) {
      setLabMessage("오디오를 추출하고 있습니다. 영상 길이에 따라 시간이 걸릴 수 있습니다.", "running");
      await requestLabApi("/seminars/audio", {
        method: "POST",
        body: JSON.stringify({ sourceUrl: seminar.sourceUrl }),
      });
      setLabMessage("OpenAI STT로 timestamp transcript를 생성하고 있습니다.", "running");
      result = await requestLabApi(`/seminars/${encodeURIComponent(seminar.id)}/transcribe`, {
        method: "POST",
        body: JSON.stringify({}),
      });
    }

    state.transcriptResult = result;
    state.data.transcript = result.transcript;
    renderTranscriptResult();
    return result.cached
      ? `TRANSCRIBE 완료 · 저장된 ${result.transcript.length}개 구간을 재사용했습니다.`
      : `TRANSCRIBE 완료 · ${result.transcript.length}개 구간을 생성했습니다.`;
  }

  async function runLabStage(stageKey) {
    const stageIndex = STAGES.findIndex((stage) => stage.key === stageKey);
    if (stageIndex < 0 || !isLabStageRunnable(stageIndex)) return;

    const stage = STAGES[stageIndex];
    if (stageKey === "ingest" && !parseYouTubeVideoId(elements.urlInput.value.trim())) {
      elements.urlInput.setAttribute("aria-invalid", "true");
      setLabMessage("올바른 YouTube URL을 입력해 주세요.", "error");
      elements.urlInput.focus();
      return;
    }

    state.selectedStageKey = stageKey;
    setLabStageStatus(stageKey, "running");
    const requestId = ++state.activeRequestId;
    setLabMessage(`${stage.name} 단계를 실행하고 있습니다.`, "running");
    renderLabPipeline();

    try {
      let completionMessage;
      if (stageKey === "ingest") {
        elements.urlInput.removeAttribute("aria-invalid");
        completionMessage = await executeLabIngest(elements.urlInput.value.trim());
      } else if (stageKey === "transcribe") {
        completionMessage = await executeLabTranscribe();
      } else {
        await new Promise((resolve) => {
          state.activeTimer = window.setTimeout(() => {
            state.activeTimer = null;
            resolve();
          }, MOCK_RUN_DELAY);
        });
        completionMessage = `${stage.name} mock 실행이 완료되었습니다.`;
      }

      if (requestId !== state.activeRequestId) return;
      setLabStageStatus(stageKey, "completed");
      setLabMessage(completionMessage, "success");
      renderLabPipeline();
    } catch (error) {
      if (requestId !== state.activeRequestId) return;
      setLabStageStatus(stageKey, "error", error.message);
      setLabMessage(`${stage.name} 실패 · ${error.message}`, "error");
      renderLabPipeline();
    }
  }

  function resetLabPipeline(showMessage = true) {
    if (!state.data) return;
    state.activeRequestId += 1;
    if (state.activeTimer !== null) {
      window.clearTimeout(state.activeTimer);
      state.activeTimer = null;
    }

    STAGES.forEach((stage) => {
      const record = getLabStageRecord(stage.key);
      record.status = "waiting";
      record.startedAt = null;
      record.completedAt = null;
      record.error = null;
    });
    state.data.pipeline.status = "waiting";
    state.data.pipeline.currentStage = null;
    state.data.pipeline.startedAt = null;
    state.data.pipeline.completedAt = null;
    state.data.transcript = [];
    state.transcriptResult = null;
    state.activeResultTab = "transcript";
    state.selectedStageKey = STAGES[0].key;
    if (showMessage) setLabMessage("Pipeline을 초기 상태로 되돌렸습니다.", "neutral");
    renderLabPipeline();
    renderTranscriptResult();
  }

  async function loadLabSeminar(event) {
    event.preventDefault();
    if (!state.data) return;

    const sourceUrl = elements.urlInput.value.trim();
    if (!parseYouTubeVideoId(sourceUrl)) {
      elements.urlInput.setAttribute("aria-invalid", "true");
      setLabMessage("올바른 YouTube URL을 입력해 주세요.", "error");
      elements.urlInput.focus();
      return;
    }

    elements.urlInput.removeAttribute("aria-invalid");
    resetLabPipeline(false);
    await runLabStage("ingest");
  }

  function renderLabError(error) {
    elements.jsonPreview.textContent = error.message;
    elements.steps.replaceChildren(createLabElement("li", "lab-load-error", "sample JSON을 불러오지 못했습니다."));
    setLabMessage("sample JSON 경로와 로컬 서버 실행 상태를 확인해 주세요.", "error");
  }

  async function initializeLab() {
    if (state.initialized) return;
    state.initialized = true;

    try {
      const response = await fetch(DATA_URL);
      if (!response.ok) throw new Error(`sample JSON 요청 실패: ${response.status}`);
      const data = await response.json();
      validateLabData(data);
      state.data = data;
      elements.urlInput.value = data.seminar.sourceUrl;
      renderLabMetadata();
      resetLabPipeline(false);
      setLabMessage("준비되었습니다. Load Seminar 또는 Run Ingest로 backend metadata를 조회하세요.", "success");
    } catch (error) {
      renderLabError(error);
    }
  }

  elements.form?.addEventListener("submit", loadLabSeminar);
  elements.resetButton?.addEventListener("click", () => resetLabPipeline());
  elements.resultTabs.forEach((tab) => {
    tab.addEventListener("click", () => selectLabResultTab(tab.dataset.labResultTab));
  });
  window.addEventListener("app:route-change", (event) => {
    if (event.detail.route === LAB_ROUTE) initializeLab();
  });
  if (window.location.hash.includes(LAB_ROUTE)) initializeLab();
})();
