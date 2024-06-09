import { Buffer } from 'buffer';
import { VersionedTransaction, Connection, Keypair, sendAndConfirmRawTransaction } from '@solana/web3.js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

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

// 使用环境变量中的RPC URL建立与Solana主网的连接
const connection = new Connection(solanaEndpoint);

// 处理命令行参数
const args = process.argv.slice(2);
if (args.length < 5) {
  console.error('Usage: node swapin.js <inputMint> <outputMint> <amount> <swapMode> <slippageBps>');
  process.exit(1);
}

const inputMint = args[0];
const outputMint = args[1];
const amount = parseInt(args[2]);
const swapMode = args[3];
const slippageBps = parseInt(args[4]);

// 获取报价
const baseUrl = 'https://quote-api.jup.ag/v6/quote';
const url = `${baseUrl}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}&swapMode=${swapMode}`;

try {
  const quoteResponse = await fetch(url).then(response => response.json());

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
  }).then(response => response.json());

  const { swapTransaction } = swapResponse;
  if (!swapTransaction) {
    throw new Error("Failed to get swapTransaction from swap response");
  }

  // 反序列化交易
  const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
  const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

  // 签署交易
  transaction.sign([keypair]);

  // 发送和确认交易
  let txid;
  try {
    const rawTransaction = transaction.serialize();

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
  } catch (error) {
    console.error('Error sending or confirming transaction:', error);
  }

  // 获取交易日志
  async function fetchTransactionLogs(txid) {
    try {
      const transactionDetails = await connection.getTransaction(txid, {
        commitment: 'finalized',
        maxSupportedTransactionVersion: 0
      });
      if (transactionDetails && transactionDetails.meta && transactionDetails.meta.logMessages) {
        transactionDetails.meta.logMessages.forEach(log => {
          console.log(log);
        });
      }
    } catch (error) {
      console.error('Error fetching transaction logs:', error);
    }
  }

  // 调用函数获取交易日志
  if (txid) {
    fetchTransactionLogs(txid);
  }
} catch (error) {
  console.error('Error fetching quote or swap:', error);
}

// Swapin.js 交易发送部分的最后
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