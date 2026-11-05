// Identidade visual do jogo reutilizada nas telas de vinculo e OAuth.
// O layout nao autentica usuarios; formularios existentes continuam no servidor.
const GAME_URL = 'https://jogo.portrasdaoferta.workers.dev/';
const SOCIAL_PREVIEW = "\n<aside class=\"feed-showcase\" aria-label=\"Prévia ilustrativa do feed fictício da campanha\">\n <div class=\"feed-blob one\"></div><div class=\"feed-blob two\"></div>\n <div class=\"preview-phone\">\n  <div class=\"phone-top\"></div>\n  <div class=\"phone-bar\"><span>pulso<strong>.</strong></span><span class=\"phone-icons\" aria-hidden=\"true\">♡ ⊕</span></div>\n  <div class=\"story-list\">\n   <div class=\"story-item\"><div class=\"story-ring\"><img src=\"https://jogo.portrasdaoferta.workers.dev/assets/social/unique/avatar-mia.jpg\" alt=\"\" referrerpolicy=\"no-referrer\" loading=\"lazy\"></div>mia.s</div>\n   <div class=\"story-item\"><div class=\"story-ring\"><img src=\"https://jogo.portrasdaoferta.workers.dev/assets/social/unique/avatar-livia.jpg\" alt=\"\" referrerpolicy=\"no-referrer\" loading=\"lazy\"></div>livia.looks</div>\n   <div class=\"story-item\"><div class=\"story-ring\"><img src=\"https://jogo.portrasdaoferta.workers.dev/assets/social/unique/avatar-bia.jpg\" alt=\"\" referrerpolicy=\"no-referrer\" loading=\"lazy\"></div>bia.m</div>\n   <div class=\"story-item\"><div class=\"story-ring\"><img src=\"https://jogo.portrasdaoferta.workers.dev/assets/social/unique/avatar-gabi.jpg\" alt=\"\" referrerpolicy=\"no-referrer\" loading=\"lazy\"></div>gabi.n</div>\n  </div>\n  <div class=\"post-head\"><img src=\"https://jogo.portrasdaoferta.workers.dev/assets/social/unique/avatar-livia.jpg\" alt=\"\" referrerpolicy=\"no-referrer\" loading=\"lazy\"><div class=\"post-author\">livia.looks <small>Patrocinado · para você</small></div><span class=\"post-menu\" aria-hidden=\"true\">···</span></div>\n  <div class=\"post-photo\"><img src=\"https://jogo.portrasdaoferta.workers.dev/assets/social/unique/post-p2.jpg\" alt=\"\" referrerpolicy=\"no-referrer\" loading=\"lazy\"><span class=\"post-label\">PUBLICIDADE</span></div>\n  <div class=\"post-tools\" aria-hidden=\"true\"><span>♡ ◯ ↗</span><span>♧</span></div>\n  <div class=\"post-caption\"><strong>livia.looks</strong> Uma escolha parece pequena. E o algoritmo lembra de todas. <span aria-hidden=\"true\">✨</span><small>Prévia fictícia da rede social do jogo</small></div>\n  <div class=\"bottom-phone\" aria-hidden=\"true\"><span>⌂</span><span>⌕</span><span>＋</span><span>♡</span><span>◉</span></div>\n </div>\n <div class=\"floating-note top\" aria-hidden=\"true\"><b>♥</b><span>Seu feed aprende<br>com cada escolha</span></div>\n <div class=\"floating-note bottom\" aria-hidden=\"true\"><b>✦</b><span>Por trás da oferta<br>há uma estratégia</span></div>\n <p class=\"preview-hint\">Ilustração da experiência · pessoas e marcas fictícias</p>\n</aside>";
const escapeHtml = value => String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
export function brandedPage({pageTitle,headline,highlight,description,tag='COLÉGIO RIO BRANCO · CICLO 4',card}) {
 return `<!doctype html>
<html lang="pt-BR"><head>
 <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
 <meta name="referrer" content="no-referrer"><meta name="color-scheme" content="light">
 <title>${escapeHtml(pageTitle)} · Por Trás da Oferta</title>
 <link rel="stylesheet" href="/mcp-theme.css">
</head><body class="mcp-page login-alone">
 <header class="site-header">
  <a class="brandline" href="${GAME_URL}" aria-label="Por Trás da Oferta — jogo"><span class="brand-symbol">↗</span> POR TRÁS DA OFERTA</a>
  <nav class="header-links" aria-label="Navegação principal"><a class="header-text" href="/">Página do MCP</a><a class="play-link" href="${GAME_URL}">Abrir o jogo ↗</a></nav>
 </header>
 <main class="entry-layout"><section class="entry-copy">
  <p class="tag">✦ ${escapeHtml(tag)}</p>
  <h1>${escapeHtml(headline)}<br><em>${escapeHtml(highlight)}</em></h1>
  <p class="lede">${escapeHtml(description)}</p>
  <div class="feature-line"><span><span class="sparkle">✦</span> Conta individual</span><span>🔒 Senha só no site</span><span>↗ Seu percurso fictício</span></div>
  <div class="account-card">${card}</div>
 </section>${SOCIAL_PREVIEW}</main>
 <footer class="page-footer">Projeto educativo do Colégio Rio Branco · Ciclo 4 · Dados fictícios. Não informe sua senha no ChatGPT. <a href="${GAME_URL}">Voltar ao jogo</a></footer>
</body></html>`;
}
