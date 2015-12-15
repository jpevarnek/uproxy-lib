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
    private serverId_: string,
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
          // TODO: send error to the SOCKS client
          log.warn('%1/%2: could not parse auths: %3', this.serverId_, this.id_, e.message);
          this.state_ = State.DISCONNECTED;
          this.disconnected_();
        }
        break;
      case State.AWAITING_REQUEST:
        try {
          var request = headers.interpretRequestBuffer(buffer);

          // TODO: check for Command.TCP_CONNECT
          // TODO: check is valid and allowed address
          log.debug('%1/%2: requested endpoint: %3', this.serverId_, this.id_, request.endpoint);
          this.state_ = State.AWAITING_CONNECTION;

          // Connect to the endpoint, then reply.
          // TODO: pause socket immediately
          this.socket_ = freedom['core.tcpsocket']();

          const cleanup = () => {
            log.debug('%1/%2: destroying socket', this.serverId_, this.id_);
            this.state_ = State.DISCONNECTED;
            // TODO: use counter, to guard against early onDisconnect notifications
            freedom['core.tcpsocket'].close(this.socket_);
            this.disconnected_();
          }

          this.socket_.connect(request.endpoint.address,
              request.endpoint.port).then(this.socket_.getInfo).then(
              (info: freedom.TcpSocket.SocketInfo) => {
            log.debug('%1/%2: connected to remote endpoint', this.serverId_, this.id_);
            this.state_ = State.CONNECTED;
            this.send_(headers.composeResponseBuffer({
              reply: headers.Reply.SUCCEEDED,
              endpoint: {
                address: info.localAddress,
                port: info.localPort
              }
            }));
            this.socket_.on('onData', this.onData_);

            // onDisconnect is received after all onData events.
            // TODO: is this received when we fail to connect to the remote endpoint?
            this.socket_.on('onDisconnect', (info: freedom.TcpSocket.DisconnectInfo) => {
              log.info('%1/%2: disconnected from remote endpoint: %3',
                this.serverId_, this.id_, info);
              cleanup();
            });
          }, (e: freedom.Error) => {
            log.warn('%1/%2: failed to connect to remote endpoint: %3',
                this.serverId_, this.id_, e);
            cleanup();
            this.send_(headers.composeResponseBuffer({
              // TODO: full range of error codes
              reply: headers.Reply.FAILURE
            }));
          });
        } catch (e) {
          // TODO: send error to the SOCKS client
          log.warn('%1/%2: could not parse request: %3', this.serverId_, this.id_, e.message);
          this.state_ = State.DISCONNECTED;
          this.disconnected_();
        }
        break;
      case State.CONNECTED:
        // TODO: be reckless
        this.socket_.write(buffer);
        break;
      default:
        // TODO: should we disconnect at this point?
        log.warn('%1/%2: ignoring bytes unexpectedly received in state %3',
            this.serverId_, this.id_, State[this.state_]);
    }
  }

  public onRemoteDisconnect = () => {
    log.debug('%1/%2: remote peer has disconnected', this.id_, this.serverId_);
    // See the note in FreedomSocksServer on why we don't close the
    // socket at this point.
    this.socket_.off('onData', this.onData_);
  }
}

export = FreedomSocksSession;
