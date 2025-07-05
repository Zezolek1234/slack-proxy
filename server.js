const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const app = express();

app.use(cors());
app.use(express.json());

app.post("/send-report", async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "No text provided" });

  try {
    const slackResponse = await fetch(
      "https://hooks.slack.com/services/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",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }
    );

    if (slackResponse.ok) {
      res.status(200).json({ message: "Sent to Slack" });
    } else {
      res.status(500).json({ error: "Slack webhook error" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
