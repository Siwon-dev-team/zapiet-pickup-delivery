interface WidgetSettings {
  enablePickup: boolean;
  enableDelivery: boolean;
  pickupTitle: string;
  deliveryTitle: string;
  primaryColor: string;
  logoUrl: string;
  pickupActivationConditions: string;
  deliveryActivationConditions: string;
  postalCodeValidation: 'none' | 'partial' | 'full';
  enablePickupNote: boolean;
  enableDeliveryNote: boolean;
  preselectLocation: 'first' | '';
  fallbackRate: number;
}

interface Location {
  id: string;
  name: string;
  address: string;
  city: string;
  isPickup: boolean;
  isDelivery: boolean;
  businessHours: string;
}

interface Rate {
  id: string;
  locationId: string;
  name: string;
  type: 'PRICE' | 'WEIGHT';
  min: number;
  max: number | null;
  price: number;
}

interface WidgetData {
  settings: WidgetSettings;
  locations: Location[];
  rates: Rate[];
}

interface ActivationConditions {
  minOrderValue?: number;
  maxOrderValue?: number;
  minWeight?: number;
  maxWeight?: number;
  deliveryZones?: string[];
}

interface ActivationResult {
  valid: boolean;
  message?: string;
}

class ZapietWidget {
  private root: HTMLElement;
  private shop: string;
  private cartTotal: number;
  private cartWeight: number;
  private data: WidgetData | null = null;

  constructor(rootId: string) {
    const rootElement = document.getElementById(rootId);
    if (!rootElement) {
      throw new Error(`Element with id "${rootId}" not found`);
    }
    this.root = rootElement;
    this.shop = this.root.getAttribute('data-shop') || '';
    this.cartTotal = parseFloat(this.root.getAttribute('data-cart-total') || '0');
    this.cartWeight = parseFloat(this.root.getAttribute('data-cart-weight') || '0');
  }

  async init(): Promise<void> {
    const loading = this.root.querySelector<HTMLElement>('.zapiet-loading');
    const content = this.root.querySelector<HTMLElement>('.zapiet-content');

    try {
      const response = await fetch(`/apps/zapiet?shop=${this.shop}`);
      const data: WidgetData = await response.json();
      
      if (loading) loading.style.display = 'none';
      if (content) content.style.display = 'block';

      this.data = data;
      this.applyPrimaryColor(data.settings.primaryColor);
      this.initWidget(data);
    } catch (err) {
      console.error('Zapiet Widget Error:', err);
      if (loading) loading.textContent = 'Unable to load options.';
    }
  }

  private applyPrimaryColor(color: string): void {
    if (color) {
      this.root.style.setProperty('--zapiet-primary-color', color);
    }
  }

  private checkActivationConditions(conditions: string): ActivationResult {
    if (!conditions || conditions === '{}') return { valid: true };

    try {
      const rules: ActivationConditions = JSON.parse(conditions);

      if (rules.minOrderValue && this.cartTotal < rules.minOrderValue) {
        return {
          valid: false,
          message: `Minimum order value is $${rules.minOrderValue}. Current: $${this.cartTotal.toFixed(2)}`
        };
      }

      if (rules.maxOrderValue && this.cartTotal > rules.maxOrderValue) {
        return {
          valid: false,
          message: `Maximum order value is $${rules.maxOrderValue}`
        };
      }

      if (rules.minWeight && this.cartWeight < rules.minWeight) {
        return {
          valid: false,
          message: `Minimum weight is ${rules.minWeight}kg. Current: ${this.cartWeight.toFixed(2)}kg`
        };
      }

      if (rules.maxWeight && this.cartWeight > rules.maxWeight) {
        return {
          valid: false,
          message: `Maximum weight is ${rules.maxWeight}kg. Current: ${this.cartWeight.toFixed(2)}kg`
        };
      }

      return { valid: true };
    } catch (e) {
      console.error('Error parsing activation conditions:', e);
      return { valid: true };
    }
  }

  private initWidget(data: WidgetData): void {
    const { settings, locations } = data;
    const tabsContainer = document.getElementById('zapiet-tabs');
    const methodInput = document.getElementById('attr-method') as HTMLInputElement;
    const errorDiv = document.getElementById('zapiet-error');

    if (!tabsContainer || !methodInput) return;

    const pickupCheck = this.checkActivationConditions(settings.pickupActivationConditions);
    const deliveryCheck = this.checkActivationConditions(settings.deliveryActivationConditions);

    // Create tabs
    if (settings.enablePickup && pickupCheck.valid) {
      this.createTab(tabsContainer, 'pickup', settings.pickupTitle, true);
      this.showPanel('panel-pickup');
      methodInput.value = 'Pickup';
    }

    if (settings.enableDelivery && deliveryCheck.valid) {
      const isActive = !settings.enablePickup || !pickupCheck.valid;
      this.createTab(tabsContainer, 'delivery', settings.deliveryTitle, isActive);
      if (isActive) {
        this.showPanel('panel-delivery');
        methodInput.value = 'Delivery';
      }
    }

    // Show error if neither option is available
    if ((!settings.enablePickup || !pickupCheck.valid) && (!settings.enableDelivery || !deliveryCheck.valid)) {
      if (errorDiv) {
        errorDiv.textContent = pickupCheck.message || deliveryCheck.message || 'No shipping options available for your cart.';
        errorDiv.style.display = 'block';
      }
      return;
    }

    this.setupPickup(data);
    this.setupDelivery(data);
    this.setupTabSwitching();
    this.setupDateMinimums();
  }

  private createTab(container: HTMLElement, type: string, title: string, active: boolean): void {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = `zapiet-tab${active ? ' active' : ''}`;
    tab.dataset.tab = type;
    tab.textContent = title;
    container.appendChild(tab);
  }

  private showPanel(panelId: string): void {
    const panel = document.getElementById(panelId);
    if (panel) panel.style.display = 'block';
  }

  private setupPickup(data: WidgetData): void {
    const { settings, locations, rates } = data;
    const locationList = document.getElementById('zapiet-location-list');
    if (!locationList) return;

    const pickupLocations = locations.filter(l => l.isPickup);

    pickupLocations.forEach((loc, index) => {
      const locationItem = document.createElement('label');
      locationItem.className = 'zapiet-location-item';
      locationItem.dataset.locationId = loc.id;

      const businessHoursText = this.formatBusinessHours(loc.businessHours, loc.name);
      const fullAddress = `${loc.address}${loc.city ? ', ' + loc.city : ''}`;

      locationItem.innerHTML = `
        <input type="radio" name="zapiet-location" value="${loc.name}" class="zapiet-location-radio" id="location-${index}" ${index === 0 && settings.preselectLocation === 'first' ? 'checked' : ''} />
        <div class="zapiet-location-content">
          <span class="zapiet-radio-indicator"></span>
          <div class="zapiet-location-info">
            <div class="zapiet-location-title">${String(index + 1).padStart(2, '0')}. ${businessHoursText}</div>
            <div class="zapiet-location-address">${fullAddress}</div>
            <a class="zapiet-location-link" href="#" data-location="${loc.name}" data-address="${fullAddress}" data-hours="${loc.businessHours || 'Not specified'}">More information</a>
          </div>
        </div>
      `;

      locationList.appendChild(locationItem);

      const radio = locationItem.querySelector('input[type="radio"]') as HTMLInputElement;
      const link = locationItem.querySelector('.zapiet-location-link') as HTMLAnchorElement;

      radio.addEventListener('change', () => {
        if (radio.checked) {
          this.handleLocationSelection(locationItem, loc, rates);
        }
      });

      link.addEventListener('click', (e) => {
        e.preventDefault();
        alert(`Location: ${loc.name}\nAddress: ${fullAddress}\nHours: ${loc.businessHours || 'Not specified'}`);
      });

      if (index === 0 && settings.preselectLocation === 'first') {
        this.handleLocationSelection(locationItem, loc, rates);
      }
    });

    if (settings.enablePickupNote) {
      const noteContainer = document.getElementById('zapiet-pickup-note-container');
      if (noteContainer) noteContainer.style.display = 'block';

      const noteField = document.getElementById('zapiet-pickup-note') as HTMLTextAreaElement;
      const noteAttr = document.getElementById('attr-pickup-note') as HTMLInputElement;
      if (noteField && noteAttr) {
        noteField.addEventListener('input', () => {
          noteAttr.value = noteField.value;
        });
      }
    }
  }

  private handleLocationSelection(item: HTMLElement, location: Location, rates: Rate[]): void {
    document.querySelectorAll('.zapiet-location-item').forEach(el => el.classList.remove('selected'));
    item.classList.add('selected');

    const locInput = document.getElementById('attr-location') as HTMLInputElement;
    if (locInput) locInput.value = location.name;

    const datetimeDiv = document.getElementById('zapiet-pickup-datetime');
    if (datetimeDiv) datetimeDiv.style.display = 'block';

    this.populateTimeSlots('zapiet-pickup-time', location.businessHours);
    this.calculatePickupRate(location.id, rates);
  }

  private formatBusinessHours(hours: string, locationName: string): string {
    if (!hours || hours === '{}') {
      return `[${locationName}]`;
    }

    try {
      const hoursObj = typeof hours === 'string' ? JSON.parse(hours) : hours;
      const today = new Date().getDay();
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dayName = days[today];

      if (hoursObj[dayName]) {
        return `[${dayName}][${locationName}] ${hoursObj[dayName]}`;
      } else if (hoursObj.default) {
        return `[${dayName}][${locationName}] ${hoursObj.default}`;
      }

      return `[${dayName}][${locationName}]`;
    } catch (e) {
      return `[${locationName}]`;
    }
  }

  private populateTimeSlots(selectId: string, businessHours: string): void {
    const select = document.getElementById(selectId) as HTMLSelectElement;
    if (!select) return;

    select.innerHTML = '<option value="">Select time...</option>';

    const timeSlots = [
      '9:00 AM - 12:00 PM',
      '12:00 PM - 3:00 PM',
      '2:00 PM - 6:00 PM',
      '3:00 PM - 6:00 PM',
      '4:00 PM - 7:00 PM',
      '5:00 PM - 11:00 PM'
    ];

    timeSlots.forEach(slot => {
      const option = document.createElement('option');
      option.value = slot;
      option.textContent = slot;
      select.appendChild(option);
    });
  }

  private calculatePickupRate(locationId: string, rates: Rate[]): void {
    const pickupRates = rates.filter(r => r.locationId === locationId);
    const rateDisplay = document.getElementById('zapiet-pickup-rate');
    if (!rateDisplay || !this.data) return;

    if (pickupRates.length > 0) {
      const applicableRate = pickupRates.find(r => {
        if (r.type === 'PRICE') {
          return this.cartTotal >= r.min && (!r.max || this.cartTotal <= r.max);
        } else if (r.type === 'WEIGHT') {
          return this.cartWeight >= r.min && (!r.max || this.cartWeight <= r.max);
        }
        return false;
      });

      if (applicableRate) {
        const price = applicableRate.price === 0 ? 'FREE' : `$${applicableRate.price.toFixed(2)}`;
        rateDisplay.innerHTML = `<strong>Pickup Rate:</strong> ${price}`;
        rateDisplay.style.display = 'block';
        this.setMethodAttribute(`Pickup|${applicableRate.price || 0}`);
      } else {
        const fallback = this.data.settings.fallbackRate || 0;
        rateDisplay.innerHTML = `<strong>Pickup Rate:</strong> $${fallback.toFixed(2)}`;
        rateDisplay.style.display = 'block';
        this.setMethodAttribute(`Pickup|${fallback}`);
      }
    } else {
      rateDisplay.style.display = 'none';
      this.setMethodAttribute('Pickup|0');
    }
  }

  private setupDelivery(data: WidgetData): void {
    const { settings } = data;
    const checkButton = document.getElementById('zapiet-check-delivery');
    const postalInput = document.getElementById('zapiet-postal-code') as HTMLInputElement;

    if (checkButton) {
      checkButton.addEventListener('click', () => this.handleDeliveryCheck(data));
    }

    if (postalInput) {
      postalInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.handleDeliveryCheck(data);
        }
      });
    }

    if (settings.enableDeliveryNote) {
      const noteContainer = document.getElementById('zapiet-delivery-note-container');
      if (noteContainer) noteContainer.style.display = 'block';

      const noteField = document.getElementById('zapiet-delivery-note') as HTMLTextAreaElement;
      const noteAttr = document.getElementById('attr-delivery-note') as HTMLInputElement;
      if (noteField && noteAttr) {
        noteField.addEventListener('input', () => {
          noteAttr.value = noteField.value;
        });
      }
    }
  }

  private handleDeliveryCheck(data: WidgetData): void {
    const postalInput = document.getElementById('zapiet-postal-code') as HTMLInputElement;
    const resultDiv = document.getElementById('zapiet-delivery-result');
    const availableDiv = document.getElementById('zapiet-delivery-available');

    if (!postalInput || !resultDiv || !availableDiv) return;

    const postalCode = postalInput.value.trim().toUpperCase();

    if (!postalCode) {
      resultDiv.innerHTML = '<div class="zapiet-error-msg"><svg class="zapiet-icon-inline" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>Please enter a postal code.</div>';
      availableDiv.style.display = 'none';
      return;
    }

    const isValid = this.validatePostalCode(postalCode, data.settings);

    if (isValid) {
      resultDiv.innerHTML = '<div class="zapiet-success-msg"><svg class="zapiet-icon-inline" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>Great! You are eligible for delivery.</div>';
      availableDiv.style.display = 'block';
      
      const postalAttr = document.getElementById('attr-postal-code') as HTMLInputElement;
      if (postalAttr) postalAttr.value = postalCode;
      
      this.setMethodAttribute('Delivery');
      this.calculateDeliveryRate(data);
    } else {
      resultDiv.innerHTML = '<div class="zapiet-error-msg"><svg class="zapiet-icon-inline" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" /></svg>Sorry, we do not deliver to your postal code.</div>';
      availableDiv.style.display = 'none';
    }
  }

  private validatePostalCode(postalCode: string, settings: WidgetSettings): boolean {
    const conditions = settings.deliveryActivationConditions || '{}';
    const validationMode = settings.postalCodeValidation || 'none';

    try {
      const rules: ActivationConditions = JSON.parse(conditions);

      if (!rules.deliveryZones || rules.deliveryZones.length === 0) {
        return true;
      }

      if (validationMode === 'none') {
        return true;
      } else if (validationMode === 'partial') {
        const prefix = postalCode.substring(0, 3);
        return rules.deliveryZones.some(zone => prefix === zone.toUpperCase().substring(0, 3));
      } else if (validationMode === 'full') {
        return rules.deliveryZones.some(zone => postalCode === zone.toUpperCase().replace(/\s/g, ''));
      }

      return true;
    } catch (e) {
      console.error('Error validating postal code:', e);
      return true;
    }
  }

  private calculateDeliveryRate(data: WidgetData): void {
    const { locations, rates } = data;
    const deliveryLocations = locations.filter(l => l.isDelivery);
    const deliveryRates: Rate[] = [];

    deliveryLocations.forEach(loc => {
      const locRates = rates.filter(r => r.locationId === loc.id);
      deliveryRates.push(...locRates);
    });

    const rateDisplay = document.getElementById('zapiet-delivery-rate');
    if (!rateDisplay) return;

    if (deliveryRates.length > 0) {
      const applicableRate = deliveryRates.find(r => {
        if (r.type === 'PRICE') {
          return this.cartTotal >= r.min && (!r.max || this.cartTotal <= r.max);
        } else if (r.type === 'WEIGHT') {
          return this.cartWeight >= r.min && (!r.max || this.cartWeight <= r.max);
        }
        return false;
      });

      if (applicableRate) {
        const price = applicableRate.price === 0 ? 'FREE' : `$${applicableRate.price.toFixed(2)}`;
        rateDisplay.innerHTML = `<strong>Delivery Rate:</strong> ${price}`;
        rateDisplay.style.display = 'block';
        this.setMethodAttribute(`Delivery|${applicableRate.price || 0}`);
      } else {
        const fallback = data.settings.fallbackRate || 0;
        rateDisplay.innerHTML = `<strong>Delivery Rate:</strong> $${fallback.toFixed(2)}`;
        rateDisplay.style.display = 'block';
        this.setMethodAttribute(`Delivery|${fallback}`);
      }
    } else {
      rateDisplay.style.display = 'none';
      this.setMethodAttribute('Delivery|0');
    }
  }

  private setupTabSwitching(): void {
    this.root.querySelectorAll('.zapiet-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        this.root.querySelectorAll('.zapiet-tab').forEach(t => t.classList.remove('active'));
        target.classList.add('active');

        const tabType = target.dataset.tab;
        document.getElementById('panel-pickup')!.style.display = tabType === 'pickup' ? 'block' : 'none';
        document.getElementById('panel-delivery')!.style.display = tabType === 'delivery' ? 'block' : 'none';

        this.setMethodAttribute(tabType === 'pickup' ? 'Pickup' : 'Delivery');
      });
    });
  }

  private setupDateMinimums(): void {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const minDate = tomorrow.toISOString().split('T')[0];

    const pickupDate = document.getElementById('zapiet-pickup-date') as HTMLInputElement;
    const deliveryDate = document.getElementById('zapiet-delivery-date') as HTMLInputElement;

    if (pickupDate) {
      pickupDate.min = minDate;
      pickupDate.addEventListener('change', () => {
        const dateAttr = document.getElementById('attr-date') as HTMLInputElement;
        if (dateAttr) dateAttr.value = pickupDate.value;
      });
    }

    if (deliveryDate) {
      deliveryDate.min = minDate;
      deliveryDate.addEventListener('change', () => {
        const dateAttr = document.getElementById('attr-date') as HTMLInputElement;
        if (dateAttr) dateAttr.value = deliveryDate.value;
      });
    }

    const pickupTime = document.getElementById('zapiet-pickup-time') as HTMLSelectElement;
    const deliveryTime = document.getElementById('zapiet-delivery-time') as HTMLSelectElement;

    if (pickupTime) {
      pickupTime.addEventListener('change', () => {
        const timeAttr = document.getElementById('attr-time') as HTMLInputElement;
        if (timeAttr) timeAttr.value = pickupTime.value;
      });
    }

    if (deliveryTime) {
      deliveryTime.addEventListener('change', () => {
        const timeAttr = document.getElementById('attr-time') as HTMLInputElement;
        if (timeAttr) timeAttr.value = deliveryTime.value;
      });
    }
  }

  private setMethodAttribute(value: string): void {
    const methodInput = document.getElementById('attr-method') as HTMLInputElement;
    if (methodInput) methodInput.value = value;
  }
}

// Initialize widget when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const widget = new ZapietWidget('zapiet-widget-root');
  widget.init();
});

