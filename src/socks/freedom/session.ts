/// <reference path='../../../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../../third_party/typings/freedom/freedom-module-env.d.ts' />

import SocksSession = require('../session');

import headers = require('../../socks-common/socks-headers');
import logging = require('../../logging/logging');

const log: logging.Log = new logging.Log('freedom socks session');

enum State {
  AWAITING_AUTHS,
  AWAITING_REQUEST,
  AWAITING_CONNECTION,
  CONNECTED,
  DISCONNECTED
}

class FreedomSocksSession implements SocksSession {
  private state_ = State.AWAITING_AUTHS;
  private socket_: freedom.TcpSocket.Socket;

  constructor(
    private getterId_: string,
    private id_: string,
    private send_: (buffer: ArrayBuffer) => void,
    private disconnected_: () => void) { }

  private onData_ = (info: freedom.TcpSocket.ReadInfo) => {
    this.send_(info.data);
  }

  public onRemoteData = (buffer: ArrayBuffer) => {
    switch (this.state_) {
      case State.AWAITING_AUTHS:
        try {
          headers.interpretAuthHandshakeBuffer(buffer);
          this.send_(headers.composeAuthResponse(headers.Auth.NOAUTH));
          this.state_ = State.AWAITING_REQUEST;
        } catch (e) {
          log.warn('%1/%2: could not parse auths: %3', this.getterId_, this.id_, e.message);
          this.onRemoteDisconnect();
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
            (info: freedom.TcpSocket.SocketInfo) => {
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

              // onDisconnect is received *after* all onData events
              this.socket_.on('onDisconnect', (info: freedom.TcpSocket.DisconnectInfo) => {
                log.info('%1/%2: disconnected from remote endpoint: %3',
                  this.getterId_, this.id_, info);
                this.onRemoteDisconnect();
              });
            }, (e: freedom.Error) => {
              log.warn('%1/%2: failed to connect to remote endpoint: %3',
                this.getterId_, this.id_, e);
              // TODO: implement full raft of error codes
              this.send_(headers.composeResponseBuffer({
                reply: headers.Reply.FAILURE
              }));
              this.onRemoteDisconnect();
            });
        } catch (e) {
          log.warn('%1/%2: could not parse request: %3', this.getterId_, this.id_, e.message);
          this.onRemoteDisconnect();
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

  public onRemoteDisconnect = () => {
    log.debug('%1/%2: terminating (current state: %3)',
      this.getterId_, this.id_, State[this.state_]);
    if (this.state_ === State.CONNECTED) {
      this.state_ = State.DISCONNECTED;
      this.socket_.off('onData', this.onData_);
      this.socket_.close();
    }
    this.disconnected_();
  }
}

export = FreedomSocksSession;
