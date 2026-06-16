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
