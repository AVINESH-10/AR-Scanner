/**
 * Main Landing Page Interactivity
 * Feature walkthroughs, live preview modal, quick demo launcher, and mobile instructions.
 */

import { AR_CONFIG } from './config.js';

document.addEventListener('DOMContentLoaded', () => {
  // Mobile navigation / quick actions
  const demoButtons = document.querySelectorAll('.btn-launch-demo');
  demoButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const modelId = btn.getAttribute('data-model') || 'helicopter';
      window.location.href = `ar.html?id=${modelId}`;
    });
  });

  // Smooth scroll
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
});
