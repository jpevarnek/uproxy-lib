/// <reference path='../../../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../../third_party/typings/freedom/freedom-module-env.d.ts' />

import SocksSession = require('../session');

import logging = require('../../logging/logging');

const log: logging.Log = new logging.Log('freedom socks server');

class FreedomSocksServer {
  // Number of instances created, for logging purposes.
  private static id_ = 0;

  private serverSocket: freedom.TcpSocket.Socket =
      freedom['core.tcpsocket']();

  // Number of sessions created, for logging.
  private numSessions_ = 0;

  constructor(
      private requestedAddress_: string,
      private requestedPort_: number,
      private sessionFactory_: (session:SocksSession) => SocksSession,
      private name_: string = 'unnamed-getter-' + FreedomSocksServer.id_) {
    FreedomSocksServer.id_++;
  }

  public listen = () => {
    return this.serverSocket.listen(this.requestedAddress_,
        this.requestedPort_).then(() => {
      this.serverSocket.on('onConnection',
          (connectInfo: freedom.TcpSocket.ConnectInfo) => {
        var clientId = connectInfo.host + ':' + connectInfo.port;
        log.info('%1: new client from %2:%3', this.name_, clientId);

        let clientSocket: freedom.TcpSocket.Socket =
          freedom['core.tcpsocket'](connectInfo.socket);

        // Forwards data from the client socket to the SOCKS session.
        const onData = (info: freedom.TcpSocket.ReadInfo) => {
          session.onRemoteData(info.data);
        }

        let session = this.sessionFactory_({
          onRemoteData: (buffer: ArrayBuffer) => {
            clientSocket.write(buffer);
          },
          onRemoteDisconnect: () => {
            log.debug('%1: remote peer for %2 has disconnected',
                this.name_, clientId);
            // Stop reading data immediately since there is no longer any
            // point forwarding it to the remote peer. Note that we cannot
            // close the socket yet because the SOCKS client may still be
            // reading from it and we have no way to query the size of the
            // socket's outgoing buffer. The importance of this is easy to
            // verify with curl's --limit-rate option. While this is fine
            // for well-behaved HTTP clients, it's a real nuisance for other
            // protocols and testing.
            clientSocket.off('onData', onData);
          }
        });

        clientSocket.on('onData', onData);

        // onDisconnect is received after all onData events.
        clientSocket.on('onDisconnect', (info: freedom.TcpSocket.DisconnectInfo) => {
          log.info('%1: client socket for %2 disconnected (%3)',
              this.name_, clientId, info);
          // TODO: use counter, to guard against early onDisconnect notifications
          freedom['core.tcpsocket'].close(clientSocket);
          session.onRemoteDisconnect();
        });
      });
    });
  }
}

export = FreedomSocksServer;
