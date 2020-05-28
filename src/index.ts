import WebSocket from 'ws';
import { MpdClient } from './mpdClient';

interface MpdMessage {
  volume: number;
}

const client = new MpdClient();
const wss = new WebSocket.Server({ port: 3000 });

wss.on('connection', ws => {
  ws.send(JSON.stringify({ volume: client.volume }));

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
  });
  
  ws.on('ping', () => ws.pong());
});
