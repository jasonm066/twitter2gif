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
const fs = require('fs');
const path = require('path');
const os = require('os');

// 3. Convert Endpoint
// 3. Convert Endpoint
app.post('/api/convert', async (req, res) => {
    const { videoUrl, start, duration } = req.body;

    if (!videoUrl) {
        return res.status(400).json({ error: 'Video URL is required' });
    }

    const startTime = parseFloat(start) || 0;
    const dur = parseFloat(duration) || 3;

    console.log(`Starting conversion: ${startTime}s for ${dur}s`);

    // Paths
    const id = Date.now() + '_' + Math.random().toString(36).substring(7);
    const inputTemp = path.join(os.tmpdir(), `input_${id}.mp4`);
    const outputTemp = path.join(os.tmpdir(), `output_${id}.gif`);

    try {
        // 1. Download Video First
        console.log('Downloading video...', videoUrl);
        const writer = fs.createWriteStream(inputTemp);
        const response = await axios({
            url: videoUrl,
            method: 'GET',
            responseType: 'stream'
        });

        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        console.log('Video downloaded to:', inputTemp);

        // 2. Convert Local File
        await new Promise((resolve, reject) => {
            const command = ffmpeg(inputTemp)
                .setStartTime(startTime)
                .setDuration(dur);

            // Quality Presets
            const quality = req.body.quality || 'balanced';

            if (quality === 'high') {
                // High Quality: Generate palette first
                // [0:v] fps=15,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse
                command.complexFilter([
                    'fps=15,scale=480:-1:flags=lanczos[x]',
                    '[x]split[x1][x2]',
                    '[x1]palettegen[p]',
                    '[x2][p]paletteuse'
                ]);
            } else if (quality === 'retro') {
                // Retro: Low FPS, smaller, dithered
                command.fps(10)
                    .complexFilter('scale=320:-1:flags=neighbor,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5');
            } else {
                // Balanced (Default) - Fast
                command.fps(15)
                    .outputOptions(['-vf', 'scale=480:-1']);
            }

            command
                .format('gif')
                .save(outputTemp)
                .on('start', (cmd) => console.log('FFMPEG Started:', cmd))
                .on('error', (err) => {
                    console.error('FFMPEG Error:', err);
                    reject(err);
                })
                .on('end', () => {
                    console.log('FFMPEG Finished');
                    resolve();
                });
        });

        // 3. Send
        res.download(outputTemp, 'twitter-convert.gif', (err) => {
            if (err) console.error('Download Error:', err);
            // Cleanup
            cleanup([inputTemp, outputTemp]);
        });

    } catch (error) {
        console.error('Conversion Failed:', error);
        cleanup([inputTemp, outputTemp]);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Server Error', details: error.message });
        }
    }

    function cleanup(files) {
        files.forEach(f => {
            if (fs.existsSync(f)) fs.unlink(f, () => { });
        });
    }
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

// 5. Audio Extraction Endpoint
app.get('/api/audio', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('URL required');

    const id = Date.now() + '_' + Math.random().toString(36).substring(7);
    const id2 = id + '_audio'; // Avoid collision
    const inputTemp = path.join(os.tmpdir(), `input_${id}.mp4`);
    // Note: If using ffmpeg to convert to mp3, we'll save as mp3
    const outputTemp = path.join(os.tmpdir(), `output_${id2}.mp3`);

    console.log(`Extracting Audio for: ${url}`);

    try {
        // 1. Download Video
        const writer = fs.createWriteStream(inputTemp);
        const response = await axios({
            url: url,
            method: 'GET',
            responseType: 'stream'
        });
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        // 2. Extract Audio
        await new Promise((resolve, reject) => {
            ffmpeg(inputTemp)
                .outputOptions('-vn') // No video
                .audioCodec('libmp3lame') // Convert to MP3
                .format('mp3')
                .save(outputTemp)
                .on('error', reject)
                .on('end', resolve);
        });

        // 3. Send
        res.download(outputTemp, 'twitter-audio.mp3', (err) => {
            if (err) console.error('Audio Download Error:', err);
            // Cleanup
            if (fs.existsSync(inputTemp)) fs.unlink(inputTemp, () => { });
            if (fs.existsSync(outputTemp)) fs.unlink(outputTemp, () => { });
        });

    } catch (error) {
        console.error('Audio Extraction Failed:', error);
        if (fs.existsSync(inputTemp)) fs.unlink(inputTemp, () => { });
        if (fs.existsSync(outputTemp)) fs.unlink(outputTemp, () => { });
        res.status(500).send('Audio extraction failed');
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
