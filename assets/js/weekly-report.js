(() => {
  const DATA_URL = "data/닥터빌 주간_월간 데이터 자동 시트 - 주간페이지요약.csv";
  const COLORS = ["#4a9fd8", "#7c6bd8", "#b05fa8", "#d8b04a", "#5a9c72", "#aeb7bf", "#e4e8ec"];
  const state = { periods: [], currentIndex: -1, initialized: false };

  const elements = {
    previousButton: document.getElementById("previous-period"),
    nextButton: document.getElementById("next-period"),
    currentPeriod: document.getElementById("current-period"),
    views: document.getElementById("kpi-views"),
    viewsChange: document.getElementById("kpi-views-change"),
    top5Share: document.getElementById("kpi-top5-share"),
    topPage: document.getElementById("kpi-top-page"),
    topPageViews: document.getElementById("kpi-top-page-views"),
    otherShare: document.getElementById("kpi-other-share"),
    groupCount: document.getElementById("kpi-group-count"),
    viewsChartPeriod: document.getElementById("views-chart-period"),
    viewsBars: document.getElementById("views-bars"),
    donut: document.getElementById("share-donut"),
    donutValue: document.getElementById("donut-value"),
    shareLegend: document.getElementById("share-legend"),
    bounceBars: document.getElementById("bounce-bars"),
    trend: document.getElementById("views-trend"),
    notice: document.getElementById("report-notice"),
    tableBody: document.getElementById("report-table-body"),
    reportView: document.querySelector('[data-view="weekly-pages"]'),
  };

  const pageMappings = readPageMappings();
  const pageTooltip = document.createElement("div");
  const trendTooltip = document.createElement("div");
  let activeTooltipTrigger = null;
  let activeTrendTrigger = null;

  pageTooltip.id = "page-path-tooltip";
  pageTooltip.className = "page-path-tooltip";
  pageTooltip.setAttribute("role", "tooltip");
  pageTooltip.setAttribute("aria-hidden", "true");
  document.body.append(pageTooltip);

  trendTooltip.id = "trend-data-tooltip";
  trendTooltip.className = "trend-data-tooltip";
  trendTooltip.setAttribute("role", "tooltip");
  trendTooltip.setAttribute("aria-hidden", "true");
  document.body.append(trendTooltip);

  function parseCsv(source) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;

    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (quoted) {
        if (character === '"' && source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else if (character === '"') {
          quoted = false;
        } else {
          cell += character;
        }
      } else if (character === '"') {
        quoted = true;
      } else if (character === ",") {
        row.push(cell);
        cell = "";
      } else if (character === "\n") {
        row.push(cell.replace(/\r$/, ""));
        rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += character;
      }
    }

    if (cell || row.length) {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
    }
    return rows;
  }

  function toIsoDate(value) {
    const match = value.match(/(\d{4})\.\s*(\d+)\.\s*(\d+)/);
    if (!match) throw new Error(`날짜 형식을 확인할 수 없습니다: ${value}`);
    return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  }

  function normalizeRows(source) {
    const parsedRows = parseCsv(source.replace(/^\uFEFF/, ""));
    const headers = parsedRows.shift();
    const column = Object.fromEntries(headers.map((header, index) => [header, index]));

    return parsedRows
      .filter((row) => row.length === headers.length)
      .map((row) => ({
        start: toIsoDate(row[column["주 시작일(월)"]]),
        end: toIsoDate(row[column["주 종료일(일)"]]),
        group: row[column["페이지그룹"]],
        users: Number(row[column["활성사용자"]]),
        views: Number(row[column["조회수"]]),
        share: Number(row[column["조회수비중(%)"]]),
        viewsPerUser: Number(row[column["활성사용자당조회수"]]),
        engagement: Number(row[column["평균참여시간(초, 근사)"]]),
        bounce: Number(row[column["이탈률(%)"]]),
        insight: row[column["전주 대비 인사이트"]],
      }));
  }

  function groupPeriods(rows) {
    const grouped = new Map();
    rows.forEach((row) => {
      if (!grouped.has(row.start)) grouped.set(row.start, { start: row.start, end: row.end, rows: [] });
      grouped.get(row.start).rows.push(row);
    });
    return [...grouped.values()].sort((left, right) => left.start.localeCompare(right.start));
  }

  function formatNumber(value, maximumFractionDigits = 0) {
    return new Intl.NumberFormat("ko-KR", { maximumFractionDigits }).format(value);
  }

  function formatPeriod(start, end) {
    const startDate = new Date(`${start}T00:00:00`);
    const endDate = new Date(`${end}T00:00:00`);
    const startLabel = `${startDate.getFullYear()}.${String(startDate.getMonth() + 1).padStart(2, "0")}.${String(startDate.getDate()).padStart(2, "0")}`;
    const endLabel = `${String(endDate.getMonth() + 1).padStart(2, "0")}.${String(endDate.getDate()).padStart(2, "0")}`;
    return `${startLabel} – ${endLabel} · 월~일`;
  }

  function sumBy(rows, key) {
    return rows.reduce((total, row) => total + row[key], 0);
  }

  function calculateChangeRate(currentValue, previousValue) {
    return previousValue ? ((currentValue - previousValue) / previousValue) * 100 : null;
  }

  function createElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function readPageMappings() {
    const rows = document.querySelectorAll("#pages .page-table tbody tr");
    return new Map([...rows].map((row) => {
      const cells = row.querySelectorAll("td");
      const group = cells[0]?.textContent.trim();
      const matchLabel = cells[1]?.textContent.trim();
      const path = cells[2]?.textContent.trim();
      const match = matchLabel?.startsWith("정확히") ? "정확히 일치" : "시작 문자열";
      return [group, { path, match }];
    }).filter(([group, mapping]) => group && mapping.path));
  }

  function applyPagePathTrigger(element, group) {
    const mapping = pageMappings.get(group);
    element.textContent = group;
    element.classList.remove("page-path-trigger");
    element.removeAttribute("tabindex");
    element.removeAttribute("aria-label");
    element.removeAttribute("aria-describedby");
    delete element.dataset.pagePath;
    delete element.dataset.pageMatch;
    if (!mapping) return element;

    element.classList.add("page-path-trigger");
    element.tabIndex = 0;
    element.dataset.pagePath = mapping.path;
    element.dataset.pageMatch = mapping.match;
    element.setAttribute("aria-label", `${group}, 경로 ${mapping.path}, ${mapping.match}`);
    return element;
  }

  function createPagePathTrigger(tagName, className, group) {
    return applyPagePathTrigger(createElement(tagName, className), group);
  }

  function positionFloatingTooltip(tooltip, trigger) {
    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const edgeGap = 12;
    const center = triggerRect.left + triggerRect.width / 2;
    const left = Math.min(Math.max(center - tooltipRect.width / 2, edgeGap), window.innerWidth - tooltipRect.width - edgeGap);
    const above = triggerRect.top - tooltipRect.height - 10;
    const placeBelow = above < edgeGap;
    const top = placeBelow ? triggerRect.bottom + 10 : above;
    const arrowLeft = Math.min(Math.max(center - left, 16), tooltipRect.width - 16);

    tooltip.dataset.placement = placeBelow ? "below" : "above";
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.setProperty("--tooltip-arrow-left", `${arrowLeft}px`);
  }

  function showPageTooltip(trigger) {
    const path = trigger.dataset.pagePath;
    if (!path) return;
    if (activeTooltipTrigger === trigger && pageTooltip.classList.contains("is-visible")) {
      positionFloatingTooltip(pageTooltip, trigger);
      return;
    }

    activeTooltipTrigger?.removeAttribute("aria-describedby");

    const pathElement = createElement("code", "", path);
    const matchElement = createElement("span", "", trigger.dataset.pageMatch);
    pageTooltip.replaceChildren(pathElement, matchElement);
    pageTooltip.classList.remove("is-visible");
    pageTooltip.setAttribute("aria-hidden", "false");
    trigger.setAttribute("aria-describedby", pageTooltip.id);
    activeTooltipTrigger = trigger;
    positionFloatingTooltip(pageTooltip, trigger);
    pageTooltip.classList.add("is-visible");
  }

  function hidePageTooltip() {
    if (!activeTooltipTrigger) return;
    activeTooltipTrigger.removeAttribute("aria-describedby");
    activeTooltipTrigger = null;
    pageTooltip.classList.remove("is-visible");
    pageTooltip.setAttribute("aria-hidden", "true");
  }

  function findPagePathTrigger(target) {
    const trigger = target.closest?.(".page-path-trigger");
    return trigger && elements.reportView?.contains(trigger) ? trigger : null;
  }

  function showTrendTooltip(trigger) {
    if (activeTrendTrigger === trigger && trendTooltip.classList.contains("is-visible")) {
      positionFloatingTooltip(trendTooltip, trigger);
      return;
    }

    activeTrendTrigger?.removeAttribute("aria-describedby");
    const period = createElement("span", "trend-tooltip-period", trigger.dataset.trendPeriod);
    const valueRow = createElement("div", "trend-tooltip-value");
    const change = createElement("span", `trend-tooltip-change ${trigger.dataset.trendTone}`, trigger.dataset.trendChange);
    valueRow.append(createElement("strong", "", trigger.dataset.trendViews), createElement("small", "", "조회수"));
    trendTooltip.replaceChildren(period, valueRow, change);
    trendTooltip.classList.remove("is-visible");
    trendTooltip.setAttribute("aria-hidden", "false");
    trigger.setAttribute("aria-describedby", trendTooltip.id);
    activeTrendTrigger = trigger;
    positionFloatingTooltip(trendTooltip, trigger);
    trendTooltip.classList.add("is-visible");
  }

  function hideTrendTooltip() {
    if (!activeTrendTrigger) return;
    activeTrendTrigger.removeAttribute("aria-describedby");
    activeTrendTrigger = null;
    trendTooltip.classList.remove("is-visible");
    trendTooltip.setAttribute("aria-hidden", "true");
  }

  function findTrendTrigger(target) {
    const trigger = target.closest?.(".trend-point-group");
    return trigger && elements.trend?.contains(trigger) ? trigger : null;
  }

  function hideAllTooltips() {
    hidePageTooltip();
    hideTrendTooltip();
  }

  function renderKpis(period, previousPeriod) {
    const sorted = [...period.rows].sort((left, right) => right.views - left.views);
    const totalViews = sumBy(period.rows, "views");
    const previousViews = previousPeriod ? sumBy(previousPeriod.rows, "views") : null;
    const viewChange = calculateChangeRate(totalViews, previousViews);
    const top5Share = sorted.slice(0, 5).reduce((total, row) => total + row.share, 0);
    const trackedShare = sumBy(period.rows, "share");

    elements.views.textContent = formatNumber(totalViews);
    elements.viewsChange.textContent = viewChange === null ? "비교 없음" : `${viewChange >= 0 ? "+" : ""}${viewChange.toFixed(1)}%`;
    elements.viewsChange.className = viewChange === null ? "is-neutral" : viewChange >= 0 ? "is-positive" : "is-negative";
    elements.top5Share.textContent = `${top5Share.toFixed(2)}%`;
    applyPagePathTrigger(elements.topPage, sorted[0]?.group ?? "—");
    elements.topPageViews.textContent = sorted[0] ? formatNumber(sorted[0].views) : "—";
    elements.otherShare.textContent = `${Math.max(0, 100 - trackedShare).toFixed(2)}%`;
    elements.groupCount.textContent = formatNumber(period.rows.length);
  }

  function renderHorizontalBars(period) {
    const topRows = [...period.rows].sort((left, right) => right.views - left.views).slice(0, 8);
    const maximum = topRows[0]?.views || 1;
    elements.viewsBars.replaceChildren();

    topRows.forEach((row) => {
      const item = createElement("div", "horizontal-bar-item");
      const label = createPagePathTrigger("span", "bar-label", row.group);
      const track = createElement("div", "bar-track");
      const valueBar = createElement("span", "bar-value");
      const value = createElement("strong", "bar-number", formatNumber(row.views));
      valueBar.style.width = `${(row.views / maximum) * 100}%`;
      track.append(valueBar);
      item.append(label, track, value);
      elements.viewsBars.append(item);
    });
  }

  function renderShareDonut(period) {
    const sorted = [...period.rows].sort((left, right) => right.share - left.share);
    const topRows = sorted.slice(0, 5);
    const top5Share = topRows.reduce((total, row) => total + row.share, 0);
    const trackedRemainder = sorted.slice(5).reduce((total, row) => total + row.share, 0);
    const untracked = Math.max(0, 100 - top5Share - trackedRemainder);
    const segments = [...topRows.map((row) => ({ label: row.group, value: row.share })), { label: "나머지 27개", value: trackedRemainder }, { label: "기타 페이지", value: untracked }];
    let offset = 0;
    const gradient = segments.map((segment, index) => {
      const start = offset;
      offset += segment.value;
      return `${COLORS[index]} ${start}% ${offset}%`;
    });

    elements.donut.style.background = `conic-gradient(${gradient.join(",")})`;
    elements.donutValue.textContent = `${top5Share.toFixed(1)}%`;
    elements.shareLegend.replaceChildren();
    segments.forEach((segment, index) => {
      const item = createElement("div", "legend-item");
      const marker = createElement("i", "");
      const label = pageMappings.has(segment.label) ? createPagePathTrigger("span", "", segment.label) : createElement("span", "", segment.label);
      const value = createElement("strong", "", `${segment.value.toFixed(2)}%`);
      marker.style.background = COLORS[index];
      item.append(marker, label, value);
      elements.shareLegend.append(item);
    });
  }

  function renderBounceBars(period) {
    const topRows = [...period.rows].sort((left, right) => right.bounce - left.bounce).slice(0, 3);
    const maximum = topRows[0]?.bounce || 1;
    elements.bounceBars.replaceChildren();

    topRows.forEach((row) => {
      const item = createElement("div", "bounce-bar-item");
      const label = createPagePathTrigger("span", "", row.group);
      const track = createElement("div", "bar-track");
      const valueBar = createElement("span", "bar-value");
      const value = createElement("strong", "", `${row.bounce.toFixed(2)}%`);
      valueBar.style.width = `${(row.bounce / maximum) * 100}%`;
      track.append(valueBar);
      item.append(label, track, value);
      elements.bounceBars.append(item);
    });
  }

  function renderTrend() {
    const width = 800;
    const height = 220;
    const padding = { top: 22, right: 20, bottom: 38, left: 54 };
    const totals = state.periods.map((period) => sumBy(period.rows, "views"));
    const maximum = Math.max(...totals) * 1.08;
    const minimum = Math.min(...totals) * 0.92;
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const xAt = (index) => padding.left + (plotWidth * index) / Math.max(1, totals.length - 1);
    const yAt = (value) => padding.top + plotHeight - ((value - minimum) / Math.max(1, maximum - minimum)) * plotHeight;
    const points = totals.map((value, index) => `${xAt(index)},${yAt(value)}`).join(" ");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("aria-label", "최근 8주 집계 조회수 데이터 포인트");

    [0, 0.5, 1].forEach((ratio) => {
      const y = padding.top + plotHeight * ratio;
      const line = document.createElementNS(svg.namespaceURI, "line");
      line.setAttribute("x1", padding.left);
      line.setAttribute("x2", width - padding.right);
      line.setAttribute("y1", y);
      line.setAttribute("y2", y);
      line.setAttribute("class", "trend-grid-line");
      svg.append(line);
    });

    const polyline = document.createElementNS(svg.namespaceURI, "polyline");
    polyline.setAttribute("points", points);
    polyline.setAttribute("class", "trend-line");
    svg.append(polyline);

    totals.forEach((value, index) => {
      const period = state.periods[index];
      const changeRate = calculateChangeRate(value, totals[index - 1]);
      const changeLabel = changeRate === null ? "전주 비교 없음" : `전주 대비 ${changeRate >= 0 ? "+" : ""}${changeRate.toFixed(1)}%`;
      const changeTone = changeRate === null ? "is-neutral" : changeRate >= 0 ? "is-positive" : "is-negative";
      const pointGroup = document.createElementNS(svg.namespaceURI, "g");
      const hitArea = document.createElementNS(svg.namespaceURI, "circle");
      const point = document.createElementNS(svg.namespaceURI, "circle");
      pointGroup.setAttribute("class", "trend-point-group");
      pointGroup.setAttribute("tabindex", "0");
      pointGroup.setAttribute("role", "img");
      pointGroup.setAttribute("aria-label", `${formatPeriod(period.start, period.end)}, 조회수 ${formatNumber(value)}, ${changeLabel}`);
      pointGroup.dataset.trendPeriod = formatPeriod(period.start, period.end);
      pointGroup.dataset.trendViews = formatNumber(value);
      pointGroup.dataset.trendChange = changeLabel;
      pointGroup.dataset.trendTone = changeTone;
      hitArea.setAttribute("cx", xAt(index));
      hitArea.setAttribute("cy", yAt(value));
      hitArea.setAttribute("r", "12");
      hitArea.setAttribute("class", "trend-hit-area");
      point.setAttribute("cx", xAt(index));
      point.setAttribute("cy", yAt(value));
      point.setAttribute("r", "4");
      point.setAttribute("class", "trend-point");
      const title = document.createElementNS(svg.namespaceURI, "title");
      title.textContent = `${formatPeriod(period.start, period.end)}: 조회수 ${formatNumber(value)}, ${changeLabel}`;
      pointGroup.append(hitArea, point, title);
      svg.append(pointGroup);

      const label = document.createElementNS(svg.namespaceURI, "text");
      label.setAttribute("x", xAt(index));
      label.setAttribute("y", height - 12);
      label.setAttribute("class", "trend-label");
      label.textContent = state.periods[index].start.slice(5).replace("-", "/");
      svg.append(label);
    });

    elements.trend.replaceChildren(svg);
  }

  function insightClass(value) {
    if (value.startsWith("⚠")) return "is-negative";
    if (value.startsWith("▲")) return "is-positive";
    if (value === "안정적") return "is-stable";
    return "is-neutral";
  }

  function renderTable(period) {
    const topRows = [...period.rows].sort((left, right) => right.views - left.views).slice(0, 8);
    elements.tableBody.replaceChildren();
    const hasNoPrevious = period.rows.every((row) => row.insight === "이전 기간 데이터 없음");
    elements.notice.hidden = !hasNoPrevious;
    elements.notice.textContent = hasNoPrevious ? "이 기간은 CSV에서 이전 기간 데이터 없음으로 제공됐습니다." : "";

    topRows.forEach((row) => {
      const tableRow = document.createElement("tr");
      const pageCell = createElement("td", "");
      pageCell.append(createPagePathTrigger("span", "", row.group));
      tableRow.append(pageCell);
      [formatNumber(row.users), formatNumber(row.views), `${row.share.toFixed(2)}%`, row.viewsPerUser.toFixed(2), `${row.engagement.toFixed(1)}초`, `${row.bounce.toFixed(2)}%`].forEach((value) => {
        tableRow.append(createElement("td", "", value));
      });

      const insightCell = createElement("td", "insight-cell");
      row.insight.split(" / ").forEach((insight) => {
        insightCell.append(createElement("span", insightClass(insight), insight));
      });
      tableRow.append(insightCell);
      elements.tableBody.append(tableRow);
    });
  }

  function renderCurrentPeriod() {
    const period = state.periods[state.currentIndex];
    if (!period) return;
    const previousPeriod = state.periods[state.currentIndex - 1] ?? null;
    const periodLabel = formatPeriod(period.start, period.end);
    elements.currentPeriod.textContent = periodLabel;
    elements.viewsChartPeriod.textContent = `${periodLabel} · PC`;
    elements.previousButton.disabled = state.currentIndex === 0;
    elements.nextButton.disabled = state.currentIndex === state.periods.length - 1;
    renderKpis(period, previousPeriod);
    renderHorizontalBars(period);
    renderShareDonut(period);
    renderBounceBars(period);
    renderTable(period);
  }

  function movePeriod(offset) {
    const nextIndex = Math.min(Math.max(state.currentIndex + offset, 0), state.periods.length - 1);
    if (nextIndex === state.currentIndex) return;
    state.currentIndex = nextIndex;
    renderCurrentPeriod();
  }

  function renderError(error) {
    elements.currentPeriod.textContent = "데이터를 불러오지 못했습니다";
    elements.viewsBars.textContent = error.message;
    console.error(error);
  }

  async function initializeReport() {
    if (state.initialized) return;
    state.initialized = true;
    try {
      const response = await fetch(DATA_URL);
      if (!response.ok) throw new Error(`CSV 요청 실패: ${response.status}`);
      const rows = normalizeRows(await response.text());
      state.periods = groupPeriods(rows);
      state.currentIndex = state.periods.length - 1;
      renderTrend();
      renderCurrentPeriod();
    } catch (error) {
      renderError(error);
    }
  }

  elements.previousButton?.addEventListener("click", () => movePeriod(-1));
  elements.nextButton?.addEventListener("click", () => movePeriod(1));
  elements.reportView?.addEventListener("pointerover", (event) => {
    const trigger = findPagePathTrigger(event.target);
    if (trigger && !trigger.contains(event.relatedTarget)) showPageTooltip(trigger);
  });
  elements.reportView?.addEventListener("pointerout", (event) => {
    const trigger = findPagePathTrigger(event.target);
    if (trigger && !trigger.contains(event.relatedTarget)) hidePageTooltip();
  });
  elements.reportView?.addEventListener("focusin", (event) => {
    const trigger = findPagePathTrigger(event.target);
    if (trigger) showPageTooltip(trigger);
  });
  elements.reportView?.addEventListener("focusout", (event) => {
    const trigger = findPagePathTrigger(event.target);
    if (trigger && !trigger.contains(event.relatedTarget)) hidePageTooltip();
  });
  elements.reportView?.addEventListener("click", (event) => {
    const trigger = findPagePathTrigger(event.target);
    if (trigger) showPageTooltip(trigger);
  });
  elements.trend?.addEventListener("pointerover", (event) => {
    const trigger = findTrendTrigger(event.target);
    if (trigger && !trigger.contains(event.relatedTarget)) showTrendTooltip(trigger);
  });
  elements.trend?.addEventListener("pointerout", (event) => {
    const trigger = findTrendTrigger(event.target);
    if (trigger && !trigger.contains(event.relatedTarget)) hideTrendTooltip();
  });
  elements.trend?.addEventListener("focusin", (event) => {
    const trigger = findTrendTrigger(event.target);
    if (trigger) showTrendTooltip(trigger);
  });
  elements.trend?.addEventListener("focusout", (event) => {
    const trigger = findTrendTrigger(event.target);
    if (trigger && !trigger.contains(event.relatedTarget)) hideTrendTooltip();
  });
  elements.trend?.addEventListener("click", (event) => {
    const trigger = findTrendTrigger(event.target);
    if (trigger) showTrendTooltip(trigger);
  });
  document.addEventListener("pointerdown", (event) => {
    if (!findPagePathTrigger(event.target)) hidePageTooltip();
    if (!findTrendTrigger(event.target)) hideTrendTooltip();
  });
  window.addEventListener("resize", hideAllTooltips);
  window.addEventListener("scroll", hideAllTooltips, true);
  window.addEventListener("app:route-change", (event) => {
    if (event.detail.route === "weekly-pages") initializeReport();
  });
  if (window.location.hash.includes("weekly-pages")) initializeReport();
})();
