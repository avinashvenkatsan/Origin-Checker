import express from 'express';
import { analyzeText, analyzeMetadata } from './detectors.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse incoming JSON bodies
app.use(express.json());

// Base health check endpoint
app.get('/', (req, res) => {
    res.json({ status: "Origin-Checker API is operational" });
});

// Primary POST endpoint to handle detection tasks
app.post('/api/check', async (req, res) => {
    try {
        const { textContent, fileData } = req.body;
        const responseData = { success: true, timestamp: new Date() };

        // Execute text detection if text content is supplied
        if (textContent) {
            responseData.textAnalysis = analyzeText(textContent);
        }

        // Execute metadata/origin detection if file data is supplied
        if (fileData) {
            // Assumes fileData is passed as a base64 string or buffer stream
            const buffer = Buffer.from(fileData, 'base64');
            responseData.fileAnalysis = await analyzeMetadata(buffer);
        }

        res.status(200).json(responseData);
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Start listening for incoming network requests
app.listen(PORT, () => {
    console.log(`Server successfully started on port ${PORT}`);
});
