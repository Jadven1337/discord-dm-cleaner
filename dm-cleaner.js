const axios = require('axios');
const readline = require('readline');

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    bgRed: '\x1b[41m'
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
function clearScreen() {
    console.clear();
    readline.cursorTo(process.stdout, 0, 0);
    readline.clearScreenDown(process.stdout);
}
function printHeader() {
    console.log(`${colors.bright}${colors.cyan}=========================================${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}          Developer: Jadven${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}=========================================${colors.reset}\n`);
}

class SafePurger {
    constructor(token) {
        this.token = token;
        this.headers = {
            "Authorization": token,
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (Chrome/121.0.0.0 Safari/537.36)"
        };
        this.baseUrl = "https://discord.com/api/v10";
    }

    async verifyToken() {
        try {
            const response = await axios.get(`${this.baseUrl}/users/@me`, { headers: this.headers });
            if (response.status === 200) {
                const data = response.data;
                return {
                    userId: data.id,
                    username: `${data.username}#${data.discriminator || '0000'}`
                };
            }
        } catch (error) {
            return null;
        }
        return null;
    }

    async run(channelId, limit = Infinity) {
        const verification = await this.verifyToken();
        if (!verification) {
            console.log(`${colors.red}[!] token is invalid or expired.${colors.reset}`);
            return;
        }
        const { userId, username } = verification;
        clearScreen();
        printHeader();
        console.log(`${colors.green}Account:${colors.reset} ${colors.bright}${username}${colors.reset} (${userId})`);
        console.log(`${colors.green}Target channel:${colors.reset} ${channelId}`);
        if (isFinite(limit)) {
            console.log(`${colors.green}Mode:${colors.reset} delete exactly ${limit} messages`);
        } else {
            console.log(`${colors.green}Mode:${colors.reset} all messages deleted `);
        }

        let totalSuccess = 0;
        let totalFail = 0;
        let lastWait = 0;
        let lastMsgId = null;
        let shouldStop = false;
        const updateLiveStatus = () => {
            const progressText = isFinite(limit) ? ` | Progress: ${totalSuccess}/${limit} (${Math.round(totalSuccess/limit*100)}%)` : '';
            const line = `${colors.green}Success: ${totalSuccess}${colors.reset} | ${colors.red}Failed: ${totalFail}${colors.reset} | ${colors.yellow}Last wait: ${lastWait.toFixed(2)}s${colors.reset}${progressText}`;
            readline.cursorTo(process.stdout, 0, 7);
            readline.clearLine(process.stdout, 0);
            process.stdout.write(line);
            readline.cursorTo(process.stdout, 0, 8);
        };
        updateLiveStatus();
        while (!shouldStop && totalSuccess < limit) {
            let url = `${this.baseUrl}/channels/${channelId}/messages?limit=100`;
            if (lastMsgId) url += `&before=${lastMsgId}`;

            try {
                const response = await axios.get(url, { headers: this.headers });
                if (response.status === 403) {
                    console.log(`\n${colors.red}[!] No access to this channel.${colors.reset}`);
                    break;
                }
                if (response.status !== 200) {
                    console.log(`\n${colors.red}[!] API Error: ${response.status}${colors.reset}`);
                    break;
                }

                const messages = response.data;
                if (!messages.length) {
                    console.log(`\n${colors.yellow}[+] Reached beginning of channel history.${colors.reset}`);
                    break;
                }

                for (const msg of messages) {
                    if (totalSuccess >= limit) {
                        shouldStop = true;
                        break;
                    }

                    lastMsgId = msg.id;
                    if (msg.author.id === userId) {
                        let deleteSuccess = false;
                        while (!deleteSuccess) {
                            try {
                                const delResponse = await axios.delete(
                                    `${this.baseUrl}/channels/${channelId}/messages/${msg.id}`,
                                    { headers: this.headers }
                                );
                                if (delResponse.status === 204) {
                                    totalSuccess++;
                                    const safeDelay = Math.random() * (2.5 - 1.2) + 1.2;
                                    lastWait = safeDelay;
                                    updateLiveStatus();
                                    await sleep(safeDelay * 1000);
                                    deleteSuccess = true;
                                } else {
                                    totalFail++;
                                    updateLiveStatus();
                                    deleteSuccess = true;
                                }
                            } catch (error) {
                                if (error.response && error.response.status === 429) {
                                    const retryAfter = error.response.data.retry_after || 3;
                                    readline.cursorTo(process.stdout, 0, 9);
                                    console.log(`${colors.red}[!] Rate limit: cooling ${retryAfter}s${colors.reset}`);
                                    await sleep((retryAfter + 0.5) * 1000);
                                    readline.cursorTo(process.stdout, 0, 9);
                                    readline.clearLine(process.stdout, 0);
                                    updateLiveStatus();
                                } else {
                                    totalFail++;
                                    updateLiveStatus();
                                    deleteSuccess = true;
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                console.log(`\n${colors.red}[!] Fetch error: ${error.message}${colors.reset}`);
                break;
            }
        }

        console.log(`\n\n${colors.bright}${colors.green}successfully${colors.reset}`);
        console.log(`${colors.green}Successfully deleted: ${totalSuccess}${colors.reset}`);
        console.log(`${colors.red}Failed: ${totalFail}${colors.reset}`);
        if (totalSuccess > 0) console.log(`${colors.cyan}Average wait: ${(lastWait).toFixed(2)}s (last)${colors.reset}`);
    }
}

function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

async function main() {
    clearScreen();
    printHeader();

    const token = (await askQuestion(`${colors.cyan}Token:${colors.reset} `)).trim();
    if (!token) {
        console.log(`${colors.red}[!] Token cannot be empty.${colors.reset}`);
        return;
    }

    console.log(`\n${colors.cyan}Select Operation Mode:${colors.reset}`);
    console.log("  [1] delete a specific number of messages");
    console.log("  [2] delete all messages");

    const choice = (await askQuestion(`\n${colors.cyan}Choice (1 or 2):${colors.reset} `)).trim();
    if (choice !== '1' && choice !== '2') {
        console.log(`${colors.red}[!] Invalid choice.${colors.reset}`);
        return;
    }

    let limit = Infinity;
    if (choice === '1') {
        const limitInput = await askQuestion(`${colors.cyan}How many messages to delete?${colors.reset} `);
        const parsed = parseInt(limitInput);
        if (isNaN(parsed) || parsed <= 0) {
            console.log(`${colors.red}[!] enter a positive number.${colors.reset}`);
            return;
        }
        limit = parsed;
    }

    const channel = (await askQuestion(`${colors.cyan} Channel ID:${colors.reset} `)).trim();
    if (!channel) {
        console.log(`${colors.red}[!] Channel ID${colors.reset}`);
        return;
    }

    console.log(`\n${colors.green}starting purge...${colors.reset}\n`);
    const purger = new SafePurger(token);
    await purger.run(channel, limit);
}

main().catch(err => {
    console.error(`${colors.red}Fatal error:${colors.reset}`, err);
    process.exit(1);
});