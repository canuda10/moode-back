import WebSocket from 'ws';
import { MpdClient } from './mpdClient';

interface MpdMessage {
  cmd: 'next' | 'pause' | 'previous' | 'volume';
  pause: number;
  volume: number;
}

const client = new MpdClient();
const wss = new WebSocket.Server({ port: 3000 });

wss.on('connection', ws => {
  ws.send(JSON.stringify({ state: client.state }));
  ws.send(JSON.stringify({ volume: client.volume }));

  client.on('state', () =>
    ws.send(JSON.stringify({ state: client.state })));
    
  client.on('volume', () => 
    ws.send(JSON.stringify({ volume: client.volume })));
  
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
});
