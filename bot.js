const express = require('express');
const ccxt = require('ccxt');
const colors = require('colors');

// --- 1. HEARTBEAT SERVER (For Render Hosting) ---
// This tricks the cloud server into thinking this is a website so it stays awake.
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send(`
        <h1>Trading Bot Active 🟢</h1>
        <p>Portfolio Balance: $${virtualWallet.balance.toFixed(2)}</p>
        <p>Active Positions: ${Object.keys(activePositions).length}</p>
    `);
});

app.listen(port, () => {
    console.log(`Heartbeat Server running on port ${port}`);
});

// --- 2. CONFIGURATION ---
const PAIRS = [
    ['ETH/USDT', 'BTC/USDT'],   // 1. The King & Queen
    ['BNB/USDT', 'BTC/USDT'],   // 2. Exchange vs Market
    ['SOL/USDT', 'ETH/USDT'],   // 3. L1 Competitors
    ['AVAX/USDT', 'SOL/USDT'],  // 4. High Speed L1s
    ['MATIC/USDT', 'ETH/USDT'], // 5. L2 vs L1
    ['ADA/USDT', 'XRP/USDT'],   // 6. Legacy Alts
    ['DOGE/USDT', 'SHIB/USDT'], // 7. Meme Coins
    ['LTC/USDT', 'BCH/USDT'],   // 8. Old School POW
    ['ATOM/USDT', 'DOT/USDT'],  // 9. Interoperability
    ['LINK/USDT', 'ETH/USDT']   // 10. Oracle vs Chain
];

const CONFIG = {
    capitalPerPair: 25.0,  // Allocate $25 per pair
    entryZ: 2.0,           // Enter trade at 2.0 Std Dev
    exitZ: 0.0,            // Exit trade at Mean (0.0)
    stopLossZ: 4.0         // Emergency exit
};

// --- 3. VIRTUAL PORTFOLIO STATE ---
let virtualWallet = {
    balance: 250.00,       // Starting Capital
    locked: 0.00           // Capital currently in trades
};

// Tracks active trades: { 'ETH/BTC': { type: 'SHORT_SPREAD', entryPrices: ... } }
let activePositions = {}; 

// --- 4. MATH ENGINE (KALMAN FILTER) ---
class KalmanFilter {
    constructor(delta = 1e-4, R = 1e-3) {
        this.x = 0; // Slope (Beta)
        this.P = 1; // Covariance
        this.Q = delta;
        this.R = R;
    }

    update(priceX, priceY) {
        this.P = this.P + this.Q;
        const prediction = this.x * priceX;
        const error = priceY - prediction;
        const S = (this.P * priceX * priceX) + this.R;
        const K = (this.P * priceX) / S;
        this.x = this.x + (K * error);
        this.P = (1 - K * priceX) * this.P;
        return { error, stdDev: Math.sqrt(S) };
    }
}

// --- 5. EXECUTION ENGINE ---
async function runPair(exchange, symbolY, symbolX) {
    const kf = new KalmanFilter();
    const pairName = `${symbolY}-${symbolX}`; // e.g. "ETH/USDT-BTC/USDT"
    const logPrefix = `[${symbolY.split('/')[0]}/${symbolX.split('/')[0]}]`.cyan;
    
    // Warmup: Fetch history to train the filter instantly
    try {
        console.log(`${logPrefix} Fetching history to warm up math model...`.gray);
        const [histY, histX] = await Promise.all([
            exchange.fetchOHLCV(symbolY, '1h', undefined, 50),
            exchange.fetchOHLCV(symbolX, '1h', undefined, 50)
        ]);
        
        // Train filter on past 50 hours
        for (let i = 0; i < Math.min(histY.length, histX.length); i++) {
            kf.update(histX[i][4], histY[i][4]); // Close price is index 4
        }
        console.log(`${logPrefix} Ready. Beta: ${kf.x.toFixed(4)}`.green);
    } catch (e) {
        console.log(`${logPrefix} Warmup Failed: ${e.message}`.red);
    }

    // Infinite Real-Time Loop
    while (true) {
        try {
            // 1. Fetch Live Prices Parallelly
            const [tickerY, tickerX] = await Promise.all([
                exchange.fetchTicker(symbolY),
                exchange.fetchTicker(symbolX)
            ]);
            const py = tickerY.last;
            const px = tickerX.last;

            // 2. Math Update
            const { error, stdDev } = kf.update(px, py);
            const zScore = error / stdDev;

            // 3. Logic & Virtual Execution
            const pos = activePositions[pairName];
            
            // LOGIC A: NO POSITION -> CHECK ENTRY
            if (!pos) {
                // Check if we have funds ($25 free)
                if (virtualWallet.balance - virtualWallet.locked >= CONFIG.capitalPerPair) {
                    
                    if (zScore > CONFIG.entryZ) {
                        // SELL Y / BUY X
                        enterVirtualTrade(pairName, 'SHORT_SPREAD', py, px);
                    } else if (zScore < -CONFIG.entryZ) {
                        // BUY Y / SELL X
                        enterVirtualTrade(pairName, 'LONG_SPREAD', py, px);
                    }
                }
            } 
            // LOGIC B: IN POSITION -> CHECK EXIT
            else {
                // Stop Loss
                if (Math.abs(zScore) > CONFIG.stopLossZ) {
                    exitVirtualTrade(pairName, py, px, "STOP LOSS");
                }
                // Take Profit (Mean Reversion)
                else if (pos.type === 'SHORT_SPREAD' && zScore <= CONFIG.exitZ) {
                    exitVirtualTrade(pairName, py, px, "PROFIT");
                } 
                else if (pos.type === 'LONG_SPREAD' && zScore >= -CONFIG.exitZ) {
                    exitVirtualTrade(pairName, py, px, "PROFIT");
                }
            }

            // Periodic Log (Only log significant Z-scores to keep console clean)
            if (Math.abs(zScore) > 1.5 || pos) {
                 console.log(`${logPrefix} Z: ${zScore.toFixed(2)} | Beta: ${kf.x.toFixed(3)} | $${virtualWallet.balance.toFixed(2)}`);
            }

        } catch (e) {
            console.log(`${logPrefix} Error: ${e.message}`.red);
        }

        // Wait 10 seconds before next tick
        await new Promise(r => setTimeout(r, 10000));
    }
}

// --- HELPER: VIRTUAL TRADE LOGIC ---
function enterVirtualTrade(pairName, type, py, px) {
    const size = CONFIG.capitalPerPair / 2; // $12.50 per leg
    
    // Store trade details
    activePositions[pairName] = {
        type: type,
        entryY: py,
        entryX: px,
        qtyY: size / py,
        qtyX: size / px,
        startTime: new Date()
    };
    
    virtualWallet.locked += CONFIG.capitalPerPair;
    
    console.log(`\n>>> OPEN TRADE [${pairName}] <<<`.yellow.bold);
    console.log(`    Type: ${type}`);
    console.log(`    Price Y: ${py} | Price X: ${px}`);
    console.log(`    Allocated: $${CONFIG.capitalPerPair}\n`);
}

function exitVirtualTrade(pairName, currentY, currentX, reason) {
    const pos = activePositions[pairName];
    
    // Calculate PnL
    // Long PnL = (Exit - Entry) * Qty
    // Short PnL = (Entry - Exit) * Qty
    let pnlY = 0, pnlX = 0;

    if (pos.type === 'SHORT_SPREAD') {
        // We Shorted Y (Entry - Exit) and Longed X (Exit - Entry)
        pnlY = (pos.entryY - currentY) * pos.qtyY;
        pnlX = (currentX - pos.entryX) * pos.qtyX;
    } else {
        // We Longed Y (Exit - Entry) and Shorted X (Entry - Exit)
        pnlY = (currentY - pos.entryY) * pos.qtyY;
        pnlX = (pos.entryX - currentX) * pos.qtyX;
    }

    const totalPnL = pnlY + pnlX;
    
    // Update Wallet
    virtualWallet.locked -= CONFIG.capitalPerPair;
    virtualWallet.balance += totalPnL;
    
    delete activePositions[pairName];

    const color = totalPnL > 0 ? 'green' : 'red';
    console.log(`\n<<< CLOSE TRADE [${pairName}] (${reason}) >>>`[color].bold);
    console.log(`    PnL: $${totalPnL.toFixed(4)}`);
    console.log(`    New Balance: $${virtualWallet.balance.toFixed(2)}\n`);
}

// --- MAIN LAUNCHER ---
async function main() {
    console.log("--- VIRTUAL TRADING BOT INITIALIZED ---".rainbow);
    console.log(`Pairs: ${PAIRS.length} | Capital: $${virtualWallet.balance}`);
    
    const exchange = new ccxt.binance();

    // Start all 10 pairs
    PAIRS.forEach(pair => {
        runPair(exchange, pair[0], pair[1]);
    });
}

main();