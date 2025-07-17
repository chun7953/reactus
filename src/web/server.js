import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

export function startServer() {
    const publicPath = path.resolve(__dirname, '..', '..', 'public');
    app.use(express.static(publicPath));
    
    const htmlPath = path.resolve(__dirname, '..', '..', 'public', 'index.html');
    app.get('/', (req, res) => {
        res.sendFile(htmlPath);
    });

    app.get('/interactions', async (req, res) => {
        const { code } = req.query;
        if (code) {
            res.send('Reactus bot is running. This window can be closed.');
        } else {
            res.status(400).send('This endpoint is for Discord interactions.');
        }
    });

    app.listen(config.web.port, () => {
        console.log(`Server is running on http://localhost:${config.web.port}`);
    }).on('error', (error) => {
        console.error('Error starting server:', error);
    });
}