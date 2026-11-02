import express from 'express';
import { analyzeText, analyzeMetadata } from './detectors.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Origin-Checker Dashboard</title>
            <style>
                :root {
                    --bg-main: #0f172a;
                    --bg-card: #1e293b;
                    --accent: #38bdf8;
                    --text: #f8fafc;
                    --text-muted: #94a3b8;
                    --success: #10b981;
                }
                body { 
                    font-family: system-ui, -apple-system, sans-serif; 
                    max-width: 700px; 
                    margin: 0 auto; 
                    padding: 40px 20px; 
                    background: var(--bg-main); 
                    color: var(--text); 
                }
                h1 { text-align: center; font-size: 2.5rem; margin-bottom: 5px; color: var(--text); }
                .status-badge { text-align: center; color: var(--success); font-size: 0.9rem; margin-bottom: 30px; font-weight: 500; }
                .card { background: var(--bg-card); padding: 30px; border-radius: 16px; margin-bottom: 25px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3); border: 1px solid #334155; }
                label { display: block; margin-bottom: 8px; font-weight: 600; color: var(--text-muted); font-size: 0.95rem; }
                textarea, input[type="file"] { width: 100%; padding: 12px; background: #0f172a; border: 1px solid #334155; border-radius: 8px; color: #fff; box-sizing: border-box; font-size: 1rem; }
                textarea { height: 100px; resize: vertical; margin-bottom: 20px; }
                button { width: 100%; padding: 14px; background: var(--accent); border: none; border-radius: 8px; color: #0f172a; font-weight: bold; font-size: 1.1rem; cursor: pointer; transition: all 0.2s; }
                button:hover { background: #7dd3fc; transform: translateY(-1px); }
                
                /* Results UI Styling */
                .results-title { font-size: 1.3rem; font-weight: 700; border-bottom: 2px solid #334155; padding-bottom: 10px; margin-bottom: 20px; color: var(--accent); }
                .result-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #334155; font-size: 1.05rem; }
                .result-row:last-child { border-bottom: none; }
                .label-name { color: var(--text-muted); }
                .value-data { font-weight: 600; }
                .badge { padding: 4px 10px; border-radius: 9999px; font-size: 0.85rem; font-weight: 700; text-transform: uppercase; }
                .badge-blue { background: rgba(56, 189, 248, 0.2); color: #38bdf8; }
                .badge-orange { background: rgba(249, 115, 22, 0.2); color: #f97316; }
                
                .placeholder-text { text-align: center; color: var(--text-muted); padding: 20px 0; font-style: italic; }
                .loading { text-align: center; color: var(--accent); font-weight: 600; padding: 20px 0; }
            </style>
        </head>
        <body>
            <h1>Origin-Checker</h1>
            <div class="status-badge">● System Fully Operational</div>

            <div class="card">
                <label for="textInput">Analyze Written Text</label>
                <textarea id="textInput" placeholder="Paste copy or articles here to scan..."></textarea>
                
                <label for="fileInput">Analyze Image / File Origin</label>
                <input type="file" id="fileInput">
                
                <button style="margin-top: 25px;" onclick="runCheck()">Run Analysis Scanner</button>
            </div>

            <div class="card">
                <div class="results-title">Analysis Metrics Report</div>
                <div id="outputContainer">
                    <div class="placeholder-text">Submit assets above to generate report metrics.</div>
                </div>
            </div>

            <script>
                async function runCheck() {
                    const container = document.getElementById('outputContainer');
                    const textContent = document.getElementById('textInput').value;
                    const fileInput = document.getElementById('fileInput');
                    
                    container.innerHTML = '<div class="loading">Running Deep Scan Diagnostics...</div>';
                    
                    let fileData = null;
                    if (fileInput.files.length > 0) {
                        const file = fileInput.files[0];
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
                        
                        if(!data.success) {
                            container.innerHTML = '<div style="color: #ef4444;">Scanner Error: ' + data.error + '</div>';
                            return;
                        }

                        let htmlContent = '';

                        // Render Image Results cleanly if available
                        if(data.fileAnalysis) {
                            const fa = data.fileAnalysis;
                            htmlContent += '<h3>📷 File Infrastructure Report</h3>';
                            htmlContent += '<div class="result-row"><span class="label-name">Source Identity</span><span class="value-data badge badge-blue">' + fa.possibleOrigin + '</span></div>';
                            htmlContent += '<div class="result-row"><span class="label-name">Software Signature</span><span class="value-data">' + fa.softwareUsed + '</span></div>';
                            htmlContent += '<div class="result-row"><span class="label-name">Hardware Metadata Embedded</span><span class="value-data">' + (fa.hasCameraMetadata ? '✅ Yes' : '❌ None Found') + '</span></div>';
                        }

                        // Render Text Results cleanly if available
                        if(data.textAnalysis) {
                            const ta = data.textAnalysis;
                            htmlContent += '<h3 style="margin-top:25px;">✍️ Linguistic Pattern Analysis</h3>';
                            htmlContent += '<div class="result-row"><span class="label-name">AI Text Probability</span><span class="value-data badge badge-orange">' + (ta.confidence * 100) + '% Match</span></div>';
                            htmlContent += '<div class="result-row"><span class="label-name">Structural AI Verbiage Flagged</span><span class="value-data">' + (ta.detected ? '⚠️ Suspicious' : '✅ Clear') + '</span></div>';
                            if(ta.matches && ta.matches.length > 0) {
                                htmlContent += '<div class="result-row"><span class="label-name">Flagged Phrases</span><span class="value-data">' + ta.matches.join(', ') + '</span></div>';
                            }
                        }

                        if(!data.fileAnalysis && !data.textAnalysis) {
                            htmlContent = '<div class="placeholder-text">No input provided for analysis. Please fill a field.</div>';
                        }

                        container.innerHTML = htmlContent;

                    } catch (err) {
                        container.innerHTML = '<div style="color: #ef4444;">Network Error: ' + err.message + '</div>';
                    }
                }
            </script>
        </body>
        </html>
    `);
});

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
