import { EventEmitter } from 'events';
import * as net from 'net';

type state_t = 'play' | 'stop' | 'pause';
function isState(value: string): value is state_t {
  return value == 'play'
    || value == 'stop'
    || value == 'pause';
}

type data_t = { [key: string]: string };

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
  private _songid: number;
  private _currentSongInfo: data_t;
  private _statusInfo: data_t;

  get currentSongInfo(): data_t {
    return this._currentSongInfo;
  }

  get statusInfo(): data_t {
    return this._statusInfo;
  }

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

    this._currentSongInfo = {};
    this._statusInfo      = {};
    this._state           = 'stop';
    this._volume          = 0;
    this._songid          = 0;
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
      const msg = this.buffer.slice(0, m.index);
      // Response end line, code and data.
      const [line, code, str] = m;

      if (OK_MPD.test(line)) {
        // connection successful.
        this.status();
        this.currentsong();
      } else if (code == 'ACK') {
        // command failure received.
        console.log(`ack:\n ${str}`);
        this.idle();
      } else {
        this.processMsg(msg);
        // If something has changed, do a status call to reload all info.
        if (msg.indexOf('changed:') == 0) {
          this.status();
          this.currentsong();
        }
      }
      // this.idle();

      this.buffer = this.buffer.slice(msg.length + line.length + 1);
    }
  }

  private onClose(hadError: boolean): void {
    this.emit('close', hadError);
  }

  private onError(error: Error): void {
    this.emit('error', error);
  }

  private processMsg(msg: string): void {
    // console.log(msg);
    const lines = msg.split('\n');
    const data: { [key: string]: string } = {};
    lines.forEach(line => {
      const idx = line.indexOf(':');
      const key = line.slice(0, idx);
      const val = line.slice(idx + 1).trim();
      data[key] = val;

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
    console.log(data);

    if (data.Id != undefined) {
      this._currentSongInfo = data;
      this.emit('currentsong');
    }

    if (data.volume != undefined) {
      this._statusInfo = data;
      this.emit('status');
    }
  }

  async currentsong(): Promise<void> {
    this.socket.write('noidle\ncurrentsong\nidle\n');
  }
  // file: http://shoutcast.ccma.cat/ccma/catalunyaradioHD.mp3
  // Name: CatRadio
  // Pos: 0
  // Id: 29
  
  // file: NAS/freenas2/Camel/Pressure Points/01 Pressure Points.m4a                                                             
  // Last-Modified: 2016-11-29T17:54:21Z                                                                                          
  // Artist: Camel                                                                                                               
  // Album: Pressure Points                                                                                                       
  // Title: Pressure Points                                                                                                      
  // Track: 1                                                                                                                     
  // Genre: Progressive Rock                                                                                                     
  // Date: 1984-11                                                                                                                
  // Comment: ExactAudioCopy v0.95b4                                                                                             
  // Disc: 1                                                                                                                      
  // Label: Decca                                                                                                                
  // AlbumArtist: Camel                                                                                                           
  // MUSICBRAINZ_ARTISTID: 94b7a39b-f3cc-4796-90dd-b1786a62877e                                                                  
  // MUSICBRAINZ_ALBUMID: dbf5510c-261d-4fa0-8210-3743e142f10a                                                                    
  // MUSICBRAINZ_ALBUMARTISTID: 94b7a39b-f3cc-4796-90dd-b1786a62877e                                                             
  // MUSICBRAINZ_TRACKID: fd9c43c3-bf67-42a6-9878-5bbe2b76d1c0                                                                    
  // Time: 438                                                                                                                   
  // duration: 437.733                                                                                                            
  // Pos: 0                                                                                                                      
  // Id: 30                                                                                                                       
  
  // file: http://shoutcast.ccma.cat/ccma/catalunyaradioHD.mp3
  // Title: Catalunya Ràdio
  // Pos: 0
  // Id: 40


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

  async stats(): Promise<void> {
    this.socket.write('noidle\nstate\nidle\n');
  }

  async status(): Promise<void> {
    this.socket.write('noidle\nstatus\nidle\n');
  }
  // volume: 50
  // repeat: 0
  // random: 0
  // single: 0
  // consume: 0
  // playlist: 76
  // playlistlength: 1
  // mixrampdb: 0.000000
  // state: play
  // song: 0
  // songid: 29
  // time: 95:0
  // elapsed: 94.598
  // bitrate: 128
  // audio: 44100:24:2
  
  // volume: 50                                                                                                                  
  // repeat: 0                                                                                                                    
  // random: 0                                                                                                                   
  // single: 0                                                                                                                    
  // consume: 0                                                                                                                  
  // playlist: 87                                                                                                                 
  // playlistlength: 10                                                                                                          
  // mixrampdb: 0.000000                                                                                                          
  // state: play                                                                                                                 
  // song: 0                                                                                                                      
  // songid: 30                                                                                                                  
  // time: 0:438                                                                                                                  
  // elapsed: 0.000                                                                                                              
  // bitrate: 0                                                                                                                   
  // duration: 437.733                                                                                                           
  // audio: 44100:16:2                                                                                                            
  // nextsong: 1                                                                                                                 
  // nextsongid: 31                                                                                                               
  
  // volume: 50
  // repeat: 0
  // random: 0
  // single: 0
  // consume: 0
  // playlist: 90
  // playlistlength: 1
  // mixrampdb: 0.000000
  // state: play
  // song: 0
  // songid: 40
  // time: 0:0
  // elapsed: 0.034
  // bitrate: 128
  // audio: 44100:24:2

  
  async stop(): Promise<void> {
    this.socket.write('noidle\nstop\nidle\n');
  }
}
