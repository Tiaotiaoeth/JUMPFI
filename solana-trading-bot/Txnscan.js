import dotenv from 'dotenv';
import WebSocket from 'ws';

// 加载环境变量
dotenv.config();

// 检查环境变量中是否存在RPC URL和交易签名
const solanaEndpoint = process.env.SOLANA_ENDPOINT;
const txnSignature = process.env.TXN_SIGNATURE;

if (!solanaEndpoint) {
  throw new Error("Missing SOLANA_ENDPOINT in .env file");
}

if (!txnSignature) {
  throw new Error("Missing TXN_SIGNATURE in .env file");
}

// 使用 WebSocket 连接到 Solana 网络以获取交易状态
function getTransactionStatus(txnSignature) {
  const socket = new WebSocket(solanaEndpoint);

  socket.on('open', function open() {
    console.log('Connected to Solana WebSocket');

    const subscriptionMessage = {
      jsonrpc: "2.0",
      id: 1,
      method: "signatureSubscribe",
      params: [txnSignature]
    };

    socket.send(JSON.stringify(subscriptionMessage));
  });

  socket.on('message', function incoming(data) {
    const response = JSON.parse(data);
    if (response.method === 'signatureNotification') {
      console.log('Transaction status:', response.params.result);

      // 如果你只需要第一次通知，可以关闭连接
      socket.close();
    }
  });

  socket.on('close', function close() {
    console.log('Disconnected from Solana WebSocket');
  });

  socket.on('error', function error(error) {
    console.error('WebSocket error:', error);
  });
}

// 获取交易状态
getTransactionStatus(txnSignature);
