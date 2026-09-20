// ==========================================
// QR CODE GENERATOR MODULE
// ==========================================
(function() {
  // Global State
  let qrCode = null;
  let activeTab = 'url';
  let uploadedLogo = null;
  let history = JSON.parse(localStorage.getItem('qr_history') || '[]');

  // State options for QRCodeStyling
  const config = {
    width: 300,
    height: 300,
    data: 'https://example.com',
    margin: 10,
    qrOptions: {
      typeNumber: 0,
      mode: 'Byte',
      errorCorrectionLevel: 'M'
    },
    imageOptions: {
      hideBackgroundDots: true,
      imageSize: 0.25,
      margin: 4
    },
    dotsOptions: {
      type: 'square',
      color: '#4f46e5'
    },
    backgroundOptions: {
      color: '#ffffff'
    },
    cornersSquareOptions: {
      type: 'square',
      color: '#4f46e5'
    },
    cornersDotOptions: {
      type: 'square',
      color: '#4f46e5'
    },
    image: ''
  };

  // DOM Elements
  const qrCanvasContainer = document.getElementById('qr-canvas-container');
  const qrPlaceholder = document.getElementById('qr-placeholder');
  const qrDataSummary = document.getElementById('qr-data-summary');
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const toastContainer = document.getElementById('toast-container');

  // Preset SVG Icons Data URIs for Logos
  const presetIcons = {
    none: '',
    link: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%234f46e5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    wifi: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%234f46e5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>',
    user: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%234f46e5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    mail: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%234f46e5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>',
    whatsapp: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%2325D366" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21"/><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1"/></svg>',
    github: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%23181717" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>',
    bitcoin: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%23f7931a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11.767 19.089c4.924.868 6.14-2.175 6.14-4.512 0-2.016-1.137-3.14-2.802-3.511 1.196-.462 2.226-1.393 2.226-3.328 0-2.438-1.616-3.818-5.348-3.344l.32-1.9-1.834-.31-.32 1.895c-.482-.08-.97-.156-1.464-.226l.32-1.896-1.835-.31-.32 1.898c-.4.062-.8.127-1.198.196l-2.607-.44-.44 2.61s.988.167.973.18c.54.09.795.426.744.731l-1.06 6.3c-.046.27-.247.533-.746.45.014.012-.972-.164-.972-.164l-.878 2.612 2.46.415c.447.076.89.148 1.328.216l-.32 1.9 1.835.31.32-1.897c.502.085.998.163 1.488.234l-.32 1.896 1.835.31.321-1.9c.074.013.148.025.22.037z"/></svg>'
  };

  // Initialize QRCodeStyling instance
  function initQRCode() {
    if (typeof QRCodeStyling === 'undefined') {
      console.warn('QRCodeStyling library loading...');
      return;
    }

    qrCode = new QRCodeStyling(config);
    updateQRData();
  }

  // Toast notification helper
  function showToast(message, type = 'success') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    const bgColor = type === 'success' ? 'bg-emerald-600' : type === 'error' ? 'bg-rose-600' : 'bg-indigo-600';
    toast.className = `${bgColor} text-white px-4 py-2.5 rounded-xl shadow-lg font-medium text-sm transition-all duration-300 transform translate-y-2 opacity-0 flex items-center gap-2 z-50 pointer-events-auto`;
    
    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Sanitization & Reserved Character Escaping Helpers
  function escapeWifiStr(str) {
    if (!str) return '';
    return str.replace(/([\\;:,"])/g, '\\$1');
  }

  function sanitizeVCardField(str) {
    if (!str) return '';
    return str
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/:/g, '\\:')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n')
      .trim();
  }

  function sanitizePhone(phone) {
    if (!phone) return '';
    return phone.replace(/[^\d+()\-\s]/g, '').trim();
  }

  function sanitizeEmail(email) {
    if (!email) return '';
    return email.trim().replace(/\s+/g, '');
  }

  // Generate QR Data Payload depending on active tab
  function generatePayload() {
    let payload = '';
    let summaryText = '';

    switch (activeTab) {
      case 'url': {
        const val = document.getElementById('input-url')?.value.trim() || '';
        if (val) {
          const rawUrl = val.match(/^https?:\/\//i) ? val : 'https://' + val;
          try {
            payload = new URL(rawUrl).href;
          } catch (e) {
            payload = rawUrl.replace(/\s+/g, '%20');
          }
        }
        summaryText = payload ? `URL: ${payload}` : '';
        break;
      }
      case 'text': {
        payload = document.getElementById('input-text')?.value || '';
        summaryText = payload ? `Text: ${payload.substring(0, 30)}${payload.length > 30 ? '...' : ''}` : '';
        break;
      }
      case 'wifi': {
        const ssid = document.getElementById('wifi-ssid')?.value.trim() || '';
        const pass = document.getElementById('wifi-pass')?.value || '';
        const type = document.getElementById('wifi-type')?.value || 'WPA';
        const hidden = document.getElementById('wifi-hidden')?.checked || false;
        if (ssid) {
          payload = `WIFI:T:${type};S:${escapeWifiStr(ssid)};P:${escapeWifiStr(pass)};H:${hidden ? 'true' : 'false'};;`;
          summaryText = `Wi-Fi: ${ssid} (${type})`;
        }
        break;
      }
      case 'vcard': {
        const fn = sanitizeVCardField(document.getElementById('vcard-fn')?.value || '');
        const ln = sanitizeVCardField(document.getElementById('vcard-ln')?.value || '');
        const phone = sanitizeVCardField(sanitizePhone(document.getElementById('vcard-phone')?.value || ''));
        const email = sanitizeVCardField(sanitizeEmail(document.getElementById('vcard-email')?.value || ''));
        const org = sanitizeVCardField(document.getElementById('vcard-org')?.value || '');
        const title = sanitizeVCardField(document.getElementById('vcard-title')?.value || '');
        const url = sanitizeVCardField(document.getElementById('vcard-url')?.value || '');
        const adr = sanitizeVCardField(document.getElementById('vcard-adr')?.value || '');

        if (fn || ln || phone || email) {
          payload = `BEGIN:VCARD\nVERSION:3.0\nN:${ln};${fn}\nFN:${fn} ${ln}`.trim();
          if (org) payload += `\nORG:${org}`;
          if (title) payload += `\nTITLE:${title}`;
          if (phone) payload += `\nTEL;TYPE=CELL:${phone}`;
          if (email) payload += `\nEMAIL:${email}`;
          if (url) payload += `\nURL:${url}`;
          if (adr) payload += `\nADR:;;${adr};;;;`;
          payload += `\nEND:VCARD`;

          summaryText = `Contact: ${fn} ${ln}`.trim();
        }
        break;
      }
      case 'email': {
        const to = sanitizeEmail(document.getElementById('email-to')?.value || '');
        const sub = document.getElementById('email-sub')?.value || '';
        const body = document.getElementById('email-body')?.value || '';
        if (to) {
          const query = [];
          if (sub) query.push(`subject=${encodeURIComponent(sub)}`);
          if (body) query.push(`body=${encodeURIComponent(body)}`);
          payload = `mailto:${to}${query.length ? '?' + query.join('&') : ''}`;
          summaryText = `Email: ${to}`;
        }
        break;
      }
      case 'sms': {
        const phone = sanitizePhone(document.getElementById('sms-phone')?.value || '');
        const msg = document.getElementById('sms-msg')?.value || '';
        if (phone) {
          payload = msg ? `sms:${phone}?body=${encodeURIComponent(msg)}` : `tel:${phone}`;
          summaryText = msg ? `SMS to: ${phone}` : `Call: ${phone}`;
        }
        break;
      }
      case 'file': {
        const fileContent = document.getElementById('file-payload')?.value || '';
        const fileName = document.getElementById('file-name-display')?.innerText || '';
        if (fileContent) {
          payload = fileContent;
          summaryText = `File: ${fileName || 'Uploaded Content'}`;
        }
        break;
      }
      case 'social': {
        const platform = document.getElementById('social-platform')?.value || 'twitter';
        const username = document.getElementById('social-user')?.value.trim() || '';
        if (username) {
          const userEsc = encodeURIComponent(username);
          switch (platform) {
            case 'twitter': payload = `https://x.com/${userEsc}`; break;
            case 'instagram': payload = `https://instagram.com/${userEsc}`; break;
            case 'linkedin': payload = `https://linkedin.com/in/${userEsc}`; break;
            case 'youtube': payload = `https://youtube.com/@${userEsc}`; break;
            case 'github': payload = `https://github.com/${userEsc}`; break;
            case 'whatsapp': payload = `https://wa.me/${userEsc.replace(/[^0-9]/g, '')}`; break;
            case 'appstore': payload = `https://apps.apple.com/app/id${userEsc}`; break;
            default: payload = `https://${platform}.com/${userEsc}`;
          }
          summaryText = `${platform.toUpperCase()}: @${username}`;
        }
        break;
      }
      case 'crypto': {
        const type = document.getElementById('crypto-type')?.value || 'bitcoin';
        const address = (document.getElementById('crypto-address')?.value || '').trim().replace(/\s+/g, '');
        const amount = (document.getElementById('crypto-amount')?.value || '').trim().replace(/[^\d.]/g, '');
        if (address) {
          if (type === 'bitcoin') {
            payload = `bitcoin:${address}${amount ? '?amount=' + amount : ''}`;
          } else if (type === 'ethereum') {
            payload = `ethereum:${address}${amount ? '?value=' + amount : ''}`;
          } else if (type === 'paypal') {
            payload = `https://paypal.me/${encodeURIComponent(address)}${amount ? '/' + amount : ''}`;
          } else if (type === 'upi') {
            payload = `upi://pay?pa=${encodeURIComponent(address)}&am=${amount || 0}`;
          } else {
            payload = `${type}:${address}`;
          }
          summaryText = `${type.toUpperCase()}: ${address.substring(0, 12)}...`;
        }
        break;
      }
    }

    return { payload, summaryText };
  }

  // Debounce Helper
  function debounce(func, delay = 120) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => func.apply(this, args), delay);
    };
  }

  // Update QR Code with canvas cleanup & ECL logo auto-elevation
  function updateQRData() {
    const { payload, summaryText } = generatePayload();
    const payloadWarning = document.getElementById('payload-warning');
    const payloadSizeCount = document.getElementById('payload-size-count');

    // Auto-elevate Error Correction Level if logo is active
    if (config.image && config.image !== '') {
      if (config.qrOptions.errorCorrectionLevel === 'L' || config.qrOptions.errorCorrectionLevel === 'M') {
        config.qrOptions.errorCorrectionLevel = 'H';
        if (eclSelect) eclSelect.value = 'H';
      }
    }

    if (!payload) {
      if (qrCanvasContainer) qrCanvasContainer.style.display = 'none';
      if (qrPlaceholder) qrPlaceholder.style.display = 'flex';
      if (qrDataSummary) qrDataSummary.innerText = 'Fill in inputs to generate QR code';
      if (payloadWarning) payloadWarning.classList.add('hidden');
      return;
    }

    // Check payload size warning (>1000 chars)
    if (payload.length > 1000) {
      if (payloadWarning) {
        payloadWarning.classList.remove('hidden');
        if (payloadSizeCount) payloadSizeCount.innerText = payload.length.toLocaleString();
      }
    } else {
      if (payloadWarning) payloadWarning.classList.add('hidden');
    }

    config.data = payload;
    if (qrPlaceholder) qrPlaceholder.style.display = 'none';
    if (qrCanvasContainer) {
      qrCanvasContainer.style.display = 'flex';
      while (qrCanvasContainer.firstChild) {
        qrCanvasContainer.removeChild(qrCanvasContainer.firstChild);
      }
    }
    if (qrDataSummary) qrDataSummary.innerText = summaryText || payload;

    if (qrCode) {
      qrCode.update(config);
      if (qrCanvasContainer) qrCode.append(qrCanvasContainer);
    }
  }

  const debouncedUpdateQRData = debounce(updateQRData, 120);

  // Form Data Tab Switch
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      activeTab = tabName;

      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      tabContents.forEach(content => {
        content.classList.toggle('hidden', content.id !== `tab-${tabName}`);
      });

      updateQRData();
    });
  });

  // Attach debounced live input listeners to QR form controls only
  const qrSection = document.getElementById('section-qr-app');
  const inputElements = qrSection ? qrSection.querySelectorAll('input, select, textarea') : [];
  inputElements.forEach(elem => {
    elem.addEventListener('input', debouncedUpdateQRData);
    elem.addEventListener('change', updateQRData);
  });

  // Color Pickers & Styling Controls
  const fgColorInput = document.getElementById('fg-color');
  const bgColorInput = document.getElementById('bg-color');
  const transparentBgCheck = document.getElementById('transparent-bg');
  const eclSelect = document.getElementById('ecl-select');
  const dotStyleBtns = document.querySelectorAll('.dot-style-btn');
  const cornerStyleBtns = document.querySelectorAll('.corner-style-btn');
  const logoPresetSelect = document.getElementById('logo-preset');
  const logoFileInput = document.getElementById('logo-file');
  const removeLogoBtn = document.getElementById('remove-logo-btn');
  const gradientToggle = document.getElementById('gradient-toggle');
  const fgColor2Input = document.getElementById('fg-color-2');
  const gradientTypeSelect = document.getElementById('gradient-type');
  const fgColor2Container = document.getElementById('fg-color-2-container');

  fgColorInput?.addEventListener('input', updateColorConfig);
  fgColor2Input?.addEventListener('input', updateColorConfig);
  gradientTypeSelect?.addEventListener('change', updateColorConfig);

  gradientToggle?.addEventListener('change', (e) => {
    if (fgColor2Container) fgColor2Container.style.display = e.target.checked ? 'grid' : 'none';
    updateColorConfig();
  });

  // WCAG Relative Luminance & Contrast Ratio Calculation
  function getLuminance(hexColor) {
    if (!hexColor || hexColor === 'transparent') hexColor = '#ffffff';
    let hex = hexColor.replace('#', '');
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    const cal = (v) => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    return 0.2126 * cal(r) + 0.7152 * cal(g) + 0.0722 * cal(b);
  }

  function getContrastRatio(hex1, hex2) {
    const l1 = getLuminance(hex1);
    const l2 = getLuminance(hex2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function checkColorContrast() {
    const fg1 = fgColorInput?.value || '#4f46e5';
    const fg2 = fgColor2Input?.value || '#ec4899';
    const isGradient = gradientToggle?.checked || false;
    const bg = transparentBgCheck?.checked ? '#ffffff' : (bgColorInput?.value || '#ffffff');

    const ratio1 = getContrastRatio(fg1, bg);
    let minRatio = ratio1;

    if (isGradient) {
      const ratio2 = getContrastRatio(fg2, bg);
      minRatio = Math.min(ratio1, ratio2);
    }

    const contrastWarning = document.getElementById('contrast-warning');
    const contrastVal = document.getElementById('contrast-ratio-val');

    if (minRatio < 4.0) {
      if (contrastWarning) {
        contrastWarning.classList.remove('hidden');
        if (contrastVal) contrastVal.innerText = `${minRatio.toFixed(2)}:1`;
      }
    } else {
      if (contrastWarning) contrastWarning.classList.add('hidden');
    }
  }

  function updateColorConfig() {
    const fg1 = fgColorInput?.value || '#4f46e5';
    const fg2 = fgColor2Input?.value || '#ec4899';
    const isGradient = gradientToggle?.checked || false;
    const gradType = gradientTypeSelect?.value || 'linear';

    if (isGradient) {
      config.dotsOptions.color = undefined;
      config.dotsOptions.gradient = {
        type: gradType,
        rotation: 0,
        colorStops: [
          { offset: 0, color: fg1 },
          { offset: 1, color: fg2 }
        ]
      };
      config.cornersSquareOptions.color = fg1;
      config.cornersDotOptions.color = fg2;
    } else {
      delete config.dotsOptions.gradient;
      config.dotsOptions.color = fg1;
      config.cornersSquareOptions.color = fg1;
      config.cornersDotOptions.color = fg1;
    }

    config.backgroundOptions.color = transparentBgCheck?.checked ? 'transparent' : (bgColorInput?.value || '#ffffff');
    checkColorContrast();
    updateQRData();
  }

  bgColorInput?.addEventListener('input', updateColorConfig);
  transparentBgCheck?.addEventListener('change', updateColorConfig);

  // Error Correction Level
  eclSelect?.addEventListener('change', (e) => {
    config.qrOptions.errorCorrectionLevel = e.target.value;
    updateQRData();
  });

  // Dots Styling buttons
  dotStyleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      dotStyleBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      config.dotsOptions.type = btn.dataset.style;
      updateQRData();
    });
  });

  // Corner Square Styling buttons
  cornerStyleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      cornerStyleBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      config.cornersSquareOptions.type = btn.dataset.style;
      config.cornersDotOptions.type = btn.dataset.style === 'extra-rounded' ? 'dot' : btn.dataset.style;
      updateQRData();
    });
  });

  // Preset Logos
  logoPresetSelect?.addEventListener('change', (e) => {
    const key = e.target.value;
    if (key && presetIcons[key]) {
      config.image = presetIcons[key];
      removeLogoBtn?.classList.remove('hidden');
    } else if (uploadedLogo) {
      config.image = uploadedLogo;
    } else {
      config.image = '';
      removeLogoBtn?.classList.add('hidden');
    }
    updateQRData();
  });

  // File Logo Upload
  logoFileInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        showToast('Logo file size must be less than 2MB', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = (evt) => {
        uploadedLogo = evt.target.result;
        config.image = uploadedLogo;
        if (logoPresetSelect) logoPresetSelect.value = '';
        removeLogoBtn?.classList.remove('hidden');
        updateQRData();
        showToast('Logo uploaded successfully');
      };
      reader.readAsDataURL(file);
    }
  });

  removeLogoBtn?.addEventListener('click', () => {
    uploadedLogo = null;
    config.image = '';
    if (logoPresetSelect) logoPresetSelect.value = 'none';
    if (logoFileInput) logoFileInput.value = '';
    removeLogoBtn?.classList.add('hidden');
    updateQRData();
    showToast('Logo removed');
  });

  // File tab handling
  const fileUploadBtn = document.getElementById('file-upload-input');
  fileUploadBtn?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const fileNameDisp = document.getElementById('file-name-display');
      if (fileNameDisp) fileNameDisp.innerText = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
      
      const reader = new FileReader();
      reader.onload = (evt) => {
        const payloadInput = document.getElementById('file-payload');
        if (payloadInput) payloadInput.value = evt.target.result;
        updateQRData();
        showToast('File loaded for QR generation');
      };
      if (file.size < 200 * 1024) {
        reader.readAsDataURL(file);
      } else {
        const payloadInput = document.getElementById('file-payload');
        if (payloadInput) payloadInput.value = `FILE:${file.name};SIZE:${file.size};TYPE:${file.type}`;
        updateQRData();
        showToast('File metadata loaded (file too large for full inline Base64)', 'info');
      }
    }
  });

  // Download Actions
  document.getElementById('download-png')?.addEventListener('click', () => downloadQR('png'));
  document.getElementById('download-svg')?.addEventListener('click', () => downloadQR('svg'));
  document.getElementById('download-webp')?.addEventListener('click', () => downloadQR('webp'));

  function downloadQR(extension) {
    if (!config.data) {
      showToast('Generate a QR code first!', 'error');
      return;
    }
    qrCode.download({
      name: `qr-code-${Date.now()}`,
      extension: extension
    });
    saveToHistory();
    showToast(`Downloaded as ${extension.toUpperCase()}`);
  }

  // Copy Image to Clipboard
  document.getElementById('copy-qr-btn')?.addEventListener('click', async () => {
    if (!config.data) {
      showToast('Generate a QR code first!', 'error');
      return;
    }
    try {
      const blob = await qrCode.getRawData('png');
      const item = new ClipboardItem({ 'image/png': blob });
      await navigator.clipboard.write([item]);
      showToast('QR Code image copied to clipboard!');
      saveToHistory();
    } catch (err) {
      console.error(err);
      showToast('Failed to copy image to clipboard', 'error');
    }
  });

  // Print View
  document.getElementById('print-qr-btn')?.addEventListener('click', () => {
    if (!config.data) {
      showToast('Generate a QR code first!', 'error');
      return;
    }
    
    const printCanvasContainer = document.getElementById('print-canvas');
    if (printCanvasContainer) printCanvasContainer.innerHTML = '';
    
    const printQr = new QRCodeStyling({
      ...config,
      width: 400,
      height: 400
    });
    if (printCanvasContainer) printQr.append(printCanvasContainer);
    const printTitle = document.getElementById('print-title');
    if (printTitle) printTitle.innerText = qrDataSummary?.innerText || 'Generated QR Code';
    
    setTimeout(() => {
      window.print();
    }, 300);
  });

  // History Management
  function saveToHistory() {
    const { payload, summaryText } = generatePayload();
    if (!payload) return;

    const isBase64 = payload.startsWith('data:');
    const storedPayload = isBase64 ? payload.substring(0, 300) + '...[Base64 Data]' : payload;

    const existingIdx = history.findIndex(item => item.summary === summaryText);
    if (existingIdx !== -1) {
      history.splice(existingIdx, 1);
    }

    history.unshift({
      id: Date.now(),
      tab: activeTab,
      payload: storedPayload,
      summary: summaryText || payload.substring(0, 40),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      params: {
        fgColor: fgColorInput?.value,
        bgColor: bgColorInput?.value,
        transparentBg: transparentBgCheck?.checked,
        dotStyle: config.dotsOptions.type,
        cornerStyle: config.cornersSquareOptions.type,
        ecl: config.qrOptions.errorCorrectionLevel
      }
    });

    if (history.length > 20) history.pop();
    localStorage.setItem('qr_history', JSON.stringify(history));
    renderHistory();
  }

  function renderHistory() {
    const historyList = document.getElementById('history-list');
    const historyEmpty = document.getElementById('history-empty');

    if (!historyList) return;

    if (history.length === 0) {
      historyList.innerHTML = '';
      if (historyEmpty) historyEmpty.style.display = 'block';
      return;
    }

    if (historyEmpty) historyEmpty.style.display = 'none';
    historyList.innerHTML = history.map(item => `
      <div class="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/60 dark:border-slate-700/50 flex items-center justify-between group hover:border-indigo-500 transition-all cursor-pointer" data-id="${item.id}">
        <div class="flex flex-col min-w-0 pr-2" onclick="loadHistoryItem(${item.id})">
          <div class="flex items-center gap-2">
            <span class="text-xs uppercase font-bold px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400">${item.tab}</span>
            <span class="text-xs text-slate-400">${item.timestamp}</span>
          </div>
          <p class="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate mt-1">${escapeHtml(item.summary)}</p>
        </div>
        <button onclick="deleteHistoryItem(${item.id})" class="text-slate-400 hover:text-rose-500 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
      </div>
    `).join('');
  }

  window.loadHistoryItem = (id) => {
    const item = history.find(i => i.id === id);
    if (!item) return;

    const tabBtn = document.querySelector(`.tab-btn[data-tab="${item.tab}"]`);
    if (tabBtn) tabBtn.click();

    if (!item.payload.includes('[Base64 Data]')) {
      const urlInput = document.getElementById('input-url');
      const textInput = document.getElementById('input-text');
      if (item.tab === 'url' && urlInput) urlInput.value = item.payload;
      else if (item.tab === 'text' && textInput) textInput.value = item.payload;
    }

    if (item.params) {
      if (item.params.fgColor && fgColorInput) fgColorInput.value = item.params.fgColor;
      if (item.params.bgColor && bgColorInput) bgColorInput.value = item.params.bgColor;
      if (item.params.transparentBg !== undefined && transparentBgCheck) transparentBgCheck.checked = item.params.transparentBg;
      if (item.params.ecl) {
        config.qrOptions.errorCorrectionLevel = item.params.ecl;
        if (eclSelect) eclSelect.value = item.params.ecl;
      }
      updateColorConfig();
    } else {
      updateQRData();
    }

    showToast('Loaded item from history');
  };

  window.deleteHistoryItem = (id) => {
    history = history.filter(i => i.id !== id);
    localStorage.setItem('qr_history', JSON.stringify(history));
    renderHistory();
    showToast('Removed from history');
  };

  document.getElementById('clear-history-btn')?.addEventListener('click', () => {
    history = [];
    localStorage.removeItem('qr_history');
    renderHistory();
    showToast('History cleared');
  });


  window.QRGenerator = {
    init: initQRCode,
    updateQRData: updateQRData,
    getConfig: () => config,
    loadFromHistory: window.loadFromHistory,
    renderHistory: renderHistory
  };
})();
