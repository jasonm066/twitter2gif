const elements = {
    tweetUrl: document.getElementById('tweetUrl'),
    fetchBtn: document.getElementById('fetchBtn'),
    errorMsg: document.getElementById('errorMsg'),
    videoContainer: document.getElementById('videoContainer'),
    imageContainer: document.getElementById('imageContainer'),
    videoPlayer: document.getElementById('videoPlayer'),
    convertBtn: document.getElementById('convertBtn'),
    previewDownloadBtn: document.getElementById('previewDownloadBtn'),
    previewAudioBtn: document.getElementById('previewAudioBtn'),
    startTime: document.getElementById('startTime'),
    startTimeVal: document.getElementById('startTimeVal'),
    duration: document.getElementById('duration'),
    durationVal: document.getElementById('durationVal'),
    processingOverlay: document.getElementById('processingOverlay'),
    processStatus: document.getElementById('processStatus'),
    progressFill: document.getElementById('progressFill'),
    resultContainer: document.getElementById('resultContainer'),
    gifResult: document.getElementById('gifResult'),
    downloadBtn: document.getElementById('downloadBtn'),
    downloadMp4Btn: document.getElementById('downloadMp4Btn'),
    resetBtn: document.getElementById('resetBtn')
};

// Configuration
const CONFIG = {
    RAPIDAPI_HOST: 'twitter-downloader-download-twitter-videos-gifs-images.p.rapidapi.com',
    CORS_PROXY: 'https://api.allorigins.win/raw?url=', // Use AllOrigins as proxy
    FPS: 10,
    WIDTH: 480
};

// State
let state = {
    videoUrl: null,
    tweetUrl: null,
    currentMedia: null // To store info for history
};

// History State
let history = JSON.parse(localStorage.getItem('tw2gif_history') || '[]');

// Init History on Load
document.addEventListener('DOMContentLoaded', () => {
    updateHistoryUI();
});

// History Functions
function addToHistory(data) {
    // Avoid duplicates (check URL)
    if (history.some(h => h.url === elements.tweetUrl.value)) return;

    const item = {
        id: Date.now(),
        url: elements.tweetUrl.value,
        type: data.type,
        timestamp: new Date().toLocaleDateString(),
        thumbnail: data.type === 'image' ? data.variants[0].url : null // We can't easily get vid thumb without more work, so maybe generic icon or try to capture
    };

    history.unshift(item); // Add to top
    if (history.length > 10) history.pop(); // Keep max 10

    localStorage.setItem('tw2gif_history', JSON.stringify(history));
    updateHistoryUI();
}

function updateHistoryUI() {
    const list = document.getElementById('historyList');
    const section = document.getElementById('historySection');
    const clearBtn = document.getElementById('clearHistoryBtn');

    if (history.length === 0) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');
    list.innerHTML = '';

    history.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.onclick = () => loadHistoryItem(item.url);

        let icon = item.type === 'image' ? '🖼️' : '🎥';

        div.innerHTML = `
            <div class="history-icon">${icon}</div>
            <div class="history-details">
                <span class="history-url">${item.url.split('status/')[1]?.substring(0, 10) || 'Tweet'}...</span>
                <span class="history-date">${item.timestamp}</span>
            </div>
            <div class="history-arrow">→</div>
        `;
        list.appendChild(div);
    });

    clearBtn.onclick = () => {
        history = [];
        localStorage.removeItem('tw2gif_history');
        updateHistoryUI();
    };
}

function loadHistoryItem(url) {
    elements.tweetUrl.value = url;
    fetchVideo();
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Event Listeners
elements.fetchBtn.addEventListener('click', fetchVideo);

elements.startTime.addEventListener('input', (e) => {
    elements.startTimeVal.textContent = e.target.value;
    elements.videoPlayer.currentTime = parseFloat(e.target.value);
});

elements.duration.addEventListener('input', (e) => {
    elements.durationVal.textContent = e.target.value;
});

elements.convertBtn.addEventListener('click', generateGif);

elements.resetBtn.addEventListener('click', () => {
    elements.resultContainer.classList.add('hidden');
    elements.videoContainer.classList.remove('hidden');
});

// Functions
async function fetchVideo() {
    const url = elements.tweetUrl.value;
    if (!url) {
        showError('Please enter a Twitter URL.');
        return;
    }

    setLoading(true);
    hideError();

    try {
        // Call local server
        const response = await fetch('/api/info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Failed to fetch video.');
        }

        const data = await response.json();

        let videoUrl = data.video_url;

        // Reset views
        elements.videoContainer.classList.add('hidden');
        elements.imageContainer.classList.add('hidden');
        elements.imageContainer.innerHTML = '';
        elements.resultContainer.classList.add('hidden');

        if (data.type === 'image') {
            // Handle Images
            elements.imageContainer.classList.remove('hidden');
            renderGallery(data.variants);
            setLoading(false);
            addToHistory(data); // Add to history
            return;
        }

        // Handle Video/GIF
        if (!videoUrl) throw new Error('No video found in this tweet.');

        state.videoUrl = videoUrl;
        addToHistory(data); // Add to history

        // Use local proxy for playback to avoid CORS/Grey screen issues
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(videoUrl)}`;
        elements.videoPlayer.src = proxyUrl;

        // Link Preview Download Btn
        if (elements.previewDownloadBtn) {
            elements.previewDownloadBtn.href = `${proxyUrl}&download=true`;
        }
        if (elements.previewAudioBtn) {
            elements.previewAudioBtn.href = `/api/audio?url=${encodeURIComponent(videoUrl)}`;
        }

        elements.videoPlayer.onloadedmetadata = () => {
            elements.startTime.max = Math.floor(elements.videoPlayer.duration);
            elements.videoContainer.classList.remove('hidden');
            setLoading(false);
        };

        elements.videoPlayer.onerror = () => {
            // If player fails, might be browser privacy.
            // But server conversion should still work if server can download.
            console.warn("Player error, likely CORS or format.");
            setLoading(false);
            elements.videoContainer.classList.remove('hidden');
        };

    } catch (err) {
        console.error(err);
        showError(err.message);
        setLoading(false);
    }
}

async function generateGif() {
    elements.videoContainer.classList.add('hidden');
    elements.processingOverlay.classList.remove('hidden');
    // Fake progress or indeterminate
    elements.processStatus.textContent = "Server is processing...";
    elements.progressFill.style.width = "100%";
    elements.progressFill.classList.add('indeterminate'); // We can add animation for this

    const start = parseFloat(elements.startTime.value);
    const duration = parseFloat(elements.duration.value);

    try {
        const response = await fetch('/api/convert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                videoUrl: state.videoUrl,
                start,
                duration
            })
        });

        if (!response.ok) throw new Error('Conversion failed on server.');

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        elements.gifResult.src = url;
        elements.downloadBtn.href = url;

        // Link MP4 Download
        elements.downloadMp4Btn.href = `/api/proxy?url=${encodeURIComponent(state.videoUrl)}&download=true`;

        elements.processingOverlay.classList.add('hidden');
        elements.resultContainer.classList.remove('hidden');

    } catch (err) {
        showError(err.message);
        elements.processingOverlay.classList.add('hidden');
        elements.videoContainer.classList.remove('hidden');
    }
}

// Helpers
function setLoading(active) {
    if (active) {
        elements.fetchBtn.querySelector('.btn-text').classList.add('hidden');
        elements.fetchBtn.querySelector('.loader').classList.remove('hidden');
        elements.fetchBtn.disabled = true;
    } else {
        elements.fetchBtn.querySelector('.btn-text').classList.remove('hidden');
        elements.fetchBtn.querySelector('.loader').classList.add('hidden');
        elements.fetchBtn.disabled = false;
    }
}

function showError(msg) {
    elements.errorMsg.textContent = msg;
    elements.errorMsg.classList.remove('hidden');
}

function hideError() {
    elements.errorMsg.classList.add('hidden');
}
// Gallery Logic
let currentSlide = 0;
let galleryImages = [];

function renderGallery(images) {
    galleryImages = images;
    currentSlide = 0;
    const container = elements.imageContainer;
    container.innerHTML = '';

    // Main Gallery UI
    const gallery = document.createElement('div');
    gallery.className = 'gallery-container';

    // Track
    const track = document.createElement('div');
    track.className = 'gallery-track';

    // Images
    images.forEach((img, idx) => {
        const slide = document.createElement('div');
        slide.className = 'gallery-slide';
        const image = document.createElement('img');
        image.src = img.url;
        slide.appendChild(image);
        track.appendChild(slide);
    });

    gallery.appendChild(track);

    // Nav Arrows (only if multiple)
    if (images.length > 1) {
        const prevBtn = document.createElement('div');
        prevBtn.className = 'gallery-nav prev';
        prevBtn.innerHTML = '&lt;';
        prevBtn.onclick = () => moveSlide(-1);

        const nextBtn = document.createElement('div');
        nextBtn.className = 'gallery-nav next';
        nextBtn.innerHTML = '&gt;';
        nextBtn.onclick = () => moveSlide(1);

        gallery.appendChild(prevBtn);
        gallery.appendChild(nextBtn);
    }

    // Info Bar
    const infoBar = document.createElement('div');
    infoBar.className = 'gallery-info';

    // Counter
    const counter = document.createElement('div');
    counter.className = 'gallery-counter';
    counter.id = 'galleryCounter';
    counter.textContent = `1 / ${images.length}`;

    // Download Btn
    const dlBtn = document.createElement('a');
    dlBtn.className = 'gallery-download';
    dlBtn.id = 'galleryDownload';
    dlBtn.textContent = 'Download';
    dlBtn.target = '_blank';
    dlBtn.href = images[0].url; // Initial
    dlBtn.download = `twitter_img_0.jpg`;

    infoBar.appendChild(counter);
    infoBar.appendChild(dlBtn);

    // Download All (ZIP) - Only if multiple
    if (images.length > 1) {
        const zipBtn = document.createElement('button');
        zipBtn.className = 'gallery-download'; // Reuse style
        zipBtn.style.marginLeft = '1rem';
        zipBtn.textContent = 'Download All (ZIP)';
        zipBtn.onclick = () => downloadZip(images);
        infoBar.appendChild(zipBtn);
    }

    container.appendChild(gallery);
    container.appendChild(infoBar);
}

async function downloadZip(images) {
    const urls = images.map(img => img.url);
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = 'Zipping...';
    btn.disabled = true;

    try {
        const response = await fetch('/api/zip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls })
        });

        if (!response.ok) throw new Error('Zip creation failed');

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'twitter-media.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

    } catch (e) {
        console.error(e);
        alert('Failed to download ZIP');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

function moveSlide(dir) {
    if (galleryImages.length <= 1) return;

    currentSlide = (currentSlide + dir + galleryImages.length) % galleryImages.length;

    const track = document.querySelector('.gallery-track');
    const counter = document.getElementById('galleryCounter');
    const dlBtn = document.getElementById('galleryDownload');

    // Slide (assuming 100% width)
    track.style.transform = `translateX(-${currentSlide * 100}%)`;

    // Update Info
    counter.textContent = `${currentSlide + 1} / ${galleryImages.length}`;
    dlBtn.href = galleryImages[currentSlide].url;
    dlBtn.download = `twitter_img_${currentSlide}.jpg`;
}
