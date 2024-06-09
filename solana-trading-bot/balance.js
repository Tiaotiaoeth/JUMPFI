import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';
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

// 获取公钥地址持有的所有代币及其余额
async function getAllTokenBalances(publicKey) {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') });
    const balances = tokenAccounts.value.map(tokenAccount => {
      const mintAddress = tokenAccount.account.data.parsed.info.mint;
      const balance = tokenAccount.account.data.parsed.info.tokenAmount.uiAmount;
      return { mintAddress, balance };
    });
    return balances;
  }
  // 获取SOL余额
async function getSolBalance(publicKey) {
    const balance = await connection.getBalance(publicKey);
    return balance / 1e9; // 转换为SOL
  }
// 输出公钥地址持有的所有代币及其余额
async function logAllTokenBalances(prefix) {
    const solBalance = await getSolBalance(keypair.publicKey);
    console.log(`${prefix} - SOL Balance: ${solBalance}`);
    
    const balances = await getAllTokenBalances(keypair.publicKey);
    console.log(`${prefix} - Token Balances:`);
    balances.forEach(({ mintAddress, balance }) => {
      console.log(`Mint Address: ${mintAddress}, Balance: ${balance}`);
    });
  }
  // 在交易前后调用该函数
  await logAllTokenBalances('PRE');