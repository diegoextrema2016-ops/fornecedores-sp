// Landing de apresentação: o botão central de reprodução sobre a capa do vídeo.
// Some quando o vídeo toca e volta quando pausa ou termina. Sem dependências.
(function () {
  var video = document.querySelector('.video video');
  var button = document.getElementById('play-btn');
  if (!video || !button) return;

  button.addEventListener('click', function () {
    var p = video.play();
    if (p && p.catch) p.catch(function () {});
  });
  video.addEventListener('play', function () { button.hidden = true; });
  video.addEventListener('pause', function () { button.hidden = false; });
  video.addEventListener('ended', function () { button.hidden = false; });
})();
