// Reusable PWA registration and update checker.
// Configure per app with window.PWA_UPDATE_CONFIG before loading this script.
(function () {
    const defaultConfig = {
        serviceWorkerUrl: 'sw.js',
        updateUrl: './',
        storageKey: 'pwa-update-hash',
        updateButtonId: null,
        autoCheck: true
    };

    const config = Object.assign({}, defaultConfig, window.PWA_UPDATE_CONFIG || {});

    function buildUpdateUrl() {
        const url = new URL(config.updateUrl, window.location.href);
        url.searchParams.set('v', Date.now().toString());
        url.searchParams.set('nocache', Math.random().toString());
        return url.toString();
    }

    function isPwaStandalone() {
        return window.matchMedia('(display-mode: standalone)').matches ||
            window.matchMedia('(display-mode: window-controls-overlay)').matches ||
            window.navigator.standalone === true;
    }

    function registerPwaServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        window.addEventListener('load', () => {
            navigator.serviceWorker.register(config.serviceWorkerUrl)
                .then(reg => console.log('SW registered:', reg.scope))
                .catch(err => console.error('SW registration failed:', err));
        });
    }

    function fnv1aHash(str) {
        let hash = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = (hash * 0x01000193) >>> 0;
        }
        return hash.toString(16);
    }

    async function hashText(text) {
        try {
            const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (err) {
            console.warn('crypto.subtle failed, using fallback hash', err);
            return fnv1aHash(text);
        }
    }

    async function clearPwaCachesAndRegistrations() {
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(key => caches.delete(key)));
        }
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(reg => reg.unregister()));
        }
    }

    async function performUpdateCheck(showAlert = true) {
        console.log('Update check started');
        if (!navigator.onLine) {
            console.log('Offline, skipping update check');
            if (showAlert) alert('You are offline. Unable to check for updates.');
            return;
        }

        const url = buildUpdateUrl();
        try {
            console.log('Fetching:', url);
            const response = await fetch(url, { cache: 'reload' });
            if (!response.ok) {
                console.warn('Fetch failed with status:', response.status);
                if (showAlert) alert('Update check failed. Please try again later.');
                return;
            }

            const text = await response.text();
            const hash = await hashText(text);
            const storedHash = localStorage.getItem(config.storageKey);

            if (!storedHash) {
                localStorage.setItem(config.storageKey, hash);
                console.log('First visit, hash stored');
                if (showAlert) alert('This is your first visit. Hash stored. No update needed.');
                return;
            }

            if (storedHash !== hash) {
                console.log('New version detected');
                const update = confirm('A new version is available. Update now?');
                if (update) {
                    localStorage.setItem(config.storageKey, hash);
                    await clearPwaCachesAndRegistrations();
                    location.reload();
                } else if (showAlert) {
                    alert('Update cancelled. You can update later via the update button.');
                }
            } else {
                console.log('No update needed');
                if (showAlert) alert('You are already using the latest version.');
            }
        } catch (err) {
            console.error('Update check failed:', err);
            if (showAlert) alert('Update check failed. See console for details.');
        }
    }

    function bindUpdateButton() {
        if (!config.updateButtonId) return;
        const bind = () => {
            const button = document.getElementById(config.updateButtonId);
            if (button) button.addEventListener('click', () => performUpdateCheck(true));
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
        else bind();
    }

    function detectBrowserPlatform() {
        const ua = navigator.userAgent || '';
        const vendor = navigator.vendor || '';
        const platform = navigator.platform || '';
        const isIOS = /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isAndroid = /Android/.test(ua);
        const isFirefox = /Firefox\//.test(ua);
        const isEdge = /Edg\//.test(ua);
        const isChrome = (/Chrome\//.test(ua) || /CriOS\//.test(ua)) && !isEdge;
        const isSafari = /Safari\//.test(ua) && /Apple/.test(vendor) && !isChrome && !isEdge;
        const isMac = /Mac/.test(platform) && !isIOS;

        if (isIOS && isSafari) return 'ios-safari';
        if (isIOS) return 'ios-other';
        if (isAndroid && isChrome) return 'android-chrome';
        if (isAndroid) return 'android-other';
        if (isEdge) return 'desktop-edge';
        if (isChrome) return 'desktop-chrome';
        if (isMac && isSafari) return 'mac-safari';
        if (isFirefox) return 'firefox';
        return 'generic';
    }

    function installInstructionsForCurrentBrowser() {
        const offlineNote = 'After installing, this app will be available offline.';
        switch (detectBrowserPlatform()) {
            case 'ios-safari':
                return {
                    title: 'Install app',
                    steps: ['Tap Share in Safari.', 'Choose Add to Home Screen.', 'Tap Add.'],
                    note: offlineNote
                };
            case 'ios-other':
                return {
                    title: 'Install app',
                    steps: ['Open this page in Safari.', 'Tap Share.', 'Choose Add to Home Screen, then Add.'],
                    note: offlineNote
                };
            case 'android-chrome':
                return {
                    title: 'Install app',
                    steps: ['Open the Chrome menu.', 'Choose Install app or Add to Home screen.', 'Confirm Install.'],
                    note: offlineNote
                };
            case 'android-other':
                return {
                    title: 'Install app',
                    steps: ['Open your browser menu.', 'Choose Install app or Add to Home screen.', 'Confirm the install.'],
                    note: offlineNote
                };
            case 'desktop-chrome':
                return {
                    title: 'Install app',
                    steps: ['Click the install icon in the address bar, if shown.', 'Or open the Chrome menu.', 'Choose Cast, save, and share, then Install page as app.'],
                    note: offlineNote
                };
            case 'desktop-edge':
                return {
                    title: 'Install app',
                    steps: ['Open the Edge menu.', 'Choose Apps.', 'Choose Install this site as an app.'],
                    note: offlineNote
                };
            case 'mac-safari':
                return {
                    title: 'Install to desktop',
                    steps: ['Open the File menu.', 'Choose Add to Dock.', 'Confirm Add.'],
                    note: offlineNote
                };
            case 'firefox':
                return {
                    title: 'Install app',
                    steps: ['Firefox may not show desktop PWA install for this site.', 'Use Chrome, Edge, or Safari for app installation.', 'Keep this page bookmarked as a fallback.'],
                    note: offlineNote
                };
            default:
                return {
                    title: 'Install app',
                    steps: ['Open your browser menu.', 'Choose Install app, Add to Dock, or Add to Home Screen.', 'Confirm the install.'],
                    note: offlineNote
                };
        }
    }

    function defineCheckUpdateElement() {
        if (!('customElements' in window) || customElements.get('pwa-check-update')) return;

        customElements.define('pwa-check-update', class extends HTMLElement {
            constructor() {
                super();
                this.attachShadow({ mode: 'open' });
                this.button = document.createElement('button');
                this.button.type = 'button';
                this.installPopover = document.createElement('div');
                this.installPopover.className = 'popover';
                this.installPopover.setAttribute('role', 'dialog');
                this.installPopover.setAttribute('aria-live', 'polite');
                this.closeButton = document.createElement('button');
                this.closeButton.type = 'button';
                this.closeButton.className = 'popover-close';
                this.closeButton.setAttribute('aria-label', 'Close install instructions');
                this.closeButton.textContent = 'x';
                this.titleEl = document.createElement('strong');
                this.stepsEl = document.createElement('ol');
                this.noteEl = document.createElement('p');
                this.installPopover.append(this.closeButton, this.titleEl, this.stepsEl, this.noteEl);

                this.closeButton.addEventListener('click', event => {
                    event.stopPropagation();
                    this.closeInstallHelp();
                });

                this.button.addEventListener('click', () => {
                    if (isPwaStandalone()) {
                        performUpdateCheck(true);
                    } else {
                        this.toggleInstallHelp();
                    }
                });

                const style = document.createElement('style');
                style.textContent = `
                    :host {
                        display: inline-block;
                        position: relative;
                        flex-shrink: 0;
                        margin-left: auto;
                    }
                    button {
                        background: transparent;
                        border: 1px solid var(--pwa-update-border, #4a6fa5);
                        color: var(--pwa-update-color, #b0bcdd);
                        padding: var(--pwa-update-padding, 6px 10px);
                        font: inherit;
                        font-size: var(--pwa-update-font-size, 12px);
                        border-radius: var(--pwa-update-radius, 8px);
                        cursor: pointer;
                        transition: 0.2s;
                        white-space: nowrap;
                    }
                    button:hover {
                        background: var(--pwa-update-hover-bg, #2a3760);
                        color: var(--pwa-update-hover-color, #fff);
                    }
                    .popover {
                        position: fixed;
                        top: var(--pwa-popover-top, 48px);
                        left: var(--pwa-popover-left, 12px);
                        z-index: 10000;
                        display: none;
                        width: min(280px, calc(100vw - 28px));
                        max-height: calc(100vh - 24px);
                        overflow: auto;
                        padding: 12px 14px;
                        border: 1px solid var(--pwa-popover-border, rgba(176, 188, 221, 0.28));
                        border-radius: 10px;
                        background: var(--pwa-popover-bg, #10182d);
                        color: var(--pwa-popover-color, #f0f4ff);
                        box-shadow: 0 14px 34px rgba(0, 0, 0, 0.45);
                        text-align: left;
                        line-height: 1.35;
                    }
                    .popover.open { display: block; }
                    .popover-close {
                        position: absolute;
                        top: 6px;
                        right: 6px;
                        display: inline-grid;
                        place-items: center;
                        width: 24px;
                        height: 24px;
                        padding: 0;
                        border: 0;
                        border-radius: 50%;
                        background: transparent;
                        color: var(--pwa-popover-muted, #b0bcdd);
                        font-size: 16px;
                        line-height: 1;
                    }
                    .popover-close:hover {
                        background: rgba(176, 188, 221, 0.12);
                        color: var(--pwa-popover-color, #f0f4ff);
                    }
                    .popover strong {
                        display: block;
                        margin-bottom: 6px;
                        padding-right: 24px;
                        font-size: 14px;
                    }
                    .popover ol {
                        margin: 6px 0 0 18px;
                        padding: 0;
                        color: var(--pwa-popover-muted, #b0bcdd);
                        font-size: 12px;
                    }
                    .popover li { margin: 4px 0; }
                    .popover p {
                        margin: 8px 0 0;
                        color: var(--pwa-popover-color, #f0f4ff);
                        font-size: 12px;
                    }
                `;

                this.shadowRoot.append(style, this.button, this.installPopover);
            }

            connectedCallback() {
                this.renderMode();
                this.outsideClickHandler = event => {
                    if (!this.contains(event.target)) this.closeInstallHelp();
                };
                this.repositionHandler = () => this.positionInstallHelp();
                document.addEventListener('click', this.outsideClickHandler);
                window.addEventListener('resize', this.repositionHandler, { passive: true });
                window.addEventListener('scroll', this.repositionHandler, { passive: true });
            }

            disconnectedCallback() {
                document.removeEventListener('click', this.outsideClickHandler);
                window.removeEventListener('resize', this.repositionHandler);
                window.removeEventListener('scroll', this.repositionHandler);
            }

            renderMode() {
                if (isPwaStandalone()) {
                    this.button.textContent = this.getAttribute('update-label') || this.getAttribute('label') || 'Check Update';
                    this.button.setAttribute('aria-label', this.getAttribute('update-title') || 'Check for a new version');
                    this.closeInstallHelp();
                } else {
                    this.button.textContent = this.getAttribute('install-label') || 'Install';
                    this.button.setAttribute('aria-label', this.getAttribute('install-title') || 'Show install instructions');
                }
            }

            renderInstallInstructions() {
                const instructions = installInstructionsForCurrentBrowser();
                this.titleEl.textContent = instructions.title;
                this.stepsEl.innerHTML = '';
                for (const step of instructions.steps) {
                    const item = document.createElement('li');
                    item.textContent = step;
                    this.stepsEl.appendChild(item);
                }
                this.noteEl.textContent = instructions.note;
            }

            positionInstallHelp() {
                if (!this.installPopover.classList.contains('open')) return;
                const margin = 12;
                const gap = 8;
                const buttonRect = this.button.getBoundingClientRect();

                this.installPopover.style.setProperty('--pwa-popover-left', margin + 'px');
                this.installPopover.style.setProperty('--pwa-popover-top', margin + 'px');
                const popoverRect = this.installPopover.getBoundingClientRect();

                const centeredLeft = buttonRect.left + (buttonRect.width - popoverRect.width) / 2;
                const clampedLeft = Math.min(
                    Math.max(margin, centeredLeft),
                    Math.max(margin, window.innerWidth - popoverRect.width - margin)
                );
                const roomBelow = window.innerHeight - buttonRect.bottom - gap - margin;
                const roomAbove = buttonRect.top - gap - margin;
                const preferBelow = roomBelow >= Math.min(popoverRect.height, roomAbove);
                const rawTop = preferBelow
                    ? buttonRect.bottom + gap
                    : buttonRect.top - popoverRect.height - gap;
                const clampedTop = Math.min(
                    Math.max(margin, rawTop),
                    Math.max(margin, window.innerHeight - popoverRect.height - margin)
                );

                this.installPopover.style.setProperty('--pwa-popover-left', Math.round(clampedLeft) + 'px');
                this.installPopover.style.setProperty('--pwa-popover-top', Math.round(clampedTop) + 'px');
            }

            toggleInstallHelp() {
                this.renderInstallInstructions();
                this.installPopover.classList.toggle('open');
                this.positionInstallHelp();
            }

            closeInstallHelp() {
                this.installPopover.classList.remove('open');
            }
        });
    }

    registerPwaServiceWorker();
    defineCheckUpdateElement();
    bindUpdateButton();
    if (config.autoCheck && isPwaStandalone()) performUpdateCheck(false);

    window.PwaUpdate = {
        config,
        performUpdateCheck,
        registerPwaServiceWorker,
        isPwaStandalone,
        detectBrowserPlatform
    };
})();
