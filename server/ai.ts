/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { authenticateToken } from './auth.js';

export const aiRouter = express.Router();

// Helper to check for Gemini API key
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Lazy initialization of Gemini client
let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is not configured. Please add it via Settings > Secrets.');
    }
    aiClient = new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return aiClient;
}

// 1. CONVERSATION SUMMARIZATION
aiRouter.post('/summarize', authenticateToken, async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages list is required for summarization.' });
    }

    const ai = getAIClient();
    const formattedChatHistory = messages
      .map(m => `${m.sender?.displayName || 'User'}: ${m.content}`)
      .join('\n');

    const prompt = `You are an expert chat companion assistant. Please provide a concise, friendly, and structured summary (bullet points) of the following chat conversation history, highlighting key decisions, action items, or plan reminders. Keep it brief:\n\n${formattedChatHistory}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt
    });

    res.json({ summary: response.text });
  } catch (err: any) {
    console.error('AI Summarization Error:', err);
    res.status(500).json({ error: err.message || 'AI Summarization failed.' });
  }
});

// 2. TRANSLATE MESSAGE
aiRouter.post('/translate', authenticateToken, async (req, res) => {
  try {
    const { text, targetLanguage } = req.body;
    if (!text || !targetLanguage) {
      return res.status(400).json({ error: 'Text and targetLanguage are required.' });
    }

    const ai = getAIClient();
    const prompt = `Translate the following message into ${targetLanguage}. Return ONLY the direct translation, preserving the tone, slang, or emojis if present. Do not include quotes or conversational preambles:\n\n${text}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt
    });

    res.json({ translatedText: response.text?.trim() });
  } catch (err: any) {
    console.error('AI Translation Error:', err);
    res.status(500).json({ error: err.message || 'AI Translation failed.' });
  }
});

// 3. GENERATE QUICK REPLIES / SUGGESTIONS
aiRouter.post('/suggest-replies', authenticateToken, async (req, res) => {
  try {
    const { context } = req.body; // last 3-5 messages
    if (!context || !Array.isArray(context)) {
      return res.status(400).json({ error: 'Context messages array is required.' });
    }

    const ai = getAIClient();
    const formattedContext = context
      .map(m => `${m.sender?.displayName || 'Friend'}: ${m.content}`)
      .join('\n');

    const prompt = `Based on the following short chat exchange, suggest 3 quick, short, and highly conversational response replies. They should sound natural, trendy, and casual. Provide the output as a simple JSON array of strings. Do not wrap in markdown code blocks, just return the raw JSON array. For example: ["Haha awesome!", "No way, details!", "I'm down!"]\n\nContext:\n${formattedContext}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt
    });

    let suggestions = [];
    try {
      const text = response.text || '[]';
      const cleanJson = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      suggestions = JSON.parse(cleanJson);
    } catch {
      suggestions = ["That's cool!", "Sounds good!", "Awesome!"];
    }

    res.json({ suggestions });
  } catch (err: any) {
    console.error('AI Suggest Replies Error:', err);
    res.status(500).json({ error: err.message || 'AI Suggestions failed.' });
  }
});

// 4. DETECT TOXICITY & SPAM
aiRouter.post('/analyze-safety', authenticateToken, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text content is required for safety analysis.' });
    }

    const ai = getAIClient();
    const prompt = `Analyze the following private chat message for toxicity (hate speech, severe insults, harassment) and spam (unsolicited advertisements, repetitive scams). Respond ONLY in valid JSON format with three boolean keys: "isToxic", "isSpam", and a brief "reason" string (empty if safe). Do not include markdown wraps:\n\nMessage: "${text}"`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt
    });

    let safety = { isToxic: false, isSpam: false, reason: '' };
    try {
      const textResponse = response.text || '{}';
      const cleanJson = textResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
      safety = JSON.parse(cleanJson);
    } catch {
      // safe fallback
    }

    res.json(safety);
  } catch (err: any) {
    console.error('AI Safety Analysis Error:', err);
    res.status(500).json({ error: err.message || 'Safety analysis failed.' });
  }
});

// 5. CHATBOT COMPANION (DIRECT OR INSIDE GROUP)
aiRouter.post('/chatbot', authenticateToken, async (req, res) => {
  try {
    const { message, chatHistory } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message query is required for AI Chatbot.' });
    }

    const ai = getAIClient();
    
    // Construct chat state
    const historyParts = chatHistory ? chatHistory.map((h: any) => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.text }]
    })) : [];

    historyParts.push({
      role: 'user',
      parts: [{ text: message }]
    });

    const systemInstruction = "You are HomieAI, the virtual companion inside HomieHub. You are part of the friend group—chill, friendly, slightly witty, and highly helpful. You use casual language and emojis, keeping answers short, playful, and incredibly warm. You can help coordinate plans, suggest movies or games, outline to-do lists, settle friendly debates, or just vibe with the user.";

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: historyParts,
      config: {
        systemInstruction
      }
    });

    res.json({ response: response.text });
  } catch (err: any) {
    console.error('AI Chatbot Error:', err);
    res.status(500).json({ error: err.message || 'AI Chatbot failed.' });
  }
});

// 6. PHOTO CAPTION GENERATOR
aiRouter.post('/caption', authenticateToken, async (req, res) => {
  try {
    const { imageUrl, promptContext } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ error: 'Image URL is required for caption generation.' });
    }

    const ai = getAIClient();
    
    // Extract base64 image data or download public image
    // For simplicity inside our client-server sandbox, let's assume client sends a base64 string
    const base64Data = imageUrl.split(',')[1] || imageUrl;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [
        {
          inlineData: {
            mimeType: 'image/png',
            data: base64Data
          }
        },
        {
          text: `Generate 3 trendy, engaging, or funny Instagram/Snapchat-style social captions for this photo. ${promptContext ? 'Context: ' + promptContext : ''} Respond as a simple JSON array of strings. Do not include markdown codeblocks.`
        }
      ]
    });

    let captions = [];
    try {
      const text = response.text || '[]';
      const cleanJson = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      captions = JSON.parse(cleanJson);
    } catch {
      captions = ["Vibing with the homies ✨", "Living my best life 📸", "Unforgettable moments ❤️"];
    }

    res.json({ captions });
  } catch (err: any) {
    console.error('AI Caption Error:', err);
    res.status(500).json({ error: err.message || 'AI Caption generation failed.' });
  }
});
