// Trava de exibição (carrega no <head>, antes do corpo, em todas as páginas pré-geradas).
// Esconde o HTML pré-gerado até o app desenhar a tela oficial (js/app.js chama revelarApp).
// Se o app não carregar, libera após 1,2 s. Quem não tem JavaScript vê o HTML normalmente.
(function () {
  var d = document.documentElement;
  d.classList.add('spf-pending');
  setTimeout(function () {
    d.classList.remove('spf-pending');
  }, 1200);
})();
