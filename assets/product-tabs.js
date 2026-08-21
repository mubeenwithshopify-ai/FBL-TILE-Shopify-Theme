class TabItems extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    this.type = this.getAttribute('data-type') || 'horizontal';

    this.tabTriggers = Array.from(
      this.querySelectorAll('[data-block-id].product-tabs__tab-item, [data-block-id].product_tab_title_input')
    );
    this.panels = Array.from(this.querySelectorAll('[data-block-id].product-tabs__tab-content'));

    this.tabTriggers.forEach((trigger) => {
      trigger.addEventListener('click', (e) => this.handleTriggerClick(e, trigger));
    });

    // Dropdown-select variant: toggle open/close
    this.selectWrap = this.querySelector('.select-product-tab');
    if (this.selectWrap) {
      this.selectedLabel = this.selectWrap.querySelector('.select__selected');
      this.selectContent = this.selectWrap.querySelector('.select-custom__content');

      this.selectedLabel.addEventListener('click', () => {
        this.selectContent.classList.toggle('invisible');
        this.selectedLabel.querySelector('.icon-down')?.classList.toggle('active-rotated');
      });

      document.addEventListener('click', (e) => {
        if (!this.selectWrap.contains(e.target)) {
          this.selectContent.classList.add('invisible');
          this.selectedLabel.querySelector('.icon-down')?.classList.remove('active-rotated');
        }
      });
    }
  }

  handleTriggerClick(e, trigger) {
    const blockId = trigger.getAttribute('data-id') || trigger.getAttribute('data-block-id');
    this.setActiveTab(blockId);

    // If this came from the dropdown list item, update the visible selected label
    if (this.selectedLabel && trigger.classList.contains('product_tab_title_input')) {
      this.selectedLabel.firstChild
        ? (this.selectedLabel.childNodes[0].textContent = trigger.textContent.trim())
        : (this.selectedLabel.textContent = trigger.textContent.trim());
      this.selectContent.classList.add('invisible');
    }
  }

  setActiveTab(blockId) {
    this.tabTriggers.forEach((trigger) => {
      const triggerId = trigger.getAttribute('data-id') || trigger.getAttribute('data-block-id');
      const isMatch = triggerId === blockId;
      trigger.classList.toggle('active', isMatch);
      if (trigger.hasAttribute('aria-selected')) {
        trigger.setAttribute('aria-selected', isMatch ? 'true' : 'false');
      }
    });

    this.panels.forEach((panel) => {
      const isMatch = panel.getAttribute('data-block-id') === blockId;
      panel.classList.toggle('active', isMatch);
    });
  }
}

if (!customElements.get('tab-items')) {
  customElements.define('tab-items', TabItems);
}