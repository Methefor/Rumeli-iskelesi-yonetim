// Google Sheets API Configuration
const SHEETS_CONFIG = {
  apiKey: 'AIzaSyDOm35Uhpy3E1B4At6bJXt5Kj05rH8Y_sE', // Google Cloud Console'dan alacağız
  spreadsheetId: '1fQF2UAi2T4pZgATLO5anGvA-dr0RHMW06q057X_fMEo', // Google Sheets ID'si
  range: 'Form Yanıtları!A:P',
  discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
  scope: 'https://www.googleapis.com/auth/spreadsheets',
};

// Initialize Google Sheets API
let gapiReady = false;
let sheetsReady = false;

function initGoogleSheetsAPI() {
  return new Promise((resolve, reject) => {
    gapi.load('client', () => {
      gapi.client
        .init({
          apiKey: SHEETS_CONFIG.apiKey,
          discoveryDocs: SHEETS_CONFIG.discoveryDocs,
        })
        .then(() => {
          gapiReady = true;
          sheetsReady = true;
          console.log('✅ Google Sheets API initialized');
          resolve();
        })
        .catch((error) => {
          console.error('❌ Error initializing Google Sheets API:', error);
          reject(error);
        });
    });
  });
}

// Save data to Google Sheets
async function saveToSheets(formData) {
  if (!sheetsReady) {
    await initGoogleSheetsAPI();
  }

  const timestamp = new Date().toLocaleString('tr-TR');
  const date = new Date().toLocaleDateString('tr-TR');

  const row = [
    timestamp, // Zaman Damgası
    date, // Tarih
    formData.rumeliZ1 || 0, // Rumeli İskelesi Z1
    formData.rumeliZ2 || 0, // Rumeli İskelesi Z2
    formData.balikEkmek || 0, // Balık Ekmek Z
    formData.dondurma || 0, // Dondurma Z
    formData.sicakIcecek || 0, // Sıcak İçecekler
    formData.gida || 0, // Gıda
    formData.kahve || 0, // Kahve
    formData.sogukIcecek || 0, // Soğuk İçecekler
    formData.tatli || 0, // Tatlı
    formData.meyveSuyu || 0, // Meyve Suyu
    formData.dondurmaAdet || 0, // Dondurma Satış (Adet)
    formData.kahvalti || 0, // Kahvaltı
    formData.depo || 0, // Depo
    formData.notlar || '', // Notlar
  ];

  try {
    const response = await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: SHEETS_CONFIG.spreadsheetId,
      range: SHEETS_CONFIG.range,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [row],
      },
    });

    console.log('✅ Data saved to Google Sheets:', response);

    // Save to localStorage as backup
    saveToLocalStorage(formData);

    return response;
  } catch (error) {
    console.error('❌ Error saving to Google Sheets:', error);

    // Save to localStorage if API fails
    saveToLocalStorage(formData, true);

    throw new Error(
      'Veriler kaydedilemedi. İnternet bağlantınızı kontrol edin.'
    );
  }
}

// Get data from Google Sheets
async function getFromSheets(range = SHEETS_CONFIG.range) {
  if (!sheetsReady) {
    await initGoogleSheetsAPI();
  }

  try {
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_CONFIG.spreadsheetId,
      range: range,
    });

    const values = response.result.values || [];
    console.log('✅ Data loaded from Google Sheets:', values.length, 'rows');

    return values;
  } catch (error) {
    console.error('❌ Error loading from Google Sheets:', error);

    // Try to load from localStorage
    return getFromLocalStorage();
  }
}

// LocalStorage backup functions
function saveToLocalStorage(formData, isBackup = false) {
  const data = {
    timestamp: new Date().toISOString(),
    date: new Date().toLocaleDateString('tr-TR'),
    formData: formData,
    isBackup: isBackup,
    synced: !isBackup,
  };

  const existingData = JSON.parse(localStorage.getItem('rumeliData') || '[]');
  existingData.push(data);

  localStorage.setItem('rumeliData', JSON.stringify(existingData));
  console.log(
    isBackup
      ? '💾 Data saved to localStorage (backup)'
      : '💾 Data saved to localStorage'
  );
}

function getFromLocalStorage() {
  const data = JSON.parse(localStorage.getItem('rumeliData') || '[]');
  console.log('📦 Loaded from localStorage:', data.length, 'entries');
  return data;
}

// Sync localStorage data to Sheets when online
async function syncLocalDataToSheets() {
  const localData = getFromLocalStorage();
  const unsyncedData = localData.filter((item) => !item.synced);

  if (unsyncedData.length === 0) {
    console.log('✅ No data to sync');
    return;
  }

  console.log('🔄 Syncing', unsyncedData.length, 'entries to Google Sheets...');

  for (const item of unsyncedData) {
    try {
      await saveToSheets(item.formData);
      item.synced = true;
    } catch (error) {
      console.error('❌ Failed to sync entry:', error);
    }
  }

  localStorage.setItem('rumeliData', JSON.stringify(localData));
  console.log('✅ Sync complete!');
}

// Check if online and sync
function checkAndSync() {
  if (navigator.onLine) {
    syncLocalDataToSheets();
  }
}

// Listen for online events
window.addEventListener('online', checkAndSync);

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  // Load Google API
  const script = document.createElement('script');
  script.src = 'https://apis.google.com/js/api.js';
  script.onload = () => {
    initGoogleSheetsAPI().catch((error) => {
      console.error('Failed to initialize Google Sheets API:', error);
    });
  };
  document.head.appendChild(script);
});

// Export functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    saveToSheets,
    getFromSheets,
    syncLocalDataToSheets,
    initGoogleSheetsAPI,
  };
}
