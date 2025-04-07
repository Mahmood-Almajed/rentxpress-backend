const express = require('express');
const router = express.Router();
const { Configuration, OpenAIApi } = require('openai');
const Car = require('../models/car'); // Your Mongoose Car model

// 🔑 Configure OpenAI using v3.x style
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

router.post('/', async (req, res) => {
  const { message } = req.body;

  try {
    // 🧠 GPT instructions
    const systemPrompt = `
      You are RentBot, an assistant for a car rental platform called RentXpress.
      ONLY answer questions about car rentals, car sales, listings, reviews, rental status, and dealer help.
      Do NOT answer math problems, trivia, personal questions, or programming help.
      If asked anything off-topic, say: "I'm here to help with car rentals and sales only 🚗."
    `;

    // 💰 Handle special query manually
    if (message.toLowerCase().includes('cheapest')) {
      const car = await Car.find({ listingType: 'rent', availability: 'available' })
        .sort({ pricePerDay: 1 })
        .limit(1);

      if (!car.length) {
        return res.json({ reply: "Sorry, there are no cars available for rent at the moment." });
      }

      const cheapest = car[0];
      return res.json({
        reply: `The cheapest rental car is a ${cheapest.year} ${cheapest.brand} ${cheapest.model} for BHD ${cheapest.pricePerDay}/day.`,
      });
    }

    // 🤖 Call GPT-3.5 for general car-related questions
    const completion = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      max_tokens: 300, // ✅ Prevent runaway responses
    });

    res.json({ reply: completion.data.choices[0].message.content });
  } catch (err) {
    // 🔍 Log full error detail
    console.error('🔴 Chatbot error:', err.response?.data || err.message || err);
    res.status(500).json({ error: 'Chatbot error' });
  }
});

module.exports = router;
