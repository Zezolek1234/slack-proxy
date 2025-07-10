require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const fs = require('fs'); // Do obsługi plików

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// ### Konfiguracja ###
const webhookUrl = process.env.SLACK_WEBHOOK_URL;
const COOLDOWN_PERIOD_MS = 12 * 60 * 60 * 1000; // 12 godzin
const COOLDOWN_FILE_PATH = './cooldown_timestamp.txt'; // Plik do zapisu czasu

// ### Punkt 1: Utrwalenie stanu cooldownu ###

// Funkcja do odczytu ostatniego czasu z pliku
function readLastTimestamp() {
  try {
    // Sprawdź, czy plik istnieje
    if (fs.existsSync(COOLDOWN_FILE_PATH)) {
      const timestampStr = fs.readFileSync(COOLDOWN_FILE_PATH, 'utf-8');
      // Zwróć czas jako liczbę
      return parseInt(timestampStr, 10);
    }
  } catch (error) {
    console.error('Błąd odczytu pliku cooldown:', error);
  }
  // Zwróć null, jeśli plik nie istnieje lub wystąpił błąd
  return null;
}

// Odczytaj czas przy starcie serwera
let lastSuccessfulSendTimestamp = readLastTimestamp();
console.log('Odczytano ostatni czas wysyłki:', lastSuccessfulSendTimestamp ? new Date(lastSuccessfulSendTimestamp).toISOString() : 'Brak');


// ### Punkt 2: Wydzielenie logiki do "middleware" ###

const checkCooldown = (req, res, next) => {
  if (lastSuccessfulSendTimestamp) {
    const now = Date.now();
    const timeSinceLastSend = now - lastSuccessfulSendTimestamp;

    if (timeSinceLastSend < COOLDOWN_PERIOD_MS) {
      const timeLeft = COOLDOWN_PERIOD_MS - timeSinceLastSend;
      const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
      const minutesLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
      
      console.warn('Żądanie zablokowane przez cooldown.');
      return res.status(429).json({
        error: 'Cooldown active',
        message: `Możesz wysłać kolejny raport za około ${hoursLeft} godzin i ${minutesLeft} minut.`
      });
    }
  }
  // Jeśli cooldown nie jest aktywny, pozwól na dalsze przetwarzanie żądania
  next(); 
};

// ### Definicje Endpointów ###

// Endpoint testowy (GET)
app.get('/', (req, res) => {
  res.send("🎯 Slack proxy działa! Użyj POST /send-report, aby wysłać wiadomość.");
});

// Endpoint do przyjmowania raportu (z użyciem middleware do cooldownu)
app.post('/send-report', checkCooldown, async (req, res) => {
  const { text } = req.body;

  // Walidacja
  if (!text) {
    return res.status(400).json({ error: 'No text provided' });
  }
  if (!webhookUrl) {
    console.error('Brak zdefiniowanego SLACK_WEBHOOK_URL!');
    return res.status(500).json({ error: 'SLACK_WEBHOOK_URL not set' });
  }

  try {
    // Wysyłka do Slacka
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    // Sprawdź, czy się udało
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Błąd Slack:", errorText);
      return res.status(500).json({ error: 'Slack error', details: errorText });
    }

    // Zaktualizuj i zapisz czas udanej wysyłki
    lastSuccessfulSendTimestamp = Date.now();
    try {
      fs.writeFileSync(COOLDOWN_FILE_PATH, lastSuccessfulSendTimestamp.toString());
      console.log('Pomyślnie zapisano nowy czas cooldownu do pliku.');
    } catch (error) {
      console.error('Błąd zapisu pliku cooldown:', error);
    }

    res.json({ message: '✅ Raport wysłany na Slacka' });
  } catch (error) {
    console.error("Błąd serwera:", error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// ### Start serwera ###
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Serwer działa na porcie ${PORT}`);
});
