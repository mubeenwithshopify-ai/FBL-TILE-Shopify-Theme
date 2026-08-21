(function () {
  'use strict';

  /* Keeps the visible option label (e.g. Size: 18"x18") synchronized with
     the radio input that is actually selected. The variant picker and the
     calculator remain untouched; this only updates the displayed labels. */

  function getPicker(element) {
    if (!element) return null;
    return element.closest('.product__item-js')?.querySelector(
      'variant-radios-single, variant-radios-detail, variant-group-detail'
    ) || element.closest(
      'variant-radios-single, variant-radios-detail, variant-group-detail'
    );
  }

  function syncLabels(picker) {
    if (!picker) return;

    picker.querySelectorAll('fieldset.product-form__input').forEach(function (fieldset) {
      var checked = fieldset.querySelector('input[type="radio"][name]:checked');
      if (!checked) return;

      var value = String(checked.value || '').trim();
      if (!value) return;

      fieldset.querySelectorAll('.option_value').forEach(function (label) {
        label.textContent = value;
      });
    });
  }

  function syncFromElement(element) {
    var picker = getPicker(element);
    if (!picker) return;

    syncLabels(picker);

    /* The native/theme variant handler may update checked state asynchronously. */
    window.setTimeout(function () { syncLabels(picker); }, 0);
    window.setTimeout(function () { syncLabels(picker); }, 75);
    window.setTimeout(function () { syncLabels(picker); }, 200);
  }

  function boot() {
    document.querySelectorAll(
      'variant-radios-single, variant-radios-detail, variant-group-detail'
    ).forEach(syncLabels);

    if (document.documentElement.dataset.productVariantLabelSync === 'true') return;
    document.documentElement.dataset.productVariantLabelSync = 'true';

    document.addEventListener('click', function (event) {
      var label = event.target && event.target.closest
        ? event.target.closest('.product__color-swatches--js')
        : null;

      if (label) syncFromElement(label);
    }, true);

    document.addEventListener('change', function (event) {
      if (event.target && event.target.matches('input[type="radio"][name]')) {
        syncFromElement(event.target);
      }
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('shopify:section:load', function (event) {
    if (!event.target) return;
    event.target.querySelectorAll(
      'variant-radios-single, variant-radios-detail, variant-group-detail'
    ).forEach(syncLabels);
  });
})();
