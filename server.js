const express = require('express');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const getTwitterMedia = require('get-twitter-media');
const axios = require('axios'); // Still might need for streaming if not provided by lib
const app = express();
const PORT = 3000;

// Configure FFMPEG
ffmpeg.setFfmpegPath(ffmpegPath);

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 1. Fetch Video Info Endpoint (No API Key needed)
app.post('/api/info', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        // Attempt to fetch using the scraper lib
        const data = await getTwitterMedia(url);

        // Normalize response for frontend
        if (data.found && (data.type === 'video' || data.type === 'gif' || data.type === 'image')) {
            // Debug log
            console.log('Media found:', data.type, data.media);

            // Library returns .media array
            const variants = data.media || [];

            if (variants.length > 0) {
                res.json({
                    found: true,
                    type: data.type, // Pass type to frontend
                    video_url: variants[0].url, // formatting for video player
                    variants: variants // All media items
                });
            } else {
                res.status(404).json({ error: 'Media empty' });
            }
        } else {
            res.status(404).json({ error: 'No media found' });
        }

    } catch (error) {
        console.error('Info Fetch Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch video info. Tweet might be private or deleted.' });
    }
});

// 2. Proxy Video Endpoint (Fixes Preview CORS issues)
app.get('/api/proxy', async (req, res) => {
    const { url, download } = req.query;
    if (!url) return res.status(400).send('URL required');

    try {
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream'
        });

        // Forward headers roughly
        res.setHeader('Content-Type', response.headers['content-type']);

        if (download === 'true') {
            const ext = response.headers['content-type'].includes('mp4') ? 'mp4' : 'bin';
            res.setHeader('Content-Disposition', `attachment; filename="twitter_video.${ext}"`);
        }

        response.data.pipe(res);
    } catch (error) {
        console.error('Proxy Error:', error.message);
        res.status(500).end();
    }
});

// 3. Convert Endpoint
app.post('/api/convert', async (req, res) => {
    const { videoUrl, start, duration } = req.body;

    if (!videoUrl) {
        return res.status(400).json({ error: 'Video URL is required' });
    }

    const startTime = parseFloat(start) || 0;
    const dur = parseFloat(duration) || 3;

    console.log(`Starting conversion: ${startTime}s for ${dur}s`);

    // Set headers for file download
    res.header('Content-Type', 'image/gif');
    res.header('Content-Disposition', 'attachment; filename="twitter-convert.gif"');

    // Stream the video from URL directly into FFMPEG
    // FFMPEG can accept HTTP URLs as input
    ffmpeg(videoUrl)
        .setStartTime(startTime)
        .setDuration(dur)
        .fps(15) // Higher FPS than client-side
        .outputOptions([
            '-vf', 'scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse' // Scale + High quality palette
        ])
        .format('gif')
        .on('start', (cmd) => {
            console.log('FFMPEG Started:', cmd);
        })
        .on('error', (err) => {
            console.error('FFMPEG Error:', err);
            if (!res.headersSent) {
                res.status(500).end();
            }
        })
        .on('end', () => {
            console.log('FFMPEG Finished');
        })
        .pipe(res, { end: true });
});

// 4. ZIP Download Endpoint
const archiver = require('archiver');

app.post('/api/zip', async (req, res) => {
    const { urls } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ error: 'List of URLs is required' });
    }

    res.header('Content-Type', 'application/zip');
    res.header('Content-Disposition', 'attachment; filename="twitter-media.zip"');

    const archive = archiver('zip', {
        zlib: { level: 9 } // Sets the compression level.
    });

    archive.on('error', (err) => {
        console.error('Archive Error:', err);
        res.status(500).end();
    });

    archive.pipe(res);

    // Fetch and append each file
    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        try {
            const response = await axios({
                method: 'get',
                url: url,
                responseType: 'stream'
            });

            // Name the file
            const name = `image_${i + 1}.jpg`;
            archive.append(response.data, { name: name });
        } catch (e) {
            console.error(`Failed to zip file ${url}:`, e.message);
            // Continue best effort? Or fail? Let's continue.
        }
    }

    archive.finalize();
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
