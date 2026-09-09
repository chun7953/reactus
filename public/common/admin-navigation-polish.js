function installBackToTop() {
  if (document.querySelector('#reactusBackToTop')) return;
  const button = document.createElement('button');
  button.id = 'reactusBackToTop';
  button.type = 'button';
  button.className = 'small';
  button.textContent = '↑ 上へ';
  button.hidden = true;
  button.setAttribute('aria-label', 'ページ上部へ戻る');
  button.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  document.body.append(button);

  const update = () => {
    button.hidden = window.scrollY < 700;
  };
  window.addEventListener('scroll', update, { passive: true });
  update();
}

function installStyles() {
  if (document.querySelector('#reactusNavigationPolishStyles')) return;
  const style = document.createElement('style');
  style.id = 'reactusNavigationPolishStyles';
  style.textContent = `
    #reactusBackToTop{position:fixed;right:18px;bottom:18px;z-index:10010;padding:9px 12px;background:#172231;border:1px solid #3b4b60;box-shadow:0 8px 24px rgba(0,0,0,.28)}
    #reactusBackToTop[hidden]{display:none}
    @media(max-width:720px){#reactusBackToTop{right:12px;bottom:12px}}
  `;
  document.head.append(style);
}

installStyles();
installBackToTop();
