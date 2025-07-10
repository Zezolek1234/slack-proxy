require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Odczytaj URL webhooka z .env lub z panelu środowiska Render/Vercel itp.
const webhookUrl = process.env.SLACK_WEBHOOK_URL;

// ZMIANA: Zmienne do obsługi cooldownu
let lastSuccessfulSendTimestamp = null;
const COOLDOWN_PERIOD_MS = 12 * 60 * 60 * 1000; // 12 godzin w milisekundach

// Endpoint testowy (GET)
app.get('/', (req, res) => {
  res.send("🎯 Slack proxy działa! Użyj POST /send-report, aby wysłać wiadomość.");
});

// Endpoint do przyjmowania raportu
app.post('/send-report', async (req, res) => {
  // ZMIANA: Sprawdzenie cooldownu przed wykonaniem logiki
  if (lastSuccessfulSendTimestamp) {
    const now = Date.now();
    const timeSinceLastSend = now - lastSuccessfulSendTimestamp;

    if (timeSinceLastSend < COOLDOWN_PERIOD_MS) {
      const timeLeft = COOLDOWN_PERIOD_MS - timeSinceLastSend;
      const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
      const minutesLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
      
      return res.status(429).json({
        error: 'Cooldown active',
        message: `Możesz wysłać kolejny raport za około ${hoursLeft} godzin i ${minutesLeft} minut.`
      });
    }
  }

  const { text } = req.body;

  // Walidacja
  if (!text) {
    return res.status(400).json({ error: 'No text provided' });
  }
  if (!webhookUrl) {
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

    // ZMIANA: Zapisz czas udanej wysyłki, aby aktywować cooldown
    lastSuccessfulSendTimestamp = Date.now();

    res.json({ message: '✅ Raport wysłany na Slacka' });
  } catch (error) {
    console.error("Błąd serwera:", error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Start serwera
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Serwer działa na porcie ${PORT}`);
});
