(() => {
  const DEFAULT_ROUTE = "definition";
  const ROUTE_TITLES = {
    definition: "닥터빌 GA4 정의서",
    "weekly-pages": "주간 페이지별 리포트 | 닥터빌 GA4",
    "ai-seminar-lab": "Medical Seminar AI Lab | 닥터빌",
  };
  const ALLOWED_ROUTES = new Set(Object.keys(ROUTE_TITLES));
  const routeLinks = [...document.querySelectorAll("[data-route-link]")];
  const routeViews = [...document.querySelectorAll("[data-view]")];
  const definitionNavigation = [...document.querySelectorAll("[data-definition-nav]")];
  const footer = document.querySelector(".spec-footer");

  function parseRoute() {
    const value = window.location.hash.replace(/^#\/?/, "");
    if (!value) return { route: DEFAULT_ROUTE, section: "" };

    const [route, section = ""] = value.split("/");
    if (ALLOWED_ROUTES.has(route)) return { route, section: route === "definition" ? section : "" };
    if (document.getElementById(route)) return { route: DEFAULT_ROUTE, section: route };
    return { route: DEFAULT_ROUTE, section: "" };
  }

  function updateRoute() {
    const { route, section } = parseRoute();
    document.body.dataset.route = route;

    routeViews.forEach((view) => {
      view.hidden = view.dataset.view !== route;
    });

    routeLinks.forEach((link) => {
      const isActive = link.dataset.routeLink === route;
      link.classList.toggle("is-active", isActive);
      if (isActive) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });

    definitionNavigation.forEach((item) => {
      item.hidden = route !== "definition";
    });

    if (footer) footer.hidden = route !== "definition";
    document.title = ROUTE_TITLES[route];

    requestAnimationFrame(() => {
      if (route === "definition" && section) {
        document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });

    window.dispatchEvent(new CustomEvent("app:route-change", { detail: { route } }));
  }

  window.addEventListener("hashchange", updateRoute);
  updateRoute();
})();
