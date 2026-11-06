const faqItems = document.querySelectorAll(".faq-list details");

faqItems.forEach((item) => {
  item.addEventListener("toggle", () => {
    if (!item.open) return;

    faqItems.forEach((other) => {
      if (other !== item) other.open = false;
    });
  });
});

const sections = Array.from(document.querySelectorAll(".sb-left nav a"), (link) => ({
  link,
  section: document.getElementById(link.hash.slice(1)),
}));

function updateCurrentSection() {
  const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
  const linkedSection = atBottom && sections.find(({ link, section }) =>
    link.hash === window.location.hash && section.getBoundingClientRect().top >= -1,
  );
  const current = atBottom
    ? linkedSection || sections[sections.length - 1]
    : sections.filter(({ section }) => section.getBoundingClientRect().top <= 96).pop();

  sections.forEach((item) => {
    const isCurrent = item === current;
    item.link.classList.toggle("active", isCurrent);

    if (isCurrent) {
      item.link.setAttribute("aria-current", "location");
    } else {
      item.link.removeAttribute("aria-current");
    }
  });
}

window.addEventListener("scroll", updateCurrentSection, { passive: true });
window.addEventListener("resize", updateCurrentSection);
window.addEventListener("pageshow", updateCurrentSection);
window.addEventListener("hashchange", updateCurrentSection);
updateCurrentSection();

const bookingNotice = document.getElementById("booking-notice");

if (typeof bookingNotice.showModal === "function") {
  document.querySelectorAll("[data-booking-demo]").forEach((button) => {
    button.disabled = false;
    button.addEventListener("click", () => bookingNotice.showModal());
  });
}

const floatingCta = document.querySelector(".float-cta");

if ("IntersectionObserver" in window) {
  const visibleSections = new Set();
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(({ target, isIntersecting }) => {
      if (isIntersecting) {
        visibleSections.add(target);
      } else {
        visibleSections.delete(target);
      }
    });

    floatingCta.hidden = visibleSections.size > 0;
  });

  document.querySelectorAll(".hero, .closing, .footer").forEach((section) => observer.observe(section));
}
