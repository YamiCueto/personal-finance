import { Component } from '@angular/core';

@Component({
  selector: 'app-auth-story',
  template: `
    <aside class="story" aria-label="Tu espacio financiero">
      <div class="story-brand"><span class="brand-symbol" aria-hidden="true">p</span> personal<span>.</span></div>
      <div class="story-copy">
        <p class="eyebrow">MENOS RUIDO. MÁS CLARIDAD.</p>
        <h2>Haz espacio<br>para lo que<br><em>sí importa.</em></h2>
        <p>Tus cuentas, tus compromisos y tus próximos pasos. Una perspectiva más clara de tu dinero, en un solo lugar.</p>
      </div>
      <div class="story-art" aria-hidden="true">
        <div class="orbit orbit-one"></div><div class="orbit orbit-two"></div>
        <div class="art-note"><span class="note-dot"></span> Un paso a la vez.</div>
        <div class="art-bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      </div>
      <div class="story-footer"><span>FINANZAS CON PERSPECTIVA</span><span>01 — PERSONAL</span></div>
    </aside>
  `,
  styles: `
    :host { display: block; height: 100%; }
    .story { min-height: 760px; height: 100%; padding: 48px; background: #173e35; color: #f5f3e9; border-radius: 24px; position: relative; overflow: hidden; display: flex; flex-direction: column; }
    .story-brand { font-size: 26px; letter-spacing: -1.3px; font-weight: 650; display: flex; align-items: center; gap: 10px; }
    .story-brand > span:last-child { color: #dce7b1; margin-left: -10px; }
    .brand-symbol { display: grid; place-items: center; width: 34px; height: 34px; border: 1px solid #8aa799; border-radius: 10px; font-family: Georgia, serif; font-style: italic; }
    .story-copy { z-index: 1; margin-top: 78px; }
    .eyebrow { font-size: 10px; letter-spacing: .19em; font-weight: 600; color: #c4d3c4; }
    h2 { font-family: var(--font-editorial); font-weight: 400; font-size: clamp(48px, 4.6vw, 72px); line-height: 1.04; letter-spacing: -.04em; color: inherit; margin: 24px 0; }
    h2 em { color: #dce7b1; font-weight: 400; }
    .story-copy > p:last-child { color: #c4d3cb; line-height: 1.8; font-size: 14px; max-width: 310px; }
    .story-art { position: relative; height: 180px; margin-top: auto; }
    .orbit { position: absolute; width: 360px; height: 360px; border: 1px solid #416254; border-radius: 50%; right: -170px; bottom: -140px; }
    .orbit-two { width: 460px; height: 460px; right: -220px; bottom: -190px; }
    .art-bars { display: flex; align-items: end; gap: 12px; height: 150px; position: absolute; bottom: 20px; right: 0; transform: rotate(-8deg); }
    .art-bars i { width: 27px; height: 38%; background: #9fb89d; border-radius: 5px; }
    .art-bars i:nth-child(2) { height: 48%; }.art-bars i:nth-child(3) { height: 42%; }.art-bars i:nth-child(4) { height: 64%; }.art-bars i:nth-child(5) { height: 72%; }.art-bars i:nth-child(6) { height: 88%; }.art-bars i:nth-child(7) { height: 100%; background: #dce7b1; }
    .art-note { display: inline-flex; gap: 10px; align-items: center; background: #f1f0e6; color: #254539; padding: 14px 18px; border-radius: 12px; font-size: 12px; position: absolute; z-index: 1; top: 8px; left: 0; transform: rotate(-8deg); box-shadow: 0 8px 28px #102c3433; }
    .note-dot { width: 8px; height: 8px; border-radius: 50%; background: #678e6f; }
    .story-footer { display: flex; justify-content: space-between; gap: 16px; margin-top: 32px; z-index: 1; font-size: 8px; letter-spacing: .12em; color: #c4d3cb; }
    @media(max-width: 1000px) { .story { padding: 32px; }.story-copy { margin-top: 64px; } }
    @media(max-width: 767px) { :host { display: none; } }
  `,
})
export class AuthStoryComponent {}
