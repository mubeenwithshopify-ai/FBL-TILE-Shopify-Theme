function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

class CartRemoveButton extends HTMLElement {
  constructor() {
    super();
    this.addEventListener("click", (event) => {
      event.preventDefault();
      const cartItems =
        this.closest("cart-items") || this.closest("cart-drawer-items");
      cartItems.updateQuantity(this.dataset.index, 0);
    });
  }
}
customElements.define("cart-remove-button", CartRemoveButton);

class CartItems extends HTMLElement {
  constructor() {
    super();
    this.currentItemCount = Array.from(
      this.querySelectorAll('[name="updates[]"]')
    ).reduce(
      (total, quantityInput) => total + parseInt(quantityInput.value),
      0
    );

    this.debouncedOnChange = debounce((event) => {
      this.onChange(event);
    }, 300);

    this.addEventListener("change", this.debouncedOnChange.bind(this));
    const gift_form_minicart = document.getElementById("gift_form_minicart");
    if (gift_form_minicart) {
      gift_form_minicart.addEventListener("change", (event) => {
        if (event.currentTarget.checked) {
          this.addGiftwrapCartClick(gift_form_minicart);
        } else {
          this.updateQuantity(event.currentTarget.dataset.index, 0);
        }
      });
    }
    document
      .querySelectorAll(".js-addtocart-page")
      .forEach((upsell) =>
        upsell.addEventListener("click", this.addProductUpSellEvent.bind(this))
      );
  }

  onChange(event) {
    this.updateQuantity(
      event.target.dataset.index,
      event.target.dataset.key,
      event.target.value,
      document.activeElement.getAttribute("name"),
      event.target
    );
  }

  getSectionsToRender() {
    return [
      {
        id: "main-cart-items",
        section: document.getElementById("main-cart-items").dataset.id,
        selector: ".js-contents",
      },
    ];
  }

async getCalculatorProperties(line, key) {
  try {
    const response = await fetch(
      `/cart.js?_calculator_sync=${Date.now()}`,
      {
        method: 'GET',
        cache: 'no-store',
        headers: {
          Accept: 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error('Unable to fetch cart.');
    }

    const cart = await response.json();

    /*
     * Prefer the unique Shopify line-item key.
     * This is safer than relying on the cart line number.
     */
    let item = null;

    if (key) {
      item = cart.items.find(function (cartItem) {
        return cartItem.key === key;
      });
    }

    /*
     * Fallback to line number if the key is unavailable.
     */
    if (!item && line) {
      item = cart.items[Number(line) - 1];
    }

    if (!item) {
      console.warn(
        'Calculator: Cart item not found.',
        {
          line: line,
          key: key
        }
      );

      return null;
    }

    console.log(
      'Calculator: Current cart properties',
      item.properties
    );

    return item.properties || {};
  } catch (error) {
    console.error(
      'Calculator cart property sync error:',
      error
    );

    return null;
  }
}


getUpdatedCalculatorProperties(properties, quantity) {
  if (!properties || typeof properties !== 'object') {
    return properties;
  }

  const updatedProperties = {
    ...properties
  };

  const newQuantity = Number(quantity);

  if (!Number.isFinite(newQuantity)) {
    return updatedProperties;
  }

  /*
   * Tile / Box calculator
   */
  if (
    Object.prototype.hasOwnProperty.call(
      updatedProperties,
      '_Boxes Required'
    )
  ) {
    updatedProperties['_Boxes Required'] =
      String(newQuantity);
  }

  /*
   * Mosaic / Sheet calculator
   */
  if (
    Object.prototype.hasOwnProperty.call(
      updatedProperties,
      '_Sheets Required'
    )
  ) {
    updatedProperties['_Sheets Required'] =
      String(newQuantity);
  }

  /*
   * Piece calculator
   */
  if (
    Object.prototype.hasOwnProperty.call(
      updatedProperties,
      '_Requested Pieces'
    )
  ) {
    updatedProperties['_Requested Pieces'] =
      String(newQuantity);
  }

  console.log(
    'Calculator: Updated properties',
    updatedProperties
  );

  return updatedProperties;
}

async updateQuantity(line, key, quantity, name, target) {
  quantity = quantity ? Number(quantity) : 0;

  this.enableLoading(line);

  let properties = null;

  /*
   * When quantity is greater than zero, retrieve the
   * latest calculator properties from Shopify.
   */
  if (quantity > 0) {
    properties = await this.getCalculatorProperties(
      line,
      key
    );

    if (properties) {
      properties =
        this.getUpdatedCalculatorProperties(
          properties,
          quantity
        );
    }
  }

  const payload = {
    line: Number(line),
    quantity: quantity,
    sections: this.getSectionsToRender().map(
      (section) => section.section
    ),
    sections_url: window.location.pathname
  };

  /*
   * Only send properties when we successfully retrieved
   * the existing calculator properties.
   *
   * Important:
   * Shopify replaces the complete properties object,
   * so we preserve all existing properties above.
   */
  if (properties) {
    payload.properties = properties;
  }

  console.log(
    'Calculator: Cart update payload',
    payload
  );

  const body = JSON.stringify(payload);

    fetch(`${routes.cart_change_url}`, { ...fetchConfig(), ...{ body } })
      .then((response) => {
        return response.text();
      })
      .then((state) => {
        const parsedState = JSON.parse(state);
        if (parsedState.errors) {
          this.updateMessageErrors(line, parsedState.errors, target);
          this.disableLoading();
          return;
        }       
        if (parsedState.item_count != undefined) {
          document.querySelectorAll(".cart-count").forEach((el) => {
            if (el.classList.contains("cart-count-drawer")) {
              el.innerHTML = `(${parsedState.item_count})`;
            } else {
              el.innerHTML = parsedState.item_count > 100 ? '~' : parsedState.item_count;
            }
          });
          if (document.querySelector("header-total-price")) {
            document
              .querySelector("header-total-price")
              .updateTotal(parsedState);
          }
        }
        const html = new DOMParser().parseFromString(
          parsedState.sections[
            document.getElementById("main-cart-items").dataset.id
          ],
          "text/html"
        );
        if (parsedState.item_count == 0) {
          this.getSectionsToRender().forEach((section) => {
            const elementToReplace = document.querySelector("#main-cart-items");
            elementToReplace.innerHTML = this.getSectionInnerHTML(
              parsedState.sections[section.section],
              "#main-cart-items"
            );
          });
        } else {
          this.getSectionsToRender().forEach((section) => {
            const elementToReplace =
              document
                .getElementById(section.id)
                .querySelector(section.selector) ||
              document.getElementById(section.id);
            elementToReplace.innerHTML = this.getSectionInnerHTML(
              parsedState.sections[section.section],
              section.selector
            );
          });
          const totals = this.getSectionInnerHTML(
            parsedState.sections[
              document.getElementById("main-cart-items").dataset.id
            ],
            ".cart-info .totals"
          );
          const totals_content = document.querySelector(".cart-info .totals");
          if (totals && totals_content) totals_content.innerHTML = totals;
          const cart_gift_html = html.getElementById("gift");
          const cart_gift = document.getElementById("gift");
          if (cart_gift) {
            cart_gift.innerHTML = cart_gift_html.innerHTML;
            const gift_form_minicart =
              document.getElementById("gift_form_minicart");
            if (gift_form_minicart) {
              gift_form_minicart.addEventListener("change", (event) => {
                if (event.currentTarget.checked) {
                  this.addGiftwrapCartClick(gift_form_minicart);
                } else {
                  this.updateQuantity(event.currentTarget.dataset.index, 0);
                }
              });
            }
          }
          const cart_free_ship = document.querySelector(
            "free-ship-progress-bar"
          );
          if (cart_free_ship) {
            cart_free_ship.init(parsedState.items_subtotal_price);
          }
          this.updateLiveRegions(line, key, parsedState.item_count);
        }
        this.disableLoading();
      })
      .catch(() => {
        this.disableLoading();
      })
      .finally(() => {});
  }

  updateLiveRegions(line, key, itemCount) {
    if (this.currentItemCount === itemCount) {
      const lineItemError =
        document.getElementById(`Line-item-error-${line}`) ||
        document.getElementById(`CartDrawer-LineItemError-${line}`);
      const quantityElement =
        document.getElementById(`Quantity-${line}`) ||
        document.getElementById(`Drawer-quantity-${line}`);
      for (var item of document.querySelectorAll(".cart-item__error-text")) {
        item.classList.remove("error");
      }
      lineItemError
        .querySelector(`.cart-item__error-text-${key}`)
        .classList.add("error");
      lineItemError.querySelector(`.cart-item__error-text-${key}`).innerHTML =
        window.cartStrings.quantityError.replace(
          "[quantity]",
          quantityElement.value
        );
    }

    this.currentItemCount = itemCount;
  }

  updateMessageErrors(line, message, target) {
    const val = target.dataset.value;
    target.value = val;
    var wrapperDiv = document.createElement('div');
    var messageDiv = document.createElement('div');
    messageDiv.className = `mt-10 line-item-error-${line} error form__message inline-flex align-center`;
    messageDiv.setAttribute('tabindex', '-1');
    messageDiv.innerHTML = `
  <svg width="18" height="18" fill="none" class="flex-auto">
    <g stroke="#D0473E" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.3">
      <path d="M7.977 1.198c.573-.482 1.498-.482 2.054 0l1.293 1.105a1.89 1.89 0 0 0 1.039.376h1.39c.868 0 1.58.712 1.58 1.58v1.39c0 .328.171.786.376 1.031l1.105 1.293c.482.573.482 1.497 0 2.054l-1.105 1.292c-.204.246-.376.704-.376 1.031v1.391c0 .867-.712 1.58-1.58 1.58h-1.39c-.328 0-.786.171-1.031.376L10.039 16.8c-.573.483-1.497.483-2.054 0l-1.292-1.104c-.246-.205-.712-.377-1.031-.377H4.23c-.867 0-1.58-.712-1.58-1.579v-1.399c0-.319-.163-.785-.367-1.023l-1.105-1.3c-.474-.565-.474-1.481 0-2.046l1.105-1.3c.204-.246.368-.705.368-1.024V4.267c0-.868.712-1.58 1.579-1.58h1.415c.328 0 .786-.171 1.031-.376l1.301-1.113ZM7 11l4-4M11 11 7 7"/>
    </g>
  </svg>
`;
    var span = document.createElement('span');
    span.className = 'ml-5';
    span.textContent = message;
    messageDiv.appendChild(span);
    wrapperDiv.appendChild(messageDiv)
    showToast(wrapperDiv.innerHTML, 5000, "modal-error");
  }

  addGiftwrapCartClick(event) {
    const target = event;
    const variant_id = target.getAttribute("data-variant-id");
    const body = JSON.stringify({
      id: Number(variant_id),
      quantity: 1,
      sections: this.getSectionsToRender().map((section) => section.section),
      sections_url: window.location.pathname,
    });

    fetch(`${routes.cart_add_url}`, { ...fetchConfig(), ...{ body } })
      .then((response) => {
        return response.text();
      })
      .then((state) => {
        const parsedState = JSON.parse(state);
        fetch("/cart.json")
          .then((res) => res.json())
          .then((cart) => {
            if (cart.item_count != undefined) {
              document.querySelectorAll(".cart-count").forEach((el) => {
                if (el.classList.contains("cart-count-drawer")) {
                  el.innerHTML = `(${cart.item_count})`;
                } else {
                  el.innerHTML = cart.item_count > 100 ? '~' : cart.item_count;
                }
              });
              if (document.querySelector("header-total-price")) {
                document.querySelector("header-total-price").updateTotal(cart);
              }
              const cart_free_ship = document.querySelector(
                "free-ship-progress-bar"
              );
              if (cart_free_ship) {
                cart_free_ship.init(cart.items_subtotal_price);
              }
            }
          })
          .catch((error) => {
            throw error;
          });
        const html = new DOMParser().parseFromString(
          parsedState.sections[
            document.getElementById("main-cart-items").dataset.id
          ],
          "text/html"
        );
        if (parsedState.item_count == 0) {
          this.getSectionsToRender().forEach((section) => {
            const elementToReplace = document.querySelector(".cart-wrapper");
            elementToReplace.innerHTML = this.getSectionInnerHTML(
              parsedState.sections[section.section],
              ".cart-wrapper"
            );
          });
        } else {
          this.getSectionsToRender().forEach((section) => {
            const elementToReplace =
              document
                .getElementById(section.id)
                .querySelector(section.selector) ||
              document.getElementById(section.id);
            elementToReplace.innerHTML = this.getSectionInnerHTML(
              parsedState.sections[section.section],
              section.selector
            );
          });

          const totals = this.getSectionInnerHTML(
            parsedState.sections[
              document.getElementById("main-cart-items").dataset.id
            ],
            ".cart-info .totals"
          );
          const totals_content = document.querySelector(".cart-info .totals");
          if (totals && totals_content) totals_content.innerHTML = totals;
          const cart_gift_html = html.getElementById("gift");
          const cart_gift = document.getElementById("gift");
          if (cart_gift) {
            cart_gift.innerHTML = cart_gift_html.innerHTML;
            const gift_form_minicart =
              document.getElementById("gift_form_minicart");
            if (gift_form_minicart) {
              gift_form_minicart.addEventListener("change", (event) => {
                if (event.currentTarget.checked) {
                  this.addGiftwrapCartClick(gift_form_minicart);
                } else {
                  this.updateQuantity(event.currentTarget.dataset.index, 0);
                }
              });
            }
          }
        }
        this.disableLoading();
      })
      .catch(() => {
        this.disableLoading();
      });
  }

  addProductUpSellEvent(event) {
    event.preventDefault();
    const target = event.currentTarget;
    const variant_id = target
      .closest(".product-addtocart-js")
      .getAttribute("data-product-variant-id");
    const body = JSON.stringify({
      id: Number(variant_id),
      quantity: 1,
      sections: this.getSectionsToRender().map((section) => section.section),
      sections_url: window.location.pathname,
    });

    fetch(`${routes.cart_add_url}`, { ...fetchConfig(), ...{ body } })
      .then((response) => {
        return response.text();
      })
      .then((state) => {
        const parsedState = JSON.parse(state);
        fetch("/cart.json")
          .then((res) => res.json())
          .then((cart) => {
            if (cart.item_count != undefined) {
              document.querySelectorAll(".cart-count").forEach((el) => {
                if (el.classList.contains("cart-count-drawer")) {
                  el.innerHTML = `(${cart.item_count})`;
                } else {
                  el.innerHTML = cart.item_count > 100 ? '~' : cart.item_count;
                }
              });
              if (document.querySelector("header-total-price")) {
                document.querySelector("header-total-price").updateTotal(cart);
              }
              const cart_free_ship = document.querySelector(
                "free-ship-progress-bar"
              );
              if (cart_free_ship) {
                cart_free_ship.init(cart.items_subtotal_price);
              }
            }
          })
          .catch((error) => {
            throw error;
          });
        const html = new DOMParser().parseFromString(
          parsedState.sections[
            document.getElementById("main-cart-items").dataset.id
          ],
          "text/html"
        );
        if (parsedState.item_count == 0) {
          this.getSectionsToRender().forEach((section) => {
            const elementToReplace = document.querySelector(".cart-wrapper");
            elementToReplace.innerHTML = this.getSectionInnerHTML(
              parsedState.sections[section.section],
              ".cart-wrapper"
            );
          });
        } else {
          this.getSectionsToRender().forEach((section) => {
            const elementToReplace =
              document
                .getElementById(section.id)
                .querySelector(section.selector) ||
              document.getElementById(section.id);
            elementToReplace.innerHTML = this.getSectionInnerHTML(
              parsedState.sections[section.section],
              section.selector
            );
          });

          const totals = this.getSectionInnerHTML(
            parsedState.sections[
              document.getElementById("main-cart-items").dataset.id
            ],
            ".cart__footer .totals"
          );
          const totals_content = document.querySelector(
            ".cart__footer .totals"
          );
          if (totals && totals_content) totals_content.innerHTML = totals;
        }
      })
      .catch(() => {
        this.disableLoading();
      });
  }

  getSectionInnerHTML(html, selector) {
    return new DOMParser()
      .parseFromString(html, "text/html")
      .querySelector(selector).innerHTML;
  }

  enableLoading(line) {
    document.body.classList.add("start", "loading");
    document.activeElement.blur();
  }

  disableLoading() {
    document.body.classList.add("finish");
    setTimeout(function () {
      document.body.classList.remove("start", "loading", "finish");
    }, 500);
  }
}
customElements.define("cart-items", CartItems);

class CartPageUpsell extends CartItems {
  constructor() {
    super();
  }
  init() {
    this.connectedCallback();
  }
  connectedCallback() {
    fetch(this.dataset.url)
      .then((response) => response.text())
      .then((text) => {
        const html = document.createElement("div");
        html.innerHTML = text;
        const recommendations = html.querySelector(".swiper-wrapper");
        if (recommendations && recommendations.innerHTML.trim().length) {
          this.querySelector(".swiper-wrapper").innerHTML =
            recommendations.innerHTML;
        }
      })
      .finally(() => {
        BlsSettingsSwiper.init();
        BlsLazyloadImg.init();
        document
          .querySelectorAll(".js-addtocart-page")
          .forEach((upsell) =>
            upsell.addEventListener(
              "click",
              this.addProductUpSellEvent.bind(this)
            )
          );
      })
      .catch((e) => {
        console.error(e);
      });
  }
}
customElements.define("minicart-recommendations-page", CartPageUpsell);

if (!customElements.get("cart-note")) {
  customElements.define(
    "cart-note",
    class CartNote extends HTMLElement {
      constructor() {
        super();
        this.addEventListener(
          "change",
          debounce((event) => {
            const body = JSON.stringify({ note: event.target.value });
            fetch(`${routes.cart_update_url}`, {
              ...fetchConfig(),
              ...{ body },
            });
          }, 300)
        );
      }
    }
  );
}
