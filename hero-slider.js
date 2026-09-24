(() => {
  const slider = document.querySelector("[data-hero-slider]");
  if (!slider) return;

  const slides = [...slider.querySelectorAll("[data-hero-slide]")];
  const title = slider.querySelector("[data-hero-title]");
  const eyebrow = slider.querySelector("[data-hero-eyebrow]");
  const dots = [...slider.querySelectorAll("[data-hero-dot]")];
  const status = slider.querySelector("[data-hero-status]");
  const previousButton = slider.querySelector("[data-hero-previous]");
  const nextButton = slider.querySelector("[data-hero-next]");
  const toggleButton = slider.querySelector("[data-hero-toggle]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const translations = {
    pause: toggleButton?.getAttribute("data-label-pause") || "",
    play: toggleButton?.getAttribute("data-label-play") || "",
  };
  const autoplayDelay = 7000;
  let activeIndex = 0;
  let autoplayTimer = null;
  let isPaused = false;
  let isPointerOver = false;
  let isFocusWithin = false;

  function showSlide(nextIndex) {
    activeIndex = (nextIndex + slides.length) % slides.length;

    slides.forEach((slide, index) => {
      const isActive = index === activeIndex;
      slide.classList.toggle("is-active", isActive);
      slide.setAttribute("aria-hidden", String(!isActive));
      slide.toggleAttribute("inert", !isActive);
    });

    dots.forEach((dot, index) => {
      const isActive = index === activeIndex;
      dot.classList.toggle("is-active", isActive);
      dot.setAttribute("aria-pressed", String(isActive));
    });

    if (status) status.textContent = `${String(activeIndex + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}`;
    if (title) title.textContent = slides[activeIndex].dataset.title || "";
    if (eyebrow) {
      const mark = eyebrow.querySelector(".eyebrow-mark");
      eyebrow.textContent = slides[activeIndex].dataset.eyebrow || "";
      if (mark) eyebrow.prepend(mark);
    }

    slider.classList.add("is-changing");
    window.requestAnimationFrame(() => slider.classList.remove("is-changing"));
  }

  function shouldAutoplay() {
    return !reducedMotion.matches && !isPaused && !isPointerOver && !isFocusWithin && !document.hidden;
  }

  function scheduleAutoplay() {
    window.clearTimeout(autoplayTimer);
    autoplayTimer = null;
    if (!shouldAutoplay()) return;

    autoplayTimer = window.setTimeout(() => {
      showSlide(activeIndex + 1);
      scheduleAutoplay();
    }, autoplayDelay);
  }

  function goToSlide(nextIndex) {
    showSlide(nextIndex);
    scheduleAutoplay();
  }

  function updateToggleLabel() {
    if (!toggleButton) return;
    const paused = isPaused || reducedMotion.matches;
    toggleButton.setAttribute("aria-label", paused ? translations.play : translations.pause);
    toggleButton.setAttribute("aria-pressed", String(paused));
    toggleButton.classList.toggle("is-paused", paused);
  }

  previousButton?.addEventListener("click", () => goToSlide(activeIndex - 1));
  nextButton?.addEventListener("click", () => goToSlide(activeIndex + 1));
  dots.forEach((dot, index) => dot.addEventListener("click", () => goToSlide(index)));
  toggleButton?.addEventListener("click", () => {
    isPaused = !isPaused;
    updateToggleLabel();
    scheduleAutoplay();
  });
  slider.addEventListener("pointerenter", () => {
    isPointerOver = true;
    scheduleAutoplay();
  });
  slider.addEventListener("pointerleave", () => {
    isPointerOver = false;
    scheduleAutoplay();
  });
  slider.addEventListener("focusin", () => {
    isFocusWithin = true;
    scheduleAutoplay();
  });
  slider.addEventListener("focusout", (event) => {
    isFocusWithin = slider.contains(event.relatedTarget);
    scheduleAutoplay();
  });
  document.addEventListener("visibilitychange", scheduleAutoplay);
  reducedMotion.addEventListener("change", () => {
    updateToggleLabel();
    scheduleAutoplay();
  });

  showSlide(0);
  updateToggleLabel();
  scheduleAutoplay();
})();
