# Lessons Learned - Cart Page & Drawer Issues

##  Critical Mistakes to Avoid

### 1. **Race Conditions with Cart Data**

**Problem**: Widget initialized with stale/empty cart data before cart.js loaded.

**Symptoms**:
- Widget showed "Cart is empty, removing widget" despite items in cart
- Widget displayed but with wrong item count
- Options didn't load in cart drawer

**Root Cause**:
```javascript
// BAD - Synchronous execution
injectInto(container);
// Widget initializes immediately with cart.item_count = 0

// GOOD - Wait for cart data
await updateContainerCartData(widget);
await injectInto(container);
```

**Solution**:
- Always use `async/await` when injecting widget
- Call `updateContainerCartData()` BEFORE `injectInto()`
- Wrap injection logic in `(async () => { ... })()` blocks

---

### 2. **Incorrect Cart State Checks**

**Problem**: Removed widget when cart was NOT empty.

**Bad Code**:
```javascript
if (cart && cart.item_count === 0 && !forceDrawer) {
  widget.remove(); // WRONG - This removed widget when cart had items!
}
```

**Why It Failed**:
- `cart.item_count` was stale (not updated yet)
- Logic was backwards - should check if drawer is open, not cart state

**Solution**: Remove this check entirely. Let the widget handle its own visibility.

---

### 3. **DOM Selector Fragility**

**Problem**: Cart drawer selectors didn't work across different themes.

**Bad Selectors**:
```javascript
const drawer = document.querySelector('.cart-drawer'); // Too specific
```

**Better Approach**:
```javascript
function getAnyCartDrawer() {
  const selectors = [
    '.cart-drawer:not([style*="display: none"])',
    '[data-cart-drawer]:not([style*="display: none"])',
    '.drawer--active[data-type="cart"]',
    '#CartDrawer[open]',
    // Add more theme-specific selectors
  ];
  
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}
```

**Lesson**: Always test with multiple themes and have fallback selectors.

---

### 4. **Widget Duplication Issues**

**Problem**: Multiple widgets appeared on page after navigation.

**Cause**:
- Shopify's AJAX cart updates
- Theme's dynamic content loading
- Not cleaning up old widgets before injecting new ones

**Solution**:
```javascript
function cleanupDuplicateWidgets() {
  const widgets = document.querySelectorAll('#zapiet-widget-root');
  if (widgets.length > 1) {
    // Keep only the most recent one
    Array.from(widgets).slice(0, -1).forEach(w => w.remove());
  }
}
```

---

### 5. **CSS Visibility Issues**

**Problem**: Widget existed in DOM but wasn't visible.

**Symptoms**:
- `querySelector('#zapiet-widget-root')` returned element
- But element had `display: none` or was hidden
- No console errors

**Root Cause**:
- Theme CSS overrides
- Inline styles from JavaScript
- Display property not set explicitly

**Solution - Aggressive CSS**:
```css
#zapiet-widget-root {
  display: block !important;
  visibility: visible !important;
  opacity: 1 !important;
  min-height: 200px;
  margin: 16px 0 !important;
  padding: 20px 16px;
  background: #fff;
  border-top: 1px solid #e5e7eb;
}
```

**Lesson**: Use `!important` sparingly, but when fighting theme CSS, it's necessary.

---

### 6. **Git History as Safety Net**

**Problem**: After multiple fixes, core functionality broke again.

**What Worked**:
```bash
# Find the last working commit
git log --oneline

# Check what changed
git show a77afbb

# Revert to working version
git checkout a77afbb -- extensions/zapiet-widget/blocks/app-embed.liquid
```

**Lesson**: 
- Commit frequently with clear messages
- Don't be afraid to revert to known working state
- "Working but ugly" > "Beautiful but broken"

---

### 7. **Console Logging is Essential**

**What Helped**:
```javascript
console.log('[Zapiet Inject] Starting injection...');
console.log('[Zapiet Init] Cart data:', cart);
console.log('[Zapiet Widget] Content exists:', !!content);
```

**Pattern Used**:
- `[Zapiet Inject]` - Injection process
- `[Zapiet Init]` - Widget initialization
- `[Zapiet Widget]` - Widget operations
- `[Zapiet Delivery Next Week]` - Feature-specific logs

**Lesson**: 
- Use consistent prefixes for easy filtering
- Log at decision points (if/else branches)
- Log data values, not just "checkpoint reached"
- Remove logs after feature is stable (production)

---

### 8. **Event Delegation vs Direct Binding**

**Problem**: Click handlers didn't work after DOM updates.

**Bad**:
```javascript
deliveryBtn.addEventListener('click', handler); // Breaks if button replaced
```

**Good**:
```javascript
root.addEventListener('click', (e) => {
  const deliveryBtn = e.target.closest('#btn-delivery');
  if (deliveryBtn) {
    handler();
  }
}, true); // Use capture phase
```

**Lesson**: Use event delegation for dynamic content.

---

##  Prevention Checklist

Before deploying widget changes:

- [ ] Test in empty cart
- [ ] Test with items in cart
- [ ] Test cart drawer open/close
- [ ] Test cart page
- [ ] Test theme variations (if possible)
- [ ] Check browser console for errors
- [ ] Verify widget HTML exists in DOM
- [ ] Verify widget is visible (not `display: none`)
- [ ] Test after page navigation
- [ ] Test after adding/removing items

---

##  Debugging Workflow

When widget doesn't load:

1. **Check Script Loads**
   - Open DevTools Network tab
   - Look for `app-embed.liquid` or widget.js
   - Status should be 200

2. **Check App Embed Enabled**
   - Go to Theme Editor
   - Check "App embeds" section
   - Ensure "Zapiet App Embed" is ON

3. **Check Console Logs**
   - Filter by `[Zapiet`
   - Look for injection/init messages
   - Check for errors

4. **Check DOM**
   - Inspect element
   - Search for `#zapiet-widget-root`
   - Check computed styles

5. **Check Cart Data**
   - Console: `fetch('/cart.js').then(r => r.json()).then(console.log)`
   - Verify `item_count` and `items`

---

##  Key Takeaways

1. **Async is King**: Always handle cart data asynchronously
2. **Trust Git**: Known working version > experimental fixes
3. **CSS is Tricky**: Theme styles can hide elements completely
4. **Log Everything**: During development, more logs = better debugging
5. **Test Thoroughly**: Empty cart, full cart, drawer, page - test all states
6. **Keep It Simple**: Complex logic = more bugs. Revert to simple when stuck.

---

##  Red Flags to Watch For

- Widget shows in one state but not another  Check conditional logic
- Widget exists but invisible  Check CSS/display properties
- Widget appears multiple times  Check cleanup logic
- Widget loses state after navigation  Check event delegation
- Works on page but not drawer  Check selector specificity

---

*Last Updated: Feb 6, 2026*
*Lessons learned from cart page/drawer debugging session*
