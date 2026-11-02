const fs = require('fs');
const readline = require('readline');

async function search() {
    const fileStream = fs.createReadStream('C:/Users/choi/.gemini/antigravity/brain/94655216-4479-44b1-91d4-7e8b3bf76c81/.system_generated/logs/transcript_full.jsonl');
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
        if (line.includes('PickBomb2.png') && line.includes('USER_INPUT')) {
            console.log(line.slice(0, 500));
        }
    }
}
search();

