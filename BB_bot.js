const express = require('express');
const ccxt = require('ccxt');
const colors = require('colors');

// --- 1. CONFIGURATION: THE "CENTURION" LIST ---
const PAIRS = [
    // TIER 1: MAJORS
    ['BTC/USDT', 'USDT'], ['ETH/USDT', 'USDT'], ['BNB/USDT', 'USDT'], ['SOL/USDT', 'USDT'], ['XRP/USDT', 'USDT'],
    ['ADA/USDT', 'USDT'], ['DOGE/USDT', 'USDT'], ['AVAX/USDT', 'USDT'], ['TRX/USDT', 'USDT'], ['DOT/USDT', 'USDT'],
    ['MATIC/USDT', 'USDT'], ['LTC/USDT', 'USDT'], ['BCH/USDT', 'USDT'], ['LINK/USDT', 'USDT'], ['XLM/USDT', 'USDT'],
    
    // TIER 2: HIGH VOLATILITY
    ['SHIB/USDT', 'USDT'], ['PEPE/USDT', 'USDT'], ['FLOKI/USDT', 'USDT'], ['BONK/USDT', 'USDT'], ['WIF/USDT', 'USDT'],
    ['APT/USDT', 'USDT'], ['ARB/USDT', 'USDT'], ['OP/USDT', 'USDT'], ['RNDR/USDT', 'USDT'], ['INJ/USDT', 'USDT'],
    ['STX/USDT', 'USDT'], ['IMX/USDT', 'USDT'], ['GRT/USDT', 'USDT'], ['LDO/USDT', 'USDT'], ['QNT/USDT', 'USDT'],
    
    // TIER 3: DEFI & ALTS
    ['CRV/USDT', 'USDT'], ['CVX/USDT', 'USDT'], ['COMP/USDT', 'USDT'], ['DYDX/USDT', 'USDT'], ['GMX/USDT', 'USDT'],
    ['JUP/USDT', 'USDT'], ['PYTH/USDT', 'USDT'], ['TIA/USDT', 'USDT'], ['SEI/USDT', 'USDT'], ['SUI/USDT', 'USDT'],
    ['FET/USDT', 'USDT'], ['AGIX/USDT', 'USDT'], ['OCEAN/USDT', 'USDT'], ['GALA/USDT', 'USDT'], ['APE/USDT', 'USDT'],
    ['RUNE/USDT', 'USDT'], ['EGLD/USDT', 'USDT'], ['FXS/USDT', 'USDT'], ['KLAY/USDT', 'USDT'], ['1INCH/USDT', 'USDT'],
    
    // FILLING TO 100+
    ['ATOM/USDT', 'USDT'], ['UNI/USDT', 'USDT'], ['ETC/USDT', 'USDT'], ['FIL/USDT', 'USDT'], ['NEAR/USDT', 'USDT'],
    ['VET/USDT', 'USDT'], ['MKR/USDT', 'USDT'], ['AAVE/USDT', 'USDT'], ['SNX/USDT', 'USDT'], ['ALGO/USDT', 'USDT'],
    ['AXS/USDT', 'USDT'], ['SAND/USDT', 'USDT'], ['MANA/USDT', 'USDT'], ['EOS/USDT', 'USDT'], ['THETA/USDT', 'USDT'],
    ['MEME/USDT', 'USDT'], ['ORDI/USDT', 'USDT'], ['SATS/USDT', 'USDT'], ['BOME/USDT', 'USDT'], ['DOGS/USDT', 'USDT'],
    ['ILV/USDT', 'USDT'], ['GMT/USDT', 'USDT'], ['ENJ/USDT', 'USDT'], ['MAGIC/USDT', 'USDT'], ['PIXEL/USDT', 'USDT'],
    ['BLUR/USDT', 'USDT'], ['ENS/USDT', 'USDT'], ['MINA/USDT', 'USDT'], ['FLOW/USDT', 'USDT'], ['CHZ/USDT', 'USDT'],
    ['KAS/USDT', 'USDT'], ['BSV/USDT', 'USDT'], ['ZEC/USDT', 'USDT'], ['DASH/USDT', 'USDT'], ['NEO/USDT', 'USDT'],
    ['QTUM/USDT', 'USDT'], ['IOTA/USDT', 'USDT'], ['XMR/USDT', 'USDT'], ['XTZ/USDT', 'USDT'], ['KAVA/USDT', 'USDT'],
    ['CAKE/USDT', 'USDT'], ['ROSE/USDT', 'USDT'], ['MASK/USDT', 'USDT'], ['JASMY/USDT', 'USDT'], ['WLD/USDT', 'USDT'],
    ['TWT/USDT', 'USDT'], ['LUNC/USDT', 'USDT'], ['USTC/USDT', 'USDT'], ['GAS/USDT', 'USDT'], ['TRB/USDT', 'USDT']
];

const STRATEGY = {
    timeframe: '5m',
    period: 20,          // SMA 20
    stdDev: 2.0,         // Width 2.0
    shift: 10,           // Shift 10
    
    // --- NEW PORTFOLIO SETTINGS ---
    margin: 2.50,        // Cost per trade ($2.50)
    leverage: 10,        // 10x Leverage
    // Position Size = Margin * Leverage = $25.00
    
    useTrendFilter: true,
    takeProfitPct: 0.05, // 5% Move
    stopLossPct: 0.025   // 2.5% Move
};

// --- 2. STATE ---
let marketState = {}; 
// NEW: Wallet starts at $100
let virtualWallet = { balance: 100.00, locked: 0.00 };
let activePositions = {}; 
let lastProcessedCandle = {}; 

// --- 3. DASHBOARD (Updated for Manual Close) ---
const app = express();
const port = process.env.PORT || 3000;

// Helper to handle Manual Close requests
app.use(express.urlencoded({ extended: true })); // Parse POST forms

app.post('/close/:symbol', (req, res) => {
    // Note: Symbol comes in encoded, e.g. BTC%2FUSDT. We decode it.
    const symbol = decodeURIComponent(req.params.symbol);
    const data = marketState[symbol];
    
    if (activePositions[symbol] && data) {
        // Force close using the live price from marketState
        // We assume 'data.livePrice' is updated by the loop
        closeTrade(symbol, data.livePrice || data.close, 'MANUAL CLOSE');
    }
    res.redirect('/');
});

app.get('/', (req, res) => {
    // Sort logic
    const sortedPairs = Object.keys(marketState).sort((a, b) => {
        if (activePositions[a] && !activePositions[b]) return -1;
        if (!activePositions[a] && activePositions[b]) return 1;
        
        const dataA = marketState[a];
        const dataB = marketState[b];
        const nearA = (dataA.lastHigh > dataA.upper || dataA.lastLow < dataA.lower);
        const nearB = (dataB.lastHigh > dataB.upper || dataB.lastLow < dataB.lower);
        
        if (nearA && !nearB) return -1;
        if (!nearA && nearB) return 1;
        
        return a.localeCompare(b);
    });

    let tableRows = sortedPairs.map(pair => {
        const data = marketState[pair];
        const pos = activePositions[pair];
        
        let statusHtml = '<span style="color:#ccc">WAITING</span>';
        let rowStyle = '';
        let actionHtml = '';

        if (pos) {
            let pnlPct = 0;
            // PnL Calculation based on live price
            const currentPrice = data.livePrice || data.close;
            if (pos.type === 'LONG') pnlPct = (currentPrice - pos.entryPrice) / pos.entryPrice * 100 * STRATEGY.leverage;
            else pnlPct = (pos.entryPrice - currentPrice) / pos.entryPrice * 100 * STRATEGY.leverage;
            
            const pnlColor = pnlPct >= 0 ? 'green' : 'red';
            
            // Status shows PnL and Type
            statusHtml = `<strong style="color:blue">${pos.type}</strong> (x${STRATEGY.leverage})<br><span style="color:${pnlColor}">${pnlPct.toFixed(2)}%</span>`;
            rowStyle = 'background-color: #f0f8ff; border-left: 5px solid blue;';
            
            // MANUAL CLOSE BUTTON
            // We encode the pair name to handle the slash safely in URL
            const safePair = encodeURIComponent(pair);
            actionHtml = `
                <form action="/close/${safePair}" method="POST" style="margin:0;">
                    <button type="submit" style="background:red; color:white; border:none; padding:5px 10px; cursor:pointer; border-radius:3px;">
                        CLOSE NOW
                    </button>
                </form>
            `;
        } else {
            const trend = data.close > data.ema ? '<b style="color:green">BULL</b>' : '<b style="color:red">BEAR</b>';
            
            if (data.lastHigh > data.upper) statusHtml = `<span style="color:orange; font-weight:bold">TEST UPPER</span> ${trend}`;
            else if (data.lastLow < data.lower) statusHtml = `<span style="color:orange; font-weight:bold">TEST LOWER</span> ${trend}`;
            else statusHtml = `<span style="color:gray">RANGE</span> ${trend}`;
        }

        const dateObj = new Date(data.timestamp);
        const timeStr = dateObj.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute:'2-digit' });

        return `
            <tr style="${rowStyle}">
                <td><strong>${pair}</strong></td>
                <td>
                    $${data.close}
                    <div style="font-size:0.8em; color:gray">${timeStr}</div>
                </td>
                <td style="color:#d35400">$${data.upper.toFixed(4)}</td>
                <td style="color:#27ae60">$${data.lower.toFixed(4)}</td>
                <td style="color:blue">$${data.mid.toFixed(4)}</td>
                <td>${statusHtml}</td>
                <td>${actionHtml}</td>
            </tr>
        `;
    }).join('');

    res.send(`
        <html>
        <head>
            <meta http-equiv="refresh" content="2">
            <style>
                body { font-family: 'Segoe UI', sans-serif; padding: 20px; background: #f8f9fa; }
                .stats { display: flex; gap: 15px; margin-bottom: 20px; }
                .card { background: white; padding: 15px 25px; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
                .num { font-size: 1.4em; font-weight: bold; margin-top: 5px; }
                table { width: 100%; background: white; border-collapse: collapse; font-size: 0.9em; }
                th { background: #343a40; color: white; padding: 10px; text-align: left; position: sticky; top: 0; }
                td { padding: 8px; border-bottom: 1px solid #eee; vertical-align: middle; }
            </style>
        </head>
        <body>
            <h2>🚀 Centurion Bot ($100 Portfolio | 10x Leverage)</h2>
            <div class="stats">
                <div class="card"><div>Balance</div><div class="num" style="color:#27ae60">$${virtualWallet.balance.toFixed(2)}</div></div>
                <div class="card"><div>Locked Margin</div><div class="num" style="color:#c0392b">$${virtualWallet.locked.toFixed(2)}</div></div>
                <div class="card"><div>Positions</div><div class="num">${Object.keys(activePositions).length}</div></div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Asset</th>
                        <th>Close (Time)</th>
                        <th>Shifted Upper</th>
                        <th>Shifted Lower</th>
                        <th>Shifted Median</th>
                        <th>Status</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>
        </body>
        </html>
    `);
});

app.listen(port, () => {
    console.log(`Dashboard running on port ${port}`);
});

// --- 4. MATH ENGINE ---
function calculateSMA(data, period) {
    if (data.length < period) return 0;
    return data.slice(-period).reduce((sum, val) => sum + val, 0) / period;
}

function calculateEMA(data, period) {
    if (data.length < period) return 0;
    const k = 2 / (period + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) {
        ema = (data[i] * k) + (ema * (1 - k));
    }
    return ema;
}

function calculateStdDev(data, period, sma) {
    if (data.length < period) return 0;
    const variance = data.slice(-period).reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
    return Math.sqrt(variance);
}

// --- 5. TRADING ENGINE ---
async function runPair(exchange, symbol) {
    marketState[symbol] = { close: 0, livePrice: 0, upper: 0, lower: 0, mid: 0, ema: 0, timestamp: 0, lastHigh: 0, lastLow: 0 };
    lastProcessedCandle[symbol] = 0;

    while (true) {
        try {
            const candles = await exchange.fetchOHLCV(symbol, STRATEGY.timeframe, undefined, 100);
            if (candles.length < 80) throw new Error("Not enough data");

            // --- INDEXING ---
            // 1. SIGNAL Candle (Closed): Index [length-2] -> Used for ENTRY
            // 2. LIVE Candle (Forming): Index [length-1] -> Used for EXIT
            
            const signalIndex = candles.length - 2; 
            const signalCandle = candles[signalIndex];
            
            // Closed Data (For Entry Logic)
            const closedClose = signalCandle[4];
            const closedHigh  = signalCandle[2];
            const closedLow   = signalCandle[3];
            const timestamp   = signalCandle[0];

            // Live Data (For Exit Logic & Display)
            const liveCandle = candles[candles.length - 1];
            const livePrice  = liveCandle[4];

            // --- 1. SHIFTED INDICATORS ---
            const shiftedIndex = signalIndex - STRATEGY.shift;
            const smaSlice = candles.slice(shiftedIndex - STRATEGY.period + 1, shiftedIndex + 1).map(c => c[4]);
            
            const sma = calculateSMA(smaSlice, STRATEGY.period);
            const std = calculateStdDev(smaSlice, STRATEGY.period, sma);
            const upper = sma + (STRATEGY.stdDev * std);
            const lower = sma - (STRATEGY.stdDev * std);

            // --- 2. TREND FILTER ---
            const emaSlice = candles.slice(0, signalIndex + 1).map(c => c[4]);
            const trendEMA = calculateEMA(emaSlice, 50);

            // Update State
            marketState[symbol] = { 
                close: closedClose, 
                livePrice: livePrice, // Important for instant PnL check
                upper, lower, mid: sma, ema: trendEMA, 
                lastHigh: closedHigh, lastLow: closedLow, 
                timestamp 
            };

            const pos = activePositions[symbol];

            // --- 3. ENTRY LOGIC (STRICTLY ON CANDLE CLOSE) ---
            if (timestamp > lastProcessedCandle[symbol]) {
                if (!pos && virtualWallet.balance - virtualWallet.locked >= STRATEGY.margin) {
                    
                    // LONG: Rejection Lower + Trend
                    if (closedLow < lower && closedClose > lower && closedClose > trendEMA) {
                        enterTrade(symbol, 'LONG', closedClose);
                    }
                    // SHORT: Rejection Upper + Trend
                    else if (closedHigh > upper && closedClose < upper && closedClose < trendEMA) {
                        enterTrade(symbol, 'SHORT', closedClose);
                    }
                }
                lastProcessedCandle[symbol] = timestamp;
            }

            // --- 4. EXIT LOGIC (INSTANT / LIVE PRICE) ---
            // We use 'livePrice' (from forming candle) instead of 'closedClose'
            if (pos) {
                if (pos.type === 'LONG') {
                    const takeProfit = pos.entryPrice * (1 + STRATEGY.takeProfitPct);
                    const stopLoss = pos.entryPrice * (1 - STRATEGY.stopLossPct);

                    // Check Live Price
                    if (livePrice >= takeProfit) closeTrade(symbol, livePrice, 'TP HIT (Live)');
                    else if (livePrice <= stopLoss) closeTrade(symbol, livePrice, 'SL HIT (Live)'); 
                } 
                else if (pos.type === 'SHORT') {
                    const takeProfit = pos.entryPrice * (1 - STRATEGY.takeProfitPct);
                    const stopLoss = pos.entryPrice * (1 + STRATEGY.stopLossPct);

                    if (livePrice <= takeProfit) closeTrade(symbol, livePrice, 'TP HIT (Live)');
                    else if (livePrice >= stopLoss) closeTrade(symbol, livePrice, 'SL HIT (Live)');
                }
            }

        } catch (e) {
            // silent catch
        }

        // 5-10s delay per pair
        const delay = Math.floor(Math.random() * 5000) + 5000;
        await new Promise(r => setTimeout(r, delay));
    }
}

// --- HELPERS ---
function enterTrade(symbol, type, price) {
    // Margin is $2.50, Position Size is $25.00
    // We lock the MARGIN from the wallet
    activePositions[symbol] = { type, entryPrice: price, time: new Date() };
    virtualWallet.locked += STRATEGY.margin;
    console.log(`OPEN ${type}: ${symbol} @ $${price}`.green.bold);
}

function closeTrade(symbol, price, reason) {
    const pos = activePositions[symbol];
    
    // Leverage PnL Calculation
    // Total Size = Margin * Leverage
    const totalSize = STRATEGY.margin * STRATEGY.leverage; 
    
    let pnl = 0;
    if (pos.type === 'LONG') {
        // PnL = (Exit - Entry) * (TotalSize / Entry)
        pnl = (price - pos.entryPrice) * (totalSize / pos.entryPrice);
    } else {
        // PnL = (Entry - Exit) * (TotalSize / Entry)
        pnl = (pos.entryPrice - price) * (totalSize / pos.entryPrice);
    }
    
    virtualWallet.locked -= STRATEGY.margin;
    virtualWallet.balance += pnl;
    delete activePositions[symbol];
    
    const color = pnl > 0 ? 'green' : 'red';
    console.log(`CLOSE ${symbol}: $${pnl.toFixed(2)} (${reason})`[color]);
}

// --- MAIN ---
async function main() {
    console.log("--- LAUNCHING CENTURION BOT V2 (MANUAL CLOSE + 10x LEV) ---".yellow);
    const exchange = new ccxt.binance({
        'enableRateLimit': true,
        'options': { 'defaultType': 'future' }
    });

    for (const pair of PAIRS) {
        runPair(exchange, pair[0]);
        await new Promise(r => setTimeout(r, 500));
        process.stdout.write(`\rLaunching: ${pair[0]}   `);
    }
    console.log("\n--- ALL SYSTEMS LIVE ---".green);
}

main();
