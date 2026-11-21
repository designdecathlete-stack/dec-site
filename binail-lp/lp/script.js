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

const config = window.BINAIL_CONFIG || {};
const isKorean = document.documentElement.lang === 'ko';
for (const [selector, url, note] of [['[data-reservation]', config.reservationUrl, '[data-reservation-note]'], ['[data-instagram]', config.instagramUrl, '[data-instagram-note]']]) {
  document.querySelectorAll(selector).forEach(button => {
    if (!url) { button.disabled = true; button.title = isKorean ? '링크는 준비 중입니다' : 'URLは準備中です'; button.setAttribute('aria-label', button.textContent.trim() + (isKorean ? ' (링크 준비 중)' : '（URL準備中）')); }
    else button.addEventListener('click', () => { window.location.href = url; });
  });
  if (url) document.querySelectorAll(note).forEach(el => el.hidden = true);
}
