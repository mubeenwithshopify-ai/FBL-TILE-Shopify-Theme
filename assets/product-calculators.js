(function () {
  'use strict';

  function number(value, fallback) {
    var n = parseFloat(value);
    return isFinite(n) ? n : (fallback === undefined ? null : fallback);
  }
  function whole(value) { var n = parseFloat(value); return isFinite(n) && Math.floor(n) === n && n > 0 ? n : null; }
  function fmt(value, decimals) {
    if (value === null || value === undefined || !isFinite(value)) return '—';
    var s = Number(value).toFixed(decimals);
    return s.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  }
  function money(root, cents) {
    if (cents === null || cents === undefined || !isFinite(cents)) return '—';
    var currency = root.dataset.currency || (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || 'USD';
    var locale = root.dataset.locale || document.documentElement.lang || 'en-US';
    try { return new Intl.NumberFormat(locale, { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100); }
    catch (e) { return (cents / 100).toFixed(2); }
  }
  function output(root, name, value) { Array.prototype.forEach.call(root.querySelectorAll('[data-calculator-output="' + name + '"]'), function (el) { el.textContent = value; }); }
  function message(root, name, text, visible) { var el = root.querySelector('[data-calculator-message="' + name + '"]'); if (!el) return; el.textContent = text || ''; el.hidden = !visible; }
  function section(root) { return root.closest('[data-section]') || root.parentElement; }
  function forms(root) { var s = section(root); return s ? Array.prototype.slice.call(s.querySelectorAll('product-form[data-calculator-form] form')) : []; }
  function variants(root) { var el = root.querySelector('.product-calculator-variants'); if (!el) return []; try { return JSON.parse(el.textContent.trim()); } catch (e) { console.error('Product calculator variant data error:', e); return []; } }
  function selectedVariant(root, list) {
    if (!list.length) return null;
    var activeId = root.dataset.activeVariantId;
    if (activeId) { var active = list.find(function (variant) { return String(variant.id) === String(activeId); }); if (active) return active; }
    var s = section(root); if (!s) return list[0] || null;
    var input = s.querySelector('input.product-variant-id[name="id"], select[name="id"], input[name="id"]');
    var id = input ? input.value : '';
    for (var i = 0; i < list.length; i++) if (String(list[i].id) === String(id)) return list[i];
    return list[0] || null;
  }
  function syncQuantity(root, qty) { forms(root).forEach(function (form) { Array.prototype.forEach.call(form.querySelectorAll('input[name="quantity"]'), function (input) { input.value = qty; }); }); }
  function prop(root, key, value) {
    var labels = { calculator_type: '_Calculator Type', selected_size: 'Selected Size', selected_finish: 'Selected Finish', sold_by: 'Sold By', requested_sf: '_Requested Square Footage', effective_sf: '_Effective Square Footage', requested_pieces: '_Requested Pieces', pieces_required: '_Pieces Required', actual_coverage: '_Actual Coverage', price_per_sf: '_Price per Square Foot', price_per_piece: '_Price per Piece', calculated_total: '_Product Subtotal', estimated_weight: '_Estimated Shipping Weight', minimum_order: '_Minimum Order', minimum_pieces: '_Minimum Pieces', rounding: '_Rounding', sheets_required: '_Sheets Required' };
    if (!labels[key]) return;
    forms(root).forEach(function (form) { var input = form.querySelector('[data-calculator-property="' + key + '"]'); if (!input) { input = document.createElement('input'); input.type = 'hidden'; input.setAttribute('data-calculator-property', key); input.name = 'properties[' + labels[key] + ']'; form.appendChild(input); } input.value = value === null || value === undefined ? '' : String(value); });
  }
  function syncProperties(root, data) { Object.keys(data).forEach(function (key) { prop(root, key, data[key]); }); }
  function buttons(root, valid) { var s = section(root); if (!s) return; Array.prototype.forEach.call(s.querySelectorAll('button[name="add"][type="submit"]'), function (b) { b.disabled = !valid; }); }
  function stock(root, variant, qty) { var el = root.querySelector('[data-calculator-output="stock"]'); if (!el || !variant) return; if (!variant.available) { el.textContent = 'Out of stock'; return; } if (variant.inventoryManagement && variant.inventoryPolicy !== 'continue') { var inv = Number(variant.inventoryQuantity || 0); el.textContent = qty > inv ? 'Only ' + inv + ' available' : inv + ' available'; return; } el.textContent = variant.inventoryPolicy === 'continue' ? 'Available to order' : 'In stock'; }
  function sizeValue(root, variant, term, fallback) { var n1 = (root.dataset.option1Name || '').toLowerCase(), n2 = (root.dataset.option2Name || '').toLowerCase(), n3 = (root.dataset.option3Name || '').toLowerCase(); if (n1.indexOf(term) !== -1) return variant.option1 || ''; if (n2.indexOf(term) !== -1) return variant.option2 || ''; if (n3.indexOf(term) !== -1) return variant.option3 || ''; return fallback || ''; }
  function renderPriceInfo(root, variant, sfPerPiece, minPieces) { var pricePerSF = number(variant.price, 0), pricePerPiece = pricePerSF * sfPerPiece; output(root, 'price-per-sf', money(root, pricePerSF)); output(root, 'price-per-piece', money(root, pricePerPiece)); output(root, 'min-pieces', fmt(minPieces, 0)); output(root, 'min-coverage', fmt(minPieces * sfPerPiece, 3)); output(root, 'min-price', money(root, minPieces * pricePerPiece)); output(root, 'sf-per-piece', fmt(sfPerPiece, 3)); }

  function calculateSquareFootage(root, variant, source) {
    var sfInput = root.querySelector('[data-calculator-input="sf"]'), piecesInput = root.querySelector('[data-calculator-input="pieces"]'), sfPerPiece = number(variant && variant.sfPerPiece), weightPerSF = number(variant && variant.shippingWeightPerSF, 6), minPieces = number(variant && variant.minimumPieces);
    if (!minPieces || minPieces < 1) minPieces = number(variant && variant.quantityRule && variant.quantityRule.min, 5);
    var maxPieces = number(variant && variant.quantityRule && variant.quantityRule.max);
    if (!sfPerPiece || sfPerPiece <= 0) { message(root, 'error', 'This tile size is missing SF per Piece configuration.', true); buttons(root, false); return; }
    minPieces = Math.max(1, Math.ceil(minPieces || 5)); renderPriceInfo(root, variant, sfPerPiece, minPieces);
    var requestedSF = number(sfInput && sfInput.value), requestedPieces = piecesInput && piecesInput.value !== '' ? whole(piecesInput.value) : null, pieces, valid = true, error = '';
    if (source === 'pieces') {
      if (piecesInput && piecesInput.value !== '') { if (!requestedPieces) { valid = false; error = 'Please enter a whole number of pieces.'; pieces = minPieces; } else { pieces = requestedPieces; if (pieces < minPieces) { valid = false; error = 'Minimum order is ' + minPieces + ' pieces.'; } if (maxPieces && pieces > maxPieces) { valid = false; error = 'Maximum order quantity is ' + maxPieces + ' pieces.'; } if (sfInput) sfInput.value = fmt(pieces * sfPerPiece, 3); } } else { pieces = minPieces; if (sfInput) sfInput.value = fmt(pieces * sfPerPiece, 3); }
    } else if (requestedSF !== null && requestedSF > 0) { pieces = Math.max(minPieces, Math.ceil(requestedSF / sfPerPiece)); if (maxPieces && pieces > maxPieces) { valid = false; error = 'Maximum order quantity is ' + maxPieces + ' pieces.'; } if (piecesInput) piecesInput.value = pieces; }
    else { pieces = minPieces; if (piecesInput) piecesInput.value = pieces; if (sfInput) sfInput.value = fmt(pieces * sfPerPiece, 3); }
    var actualCoverage = pieces * sfPerPiece, pricePerSF = number(variant.price, 0), pricePerPiece = pricePerSF * sfPerPiece, subtotal = pieces * pricePerPiece, weight = actualCoverage * weightPerSF;
    output(root, 'pieces', fmt(pieces, 0)); output(root, 'coverage', fmt(actualCoverage, 3)); output(root, 'weight', fmt(weight, 2) + ' lb'); output(root, 'subtotal', money(root, subtotal)); output(root, 'price-per-sf', money(root, pricePerSF)); output(root, 'price-per-piece', money(root, pricePerPiece));
    if (!variant.available) { valid = false; error = 'This selected variant is currently unavailable.'; } if (valid && variant.inventoryManagement && variant.inventoryPolicy !== 'continue') { var inventory = Number(variant.inventoryQuantity || 0); if (pieces > inventory) { valid = false; error = 'Only ' + inventory + ' pieces are currently available.'; } }
    message(root, 'error', error, !valid); buttons(root, valid); syncQuantity(root, pieces);
    syncProperties(root, { calculator_type: 'Tile / Square Footage', selected_size: sizeValue(root, variant, 'size', variant.option1 || ''), selected_finish: sizeValue(root, variant, 'finish', variant.option2 || ''), sold_by: 'Piece', requested_sf: requestedSF === null ? fmt(actualCoverage, 3) : fmt(requestedSF, 3), effective_sf: fmt(actualCoverage, 3), requested_pieces: requestedPieces === null ? pieces : requestedPieces, pieces_required: pieces, actual_coverage: fmt(actualCoverage, 3) + ' sq. ft.', price_per_sf: money(root, pricePerSF), price_per_piece: money(root, pricePerPiece), calculated_total: money(root, subtotal), estimated_weight: fmt(weight, 2) + ' lb', minimum_order: '1 Box', minimum_pieces: minPieces, rounding: 'Whole pieces only' });
    stock(root, variant, pieces); root._calculatorState = { valid: valid, pieces: pieces, subtotal: subtotal, coverage: actualCoverage, weight: weight };
  }

  function calculateSheet(root, variant) {
    var sfInput = root.querySelector('[data-calculator-input="sf"]'), coverage = number(variant.coveragePerSheet), weightPerSheet = number(variant.shippingWeightPerSheet, 6), min = number(variant.quantityRule && variant.quantityRule.min, 1), requested = number(sfInput && sfInput.value);
    output(root, 'coverage-per-sheet', fmt(coverage, 3));
    if (!coverage || coverage <= 0) { message(root, 'error', 'This sheet product is missing Coverage per Sheet configuration.', true); buttons(root, false); return; }
    var qty = requested && requested > 0 ? Math.max(min, Math.ceil(requested / coverage)) : min, actual = qty * coverage, subtotal = qty * number(variant.price, 0), weight = qty * weightPerSheet;
    output(root, 'quantity', fmt(qty, 0)); output(root, 'coverage', fmt(actual, 3)); output(root, 'subtotal', money(root, subtotal)); output(root, 'weight', fmt(weight, 2) + ' lb');
    var valid = !!variant.available; message(root, 'error', valid ? '' : 'This selected variant is currently unavailable.', !valid); buttons(root, valid); syncQuantity(root, qty);
    syncProperties(root, { calculator_type: 'Sheet', sold_by: 'Sheet', requested_sf: requested === null ? '' : fmt(requested, 3), effective_sf: fmt(actual, 3), sheets_required: qty, actual_coverage: fmt(actual, 3) + ' sq. ft.', calculated_total: money(root, subtotal), estimated_weight: fmt(weight, 2) + ' lb', minimum_order: min, rounding: 'Whole sheets only' });
    root._calculatorState = { valid: valid, pieces: qty, subtotal: subtotal, coverage: actual, weight: weight };
  }

  function calculatePiece(root, variant) {
    var input = root.querySelector('[data-calculator-input="pieces"]'), qty = whole(input && input.value), min = number(variant.quantityRule && variant.quantityRule.min, 1), max = number(variant.quantityRule && variant.quantityRule.max), valid = true, error = '';
    if (!qty) { qty = min; if (input) input.value = qty; } else if (qty < min) { valid = false; error = 'Minimum order is ' + min + ' pieces.'; } if (valid && max && qty > max) { valid = false; error = 'Maximum order quantity is ' + max + ' pieces.'; }
    var perPieceWeight = number(variant.shippingWeightPerPiece, 0), subtotal = qty * number(variant.price, 0), weight = qty * perPieceWeight;
    output(root, 'quantity', fmt(qty, 0)); output(root, 'subtotal', money(root, subtotal)); output(root, 'weight', fmt(weight, 2) + ' lb'); if (!variant.available) { valid = false; error = 'This selected variant is currently unavailable.'; }
    message(root, 'error', error, !valid); buttons(root, valid); syncQuantity(root, qty); syncProperties(root, { calculator_type: 'Piece', sold_by: 'Piece', requested_pieces: qty, pieces_required: qty, calculated_total: money(root, subtotal), estimated_weight: fmt(weight, 2) + ' lb', minimum_order: min, rounding: 'Whole pieces only' }); root._calculatorState = { valid: valid, pieces: qty, subtotal: subtotal, coverage: null, weight: weight };
  }

  function calculate(root, source) { var list = variants(root), variant = selectedVariant(root, list); if (!variant) { message(root, 'error', 'Unable to determine the selected product variant.', true); buttons(root, false); return; } if (root.dataset.calculatorType === 'square_footage') calculateSquareFootage(root, variant, source || 'sf'); else if (root.dataset.calculatorType === 'sheet') calculateSheet(root, variant); else if (root.dataset.calculatorType === 'piece') calculatePiece(root, variant); }

  function init(root) {
    if (root.dataset.calculatorInitialized === 'true') return; root.dataset.calculatorInitialized = 'true'; var s = section(root); if (s && root.dataset.calculatorType === 'square_footage') s.classList.add('product-calculator-square-active');
    Array.prototype.forEach.call(root.querySelectorAll('[data-calculator-input]'), function (input) { input.addEventListener('input', function () { calculate(root, root.dataset.calculatorType === 'square_footage' && input.getAttribute('data-calculator-input') === 'pieces' ? 'pieces' : 'sf'); }); input.addEventListener('change', function () { calculate(root, root.dataset.calculatorType === 'square_footage' && input.getAttribute('data-calculator-input') === 'pieces' ? 'pieces' : 'sf'); }); });
    calculate(root, 'initial'); if (s) { s.addEventListener('change', function (event) { if (event.target.matches('input.product-variant-id, select[name="id"], input[name="id"]')) setTimeout(function () { calculate(root, 'variant'); }, 0); }); }
  }

  function boot() { document.querySelectorAll('[data-product-calculator]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  document.addEventListener('shopify:section:load', function (event) { if (event.target) event.target.querySelectorAll('[data-product-calculator]').forEach(init); });
})();