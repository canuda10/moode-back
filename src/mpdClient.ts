import { EventEmitter } from 'events';
import * as net from 'net';

type state_t = 'play' | 'stop' | 'pause';
function isState(value: string): value is state_t {
  return value == 'play'
    || value == 'stop'
    || value == 'pause';
}

const defaultOptions: net.NetConnectOpts = {
  port: 6600,
}

const MPD_SENTINEL = /^(OK|ACK|list_OK)(.*)$/m;
const OK_MPD = /^OK MPD /;

export class MpdClient extends EventEmitter {
  private buffer = '';
  private socket: net.Socket;
  private _volume: number;
  private _state: state_t;

  get state(): state_t {
    return this._state;
  }
  get volume(): number {
    return this._volume;
  }

  constructor(options: net.NetConnectOpts = defaultOptions) {
    super();
    this.socket = net.connect(options, () => this.onConnect());
    this.socket.setEncoding('utf8');
    this.socket.on('data', data => this.onData(data));
    this.socket.on('close', hadError => this.onClose(hadError));
    this.socket.on('error', error => this.onError(error));

    this._state = 'stop';
    this._volume = 0;
  }

  private onConnect(): void {
    this.emit('connect')
  }

  private onData(data: Buffer): void {
    this.emit('data', data);
    let m;

    this.buffer += data;
    while (m = this.buffer.match(MPD_SENTINEL)) {
      // Data returned before an OK response.
      const msg = this.buffer.substring(0, m.index);
      // Response end line, code and data.
      const [line, code, str] = m;

      if (OK_MPD.test(line)) {
        // connection successful.
        this.status();
      } else if (code == 'ACK') {
        // command failure received.
        console.log(`ack:\n ${str}`);
        this.idle();
      } else {
        this.processMsg(msg);
        // If something has changed, do a status call to reload all info.
        if (msg.indexOf('changed:') == 0) {
          this.status();
        }
      }
      // this.idle();

      this.buffer = this.buffer.substring(msg.length + line.length + 1);
    }
  }

  private onClose(hadError: boolean): void {
    this.emit('close', hadError);
  }

  private onError(error: Error): void {
    this.emit('error', error);
  }

  private processMsg(msg: string): void {
    const lines = msg.split('\n');
    lines.forEach(line => {
      const parts = line.split(':');
      const key = parts[0];
      const val = parts[1] && parts[1].trim();

      switch (key) {
        case 'state':
          if (!isState(val)) {
            console.error(`invalid state received: "${line}".`);
            break;
          }
          if (val != this._state) {
            this._state = val;
            this.emit('state');
          }
          break;
          
        case 'volume':
          let vol = +val;
          if (isNaN(vol)) {
            console.error(`invalid volume received: "${line}".`);
            break;
          }

          if (vol != this._volume) {
            this._volume = vol;
            this.emit('volume');
          }
          break;
      }
    });
  }

  async idle(): Promise<void> {
    this.socket.write('idle\n');
  }

  async next(): Promise<void> {
    this.socket.write('noidle\nnext\nidle\n');
  }

  async pause(pause: number): Promise<void> {
    this.socket.write(`noidle\npause ${pause}\nidle\n`);
  }

  async previous(): Promise<void> {
    this.socket.write('noidle\nprevious\nidle\n');
  }

  async setvol(volume: number): Promise<void> {
    this.socket.write(`noidle\nsetvol ${volume}\nsetvol ${volume}\nidle\n`);
  }

  async status(): Promise<void> {
    this.socket.write('noidle\nstatus\nidle\n');
  }

  async stop(): Promise<void> {
    this.socket.write('noidle\nstop\nidle\n');
  }
}
