const DEFAULT_SERVER_URL = "192.168.10.1";
const DEFAULT_SERVER_PORT = "";

document.addEventListener("DOMContentLoaded", initOptions);

async function initOptions() {
  // Загружаем сохраненные настройки
  await loadSettings();
  
  // Устанавливаем обработчики событий
  document.getElementById("saveBtn").addEventListener("click", saveSettings);
  document.getElementById("testBtn").addEventListener("click", testConnection);
  document.getElementById("resetBtn").addEventListener("click", resetSettings);
  
  // Автосохранение при изменении полей
  document.getElementById("serverUrl").addEventListener("input", debounce(autoSave, 1000));
  document.getElementById("serverPort").addEventListener("input", debounce(autoSave, 1000));
}

async function loadSettings() {
  try {
    const settings = await getFromStorage('serverSettings');
    
    if (settings) {
      document.getElementById("serverUrl").value = settings.url || DEFAULT_SERVER_URL;
      document.getElementById("serverPort").value = settings.port || DEFAULT_SERVER_PORT;
      showStatus("Настройки загружены", "success");
    } else {
      // Устанавливаем значения по умолчанию
      document.getElementById("serverUrl").value = DEFAULT_SERVER_URL;
      document.getElementById("serverPort").value = DEFAULT_SERVER_PORT;
      showStatus("Используются настройки по умолчанию", "");
    }
  } catch (error) {
    console.error("Ошибка загрузки настроек:", error);
    showStatus("Ошибка загрузки настроек", "error");
  }
}

async function saveSettings() {
  const serverUrl = document.getElementById("serverUrl").value.trim();
  const serverPort = document.getElementById("serverPort").value.trim();
  
  if (!serverUrl) {
    showStatus("Введите URL сервера", "error");
    return;
  }
  
  // Валидация URL
  if (!isValidServerUrl(serverUrl)) {
    showStatus("Введите корректный IP-адрес или доменное имя", "error");
    return;
  }
  
  // Валидация порта
  if (serverPort && (!isValidPort(serverPort))) {
    showStatus("Введите корректный порт (1-65535)", "error");
    return;
  }
  
  const settings = {
    url: serverUrl,
    port: serverPort
  };
  
  try {
    await saveToStorage('serverSettings', settings);
    showStatus("Настройки сохранены успешно", "success");
    
    // Очищаем кэш доменов при смене сервера
    await saveToStorage('domainCache', null);
    await saveToStorage('cacheTimestamp', null);
    
  } catch (error) {
    console.error("Ошибка сохранения настроек:", error);
    showStatus("Ошибка сохранения настроек", "error");
  }
}

async function testConnection() {
  const serverUrl = document.getElementById("serverUrl").value.trim();
  const serverPort = document.getElementById("serverPort").value.trim();
  
  if (!serverUrl) {
    showStatus("Введите URL сервера для проверки", "error");
    return;
  }
  
  showStatus("Проверяем подключение...", "loading");
  document.getElementById("testBtn").disabled = true;
  
  try {
    const fullUrl = buildServerUrl(serverUrl, serverPort);
    const response = await fetch(`http://${fullUrl}/cgi-bin/update_domain.sh?action=list`, {
      method: 'GET',
      timeout: 5000
    });
    
    if (response.ok) {
      showStatus("✅ Подключение успешно! Сервер отвечает.", "success");
    } else {
      showStatus(`❌ Сервер недоступен (HTTP ${response.status})`, "error");
    }
  } catch (error) {
    showStatus(`❌ Ошибка подключения: ${error.message}`, "error");
  } finally {
    document.getElementById("testBtn").disabled = false;
  }
}

async function resetSettings() {
  if (confirm("Сбросить настройки к значениям по умолчанию?")) {
    document.getElementById("serverUrl").value = DEFAULT_SERVER_URL;
    document.getElementById("serverPort").value = DEFAULT_SERVER_PORT;
    
    await saveToStorage('serverSettings', null);
    await saveToStorage('domainCache', null);
    await saveToStorage('cacheTimestamp', null);
    
    showStatus("Настройки сброшены к умолчаниям", "success");
  }
}

async function autoSave() {
  const serverUrl = document.getElementById("serverUrl").value.trim();
  if (serverUrl && isValidServerUrl(serverUrl)) {
    await saveSettings();
  }
}

function buildServerUrl(url, port) {
  if (port && port.trim()) {
    return `${url}:${port.trim()}`;
  }
  return url;
}

function isValidServerUrl(url) {
  // Проверка IP адреса
  const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  
  // Проверка доменного имени
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;
  
  return ipRegex.test(url) || domainRegex.test(url);
}

function isValidPort(port) {
  const portNum = parseInt(port, 10);
  return portNum >= 1 && portNum <= 65535;
}

function showStatus(message, type) {
  const statusElement = document.getElementById("status");
  statusElement.textContent = message;
  
  // Очищаем все классы состояния
  statusElement.classList.remove("status-error", "status-success", "status-loading");
  
  // Добавляем соответствующий класс
  if (type === "error") {
    statusElement.classList.add("status-error");
  } else if (type === "success") {
    statusElement.classList.add("status-success");
  } else if (type === "loading") {
    statusElement.classList.add("status-loading");
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
    throw error;
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

// Утилита для задержки выполнения функции
function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}