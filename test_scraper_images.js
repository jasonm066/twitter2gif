const getTwitterMedia = require('get-twitter-media');

const URLS = [
    'https://twitter.com/Twitter/status/1334542261563289600', // Single image?
    'https://twitter.com/NASA/status/1666838383827050496', // Multi image?
    'https://x.com/archillect/status/1745167683935961405' // Another one
];

async function test() {
    for (const url of URLS) {
        console.log('Testing:', url);
        try {
            const data = await getTwitterMedia(url);
            if (data.found) {
                console.log('SUCCESS!');
                console.log('Type:', data.type);
                console.log('Media:', JSON.stringify(data.media, null, 2));
                break; // Found one, good enough
            } else {
                console.log('Not found.');
            }
        } catch (e) {
            console.error('Error:', e.message);
        }
    }
}

test();
