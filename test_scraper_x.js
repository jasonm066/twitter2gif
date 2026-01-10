const getTwitterMedia = require('get-twitter-media');

const TEST_URL = 'https://x.com/GiFShitpost/status/1994515041694224442';

async function test() {
    console.log('Testing X.com URL:', TEST_URL);
    try {
        const data = await getTwitterMedia(TEST_URL);
        console.log('Result:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error:', e);
    }
}

test();
