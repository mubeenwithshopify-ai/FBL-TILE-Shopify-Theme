(function () {
  'use strict';

  var initializedRoots = [];

  function parseNumber(value) {
    var number = parseFloat(value);
    return isFinite(number) ? number : null;
  }

  function formatNumber(value, decimals) {
    if (value === null || value === undefined || !isFinite(value)) {
      return '—';
    }

    var fixed = Number(value).toFixed(decimals);

    fixed = fixed.replace(/\.0+$/, '');
    fixed = fixed.replace(/(\.\d*?)0+$/, '$1');

    return fixed;
  }

  function formatMoney(root, cents) {
    if (cents === null || cents === undefined || !isFinite(cents)) {
      return '—';
    }

    var amount = cents / 100;

    var currency =
      root.dataset.currency ||
      (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) ||
      'USD';

    var locale =
      root.dataset.locale ||
      document.documentElement.lang ||
      'en-US';

    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency
      }).format(amount);
    } catch (error) {
      if (
        window.Shopify &&
        typeof window.Shopify.formatMoney === 'function'
      ) {
        return window.Shopify.formatMoney(
          Math.round(cents),
          root.dataset.moneyFormat
        );
      }

      return amount.toFixed(2);
    }
  }

  function setOutput(root, name, value) {
    var elements = root.querySelectorAll(
      '[data-calculator-output="' + name + '"]'
    );

    Array.prototype.forEach.call(elements, function (element) {
      element.textContent = value;
    });
  }

  function setMessage(root, name, message, visible) {
    var element = root.querySelector(
      '[data-calculator-message="' + name + '"]'
    );

    if (!element) {
      return;
    }

    element.textContent = message || '';
    element.hidden = !visible;
  }

  function getSectionElement(root) {
    return root.closest('[data-section]');
  }

  function getForms(root) {
    var section = getSectionElement(root);

    if (!section) {
      return [];
    }

    return Array.prototype.slice.call(
      section.querySelectorAll(
        'product-form[data-calculator-form] form'
      )
    );
  }

  function getVariantData(root) {
    var script = root.querySelector('.product-calculator-variants');

    if (!script) {
      return [];
    }

    try {
      return JSON.parse(script.textContent.trim());
    } catch (error) {
      console.error(
        'Product calculator: unable to parse variant data.',
        error
      );

      return [];
    }
  }

  function getSelectedVariant(root, variants) {
    var section = getSectionElement(root);

    if (!section) {
      return null;
    }

    var variantInput = section.querySelector(
      'input.product-variant-id[name="id"]'
    );

    var variantId = variantInput ? variantInput.value : '';

    if (!variantId) {
      var genericVariantInput = section.querySelector(
        'select[name="id"], input[name="id"]'
      );

      if (genericVariantInput) {
        variantId = genericVariantInput.value;
      }
    }

    if (!variantId) {
      return variants.length ? variants[0] : null;
    }

    for (var i = 0; i < variants.length; i++) {
      if (String(variants[i].id) === String(variantId)) {
        return variants[i];
      }
    }

    return variants.length ? variants[0] : null;
  }

  function normalizeQuantity(quantity, variant) {
    var rule = variant.quantityRule || {};

    var minimum = Number(rule.min || 1);
    var increment = Number(rule.increment || 1);

    if (increment < 1) {
      increment = 1;
    }

    quantity = Math.max(quantity, minimum);

    if (increment > 1) {
      quantity =
        Math.ceil((quantity - minimum) / increment) * increment +
        minimum;
    }

    return Math.round(quantity);
  }

  function getQuantityLimitError(quantity, variant) {
    var rule = variant.quantityRule || {};

    if (
      rule.max !== null &&
      rule.max !== undefined &&
      Number(rule.max) > 0 &&
      quantity > Number(rule.max)
    ) {
      return (
        'The maximum order quantity for this product is ' +
        Number(rule.max) +
        '.'
      );
    }

    return '';
  }

  function checkInventory(quantity, variant) {
    if (!variant.available) {
      return {
        valid: false,
        message: 'This selected variant is currently unavailable.'
      };
    }

    if (
      variant.inventoryManagement &&
      variant.inventoryPolicy !== 'continue'
    ) {
      var inventory = Number(variant.inventoryQuantity || 0);

      if (quantity > inventory) {
        return {
          valid: false,
          message:
            'Only ' +
            inventory +
            ' ' +
            (inventory === 1 ? 'unit is' : 'units are') +
            ' currently available.'
        };
      }
    }

    return {
      valid: true,
      message: ''
    };
  }

  function syncQuantity(root, quantity) {
    var forms = getForms(root);

    Array.prototype.forEach.call(forms, function (form) {
      var quantityInputs = form.querySelectorAll(
        'input[name="quantity"]'
      );

      Array.prototype.forEach.call(quantityInputs, function (input) {
        input.value = quantity;

        try {
          input.dispatchEvent(
            new Event('change', {
              bubbles: true
            })
          );
        } catch (error) {
          var event = document.createEvent('Event');
          event.initEvent('change', true, true);
          input.dispatchEvent(event);
        }
      });
    });
  }

  function syncProperty(root, key, value) {
    var forms = getForms(root);

    var propertyLabels = {
      calculator_type: '_Calculator Type',
      sold_by: 'Sold By',
      requested_sf: '_Requested Square Footage',
      effective_sf: '_Effective Square Footage',
      requested_pieces: '_Requested Pieces',
      boxes_required: '_Boxes Required',
      pieces_required: '_Pieces Required',
      sheets_required: '_Sheets Required',
      actual_coverage: '_Actual Purchasable Coverage',
      calculated_total: '_Calculated Total',
      estimated_weight: '_Estimated Shipping Weight',
      minimum_order: '_Minimum Order',
      rounding: '_Rounding'
    };

    var propertyName = propertyLabels[key];

    if (!propertyName) {
      return;
    }

    Array.prototype.forEach.call(forms, function (form) {
      var selector =
        '[data-calculator-property="' +
        key +
        '"]';

      var input = form.querySelector(selector);

      if (!input) {
        input = document.createElement('input');
        input.type = 'hidden';
        input.setAttribute(
          'data-calculator-property',
          key
        );
        input.name = 'properties[' + propertyName + ']';
        form.appendChild(input);
      }

      input.value =
        value === null || value === undefined
          ? ''
          : String(value);
    });
  }

  function syncProperties(root, data) {
    syncProperty(
      root,
      'calculator_type',
      data.calculatorType
    );

    syncProperty(
      root,
      'sold_by',
      data.soldBy
    );

    syncProperty(
      root,
      'requested_sf',
      data.requestedSF
    );

    syncProperty(
      root,
      'effective_sf',
      data.effectiveSF
    );

    syncProperty(
      root,
      'requested_pieces',
      data.requestedPieces
    );

    syncProperty(
      root,
      'boxes_required',
      data.boxes
    );

    syncProperty(
      root,
      'pieces_required',
      data.pieces
    );

    syncProperty(
      root,
      'sheets_required',
      data.sheets
    );

    syncProperty(
      root,
      'actual_coverage',
      data.coverage
    );

    syncProperty(
      root,
      'calculated_total',
      data.totalFormatted
    );

    syncProperty(
      root,
      'estimated_weight',
      data.weight
    );

    syncProperty(
      root,
      'minimum_order',
      data.minimum
    );

    syncProperty(
      root,
      'rounding',
      data.rounding
    );
  }

  function updatePriceDisplay(root, totalCents, valid) {
    var section = getSectionElement(root);

    if (!section) {
      return;
    }

    var priceOverride = section.querySelector(
      '[data-calculator-price-display]'
    );

    var originalPrice = section.querySelector(
      '[data-calculator-original-price]'
    );

    if (!priceOverride || !originalPrice) {
      return;
    }

    if (valid && totalCents !== null) {
      priceOverride.textContent = formatMoney(
        root,
        totalCents
      );

      priceOverride.hidden = false;
      originalPrice.hidden = true;
    } else {
      priceOverride.textContent = '';
      priceOverride.hidden = true;
      originalPrice.hidden = false;
    }
  }

  function updateButtons(root, valid) {
    var section = getSectionElement(root);

    if (!section) {
      return;
    }

    var buttons = section.querySelectorAll(
      'button[name="add"][type="submit"]'
    );

    Array.prototype.forEach.call(buttons, function (button) {
      button.disabled = !valid;
    });

    var dynamicCheckout = section.querySelectorAll(
      '.btn-checkout-dynamic'
    );

    Array.prototype.forEach.call(
      dynamicCheckout,
      function (container) {
        container.classList.toggle(
          'product-calculator__buttons-disabled',
          !valid
        );

        container.setAttribute(
          'aria-disabled',
          valid ? 'false' : 'true'
        );
      }
    );
  }

  function renderCommonStock(root, variant, quantity) {
    var stock = root.querySelector(
      '[data-calculator-output="stock"]'
    );

    if (!stock) {
      return;
    }

    if (!variant.available) {
      stock.textContent = 'Out of stock';
      return;
    }

    if (
      variant.inventoryManagement &&
      variant.inventoryPolicy !== 'continue'
    ) {
      var inventory = Number(
        variant.inventoryQuantity || 0
      );

      if (quantity > inventory) {
        stock.textContent =
          'Only ' + inventory + ' available';
        return;
      }

      stock.textContent =
        inventory +
        ' ' +
        (inventory === 1 ? 'unit' : 'units') +
        ' available';
      return;
    }

    if (variant.inventoryPolicy === 'continue') {
      stock.textContent = 'Available to order';
      return;
    }

    stock.textContent = 'In stock';
  }

  function calculateTile(root, variant) {
    var sfInput = root.querySelector(
      '[data-calculator-input="sf"]'
    );

    var boxesInput = root.querySelector(
      '[data-calculator-input="boxes"]'
    );

    var sfPerPiece = parseNumber(
      variant.sfPerPiece
    );

    var piecesPerBox = parseNumber(
      variant.piecesPerBox
    );

    var minimumSF = parseNumber(
      root.dataset.minimum
    );

    var weightPerSF = parseNumber(
      variant.shippingWeightPerSF
    );

    if (
      sfPerPiece === null ||
      sfPerPiece <= 0
    ) {
      sfPerPiece = parseNumber(
        root.dataset.sfPerPiece
      );
    }

    if (
      piecesPerBox === null ||
      piecesPerBox <= 0
    ) {
      piecesPerBox = parseNumber(
        root.dataset.piecesPerBox
      );
    }

    if (
      weightPerSF === null ||
      weightPerSF <= 0
    ) {
      weightPerSF = parseNumber(
        root.dataset.weightPerSf
      );
    }

    if (
      !sfPerPiece ||
      sfPerPiece <= 0 ||
      !piecesPerBox ||
      piecesPerBox <= 0
    ) {
      return {
        valid: false,
        message:
          'This tile product is missing SF per Piece or Pieces per Box configuration.'
      };
    }

    var sfPerBox =
      sfPerPiece * piecesPerBox;

    setOutput(
      root,
      'sf-per-box',
      formatNumber(sfPerBox, 2)
    );

    setOutput(
      root,
      'sf-per-piece',
      formatNumber(sfPerPiece, 2)
    );

    var sfValue = parseNumber(sfInput.value);
    var boxesValue = parseNumber(boxesInput.value);

    if (sfValue === null && boxesValue === null) {
      setOutput(root, 'quantity', '—');
      setOutput(root, 'pieces', '—');
      setOutput(root, 'coverage', '—');
      setOutput(root, 'total', '—');
      setOutput(root, 'weight', '—');

      setMessage(root, 'rounding', '', false);
      setMessage(root, 'minimum', '', false);

      updatePriceDisplay(root, null, false);
      updateButtons(root, false);

      return {
        valid: false,
        message: ''
      };
    }

    var requestedSF;
    var rawBoxes;
    var source = 'sf';

    if (sfValue !== null && sfValue > 0) {
      requestedSF = sfValue;

      var effectiveSF = Math.max(
        requestedSF,
        minimumSF
      );

      rawBoxes =
        Math.ceil(
          effectiveSF / sfPerBox
        );

      boxesInput.value = rawBoxes;
    } else {
      source = 'boxes';

      rawBoxes = Math.max(
        1,
        Math.ceil(boxesValue || 1)
      );

      var minimumBoxes =
        Math.ceil(
          minimumSF / sfPerBox
        );

      rawBoxes = Math.max(
        rawBoxes,
        minimumBoxes
      );

      requestedSF =
        rawBoxes * sfPerBox;

      sfInput.value =
        formatNumber(requestedSF, 2);
    }

    var quantity =
      normalizeQuantity(
        rawBoxes,
        variant
      );

    var maxError =
      getQuantityLimitError(
        quantity,
        variant
      );

    if (maxError) {
      updateButtons(root, false);

      return {
        valid: false,
        message: maxError
      };
    }

    var coverage =
      quantity * sfPerBox;

    var pieces =
      quantity * piecesPerBox;

    var totalCents =
      Number(variant.price) * quantity;

    var weight =
      weightPerSF > 0
        ? coverage * weightPerSF
        : null;

    var rounding =
      quantity > rawBoxes
        ? 'Rounded up to the nearest allowed box quantity.'
        : rawBoxes * sfPerBox >
          Math.max(requestedSF, minimumSF)
        ? 'Rounded up to the nearest full box.'
        : '';

    var minimumMessage = '';

    if (requestedSF < minimumSF) {
      minimumMessage =
        'Minimum order is ' +
        formatNumber(minimumSF, 2) +
        ' SF. The calculation has been adjusted to meet the minimum.';
    }

    setOutput(
      root,
      'quantity',
      String(quantity)
    );

    setOutput(
      root,
      'pieces',
      String(pieces)
    );

    setOutput(
      root,
      'coverage',
      formatNumber(coverage, 2) + ' SF'
    );

    setOutput(
      root,
      'total',
      formatMoney(root, totalCents)
    );

    setOutput(
      root,
      'weight',
      weight !== null
        ? formatNumber(weight, 0) + ' lb'
        : 'Not configured'
    );

    setMessage(
      root,
      'rounding',
      rounding,
      !!rounding
    );

    setMessage(
      root,
      'minimum',
      minimumMessage,
      !!minimumMessage
    );

    var inventoryState =
      checkInventory(
        quantity,
        variant
      );

    renderCommonStock(
      root,
      variant,
      quantity
    );

    if (!inventoryState.valid) {
      updatePriceDisplay(
        root,
        totalCents,
        false
      );

      updateButtons(root, false);

      return {
        valid: false,
        message: inventoryState.message
      };
    }

    syncQuantity(root, quantity);

    var totalFormatted =
      formatMoney(root, totalCents);

    var data = {
      calculatorType: 'Square Footage',
      soldBy: root.dataset.soldBy,
      requestedSF: formatNumber(
        requestedSF,
        2
      ) + ' SF',
      effectiveSF: formatNumber(
        Math.max(
          requestedSF,
          minimumSF
        ),
        2
      ) + ' SF',
      requestedPieces: '',
      boxes: quantity,
      pieces: pieces,
      sheets: '',
      coverage:
        formatNumber(coverage, 2) +
        ' SF',
      totalFormatted: totalFormatted,
      weight:
        weight !== null
          ? formatNumber(weight, 0) +
            ' lb'
          : 'Not configured',
      minimum:
        formatNumber(
          minimumSF,
          2
        ) + ' SF',
      rounding:
        rounding ||
        'No additional rounding required.'
    };

    syncProperties(root, data);

    updatePriceDisplay(
      root,
      totalCents,
      true
    );

    updateButtons(root, true);

    return {
      valid: true,
      quantity: quantity,
      totalCents: totalCents,
      data: data,
      source: source
    };
  }

  function calculateSheet(root, variant) {
    var sfInput = root.querySelector(
      '[data-calculator-input="sf"]'
    );

  var coveragePerSheet =
    parseNumber(
      variant.coveragePerSheet
    );

  var weightPerSheet =
    parseNumber(
      variant.shippingWeightPerSheet
    );

  if (
    coveragePerSheet === null ||
    coveragePerSheet <= 0
  ) {
    coveragePerSheet =
      parseNumber(
        root.dataset.coveragePerSheet
      );
  }

  if (
    weightPerSheet === null ||
    weightPerSheet <= 0
  ) {
    weightPerSheet =
      parseNumber(
        root.dataset.weightPerSheet
      );
  }

    var minimumSheets =
      parseNumber(
        root.dataset.minimum
      );

    if (
      !coveragePerSheet ||
      coveragePerSheet <= 0
    ) {
      return {
        valid: false,
        message:
          'This mosaic product is missing Coverage per Sheet configuration.'
      };
    }

    setOutput(
      root,
      'coverage-per-sheet',
      formatNumber(
        coveragePerSheet,
        2
      )
    );

    var sfValue =
      parseNumber(sfInput.value);

    if (
      sfValue === null ||
      sfValue <= 0
    ) {
      setOutput(root, 'quantity', '—');
      setOutput(root, 'coverage', '—');
      setOutput(root, 'total', '—');
      setOutput(root, 'weight', '—');

      setMessage(root, 'rounding', '', false);
      setMessage(root, 'minimum', '', false);

      updatePriceDisplay(root, null, false);
      updateButtons(root, false);

      return {
        valid: false,
        message: ''
      };
    }

    var effectiveSF =
      Math.max(
        sfValue,
        minimumSheets * coveragePerSheet
      );

    var rawSheets =
      Math.ceil(
        effectiveSF /
        coveragePerSheet
      );

    var sheets =
      normalizeQuantity(
        rawSheets,
        variant
      );

    var maxError =
      getQuantityLimitError(
        sheets,
        variant
      );

    if (maxError) {
      updateButtons(root, false);

      return {
        valid: false,
        message: maxError
      };
    }

    var coverage =
      sheets *
      coveragePerSheet;

    var totalCents =
      Number(variant.price) *
      sheets;

    var weight =
      weightPerSheet > 0
        ? sheets * weightPerSheet
        : null;

    var rounding =
      sheets > rawSheets
        ? 'Rounded up to the nearest allowed sheet quantity.'
        : coverage >
          sfValue
        ? 'Rounded up to the nearest full sheet.'
        : '';

    var minimumMessage = '';

    if (
      sfValue <
      minimumSheets * coveragePerSheet
    ) {
      minimumMessage =
        'Minimum order is ' +
        minimumSheets +
        ' sheets. The calculation has been adjusted to meet the minimum.';
    }

    setOutput(
      root,
      'quantity',
      String(sheets)
    );

    setOutput(
      root,
      'coverage',
      formatNumber(
        coverage,
        2
      ) + ' SF'
    );

    setOutput(
      root,
      'total',
      formatMoney(
        root,
        totalCents
      )
    );

    setOutput(
      root,
      'weight',
      weight !== null
        ? formatNumber(
            weight,
            0
          ) + ' lb'
        : 'Not configured'
    );

    setMessage(
      root,
      'rounding',
      rounding,
      !!rounding
    );

    setMessage(
      root,
      'minimum',
      minimumMessage,
      !!minimumMessage
    );

    var inventoryState =
      checkInventory(
        sheets,
        variant
      );

    renderCommonStock(
      root,
      variant,
      sheets
    );

    if (!inventoryState.valid) {
      updatePriceDisplay(
        root,
        totalCents,
        false
      );

      updateButtons(root, false);

      return {
        valid: false,
        message: inventoryState.message
      };
    }

    syncQuantity(root, sheets);

    var totalFormatted =
      formatMoney(
        root,
        totalCents
      );

    var data = {
      calculatorType: 'Sheet',
      soldBy: root.dataset.soldBy,
      requestedSF:
        formatNumber(
          sfValue,
          2
        ) + ' SF',
      effectiveSF:
        formatNumber(
          effectiveSF,
          2
        ) + ' SF',
      requestedPieces: '',
      boxes: '',
      pieces: '',
      sheets: sheets,
      coverage:
        formatNumber(
          coverage,
          2
        ) + ' SF',
      totalFormatted:
        totalFormatted,
      weight:
        weight !== null
          ? formatNumber(
              weight,
              0
            ) + ' lb'
          : 'Not configured',
      minimum:
        String(minimumSheets) +
        ' sheets',
      rounding:
        rounding ||
        'No additional rounding required.'
    };

    syncProperties(
      root,
      data
    );

    updatePriceDisplay(
      root,
      totalCents,
      true
    );

    updateButtons(
      root,
      true
    );

    return {
      valid: true,
      quantity: sheets,
      totalCents: totalCents,
      data: data
    };
  }

  function calculatePiece(root, variant) {
    var piecesInput =
      root.querySelector(
        '[data-calculator-input="pieces"]'
      );

    var minimumPieces =
      parseNumber(
        root.dataset.minimum
      );

    var weightPerPiece =
      parseNumber(
        root.dataset.weightPerPiece
      );

    var value =
      parseNumber(
        piecesInput.value
      );

    if (
      value === null ||
      value <= 0
    ) {
      setOutput(
        root,
        'quantity',
        '—'
      );

      setOutput(
        root,
        'total',
        '—'
      );

      setOutput(
        root,
        'weight',
        '—'
      );

      updatePriceDisplay(
        root,
        null,
        false
      );

      updateButtons(
        root,
        false
      );

      setMessage(
        root,
        'minimum',
        '',
        false
      );

      return {
        valid: false,
        message: ''
      };
    }

    var rawPieces =
      Math.ceil(value);

    var pieces =
      normalizeQuantity(
        Math.max(
          rawPieces,
          minimumPieces
        ),
        variant
      );

    var maxError =
      getQuantityLimitError(
        pieces,
        variant
      );

    if (maxError) {
      updateButtons(
        root,
        false
      );

      return {
        valid: false,
        message: maxError
      };
    }

    var totalCents =
      Number(variant.price) *
      pieces;

    var weight =
      weightPerPiece > 0
        ? pieces *
          weightPerPiece
        : null;

    var minimumMessage = '';

    if (
      rawPieces <
      minimumPieces
    ) {
      minimumMessage =
        'Minimum order is ' +
        minimumPieces +
        ' pieces. The quantity has been adjusted to meet the minimum.';
    }

    var rounding =
      pieces > rawPieces
        ? 'Rounded up to the nearest allowed piece quantity.'
        : '';

    setOutput(
      root,
      'quantity',
      String(pieces)
    );

    setOutput(
      root,
      'total',
      formatMoney(
        root,
        totalCents
      )
    );

    setOutput(
      root,
      'weight',
      weight !== null
        ? formatNumber(
            weight,
            0
          ) + ' lb'
        : 'Weight estimate unavailable'
    );

    setMessage(
      root,
      'minimum',
      minimumMessage,
      !!minimumMessage
    );

    setMessage(
      root,
      'rounding',
      rounding,
      !!rounding
    );

    var inventoryState =
      checkInventory(
        pieces,
        variant
      );

    renderCommonStock(
      root,
      variant,
      pieces
    );

    if (!inventoryState.valid) {
      updatePriceDisplay(
        root,
        totalCents,
        false
      );

      updateButtons(
        root,
        false
      );

      return {
        valid: false,
        message: inventoryState.message
      };
    }

    syncQuantity(
      root,
      pieces
    );

    var totalFormatted =
      formatMoney(
        root,
        totalCents
      );

    var data = {
      calculatorType: 'Piece Quantity',
      soldBy: root.dataset.soldBy,
      requestedSF: '',
      effectiveSF: '',
      requestedPieces:
        String(rawPieces),
      boxes: '',
      pieces: pieces,
      sheets: '',
      coverage: '',
      totalFormatted:
        totalFormatted,
      weight:
        weight !== null
          ? formatNumber(
              weight,
              0
            ) + ' lb'
          : 'Weight estimate unavailable',
      minimum:
        String(minimumPieces) +
        ' pieces',
      rounding:
        rounding ||
        'No additional rounding required.'
    };

    syncProperties(
      root,
      data
    );

    updatePriceDisplay(
      root,
      totalCents,
      true
    );

    updateButtons(
      root,
      true
    );

    return {
      valid: true,
      quantity: pieces,
      totalCents: totalCents,
      data: data
    };
  }

  function calculate(root) {
    var variants =
      getVariantData(root);

    var variant =
      getSelectedVariant(
        root,
        variants
      );

    if (!variant) {
      setMessage(
        root,
        'error',
        'Unable to determine the selected product variant.',
        true
      );

      updateButtons(
        root,
        false
      );

      return {
        valid: false
      };
    }

    var result;

    switch (
      root.dataset.calculatorType
    ) {
      case 'square_footage':
        result =
          calculateTile(
            root,
            variant
          );
        break;

      case 'sheet':
        result =
          calculateSheet(
            root,
            variant
          );
        break;

      case 'piece':
        result =
          calculatePiece(
            root,
            variant
          );
        break;

      default:
        result = {
          valid: true
        };
    }

    if (
      result &&
      result.message
    ) {
      setMessage(
        root,
        'error',
        result.message,
        true
      );
    } else {
      setMessage(
        root,
        'error',
        '',
        false
      );
    }

    root._calculatorState =
      result;

    return result;
  }

  function bindCalculator(root) {
    if (
      root.dataset.calculatorInitialized ===
      'true'
    ) {
      calculate(root);
      return;
    }

    root.dataset.calculatorInitialized =
      'true';

    var inputs =
      root.querySelectorAll(
        '[data-calculator-input]'
      );

    Array.prototype.forEach.call(
      inputs,
      function (input) {
        input.addEventListener(
          'input',
          function () {
            calculate(root);
          }
        );

        input.addEventListener(
          'blur',
          function () {
            calculate(root);
          }
        );
      }
    );

    calculate(root);
  }

  function initialize(scope) {
    var roots;

    if (
      scope &&
      scope.matches &&
      scope.matches(
        '[data-product-calculator]'
      )
    ) {
      roots = [scope];
    } else if (scope) {
      roots = Array.prototype.slice.call(
        scope.querySelectorAll(
          '[data-product-calculator]'
        )
      );
    } else {
      roots = Array.prototype.slice.call(
        document.querySelectorAll(
          '[data-product-calculator]'
        )
      );
    }

    roots.forEach(
      bindCalculator
    );
  }

  document.addEventListener(
    'change',
    function (event) {
      var target =
        event.target;

      if (
        !target ||
        !target.matches
      ) {
        return;
      }

      if (
        target.matches(
          '[name="id"], select[name="id"], input[name^="options["]'
        )
      ) {
        setTimeout(
          function () {
            initialize();
          },
          80
        );
      }

      if (
        target.matches(
          'input[name="quantity"]'
        )
      ) {
        var productForm =
          target.closest(
            'product-form[data-calculator-form]'
          );

        if (!productForm) {
          return;
        }

        var root =
          document.querySelector(
            '[data-calculator-section="' +
              productForm.dataset.calculatorForm +
              '"]'
          );

        if (
          root &&
          root._calculatorState &&
          root._calculatorState.valid
        ) {
          syncQuantity(
            root,
            root._calculatorState.quantity
          );
        }
      }
    }
  );

  document.addEventListener(
    'submit',
    function (event) {
      var form =
        event.target;

      if (
        !form ||
        !form.matches
      ) {
        return;
      }

      var productForm =
        form.closest(
          'product-form[data-calculator-form]'
        );

      if (!productForm) {
        return;
      }

      var sectionId =
        productForm.dataset.calculatorForm;

      var root =
        document.querySelector(
          '[data-calculator-section="' +
            sectionId +
            '"]'
        );

      if (!root) {
        return;
      }

      var result =
        root._calculatorState ||
        calculate(root);

      if (
        !result ||
        !result.valid
      ) {
        event.preventDefault();

        setMessage(
          root,
          'error',
          result &&
          result.message
            ? result.message
            : 'Please complete the calculator before adding this product to your cart.',
          true
        );

        var firstInput =
          root.querySelector(
            '[data-calculator-input]'
          );

        if (firstInput) {
          firstInput.focus();
        }

        return;
      }

      syncQuantity(
        root,
        result.quantity
      );

      if (
        result.data
      ) {
        syncProperties(
          root,
          result.data
        );
      }
    },
    true
  );

  document.addEventListener(
    'shopify:section:load',
    function (event) {
      initialize(
        event.target
      );
    }
  );

  if (
    document.readyState ===
    'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      function () {
        initialize();
      }
    );
  } else {
    initialize();
  }
})();

