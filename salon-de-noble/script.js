// 画像の相対パスは index.html 基準。
const settings = {
  mapUrl: "",
  // 完成画像は assets/artwork に置く。読み込めた画像から仮表示を切り替える。
  artwork: {
    hero: {
      src: "assets/artwork/salon-de-noble-fv-new.webp",
      alt: "Salon de Noble（サロン・ド・ノーブル）。肌質改善専門サロン。",
    },
    offer: {
      src: "assets/artwork/salon-de-noble-first-offer-new.webp",
      alt: "通常16,500円。初回6,600円（税込）。カウンセリング込み120分。",
    },
  },
};

function httpsUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

const mapUrl = httpsUrl(settings.mapUrl);
if (mapUrl) {
  const mapLink = document.querySelector("[data-map-link]");
  mapLink.href = mapUrl;
  mapLink.hidden = false;
}

document.querySelectorAll("[data-artwork]").forEach((block) => {
  const type = block.dataset.artwork;
  const artwork = settings.artwork[type];
  if (!artwork.src || !artwork.alt.trim()) return;

  const image = block.querySelector("[data-artwork-image]");
  image.alt = artwork.alt;
  image.addEventListener("load", () => {
    block.querySelector("h1, h3").classList.add("sr-only");
    block.querySelector("[data-artwork-fallback]").hidden = true;
    image.hidden = false;
    document.body.classList.add(`has-${type}-art`);
    if (type === "hero" && "IntersectionObserver" in window) {
      const button = document.querySelector(".hero-actions [data-reservation]");
      new IntersectionObserver(([entry]) => {
        document.body.classList.toggle("hero-cta-visible", entry.intersectionRatio >= 0.99);
      }, { threshold: 0.99 }).observe(button);
    }
  }, { once: true });
  image.src = artwork.src;
});

const sections = [...document.querySelectorAll(".sb-left nav a")].map((link) => ({
  link,
  section: document.getElementById(link.hash.slice(1)),
}));
let activeLink;

function updateNav() {
  const readingLine = window.innerHeight * 0.23;
  let current = sections[0];
  for (const item of sections) {
    if (item.section.getBoundingClientRect().top > readingLine) break;
    current = item;
  }
  if (current.link !== activeLink) {
    activeLink?.removeAttribute("aria-current");
    current.link.setAttribute("aria-current", "location");
    activeLink = current.link;
  }
}

window.addEventListener("scroll", updateNav, { passive: true });
window.addEventListener("resize", updateNav);
window.addEventListener("load", updateNav, { once: true });
updateNav();

const reviewTrack = document.querySelector(".review-track");
const reviewSlides = [...reviewTrack.children];
const reviewNav = document.querySelector(".review-nav");
const reviewPrevious = reviewNav.querySelector(".review-prev");
const reviewNext = reviewNav.querySelector(".review-next");
const reviewPosition = reviewNav.querySelector(".review-position");
let activeReview = 0;

function updateReviews() {
  const step = reviewSlides[1].offsetLeft - reviewSlides[0].offsetLeft;
  activeReview = Math.max(0, Math.min(reviewSlides.length - 1, Math.round(reviewTrack.scrollLeft / step)));
  reviewTrack.style.height = `${Math.ceil(reviewSlides[activeReview].getBoundingClientRect().height)}px`;
  reviewPrevious.disabled = activeReview === 0;
  reviewNext.disabled = activeReview === reviewSlides.length - 1;
  const position = `${activeReview + 1} / ${reviewSlides.length}`;
  if (reviewPosition.value !== position) reviewPosition.value = position;
}

function moveReview(direction) {
  const target = reviewSlides[activeReview + direction];
  if (target) reviewTrack.scrollTo({
    left: target.offsetLeft,
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
  });
}

reviewTrack.classList.add("is-enhanced");
reviewNav.hidden = false;
reviewTrack.addEventListener("scroll", updateReviews, { passive: true });
window.addEventListener("resize", updateReviews);
reviewPrevious.addEventListener("click", () => moveReview(-1));
reviewNext.addEventListener("click", () => moveReview(1));
reviewTrack.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  moveReview(event.key === "ArrowLeft" ? -1 : 1);
});
updateReviews();
