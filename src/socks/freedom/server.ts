/// <reference path='../../../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../../third_party/typings/freedom/freedom-module-env.d.ts' />

import SocksSession = require('../session');

import logging = require('../../logging/logging');
import net = require('../../net/net.types');

const log: logging.Log = new logging.Log('freedom socks server');

class FreedomSocksServer {
  // Number of instances created, for logging purposes.
  private static id_ = 0;

  private serverSocket: freedom.TcpSocket.Socket =
      freedom['core.tcpsocket']();

  // Number of sessions created, for logging.
  private numSessions_ = 0;

  // Do not call this directly.
  // Use the static constructors instead.
  constructor(
      private requestedEndpoint_: net.Endpoint,
      // // TODO: typing
      // private sessionFactory_: (ondata:any, ondisconnected:any) => SocksSession,
      private sessionFactory_: (session:SocksSession) => SocksSession,
      private name_: string = 'unnamed-getter-' + FreedomSocksServer.id_) {
    FreedomSocksServer.id_++;
  }

  public listen = () => {
    return this.serverSocket.listen(
        this.requestedEndpoint_.address,
        this.requestedEndpoint_.port).then(() => {
      this.serverSocket.on('onConnection', (connectInfo: freedom.TcpSocket.ConnectInfo) => {
        let clientId = 'p' + (this.numSessions_++) + 'p';
        log.info('new client %1 from %2', clientId, connectInfo);

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
            log.debug('%1 session terminated', clientId);
            clientSocket.off('onData', onData);
            // TODO: When is it safe to close the socket, given that we
            //       cannot know when the client has read all data?
          }
        });

        clientSocket.on('onData', onData);

        // onDisconnect is received *after* all onData events
        clientSocket.on('onDisconnect', (info: freedom.TcpSocket.DisconnectInfo) => {
          log.info('%1 client socket disconnected (%2)', clientId, info);
          // TODO: use counter, to guard against early onDisconnect notifications
          freedom['core.tcpsocket'].close(clientSocket);
          session.onRemoteDisconnect();
        });
      });
    });
  }
}

export = FreedomSocksServer;
