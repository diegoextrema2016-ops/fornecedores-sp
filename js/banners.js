// Faixa de banners da home: markup e pré-carregamento. Usado pela home no navegador (js/pages-public.js)
// e pela home estática gerada no build (scripts/seo.mjs), para as duas ficarem iguais.
// As versões ficam em /img/banners/ (ex.: banner-3-1600.webp), geradas a partir do original, sem ampliar.

export const LARGURAS_PC = [960, 1280, 1600, 2172];
export const LARGURAS_CEL = [560, 800, 1122];

const srcset = (base, ext, larguras) => larguras.map((w) => `${base}-${w}.${ext} ${w}w`).join(', ');
const semExtensao = (src) => src.replace(/\.(jpe?g|png|webp)$/i, '');

// Markup de um banner. `esc` é a função de escape de HTML de quem chama.
// A miniatura borrada (b.blur / b.blurMobile) aparece na hora, atrás da imagem, enquanto a grande carrega.
function bannerHtml(b, i, esc) {
  const pc = semExtensao(b.src);
  const cel = b.mobileSrc ? semExtensao(b.mobileSrc) : null;
  // WebP primeiro (menor); JPG como reserva. Celular usa a versão vertical.
  const sources = [
    cel ? `<source media="(max-width: 820px)" type="image/webp" srcset="${esc(srcset(cel, 'webp', LARGURAS_CEL))}" sizes="100vw">` : '',
    cel ? `<source media="(max-width: 820px)" type="image/jpeg" srcset="${esc(srcset(cel, 'jpg', LARGURAS_CEL))}" sizes="100vw">` : '',
    `<source type="image/webp" srcset="${esc(srcset(pc, 'webp', LARGURAS_PC))}" sizes="100vw">`,
  ].join('');
  const img = `<picture>${sources}<img src="${esc(pc)}-1600.jpg" srcset="${esc(srcset(pc, 'jpg', LARGURAS_PC))}" sizes="100vw" alt="${esc(b.alt)}" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></picture>`;
  const blur = [
    b.blur ? `--banner-blur-pc:url(${b.blur})` : '',
    b.blurMobile ? `--banner-blur-cel:url(${b.blurMobile})` : '',
  ].filter(Boolean).join(';');
  const slide = `<div class="banner-slide"${blur ? ` style="${blur}"` : ''}>`;
  return `${slide}${b.href ? `<a href="${esc(b.href)}">${img}</a>` : img}</div>`;
}

export function bannersMarkup(banners, esc) {
  if (!banners.length) return '';
  return `
    <section class="banner-section" aria-label="Destaques">
      <div class="banner-track">
        ${banners.map((b, i) => bannerHtml(b, i, esc)).join('')}
      </div>
    </section>`;
}

// Pré-carrega o primeiro banner. Usa exatamente o mesmo conjunto de tamanhos da imagem (imagesrcset),
// assim o navegador baixa a mesma versão que vai mostrar, sem baixar duas vezes.
export function bannerPreloadLinks(banners, esc) {
  const b = banners[0];
  if (!b) return '';
  const pc = semExtensao(b.src);
  const cel = b.mobileSrc ? semExtensao(b.mobileSrc) : null;
  return [
    cel ? `<link rel="preload" as="image" type="image/webp" imagesrcset="${esc(srcset(cel, 'webp', LARGURAS_CEL))}" imagesizes="100vw" media="(max-width: 820px)" fetchpriority="high">` : '',
    `<link rel="preload" as="image" type="image/webp" imagesrcset="${esc(srcset(pc, 'webp', LARGURAS_PC))}" imagesizes="100vw" media="(min-width: 821px)" fetchpriority="high">`,
  ].filter(Boolean).join('\n  ');
}
