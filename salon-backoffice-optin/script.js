// LINEの友だち追加URLが確定したら設定してください。
const LINE_URL = '';
document.querySelectorAll('[data-line-cta]').forEach(link=>{
  if(LINE_URL){link.href=LINE_URL;}
  else{link.addEventListener('click',()=>{const status=document.querySelector('#line-status');status.hidden=false;status.textContent='LINEの登録先URLは現在未設定です。';});}
});
const links=[...document.querySelectorAll('nav a')];const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){links.forEach(link=>link.classList.toggle('active',link.hash==='#'+entry.target.id));}});},{rootMargin:'-10% 0px -60% 0px'});links.forEach(link=>{const target=document.querySelector(link.hash);if(target)observer.observe(target);});
