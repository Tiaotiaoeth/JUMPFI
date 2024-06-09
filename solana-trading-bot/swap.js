import { Buffer } from 'buffer';
import { VersionedTransaction, Connection, Keypair, sendAndConfirmRawTransaction,PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';
import WebSocket from 'ws';

// 加载环境变量
dotenv.config();

// 检查环境变量中是否存在私钥和RPC URL
const secretKeyString = process.env.SECRET_KEY;
const solanaEndpoint = process.env.SOLANA_ENDPOINT;

if (!secretKeyString) {
  throw new Error("Missing SECRET_KEY in .env file");
}

if (!solanaEndpoint) {
  throw new Error("Missing SOLANA_ENDPOINT in .env file");
}

// 验证私钥是否为有效的JSON字符串，并解析为Uint8Array
let keypair;
try {
  const decodedSecretKey = Uint8Array.from(JSON.parse(secretKeyString));
  keypair = Keypair.fromSecretKey(decodedSecretKey);
} catch (error) {
  throw new Error("Invalid SECRET_KEY: Not a valid JSON encoded Uint8Array");
}

console.log('Wallet Public Key:', keypair.publicKey.toString());

// 使用环境变量中的RPC URL建立与Solana主网的连接
const connection = new Connection(solanaEndpoint);
console.log('Connection established');

// 获取报价
const inputMint = 'So11111111111111111111111111111111111111112';
const outputMint = 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN';
const amount = 10000;
const swapMode = 'ExactOut';
const slippageBps = 50;

const baseUrl = 'https://quote-api.jup.ag/v6/quote';
const url = `${baseUrl}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}&swapMode=${swapMode}`;

const quoteResponse = await fetch(url)
  .then(response => response.json())
  .catch(error => {
    console.error('Error fetching quote:', error);
    throw error;
  });

console.log('Quote Responsed');

if (quoteResponse.error) {
  throw new Error(`Quote API Error: ${quoteResponse.error}`);
}

// 获取序列化交易以执行交换
const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    quoteResponse,
    userPublicKey: keypair.publicKey.toString(),
    wrapAndUnwrapSol: true,
  })
}).then(response => response.json())
  .catch(error => {
    console.error('Error fetching swap transaction:', error);
    throw error;
  });

console.log('Swap Responsed');

const { swapTransaction } = swapResponse;
if (!swapTransaction) {
  throw new Error("Failed to get swapTransaction from swap response");
}

// 反序列化交易
const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
console.log('deserializing');

// 签署交易
transaction.sign([keypair]);

// 输出签名后的交易
console.log('Transaction Signed');

// 发送和确认交易
let txid;
try {
  const rawTransaction = transaction.serialize();
  console.log('Serialized Transaction');

  txid = await sendAndConfirmRawTransaction(
    connection,
    rawTransaction,
    {
      skipPreflight: true,
      commitment: 'finalized',
      preflightCommitment: 'processed',
    }
  );

  console.log(`Transaction ID: ${txid}`);
  console.log(`Transaction confirmed: https://solscan.io/tx/${txid}`);
} catch (error) {
  console.error('Error sending or confirming transaction:', error);
}

// WebSocket连接和监听
function setupWebSocket(txid) {
  const wsUrl = solanaEndpoint.replace('https', 'wss').replace('http', 'ws');
  const ws = new WebSocket(wsUrl);

  ws.on('open', function open() {
    console.log('WebSocket connection established');
    ws.send(JSON.stringify({
      "jsonrpc": "2.0",
      "id": 1,
      "method": "signatureSubscribe",
      "params": [txid]
    }));
  });

  ws.on('message', function incoming(data) {
    console.log('WebSocket message received:', data);
    const response = JSON.parse(data);
    if (response.method === 'signatureNotification') {
      const { result } = response.params;
      if (result.err) {
        console.error(`Transaction ${txid} failed:`, result.err);
      } else {
        console.log(`Transaction ${txid} confirmed`);
        console.log(`Transaction confirmed: https://solscan.io/tx/${txid}`);
      }
      ws.close();
    }
  });

  ws.on('error', function error(err) {
    console.error('WebSocket error:', err);
  });

  ws.on('close', function close() {
    console.log('WebSocket connection closed');
  });
}

// 设置WebSocket监听
if (txid) {
  setupWebSocket(txid);
}

// 获取交易日志
async function fetchTransactionLogs(txid) {
  try {
    const transactionDetails = await connection.getTransaction(txid, { commitment: 'finalized' });
    if (transactionDetails && transactionDetails.meta && transactionDetails.meta.logMessages) {
      console.log('Program Logs:');
      transactionDetails.meta.logMessages.forEach(log => {
        console.log(log);
      });
    } else {
      console.log('No logs found for this transaction.');
    }
  } catch (error) {
    console.error('Error fetching transaction logs:', error);
  }
}

// 调用函数获取交易日志
if (txid) {
  fetchTransactionLogs(txid);
}
