const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const Bottleneck = require('bottleneck');
const NodeCache = require('node-cache');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' },
});

const port = 5000;
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Environment variables
const GOOGLE_TRANSLATION_API_KEY = process.env.GOOGLE_TRANSLATION_API_KEY;
const AZURE_AI_API_KEY = process.env.AZURE_AI_API_KEY;
const AZURE_AI_ENDPOINT = process.env.AZURE_AI_ENDPOINT || 'https://gendem.cognitiveservices.azure.com/';

// Cache setup
const cache = new NodeCache({ stdTTL: 3600 }); // 1-hour TTL

// Rate limiting for APIs
const limiter = new Bottleneck({
    maxConcurrent: 1,
    minTime: 1000, // 1 second between requests
});

const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 15,
    message: {
        error: 'Too many requests, please try again after a minute.',
        details: 'API rate limits apply.',
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Retry logic for API requests
const retryRequest = async (url, data, headers, retries = 5, initialDelay = 2000) => {
    try {
        const response = await axios.post(url, data, { headers });
        return response;
    } catch (error) {
        if (error.response && error.response.status === 429 && retries > 0) {
            if (error.response.data?.error?.message.includes('Quota exceeded')) {
                throw new Error('API quota exhausted. Please check your subscription.');
            }
            const retryAfter = error.response.headers['retry-after'] || initialDelay / 1000;
            const delay = retryAfter * 1000;
            console.log(`Rate limit exceeded. Retrying in ${delay / 1000}s (${retries} attempts left)`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return retryRequest(url, data, headers, retries - 1, initialDelay * 2);
        }
        throw error;
    }
};

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Translation endpoint
app.post('/translate', apiLimiter, async (req, res) => {
    const { text, targetLanguage } = req.body;
    if (!text || !targetLanguage) {
        return res.status(400).json({ error: 'Text and target language are required.' });
    }

    io.emit('status', { action: 'translate', message: 'Translating...' });

    const cacheKey = `translate:${text}:${targetLanguage}`;
    const cachedResult = cache.get(cacheKey);
    if (cachedResult) {
        io.emit('status', { action: 'translate', message: 'Translation complete (cached).' });
        return res.json(cachedResult);
    }

    try {
        const detectUrl = `https://translation.googleapis.com/language/translate/v2/detect?key=${GOOGLE_TRANSLATION_API_KEY}`;
        const detectResponse = await axios.post(detectUrl, { q: text });
        const detectedLanguage = detectResponse.data.data.detections[0][0].language;

        if (detectedLanguage === targetLanguage) {
            const result = { detectedLanguage, translatedText: text, message: 'Same language detected.' };
            cache.set(cacheKey, result);
            io.emit('status', { action: 'translate', message: 'Translation complete.' });
            return res.json(result);
        }

        const translateUrl = `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_TRANSLATION_API_KEY}`;
        const translateResponse = await axios.post(translateUrl, {
            q: text,
            source: detectedLanguage,
            target: targetLanguage,
            format: 'text',
        });
        const translatedText = translateResponse.data.data.translations[0].translatedText;
        const result = { detectedLanguage, translatedText };
        cache.set(cacheKey, result);
        io.emit('status', { action: 'translate', message: 'Translation complete.' });
        res.json(result);
    } catch (error) {
        io.emit('status', { action: 'translate', message: 'Translation failed.' });
        res.status(500).json({ error: 'Translation failed', details: error.message });
    }
});

// Summarization endpoint (translated from Python code)
app.post('/summarize', apiLimiter, async (req, res) => {
    const { text } = req.body;
    if (!text) {
        return res.status(400).json({ error: 'Text is required.' });
    }

    io.emit('status', { action: 'summarize', message: 'Summarizing...' });

    const cacheKey = `summarize:${text}`;
    const cachedResult = cache.get(cacheKey);
    if (cachedResult) {
        io.emit('status', { action: 'summarize', message: 'Summarization complete (cached).' });
        return res.json({ summary: cachedResult });
    }

    if (!AZURE_AI_API_KEY) {
        io.emit('status', { action: 'summarize', message: 'Summarization failed.' });
        return res.status(500).json({ error: 'API key not found. Set the AZURE_OPENAI_API_KEY environment variable.' });
    }

    try {
        const response = await limiter.schedule(() =>
            retryRequest(
                `${AZURE_AI_ENDPOINT}/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-12-01-preview`,
                {
                    messages: [
                        {
                            role: 'system',
                            content: (
                                'You are an educational assistant. Summarize the provided text in simple language (up to 30 words). ' +
                                'Do not alter the meaning. Ensure clarity and conciseness.'
                            ),
                        },
                        { role: 'user', content: `Text: ${text}` },
                    ],
                    max_tokens: 150,
                    temperature: 0.7,
                    top_p: 1.0,
                },
                {
                    'Content-Type': 'application/json',
                    'api-key': AZURE_AI_API_KEY,
                }
            )
        );
        const summary = response.data.choices[0].message.content.trim();
        cache.set(cacheKey, summary);
        io.emit('status', { action: 'summarize', message: 'Summarization complete.' });
        res.json({ summary });
    } catch (error) {
        io.emit('status', { action: 'summarize', message: 'Summarization failed.' });
        res.status(500).json({ error: 'Summarization failed', details: error.message });
    }
});

// Symptom analysis endpoint
app.post('/analyze-symptoms', apiLimiter, async (req, res) => {
    const { symptoms } = req.body;
    if (!symptoms) {
        return res.status(400).json({ error: 'Symptoms are required.' });
    }

    io.emit('status', { action: 'symptoms', message: 'Analyzing symptoms...' });

    const cacheKey = `symptoms:${symptoms}`;
    const cachedResult = cache.get(cacheKey);
    if (cachedResult) {
        io.emit('status', { action: 'symptoms', message: 'Analysis complete (cached).' });
        return res.json({ analysis: cachedResult });
    }

    try {
        const response = await limiter.schedule(() =>
            retryRequest(
                `${AZURE_AI_ENDPOINT}/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-12-01-preview`,
                {
                    messages: [
                        {
                            role: 'system',
                            content: (
                                'You are an educational health assistant, not a doctor. Suggest possible conditions in 30 words or less. ' +
                                'Suggest common over-the-counter medications or remedies in 20 words or less, if applicable. ' +
                                'Do not diagnose or prescribe. For serious symptoms (e.g., chest pain), urge immediate medical attention. ' +
                                'Include: "This is not a medical diagnosis or prescription. All suggestions must be verified by a healthcare professional."'
                            ),
                        },
                        { role: 'user', content: `Symptoms: ${symptoms}` },
                    ],
                    max_tokens: 150,
                    temperature: 0.7,
                },
                {
                    'Content-Type': 'application/json',
                    'api-key': AZURE_AI_API_KEY,
                }
            )
        );
        const analysis = response.data.choices[0].message.content.trim();
        cache.set(cacheKey, analysis);
        io.emit('status', { action: 'symptoms', message: 'Analysis complete.' });
        res.json({ analysis });
    } catch (error) {
        io.emit('status', { action: 'symptoms', message: 'Analysis failed.' });
        res.status(500).json({ error: 'Symptom analysis failed', details: error.message });
    }
});

// Socket.io for real-time status
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

server.listen(port, () => console.log(`Server running on http://localhost:${port}`));









// Summarization endpoint (translated from Python code)
