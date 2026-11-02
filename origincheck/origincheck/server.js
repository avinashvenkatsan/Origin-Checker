import express from 'express';
import { analyzeText, analyzeMetadata } from './detectors.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Increase request size limits to handle image uploads
app.use(express.json({ limit: '50mb' }));

// Serves the simple dashboard website
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Origin-Checker Dashboard</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; background: #121212; color: #e0e0e0; }
                h1 { color: #00ffd5; text-align: center; }
                .card { background: #1e1e1e; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
                label { display: block; margin-bottom: 8px; font-weight: bold; color: #aaa; }
                textarea, input[type="file"] { width: 100%; padding: 10px; background: #2d2d2d; border: 1px solid #444; border-radius: 4px; color: #fff; box-sizing: border-box; }
                textarea { height: 80px; resize: vertical; }
                button { width: 100%; padding: 12px; background: #00ffd5; border: none; border-radius: 4px; color: #121212; font-weight: bold; font-size: 16px; cursor: pointer; margin-top: 10px; transition: background 0.2s; }
                button:hover { background: #00ccaa; }
                pre { background: #0a0a0a; padding: 15px; border-radius: 4px; border: 1px solid #333; overflow-x: auto; color: #00ff66; font-family: monospace; max-height: 250px; }
                .status { text-align: center; color: #888; font-size: 14px; margin-bottom: 20px; }
            </style>
        </head>
        <body>
            <h1>Origin-Checker</h1>
            <div class="status">● System Operational</div>

            <div class="card">
                <label for="textInput">Test Text Detector</label>
                <textarea id="textInput" placeholder="Paste some text here to check for AI patterns..."></textarea>
                
                <label style="margin-top: 15px;" for="fileInput">Test File / Image Detector</label>
                <input type="file" id="fileInput">
                
                <button onclick="runCheck()">Run Analysis</button>
            </div>

            <div class="card">
                <label>Analysis Results</label>
                <pre id="output">Results will appear here...</pre>
            </div>

            <script>
                async function runCheck() {
                    const output = document.getElementById('output');
                    const textContent = document.getElementById('textInput').value;
                    const fileInput = document.getElementById('fileInput');
                    
                    output.innerText = "Analyzing...";
                    
                    let fileData = null;
                    if (fileInput.files.length > 0) {
                        const file = fileInput.files[0];
                        // Convert file to base64 string for transmission
                        fileData = await new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result.split(',')[1]);
                            reader.readAsDataURL(file);
                        });
                    }

                    try {
                        const response = await fetch('/api/check', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ textContent, fileData })
                        });
                        const data = await response.json();
                        output.innerText = JSON.stringify(data, null, 2);
                    } catch (err) {
                        output.innerText = "Error: " + err.message;
                    }
                }
            </script>
        </body>
        </html>
    `);
});

// Primary POST endpoint to handle detection tasks
app.post('/api/check', async (req, res) => {
    try {
        const { textContent, fileData } = req.body;
        const responseData = { success: true, timestamp: new Date() };

        if (textContent) {
            responseData.textAnalysis = analyzeText(textContent);
        }

        if (fileData) {
            const buffer = Buffer.from(fileData, 'base64');
            responseData.fileAnalysis = await analyzeMetadata(buffer);
        }

        res.status(200).json(responseData);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server successfully started on port ${PORT}`);
});
