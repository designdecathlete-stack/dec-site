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

const updateActiveNav = () => {
  const currentY = window.scrollY + 180;
  let current = sections[0];

  sections.forEach((item) => {
    if (item.section.offsetTop <= currentY) current = item;
  });

  navLinks.forEach((link) => link.classList.remove("active"));
  if (current) current.link.classList.add("active");
};

window.addEventListener("scroll", updateActiveNav, { passive: true });
window.addEventListener("load", updateActiveNav);
updateActiveNav();

const reasonCarousel = document.querySelector(".reason-carousel");
const reasonCards = reasonCarousel ? Array.from(reasonCarousel.querySelectorAll(".reason-card")) : [];

if (reasonCarousel && reasonCards.length > 1) {
  const dots = document.createElement("div");
  dots.className = "reason-dots";
  dots.setAttribute("aria-label", "安心ポイントの表示位置");
  reasonCarousel.classList.add("has-controls");

  const dotButtons = reasonCards.map((card, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", `${index + 1}項目目を表示`);
    if (index === 0) button.classList.add("is-active");

    button.addEventListener("click", () => {
      card.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
    });

    dots.appendChild(button);
    return button;
  });

  reasonCarousel.after(dots);

  let ticking = false;
  let activeReasonIndex = 0;

  const updateReasonDots = () => {
    const carouselLeft = reasonCarousel.getBoundingClientRect().left;
    activeReasonIndex = reasonCards.reduce(
      (closest, card, index) => {
        const distance = Math.abs(card.getBoundingClientRect().left - carouselLeft);
        return distance < closest.distance ? { index, distance } : closest;
      },
      { index: 0, distance: Infinity }
    ).index;

    dotButtons.forEach((button, index) => {
      button.classList.toggle("is-active", index === activeReasonIndex);
    });
    ticking = false;
  };

  reasonCarousel.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(updateReasonDots);
    },
    { passive: true }
  );

  window.addEventListener("resize", updateReasonDots);
  updateReasonDots();
}
