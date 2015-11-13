/// <reference path='../../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../third_party/typings/freedom/freedom-module-env.d.ts' />

import getter = require('./getter');
import headers = require('../socks-common/socks-headers');
import logging = require('../logging/logging');
import middle = require('./middle');
import net = require('../net/net.types');

const log :logging.Log = new logging.Log('giver');

// The giver, i.e. SOCKS proxy itself.
export class Giver implements middle.RemotePeer {
  // Number of instances created, for logging purposes.
  private static id_ = 0;

  private getter_: middle.RemotePeer;

  // Keyed by client ID.
  private sessions_:{[id:string]: Session} = {};

  // Do not call this directly.
  // Use the static constructors.
  constructor(
      private name_ :string = 'unnamed-giver-' + Giver.id_) {
    Giver.id_++;
  }

  public connected = (client: string) => {
    if (client in this.sessions_) {
      log.warn('%1: client %2 already connected', this.name_, client);
      return;
    }

    log.info('%1: new client %2', this.name_, client);
    this.sessions_[client] = new Session(this.name_, client, (buffer: ArrayBuffer) => {
      this.getter_.handle(client, buffer);
    }, () => {
      if (client in this.sessions_) {
        this.getter_.disconnected(client);
      }
    });
  }

  public handle = (
      client:string,
      buffer:ArrayBuffer) => {
    if (!(client in this.sessions_)) {
      log.warn('%1: handle called for unknown client %2', this.name_, client);
      return;
    }

    this.sessions_[client].handle(buffer);
  }

  public disconnected = (clientId:string) => {
    if (!(clientId in this.sessions_)) {
      log.warn('%1: remote peer disconnected from unknown client %2', this.name_, clientId);
    }
    
    log.debug('%1: remote peer disconnected from %2', this.name_, clientId);
    var session = this.sessions_[clientId];
    delete this.sessions_[clientId];
    session.disconnected();
  }

  // TODO: figure out a way to remove this (it destroys immutability)
  public setGetter = (newGetter:middle.RemotePeer) : void => {
    this.getter_ = newGetter;
  }
}

enum State {
  AWAITING_AUTHS,
  AWAITING_REQUEST,
  AWAITING_CONNECTION,
  CONNECTED,
  DISCONNECTED
}

class Session {
  private state_ = State.AWAITING_AUTHS;
  private socket_ :freedom.TcpSocket.Socket;

  constructor(
      private getterId_:string,
      private id_:string,
      private send_:(buffer:ArrayBuffer) => void,
      private disconnected_:() => void) {}

  private onData_ = (info: freedom.TcpSocket.ReadInfo) => {
    this.send_(info.data);
  }

  public handle = (buffer: ArrayBuffer) => {
    switch (this.state_) {
      case State.AWAITING_AUTHS:
        try {
          headers.interpretAuthHandshakeBuffer(buffer);
          this.send_(headers.composeAuthResponse(headers.Auth.NOAUTH));
          this.state_ = State.AWAITING_REQUEST;
        } catch (e) {
          log.warn('%1/%2: could not parse auths: %3', this.getterId_, this.id_, e.message);
          this.disconnected();
        }
        break;
      case State.AWAITING_REQUEST:
        try {
          var request = headers.interpretRequestBuffer(buffer);

          // TODO: check for Command.TCP_CONNECT
          // TODO: check is valid and allowed address
          log.debug('%1/%2: requested endpoint: %3', this.getterId_, this.id_, request.endpoint);
          this.state_ = State.AWAITING_CONNECTION;

          // Connect to the endpoint, then reply.
          // TODO: pause socket immediately
          this.socket_ = freedom['core.tcpsocket']();
          this.socket_.connect(request.endpoint.address,
              request.endpoint.port).then(this.socket_.getInfo).then(
              (info:freedom.TcpSocket.SocketInfo) => {
            log.debug('%1/%2: connected to remote endpoint', this.getterId_, this.id_);
            this.state_ = State.CONNECTED;
            this.send_(headers.composeResponseBuffer({
              reply: headers.Reply.SUCCEEDED,
              endpoint: {
                address: info.localAddress,
                port: info.localPort
              }
            }));
            this.socket_.on('onData', this.onData_);
            this.socket_.on('onDisconnect', (info:freedom.TcpSocket.DisconnectInfo) => {
              log.info('%1/%2: disconnected from remote endpoint: %3',
                  this.getterId_, this.id_, info);
              this.disconnected();
            });
          }, (e:freedom.Error) => {
            log.warn('%1/%2: failed to connect to remote endpoint: %3',
                this.getterId_, this.id_, e);
            // TODO: implement full raft of error codes
            this.send_(headers.composeResponseBuffer({
              reply: headers.Reply.FAILURE
            }));
            this.disconnected();
          });
        } catch (e) {
          log.warn('%1/%2: could not parse request: %3', this.getterId_, this.id_, e.message);
          this.disconnected();
        }
        break;
      case State.CONNECTED:
        // TODO: use reckless
        this.socket_.write(buffer);
        break;
      default:
        log.warn('%1/%2: ignoring bytes unexpectedly received in state %3', this.getterId_, this.id_, State[this.state_]);
    }
  }

  public disconnected = () => {
    log.debug('%1/%2: terminating (current state: %3)',
        this.getterId_, this.id_, State[this.state_]);
    if (this.state_ === State.CONNECTED) {
      this.state_ = State.DISCONNECTED;
      // TODO: use counter, to guard against early onDisconnect notifications
      this.socket_.off('onData', this.onData_);
      this.socket_.close();      
    }
    this.disconnected_();
  }
}
