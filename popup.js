let selectedDomain = null;
let currentTabDomain = null;
let domainsCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 60 * 60 * 1000; // 1 час в миллисекундах
const DEFAULT_SERVER_URL = "192.168.10.1";

document.addEventListener("DOMContentLoaded", initPopup);

async function initPopup() {
  currentTabDomain = await getCurrentDomain();
  const customDomainInput = document.getElementById("customDomainInput");
  const addBtn = document.getElementById("addBtn");
  
  // Обработчик изменения поля ввода
  customDomainInput.addEventListener("input", () => {
    if (customDomainInput.value.trim()) {
      addBtn.textContent = "➕ Добавить вручную";
    } else {
      addBtn.textContent = "➕ Добавить текущий домен";
    }
  });
  
  addBtn.addEventListener("click", addDomain);
  document.getElementById("removeBtn").addEventListener("click", removeSelectedDomain);
  document.getElementById("listBtn").addEventListener("click", () => listDomains(true));
  document.getElementById("settingsBtn").addEventListener("click", openSettings);
  
  await loadDomainsFromCache();
}

async function addDomain() {
  const customDomainInput = document.getElementById("customDomainInput");
  const addBtn = document.getElementById("addBtn");
  const domainToAdd = customDomainInput.value.trim();
  
  if (domainToAdd) {
    showStatus(`Добавляем ${domainToAdd}...`, "loading");
    await sendCommand("add", domainToAdd);
    // Локально обновляем кеш
    if (domainsCache && !domainsCache.includes(domainToAdd)) {
      domainsCache.push(domainToAdd);
      await saveToStorage('domainCache', domainsCache);
    }
    customDomainInput.value = "";
    addBtn.textContent = "➕ Добавить текущий домен";
    displayDomains(domainsCache); // Обновляем отображение
  } else {
    if (!currentTabDomain) {
      showStatus("Не удалось определить текущий домен", "error");
      return;
    }
    showStatus(`Добавляем ${currentTabDomain}...`, "loading");
    await sendCommand("add", currentTabDomain);
    // Локально обновляем кеш
    if (domainsCache && !domainsCache.includes(currentTabDomain)) {
      domainsCache.push(currentTabDomain);
      await saveToStorage('domainCache', domainsCache);
    }
    displayDomains(domainsCache); // Обновляем отображение
  }
}

async function getCurrentDomain() {
  try {
    // Firefox использует browser API, но chrome тоже работает для совместимости
    const api = typeof browser !== 'undefined' ? browser : chrome;
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    return tab?.url ? new URL(tab.url).hostname : null;
  } catch {
    return null;
  }
}

async function getServerUrl() {
  try {
    const settings = await getFromStorage('serverSettings');
    if (settings && settings.url) {
      return settings.port ? `${settings.url}:${settings.port}` : settings.url;
    }
    return DEFAULT_SERVER_URL;
  } catch (error) {
    console.error('Ошибка получения настроек сервера:', error);
    return DEFAULT_SERVER_URL;
  }
}

async function loadDomainsFromCache() {
  const cachedData = await getFromStorage('domainCache');
  const timestamp = await getFromStorage('cacheTimestamp');
  
  // Сначала показываем кэш если он есть (даже если устарел)
  if (cachedData) {
    domainsCache = cachedData;
    cacheTimestamp = timestamp;
    displayDomains(domainsCache);
    
    // Проверяем актуальность кэша
    if (timestamp && (Date.now() - timestamp < CACHE_DURATION)) {
      showStatus("Список из кэша (актуален)", "success");
      return; // Кэш актуален, не загружаем с сервера
    } else {
      showStatus("Обновляем устаревший кэш...", "loading");
      // Кэш устарел, загружаем в фоне
      await listDomains();
    }
  } else {
    // Кэша нет, загружаем с сервера
    showStatus("Первая загрузка...", "loading");
    await listDomains();
  }
}

async function removeSelectedDomain() {
  if (!selectedDomain) {
    showStatus("Выберите домен из списка", "error");
    return;
  }
  
  showStatus(`Удаляем ${selectedDomain}...`, "loading");
  await sendCommand("remove", selectedDomain);
  
  // Локально обновляем кеш
  if (domainsCache) {
    domainsCache = domainsCache.filter(domain => domain !== selectedDomain);
    await saveToStorage('domainCache', domainsCache);
  }
  
  selectedDomain = null;
  displayDomains(domainsCache); // Обновляем отображение
}

async function sendCommand(action, domain) {
  try {
    const serverUrl = await getServerUrl();
    const response = await fetch(
      `http://${serverUrl}/cgi-bin/update_domain.sh?action=${action}&domain=${encodeURIComponent(domain)}`
    );
    
    if (!response.ok) throw new Error(await response.text());
    
    showStatus(await response.text(), "success");
    // Не вызываем listDomains() здесь, так как уже обновляем локально
  } catch (error) {
    const serverUrl = await getServerUrl();
    showStatus(`Проблемы с сетевым подключением к серверу ${serverUrl}: ${error.message}`, "error");
    console.error("Ошибка запроса:", error);
    // В случае ошибки все равно обновляем отображение из кеша
    displayDomains(domainsCache || []);
  }
}

async function listDomains(forceUpdate = false) {
  try {
    // Проверяем кэш, если не принудительное обновление
    if (!forceUpdate && domainsCache && cacheTimestamp && 
        (Date.now() - cacheTimestamp < CACHE_DURATION)) {
      displayDomains(domainsCache);
      showStatus("Список актуален", "success");
      return;
    }
    
    showStatus("Загружаем список...", "loading");
    const serverUrl = await getServerUrl();
    const response = await fetch(`http://${serverUrl}/cgi-bin/update_domain.sh?action=list`);
    
    if (!response.ok) throw new Error(await response.text());
    
    const domains = (await response.text()).split('\n').filter(d => d.trim());
    
    // Сохраняем в кэш
    domainsCache = domains;
    cacheTimestamp = Date.now();
    await saveToStorage('domainCache', domains);
    await saveToStorage('cacheTimestamp', cacheTimestamp);
    
    displayDomains(domains);
    showStatus(forceUpdate ? "Список принудительно обновлен" : "Список обновлен", "success");
  } catch (error) {
    const serverUrl = await getServerUrl();
    showStatus(`Проблемы с сетевым подключением к серверу ${serverUrl}: ${error.message}`, "error");
    
    // Очищаем список при ошибке
    displayDomains([]);
  }
}

function displayDomains(domains) {
  const listElement = document.getElementById("domainList");
  listElement.innerHTML = '';
  
  if (domains.length === 0) {
    listElement.textContent = "Список доменов пуст";
    return;
  }
  
  domains.forEach(domain => {
    const item = document.createElement("div");
    item.className = "domain-item";
    item.textContent = domain;
    
    if (domain === selectedDomain) {
      item.classList.add("selected");
    }
    
    item.addEventListener("click", () => {
      document.querySelectorAll(".domain-item").forEach(el => {
        el.classList.remove("selected");
      });
      item.classList.add("selected");
      selectedDomain = domain;
    });
    
    listElement.appendChild(item);
  });
}

function showStatus(message, type) {
  const statusElement = document.getElementById("status");
  statusElement.textContent = message;
  
  // Очищаем все классы состояния
  statusElement.classList.remove("error-status", "success-status", "loading-status");
  
  // Добавляем соответствующий класс
  if (type === "error") {
    statusElement.classList.add("error-status");
  } else if (type === "success") {
    statusElement.classList.add("success-status");
  } else if (type === "loading") {
    statusElement.classList.add("loading-status");
  }
}

function openSettings() {
  try {
    const api = typeof browser !== 'undefined' ? browser : chrome;
    api.runtime.openOptionsPage();
  } catch (error) {
    console.error('Ошибка открытия настроек:', error);
    showStatus("Ошибка открытия настроек", "error");
  }
}

// Функции для работы с хранилищем
async function saveToStorage(key, value) {
  try {
    const api = typeof browser !== 'undefined' ? browser : chrome;
    const data = {};
    data[key] = value;
    await api.storage.local.set(data);
  } catch (error) {
    console.error('Ошибка сохранения в storage:', error);
  }
}

async function getFromStorage(key) {
  try {
    const api = typeof browser !== 'undefined' ? browser : chrome;
    const result = await api.storage.local.get(key);
    return result[key];
  } catch (error) {
    console.error('Ошибка чтения из storage:', error);
    return null;
  }
}