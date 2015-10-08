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

  public handle = (
      client:string,
      buffer:ArrayBuffer) => {
    log.debug('%1: received %2 bytes from %3', this.name_, buffer.byteLength, client);

    // TODO: could bytes arrive after disconnection?
    if (!(client in this.sessions_)) {
      log.info('%1: new client %2', this.name_, client);
      this.sessions_[client] = new Session(client, (buffer:ArrayBuffer) => {
        this.getter_.handle(client, buffer);
      }, () => {
        this.getter_.disconnected(client);
      });
    }
    var session = this.sessions_[client];
    session.handle(buffer);
  }

  public disconnected = (client:string) => {
    log.debug('%1: disconnected from %2', this.name_, client);
    delete this.sessions_[client];
    // TODO: tell the session to close its socket
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
  CONNECTED
}

class Session {
  private state_ = State.AWAITING_AUTHS;

  constructor(
      private id_:string,
      private send_:(buffer:ArrayBuffer) => void,
      private disconnected_:() => void) {}

  public handle = (buffer:ArrayBuffer) => {
    switch (this.state_) {
      case State.AWAITING_AUTHS:
        try {
          headers.interpretAuthHandshakeBuffer(buffer);
          this.send_(headers.composeAuthResponse(headers.Auth.NOAUTH));
          this.state_ = State.AWAITING_REQUEST;
        } catch (e) {
          log.warn('could not parse auths: %1', e.message);
          this.disconnected_();
        }
        break;
      case State.AWAITING_REQUEST:
        try {
          var request = headers.interpretRequestBuffer(buffer);

          // TODO: check for Command.TCP_CONNECT
          // TODO: check is valid and allowed address
          log.debug('requested endpoint: %1', request.endpoint);
          this.state_ = State.AWAITING_CONNECTION;

          // Connect to the endpoint, then reply.
          // TODO: pause socket immediately
          var socket :freedom.TcpSocket.Socket = freedom['core.tcpsocket']();
          socket.connect(request.endpoint.address, request.endpoint.port).then(
              socket.getInfo).then((info:freedom.TcpSocket.SocketInfo) => {
            this.state_ = State.CONNECTED;
            this.send_(headers.composeResponseBuffer({
              reply: headers.Reply.SUCCEEDED,
              endpoint: {
                address: info.localAddress,
                port: info.localPort
              }
            }));
          }, (e:freedom.Error) => {
            log.warn('failed to connect to remote endpoint: %1', e);
            // TODO: implement full raft of error codes
            this.send_(headers.composeResponseBuffer({
              reply: headers.Reply.FAILURE
            }));
            this.disconnected_();
          });
        } catch (e) {
          log.warn('could not parse request: %1', e.message);
          this.disconnected_();
        }
        break;
      case State.AWAITING_CONNECTION:
        // TODO: do we actually care about this case?
        log.error('client sent data before we connected');
        this.disconnected_();
        break;
      case State.CONNECTED:
        log.error('data transfer not yet supported');
        this.disconnected_();
        break;
    }
  }
}
