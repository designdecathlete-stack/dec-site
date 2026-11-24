const reveals = document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.14 }
  );

  reveals.forEach((target) => observer.observe(target));
} else {
  reveals.forEach((target) => target.classList.add("visible"));
}

const revealVisibleInViewport = () => {
  reveals.forEach((target) => {
    const rect = target.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.92 && rect.bottom > 0) {
      target.classList.add("visible");
    }
  });
};

window.addEventListener("load", revealVisibleInViewport);
window.addEventListener("hashchange", () => {
  window.setTimeout(revealVisibleInViewport, 120);
});

document.querySelectorAll("details").forEach((detail) => {
  detail.addEventListener("toggle", () => {
    if (!detail.open) return;

    document.querySelectorAll("details[open]").forEach((current) => {
      if (current !== detail) current.open = false;
    });
  });
});

const navLinks = document.querySelectorAll(".sb-left nav a");
const sections = Array.from(navLinks)
  .map((link) => {
    const id = link.getAttribute("href").replace("#", "");
    return { link, section: document.getElementById(id) };
  })
  .filter((item) => item.section);

window.addEventListener(
  "scroll",
  () => {
    const currentY = window.scrollY + 180;
    let current = sections[0];

    sections.forEach((item) => {
      if (item.section.offsetTop <= currentY) current = item;
    });

    navLinks.forEach((link) => link.classList.remove("active"));
    if (current) current.link.classList.add("active");
  },
  { passive: true }
);


// Keep the mobile fixed CTA hidden until the hero CTA has passed above the viewport.
(() => {
  const heroCta = document.querySelector(".hero-cta");
  const fixedCta = document.querySelector(".float-cta");
  if (!heroCta || !fixedCta) return;

  const mobileViewport = window.matchMedia("(max-width: 960px)");
  let isVisible;

  const setVisibility = (visible) => {
    if (visible === isVisible) return;
    isVisible = visible;
    fixedCta.classList.toggle("is-visible", visible);
    fixedCta.setAttribute("aria-hidden", String(!visible));
    fixedCta.inert = !visible;
  };

  const syncVisibility = () => {
    setVisibility(mobileViewport.matches && heroCta.getBoundingClientRect().bottom < 0);
  };

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(syncVisibility, { threshold: 0 });
    observer.observe(heroCta);
  }

  // Also handle fast scroll jumps that skip the CTA in a single frame.
  window.addEventListener("scroll", syncVisibility, { passive: true });

  // Recheck restored scroll positions and changes between mobile and desktop.
  window.addEventListener("pageshow", syncVisibility);
  window.addEventListener("resize", syncVisibility);
  syncVisibility();
})();
