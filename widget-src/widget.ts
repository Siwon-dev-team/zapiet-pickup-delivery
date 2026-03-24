
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
  enableOrderNote?: boolean;
  preselectLocation: 'first' | '';
  fallbackRate: number;
  deliveryTimeSlots?: string;
  enablePickupNextWeekOnly?: boolean;
  pickupNextWeekSameWeekDays?: string;
  enableDeliveryNextWeekOnly?: boolean;
  deliveryNextWeekSameWeekDays?: string;
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
  pickupNextWeekOnly?: boolean;
  pickupNextWeekSameWeekDays?: string;
  deliveryNextWeekOnly?: boolean;
  deliveryNextWeekSameWeekDays?: string;
  pickupTimeSlots?: string;
  deliveryTimeSlots?: string;
  pickupTimeSlotsPerDay?: string;
  deliveryTimeSlotsPerDay?: string;
  pickupDays?: string;
  deliveryDays?: string;
  pickupPreparationDays?: number;
  pickupMaxDaysInAdvance?: number;
  deliveryMaxDaysInAdvance?: number;
}

interface Rate {
  id: string;
  locationId: string;
  name: string;
  type: 'PRICE' | 'WEIGHT';
  method?: 'PICKUP' | 'DELIVERY' | 'BOTH' | string;
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
  private pickupDatePicker: any = null;
  private deliveryDatePicker: any = null;
  private isSetup = false;

  private extractSortNumber(name: string): number | null {
    const match = name.trim().match(/^(\d+)/);
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }

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
      const apiUrl = `/apps/zapiet?shop=${this.shop}`;
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error ${response.status}: ${errorText}`);
      }
      
      const data: WidgetData = await response.json();
      if (!data || !data.settings) {
        throw new Error('Invalid API response: missing data');
      }

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
      console.error('[Zapiet] Widget Error:', err);
      if (loading) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        loading.innerHTML = `
          <div style="color: #dc2626; font-size: 14px;">
            <strong>Unable to load pickup/delivery options</strong><br>
            <small>${errorMsg}</small><br>
            <button onclick="location.reload()" style="margin-top: 8px; padding: 4px 12px; background: #dc2626; color: white; border: none; border-radius: 4px; cursor: pointer;">
              Refresh Page
            </button>
          </div>
        `;
      }
    }
  }


  private applyPrimaryColor(color: string): void {
    if (color) {
      this.root.style.setProperty('--zapiet-primary-color', color);
    }
  }

  private getRootElement<T extends Element>(selector: string): T | null {
    return this.root.querySelector(selector) as T | null;
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

  private toLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private parseYMDToLocalDate(value: string): Date {
    const [yearStr, monthStr, dayStr] = value.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);

    if (
      Number.isNaN(year) ||
      Number.isNaN(month) ||
      Number.isNaN(day) ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31
    ) {
      return new Date(value);
    }

    return new Date(year, month - 1, day);
  }

  private getCalendarAppendTarget(): HTMLElement {
    const dialog = this.root.closest<HTMLElement>('dialog');
    if (dialog) {
      return dialog;
    }

    const PORTAL_ID = 'zapiet-cal-portal';
    let portal = document.getElementById(PORTAL_ID);
    if (!portal) {
      portal = document.createElement('div');
      portal.id = PORTAL_ID;
      portal.style.cssText =
        'position:fixed;top:0;left:0;width:0;height:0;overflow:visible;' +
        'background:transparent;border:none;padding:0;margin:0;pointer-events:none;';
      document.body.appendChild(portal);

      if (typeof (portal as any).showPopover === 'function') {
        portal.setAttribute('popover', 'manual');
        (portal as any).showPopover();
      }
    }
    return portal;
  }

  private positionCalendar(calendarContainer: HTMLElement, input: HTMLInputElement): void {
    calendarContainer.className = calendarContainer.className
      .split(' ')
      .filter((cls: string) => !cls.startsWith('arrow'))
      .join(' ');

    const inputRect = input.getBoundingClientRect();
    if (inputRect.width === 0 || inputRect.height === 0) return;

    let cbLeft = 0;
    let cbTop = 0;
    for (
      let el: HTMLElement | null = calendarContainer.parentElement;
      el && el !== document.documentElement;
      el = el.parentElement
    ) {
      const cs = getComputedStyle(el);
      const hasContainingBlock =
        cs.transform !== 'none' ||
        cs.translate !== 'none' ||
        cs.scale !== 'none' ||
        cs.rotate !== 'none' ||
        (cs.filter !== 'none' && cs.filter !== '') ||
        cs.willChange === 'transform' ||
        cs.willChange === 'filter';
      if (hasContainingBlock) {
        const r = el.getBoundingClientRect();
        cbLeft = r.left;
        cbTop = r.top;
        break;
      }
    }

    let vpLeft = Math.max(10, Math.min(inputRect.left, window.innerWidth - 320));
    let vpTop  = inputRect.bottom + 4;

    if (vpTop + 320 > window.innerHeight) {
      vpTop = Math.max(10, inputRect.top - 324);
    }
    if (vpLeft < 0 || vpLeft > window.innerWidth || vpTop < 0 || vpTop > window.innerHeight) {
      vpLeft = Math.max(10, (window.innerWidth - 320) / 2);
      vpTop  = Math.max(10, (window.innerHeight - 320) / 2);
    }

    const leftPos = vpLeft - cbLeft;
    const topPos  = vpTop  - cbTop;

    calendarContainer.style.cssText = `
      position: fixed !important;
      left: ${leftPos}px !important;
      top: ${topPos}px !important;
      right: auto !important;
      bottom: auto !important;
      z-index: 2147483647 !important;
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      pointer-events: auto !important;
      transform: none !important;
      margin: 0 !important;
      max-height: ${Math.min(320, window.innerHeight - vpTop - 20)}px !important;
      overflow: auto !important;
    `;

    void calendarContainer.offsetHeight;
  }

  private initPickupDatePicker(input: HTMLInputElement, allowedDays: string[], minDate: Date, maxDate?: Date, location?: Location): void {
    if (this.pickupDatePicker) {
      this.pickupDatePicker.destroy();
    }

    if (typeof (window as any).flatpickr === 'undefined') {
      setTimeout(() => {
        this.initPickupDatePicker(input, allowedDays, minDate, maxDate, location);
      }, 500);
      return;
    }

    const flatpickrInstance = (window as any).flatpickr;
    this.pickupDatePicker = flatpickrInstance(input, {
      minDate: minDate,
      maxDate: maxDate || null,
      dateFormat: 'Y-m-d',
      appendTo: this.getCalendarAppendTarget(),
      static: false,
      clickOpens: true,
      allowInput: false,
      defaultDate: null,
      inline: false,
      disableMobile: true,
      ignoredFocusElements: [],
      disable: [
        (date: Date) => {
          if (allowedDays.length === 0) return false;
          const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
          const dayName = dayNames[date.getDay()];
          return !allowedDays.map(d => d.toLowerCase()).includes(dayName);
        }
      ],
      onOpen: (_selectedDates: Date[], _dateStr: string, instance: any) => {
        if (instance.calendarContainer) {
          this.positionCalendar(instance.calendarContainer, input);
          setTimeout(() => {
            if (instance.calendarContainer && instance.isOpen) {
              this.positionCalendar(instance.calendarContainer, input);
            }
          }, 50);
        }
      },
      onClose: (_selectedDates: Date[], _dateStr: string, instance: any) => {
        const cal = instance.calendarContainer;
        if (cal) {
          cal.style.position = '';
          cal.style.left = '';
          cal.style.top = '';
          cal.style.right = '';
          cal.style.bottom = '';
          cal.style.display = '';
          cal.style.visibility = '';
          cal.style.opacity = '';
          cal.style.zIndex = '';
          cal.style.pointerEvents = '';
          cal.style.transform = '';
          cal.style.margin = '';
          cal.style.maxHeight = '';
          cal.style.overflow = '';
        }
      },
      onChange: (_selectedDates: Date[], dateStr: string) => {
        const dateAttr = document.getElementById('attr-date') as HTMLInputElement;
        if (dateAttr) dateAttr.value = dateStr;

        if (location && dateStr) {
          const timeSlots = this.getTimeSlotsForDay(location, true, dateStr);
          this.populateTimeSlots('zapiet-pickup-time', timeSlots);
        }

        this.updateCartAttributes();
      }
    });
    input.style.cursor = 'pointer';
    input.setAttribute('readonly', 'readonly');
  }

  private initDeliveryDatePicker(input: HTMLInputElement, allowedDays: string[], minDate: Date, maxDate?: Date): void {
    if (this.deliveryDatePicker) {
      this.deliveryDatePicker.destroy();
    }

    if (typeof (window as any).flatpickr === 'undefined') {
      setTimeout(() => {
        this.initDeliveryDatePicker(input, allowedDays, minDate, maxDate);
      }, 500);
      return;
    }

    const flatpickrInstance = (window as any).flatpickr;
    this.deliveryDatePicker = flatpickrInstance(input, {
      minDate: minDate,
      maxDate: maxDate || null,
      dateFormat: 'Y-m-d',
      appendTo: this.getCalendarAppendTarget(),
      static: false,
      clickOpens: true,
      allowInput: false,
      defaultDate: null,
      inline: false,
      disableMobile: true,
      ignoredFocusElements: [],
      disable: [
        (date: Date) => {
          if (allowedDays.length === 0) return false;
          const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
          const dayName = dayNames[date.getDay()];
          return !allowedDays.map(d => d.toLowerCase()).includes(dayName);
        }
      ],
      onOpen: (_selectedDates: Date[], _dateStr: string, instance: any) => {
        if (instance.calendarContainer) {
          this.positionCalendar(instance.calendarContainer, input);
          setTimeout(() => {
            if (instance.calendarContainer && instance.isOpen) {
              this.positionCalendar(instance.calendarContainer, input);
            }
          }, 50);
        }
      },
      onClose: (_selectedDates: Date[], _dateStr: string, instance: any) => {
        const cal = instance.calendarContainer;
        if (cal) {
          cal.style.position = '';
          cal.style.left = '';
          cal.style.top = '';
          cal.style.right = '';
          cal.style.bottom = '';
          cal.style.display = '';
          cal.style.visibility = '';
          cal.style.opacity = '';
          cal.style.zIndex = '';
          cal.style.pointerEvents = '';
          cal.style.transform = '';
          cal.style.margin = '';
          cal.style.maxHeight = '';
          cal.style.overflow = '';
        }
      },
      onChange: (_selectedDates: Date[], dateStr: string) => {
        const dateAttr = document.getElementById('attr-date') as HTMLInputElement;
        if (dateAttr) dateAttr.value = dateStr;
        
        if (this.deliveryLocationsForPostal && this.deliveryLocationsForPostal.length > 0 && dateStr) {
          const loc = this.deliveryLocationsForPostal[0];
          const timeSlots = this.getTimeSlotsForDay(loc, false, dateStr);
          this.populateTimeSlots('zapiet-delivery-time', timeSlots);
        }

        const deliveryTimeField = this.getRootElement<HTMLSelectElement>('#zapiet-delivery-time');
        if (dateStr && deliveryTimeField) {
          deliveryTimeField.parentElement!.style.display = 'flex';
        }

        this.updateCartAttributes();
      }
    });

    input.style.cursor = 'pointer';
    input.setAttribute('readonly', 'readonly');
  }

  private initWidget(data: WidgetData): void {
    const { settings, locations } = data;
    
    const orderNoteField = this.getRootElement<HTMLTextAreaElement>('#zapiet-order-note');
    const orderNoteBlock = this.getRootElement<HTMLElement>('.zapiet-order-note-block');
    const orderNoteToggle = this.getRootElement<HTMLButtonElement>('#zapiet-order-note-toggle');
    const orderNoteContent = this.getRootElement<HTMLElement>('#zapiet-order-note-content');
    const orderNoteAttr = document.getElementById('attr-order-note') as HTMLInputElement;
    const showOrderNote = settings.enableOrderNote ?? true;

    const setOrderNoteExpanded = (expanded: boolean) => {
      if (orderNoteToggle) {
        orderNoteToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      }
      if (orderNoteContent) {
        orderNoteContent.style.display = expanded ? 'block' : 'none';
      }
    };

    if (orderNoteBlock) {
      orderNoteBlock.style.display = showOrderNote ? 'block' : 'none';
    }
    setOrderNoteExpanded(false);

    if (!showOrderNote && orderNoteAttr) {
      orderNoteAttr.value = '';
    }

    if (showOrderNote && orderNoteToggle) {
      orderNoteToggle.addEventListener('click', () => {
        const isExpanded = orderNoteToggle.getAttribute('aria-expanded') === 'true';
        setOrderNoteExpanded(!isExpanded);
      });
    }

    if (showOrderNote && orderNoteField && orderNoteAttr) {
      orderNoteField.addEventListener('input', () => {
        orderNoteAttr.value = orderNoteField.value;
        this.updateCartAttributes();
      });
    }
    
    const methodInput = document.getElementById('attr-method') as HTMLInputElement;
    const errorDiv = this.getRootElement<HTMLElement>('#zapiet-error');
    const deliveryBtn = this.getRootElement<HTMLElement>('#btn-delivery');
    const pickupBtn = this.getRootElement<HTMLElement>('#btn-pickup');

    const pickupLocations = locations.filter(l => l.isPickup);
    const deliveryLocations = locations.filter(l => l.isDelivery);

    const pickupChecks = pickupLocations.map(loc =>
      this.checkActivationConditions(loc.pickupActivationConditions)
    );
    this.eligiblePickupLocations = pickupLocations.filter((_, index) => pickupChecks[index].valid);
    this.eligibleDeliveryLocations = deliveryLocations;

    const pickupCheckMessage = pickupChecks.find(check => !check.valid)?.message;

    let hasValidMethod = false;
    
    if (settings.enablePickup && this.eligiblePickupLocations.length > 0 && pickupBtn) {
      pickupBtn.style.display = 'flex';
      if (!hasValidMethod) {
        pickupBtn.classList.add('active');
        this.showPanel('panel-pickup');
        if (methodInput) methodInput.value = 'Pickup';
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
        if (methodInput) methodInput.value = 'Delivery';
        hasValidMethod = true;
      }
    } else if (deliveryBtn) {
      deliveryBtn.style.display = 'none';
    }

    if (!hasValidMethod) {
      if (errorDiv) {
        errorDiv.textContent =
          pickupCheckMessage ||
          'No shipping options available for your cart.';
        errorDiv.style.display = 'block';
      }
      return;
    }

    this.setupPickup(data);
    this.setupDelivery(data);
    this.setupCardSwitching();
    this.setupDateMinimums();

    this.isSetup = true;
    setTimeout(() => this.updateCartAttributes(), 200);
  }

  private showPanel(panelId: string): void {
    const panel = this.getRootElement<HTMLElement>(`#${panelId}`);
    if (panel) panel.style.display = 'block';
  }

  private setupPickup(data: WidgetData): void {
    const { settings, rates } = data;
    const locationList = this.getRootElement<HTMLElement>('#zapiet-location-list');
    if (!locationList) return;

    locationList.innerHTML = '';

    const pickupLocations = [...this.eligiblePickupLocations].sort((a, b) => {
      const aOrder = this.extractSortNumber(a.name);
      const bOrder = this.extractSortNumber(b.name);

      if (aOrder !== null && bOrder !== null) {
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.name.localeCompare(b.name);
      }

      if (aOrder !== null) return -1;
      if (bOrder !== null) return 1;
      return a.name.localeCompare(b.name);
    });
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
            <div class="zapiet-location-title">${businessHoursText}</div>
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

  }

  private handleLocationSelection(item: HTMLElement, location: Location, rates: Rate[]): void {
    this.root.querySelectorAll('.zapiet-location-item').forEach(el => el.classList.remove('selected'));
    item.classList.add('selected');

    const locInput = document.getElementById('attr-location') as HTMLInputElement;
    if (locInput) locInput.value = location.name;

    const datetimeDiv = this.getRootElement<HTMLElement>('#zapiet-pickup-datetime');
    if (datetimeDiv) datetimeDiv.style.display = 'block';

    const pickupDate = this.getRootElement<HTMLInputElement>('#zapiet-pickup-date');
    if (pickupDate) {
      const allowedDaysJson = location.pickupDays || '[]';
      let allowedDays: string[] = [];
      try { allowedDays = JSON.parse(allowedDaysJson); } catch(e) {}
      
      pickupDate.dataset.allowedDays = JSON.stringify(allowedDays);
      const minDate = this.getPickupMinDate(location);

      let maxDate: Date | undefined;
      if (location.pickupMaxDaysInAdvance) {
        maxDate = new Date();
        maxDate.setDate(maxDate.getDate() + location.pickupMaxDaysInAdvance);
      }

      this.initPickupDatePicker(pickupDate, allowedDays, minDate, maxDate, location);

      const dateAttr = document.getElementById('attr-date') as HTMLInputElement;
      const timeAttr = document.getElementById('attr-time') as HTMLInputElement;
      if (dateAttr) dateAttr.value = '';
      if (timeAttr) timeAttr.value = '';
      pickupDate.value = '';
    }

    this.setupProgressivePickup(location, rates);
    this.updateCartAttributes();
  }

  private setupProgressivePickup(location: Location, rates: Rate[]): void {
    const pickupDateField = this.getRootElement<HTMLInputElement>('#zapiet-pickup-date');
    const pickupTimeField = this.getRootElement<HTMLSelectElement>('#zapiet-pickup-time');
    const rateDisplay = this.getRootElement<HTMLElement>('#zapiet-pickup-rate');

    if (!pickupDateField || !pickupTimeField) return;

    if (pickupDateField.parentElement) {
      pickupDateField.parentElement.style.display = 'flex';
    }
    if (pickupTimeField.parentElement) {
      pickupTimeField.parentElement.style.display = 'none';
    }
    if (rateDisplay) {
      rateDisplay.style.display = 'none';
    }

    this.populateTimeSlots('zapiet-pickup-time', []);

    pickupDateField.onchange = () => {
      const dateAttr = document.getElementById('attr-date') as HTMLInputElement;
      const timeAttr = document.getElementById('attr-time') as HTMLInputElement;

      if (dateAttr) dateAttr.value = pickupDateField.value || '';
      if (timeAttr) timeAttr.value = '';
      pickupTimeField.value = '';

      if (!pickupDateField.value) {
        if (pickupTimeField.parentElement) pickupTimeField.parentElement.style.display = 'none';
        if (rateDisplay) rateDisplay.style.display = 'none';
        this.updateCartAttributes();
        return;
      }

      const timeSlotsForDay = this.getTimeSlotsForDay(location, true, pickupDateField.value);
      this.populateTimeSlots('zapiet-pickup-time', timeSlotsForDay);

      if (pickupTimeField.parentElement) {
        pickupTimeField.parentElement.style.display = 'flex';
      }
      if (rateDisplay) {
        rateDisplay.style.display = 'none';
      }

      this.updateCartAttributes();
    };

    pickupTimeField.onchange = () => {
      const timeAttr = document.getElementById('attr-time') as HTMLInputElement;
      if (timeAttr) timeAttr.value = pickupTimeField.value || '';

      if (!pickupTimeField.value) {
        if (rateDisplay) rateDisplay.style.display = 'none';
        this.updateCartAttributes();
        return;
      }

      this.calculatePickupRate(location.id, rates);
      if (rateDisplay) rateDisplay.style.display = 'block';
      this.updateCartAttributes();
    };
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

  private getTimeSlotsForDay(location: Location | null, isPickup: boolean, selectedDate?: string): string[] {
    if (!location) return [];
    
    let dayName = '';
    if (selectedDate) {
      const date = this.parseYMDToLocalDate(selectedDate);
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      dayName = dayNames[date.getDay()];
    }
    
    const perDayField = isPickup ? location.pickupTimeSlotsPerDay : location.deliveryTimeSlotsPerDay;
    if (perDayField && dayName) {
      try {
        const perDay = JSON.parse(perDayField);
        if (perDay[dayName] && Array.isArray(perDay[dayName]) && perDay[dayName].length > 0) {
          return perDay[dayName];
        }
      } catch (e) {
      }
    }
    
    const timeSlotsField = isPickup ? location.pickupTimeSlots : location.deliveryTimeSlots;
    if (timeSlotsField) {
      try {
        const parsed = JSON.parse(timeSlotsField);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (e) {
      }
    }
    
    return [];
  }

  private populateTimeSlots(selectId: string, timeSlots?: string[]): void {
    const select = this.getRootElement<HTMLSelectElement>(`#${selectId}`);
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

  private getRateThresholdMessage(rates: Rate[], methodLabel: 'Pickup' | 'Delivery'): string {
    const priceRates = rates.filter((rate) => rate.type === 'PRICE');
    if (priceRates.length > 0) {
      const minOrder = Math.min(...priceRates.map((rate) => rate.min));
      if (this.cartTotal < minOrder) {
        return `Minimum order for ${methodLabel.toLowerCase()} is $${minOrder.toFixed(2)}. Current: $${this.cartTotal.toFixed(2)}.`;
      }
    }

    const weightRates = rates.filter((rate) => rate.type === 'WEIGHT');
    if (weightRates.length > 0) {
      const minWeight = Math.min(...weightRates.map((rate) => rate.min));
      if (this.cartWeight < minWeight) {
        return `Minimum weight for ${methodLabel.toLowerCase()} is ${minWeight.toFixed(2)}kg. Current: ${this.cartWeight.toFixed(2)}kg.`;
      }
    }

    return `No ${methodLabel.toLowerCase()} rate is available for your current cart total/weight.`;
  }

  private getApplicableRate(rates: Rate[]): Rate | undefined {
    return rates.find((rate) => {
      if (rate.type === 'PRICE') {
        return this.cartTotal >= rate.min && (!rate.max || this.cartTotal <= rate.max);
      }
      if (rate.type === 'WEIGHT') {
        return this.cartWeight >= rate.min && (!rate.max || this.cartWeight <= rate.max);
      }
      return false;
    });
  }

  private calculatePickupRate(locationId: string, rates: Rate[]): void {
    const pickupRates = rates.filter(
      (r) =>
        r.locationId === locationId &&
        (r.method === 'PICKUP' || r.method === 'BOTH' || !r.method),
    );
    const rateDisplay = this.getRootElement<HTMLElement>('#zapiet-pickup-rate');
    if (!rateDisplay || !this.data) return;

    if (pickupRates.length > 0) {
      const applicableRate = this.getApplicableRate(pickupRates);

      if (applicableRate) {
        const price = applicableRate.price === 0 ? 'FREE' : `$${applicableRate.price.toFixed(2)}`;
        rateDisplay.innerHTML = `<strong>Pickup Rate:</strong> ${price}`;
        rateDisplay.style.display = 'block';
        this.setMethodAttribute(`Pickup|${applicableRate.price || 0}`);
      } else {
        const message = this.getRateThresholdMessage(pickupRates, 'Pickup');
        rateDisplay.innerHTML = `<div class="zapiet-error-msg">${message}</div>`;
        rateDisplay.style.display = 'block';
        this.setMethodAttribute('Pickup');
      }
    } else {
      rateDisplay.style.display = 'none';
      this.setMethodAttribute('Pickup|0');
    }
  }

  private setupDelivery(data: WidgetData): void {
    const { settings } = data;
    this.deliveryLocationsForPostal = null;
    const checkButton = this.getRootElement<HTMLElement>('#zapiet-check-delivery');
    const postalInput = this.getRootElement<HTMLInputElement>('#zapiet-postal-code');
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

  }

  private handleDeliveryCheck(data: WidgetData): void {
    const postalInput = this.getRootElement<HTMLInputElement>('#zapiet-postal-code');
    const resultDiv = this.getRootElement<HTMLElement>('#zapiet-delivery-result');
    const deliveryDateField = this.getRootElement<HTMLInputElement>('#zapiet-delivery-date');

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
      if (this.cartTotal < 50) {
        resultDiv.innerHTML = '<div class="zapiet-error-msg"><svg class="zapiet-icon-inline" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>Minimum order for delivery is $50.00. Current: $' + this.cartTotal.toFixed(2) + '.</div>';
        this.deliveryLocationsForPostal = null;
        this.hideDeliveryFields();
        return;
      }

      const deliveryRatesForLocations: Rate[] = [];
      matchingLocations.forEach((location) => {
        const locationRates = data.rates.filter(
          (rate) =>
            rate.locationId === location.id &&
            (rate.method === 'DELIVERY' || rate.method === 'BOTH' || !rate.method),
        );
        deliveryRatesForLocations.push(...locationRates);
      });

      if (
        deliveryRatesForLocations.length > 0 &&
        !this.getApplicableRate(deliveryRatesForLocations)
      ) {
        const message = this.getRateThresholdMessage(deliveryRatesForLocations, 'Delivery');
        resultDiv.innerHTML = `<div class="zapiet-error-msg"><svg class="zapiet-icon-inline" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>${message}</div>`;
        this.deliveryLocationsForPostal = null;
        this.hideDeliveryFields();
        return;
      }

      resultDiv.innerHTML = '<div class="zapiet-success-msg"><svg class="zapiet-icon-inline" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>Great! You are eligible for delivery.</div>';
      this.deliveryLocationsForPostal = matchingLocations;
      
      const postalAttr = document.getElementById('attr-postal-code') as HTMLInputElement;
      if (postalAttr) postalAttr.value = postalCode;
      
      this.setMethodAttribute('Delivery');
      
      const deliveryAvailable = this.getRootElement<HTMLElement>('#zapiet-delivery-available');
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
      
      const location = matchingLocations[0];
      if (location && deliveryDateField) {
        const allowedDaysJson = location.deliveryDays || '[]';
        let allowedDays: string[] = [];
        try { allowedDays = JSON.parse(allowedDaysJson); } catch(e) {}
        
        deliveryDateField.dataset.allowedDays = JSON.stringify(allowedDays);

        const minDateStr = this.getDeliveryMinDate();
        const minDate = this.parseYMDToLocalDate(minDateStr);
        
        let maxDate: Date | undefined;
        if (location.deliveryMaxDaysInAdvance) {
          maxDate = new Date();
          maxDate.setDate(maxDate.getDate() + location.deliveryMaxDaysInAdvance);
        }

        setTimeout(() => {
          this.initDeliveryDatePicker(deliveryDateField, allowedDays, minDate, maxDate);
        }, 100);
        
        if (deliveryDateField.value) {
            const dateAttr = document.getElementById('attr-date') as HTMLInputElement;
            if (dateAttr) dateAttr.value = deliveryDateField.value;
            
             if (this.deliveryLocationsForPostal && this.deliveryLocationsForPostal.length > 0) {
                const loc = this.deliveryLocationsForPostal[0];
                const timeSlotsForDay = this.getTimeSlotsForDay(loc, false, deliveryDateField.value);
                this.populateTimeSlots('zapiet-delivery-time', timeSlotsForDay);
             }
        }
      }

    } else {
      resultDiv.innerHTML = '<div class="zapiet-error-msg"><svg class="zapiet-icon-inline" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" /></svg>Sorry, we do not deliver to your postal code.</div>';
      this.deliveryLocationsForPostal = null;
      this.hideDeliveryFields();
    }
  }

  private hideDeliveryFields(): void {
    const deliveryDateField = this.getRootElement<HTMLInputElement>('#zapiet-delivery-date');
    const deliveryTimeField = this.getRootElement<HTMLSelectElement>('#zapiet-delivery-time');
    const rateDisplay = this.getRootElement<HTMLElement>('#zapiet-delivery-rate');

    if (deliveryDateField) deliveryDateField.parentElement!.parentElement!.style.display = 'none';
    if (deliveryTimeField) deliveryTimeField.parentElement!.style.display = 'none';
    if (rateDisplay) rateDisplay.style.display = 'none';
    this.deliveryLocationsForPostal = null;
  }

  private setupProgressiveDelivery(data: WidgetData): void {
    const deliveryDateField = this.getRootElement<HTMLInputElement>('#zapiet-delivery-date');
    const deliveryTimeField = this.getRootElement<HTMLSelectElement>('#zapiet-delivery-time');
    const rateDisplay = this.getRootElement<HTMLElement>('#zapiet-delivery-rate');

    if (!deliveryDateField || !deliveryTimeField) return;

    if (deliveryTimeField) {
      deliveryTimeField.parentElement!.style.display = 'none';
    }
    if (rateDisplay) rateDisplay.style.display = 'none';

    deliveryDateField.parentElement!.style.display = 'flex';

    deliveryDateField.addEventListener('change', () => {
      if (deliveryDateField.value && deliveryTimeField) {
        deliveryTimeField.parentElement!.style.display = 'flex';
      }
    });

    deliveryTimeField.addEventListener('change', () => {
      if (deliveryTimeField.value) {
        this.calculateDeliveryRate();
        
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

  private calculateDeliveryRate(): void {
    const rateDisplay = this.getRootElement<HTMLElement>('#zapiet-delivery-rate');
    if (!rateDisplay) return;

    if (this.cartTotal < 50) {
      rateDisplay.innerHTML = `<div class="zapiet-error-msg">Minimum order for delivery is $50.00. Current: $${this.cartTotal.toFixed(2)}.</div>`;
      rateDisplay.style.display = 'block';
      this.setMethodAttribute('Delivery');
      return;
    }

    const fixedPrice = this.cartTotal < 150 ? 10 : 0;
    const price = fixedPrice === 0 ? 'FREE' : `$${fixedPrice.toFixed(2)}`;
    rateDisplay.innerHTML = `<strong>Delivery Rate:</strong> ${price}`;
    rateDisplay.style.display = 'block';
    this.setMethodAttribute(`Delivery|${fixedPrice}`);
  }

  private setupCardSwitching(): void {
    const pickupPanel = this.getRootElement<HTMLElement>('#panel-pickup');
    const deliveryPanel = this.getRootElement<HTMLElement>('#panel-delivery');
    
    this.root.addEventListener('click', (e: Event) => {
      const target = e.target as HTMLElement;
      
      const deliveryBtn = target.closest('#btn-delivery');
      if (deliveryBtn) {
        e.preventDefault();
        e.stopPropagation();
        deliveryBtn.classList.add('active');
        const pickupBtn = this.getRootElement<HTMLElement>('#btn-pickup');
        if (pickupBtn) pickupBtn.classList.remove('active');
        
        if (pickupPanel) pickupPanel.style.display = 'none';
        if (deliveryPanel) deliveryPanel.style.display = 'block';
        
        this.updateDeliveryDateMinimum();
        
        this.setMethodAttribute('Delivery');
        return;
      }
      
      const pickupBtn = target.closest('#btn-pickup');
      if (pickupBtn) {
        e.preventDefault();
        e.stopPropagation();
        pickupBtn.classList.add('active');
        const delivBtn = this.getRootElement<HTMLElement>('#btn-delivery');
        if (delivBtn) delivBtn.classList.remove('active');
        
        if (pickupPanel) pickupPanel.style.display = 'block';
        if (deliveryPanel) deliveryPanel.style.display = 'none';
        
        this.setMethodAttribute('Pickup');
        return;
      }
    }, true);
  }

  private parseSameWeekDays(sameWeekDaysJson: string): string[] {
    try {
      const parsed = JSON.parse(sameWeekDaysJson);
      return Array.isArray(parsed) ? parsed.map((day) => String(day).toLowerCase()) : [];
    } catch (e) {
      return [];
    }
  }

  private getSameWeekDaysOrFallback(sameWeekDaysJson: string, fallback: string[] = []): string[] {
    const parsed = this.parseSameWeekDays(sameWeekDaysJson);
    return parsed.length > 0 ? parsed : fallback;
  }

  private getPickupMinDate(location: Location): Date {
    const today = new Date();
    const minDate = new Date();
    minDate.setDate(minDate.getDate() + (location.pickupPreparationDays || 1));

    let enableNextWeekOnly = this.data?.settings.enablePickupNextWeekOnly || false;
    let sameWeekDaysJson = this.data?.settings.pickupNextWeekSameWeekDays || '[]';

    if (location.pickupNextWeekOnly) {
      enableNextWeekOnly = true;
      sameWeekDaysJson = location.pickupNextWeekSameWeekDays || '[]';
    }

    if (enableNextWeekOnly) {
      const currentDay = today.getDay();
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const currentDayName = dayNames[currentDay];
      const sameWeekDays = this.parseSameWeekDays(sameWeekDaysJson);

      if (!sameWeekDays.includes(currentDayName)) {
        const nextWeek = new Date();
        nextWeek.setDate(today.getDate() + 7);
        if (nextWeek > minDate) {
          return nextWeek;
        }
      }
    }

    return minDate;
  }

  private getDeliveryMinDate(): string {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    let minDate = this.toLocalDateString(tomorrow);

    let enableNextWeekOnly = false;
    let sameWeekDaysJson = '[]';
    
    const locations = this.deliveryLocationsForPostal || this.eligibleDeliveryLocations;
    
    if (locations && locations.length > 0) {
      for (const location of locations) {
        if (location.deliveryNextWeekOnly) {
          enableNextWeekOnly = true;
          sameWeekDaysJson = location.deliveryNextWeekSameWeekDays || '[]';
          break;
        }
      }
    }

    if (enableNextWeekOnly) {
      const today = new Date();
      const currentDay = today.getDay();
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const currentDayName = dayNames[currentDay];
      const sameWeekDays = this.getSameWeekDaysOrFallback(
        sameWeekDaysJson,
        ['saturday', 'sunday'],
      );
      
      if (!sameWeekDays.includes(currentDayName)) {
        const nextWeek = new Date();
        nextWeek.setDate(today.getDate() + 7);
        minDate = this.toLocalDateString(nextWeek);
      }
    }
    
    return minDate;
  }
  
  private updateDeliveryDateMinimum(): void {
    const deliveryDate = this.getRootElement<HTMLInputElement>('#zapiet-delivery-date');
    if (deliveryDate) {
      const newMin = this.getDeliveryMinDate();
      deliveryDate.min = newMin;
    }
  }

  private setupDateMinimums(): void {
    const pickupTime = this.getRootElement<HTMLSelectElement>('#zapiet-pickup-time');
    const deliveryTime = this.getRootElement<HTMLSelectElement>('#zapiet-delivery-time');

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

  private isInsideCartDrawer(): boolean {
    return !!this.root.closest(
      'dialog, cart-drawer, .cart-drawer, [id*="cart-drawer"], aside[id*="cart"]'
    );
  }

  private collectAttributes(): Record<string, string> {
    const attributes: Record<string, string> = {};
    const orderNoteInput   = document.getElementById('attr-order-note')    as HTMLInputElement;
    const methodInput      = document.getElementById('attr-method')         as HTMLInputElement;
    const locationInput    = document.getElementById('attr-location')       as HTMLInputElement;
    const dateInput        = document.getElementById('attr-date')           as HTMLInputElement;
    const timeInput        = document.getElementById('attr-time')           as HTMLInputElement;
    const postalCodeInput  = document.getElementById('attr-postal-code')    as HTMLInputElement;

    if (orderNoteInput?.value)    attributes['_zapiet_order_note']    = orderNoteInput.value;
    if (methodInput?.value)       attributes['_zapiet_method']         = methodInput.value;
    if (locationInput?.value)     attributes['_zapiet_location']       = locationInput.value;
    if (dateInput?.value)         attributes['_zapiet_date']           = dateInput.value;
    if (timeInput?.value)         attributes['_zapiet_time']           = timeInput.value;
    if (postalCodeInput?.value)   attributes['_zapiet_postal_code']    = postalCodeInput.value;
    return attributes;
  }

  private async updateCartAttributes(): Promise<void> {
    if (!this.isSetup) return;

    const attributes = this.collectAttributes();
    if (Object.keys(attributes).length === 0) return;

    try {
      localStorage.setItem('zapiet_pending', JSON.stringify(attributes));
    } catch (_) {}
    (window as any).zapietPendingAttributes = attributes;

    (window as any).zapietOwnCartUpdate = true;
    setTimeout(() => { (window as any).zapietOwnCartUpdate = false; }, 1500);
    document.dispatchEvent(new CustomEvent('zapiet:cart-updated', { detail: attributes }));
  }
}

(window as any).ZapietWidget = ZapietWidget;
