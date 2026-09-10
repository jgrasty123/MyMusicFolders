/**
 * MyMusicFolders embossing configurator.
 *
 * The folder itself carries the customer's choices as line item properties.
 * The surcharges are real products in the catalog, added alongside the folder
 * so the maths is Shopify's rather than ours. Per-folder charges match the
 * folder quantity; the die and setup charges are one-time and go in at 1.
 */

const ROOTS = document.querySelectorAll('.mmf-emb');

ROOTS.forEach((root) => {
  const cfg = JSON.parse(root.querySelector('[data-mmf-emb-config]').textContent);
  const form = document.getElementById(cfg.formId);
  if (!form) return;

  const panel = root.querySelector('[data-panel]');
  const errorEl = root.querySelector('[data-error]');
  const gates = root.querySelectorAll('[data-gate]');
  const toggles = root.querySelectorAll('[data-toggle]');

  /* ---------- show / hide ---------- */

  const setGate = () => {
    const on = root.querySelector('[data-gate][value="yes"]').checked;
    panel.hidden = !on;
    if (!on) {
      toggles.forEach((t) => { t.checked = false; });
      syncSubs();
    }
    syncEnabled();
  };

  const syncSubs = () => {
    toggles.forEach((t) => {
      const sub = root.querySelector(`[data-sub="${t.dataset.toggle}"]`);
      if (sub) sub.hidden = !t.checked;
    });
    syncPlacements();
    syncEnabled();
  };

  /**
   * Fields belonging to an unselected option must not submit, or the cart
   * fills with empty properties. Disabled inputs are omitted from the POST.
   */
  const syncEnabled = () => {
    const gateOn = root.querySelector('[data-gate][value="yes"]').checked;
    toggles.forEach((t) => {
      const sub = root.querySelector(`[data-sub="${t.dataset.toggle}"]`);
      if (!sub) return;
      const live = gateOn && t.checked;
      sub.querySelectorAll('input, select, textarea').forEach((f) => {
        f.disabled = !live;
      });
    });
    if (gateOn) syncDieUpload();
  };

  /* ---------- placement collision ----------
     Two embossings cannot share a spot on the folder, so a position claimed
     by one group is greyed out in the others. Mirrors the old site. */

  const syncPlacements = () => {
    const claimed = new Map();
    root.querySelectorAll('[data-places]').forEach((grid) => {
      const chosen = grid.querySelector('input:checked');
      const groupLive = !grid.closest('[data-sub]')?.hidden;
      if (chosen && groupLive) claimed.set(chosen.value, grid.dataset.places);
    });

    root.querySelectorAll('[data-places]').forEach((grid) => {
      grid.querySelectorAll('.mmf-emb__place').forEach((label) => {
        const owner = claimed.get(label.dataset.place);
        const taken = owner && owner !== grid.dataset.places;
        label.classList.toggle('is-taken', !!taken);
        const input = label.querySelector('input');
        if (taken && input.checked) input.checked = false;
      });
    });
  };

  /* ---------- logo artwork is only needed for a new die ---------- */

  const syncDieUpload = () => {
    const wrap = root.querySelector('[data-die-upload]');
    if (!wrap) return;
    const onFile = root.querySelector('[data-die][value="Yes"]');
    const needsArt = onFile && !onFile.checked;
    wrap.hidden = !needsArt;
    const input = wrap.querySelector('[data-file]');
    if (input) input.disabled = !needsArt || root.querySelector('[data-sub="logo"]').hidden;
  };

  /* ---------- validation ---------- */

  const validate = () => {
    if (!root.querySelector('[data-gate][value="yes"]').checked) return null;
    const active = [...toggles].filter((t) => t.checked).map((t) => t.dataset.toggle);
    if (!active.length) return 'Choose at least one embossing option, or select “No embossing”.';

    for (const key of active) {
      const sub = root.querySelector(`[data-sub="${key}"]`);
      const fields = [...sub.querySelectorAll('[data-req]')].filter((f) => !f.disabled);
      const groups = new Set(fields.map((f) => f.name));
      for (const name of groups) {
        const set = fields.filter((f) => f.name === name);
        const filled = set.some((f) => (f.type === 'radio' ? f.checked : f.value.trim() !== ''));
        if (!filled) return 'Every embossing option needs a font, a size, a placement and its text.';
      }
      if (key === 'logo') {
        const file = sub.querySelector('[data-file]');
        if (file && !file.disabled && !file.files.length) {
          return 'Upload your artwork, or tell us the die is already on file.';
        }
      }
    }
    return null;
  };

  /* ---------- cart ---------- */

  const surcharges = () => {
    const items = [];
    const qty = Math.max(1, parseInt(form.querySelector('[name="quantity"]')?.value || '1', 10));
    const on = (k) => root.querySelector(`[data-toggle="${k}"]`)?.checked;

    if (on('name') && cfg.name) items.push({ id: cfg.name, quantity: qty });

    if (on('repeat')) {
      if (cfg.repeat) items.push({ id: cfg.repeat, quantity: qty });
      if (cfg.prep) items.push({ id: cfg.prep, quantity: 1 });
    }

    if (on('logo')) {
      if (cfg.logo) items.push({ id: cfg.logo, quantity: qty });
      const onFile = root.querySelector('[data-die][value="Yes"]')?.checked;
      if (!onFile && cfg.die) items.push({ id: cfg.die, quantity: 1 });
    }

    if (on('number')) {
      const hand = root.querySelector('[data-numstyle][value="Hand-set numbers"]')?.checked;
      const id = hand ? cfg.hand : cfg.machine;
      if (id) items.push({ id, quantity: qty });
    }

    return items.filter((i) => i.id);
  };

  /* Shopify only accepts a line item file upload on a native form POST, so a
     logo upload takes the non-AJAX path. Everything else stays on AJAX. */
  const hasUpload = () => {
    const f = root.querySelector('[data-file]');
    return !!(f && !f.disabled && f.files.length);
  };

  form.addEventListener(
    'submit',
    async (event) => {
      const problem = validate();
      if (problem) {
        event.preventDefault();
        event.stopImmediatePropagation();
        errorEl.textContent = problem;
        errorEl.hidden = false;
        errorEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      errorEl.hidden = true;

      const extras = surcharges();
      if (!extras.length) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      try {
        await fetch(`${window.Shopify?.routes?.root || '/'}cart/add.js`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: extras }),
        });
      } catch (e) {
        errorEl.textContent = 'We could not add the embossing charges. Please try again, or call 888-266-0731.';
        errorEl.hidden = false;
        return;
      }

      // Native submit from here: it is the only path that carries a line item
      // file upload, and it keeps the folder and its charges in one round trip.
      if (hasUpload()) form.enctype = 'multipart/form-data';
      form.submit();
    },
    true
  );

  gates.forEach((g) => g.addEventListener('change', setGate));
  toggles.forEach((t) => t.addEventListener('change', syncSubs));
  root.querySelectorAll('[data-places] input').forEach((i) => i.addEventListener('change', syncPlacements));
  root.querySelectorAll('[data-die]').forEach((i) => i.addEventListener('change', syncDieUpload));

  setGate();
  syncSubs();
});
