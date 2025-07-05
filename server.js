require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // używamy fetch do wysyłki na Slacka

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Odczytaj URL webhooka z .env lub z panelu środowiska Render/Vercel itp.
const webhookUrl = process.env.SLACK_WEBHOOK_URL;

// Endpoint testowy (GET)
app.get('/', (req, res) => {
  res.send("🎯 Slack proxy działa! Użyj POST /send-report, aby wysłać wiadomość.");
});

// Endpoint do przyjmowania raportu
app.post('/send-report', async (req, res) => {
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
