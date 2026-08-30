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

const brand = document.querySelector(".brand");
if (brand) {
  brand.style.whiteSpace = "nowrap";
  brand.style.fontSize = "19px";
  brand.querySelector("strong").style.fontSize = "24px";
  brand.querySelector("small").style.fontSize = "8px";
}

const heroPhotoStage = document.querySelector(".photos");
if (heroPhotoStage) {
  heroPhotoStage.replaceChildren();
  const track = document.createElement("div");
  track.className = "fv-marquee-track";
  const heroPhotos = [
    ["assets/images/hero-team.webp", "eyebeeのスタッフ集合写真"],
    ["assets/images/hero-reference-center.webp", "eyebeeスタッフの集合写真"],
    ["assets/images/hero-treatment.webp", "アイリストがまつげ施術を行う様子"],
    ["assets/images/hero-outing.webp", "スタッフでの外出イベント写真"],
    ["assets/images/hero-outdoor.webp", "スタッフでの屋外イベント写真"],
    ["assets/images/hero-selfie.webp", "スタッフの自然な集合写真"],
  ];
  [...heroPhotos, ...heroPhotos].forEach(([src, alt], index) => {
    const figure = document.createElement("figure");
    figure.className = "fv-oval";
    const image = document.createElement("img");
    image.src = src;
    image.alt = alt;
    image.loading = index < 4 ? "eager" : "lazy";
    figure.append(image);
    track.append(figure);
  });
  heroPhotoStage.append(track);

  const hero = heroPhotoStage.closest(".hero");
  const logo = document.createElement("img");
  logo.className = "fv-logo";
  logo.src = "assets/images/studio-logo.webp";
  logo.alt = "eyebee ロゴ";
  hero.append(logo);

  const heading = hero.querySelector("h1");
  heading.innerHTML = '<span>「家族」</span>も<span>「自分」</span>も大切にできる職場';
  hero.querySelector(".herotext p").innerHTML = '月収40万目指せるのに<span>18時</span>に帰れて<span>土曜や日曜</span>も休める';
  hero.querySelector(".question").innerHTML = '<span>同業者もびっくりな</span><p>ホワイト企業で<br><strong>アイリスト</strong>を<br><strong>目指しませんか？</strong></p>';
}

const benefitIcons = [
  "assets/images/benefit-icon-01.svg",
  "assets/images/benefit-icon-02.svg",
  "assets/images/benefit-icon-03.svg",
  "assets/images/benefit-icon-04.svg",
  "assets/images/benefit-icon-05.svg",
  "assets/images/benefit-icon-06.svg",
];
document.querySelectorAll(".benefits .circles > div").forEach((card, index) => {
  const icon = document.createElement("img");
  icon.className = "benefit-icon";
  icon.src = benefitIcons[index];
  icon.alt = "";
  icon.setAttribute("aria-hidden", "true");
  card.prepend(icon);
});

const welfareCircles = document.querySelector(".welfare .circles");
if (welfareCircles) {
  welfareCircles.replaceChildren();
  [
    ["assets/images/welfare-icon-maternity.webp", "産休・育休制度"],
    ["assets/images/benefit-icon-02.svg", "有給休暇"],
    ["assets/images/welfare-icon-insurance.webp", "社会保険完備"],
  ].forEach(([src, label]) => {
    const card = document.createElement("div");
    card.className = "welfare-card";
    const icon = document.createElement("img");
    icon.src = src;
    icon.alt = "";
    icon.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.textContent = label;
    card.append(icon, text);
    welfareCircles.append(card);
  });
}

const promiseSection = document.querySelector(".promise");
if (promiseSection) {
  const founderMessage = document.createElement("section");
  founderMessage.className = "founder-message";
  founderMessage.innerHTML = `
    <p>はじめまして、「eyelashsalon eyebee」のフランチャイズ本部代表の相澤久美子です。</p>
    <p>私が以前、美容師として7年勤めた会社では、女性が結婚・出産を理由にキャリアを捨てないといけない職場でした。</p>
    <p>『そんな社会が理解できない！女性だれもが大好きな仕事を続けながら大切な家族や友人との時間も楽しめる環境を作りたい。』</p>
    <p>という強い想いから、その後アイリストに転職し、eyebeeというどこにもない雇用環境を整えた今のサロンを立ち上げました。</p>
    <img src="assets/images/founder.webp" alt="eyelashsalon eyebee フランチャイズ本部代表 相澤久美子">
  `;
  promiseSection.insertAdjacentElement("afterend", founderMessage);
}

const imageAssignments = [
  [".reason:nth-of-type(1)", "assets/images/team-large.webp", "eyebeeスタッフの集合写真"],
  [".reason:nth-of-type(2)", "assets/images/family-support.webp", "子育てを支えるスタッフの様子"],
  [".reason:nth-of-type(3)", "assets/images/training.webp", "カウンセリングを通じた技術指導の様子"],
  [".reason:nth-of-type(4)", "assets/images/studio-nail-work.webp", "スタッフが施術を行う様子"],
  [".reason:nth-of-type(5)", "assets/images/team-event.webp", "スタッフでのイベント写真"],
];

imageAssignments.forEach(([selector, src, alt], index) => {
  const target = document.querySelector(selector);
  if (!target) return;
  const image = document.createElement("img");
  image.src = src;
  image.alt = alt;
  image.loading = index > 1 ? "lazy" : "eager";
  image.className = "reason-photo";
  const heading = target.querySelector("h2");
  if (heading) {
    heading.insertAdjacentElement("afterend", image);
  } else {
    target.prepend(image);
  }
});

const worklifeSchedule = document.querySelector(".reason:nth-of-type(1) .schedule");
if (worklifeSchedule) {
  worklifeSchedule.replaceChildren();
  [
    ["assets/images/studio-schedule-a.webp", "未経験からアイリストになった正社員の一日"],
    ["assets/images/studio-schedule-b.webp", "子育てをしながら働くパートスタッフの一日"],
    ["assets/images/studio-schedule-c.webp", "時短パートスタッフの一日"],
  ].forEach(([src, alt]) => {
    const image = document.createElement("img");
    image.src = src;
    image.alt = alt;
    image.loading = "lazy";
    worklifeSchedule.append(image);
  });
}

const trainingPlan = document.querySelector(".reason:nth-of-type(3) .training");
if (trainingPlan) {
  trainingPlan.replaceChildren();
  const image = document.createElement("img");
  image.src = "assets/images/training-roadmap.webp";
  image.alt = "まつ毛パーマからボリュームラッシュまでの研修ロードマップ";
  image.loading = "lazy";
  trainingPlan.append(image);
}

const trainingSection = document.querySelector(".reason:nth-of-type(3)");
if (trainingSection) {
  const gallery = document.createElement("div");
  gallery.className = "training-gallery";
  [
    ["assets/images/studio-training-room.webp", "スタッフが研修を受ける様子"],
    ["assets/images/studio-lash-tools.webp", "まつげ施術で使う商材"],
  ].forEach(([src, alt]) => {
    const image = document.createElement("img");
    image.src = src;
    image.alt = alt;
    image.loading = "lazy";
    gallery.append(image);
  });
  trainingSection.append(gallery);
}

const legalSection = document.querySelector(".reason:nth-of-type(4)");
if (legalSection) {
  const image = document.createElement("img");
  image.className = "supporting-photo";
  image.src = "assets/images/studio-family-event.webp";
  image.alt = "子どもの学校行事のイメージ";
  image.loading = "lazy";
  legalSection.append(image);
}

const salaryModels = document.querySelector(".salary");
if (salaryModels) {
  salaryModels.replaceChildren();
  [
    ["assets/images/studio-salary-36.webp", "入社1年目スタッフの月額36万円モデル"],
    ["assets/images/studio-salary-49.webp", "パート時短スタッフの月額49万円モデル"],
    ["assets/images/studio-salary-55.webp", "正社員スタッフの月額55万円モデル"],
  ].forEach(([src, alt]) => {
    const image = document.createElement("img");
    image.src = src;
    image.alt = alt;
    image.loading = "lazy";
    salaryModels.append(image);
  });
}

const closing = document.querySelector(".closing");
if (closing) {
  const videoPreviews = document.createElement("div");
  videoPreviews.className = "cta-video-previews";
  [
    ["assets/images/studio-live-video-1.webp", "求人説明ライブ動画の画面"],
    ["assets/images/studio-live-video-2.webp", "求人説明ライブ動画の画面"],
  ].forEach(([src, alt]) => {
    const image = document.createElement("img");
    image.src = src;
    image.alt = alt;
    image.loading = "lazy";
    videoPreviews.append(image);
  });
  closing.append(videoPreviews);
}

const voiceAssignments = [
  [".reason:nth-of-type(2)", "paired", [
    ["assets/images/staff-voice-family.webp", "子育てと仕事を両立するeyebeeスタッフ", "assets/images/voice-family-trip.webp", "休みには家族旅行に行けるので助かります"],
    ["assets/images/staff-voice-returned.webp", "出産後に復帰したeyebeeスタッフ", "assets/images/voice-returned.webp", "私も出産してから復帰しました"],
  ]],
  [".reason:nth-of-type(3)", "stacked", [
    ["assets/images/staff-voice-training.webp", "未経験からアイリストになったeyebeeスタッフ", "assets/images/voice-unexperienced.webp", "未経験からアイリストになったスタッフの声"],
  ]],
  [".reason:nth-of-type(4)", "split", [
    ["assets/images/staff-voice-leave.webp", "有休を活用するeyebeeスタッフ", "assets/images/voice-leave-policy.webp", "有休制度へのスタッフの声", "assets/images/voice-hourly-leave.webp", "1時間単位で有休がとれることへのスタッフの声"],
  ]],
  [".reason:nth-of-type(5)", "paired", [
    ["assets/images/staff-voice-team.webp", "チームで支え合うeyebeeスタッフ", "assets/images/voice-team-support.webp", "チームで子どもの悩みも相談できるスタッフの声"],
  ]],
];

voiceAssignments.forEach(([selector, layout, pairs]) => {
  const target = document.querySelector(selector);
  if (!target) return;
  const group = document.createElement("div");
  group.className = `supporting-voices supporting-voices--${layout}`;

  if (layout === "split") {
    const [staffSrc, staffAlt, leftSrc, leftAlt, rightSrc, rightAlt] = pairs[0];
    [[leftSrc, leftAlt, "voice-bubble--left"], [staffSrc, staffAlt, "voice-staff-photo"], [rightSrc, rightAlt, "voice-bubble--right"]].forEach(([src, alt, className]) => {
      const image = document.createElement("img");
      image.className = className;
      image.src = src;
      image.alt = alt;
      image.loading = "lazy";
      group.append(image);
    });
  } else {
    pairs.forEach(([staffSrc, staffAlt, bubbleSrc, bubbleAlt], index) => {
      const pair = document.createElement("div");
      pair.className = "voice-pair";
      const staffImage = document.createElement("img");
      staffImage.className = "voice-staff-photo";
      staffImage.src = staffSrc;
      staffImage.alt = staffAlt;
      staffImage.loading = "lazy";
      const bubble = document.createElement("img");
      bubble.className = "voice-bubble";
      bubble.src = bubbleSrc;
      bubble.alt = bubbleAlt;
      bubble.loading = "lazy";
      pair.append(staffImage, bubble);
      group.append(pair);
    });
  }
  target.append(group);
});

const photoStyles = document.createElement("style");
photoStyles.textContent = `
  .hero { padding: 13px 0 0; background: #e8f5f1; }
  .hero::before { content: ""; position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse at 95% 4%, rgba(162, 207, 112, .72) 0 2%, transparent 2.4%), radial-gradient(ellipse at 2% 94%, rgba(162, 207, 112, .52) 0 2%, transparent 2.4%); opacity: .85; }
  .hero > .eyebrow { position: relative; margin: 0 0 1px 112px; text-align: left; font-size: 13px; letter-spacing: .02em; }
  .hero .brand { position: relative; margin: 0 0 12px 113px; text-align: left; color: #55aa95; font-size: 23px; }
  .hero .brand strong { font-size: 26px; }
  .hero .brand small { font-size: 9px; }
  .fv-logo { position: absolute; top: 9px; left: 20px; z-index: 2; width: 82px; height: 82px; object-fit: contain; }
  .photos { position: relative; display: block; height: 356px; margin: 0; overflow: hidden; background: #e8f5f1; }
  /* The base template targets every .photos div. Reset that styling on the loop track. */
  .photos .fv-marquee-track { position: absolute; top: 0; left: 0; display: flex; align-items: flex-start; justify-content: flex-start; min-height: 0; height: 390px; width: max-content; gap: 18px; padding: 0; background: transparent; color: inherit; font: inherit; text-shadow: none; animation: fvPhotoLoop 46s linear infinite; will-change: transform; }
  .fv-oval { width: 286px; height: 386px; flex: 0 0 286px; margin: 0; overflow: hidden; background: #e8f5f1; border-radius: 50% 50% 0 0 / 28% 28% 0 0; }
  .fv-oval img { width: 100%; height: 100%; display: block; object-fit: cover; }
  .fv-oval:nth-child(3n + 1) img { object-position: 56% center; }
  .fv-oval:nth-child(3n + 2) img { object-position: 50% 43%; }
  .fv-oval:nth-child(3n + 3) img { object-position: 36% center; }
  @keyframes fvPhotoLoop { from { transform: translateX(-132px); } to { transform: translateX(calc(-50% - 141px)); } }
  .photos:hover .fv-marquee-track { animation-play-state: paused; }
  .herotext { position: relative; z-index: 3; margin: -1px 0 0; padding: 0 20px; }
  .hero h1 { padding: 9px 8px; background: rgba(255,255,255,.96); font-size: 24px; line-height: 1.35; letter-spacing: -.04em; white-space: nowrap; }
  .hero h1 span { color: #ca9d58; }
  .herotext p { margin: 14px 0 0; padding: 7px 8px; background: rgba(255,255,255,.96); font-size: 15px; line-height: 1.35; white-space: nowrap; }
  .herotext p span { color: #c5954d; }
  .question { display: block; margin: 28px 28px 42px; color: #3c9b86; text-align: center; }
  .question > span { display: inline-block; margin-bottom: 8px; padding: 4px 34px; border-top: 1px solid #3c9b86; border-bottom: 1px solid #3c9b86; font-size: 13px; line-height: 1.45; }
  .question p { margin: 0; color: #3c9b86; font-family: "Noto Serif JP", serif; font-size: 22px; line-height: 1.4; font-weight: 500; }
  .question strong { font-size: 28px; font-weight: 700; }
  .benefits .circles div { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; }
  .benefit-icon { width: 43px; height: 43px; object-fit: contain; }
  .welfare { background: #fffdf7; }
  .welfare h2 { position: relative; margin-bottom: 58px; color: #3c9b86; }
  .welfare h2::after { content: ""; position: absolute; bottom: -10px; left: 50%; width: 136px; border-bottom: 4px dotted #3c9b86; transform: translateX(-50%); }
  .welfare .circles.mini { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px 20px; }
  .welfare .circles.mini .welfare-card { width: 100%; max-width: none; padding: 18px 8px; border: 3px double rgba(255,255,255,.85); border-radius: 50%; background: #d6b47e; color: #fff; aspect-ratio: 1; }
  .welfare .circles.mini .welfare-card:nth-child(3) { grid-column: 1 / -1; width: calc(50% - 10px); }
  .welfare-card img { width: 55px; height: 55px; margin-bottom: 7px; object-fit: contain; }
  .welfare-card span { color: #fff; font-size: 15px; font-weight: 700; line-height: 1.35; white-space: nowrap; }
  .founder-message { padding: 48px 38px 0; background: #fffdf7; color: #313a3d; }
  .founder-message p { margin: 0 0 12px; font-size: 16px; line-height: 2.2; letter-spacing: .02em; }
  .founder-message img { display: block; width: min(100%, 360px); height: 456px; margin: 34px auto 0; object-fit: cover; object-position: center 42%; border-radius: 50% 50% 0 0 / 22% 22% 0 0; }
  .reason { overflow: hidden; }
  .reason-photo { width: min(100%, 360px); max-height: 260px; margin: 18px auto 24px; object-fit: cover; border-radius: 20px; display: block; box-shadow: 0 12px 28px rgba(82, 65, 43, .16); }
  .reason:nth-of-type(2) .reason-photo, .reason:nth-of-type(4) .reason-photo { aspect-ratio: 4 / 3; object-position: center; }
  .schedule { grid-template-columns: repeat(3, 1fr); align-items: start; gap: 6px; }
  .schedule img { width: 100%; padding: 0; border-radius: 0; background: transparent; object-fit: contain; }
  .training { display: block; margin-top: 26px; }
  .training img { display: block; width: 100%; border-radius: 12px; background: #fff; }
  .training-gallery { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-top: 20px; }
  .training-gallery img { width: 100%; aspect-ratio: 1.5 / 1; object-fit: cover; border-radius: 12px; }
  .supporting-photo { display: block; width: min(100%, 330px); margin: 22px auto 0; border-radius: 12px; object-fit: cover; }
  .supporting-voices { margin-top: 26px; }
  .voice-pair { display: flex; align-items: center; justify-content: center; gap: 14px; }
  .voice-pair + .voice-pair { margin-top: 14px; }
  .voice-staff-photo { width: 128px; height: 128px; flex: 0 0 128px; border-radius: 50%; object-fit: cover; box-shadow: 0 5px 13px rgba(82, 65, 43, .13); }
  .voice-bubble { width: min(59%, 238px); height: auto; object-fit: contain; }
  .supporting-voices--stacked .voice-pair { flex-direction: column-reverse; gap: 8px; }
  .supporting-voices--stacked .voice-staff-photo { width: 160px; height: 160px; flex-basis: 160px; }
  .supporting-voices--stacked .voice-bubble { width: min(78%, 260px); }
  .supporting-voices--split { display: grid; grid-template-columns: minmax(0, 1fr) 124px minmax(0, 1fr); align-items: center; gap: 6px; }
  .supporting-voices--split .voice-staff-photo { width: 124px; height: 124px; }
  .supporting-voices--split .voice-bubble--left, .supporting-voices--split .voice-bubble--right { width: 100%; height: auto; object-fit: contain; }
  .salary { grid-template-columns: 1fr; gap: 16px; margin: 24px auto 0; }
  .salary img { display: block; width: 100%; border-radius: 10px; box-shadow: 0 8px 20px rgba(82, 65, 43, .11); }
  .closing { background: url("assets/images/studio-cta-bg.webp") center / cover, linear-gradient(145deg, #e0f4ed, #fff9e7); }
  .cta-video-previews { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-top: 28px; }
  .cta-video-previews img { width: 100%; aspect-ratio: .58; object-fit: cover; object-position: top; border-radius: 12px; box-shadow: 0 10px 24px rgba(63, 89, 71, .16); }
  @media (min-width: 961px) { .reason-photo { max-width: 400px; } }
  @media (max-width: 420px) { .hero > .eyebrow { margin-left: 99px; font-size: 11px; } .hero .brand { margin-left: 99px; font-size: 18px; } .hero .brand strong { font-size: 22px; } .fv-logo { left: 15px; width: 74px; height: 74px; } .photos { height: 292px; } .photos .fv-marquee-track { gap: 16px; height: 320px; } .fv-oval { width: 242px; height: 320px; flex-basis: 242px; } @keyframes fvPhotoLoop { from { transform: translateX(-112px); } to { transform: translateX(calc(-50% - 120px)); } } .hero h1 { font-size: 18px; } .herotext p { font-size: 11px; } .question { margin: 22px 22px 36px; } .question > span { font-size: 11px; } .question p { font-size: 19px; } .question strong { font-size: 25px; } }
  @media (prefers-reduced-motion: reduce) { .fv-marquee-track { animation: none; transform: translateX(-132px); } }
`;
document.head.append(photoStyles);

const navLinks = document.querySelectorAll(".left nav a");
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
