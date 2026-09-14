import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('opening screen credits OpenAI and Anthropic and preserves the five-second hold', () => {
  const html = fs.readFileSync(new URL('../Naatile-Mafia.html', import.meta.url), 'utf8');
  const intro = fs.readFileSync(new URL('../intro.html', import.meta.url), 'utf8').trim();
  assert.ok(html.includes(intro));
  assert.ok(intro.includes('class="game-intro__title">KK PRESENTS</div>'));
  assert.ok(intro.includes('class="game-intro__credit">Developed with OpenAI and Anthropic</div>'));
  assert.ok(intro.includes('aria-label="KK Presents. Developed with OpenAI and Anthropic"'));
  assert.equal(html.split('class="game-intro__credit">').length - 1, 1);
  assert.match(html, /gameIntroText 8s ease-in-out forwards/);
  assert.match(html, /12\.5%,75%\{opacity:1\}/);
});
