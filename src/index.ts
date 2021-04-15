import WebSocket from 'ws';
import { MpdClient } from './mpdClient';

interface MpdMessage {
  cmd: 'next' | 'pause' | 'previous' | 'volume';
  pause: number;
  volume: number;
}

function broadcast(data: any): void {
  wss.clients.forEach(ws => {
    if (ws.readyState == WebSocket.OPEN)
      ws.send(data);
  });
};

const client = new MpdClient();
const wss = new WebSocket.Server({ port: 3000 });

const aliveSockets = new Set<WebSocket>();

// Keepalive. Every 30s, all clients which did not respond to the previous ping
// will be terminated, and a ping will be sent to the rest of them.
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!aliveSockets.has(ws))
      return ws.terminate();
    
    aliveSockets.delete(ws);
    ws.ping();
  })
}, 30 * 1000);

client.on('currentsong', () =>
  broadcast(JSON.stringify({ currentsong: client.currentSongInfo })));

client.on('status', () =>
  broadcast(JSON.stringify({ status: client.statusInfo })));

client.on('state', () => 
  broadcast(JSON.stringify({ state: client.state })));

client.on('volume', () => 
  broadcast(JSON.stringify({ volume: client.volume })));

wss.on('connection', ws => {
  aliveSockets.add(ws);
  ws.send(JSON.stringify({ state: client.state }));
  ws.send(JSON.stringify({ volume: client.volume }));
  ws.send(JSON.stringify({ currentsong: client.currentSongInfo }));

  // client.on('state', () =>
  //   ws.send(JSON.stringify({ state: client.state })));
    
  // client.on('volume', () => 
  //   ws.send(JSON.stringify({ volume: client.volume })));
  
  // Messages received via webSocket from our front end are handled here.
  ws.on('message', message => {
    if (typeof message != 'string') {
      console.error(`Unknown message received: "${message}".`);
      return;
    }
    const data: MpdMessage = JSON.parse(message);
    if (data.volume != undefined)
      client.setvol(data.volume);

    if (data.pause != undefined)
      client.pause(data.pause);

    switch (data.cmd) {
      case 'next':
        client.next();
        break;

      case 'previous':
        client.previous();
        break;
    }
  });
  
  ws.on('ping', () => ws.pong());
  ws.on('pong', () => aliveSockets.add(ws));
});

console.log(`Server running.`);
