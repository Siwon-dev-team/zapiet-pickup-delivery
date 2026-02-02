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
  deliveryTimeSlots?: string;
}

interface Location {
  id: string;
  name: string;
  address: string;
  city: string;
  isPickup: boolean;
  isDelivery: boolean;
  businessHours: string;
  pickupActivationConditions: string;
  deliveryActivationConditions: string;
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
  private eligiblePickupLocations: Location[] = [];
  private eligibleDeliveryLocations: Location[] = [];
  private deliveryLocationsForPostal: Location[] | null = null;

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
      
      if (!response.ok) {
        throw new Error(`API responded with status ${response.status}`);
      }
      
      const data: WidgetData = await response.json();
      
      if (loading) {
        loading.style.display = 'none';
        loading.style.visibility = 'hidden';
        loading.remove();
      }
      
      if (content) {
        content.style.display = 'block';
        content.style.visibility = 'visible';
        content.style.opacity = '1';
        
        const methodSelector = content.querySelector('.zapiet-method-selector') as HTMLElement;
        if (methodSelector) {
          methodSelector.style.display = 'grid';
        }
      }

      this.data = data;
      this.applyPrimaryColor(data.settings.primaryColor);
      this.initWidget(data);
    } catch (err) {
      if (loading) {
        loading.textContent = 'Unable to load options. Please refresh the page.';
        loading.style.color = '#dc2626';
      }
    }
  }

  private applyPrimaryColor(color: string): void {
    if (color) {
      this.root.style.setProperty('--zapiet-primary-color', color);
    }
  }

  private parseActivationConditions(conditions: string | null | undefined): ActivationConditions {
    if (!conditions) return {};
    const trimmed = conditions.trim();
    if (!trimmed || trimmed === '{}') return {};

    let jsonString = trimmed;
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonString = trimmed.slice(firstBrace, lastBrace + 1);
    }

    try {
      return JSON.parse(jsonString) as ActivationConditions;
    } catch (e) {
      console.error('Error parsing activation conditions:', e);
      return {};
    }
  }

  private checkActivationConditions(conditions: string | null | undefined): ActivationResult {
    const rules = this.parseActivationConditions(conditions);

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
  }

  private getDeliveryTimeSlots(settings: WidgetSettings): string[] {
    const raw = settings.deliveryTimeSlots || '';
    return raw
      .split(',')
      .map(slot => slot.trim())
      .filter(Boolean);
  }

  private initWidget(data: WidgetData): void {
    const { settings, locations } = data;
    
    const orderNoteField = document.getElementById('zapiet-order-note') as HTMLTextAreaElement;
    const orderNoteAttr = document.getElementById('attr-order-note') as HTMLInputElement;
    if (orderNoteField && orderNoteAttr) {
      orderNoteField.addEventListener('input', () => {
        orderNoteAttr.value = orderNoteField.value;
        this.updateCartAttributes();
      });
    }
    
    const methodInput = document.getElementById('attr-method') as HTMLInputElement;
    const errorDiv = document.getElementById('zapiet-error');
    const deliveryBtn = document.getElementById('btn-delivery');
    const pickupBtn = document.getElementById('btn-pickup');

    if (!methodInput) return;

    const pickupLocations = locations.filter(l => l.isPickup);
    const deliveryLocations = locations.filter(l => l.isDelivery);

    const pickupChecks = pickupLocations.map(loc =>
      this.checkActivationConditions(loc.pickupActivationConditions)
    );
    const deliveryChecks = deliveryLocations.map(loc =>
      this.checkActivationConditions(loc.deliveryActivationConditions)
    );

    this.eligiblePickupLocations = pickupLocations.filter((_, index) => pickupChecks[index].valid);
    this.eligibleDeliveryLocations = deliveryLocations.filter((_, index) => deliveryChecks[index].valid);

    const pickupCheckMessage = pickupChecks.find(check => !check.valid)?.message;
    const deliveryCheckMessage = deliveryChecks.find(check => !check.valid)?.message;

    let hasValidMethod = false;
    
    if (settings.enablePickup && this.eligiblePickupLocations.length > 0 && pickupBtn) {
      pickupBtn.style.display = 'flex';
      if (!hasValidMethod) {
        pickupBtn.classList.add('active');
        this.showPanel('panel-pickup');
        methodInput.value = 'Pickup';
        hasValidMethod = true;
      }
    } else if (pickupBtn) {
      pickupBtn.style.display = 'none';
    }

    if (settings.enableDelivery && this.eligibleDeliveryLocations.length > 0 && deliveryBtn) {
      deliveryBtn.style.display = 'flex';
      if (!hasValidMethod) {
        deliveryBtn.classList.add('active');
        this.showPanel('panel-delivery');
        methodInput.value = 'Delivery';
        hasValidMethod = true;
      }
    } else if (deliveryBtn) {
      deliveryBtn.style.display = 'none';
    }

    if (!hasValidMethod) {
      if (errorDiv) {
        errorDiv.textContent =
          pickupCheckMessage ||
          deliveryCheckMessage ||
          'No shipping options available for your cart.';
        errorDiv.style.display = 'block';
      }
      return;
    }

    this.setupPickup(data);
    this.setupDelivery(data);
    this.setupCardSwitching();
    this.setupDateMinimums();
  }

  private showPanel(panelId: string): void {
    const panel = document.getElementById(panelId);
    if (panel) panel.style.display = 'block';
  }

  private setupPickup(data: WidgetData): void {
    const { settings, rates } = data;
    const locationList = document.getElementById('zapiet-location-list');
    if (!locationList) return;

    locationList.innerHTML = '';

    const pickupLocations = this.eligiblePickupLocations;
    if (pickupLocations.length === 0) return;

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
          this.updateCartAttributes();
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

    this.populateTimeSlots('zapiet-pickup-time');
    this.calculatePickupRate(location.id, rates);
    this.updateCartAttributes();
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

  private populateTimeSlots(selectId: string, timeSlots?: string[]): void {
    const select = document.getElementById(selectId) as HTMLSelectElement;
    if (!select) return;

    select.innerHTML = '<option value="">Select time...</option>';

    const slots = timeSlots && timeSlots.length > 0 ? timeSlots : [
      '9:00 AM - 12:00 PM',
      '12:00 PM - 3:00 PM',
      '2:00 PM - 6:00 PM',
      '3:00 PM - 6:00 PM',
      '4:00 PM - 7:00 PM',
      '5:00 PM - 11:00 PM'
    ];

    slots.forEach(slot => {
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
    this.deliveryLocationsForPostal = null;
    const checkButton = document.getElementById('zapiet-check-delivery');
    const postalInput = document.getElementById('zapiet-postal-code') as HTMLInputElement;
    const deliveryTimeSlots = this.getDeliveryTimeSlots(settings);
    this.populateTimeSlots('zapiet-delivery-time', deliveryTimeSlots);

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
          this.updateCartAttributes();
        });
      }
    }
  }

  private handleDeliveryCheck(data: WidgetData): void {
    const postalInput = document.getElementById('zapiet-postal-code') as HTMLInputElement;
    const resultDiv = document.getElementById('zapiet-delivery-result');
    const deliveryDateField = document.getElementById('zapiet-delivery-date') as HTMLInputElement;
    const deliveryTimeField = document.getElementById('zapiet-delivery-time') as HTMLSelectElement;
    const noteContainer = document.getElementById('zapiet-delivery-note-container');
    const rateDisplay = document.getElementById('zapiet-delivery-rate');

    if (!postalInput || !resultDiv) return;

    const postalCode = postalInput.value.trim().toUpperCase();

    if (!postalCode) {
      resultDiv.innerHTML = '<div class="zapiet-error-msg"><svg class="zapiet-icon-inline" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>Please enter a postal code.</div>';
      this.hideDeliveryFields();
      return;
    }

    const matchingLocations = this.filterDeliveryLocationsByPostalCode(
      postalCode,
      data.settings,
      this.eligibleDeliveryLocations
    );
    const isValid = matchingLocations.length > 0;

    if (isValid) {
      resultDiv.innerHTML = '<div class="zapiet-success-msg"><svg class="zapiet-icon-inline" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>Great! You are eligible for delivery.</div>';
      this.deliveryLocationsForPostal = matchingLocations;
      
      const postalAttr = document.getElementById('attr-postal-code') as HTMLInputElement;
      if (postalAttr) postalAttr.value = postalCode;
      
      this.setMethodAttribute('Delivery');
      
      const deliveryAvailable = document.getElementById('zapiet-delivery-available');
      if (deliveryAvailable) {
        deliveryAvailable.style.display = 'block';
        deliveryAvailable.style.visibility = 'visible';
      }
      
      if (deliveryDateField && deliveryDateField.parentElement) {
        const dateFieldWrapper = deliveryDateField.parentElement;
        dateFieldWrapper.style.display = 'flex';
        
        const datetimeContainer = dateFieldWrapper.parentElement;
        if (datetimeContainer) {
          datetimeContainer.style.display = 'grid';
        }
      }
      
      this.setupProgressiveDelivery(data);
    } else {
      resultDiv.innerHTML = '<div class="zapiet-error-msg"><svg class="zapiet-icon-inline" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" /></svg>Sorry, we do not deliver to your postal code.</div>';
      this.deliveryLocationsForPostal = null;
      this.hideDeliveryFields();
    }
  }

  private hideDeliveryFields(): void {
    const deliveryDateField = document.getElementById('zapiet-delivery-date') as HTMLInputElement;
    const deliveryTimeField = document.getElementById('zapiet-delivery-time') as HTMLSelectElement;
    const noteContainer = document.getElementById('zapiet-delivery-note-container');
    const rateDisplay = document.getElementById('zapiet-delivery-rate');

    if (deliveryDateField) deliveryDateField.parentElement!.parentElement!.style.display = 'none';
    if (deliveryTimeField) deliveryTimeField.parentElement!.style.display = 'none';
    if (noteContainer) noteContainer.style.display = 'none';
    if (rateDisplay) rateDisplay.style.display = 'none';
    this.deliveryLocationsForPostal = null;
  }

  private setupProgressiveDelivery(data: WidgetData): void {
    const deliveryDateField = document.getElementById('zapiet-delivery-date') as HTMLInputElement;
    const deliveryTimeField = document.getElementById('zapiet-delivery-time') as HTMLSelectElement;
    const noteContainer = document.getElementById('zapiet-delivery-note-container');
    const rateDisplay = document.getElementById('zapiet-delivery-rate');

    if (!deliveryDateField || !deliveryTimeField) return;

    if (deliveryTimeField) {
      deliveryTimeField.parentElement!.style.display = 'none';
    }
    if (noteContainer) noteContainer.style.display = 'none';
    if (rateDisplay) rateDisplay.style.display = 'none';

    deliveryDateField.parentElement!.style.display = 'flex';

    deliveryDateField.addEventListener('change', () => {
      if (deliveryDateField.value && deliveryTimeField) {
        deliveryTimeField.parentElement!.style.display = 'flex';
      }
    });

    deliveryTimeField.addEventListener('change', () => {
      if (deliveryTimeField.value) {
        if (data.settings.enableDeliveryNote && noteContainer) {
          noteContainer.style.display = 'block';
        }
        
        this.calculateDeliveryRate(data);
        
        if (rateDisplay) {
          setTimeout(() => {
            rateDisplay.style.display = 'block';
          }, 300);
        }
      }
    });
  }

  private filterDeliveryLocationsByPostalCode(
    postalCode: string,
    settings: WidgetSettings,
    locations: Location[]
  ): Location[] {
    const validationMode = settings.postalCodeValidation || 'none';
    if (validationMode === 'none') return locations;

    return locations.filter(location => {
      const rules = this.parseActivationConditions(location.deliveryActivationConditions);
      if (!rules.deliveryZones || rules.deliveryZones.length === 0) {
        return true;
      }

      if (validationMode === 'partial') {
        const prefix = postalCode.substring(0, 3);
        return rules.deliveryZones.some(zone => prefix === zone.toUpperCase().substring(0, 3));
      }

      if (validationMode === 'full') {
        return rules.deliveryZones.some(
          zone => postalCode === zone.toUpperCase().replace(/\s/g, '')
        );
      }

      return true;
    });
  }

  private calculateDeliveryRate(data: WidgetData): void {
    const { rates } = data;
    const deliveryLocations =
      this.deliveryLocationsForPostal && this.deliveryLocationsForPostal.length > 0
        ? this.deliveryLocationsForPostal
        : this.eligibleDeliveryLocations;
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

  private setupCardSwitching(): void {
    const deliveryBtn = document.getElementById('btn-delivery');
    const pickupBtn = document.getElementById('btn-pickup');

    if (deliveryBtn) {
      deliveryBtn.addEventListener('click', () => {
        deliveryBtn.classList.add('active');
        if (pickupBtn) pickupBtn.classList.remove('active');
        
        const pickupPanel = document.getElementById('panel-pickup');
        const deliveryPanel = document.getElementById('panel-delivery');
        if (pickupPanel) pickupPanel.style.display = 'none';
        if (deliveryPanel) deliveryPanel.style.display = 'block';
        
        this.setMethodAttribute('Delivery');
      });
    }

    if (pickupBtn) {
      pickupBtn.addEventListener('click', () => {
        pickupBtn.classList.add('active');
        if (deliveryBtn) deliveryBtn.classList.remove('active');
        
        const pickupPanel = document.getElementById('panel-pickup');
        const deliveryPanel = document.getElementById('panel-delivery');
        if (pickupPanel) pickupPanel.style.display = 'block';
        if (deliveryPanel) deliveryPanel.style.display = 'none';
        
        this.setMethodAttribute('Pickup');
      });
    }
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
        this.updateCartAttributes();
      });
    }

    if (deliveryDate) {
      deliveryDate.min = minDate;
      deliveryDate.addEventListener('change', () => {
        const dateAttr = document.getElementById('attr-date') as HTMLInputElement;
        if (dateAttr) dateAttr.value = deliveryDate.value;
        this.updateCartAttributes();
      });
    }

    const pickupTime = document.getElementById('zapiet-pickup-time') as HTMLSelectElement;
    const deliveryTime = document.getElementById('zapiet-delivery-time') as HTMLSelectElement;

    if (pickupTime) {
      pickupTime.addEventListener('change', () => {
        const timeAttr = document.getElementById('attr-time') as HTMLInputElement;
        if (timeAttr) timeAttr.value = pickupTime.value;
        this.updateCartAttributes();
      });
    }

    if (deliveryTime) {
      deliveryTime.addEventListener('change', () => {
        const timeAttr = document.getElementById('attr-time') as HTMLInputElement;
        if (timeAttr) timeAttr.value = deliveryTime.value;
        this.updateCartAttributes();
      });
    }
  }

  private setMethodAttribute(value: string): void {
    const methodInput = document.getElementById('attr-method') as HTMLInputElement;
    if (methodInput) methodInput.value = value;
    
    this.updateCartAttributes();
  }

  private async updateCartAttributes(): Promise<void> {
    const attributes: Record<string, string> = {};
    
    const orderNoteInput = document.getElementById('attr-order-note') as HTMLInputElement;
    const methodInput = document.getElementById('attr-method') as HTMLInputElement;
    const locationInput = document.getElementById('attr-location') as HTMLInputElement;
    const dateInput = document.getElementById('attr-date') as HTMLInputElement;
    const timeInput = document.getElementById('attr-time') as HTMLInputElement;
    const pickupNoteInput = document.getElementById('attr-pickup-note') as HTMLInputElement;
    const postalCodeInput = document.getElementById('attr-postal-code') as HTMLInputElement;
    const deliveryNoteInput = document.getElementById('attr-delivery-note') as HTMLInputElement;
    
    if (orderNoteInput?.value) attributes['_zapiet_order_note'] = orderNoteInput.value;
    if (methodInput?.value) attributes['_zapiet_method'] = methodInput.value;
    if (locationInput?.value) attributes['_zapiet_location'] = locationInput.value;
    if (dateInput?.value) attributes['_zapiet_date'] = dateInput.value;
    if (timeInput?.value) attributes['_zapiet_time'] = timeInput.value;
    if (pickupNoteInput?.value) attributes['_zapiet_pickup_note'] = pickupNoteInput.value;
    if (postalCodeInput?.value) attributes['_zapiet_postal_code'] = postalCodeInput.value;
    if (deliveryNoteInput?.value) attributes['_zapiet_delivery_note'] = deliveryNoteInput.value;

    if (Object.keys(attributes).length === 0) {
      return;
    }

    try {
      const response = await fetch('/cart/update.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ attributes }),
      });

      if (response.ok) {
        document.dispatchEvent(new CustomEvent('zapiet:cart-updated', { detail: attributes }));
      }
    } catch (error) {
      console.error('Error updating cart attributes:', error);
    }
  }
}

(window as any).ZapietWidget = ZapietWidget;
