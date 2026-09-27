// SheetClerk: abre la página en el idioma de cada persona (primera visita) y recuerda la elección del selector.
(function () {
  var PAGINAS = { es: '/pdf-a-excel/', en: '/en/', pt: '/pt/', fr: '/fr/', de: '/de/', it: '/it/' };
  var CLAVE = 'sheetclerk-idioma';
  var actual = (document.documentElement.lang || 'es').slice(0, 2);
  var elegido = null;
  try { elegido = localStorage.getItem(CLAVE); } catch (e) { }
  // Al elegir un idioma en el selector, se recuerda
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-lang]');
    if (a) try { localStorage.setItem(CLAVE, a.getAttribute('data-lang')); } catch (err) { }
  });
  // Buscadores y la página de contadores (Colombia) no se redirigen
  if (/bot|crawl|spider|slurp|lighthouse|headless/i.test(navigator.userAgent) || location.pathname.indexOf('/contadores/') === 0) return;
  var pref = elegido;
  if (!pref) {
    var ls = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'es'];
    for (var i = 0; i < ls.length && !pref; i++) { var c = String(ls[i]).slice(0, 2).toLowerCase(); if (PAGINAS[c]) pref = c; }
    pref = pref || 'en';
  }
  if (pref !== actual && PAGINAS[pref]) location.replace(PAGINAS[pref] + location.search + location.hash);
})();
