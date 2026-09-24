(() => {
  const countdown = document.querySelector("#countdown");
  const countdownPanel = countdown?.closest(".countdown-panel");
  const statusElement = document.querySelector("#countdown-status");

  if (!countdown || !countdownPanel || !statusElement) return;

  const groups = Object.fromEntries(
    ["days", "hours", "minutes", "seconds"].map((unit) => [
      unit,
      countdown.querySelector(`[data-unit="${unit}"]`),
    ]),
  );
  const locale = countdown.dataset.locale || document.documentElement.lang || "en";
  const numberFormatter = new Intl.NumberFormat(locale, { minimumIntegerDigits: 2, useGrouping: false });
  const releaseAt = countdownPanel.dataset.releaseAt;
  const deadline = releaseAt ? new Date(releaseAt) : null;
  let lastAnnouncedMinute = null;
  let hasRendered = false;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (!deadline || Number.isNaN(deadline.getTime())) return;

  const releaseDateElement = document.querySelector("#release-date");
  if (releaseDateElement) {
    releaseDateElement.textContent = new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(deadline);
  }

  function updateCountdown() {
    const now = new Date();
    const remaining = deadline.getTime() - now.getTime();

    if (remaining <= 0) {
      setCompleteState();
      return;
    }

    const totalSeconds = Math.floor(remaining / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const shouldAnimate = hasRendered && !reducedMotion.matches;
    updateGroup(groups.days, days, shouldAnimate);
    updateGroup(groups.hours, hours, shouldAnimate);
    updateGroup(groups.minutes, minutes, shouldAnimate);
    updateGroup(groups.seconds, seconds, shouldAnimate);
    hasRendered = true;

    const minuteKey = `${days}:${hours}:${minutes}`;
    if (minuteKey !== lastAnnouncedMinute) {
      const summary = (countdown.dataset.summaryTemplate || "")
        .replace("{days}", numberFormatter.format(days))
        .replace("{hours}", numberFormatter.format(hours))
        .replace("{minutes}", numberFormatter.format(minutes));
      statusElement.textContent = summary;
      countdown.setAttribute("aria-label", summary);
      lastAnnouncedMinute = minuteKey;
    }

    window.setTimeout(updateCountdown, 1000 - now.getMilliseconds());
  }

  function setCompleteState() {
    updateGroup(groups.days, 0, false);
    updateGroup(groups.hours, 0, false);
    updateGroup(groups.minutes, 0, false);
    updateGroup(groups.seconds, 0, false);
    countdown.dataset.state = "complete";
    countdown.setAttribute("aria-label", countdown.dataset.completeLabel || "");
    statusElement.textContent = countdown.dataset.completeStatus || "";
  }

  function updateGroup(group, value, animate) {
    if (!group) return;

    const digits = numberFormatter.format(value).padStart(2, "0").split("");
    group.querySelectorAll(".flip-digit").forEach((digit, index) => {
      updateDigit(digit, digits[index], animate);
    });
  }

  function updateDigit(digit, nextValue, animate) {
    const currentValue = digit.dataset.value || "0";
    if (currentValue === nextValue) return;

    setFace(digit, ".flip-face--static-top", currentValue);
    setFace(digit, ".flip-face--static-bottom", currentValue);
    setFace(digit, ".flip-face--flip-top", nextValue);
    setFace(digit, ".flip-face--flip-bottom", nextValue);
    digit.dataset.value = nextValue;

    if (!animate) {
      setFace(digit, ".flip-face--static-top", nextValue);
      setFace(digit, ".flip-face--static-bottom", nextValue);
      return;
    }

    digit.classList.remove("is-flipping");
    window.requestAnimationFrame(() => digit.classList.add("is-flipping"));
    digit.addEventListener("animationend", () => {
      setFace(digit, ".flip-face--static-top", nextValue);
      setFace(digit, ".flip-face--static-bottom", nextValue);
      digit.classList.remove("is-flipping");
    }, { once: true });
  }

  function setFace(digit, selector, value) {
    const face = digit.querySelector(selector);
    const glyph = face?.querySelector(".flip-glyph");
    if (glyph) glyph.textContent = value;
  }

  updateCountdown();
})();
