const getTwitterMedia = require('get-twitter-media');

// A tweet with a GIF (actually an MP4)
const TEST_URL = 'https://twitter.com/TwitterDev/status/1460323737035677698';

async function test() {
    console.log('Testing GIF URL:', TEST_URL);
    try {
        const data = await getTwitterMedia(TEST_URL);
        console.log('Type:', data.type);
        console.log('Found:', data.found);
        console.log('Media:', JSON.stringify(data.media, null, 2));
    } catch (e) {
        console.error('Error:', e);
    }
}

test();
