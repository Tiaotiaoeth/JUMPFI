import { initialize } from './database.js';

async function getPendingOrders(db) {
    return db.all(`SELECT * FROM orders WHERE status = 1`);
}

async function generateHedgeParamsFromOrders(db, orders) {
    for (const order of orders) {
        const direction = order.direction;
        const inputMint = direction === 'BUY' ? 'So11111111111111111111111111111111111111112' : order.token_address;
        const outputMint = direction === 'BUY' ? order.token_address : 'So11111111111111111111111111111111111111112';
        const amount = Math.abs(order.hedge_amount) * 1e6; // 转换为 lamports
        const swapMode = direction === 'BUY' ? 'ExactOut' : 'ExactIn';
        const slippageBps = 50;

        const params = {
            inputMint,
            outputMint,
            amount,
            swapMode,
            slippageBps
        };

        console.log(`Generated ${direction} hedge params:`, params);

        // 将生成的对冲交易参数记录在 hedge_transactions 表中
        await db.run(`
            INSERT INTO hedge_transactions (direction, input_mint, output_mint, amount, swap_mode)
            VALUES (?, ?, ?, ?, ?)
        `, [direction, inputMint, outputMint, amount, swapMode]);

        // 输出生成的对冲参数
        console.log(`Hedge params for order ${order.order_id}:`, JSON.stringify(params, null, 2));

        // 更新 orders 表中记录的状态
        await db.run(`UPDATE orders SET status = 2 WHERE order_id = ?`, [order.order_id]);
    }
}

async function processHedges() {
    const db = await initialize();
    await db.run('BEGIN TRANSACTION'); // 开始事务

    try {
        const pendingOrders = await getPendingOrders(db);

        await generateHedgeParamsFromOrders(db, pendingOrders);
        await db.run('COMMIT'); // 提交事务
    } catch (error) {
        await db.run('ROLLBACK'); // 回滚事务
        console.error('Error processing hedges:', error);
    }
}

processHedges().catch(error => {
    console.error('Error processing hedges:', error);
});
