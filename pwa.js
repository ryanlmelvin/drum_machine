/** Install and update controls. Updates only reload after the user's explicit tap. */
export function initPwa({ beforeReload = () => {}, onStatus = () => {} } = {}) {
  const updateBanner = document.getElementById('update-banner');
  const updateButton = document.getElementById('update-button');
  const installButton = document.getElementById('install-button');
  const installHelp = document.getElementById('install-help');
  const installInstructions = document.getElementById('install-instructions');
  const standalone = window.matchMedia('(display-mode: standalone)');
  let installPrompt;
  let registration;
  let registrationTask;
  let applying = false;
  let reloadNeeded = false;
  let didReload = false;
  let updateTimeout;
  let lastCheck = 0;
  let hadController = Boolean(navigator.serviceWorker?.controller);
  const watchedWorkers = new WeakSet();
  const watchedRegistrations = new WeakSet();

  function updateInstallButton() {
    if (installButton) installButton.hidden = standalone.matches || navigator.standalone === true;
  }
  updateInstallButton();
  standalone.addEventListener?.('change', updateInstallButton);
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    updateInstallButton();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    if (installButton) installButton.hidden = true;
    installHelp?.close();
  });
  document.getElementById('install-close')?.addEventListener('click', () => installHelp?.close());
  installButton?.addEventListener('click', async () => {
    if (installPrompt) {
      const prompt = installPrompt;
      installPrompt = null;
      try {
        await prompt.prompt();
        await prompt.userChoice;
        return;
      } catch { /* A browser may withdraw its prompt; show manual installation. */ }
    }
    if (installHelp) installHelp.showModal();
    else onStatus(installInstructions?.textContent || 'Open your browser’s menu to install this app.');
  });

  function showUpdate() {
    if (updateBanner) updateBanner.hidden = !(registration?.waiting || reloadNeeded);
  }
  function reload() {
    if (didReload) return;
    didReload = true;
    clearTimeout(updateTimeout);
    location.reload();
  }
  function restoreUpdateButton() {
    applying = false;
    if (updateButton) {
      updateButton.disabled = false;
      updateButton.textContent = 'Reload';
    }
  }
  updateButton?.addEventListener('click', async () => {
    if (applying || (!registration?.waiting && !reloadNeeded)) return;
    applying = true;
    updateButton.disabled = true;
    updateButton.textContent = 'Updating…';
    try {
      await beforeReload();
      if (reloadNeeded && !registration?.waiting) return reload();
      const worker = registration?.waiting;
      if (!worker) {
        restoreUpdateButton();
        showUpdate();
        return;
      }
      updateTimeout = setTimeout(() => {
        restoreUpdateButton();
        onStatus('The update is taking longer than expected. Tap Reload to retry.');
      }, 15000);
      worker.postMessage({ type: 'ACTIVATE_UPDATE' });
    } catch {
      clearTimeout(updateTimeout);
      restoreUpdateButton();
      onStatus('Could not apply the update. Tap Reload to retry.');
    }
  });

  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  function repairOffline(worker) {
    if (!worker || !navigator.onLine) return;
    // No permanent readiness badge: a failure is the only status worth showing.
    const channel = new MessageChannel();
    const timeout = setTimeout(() => channel.port1.close(), 30000);
    channel.port1.onmessage = event => {
      clearTimeout(timeout);
      channel.port1.close();
      if (event.data?.ready === false) onStatus('Offline download incomplete. Reconnect and reopen to retry.');
    };
    try { worker.postMessage({ type: 'ENSURE_OFFLINE' }, [channel.port2]); }
    catch { clearTimeout(timeout); channel.port1.close(); }
  }
  function watchWorker(worker) {
    if (!worker || watchedWorkers.has(worker)) return;
    watchedWorkers.add(worker);
    const changed = () => {
      if (worker.state === 'installed') {
        showUpdate();
        setTimeout(showUpdate, 0);
      }
      if (worker.state === 'activated') repairOffline(worker);
      if (worker.state === 'redundant' && !registration?.active) {
        onStatus('Offline download incomplete. Reconnect and reopen to retry.');
      }
    };
    worker.addEventListener('statechange', changed);
    changed();
  }
  async function prepareOffline(force = false) {
    if (registrationTask) return registrationTask;
    if (!force && registration && Date.now() - lastCheck < 60000) return;
    lastCheck = Date.now();
    registrationTask = (async () => {
      try {
        registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
        if (!watchedRegistrations.has(registration)) {
          watchedRegistrations.add(registration);
          registration.addEventListener('updatefound', () => watchWorker(registration.installing));
        }
        watchWorker(registration.installing);
        showUpdate();
        repairOffline(registration.active);
        if (!registration.installing && !registration.waiting && navigator.onLine) {
          try { await registration.update(); } catch { /* Offline playback stays available. */ }
          watchWorker(registration.installing);
          showUpdate();
        }
      } catch {
        if (!navigator.serviceWorker.controller && navigator.onLine) {
          onStatus('Offline installation unavailable. Reopen while connected to retry.');
        }
      } finally { registrationTask = null; }
    })();
    return registrationTask;
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applying) return reload();
    // An update accepted in another tab must not interrupt this tab's drums.
    if (hadController) reloadNeeded = true;
    hadController = true;
    showUpdate();
    repairOffline(navigator.serviceWorker.controller);
  });
  window.addEventListener('online', () => prepareOffline(true));
  window.addEventListener('focus', () => prepareOffline());
  window.addEventListener('pageshow', () => prepareOffline());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') prepareOffline();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine) prepareOffline();
  }, 5 * 60000);
  prepareOffline(true);
}
