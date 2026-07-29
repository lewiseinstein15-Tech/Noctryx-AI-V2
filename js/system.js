/**
 * Noctryx AI V2 - System Monitor
 * Real device stats using native browser APIs.
 */

import { $, formatBytes } from './utils.js';

const state = {
  battery: null,
  connection: null,
  storage: null,
};

export async function initSystemMonitor() {
  updateTime();
  setInterval(updateTime, 1000);

  updateBasicInfo();
  initBattery();
  initNetwork();
  initStorage();
  initMemory();
  updateCoreGauge();
  
  // Refresh storage every 30s
  setInterval(initStorage, 30000);
}

function updateTime() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  
  // These can be exposed to UI if needed
  window.__noctryx_time = timeStr;
  window.__noctryx_date = dateStr;
}

function updateBasicInfo() {
  const info = {
    browser: getBrowser(),
    platform: navigator.platform || 'Unavailable',
    online: navigator.onLine ? 'Online' : 'Offline',
    resolution: `${window.screen.width}×${window.screen.height}`,
    language: navigator.language || 'Unavailable',
    cores: navigator.hardwareConcurrency || 'Unavailable',
  };
  window.__noctryx_system = info;
  
  // Update online status visually
  const dot = $('#aiStatusDot');
  const text = $('#aiStatusText');
  if (dot && text) {
    if (!navigator.onLine) {
      dot.classList.add('offline');
      text.textContent = 'AI CORE: OFFLINE';
    } else {
      dot.classList.remove('offline');
      text.textContent = 'AI CORE: ACTIVE';
    }
  }
  
  window.addEventListener('online', () => {
    dot?.classList.remove('offline');
    if (text) text.textContent = 'AI CORE: ACTIVE';
  });
  window.addEventListener('offline', () => {
    dot?.classList.add('offline');
    if (text) text.textContent = 'AI CORE: OFFLINE';
  });
}

function getBrowser() {
  const ua = navigator.userAgent;
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('SamsungBrowser')) return 'Samsung Internet';
  if (ua.includes('Opera') || ua.includes('OPR')) return 'Opera';
  if (ua.includes('Trident')) return 'Internet Explorer';
  if (ua.includes('Edge') || ua.includes('Edg')) return 'Edge';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari')) return 'Safari';
  return 'Unknown';
}

async function initBattery() {
  const batteryVal = $('#batteryVal');
  const batteryFill = $('#batteryFill');
  
  if ('getBattery' in navigator) {
    try {
      const battery = await navigator.getBattery();
      state.battery = battery;
      
      function update() {
        const pct = Math.round(battery.level * 100);
        const charging = battery.charging;
        if (batteryVal) batteryVal.textContent = `${pct}%${charging ? ' ⚡' : ''}`;
        if (batteryFill) batteryFill.style.width = `${pct}%`;
      }
      
      update();
      battery.addEventListener('levelchange', update);
      battery.addEventListener('chargingchange', update);
    } catch {
      if (batteryVal) batteryVal.textContent = 'Unavailable';
    }
  } else {
    if (batteryVal) batteryVal.textContent = 'Unavailable';
  }
}

function initNetwork() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const cpuVal = $('#cpuVal');
  const cpuFill = $('#cpuFill');
  const ramVal = $('#ramVal');
  const ramFill = $('#ramFill');
  
  // CPU is not directly available in browsers; we simulate a realistic
  // "load" indicator using connection effective type as a proxy, or show unavailable.
  if (cpuVal) cpuVal.textContent = 'Unavailable';
  if (cpuFill) cpuFill.style.width = '0%';
  
  // Device memory (RAM)
  if ('deviceMemory' in navigator) {
    const mem = navigator.deviceMemory;
    // deviceMemory returns approximate RAM in GB (2, 4, 8, etc)
    if (ramVal) ramVal.textContent = `~${mem} GB`;
    if (ramFill) ramFill.style.width = '0%'; // No usage % available
  } else {
    if (ramVal) ramVal.textContent = 'Unavailable';
  }
  
  // Connection info for display
  if (connection) {
    state.connection = connection;
    const type = connection.effectiveType || 'unknown';
    const downlink = connection.downlink || 'unknown';
    window.__noctryx_network = { type, downlink };
  }
}

async function initStorage() {
  const storageVal = $('#storageVal');
  const storageFill = $('#storageFill');
  
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    try {
      const estimate = await navigator.storage.estimate();
      state.storage = estimate;
      const used = estimate.usage || 0;
      const total = estimate.quota || 1;
      const pct = Math.round((used / total) * 100);
      
      if (storageVal) storageVal.textContent = `${pct}%`;
      if (storageFill) storageFill.style.width = `${pct}%`;
      
      window.__noctryx_storage = {
        used: formatBytes(used),
        total: formatBytes(total),
        pct,
      };
    } catch {
      if (storageVal) storageVal.textContent = 'Unavailable';
    }
  } else {
    if (storageVal) storageVal.textContent = 'Unavailable';
  }
}

function initMemory() {
  // Memory Pressure API (experimental, Chrome only)
  if ('performance' in window && 'memory' in performance) {
    const mem = performance.memory;
    window.__noctryx_heap = {
      used: formatBytes(mem.usedJSHeapSize),
      total: formatBytes(mem.totalJSHeapSize),
      limit: formatBytes(mem.jsHeapSizeLimit),
    };
  }
}

function updateCoreGauge() {
  const corePct = $('#corePct');
  const coreRing = $('#coreRing');
  const coreStatus = $('#coreStatusText');
  
  // Core gauge reflects overall system "health" based on available metrics
  let health = 100;
  
  if (state.battery) {
    health = Math.min(health, Math.round(state.battery.level * 100));
  }
  if (state.storage) {
    const storagePct = Math.round(((state.storage.usage || 0) / (state.storage.quota || 1)) * 100);
    health = Math.min(health, 100 - storagePct);
  }
  if (!navigator.onLine) health = Math.min(health, 30);
  
  const circumference = 2 * Math.PI * 38; // r=38
  const offset = circumference - (health / 100) * circumference;
  
  if (coreRing) coreRing.style.strokeDashoffset = offset;
  if (corePct) corePct.textContent = `${health}%`;
  
  let status = 'RUNNING SMOOTHLY';
  if (health < 50) status = 'MODERATE LOAD';
  if (health < 25) status = 'SYSTEM STRAINED';
  if (!navigator.onLine) status = 'OFFLINE MODE';
  if (coreStatus) coreStatus.textContent = status;
  
  setTimeout(updateCoreGauge, 5000);
}

export function getSystemInfo() {
  return {
    ...window.__noctryx_system,
    time: window.__noctryx_time,
    date: window.__noctryx_date,
    network: window.__noctryx_network,
    storage: window.__noctryx_storage,
    heap: window.__noctryx_heap,
    battery: state.battery ? {
      level: Math.round(state.battery.level * 100),
      charging: state.battery.charging,
    } : null,
  };
}
