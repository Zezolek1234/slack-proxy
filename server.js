require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const Redis = require('ioredis');

const app = express();

// ### Middleware ###
app.use(cors());
app.use(express.json());

// ### Konfiguracja ###
const webhookUrl = process.env.SLACK_WEBHOOK_URL;
const redisUrl = process.env.REDIS_URL; // Adres URL do Redis z Render
const COOLDOWN_PERIOD_MS = 12 * 60 * 60 * 1000; // 12 godzin
const COOLDOWN_KEY = 'slack_last_send_timestamp'; // Klucz w bazie Redis

// Sprawdzenie, czy kluczowe zmienne środowiskowe są ustawione
if (!redisUrl) {
  console.error('Brak zdefiniowanego REDIS_URL! Aplikacja nie może poprawnie działać.');
  process.exit(1); // Zakończ proces, jeśli nie ma połączenia z Redis
}

// Inicjalizacja klienta Redis
const redis = new Redis(redisUrl);

redis.on('connect', () => {
  console.log('✅ Pomyślnie połączono z Redis.');
});
redis.on('error', (err) => {
  console.error('Błąd połączenia z Redis:', err);
});

// ### Middleware do sprawdzania cooldownu ###
const checkCooldown = async (req, res, next) => {
  try {
    const lastSuccessfulSendTimestamp = await redis.get(COOLDOWN_KEY);

    if (lastSuccessfulSendTimestamp) {
      const now = Date.now();
      const timeSinceLastSend = now - parseInt(lastSuccessfulSendTimestamp, 10);

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
    // Jeśli cooldown nie jest aktywny, pozwól na dalsze przetwarzanie
    next();
  } catch (error) {
    console.error("Błąd podczas sprawdzania cooldownu w Redis:", error);
    // W przypadku błędu Redis, przepuszczamy żądanie, aby nie blokować aplikacji
    next();
  }
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

    // Sprawdź, czy wysyłka się udała
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Błąd Slack:", errorText);
      return res.status(500).json({ error: 'Slack error', details: errorText });
    }

    // Zaktualizuj czas udanej wysyłki w Redis
    await redis.set(COOLDOWN_KEY, Date.now());
    console.log('Pomyślnie zapisano nowy czas cooldownu w Redis.');

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
